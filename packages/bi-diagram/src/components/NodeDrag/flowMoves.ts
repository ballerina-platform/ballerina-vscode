/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { cloneDeep } from "lodash";
import { Branch, Flow, FlowNode, LinePosition } from "../../utils/types";
import { slotAfter, slotAtBranchStart } from "../../visitors/LinkTargetVisitor";

export type DropAnchor = FlowNode | Branch;

type LineRangeLike = { startLine: LinePosition; endLine: LinePosition };

const isBranch = (anchor: DropAnchor): anchor is Branch => "children" in anchor;

// The diagram draws a missing else as a dashed lane holding a draft placeholder; dropping there adds the else.
export const isNewElse = (anchor: DropAnchor): anchor is Branch =>
    isBranch(anchor) && anchor.codedata?.node === "ELSE" && !!anchor.children?.[0]?.metadata?.draft;

const sameRange = (a?: LineRangeLike, b?: LineRangeLike) =>
    !!a && !!b && a.startLine.line === b.startLine.line && a.startLine.offset === b.startLine.offset &&
    a.endLine.line === b.endLine.line && a.endLine.offset === b.endLine.offset;

// What a node is, independent of where it sits in the source.
export function nodeSignature(node: FlowNode): string {
    const props = node.properties as Record<string, { value?: unknown }> | undefined;
    return [node.codedata?.node, node.metadata?.label, props?.variable?.value, props?.expression?.value, props?.condition?.value]
        .map((part) => JSON.stringify(part ?? ""))
        .join("|");
}

interface FlowIndex {
    lists: FlowNode[][];
    branches: Branch[];
    keyOfId: Map<string, string>;
    nodeByKey: Map<string, FlowNode>;
    branchKeys: Map<Branch, string>;
    branchByKey: Map<string, Branch>;
}

function indexFlow(flow: Flow): FlowIndex {
    const index: FlowIndex = { lists: [], branches: [], keyOfId: new Map(), nodeByKey: new Map(), branchKeys: new Map(), branchByKey: new Map() };
    const seen = new Map<string, number>();
    const walk = (list: FlowNode[]) => {
        index.lists.push(list);
        for (const node of list) {
            const base = nodeSignature(node);
            const count = (seen.get(base) ?? 0) + 1;
            seen.set(base, count);
            const key = `${base}#${count}`;
            index.keyOfId.set(node.id, key);
            index.nodeByKey.set(key, node);
            node.branches?.forEach((branch) => {
                const branchKey = `${key}/${branch.label}`;
                index.branches.push(branch);
                index.branchKeys.set(branch, branchKey);
                index.branchByKey.set(branchKey, branch);
                walk(branch.children ?? []);
            });
        }
    };
    walk(flow.nodes ?? []);
    return index;
}

const findList = (index: FlowIndex, id: string) => index.lists.find((list) => list.some((node) => node.id === id));

const ifOwning = (index: FlowIndex, anchor: Branch) =>
    index.lists.flat().find((node) => node.codedata?.node === "IF" && sameRange(node.codedata.lineRange, anchor.codedata?.lineRange));

function findBranch(index: FlowIndex, anchor: Branch) {
    return index.branches.find((branch) => branch.label === anchor.label && sameRange(branch.codedata?.lineRange, anchor.codedata?.lineRange));
}

// A branch's start pill is drawn by the diagram, not read from the source, so it stands for the branch it opens.
function branchOpenedBy(index: FlowIndex, anchor: FlowNode) {
    if (anchor.codedata?.node !== "EVENT_START" || findList(index, anchor.id)) {
        return undefined;
    }
    return index.branches.find((branch) => sameRange(branch.codedata?.lineRange, anchor.codedata?.lineRange));
}

// The diagram pads branches with placeholders; only statements from the source count.
const PLACEHOLDER_KINDS = new Set(["EMPTY", "EVENT_START", "DRAFT"]);

export function countInside(node: FlowNode): number {
    return (node.branches ?? []).reduce(
        (total, branch) =>
            total + (branch.children ?? []).reduce((sum, child) => {
                const real = child.codedata?.lineRange && !PLACEHOLDER_KINDS.has(child.codedata.node);
                return sum + (real ? 1 : 0) + countInside(child);
            }, 0),
        0
    );
}

// The flow as it will read once the move lands, so the canvas can settle before the language server answers.
export function moveInFlow(flow: Flow, moved: FlowNode[], anchor: DropAnchor): Flow | undefined {
    const next = cloneDeep(flow);
    const index = indexFlow(next);
    const taken: FlowNode[] = [];
    for (const node of moved) {
        const from = findList(index, node.id);
        if (!from) {
            return undefined;
        }
        taken.push(...from.splice(from.findIndex((candidate) => candidate.id === node.id), 1));
    }
    if (isNewElse(anchor)) {
        const owner = ifOwning(index, anchor);
        if (!owner) {
            return undefined;
        }
        owner.branches.push({
            label: "Else",
            kind: "block",
            codedata: { node: "ELSE", lineRange: anchor.codedata.lineRange },
            repeatable: "ZERO_OR_MORE",
            properties: {},
            children: taken,
        } as Branch);
        return next;
    }
    const branch = isBranch(anchor) ? findBranch(index, anchor) : branchOpenedBy(index, anchor);
    if (branch) {
        (branch.children ??= []).unshift(...taken);
        return next;
    }
    if (isBranch(anchor)) {
        return undefined;
    }
    const into = findList(index, anchor.id);
    if (!into) {
        return undefined;
    }
    into.splice(into.findIndex((candidate) => candidate.id === anchor.id) + 1, 0, ...taken);
    return next;
}

// The same position the anchor's "+" button would add at.
export function targetAfter(anchor: DropAnchor): LinePosition | undefined {
    if (!anchor.codedata?.lineRange) {
        return undefined;
    }
    if (isNewElse(anchor)) {
        return anchor.codedata.lineRange.endLine;
    }
    return isBranch(anchor) ? slotAtBranchStart(anchor) : slotAfter(anchor);
}

function resolveIn<T extends DropAnchor>(before: FlowIndex, after: FlowIndex, anchor: T): T | undefined {
    if (isNewElse(anchor)) {
        const owner = ifOwning(before, anchor);
        const fresh = owner && after.nodeByKey.get(before.keyOfId.get(owner.id));
        return fresh && ({ ...anchor, codedata: { ...anchor.codedata, lineRange: fresh.codedata.lineRange } } as T);
    }
    const branch = isBranch(anchor) ? findBranch(before, anchor) : branchOpenedBy(before, anchor);
    if (isBranch(anchor) || branch) {
        return (branch && after.branchByKey.get(before.branchKeys.get(branch))) as T | undefined;
    }
    return after.nodeByKey.get(before.keyOfId.get(anchor.id)) as T | undefined;
}

// Finds the same node or branch in a newer flow, whose source positions have moved since it was read.
export function resolveAnchor<T extends DropAnchor>(view: Flow, fresh: Flow, anchor: T): T | undefined {
    return resolveIn(indexFlow(view), indexFlow(fresh), anchor);
}

export function resolveNodes(view: Flow, fresh: Flow, nodes: FlowNode[]): FlowNode[] | undefined {
    const before = indexFlow(view);
    const after = indexFlow(fresh);
    const found = nodes.map((node) => resolveIn(before, after, node));
    return found.every(Boolean) ? found : undefined;
}

export function resolveMove(
    view: Flow,
    fresh: Flow,
    moved: FlowNode[],
    anchor: DropAnchor
): { nodes: FlowNode[]; anchor: DropAnchor } | undefined {
    const before = indexFlow(view);
    const after = indexFlow(fresh);
    const nodes = moved.map((node) => resolveIn(before, after, node));
    const freshAnchor = resolveIn(before, after, anchor);
    return nodes.every(Boolean) && freshAnchor ? { nodes, anchor: freshAnchor } : undefined;
}

// Nodes inside another of the given nodes go with it, so only the outermost count, in source order.
export function outermost(nodes: FlowNode[]): FlowNode[] {
    const range = (node: FlowNode) => node.codedata.lineRange;
    const before = (a: LinePosition, b: LinePosition) => a.line < b.line || (a.line === b.line && a.offset <= b.offset);
    const within = (inner: FlowNode, outer: FlowNode) =>
        inner !== outer &&
        !sameRange(range(inner), range(outer)) &&
        before(range(outer).startLine, range(inner).startLine) &&
        before(range(inner).endLine, range(outer).endLine);
    return nodes
        .filter((node) => node.codedata?.lineRange && !nodes.some((outer) => outer.codedata?.lineRange && within(node, outer)))
        .sort((a, b) => range(a).startLine.line - range(b).startLine.line || range(a).startLine.offset - range(b).startLine.offset);
}

// Deleting from the bottom up keeps the ranges of the nodes still to go valid.
export const deletionOrder = (nodes: FlowNode[]): FlowNode[] => outermost(nodes).reverse();

// The flow with the given nodes (and everything inside them) taken out.
export function removeAllFromFlow(flow: Flow, nodes: FlowNode[], deleting = false): Flow | undefined {
    const next = cloneDeep(flow);
    const index = indexFlow(next);
    for (const node of outermost(nodes)) {
        const from = findList(index, node.id);
        if (!from) {
            return undefined;
        }
        const at = from.findIndex((candidate) => candidate.id === node.id);
        // Deleting an error handler keeps its body, as the language server does.
        const kept = deleting && from[at].codedata?.node === "ERROR_HANDLER" ? from[at].branches?.find((branch) => branch.codedata?.node === "BODY")?.children ?? [] : [];
        from.splice(at, 1, ...kept);
    }
    return next;
}
