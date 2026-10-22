/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * The instructions server-side compaction runs with when it pauses: the same prompt as the MI Copilot's
 * (`mi-extension/src/ai-features/agent-mode/agents/compact/prompt.ts`), kept identical on purpose.
 * It tells the summarizer to skip the `<system-reminder>` context blocks, because a turn that
 * compaction pauses restarts with that context rebuilt (see compaction-restart.ts). The codebase
 * dump is rebuilt too, but it is not a `<system-reminder>`, so CODEBASE_DUMP_NOTE names it.
 */

const PROMPT = `
Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.
Do NOT reproduce or summarize the contents of \`<system-reminder>\` context blocks (for example \`<env>\`, connector catalogs, \`# Available Skills\`, \`# Project AGENTS.md\`, mode policy, or \`.tryout\` payload listings). This environment re-injects that context automatically after compaction, so capturing it here only wastes space and risks stale duplicates that conflict with the freshly re-injected copies. The sole exception is a \`# Activated Skill\` block (a skill the user invoked with /skill-name): capture the substance of its instructions, since that content is NOT re-injected after compaction.
Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:
1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.
Your summary should include the following sections:
1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the users' feedback and changing intent.
7. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
8. Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.
9. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing. IMPORTANT: ensure that this step is DIRECTLY in line with the user's most recent explicit requests, and the task you were working on immediately before this summary request. If your last task was concluded, then only list next steps if they are explicitly in line with the users request. Do not start on tangential requests or really old requests that were already completed without confirming with the user first. If there is a next step, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This should be verbatim to ensure there's no drift in task interpretation.
Here's an example of how your output should be structured:
<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>
<summary>
1. Primary Request and Intent:
   [Detailed description]
2. Key Technical Concepts:
   - [Concept 1]
   - [Concept 2]
   - [...]
3. Files and Code Sections:
   - [File Name 1]
      - [Summary of why this file is important]
      - [Summary of the changes made to this file, if any]
      - [Important Code Snippet]
   - [File Name 2]
      - [Important Code Snippet]
   - [...]
4. Errors and fixes:
    - [Detailed description of error 1]:
      - [How you fixed the error]
      - [User feedback on the error if any]
    - [...]
5. Problem Solving:
   [Description of solved problems and ongoing troubleshooting]
6. All user messages:
    - [Detailed non tool use user message]
    - [...]
7. Pending Tasks:
   - [Task 1]
   - [Task 2]
   - [...]
8. Current Work:
   [Precise description of current work]
9. Optional Next Step:
   [Optional Next step to take]
</summary>
</example>
Please provide your summary based on the conversation so far, following this structure and ensuring precision and thoroughness in your response.`;

const CODEBASE_DUMP_NOTE = `
The \`<codebase_structure>\` block is re-injected the same way, with the files as they are after compaction. Do NOT copy file contents from it into the summary. Under Files and Code Sections, name the files that were read or changed and why, and quote only the lines that matter.`;

export const COMPACT_SYSTEM_REMINDER_AUTO_TRIGGERED = `
<system-reminder>
The conversation context window is running out. You must summarize the conversation immediately so that work can continue in a fresh context.
${PROMPT}
${CODEBASE_DUMP_NOTE}
</system-reminder>
`;
