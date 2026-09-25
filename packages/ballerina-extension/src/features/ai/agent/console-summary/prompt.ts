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

import type { ModelMessage } from "ai";

/** Summaries longer than this are cut; the console shows one short paragraph per turn. */
export const MAX_SUMMARY_CHARS = 600;

/** How much of the turn's closing text is passed to the model. */
const MAX_ASSISTANT_TEXT_CHARS = 4_000;
const MAX_FILES_LISTED = 30;
const MAX_EARLIER_SUMMARIES = 5;

export interface SummaryTask {
    description: string;
    status: string;
}

export interface ConsoleSummaryPromptInput {
    /** What the user asked for in this turn. */
    userQuery: string;
    /** The task list as the agent last wrote it, when it used one (Plan mode). */
    tasks: SummaryTask[];
    /** Workspace-relative paths the turn changed. */
    modifiedFiles: string[];
    /** The assistant's text for the turn. */
    assistantText: string;
    /** Compilation errors left when the turn finished. */
    errorCount: number;
    /** Summaries already published earlier in this session, oldest first. */
    earlierSummaries: string[];
}

/**
 * The task list from the last task-writer call in the turn. That tool is
 * stateless and always receives every task, so the last call is the whole list.
 */
export function extractLastTaskList(assistantMessages: any[], taskToolName: string): SummaryTask[] {
    let last: SummaryTask[] = [];
    for (const message of assistantMessages ?? []) {
        if (message?.role !== "assistant" || !Array.isArray(message.content)) {
            continue;
        }
        for (const item of message.content) {
            if (item?.type !== "tool-call" || item.toolName !== taskToolName) {
                continue;
            }
            const input = item.input ?? item.args;
            if (!Array.isArray(input?.tasks)) {
                continue;
            }
            last = input.tasks
                .filter((t: any) => typeof t?.description === "string")
                .map((t: any) => ({ description: t.description, status: String(t.status ?? "") }));
        }
    }
    return last;
}

/** Plain, single-line text within the cap; the console renders it as-is. */
export function sanitizeSummary(raw: string | undefined): string {
    const text = (raw ?? "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/[`*_#>]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (text.length <= MAX_SUMMARY_CHARS) {
        return text;
    }
    const cut = text.slice(0, MAX_SUMMARY_CHARS - 1);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > MAX_SUMMARY_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut) + "…";
}

/**
 * Used when the model call fails, so the console still hears that work was done.
 * Built only from what the turn recorded, never from guesses.
 */
export function buildFallbackSummary(tasks: SummaryTask[], modifiedFiles: string[]): string {
    const completed = tasks.filter((t) => t.status === "completed").map((t) => t.description.trim()).filter(Boolean);
    if (completed.length > 0) {
        return sanitizeSummary(`Completed: ${completed.join("; ")}.`);
    }
    if (modifiedFiles.length > 0) {
        return `Updated ${modifiedFiles.length} file${modifiedFiles.length === 1 ? "" : "s"}.`;
    }
    return "";
}

const SYSTEM_PROMPT = `You write short activity notes for WSO2 Integration Intelligence. A user asked the Copilot to build or change an integration; you describe what this one turn of work did. The note is shown in a web console, under the user's original request, as one item in a list with one item per turn.

Rules:
- Describe only what THIS turn did. Earlier notes, when given, are already shown to the user: never repeat them; for a follow-up turn, describe just the change.
- 2-4 sentences, past tense, at most 600 characters, one plain-text paragraph: no markdown, bullets, backticks or line breaks.
- Be descriptive about what the user now has: what kind of integration it is, when it runs or what triggers it, which systems it connects (e.g. GitHub, Slack, Salesforce), what it does with the data step by step, and which settings are left for the user to provide at deploy time. Mention a notable design choice when it matters to the user.
- Name the external systems and settings in plain words, but no code: no file, module, library, function or tool names.
- Be honest. If compilation errors remain or planned tasks were not completed, say so briefly; otherwise you may end by noting that it compiles cleanly.
- Base the note only on the information given. Never invent features.

Example of the style:
Built a scheduled automation that posts a daily summary of GitHub pull requests to Slack. Each run fetches the repository's pull requests, keeps only those opened in the last 24 hours, and posts a message to the chosen Slack channel listing each one with its title, author and a link, or a note that there were none. The GitHub token, repository, Slack token and channel are set at deploy time. It compiles cleanly with no errors.`;

export function buildConsoleSummaryMessages(input: ConsoleSummaryPromptInput): ModelMessage[] {
    const { userQuery, tasks, modifiedFiles, assistantText, errorCount, earlierSummaries } = input;

    const earlierBlock = earlierSummaries.length
        ? `<earlier_notes>\n${earlierSummaries.slice(-MAX_EARLIER_SUMMARIES).map((s) => `- ${s}`).join("\n")}\n</earlier_notes>\n\n`
        : "";
    const tasksBlock = tasks.length
        ? `<tasks>\n${tasks.map((t) => `[${t.status}] ${t.description}`).join("\n")}\n</tasks>\n\n`
        : "";
    const shownFiles = modifiedFiles.slice(0, MAX_FILES_LISTED);
    const moreFiles = modifiedFiles.length - shownFiles.length;
    const filesBlock = `<changed_files>\n${shownFiles.join("\n")}${moreFiles > 0 ? `\n(and ${moreFiles} more)` : ""}\n</changed_files>\n\n`;
    // The closing text says the most about the outcome, so keep the tail.
    const text = assistantText.length > MAX_ASSISTANT_TEXT_CHARS
        ? assistantText.slice(-MAX_ASSISTANT_TEXT_CHARS)
        : assistantText;

    const userContent = `${earlierBlock}<user_request>
${userQuery}
</user_request>

${tasksBlock}${filesBlock}<compilation_errors_remaining>${errorCount}</compilation_errors_remaining>

<assistant_response>
${text}
</assistant_response>

Write the note for this turn.`;

    return [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
    ];
}
