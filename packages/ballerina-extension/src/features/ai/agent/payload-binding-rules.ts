/**
 * System-prompt rules for binding external JSON payloads.
 *
 * Copilot library testing produced runtime failures when generated code bound
 * third-party JSON payloads (e.g. AWS S3 event notifications delivered over
 * SQS) to CLOSED records missing real provider fields: cloneWithType /
 * fromJsonStringWithType fail the moment the source carries a field the
 * closed record does not declare.
 *
 * Kept in its own module (no imports) so it can be unit-tested without loading
 * the extension-host module graph. Interpolated into the system prompt by
 * getSystemPrompt() in ./prompts.ts.
 */
export const EXTERNAL_PAYLOAD_BINDING_RULES = `- Use closed records (\`record {| ... |}\`) only for data whose shape you fully control (your own request/response contracts). For JSON produced by an EXTERNAL system you do not control (cloud events such as AWS S3/SQS notifications, webhooks, third-party API responses), define OPEN records (\`record { ... }\`) so fields you did not model land in the rest field instead of failing the conversion — \`cloneWithType\`/\`fromJsonStringWithType\` fail at runtime when the source carries ANY field a closed record lacks. Model only the fields you need, and mark fields the provider may omit as optional (\`fieldName?\`).`;
