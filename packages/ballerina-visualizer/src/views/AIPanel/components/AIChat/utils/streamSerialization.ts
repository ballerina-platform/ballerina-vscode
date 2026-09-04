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

import { StreamEntry, StreamItem } from "../../AgentStreamView/types";

/**
 * Agent-stream (de)serialization for the persisted assistant transcript.
 *
 * An assistant turn's `uiResponse`/`content` embeds its timeline as a single
 * `<agentstream>{ entries: StreamEntry[] }</agentstream>` blob. This is the
 * on-disk shape the store round-trips (`thread.json`), so both the full AI
 * panel and the floating-orb mini chat read/write through these helpers to
 * stay byte-compatible — the mini persisting a turn must produce content the
 * panel can parse back, and vice versa.
 */

export function serializeStream(entries: StreamEntry[], existingContent: string): string {
    // Escape `</` as `<\/` (a valid JSON string escape for `/`) so a `</agentstream>`
    // substring inside the payload — e.g. assistant text or tool output that quotes
    // the tag literally — can't terminate the blob early and make parseStream truncate.
    const json = JSON.stringify({ entries }).replace(/<\//g, "<\\/");
    const blob = `<agentstream>${json}</agentstream>`;
    if (existingContent.includes("<agentstream>")) {
        return existingContent.replace(/<agentstream>[\s\S]*?<\/agentstream>/, blob);
    }
    return existingContent + blob;
}

export function parseStream(content: string): StreamEntry[] {
    const match = content.match(/<agentstream>([\s\S]*?)<\/agentstream>/);
    if (!match) return [];
    try {
        // Guard the shape: only an actual array is safe to hand to the entry
        // reducers (a malformed `{ "entries": {} }` would crash `appendToLastEntry`).
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed?.entries)) return parsed.entries;
        console.error("[streamSerialization] agentstream blob has no entries array; treating turn as empty", {
            blobLength: match[1].length,
        });
        return [];
    } catch (e) {
        // Deliberately logged rather than swallowed: returning [] means the very next
        // serializeStream replaces this (still tag-delimited) blob with one built from
        // no prior entries, silently discarding the rest of the turn. Transcripts
        // written before the `</` sentinel escape can still be malformed on disk, so
        // this is reachable on upgrade — make it diagnosable instead of invisible.
        console.error("[streamSerialization] failed to parse agentstream blob; turn content will be lost", {
            blobLength: match[1].length,
            error: e,
        });
        return [];
    }
}

export function appendToLastEntry(entries: StreamEntry[], item: StreamItem): StreamEntry[] {
    if (entries.length === 0) return [{ description: "", items: [item] }];
    const last = entries[entries.length - 1];
    return [...entries.slice(0, -1), { ...last, items: [...last.items, item] }];
}

/**
 * Insert-or-update a `chat_component` item, keyed by `id` when the event carries
 * one and by `componentType` otherwise; `data` is merged over any existing item's.
 *
 * Shared because BOTH surfaces persist turns, and a surface that fails to record
 * a component silently corrupts the stored transcript: the full panel renders the
 * review chip (and therefore the whole diff view) *only* from a persisted
 * `componentType: "review"` item, and the run-event buffer that could rebuild the
 * turn is dropped as soon as either surface's `updateChatMessage` lands. This
 * previously existed as two copies and the mini chat's went missing.
 */
export function upsertComponent(
    entries: StreamEntry[],
    componentType: string,
    id: string | undefined,
    data: Record<string, any>
): StreamEntry[] {
    let found = false;
    const updated = entries.map((entry) => {
        const idx = entry.items.findIndex(
            (item) => item.kind === "component" && (id ? item.id === id : item.componentType === componentType)
        );
        if (idx === -1) return entry;
        found = true;
        return {
            ...entry,
            // Re-check `kind` inside the map so `item` narrows to the component variant
            // and `item.data` needs no cast (findIndex's predicate can't narrow here).
            items: entry.items.map((item, i) =>
                i === idx && item.kind === "component" ? { ...item, data: { ...item.data, ...data } } : item
            ),
        };
    });
    return found ? updated : appendToLastEntry(entries, { kind: "component", componentType, id, data });
}

/**
 * Card items that a backend request drives through stages, keyed by `data.requestId`.
 *
 * Derived from `StreamItem` so adding a data-carrying item kind can't silently desync
 * this set — `REQUEST_CARD_FIELDS` is keyed by it, so a new kind becomes a compile
 * error there until it's either given a field list or explicitly excluded here.
 * `component` also carries `data` but is keyed by `id`/`componentType` and merges
 * rather than replaces, so it belongs to `upsertComponent` instead.
 */
export type RequestCardKind = Exclude<Extract<StreamItem, { data: Record<string, any> }>["kind"], "component">;

/**
 * Insert-or-REPLACE a request-driven card, keyed by `data.requestId`.
 *
 * Note this replaces the item outright rather than merging (unlike
 * `upsertComponent`): each stage event carries the card's complete state, so the
 * latest event wins. Shared for the same reason as `upsertComponent` — both
 * surfaces author the persisted transcript, so a card only one of them knows how
 * to fold is a card the store can lose.
 */
export function upsertRequestCard(
    entries: StreamEntry[],
    kind: RequestCardKind,
    data: Record<string, any>
): StreamEntry[] {
    let found = false;
    const updated = entries.map((entry) => {
        const idx = entry.items.findIndex(
            (item) => item.kind === kind && (item as { data?: { requestId?: string } }).data?.requestId === data?.requestId
        );
        if (idx === -1) return entry;
        found = true;
        return { ...entry, items: entry.items.map((item, i) => (i === idx ? { kind, data } : item)) };
    });
    return found ? updated : appendToLastEntry(entries, { kind, data });
}

/**
 * Fields persisted for each request-driven card, in the order they are written.
 *
 * Whitelisted rather than derived by omitting transport keys (`type`/`seq`/
 * `generationId`), because this payload goes to disk and a blacklist would leak
 * any future meta field into the stored transcript. The order fixes the
 * serialized key order, so both surfaces produce byte-identical content.
 *
 * ⚠️ When a card's `ChatNotify` event gains a field that the card renders, add it
 * here — otherwise it is silently dropped from the persisted transcript.
 */
const REQUEST_CARD_FIELDS: Record<RequestCardKind, readonly string[]> = {
    connector: ["requestId", "stage", "serviceName", "serviceDescription", "spec", "connector",
        "error", "message", "inputMethod", "sourceIdentifier"],
    config: ["requestId", "stage", "variables", "existingValues", "message", "isTestConfig", "error"],
    ask: ["requestId", "stage", "questions", "answers"],
    skill_enable: ["requestId", "stage", "skillName", "skillId"],
};

/** Project a card event onto exactly the fields persisted for its kind. */
export function buildRequestCardData(kind: RequestCardKind, evt: Record<string, any>): Record<string, any> {
    const data: Record<string, any> = {};
    for (const field of REQUEST_CARD_FIELDS[kind]) {
        data[field] = evt[field];
    }
    return data;
}

/** Build the plan/task-list transcript item for a `task_approval_request`. */
export function buildPlanItem(
    requestId: string,
    tasks: any[],
    message: string | undefined,
    autoApproved?: boolean
): Extract<StreamItem, { kind: "plan" }> {
    return {
        kind: "plan",
        requestId,
        tasks,
        message,
        ...(autoApproved ? { approvalStatus: "approved" as const } : {}),
    };
}

/**
 * Mark a persisted plan item as approved or revised.
 *
 * Plan approval is resolved by a separate event after the original plan card is
 * written. Both the full panel and mini chat can author the final transcript, so
 * they must apply the same update or the last writer can restore a stale pending
 * plan after the user has already responded.
 */
export function applyPlanApprovalResolution(
    entries: StreamEntry[],
    requestId: string,
    approved: boolean,
    comment?: string
): StreamEntry[] {
    let changed = false;
    const updated = entries.map((entry) => ({
        ...entry,
        items: entry.items.map((item) => {
            if (item.kind !== "plan" || item.requestId !== requestId) {
                return item;
            }
            changed = true;
            return {
                ...item,
                approvalStatus: approved ? "approved" as const : "revised" as const,
                approvalComment: approved ? undefined : comment,
            };
        }),
    }));
    return changed ? updated : entries;
}

/**
 * The subset of a TaskWrite task this module needs to segment the transcript.
 *
 * `status` is narrowed to the three values the tool can actually emit (its Zod schema
 * in `agent/tools/task-writer.ts` is `z.enum([PENDING, IN_PROGRESS, COMPLETED])`), so
 * a typo'd literal in the comparisons below is a compile error rather than a task that
 * silently matches neither `find` and lands nowhere in the segmented transcript.
 * Deliberately not the full `TaskStatus` enum — `REVIEW` is never emitted by this tool.
 */
export interface TaskWriteTask { status: "pending" | "in_progress" | "completed"; description: string; }

/**
 * Fold a `TaskWrite` tool result into the transcript's ENTRY structure.
 *
 * TaskWrite is the one tool whose result is not an item: instead of resolving its
 * `tool_call`, it opens and closes *named entries* — the task rail the stream view
 * renders as dots. Its `tool_call` item is deliberately left unresolved (the view
 * renders it statically as "Planning..." once the stream ends), so the generic
 * "replace tool_call with tool_result" path must not be applied to it.
 *
 * Returns `entries` unchanged (same reference) when the in-progress task already
 * has an entry, letting callers skip a redundant write.
 */
export function applyTaskWriteResult(entries: StreamEntry[], tasks: TaskWriteTask[]): StreamEntry[] {
    const inProgress = tasks.find((t) => t.status === "in_progress");
    if (inProgress) {
        // Open a named entry for the task now running (idempotent across re-emits).
        if (entries.some((e) => e.description === inProgress.description)) return entries;
        return [...entries, { description: inProgress.description, items: [], status: "in_progress" }];
    }
    // Nothing running: close the task that just finished, then reopen a floating
    // entry so subsequent text/tool items don't land inside the completed task.
    const lastCompleted = [...tasks].reverse().find((t) => t.status === "completed");
    let next = lastCompleted
        ? entries.map((e) =>
            e.description === lastCompleted.description ? { ...e, status: "completed" as const } : e)
        : entries;
    const lastEntry = next[next.length - 1];
    if (!lastEntry || lastEntry.description !== "") {
        next = [...next, { description: "", items: [] }];
    }
    return next;
}

/** Marker both surfaces persist when the user interrupts a run. */
export const ABORT_MARKER_TEXT = "*[Request interrupted by user]*";

/** Append the interruption marker as its own trailing entry. */
export function appendAbortMarker(entries: StreamEntry[]): StreamEntry[] {
    return [...entries, { description: "", items: [{ kind: "text", text: ABORT_MARKER_TEXT }] }];
}

/**
 * Compaction-unavailable notice. Appended to the raw `content` (outside the
 * `<agentstream>` blob) rather than added as a stream item, so it renders as
 * markdown — `MarkdownRenderer` handles the `<compaction>` tag.
 */
export const COMPACTION_DISABLED_NOTICE =
    "\n<compaction>Your project is large — automatic context compaction is disabled. " +
    "You may hit the context limit on long sessions. Start a new thread if that happens.</compaction>";
