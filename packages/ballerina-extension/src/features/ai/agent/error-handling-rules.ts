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
 * System-prompt rules for deciding where an error stops.
 *
 * Copilot library testing asked for a batch file processor that skips a malformed file and
 * processes the rest. The generated loop called the per-file function with `check`, so the first
 * bad file propagated its error out of the loop and up to `main` and the run aborted — which
 * files got processed at all depended on directory listing order. The code compiles clean, so
 * neither the compiler nor the diagnostics tool can catch it; only the system prompt can.
 *
 * Every pattern below was compiled AND run on Ballerina 2201.13.4 against a three-file batch
 * whose middle file fails typed CSV binding:
 *   - `check` on the per-item call            -> aborts after file 1; file 3 never runs.
 *   - variable + `if r is error { continue; }` -> files 1 and 3 processed, file 2 skipped.
 *   - `do { } on fail { }` inside the body     -> same, correct.
 *   - `on fail` attached to the `foreach`      -> compiles, but EXITS the loop; file 3 never runs.
 * Also verified: `continue` as the last statement of an `on fail` block makes the statement after
 * the `do` unreachable ("unreachable code"), so the variable form is the one to teach.
 *
 * Kept in its own module (no imports) so it can be unit-tested without loading the extension-host
 * module graph. Interpolated into the system prompt by getSystemPrompt() in ./prompts.ts.
 */
export const ERROR_HANDLING_CODING_RULES = `## Where an error stops

\`check\` propagates the error out of the ENCLOSING FUNCTION, not out of the current iteration. Inside a loop it therefore ends the whole loop, not just the current item. Before writing \`check\`, decide which of the two is wanted.

### Fail fast (the default)
Use \`check\` when one failure invalidates the rest of the work: client initialization, reading configuration, a single request/response flow, or a step whose result every later step depends on. Let the error reach \`main\` or the resource method and be reported there.

### Isolate per item
When the code loops over INDEPENDENT items (files in a directory, rows in a batch, messages in a poll, records in a payload) and the requirement says to skip, quarantine, log-and-continue, keep going, or process the rest, a failure belongs to ONE item. Never call the per-item work with \`check\` in that loop: the first bad item aborts the run and how many items got processed depends on iteration order.

Assign the result to a variable, test it, and continue:
\`\`\`ballerina
int failedCount = 0;
foreach file:MetaData entry in entries {
    string fileName = entry.absPath;
    error? result = processOrderFile(fileName);
    if result is error {
        failedCount += 1;
        log:printError("skipped file", result, fileName = fileName);
        // quarantine here if the requirement asks for it, and check that move too
        continue;
    }
}
if failedCount > 0 {
    log:printWarn("batch completed with skipped files", skipped = failedCount, total = entries.length());
}
\`\`\`
When the per-item call returns a value, narrow the union the same way: \`Order[]|error orders = readOrders(fileName); if orders is error { ...; continue; }\`.

- Put the whole per-item unit of work behind ONE call (or one \`do\` block) so every error it can raise — reading, binding, validating, writing, moving — is caught at the same place. Catching only the read still lets a validation failure escape.
- \`do { check ... } on fail error e { ... }\` works too, but ONLY when the \`do\` is INSIDE the loop body. \`foreach ... { } on fail error e { }\` attaches to the loop and EXITS it on the first error — it does not skip the item. Do not end an \`on fail\` block with \`continue\`; the compiler then reports the statement after the \`do\` as unreachable.
- Log every skipped item with its error and report a count at the end. Never discard an error with an empty \`if result is error { }\` body, and never use \`checkpanic\` to get past this.
- If the requirement does not say what a per-item failure should do, isolate the item and say so in the summary.`;
