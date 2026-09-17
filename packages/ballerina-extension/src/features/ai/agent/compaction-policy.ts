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

/** Where to set the server-side compaction trigger. Pure and import-free, so it is testable. */

const CONTEXT_WINDOW_TOKENS = 1_000_000;

/** Higher than MI's 200K because BI re-sends the whole project source each turn. */
export const DEFAULT_COMPACT_TRIGGER_TOKENS = 500_000;

/** Anthropic rejects a trigger below this. */
export const MIN_COMPACT_TRIGGER_TOKENS = 50_000;

/** Leaves ~200K of the window for the summary, the turn's tool results and reserved output. */
export const MAX_COMPACT_TRIGGER_TOKENS = 800_000;

/**
 * The floor — system prompt, tool definitions, codebase dump — is re-sent every request and is not
 * compactable, so a trigger at or below it would fire every turn against empty history.
 */
const FLOOR_HEADROOM = 1.5;

/**
 * Resolves the trigger, or `null` when the fixed per-turn cost is itself near the window.
 *
 * A large floor used to disable compaction for the whole session — a cliff that cost the largest
 * workspaces the very thing they needed most (#2317). Raising the trigger keeps it working.
 */
export function resolveCompactionTrigger(floorTokens: number): number | null {
    const wanted = Math.max(DEFAULT_COMPACT_TRIGGER_TOKENS, Math.ceil(floorTokens * FLOOR_HEADROOM));
    if (wanted > MAX_COMPACT_TRIGGER_TOKENS) {
        return null;
    }
    return Math.max(MIN_COMPACT_TRIGGER_TOKENS, wanted);
}

/** Share of the window a turn's input occupied, against the window the context widget renders. */
export function contextWindowFraction(inputTokens: number): number {
    return inputTokens / CONTEXT_WINDOW_TOKENS;
}

/** Past the default trigger on purpose: below it compaction still has room to work silently. */
export const CONTEXT_PRESSURE_WARN_FRACTION = 0.8;
