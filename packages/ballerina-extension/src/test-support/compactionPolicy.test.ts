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

import {
    CONTEXT_PRESSURE_WARN_FRACTION,
    DEFAULT_COMPACT_TRIGGER_TOKENS,
    MAX_COMPACT_TRIGGER_TOKENS,
    MIN_COMPACT_TRIGGER_TOKENS,
    contextWindowFraction,
    resolveCompactionTrigger,
} from '../features/ai/agent/compaction-policy';

describe('resolveCompactionTrigger', () => {
    it('uses the default trigger for an ordinary workspace', () => {
        expect(resolveCompactionTrigger(0)).toBe(DEFAULT_COMPACT_TRIGGER_TOKENS);
        expect(resolveCompactionTrigger(50_000)).toBe(DEFAULT_COMPACT_TRIGGER_TOKENS);
    });

    it('keeps the default while the floor still leaves headroom under it', () => {
        // 300K * 1.5 = 450K, still below the 500K default.
        expect(resolveCompactionTrigger(300_000)).toBe(DEFAULT_COMPACT_TRIGGER_TOKENS);
    });

    it('raises the trigger above a large floor instead of disabling compaction', () => {
        // The old behaviour disabled compaction outright at this floor.
        expect(resolveCompactionTrigger(400_000)).toBe(600_000);
        expect(resolveCompactionTrigger(500_000)).toBe(750_000);
    });

    it('always returns a trigger that clears the floor', () => {
        for (const floor of [0, 100_000, 350_000, 400_000, 500_000, 533_000]) {
            const trigger = resolveCompactionTrigger(floor);
            if (trigger !== null) {
                expect(trigger).toBeGreaterThan(floor);
            }
        }
    });

    it('never exceeds the ceiling that leaves room for the summary and output', () => {
        for (const floor of [0, 250_000, 533_000]) {
            const trigger = resolveCompactionTrigger(floor);
            if (trigger !== null) {
                expect(trigger).toBeLessThanOrEqual(MAX_COMPACT_TRIGGER_TOKENS);
                expect(trigger).toBeGreaterThanOrEqual(MIN_COMPACT_TRIGGER_TOKENS);
            }
        }
    });

    it('gives up only when the fixed per-turn cost is close to the window', () => {
        // Above ~533K the headroom pushes past the ceiling — and that cost is not compactable.
        expect(resolveCompactionTrigger(534_000)).toBeNull();
        expect(resolveCompactionTrigger(900_000)).toBeNull();
    });
});

describe('contextWindowFraction', () => {
    it('reports the share of the window used', () => {
        expect(contextWindowFraction(500_000)).toBeCloseTo(0.5);
        expect(contextWindowFraction(1_000_000)).toBeCloseTo(1);
    });

    it('warns only after the default trigger has had its chance', () => {
        // Warning below the trigger would fire on healthy threads about to be compacted.
        expect(CONTEXT_PRESSURE_WARN_FRACTION * 1_000_000).toBeGreaterThan(DEFAULT_COMPACT_TRIGGER_TOKENS);
    });
});
