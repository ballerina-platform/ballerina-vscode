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
export const MODULE_INIT_CODING_RULES = `- Prefer initializing module-level variables at their declaration. When a value can only be built inside the module \`init()\` function (e.g. an \`ai:Agent\` whose construction can fail), declare the variable \`final\` (drop \`final\` only if it is reassigned after \`init()\`) without an initializer and assign it in \`init()\` exactly once, unconditionally, on every execution path — never only inside an \`if\`/\`match\` branch or a loop — otherwise the compiler reports the variable as uninitialized.
- \`init()\` runs AFTER every module-level variable initializer and service/listener declaration has been evaluated. A module-level initializer, listener argument, or service declaration must never read a variable that is only assigned inside \`init()\`.`;
