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

/**
 * @jest-environment node
 *
 * The module under test is pure (its only import is a type-only file), so it needs
 * no DOM. Pinning `node` here also keeps this suite runnable while the package's
 * default `jsdom` environment is broken in some trees — jsdom pulls
 * `http-proxy-agent@5` → ESM-only `@tootallnate/once@3`, which fails under
 * `require()` and takes down every suite in the package before a single test runs.
 */

/**
 * These functions build the PERSISTED chat transcript, and two different webviews
 * (the full AI panel and the floating-orb mini chat) call them and must produce
 * byte-identical output. The bug that motivated this suite: one surface silently
 * omitted the `componentType: "review"` item, which made the review chip — and
 * therefore the entire diff view — unreachable for a completed generation. Nothing
 * crashed and nothing logged; the transcript was simply poorer.
 *
 * So the invariants below are deliberately about *silent* breakage: key order (it
 * fixes the stored bytes), merge-vs-replace, reference identity, and which entry an
 * item lands in. A regression in any of them produces valid, working JSON that is
 * quietly wrong — exactly how the original bug escaped review.
 */

import { StreamEntry, StreamItem } from "../../AgentStreamView/types";
import {
    serializeStream,
    parseStream,
    appendToLastEntry,
    upsertComponent,
    upsertRequestCard,
    upsertThinking,
    describeThinkingDuration,
    buildRequestCardData,
    buildPlanItem,
    applyPlanApprovalResolution,
    appendAbortMarker,
    applyTaskWriteResult,
    TaskWriteTask,
    ABORT_MARKER_TEXT,
    COMPACTION_DISABLED_NOTICE,
} from "./streamSerialization";

const floating = (items: StreamItem[] = []): StreamEntry => ({ description: "", items });
const componentsOf = (entries: StreamEntry[]) =>
    entries.flatMap((e) => e.items).filter((i) => i.kind === "component");
const kindsOf = (entries: StreamEntry[]) => entries.flatMap((e) => e.items).map((i) => i.kind);

describe("serializeStream / parseStream", () => {
    it("round-trips entries", () => {
        const entries = [floating([{ kind: "text", text: "hello" }])];
        expect(parseStream(serializeStream(entries, ""))).toEqual(entries);
    });

    it("round-trips content containing a literal </agentstream> without truncating", () => {
        // The escape exists for exactly this: an unescaped closing tag inside the
        // payload would end the blob early and silently drop everything after it.
        const entries = [floating([{ kind: "text", text: "see </agentstream> tag" }])];
        expect(parseStream(serializeStream(entries, ""))).toEqual(entries);
    });

    it("replaces an existing blob while preserving surrounding content", () => {
        // COMPACTION_DISABLED_NOTICE is appended OUTSIDE the blob, so re-serializing
        // must not eat it.
        const withBlob = serializeStream([floating([{ kind: "text", text: "a" }])], "");
        const content = withBlob + COMPACTION_DISABLED_NOTICE;
        const next = serializeStream([floating([{ kind: "text", text: "b" }])], content);
        expect(next.endsWith(COMPACTION_DISABLED_NOTICE)).toBe(true);
        expect(parseStream(next)[0].items).toEqual([{ kind: "text", text: "b" }]);
    });

    it("returns [] for absent or malformed blobs instead of throwing", () => {
        expect(parseStream("no blob here")).toEqual([]);
        expect(parseStream("<agentstream>not json</agentstream>")).toEqual([]);
        // Guards the reducers: a non-array `entries` would crash appendToLastEntry.
        expect(parseStream('<agentstream>{"entries":{}}</agentstream>')).toEqual([]);
    });
});

describe("upsertComponent", () => {
    it("appends when no matching component exists", () => {
        const entries = [floating([{ kind: "text", text: "hi" }])];
        const out = upsertComponent(entries, "review", undefined, { modifiedFiles: ["a.bal"] });
        expect(kindsOf(out)).toEqual(["text", "component"]);
    });

    it("MERGES data on a repeat event rather than replacing it", () => {
        // A follow-up event carrying a partial payload must not wipe semanticDiffs —
        // losing those empties the diff view.
        const seeded = upsertComponent([floating()], "review", undefined, {
            semanticDiffs: [{ a: 1 }, { b: 2 }],
            generationId: "msg-1",
        });
        const out = upsertComponent(seeded, "review", undefined, { status: "discarded" });
        const comps = componentsOf(out);
        expect(comps).toHaveLength(1);
        expect((comps[0] as any).data).toEqual({
            semanticDiffs: [{ a: 1 }, { b: 2 }],
            generationId: "msg-1",
            status: "discarded",
        });
    });

    it("keys by id when given one, keeping distinct ids separate", () => {
        let out = upsertComponent([floating()], "progress", "p1", { text: "Generating...", status: "start" });
        out = upsertComponent(out, "progress", "p1", { status: "end" });
        expect(componentsOf(out)).toHaveLength(1);
        expect((componentsOf(out)[0] as any).data).toEqual({ text: "Generating...", status: "end" });

        out = upsertComponent(out, "progress", "p2", { status: "start" });
        expect(componentsOf(out)).toHaveLength(2);
    });
});

describe("upsertRequestCard", () => {
    it("REPLACES the card wholesale — stale fields must not survive a stage change", () => {
        // Inverse of upsertComponent's merge. Each stage event carries the card's
        // complete state, so a merge here would leave stale data rendering forever.
        const seeded = [floating([
            { kind: "config", data: { requestId: "x", stage: "collecting", variables: ["a", "b"] } },
        ])];
        const out = upsertRequestCard(seeded, "config", { requestId: "x", stage: "done" });
        const cards = out.flatMap((e) => e.items).filter((i) => i.kind === "config");
        expect(cards).toHaveLength(1);
        expect((cards[0] as any).data).toEqual({ requestId: "x", stage: "done" });
    });

    it("keeps distinct requestIds as separate cards", () => {
        let out = upsertRequestCard([floating()], "ask", { requestId: "r1", stage: "pending" });
        out = upsertRequestCard(out, "ask", { requestId: "r2", stage: "pending" });
        expect(out.flatMap((e) => e.items).filter((i) => i.kind === "ask")).toHaveLength(2);
    });

    it("does not collide across kinds sharing a requestId", () => {
        let out = upsertRequestCard([floating()], "ask", { requestId: "same" });
        out = upsertRequestCard(out, "config", { requestId: "same" });
        expect(kindsOf(out)).toEqual(["ask", "config"]);
    });
});

describe("buildRequestCardData", () => {
    // Key ORDER fixes the serialized bytes, which is the cross-surface invariant.
    // A reordered or newly-inserted field yields valid JSON that differs byte-wise.
    it.each([
        ["connector", ["requestId", "stage", "serviceName", "serviceDescription", "spec",
            "connector", "error", "message", "inputMethod", "sourceIdentifier"]],
        ["config", ["requestId", "stage", "variables", "existingValues", "message", "isTestConfig", "error"]],
        ["ask", ["requestId", "stage", "questions", "answers"]],
        ["skill_enable", ["requestId", "stage", "skillName", "skillId"]],
    ] as const)("%s projects onto the whitelist in a fixed order", (kind, fields) => {
        // Input keys deliberately in the wrong order — output order must not follow it.
        const evt: Record<string, any> = { type: `${kind}_event`, seq: 3, generationId: "g1" };
        [...fields].reverse().forEach((f, i) => { evt[f] = `v${i}`; });
        expect(Object.keys(buildRequestCardData(kind as any, evt))).toEqual([...fields]);
    });

    it("drops transport and unlisted fields", () => {
        const data = buildRequestCardData("ask", {
            type: "clarify_event", seq: 9, generationId: "g", requestId: "r",
            stage: "answered", questions: [], answers: [], internalDebugFlag: true,
        });
        expect(Object.keys(data)).toEqual(["requestId", "stage", "questions", "answers"]);
    });
});

describe("buildPlanItem", () => {
    it("omits approvalStatus unless auto-approved", () => {
        expect(buildPlanItem("rq", [{ t: 1 }], "msg", undefined))
            .toEqual({ kind: "plan", requestId: "rq", tasks: [{ t: 1 }], message: "msg" });
    });

    it("marks auto-approved plans, and the flag survives serialization", () => {
        const item = buildPlanItem("rq", [], undefined, true);
        expect((item as any).approvalStatus).toBe("approved");
        const revived = parseStream(serializeStream([floating([item])], ""));
        expect((revived[0].items[0] as any).approvalStatus).toBe("approved");
    });
});

describe("applyPlanApprovalResolution", () => {
    it("updates only the matching plan and survives serialization", () => {
        const entries = [floating([
            buildPlanItem("rq-1", [{ description: "A" }], "First"),
            buildPlanItem("rq-2", [{ description: "B" }], "Second"),
        ])];

        const updated = applyPlanApprovalResolution(entries, "rq-1", false, "Use a queue instead");
        const revived = parseStream(serializeStream(updated, ""));
        expect(revived[0].items).toEqual([
            {
                kind: "plan",
                requestId: "rq-1",
                tasks: [{ description: "A" }],
                message: "First",
                approvalStatus: "revised",
                approvalComment: "Use a queue instead",
            },
            {
                kind: "plan",
                requestId: "rq-2",
                tasks: [{ description: "B" }],
                message: "Second",
            },
        ]);
    });

    it("marks approval without persisting a stale revision comment", () => {
        const revised = applyPlanApprovalResolution(
            [floating([{
                ...buildPlanItem("rq", [], undefined),
                approvalStatus: "revised",
                approvalComment: "Old comment",
            }])],
            "rq",
            true
        );
        const revived = parseStream(serializeStream(revised, ""));
        expect(revived[0].items[0]).toEqual({
            kind: "plan",
            requestId: "rq",
            tasks: [],
            approvalStatus: "approved",
        });
    });

    it("returns the same reference when the request is absent", () => {
        const entries = [floating([buildPlanItem("other", [], undefined)])];
        expect(applyPlanApprovalResolution(entries, "missing", true)).toBe(entries);
    });
});

describe("appendAbortMarker", () => {
    it("appends a NEW entry instead of merging into the last one", () => {
        // appendToLastEntry would bury the marker inside the previous entry.
        const last = floating([{ kind: "text", text: "hello" }]);
        const out = appendAbortMarker([last]);
        expect(out).toHaveLength(2);
        expect(out[0]).toBe(last);
        expect(out[1]).toEqual({ description: "", items: [{ kind: "text", text: ABORT_MARKER_TEXT }] });
    });
});

describe("applyTaskWriteResult", () => {
    const task = (description: string, status: TaskWriteTask["status"]): TaskWriteTask => ({
        description,
        status,
    });

    it("walks a plan lifecycle, opening and closing named entries", () => {
        let entries: StreamEntry[] = [floating([
            { kind: "tool_call", toolCallId: "tc1", toolName: "TaskWrite", toolInput: {} },
        ])];

        entries = applyTaskWriteResult(entries, [task("A", "in_progress"), task("B", "pending")]);
        expect(entries.map((e) => [e.description, e.status]))
            .toEqual([["", undefined], ["A", "in_progress"]]);

        entries = applyTaskWriteResult(entries, [task("A", "completed"), task("B", "pending")]);
        entries = applyTaskWriteResult(entries, [task("A", "completed"), task("B", "in_progress")]);
        entries = applyTaskWriteResult(entries, [task("A", "completed"), task("B", "completed")]);

        expect(entries.map((e) => [e.description, e.status ?? null])).toEqual([
            ["", null], ["A", "completed"], ["", null], ["B", "completed"], ["", null],
        ]);
        // TaskWrite's tool_call is deliberately never resolved into a tool_result.
        expect(entries[0].items[0].kind).toBe("tool_call");
    });

    it("returns the SAME REFERENCE when the in-progress task already has an entry", () => {
        // AIChat relies on `updated === entries` to skip a redundant React write, so a
        // new-but-equal array would silently reintroduce renders. Value equality would
        // not catch that — assert identity.
        const tasks = [task("A", "in_progress")];
        const opened = applyTaskWriteResult([floating()], tasks);
        expect(applyTaskWriteResult(opened, tasks)).toBe(opened);
    });

    it("appends a floating entry so later items do not land inside a finished task", () => {
        const opened = applyTaskWriteResult([floating()], [task("A", "in_progress")]);
        const closed = applyTaskWriteResult(opened, [task("A", "completed")]);
        expect(closed[closed.length - 1]).toEqual({ description: "", items: [] });
    });

    it("does not stack floating entries when one is already trailing", () => {
        const entries = [floating()];
        expect(applyTaskWriteResult(entries, [task("A", "pending")])).toEqual(entries);
    });

    it("still opens a floating entry when the completed task has no matching entry", () => {
        const out = applyTaskWriteResult(
            [{ description: "X", items: [], status: "in_progress" }],
            [task("ZZZ", "completed")]
        );
        expect(out.map((e) => e.description)).toEqual(["X", ""]);
    });
});

describe("regression: a turn folded through the mini chat's event set keeps its review", () => {
    it("preserves the review component and its diffs across a persist round-trip", () => {
        // This is the shipped bug, pinned. The mini chat authors the stored transcript;
        // if the review component is absent the full panel cannot render the ReviewBar,
        // and the user loses the diff view for a generation that completed fine.
        let content = serializeStream([floating([
            { kind: "tool_result", toolCallId: "t1", toolName: "file_write", toolOutput: { success: true } },
            { kind: "text", text: "The code compiles cleanly." },
        ])], "");

        content = serializeStream(
            upsertComponent(parseStream(content), "review", undefined, {
                modifiedFiles: ["main.bal", "types.bal"],
                semanticDiffs: [{ c: 1 }, { c: 2 }, { c: 3 }, { c: 4 }, { c: 5 }],
                loadDesignDiagrams: true,
                generationId: "msg-1",
            }),
            content
        );

        const review = componentsOf(parseStream(content))[0] as any;
        expect(review).toBeDefined();
        expect(review.componentType).toBe("review");
        expect(review.data.semanticDiffs).toHaveLength(5);
        expect(review.data.generationId).toBe("msg-1");
    });
});

describe("appendToLastEntry", () => {
    it("creates a floating entry when there are none", () => {
        expect(appendToLastEntry([], { kind: "text", text: "x" }))
            .toEqual([{ description: "", items: [{ kind: "text", text: "x" }] }]);
    });

    it("appends into the trailing entry, leaving earlier ones untouched", () => {
        const first = floating([{ kind: "text", text: "a" }]);
        const out = appendToLastEntry([first, floating([{ kind: "text", text: "b" }])], { kind: "text", text: "c" });
        expect(out).toHaveLength(2);
        expect(out[0]).toBe(first);
        expect(out[1].items).toHaveLength(2);
    });
});

/** Flatten entries and return the item at `index`, narrowed to the thinking variant. */
function thinkingAt(entries: StreamEntry[], index: number) {
    const item = entries.flatMap((e) => e.items)[index];
    if (item?.kind !== "thinking") {
        throw new Error(`expected a thinking item at ${index}, got ${item?.kind}`);
    }
    return item;
}

describe("upsertThinking", () => {
    it("start → delta → delta → end merges into one done item with concatenated text", () => {
        let entries: StreamEntry[] = [];
        entries = upsertThinking(entries, "r1", "", false, 1000);
        entries = upsertThinking(entries, "r1", "First, ", false, 1500);
        entries = upsertThinking(entries, "r1", "then.", false, 2000);
        entries = upsertThinking(entries, "r1", "", true, 4000);
        expect(entries).toHaveLength(1);
        expect(entries[0].items).toEqual([
            { kind: "thinking", id: "r1", text: "First, then.", done: true, startedAt: 1000, endedAt: 4000 },
        ]);
    });

    it("both surfaces' identical call sequences serialize byte-identically", () => {
        // The panel and the mini fold from the same events; the store is
        // last-writer-wins, so the bytes must match.
        const fold = () => {
            let entries: StreamEntry[] = [floating([{ kind: "text", text: "before" }])];
            entries = upsertThinking(entries, "r1", "", false, 1000);
            entries = upsertThinking(entries, "r1", "reason", false, 1200);
            entries = upsertThinking(entries, "r1", "", true, 3000);
            return serializeStream(entries, "");
        };
        expect(fold()).toBe(fold());
    });

    it("a different id opens a new item instead of merging", () => {
        let entries: StreamEntry[] = [];
        entries = upsertThinking(entries, "r1", "one", true, 1000);
        entries = upsertThinking(entries, "r2", "two", false, 2000);
        expect(kindsOf(entries)).toEqual(["thinking", "thinking"]);
        expect(thinkingAt(entries, 0).id).toBe("r1");
        expect(thinkingAt(entries, 1).id).toBe("r2");
    });

    it("an orphaned delta (no trailing match) appends defensively rather than corrupting", () => {
        // A tool_call landed after the block opened (interleaved thinking) — the
        // delta must not merge into it or into an unrelated earlier thinking item.
        let entries: StreamEntry[] = [];
        entries = upsertThinking(entries, "r1", "early", true, 1000);
        entries = appendToLastEntry(entries, { kind: "tool_call", toolCallId: "t1", toolName: "file_read" });
        entries = upsertThinking(entries, "r1", "late", false, undefined);
        const items = entries.flatMap((e) => e.items);
        expect(items.map((i) => i.kind)).toEqual(["thinking", "tool_call", "thinking"]);
        expect(thinkingAt(entries, 0).text).toBe("early");
        expect(thinkingAt(entries, 2).text).toBe("late");
        // The orphan opened from a delta carries no locally-derived timestamp —
        // stamping one would make the serialized bytes differ per surface.
        expect(thinkingAt(entries, 2).startedAt).toBeUndefined();
        expect(serializeStream(entries, "")).not.toContain("startedAt\":2");
    });

    it("a repeated end keeps the first endedAt (duration is fixed at close time)", () => {
        let entries: StreamEntry[] = [];
        entries = upsertThinking(entries, "r1", "x", false, 1000);
        entries = upsertThinking(entries, "r1", "", true, 2000);
        entries = upsertThinking(entries, "r1", "", true, 9000); // e.g. flush replayed after real end
        const item = thinkingAt(entries, 0);
        expect(item.done).toBe(true);
        expect(item.endedAt).toBe(2000);
    });

    it("round-trips through serialize/parse", () => {
        let entries: StreamEntry[] = [];
        entries = upsertThinking(entries, "r1", "thought", true, 1000);
        expect(parseStream(serializeStream(entries, ""))).toEqual(entries);
    });
});

describe("describeThinkingDuration", () => {
    it("reports whole seconds, rounding and flooring at 1s", () => {
        expect(describeThinkingDuration({ startedAt: 1000, endedAt: 4000 })).toBe("Thought for 3s");
        expect(describeThinkingDuration({ startedAt: 1000, endedAt: 1200 })).toBe("Thought for 1s");
        expect(describeThinkingDuration({ startedAt: 1000, endedAt: 1000 })).toBe("Thought for 1s");
    });

    it("falls back to a bare label when a block never closed or timestamps are inconsistent", () => {
        expect(describeThinkingDuration({ startedAt: 1000 })).toBe("Thought");
        expect(describeThinkingDuration({})).toBe("Thought");
        expect(describeThinkingDuration({ startedAt: 2000, endedAt: 1000 })).toBe("Thought");
    });
});
