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
 * System-prompt rules for module-level variable initialization ordering.
 *
 * Copilot library testing produced compile errors ("uninitialized variable
 * 'supportTicketAgent'") when generated code declared a module-level variable
 * without an initializer and assigned it in init() in a way the dataflow
 * analyzer could not prove — or read it from a module-level initializer, which
 * is evaluated before init() runs.
 *
 * Kept in its own module (no imports) so it can be unit-tested without loading
 * the extension-host module graph. Interpolated into the system prompt by
 * getSystemPrompt() in ./prompts.ts.
 */
export const MODULE_INIT_CODING_RULES = `## Module-level initialization
- Prefer initializing module-level variables at their declaration.
- When a value can only be built inside the module \`init()\` function.
  - Declare the variable without an initializer, as \`final\`; drop \`final\` only if it is reassigned after \`init()\`.
  - Assign it in the \`init()\` function. If there is a conditinal assignement needed, Assign it in every branch of the conditional. Otherwise the compiler reports the variable as uninitialized.
`;
