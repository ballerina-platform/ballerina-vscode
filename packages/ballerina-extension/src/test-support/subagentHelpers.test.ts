// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.
/**
 * @jest-environment node
 *
 * Pure helpers of the Subagent tool: conversation shaping for resume, history extraction, the report
 * cap, the library extraction the UI row shows, and the status-bar wording for the new tools.
 */

import { buildSubagentMessages, collectResponseMessages } from "../features/ai/agent/subagents/messages";
import { extractReportedLibraries, stripPreamble, SUBAGENT_REPORT_MAX_CHARS, truncateReport } from "../features/ai/agent/subagents/report";
import { describeToolCall } from "../features/ai/state/toolLabels";

describe("buildSubagentMessages", () => {
    it("starts a fresh conversation with the brief alone", () => {
        expect(buildSubagentMessages("Find Kafka", undefined, "hint")).toEqual([{ role: "user", content: "Find Kafka" }]);
    });

    it("appends a follow-up turn after the saved history on resume", () => {
        const prev = [{ role: "user", content: "q" }, { role: "assistant", content: "a" }] as any[];
        const msgs = buildSubagentMessages("And the listener?", prev, "Re-grep the files.");
        expect(msgs.slice(0, 2)).toEqual(prev);
        expect(msgs[2].role).toBe("user");
        expect(msgs[2].content).toContain("## Follow-up question");
        expect(msgs[2].content).toContain("And the listener?");
        expect(msgs[2].content).toContain("Continue from where you left off. Re-grep the files.");
    });
});

describe("collectResponseMessages", () => {
    // Mirrors the AI SDK: each step's response.messages is the cumulative list so far.
    const step1 = [{ role: "assistant", content: "call" }, { role: "tool", content: [] }];
    const step2 = [...step1, { role: "assistant", content: "report" }];

    it("takes the final response messages, not a concatenation of the cumulative per-step lists", () => {
        const result = { text: "report", response: { messages: step2 }, steps: [{ response: { messages: step1 } }, { response: { messages: step2 } }] } as any;
        expect(collectResponseMessages(result)).toEqual(step2);
        expect(collectResponseMessages(result)).toHaveLength(3); // concatenating steps would give 5
    });

    it("falls back to the last step, then to the final text", () => {
        expect(collectResponseMessages({ text: "report", steps: [{ response: { messages: step1 } }, { response: { messages: step2 } }] } as any)).toEqual(step2);
        expect(collectResponseMessages({ text: "x" })).toEqual([{ role: "assistant", content: "x" }]);
        expect(collectResponseMessages({ text: "y", steps: [{ response: {} }] } as any)).toEqual([{ role: "assistant", content: "y" }]);
    });
});

describe("report helpers", () => {
    it("extracts org/name entries from the Libraries section only", () => {
        const report = [
            "## Libraries", "- ballerinax/kafka — producer and consumer", "- `ballerina/data.csv` — @csv:Name binding",
            "## API surface", "- ballerina/http — not a chosen library, just mentioned",
        ].join("\n");
        expect(extractReportedLibraries(report)).toEqual(["ballerinax/kafka", "ballerina/data.csv"]);
        expect(extractReportedLibraries("no sections here")).toEqual([]);
    });

    it("strips a short preamble before the first heading, and only that", () => {
        expect(stripPreamble("Enough detail. Composing report now.\n\n## Libraries\n- x/y")).toBe("## Libraries\n- x/y");
        expect(stripPreamble("  ## Verification result\nok")).toBe("## Verification result\nok");
        const prose = "The documentation does not say. " + "More prose. ".repeat(60) + "\n## Gaps\n- none";
        expect(stripPreamble(prose)).toBe(prose);
        expect(stripPreamble("plain answer with no headings")).toBe("plain answer with no headings");
        expect(truncateReport("Composing.\n## Libraries\n- a/b")).toBe("## Libraries\n- a/b");
    });

    it("truncates only past the cap and says how to continue", () => {
        expect(truncateReport("short")).toBe("short");
        const long = "x".repeat(SUBAGENT_REPORT_MAX_CHARS + 10);
        const cut = truncateReport(long);
        expect(cut.startsWith("x".repeat(SUBAGENT_REPORT_MAX_CHARS))).toBe(true);
        expect(cut).toContain("[report truncated at");
        expect(cut).toContain("resume");
    });
});

describe("describeToolCall for subagent tools", () => {
    it("labels the Subagent row from the description and marks background runs", () => {
        expect(describeToolCall("Subagent", { description: "Kafka connector lookup" })).toBe("Consulting the Librarian: Kafka connector lookup");
        expect(describeToolCall("Subagent", { description: "Kafka connector lookup", run_in_background: true })).toBe("Consulting the Librarian (background): Kafka connector lookup");
        expect(describeToolCall("Subagent", { subagent_type: "LibraryResearcher" })).toBe("Consulting the Library Researcher");
        expect(describeToolCall("Subagent", {})).toBe("Consulting the Librarian");
    });

    it("labels the wait and the kill", () => {
        expect(describeToolCall("task_output", { task_id: "t", description: "Kafka connector lookup" })).toBe("Waiting for Kafka connector lookup");
        expect(describeToolCall("task_output", { task_id: "t", block: false })).toBe("Checking a background task");
        expect(describeToolCall("kill_task", { task_id: "t" })).toBe("Stopping a background task");
    });
});
