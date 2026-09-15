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
 * System-prompt rules for writing concurrency-safe Ballerina code.
 *
 * These rules teach the agent to write code that satisfies the compiler's
 * IsolationAnalyzer up front (isolated functions/variables/objects, lock
 * statement restrictions, transfer in/out rules) so services are inferred
 * `isolated` and dispatched concurrently, and so the agent avoids the most
 * common isolation errors (BCE3943, BCE3956-BCE3964, BCE2080/BCE2081,
 * BCE4042/BCE4043) instead of hitting them and repairing after the fact.
 *
 * Also covers: no I/O inside a lock and the key-snapshot fan-out pattern that
 * compiles (verified on Ballerina 2201.13.4), and cloning of immutable values
 * (clone() of an immutable value returns the same value; rebuild with a query
 * expression + .clone() or cloneWithType(), both verified on 2201.13.4).
 *
 * Kept in its own module (no imports) so it can be unit-tested without loading
 * the extension-host module graph. Interpolated into the system prompt by
 * getSystemPrompt() in ./prompts.ts.
 */
export const CONCURRENCY_CODING_RULES = `## Concurrency Safety and Shared State
Apply these rules whenever the code has module-level state, service or class fields, or workers.

### Module-level variables
- \`configurable\` variables are implicitly final and readable from any isolated context without a lock. NEVER write \`final configurable\` (compile error).
- Declare never-mutated values \`final\`.
- A \`final\` variable is readable from \`isolated\` functions and service methods WITHOUT a lock only when its type is one of:
  - A literal (string, int, boolean, decimal, float, byte).
  - \`readonly\`, e.g. \`final int[] & readonly defaults = [1, 2];\`
  - an isolated object: most clients and listeners defined by the libraries are isolated (e.g. \`final http:Client httpClient = check new (url);\`), \`ai:Agent\`, or an instance of your own \`isolated class\`.
    - Hint: If you use a connector or listener that defined from a Library, first assume it is isolated and the compiler will tell you if it is not. If it is not, mark the module variable as isolated and wrap all access in \`lock { }\`.
  - For such a variable, do NOT declare it \`isolated\`, do NOT wrap its use in \`lock { }\`, and do NOT add \`& readonly\`.
- \`final\` alone is still non-isolated mutable state for other types: \`final map<string>\` or \`final int[]\`.
    - Shared MUTABLE state: declare the variable \`isolated\` with an initializer (\`isolated int[] requests = [];\`) and access it ONLY inside \`lock { }\`.

### Lock statements
- ONE isolated root per lock: never access two \`isolated\` variables (or an \`isolated\` variable plus \`self\`) in the same lock. 
- Use separate locks and pass values between them via locals; if two pieces of state must change atomically, keep them in ONE protected value (a single record/map behind one isolated variable).
- Keep locks minimal: only the shared-state read/write belongs inside. NEVER perform I/O or remote calls (ex:- \`->writeMessage\`, HTTP/DB client calls, \`runtime:sleep\`) inside a lock.

### Services and classes with mutable state
Mutable fields:
  - Declare every mutable field \`private\`.
  - Initialize it with a fresh literal(\`[]\`, \`{}\`, \`new Foo()\`) or inside the init method, never with a reference to module-level mutable state.
  - Access it via \`self\` ONLY inside \`lock { }\`.
  - Fields can NEVER be \`isolated\` (compile error). \`private\` + \`lock { }\` is the field pattern.
  - Clone values that cross the lock boundary: \`.clone()\` or \`.cloneReadOnly()\`.
Concurrent dispatch: a service's resource/remote methods run concurrently only when the service AND the method are \`isolated\`.
  - Each method must also satisfy isolated rules: call only \`isolated\` functions, and never touch non-final module-level mutable state (use module-level \`isolated\` variables with \`lock { }\` instead).
  - When the field rules above and the method rules are met, the compiler infers the service and its methods as \`isolated\`. Explicit \`isolated\` qualifiers on the service and methods also work.
Helper functions:
  - A function called from an \`isolated\` function, or from inside a lock over isolated state, must itself be \`isolated\`.
  - Write helpers as \`isolated\` when they only use their parameters and local state.`;
