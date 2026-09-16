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

import { useEffect, useRef, useState } from "react";
import { AgentUsage, Flow, FlowNode, LineRange } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AgentRef, findDurableAgentUsages, getCachedUsages, setCachedUsages, usageCacheKey } from "../FocusFlowDiagram/agentUsages";

const DEFER_MS = 600;

type DurableBoxData = { agentBox?: boolean; agentName?: string; declaration?: LineRange; usages?: AgentUsage[]; animateUsages?: boolean };
type Shown = { key: string; usages: AgentUsage[] };

function boxData(node: FlowNode): DurableBoxData {
    return (node.metadata?.data ?? {}) as DurableBoxData;
}

// The synthetic agent-box copy of the declaration, which the agent-only view renders alone.
export function findDurableAgentBox(flow: Flow | undefined): FlowNode | undefined {
    return flow?.nodes?.find((node) => node.codedata?.node === "DURABLE_AGENT_RUN" && boxData(node).agentBox === true);
}

// The declaration's own range, carried on the box, names the agent the design model knows.
export function durableAgentRefOf(flow: Flow, box: FlowNode): AgentRef {
    const { declaration, agentName } = boxData(box);
    return {
        filePath: declaration?.fileName ?? flow.fileName,
        startLine: declaration?.startLine?.line ?? box.codedata?.lineRange?.startLine?.line ?? 0,
        symbol: agentName,
    };
}

export function sameUsages(a: AgentUsage[] | undefined, b: AgentUsage[]): boolean {
    return JSON.stringify(a ?? []) === JSON.stringify(b);
}

// Usages live on a flat key like the box's other metadata; this node does not use agentInfo. The rows fade in when
// `animate` is set, as the AI agent's rail does; a repaint of the list already on screen passes false.
export function withDurableUsages(flow: Flow, usages: AgentUsage[], animate = true): Flow {
    return {
        ...flow,
        nodes: flow.nodes.map((node): FlowNode =>
            node === findDurableAgentBox(flow)
                ? { ...node, metadata: { ...node.metadata, data: { ...boxData(node), usages, animateUsages: animate } as FlowNode["metadata"]["data"] } }
                : node
        ),
    };
}

function usageKeyOf(projectPath: string, flow: Flow, box: FlowNode): string {
    const agentRef = durableAgentRefOf(flow, box);
    return usageCacheKey(projectPath, agentRef.filePath, agentRef.symbol ?? "");
}

// The canvas may paint once the box carries its callers, or once this agent's list has been shown at all, so a
// refreshed model that arrives without usages does not blank the canvas while the cached list is put back.
export function durableUsagesReady(box: FlowNode | undefined, key: string | undefined, shown: Shown | undefined): boolean {
    return !box || boxData(box).usages !== undefined || shown?.key === key;
}

// Fetches the durable agent's callers from the design model and writes them onto the box node, and says whether the
// canvas may paint: the first list is awaited, so the box is fitted once with its rail in place. A cached list paints
// first; the design model is asked again only while the cache is dirty, which a project content change makes it (as
// the agent page's rail does), so a trigger added from the box shows up without a reload.
export function useDurableAgentUsages(enabled: boolean, flow: Flow | undefined, projectPath: string, setFlow: (flow: Flow) => void): boolean {
    const { rpcClient } = useRpcContext();
    const requestIdRef = useRef(0);
    const timerRef = useRef<ReturnType<typeof setTimeout>>();
    const shownRef = useRef<Shown>();
    const dirtyRef = useRef(true);
    const contentRef = useRef(0);
    // State only so a content change re-runs the effect even when the flow model itself does not change.
    const [contentVersion, setContentVersion] = useState(0);
    const box = enabled ? findDurableAgentBox(flow) : undefined;
    const key = box ? usageKeyOf(projectPath, flow, box) : undefined;

    useEffect(
        () =>
            rpcClient.onProjectContentUpdated(() => {
                dirtyRef.current = true;
                contentRef.current++;
                setContentVersion((version) => version + 1);
            }),
        [rpcClient]
    );

    useEffect(() => {
        if (!box) {
            return;
        }
        const shown = boxData(box).usages;
        const show = (usages: AgentUsage[]) => {
            const previous = shownRef.current?.key === key ? shownRef.current.usages : undefined;
            shownRef.current = { key, usages };
            setFlow(withDurableUsages(flow, usages, !previous || !sameUsages(previous, usages)));
        };
        const cached = getCachedUsages(key);
        // Paint the cache first; the flow it produces re-runs this effect, which fetches if the cache is dirty.
        if (cached && (shown === undefined || !sameUsages(shown, cached))) {
            show(cached);
            return;
        }
        if (cached && !dirtyRef.current) {
            return;
        }
        clearTimeout(timerRef.current);
        const requestId = ++requestIdRef.current;
        const contentAtStart = contentRef.current;
        // The first list holds the canvas, so it is fetched at once; later refreshes are debounced.
        const delay = shownRef.current?.key === key ? DEFER_MS : 0;
        timerRef.current = setTimeout(async () => {
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getDesignModel({ projectPath });
                if (requestId !== requestIdRef.current || !response?.designModel) {
                    return;
                }
                const usages = findDurableAgentUsages(response.designModel, durableAgentRefOf(flow, box));
                setCachedUsages(key, usages);
                if (contentRef.current === contentAtStart) {
                    dirtyRef.current = false;
                }
                if (shown === undefined || !sameUsages(shown, usages)) {
                    show(usages);
                }
            } catch (error) {
                console.error(">>> durable agent: failed to load usages", error);
                if (shown === undefined) {
                    show([]);
                }
            }
        }, delay);
        return () => clearTimeout(timerRef.current);
    }, [box, key, flow, projectPath, rpcClient, setFlow, contentVersion]);

    return durableUsagesReady(box, key, shownRef.current);
}
