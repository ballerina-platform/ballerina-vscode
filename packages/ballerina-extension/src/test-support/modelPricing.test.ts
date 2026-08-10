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
 * @jest-environment node
 *
 * calculateCost returns 0 for any model missing from the pricing table, so a wrong or
 * absent key reports every turn as free rather than failing. Sonnet 5 compounds that:
 * it is published as two price rows with a dated cutover, so the same key needs
 * different rates either side of 2026-09-01.
 */

import { calculateCost } from '../features/ai/utils/model-pricing';

const MTOK = 1_000_000;
const DURING_LAUNCH = Date.parse('2026-08-15T00:00:00Z');
const AFTER_CUTOVER = Date.parse('2026-09-01T00:00:00Z');

function at<T>(instant: number, fn: () => T): T {
    const spy = jest.spyOn(Date, 'now').mockReturnValue(instant);
    try { return fn(); } finally { spy.mockRestore(); }
}

const rates = (model: string) => ({
    input: calculateCost({ model, inputTokens: MTOK, outputTokens: 0 }),
    output: calculateCost({ model, inputTokens: 0, outputTokens: MTOK }),
    cacheWrite: calculateCost({ model, inputTokens: MTOK, outputTokens: 0, cacheWriteTokens: MTOK }),
    cacheRead: calculateCost({ model, inputTokens: MTOK, outputTokens: 0, cacheReadTokens: MTOK }),
});

describe('claude-sonnet-5 pricing', () => {
    it('uses launch rates before the cutover', () => {
        expect(at(DURING_LAUNCH, () => rates('claude-sonnet-5')))
            .toEqual({ input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 });
    });

    it('uses standard rates from the cutover onward', () => {
        expect(at(AFTER_CUTOVER, () => rates('claude-sonnet-5')))
            .toEqual({ input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 });
    });

    it('switches exactly at the boundary, not a day early or late', () => {
        expect(at(AFTER_CUTOVER - 1, () => rates('claude-sonnet-5')).input).toBe(2);
        expect(at(AFTER_CUTOVER, () => rates('claude-sonnet-5')).input).toBe(3);
    });

    it('is never priced at zero, in either window', () => {
        for (const instant of [DURING_LAUNCH, AFTER_CUTOVER]) {
            expect(at(instant, () => rates('claude-sonnet-5')).input).toBeGreaterThan(0);
        }
    });
});

describe('other models in the pricing table', () => {
    it('prices claude-sonnet-4-6 at its published rates', () => {
        expect(rates('claude-sonnet-4-6')).toEqual({ input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 });
    });

    it('prices claude-haiku-4-5-20251001 at its published rates', () => {
        expect(rates('claude-haiku-4-5-20251001')).toEqual({ input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 });
    });

    it('reports an unknown model as zero, which is why the key has to be right', () => {
        expect(calculateCost({ model: 'claude-sonnet-4-5', inputTokens: MTOK, outputTokens: MTOK })).toBe(0);
    });
});
