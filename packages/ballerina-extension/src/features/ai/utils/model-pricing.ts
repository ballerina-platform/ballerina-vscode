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

// Cache-write rates are the 5-minute-TTL tier, matching getProviderCacheControl().
// Per-million-token pricing by model
const MODEL_PRICING: Record<string, ModelPricing> = {
    'claude-sonnet-5':              { input: 2,  cacheWrite: 2.50, cacheRead: 0.20, output: 10 },
    'claude-sonnet-4-6':            { input: 3,  cacheWrite: 3.75, cacheRead: 0.30, output: 15 },
    'claude-haiku-4-5-20251001':    { input: 1,  cacheWrite: 1.25, cacheRead: 0.10, output: 5  },
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
