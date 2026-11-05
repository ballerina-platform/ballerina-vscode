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

import { countOf, getToolCallDisplay } from "./toolDisplay";
import { StreamItem } from "./types";

export type RowGroupId = "explore" | "update" | "create";
type Facet = "read" | "search" | "updated" | "created";

interface RowGroup {
    done: string;
    running: string;
    icon: string;
    /** "Updated 4 files" rather than "Explored · 9 files read". */
    countsInLabel?: boolean;
    facets: Partial<Record<Facet, [singular: string, plural: string]>>;
}

// The only place that decides grouping: change a tool's group here to merge or split groups.
export const ROW_GROUPS: Record<RowGroupId, RowGroup> = {
    explore: {
        done: "Explored",
        running: "Exploring",
        icon: "codicon-search",
        facets: { read: ["file read", "files read"], search: ["search", "searches"] },
    },
    update: { done: "Updated", running: "Updating", icon: "codicon-edit", countsInLabel: true, facets: { updated: ["file", "files"] } },
    create: { done: "Created", running: "Creating", icon: "codicon-new-file", countsInLabel: true, facets: { created: ["file", "files"] } },
};

const TOOL_FACETS: Record<string, { group: RowGroupId; facet: Facet }> = {
    file_read: { group: "explore", facet: "read" },
    glob: { group: "explore", facet: "search" },
    grep: { group: "explore", facet: "search" },
    file_edit: { group: "update", facet: "updated" },
    file_batch_edit: { group: "update", facet: "updated" },
};

export function facetOf(item: StreamItem): { group: RowGroupId; facet: Facet } | undefined {
    if (item.kind !== "tool_call" && item.kind !== "tool_result") return undefined;
    if (item.kind === "tool_result" && (item.failed || item.toolOutput?.success === false)) return undefined;
    if (item.toolName === "file_write") {
        // The call carries only the file name, so an open write counts as a create until its result says otherwise.
        return item.kind === "tool_result" && item.toolOutput?.action === "updated"
            ? { group: "update", facet: "updated" }
            : { group: "create", facet: "created" };
    }
    return TOOL_FACETS[item.toolName ?? ""];
}

export type RowUnit<T> = { kind: "row"; row: T } | { kind: "group"; group: RowGroupId; rows: T[] };

/** Two or more consecutive rows of one group become a group; any other row ends it. */
export function groupRows<T extends { item: StreamItem }>(rows: T[]): RowUnit<T>[] {
    const units: RowUnit<T>[] = [];
    for (const row of rows) {
        const group = facetOf(row.item)?.group;
        const last = units[units.length - 1];
        if (group && last?.kind === "group" && last.group === group) {
            last.rows.push(row);
        } else if (group && last?.kind === "row" && facetOf(last.row.item)?.group === group) {
            units[units.length - 1] = { kind: "group", group, rows: [last.row, row] };
        } else {
            units.push({ kind: "row", row });
        }
    }
    return units;
}

export interface GroupSummary {
    label: string;
    detail?: string;
    meta?: string;
    running: boolean;
}

/** `latestStep`: nothing follows the group yet, so a live turn is still working on it. */
export function summarizeGroup(group: RowGroupId, items: StreamItem[], streamActive: boolean, latestStep = false): GroupSummary {
    const def = ROW_GROUPS[group];
    const seen = new Map<Facet, Set<string>>();
    let searches = 0;
    for (const item of items) {
        if (item.kind !== "tool_result") continue;
        const facet = facetOf(item)?.facet;
        if (facet === "search") {
            searches++;
        } else if (facet) {
            seen.set(facet, (seen.get(facet) ?? new Set()).add(item.toolOutput?.fileName ?? `#${seen.get(facet)?.size ?? 0}`));
        }
    }
    const counts = (Object.keys(def.facets) as Facet[])
        .map((facet) => {
            const n = facet === "search" ? searches : seen.get(facet)?.size ?? 0;
            const [singular, plural] = def.facets[facet]!;
            return n > 0 ? countOf(n, singular, false, plural) : "";
        })
        .filter(Boolean)
        .join(", ");

    const open = items.filter((item) => item.kind === "tool_call");
    const latest = open[open.length - 1];
    if (streamActive && (latest?.kind === "tool_call" || latestStep)) {
        const call = latest?.kind === "tool_call" ? getToolCallDisplay(latest.toolName, latest.toolInput) : undefined;
        const detail = call && (call.label === def.running ? call.detail : [call.label, call.detail].filter(Boolean).join(" "));
        if (def.countsInLabel) return { label: !call && counts ? `${def.running} ${counts}` : def.running, detail, running: true };
        return { label: def.running, detail, meta: counts || undefined, running: true };
    }
    if (def.countsInLabel) return { label: counts ? `${def.done} ${counts}` : def.done, running: false };
    return { label: def.done, meta: counts || undefined, running: false };
}
