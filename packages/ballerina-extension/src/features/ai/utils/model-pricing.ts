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

export interface ModelPricing {
    input: number;
    cacheWrite: number;
    cacheRead: number;
    output: number;
}

// Cache-write rates are the 1-hour-TTL tier (2x input), matching getProviderCacheControl()'s default.
// Claude Haiku 5.5 bills prompts over 100K tokens at $0.50/$2.50; only its standard card is here,
// because tool-internal usage arrives summed across calls, and its calls stay far below 100K.
// Per-million-token pricing by model
const MODEL_PRICING: Record<string, ModelPricing> = {
    'claude-sonnet-5-5':            { input: 2,  cacheWrite: 4,    cacheRead: 0.20, output: 10 },
    'claude-sonnet-5':              { input: 2,  cacheWrite: 4,    cacheRead: 0.20, output: 10 },
    'claude-sonnet-4-6':            { input: 3,  cacheWrite: 6,    cacheRead: 0.30, output: 15 },
    'claude-haiku-5-5':             { input: 0.10, cacheWrite: 0.20, cacheRead: 0.01, output: 0.50 },
    'claude-haiku-4-5-20251001':    { input: 1,  cacheWrite: 2,    cacheRead: 0.10, output: 5  },
};

export interface CostInput {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}

export function calculateCost(usage: CostInput): number {
    const pricing = MODEL_PRICING[usage.model];
    if (!pricing) { return 0; }

    const cacheRead = usage.cacheReadTokens || 0;
    const cacheWrite = usage.cacheWriteTokens || 0;
    const baseInput = usage.inputTokens - cacheRead - cacheWrite;

    return (
        baseInput   * pricing.input      +
        cacheWrite  * pricing.cacheWrite  +
        cacheRead   * pricing.cacheRead   +
        usage.outputTokens * pricing.output
    ) / 1_000_000;
}
