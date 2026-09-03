/**
 * System-prompt rule for exhausting paginated connector APIs.
 *
 * Copilot library testing produced silently truncated results: generated code
 * called paginated list APIs once with the connector's defaulted page size
 * (e.g. the GitHub connector's per_page = 30, always sent), so a changelog
 * that required every commit contained only the first 30.
 *
 * Kept in its own module (no imports) so it can be unit-tested without loading
 * the extension-host module graph. Interpolated into the system prompt by
 * getSystemPrompt() in ./prompts.ts.
 */
export const PAGINATION_LIBRARY_RULE = `- When a function or resource signature exposes pagination parameters (\`page\`, \`per_page\`/\`perPage\`, \`pageSize\`, \`limit\`/\`offset\`, or a cursor/next-token) and the requirement is to process ALL results, never rely on a single call or the parameter defaults — defaults silently cap the result set (e.g. 30 items per page). Loop: request the documented maximum page size, advance the page/cursor, and stop only when a page comes back short or empty (or no next-cursor is returned), aggregating the results.`;
