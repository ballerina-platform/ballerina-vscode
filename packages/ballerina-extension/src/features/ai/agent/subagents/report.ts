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
 * Report post-processing for the Subagent tool — a leaf module so the caps and the library extraction
 * the UI row relies on are unit-testable.
 */

/** Roughly 4K tokens; the prompt asks for less, this only stops a runaway report from flooding the caller. */
export const SUBAGENT_REPORT_MAX_CHARS = 16_000;


/** `org/name` mentions in the report's Libraries section, for the UI row label. */
export function extractReportedLibraries(report: string): string[] {
    const section = report.split(/^## /m).find(s => s.startsWith("Libraries"));
    if (!section) { return []; }
    const names = new Set<string>();
    for (const m of section.matchAll(/^\s*[-*]\s*`?([a-z][a-z0-9_.-]*\/[a-z0-9_.-]+)`?/gim)) {
        names.add(m[1].toLowerCase());
    }
    return [...names];
}

/** Preamble the model still emits despite the prompt ("Enough detail. Composing report now."). */
const PREAMBLE_WINDOW_CHARS = 400;

/**
 * Drops narration before the report's first `## ` heading, when a heading appears early. A report with
 * no heading at all (or one that starts with prose for longer than a sentence or two) is left alone,
 * since that text is then the answer.
 */
export function stripPreamble(report: string): string {
    const trimmed = report.trimStart();
    if (trimmed.startsWith("## ")) { return trimmed; }
    const at = trimmed.indexOf("\n## ");
    if (at === -1 || at > PREAMBLE_WINDOW_CHARS) { return report; }
    return trimmed.slice(at + 1);
}

export function truncateReport(report: string): string {
    const cleaned = stripPreamble(report);
    if (cleaned.length <= SUBAGENT_REPORT_MAX_CHARS) { return cleaned; }
    return `${cleaned.slice(0, SUBAGENT_REPORT_MAX_CHARS)}\n\n[report truncated at ${SUBAGENT_REPORT_MAX_CHARS} characters — ask a narrower follow-up with resume]`;
}
