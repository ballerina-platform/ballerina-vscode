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
    DEACTIVATION_STEP_TIMEOUT_MS,
    LANG_CLIENT_STOP_TIMEOUT_MS,
    runDeactivation,
} from '../core/deactivation';

// Invariant under test: whatever the other disposers do (throw, hang, or succeed), the language client is
// stopped first and every remaining step still runs. An orphaned language-server JVM is the failure mode this
// guards against — on a window reload VS Code gives deactivate almost no time, and a server that never receives
// `exit` lingers with its full heap.

describe('runDeactivation', () => {
    const noWarn = () => undefined;

    function recorder() {
        const order: string[] = [];
        return {
            order,
            step: (name: string) => async () => {
                order.push(name);
            },
        };
    }

    it('stops the language client before anything else', async () => {
        const { order, step } = recorder();

        await runDeactivation({
            stopLanguageClient: step('client'),
            disposeTelemetry: () => {
                order.push('telemetry');
            },
            disposeRunningServices: step('services'),
        }, noWarn);

        expect(order).toEqual(['client', 'telemetry', 'services']);
    });

    it('passes the stop timeout through to the client so the server process is killed on a hang', async () => {
        const seen: number[] = [];

        await runDeactivation({
            stopLanguageClient: async (timeoutMs) => {
                seen.push(timeoutMs);
            },
            disposeRunningServices: async () => undefined,
        }, noWarn);

        expect(seen).toEqual([LANG_CLIENT_STOP_TIMEOUT_MS]);
    });

    it('skips the client steps when no client was started, but still disposes running services', async () => {
        const { order, step } = recorder();

        await runDeactivation({ disposeRunningServices: step('services') }, noWarn);

        expect(order).toEqual(['services']);
    });

    describe.each([
        ['throws', async () => {
            throw new Error('boom');
        }],
        ['rejects', () => Promise.reject(new Error('boom'))],
    ])('when a step %s', (_label, failing) => {
        it('reports it and still runs the remaining steps', async () => {
            const { order, step } = recorder();
            const warnings: string[] = [];

            await runDeactivation({
                stopLanguageClient: failing,
                disposeTelemetry: () => {
                    throw new Error('telemetry boom');
                },
                disposeRunningServices: step('services'),
            }, (message) => warnings.push(message));

            expect(order).toEqual(['services']);
            expect(warnings).toHaveLength(2);
            expect(warnings[0]).toContain('language client stop');
            expect(warnings[1]).toContain('telemetry dispose');
        });
    });

    it('gives up on a hanging step after its timeout and still runs the rest', async () => {
        jest.useFakeTimers();
        try {
            const { order, step } = recorder();
            const warnings: string[] = [];
            const never = new Promise<void>(() => undefined);

            const done = runDeactivation({
                stopLanguageClient: () => never,
                disposeRunningServices: step('services'),
            }, (message) => warnings.push(message));

            // The client gets its own stop timeout plus the generic step bound before deactivation moves on.
            await jest.advanceTimersByTimeAsync(LANG_CLIENT_STOP_TIMEOUT_MS + DEACTIVATION_STEP_TIMEOUT_MS);
            await done;

            expect(order).toEqual(['services']);
            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toMatch(/language client stop.*did not finish/);
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not warn when every step completes', async () => {
        const warnings: string[] = [];

        await runDeactivation({
            stopLanguageClient: async () => undefined,
            disposeTelemetry: () => undefined,
            disposeRunningServices: async () => undefined,
        }, (message) => warnings.push(message));

        expect(warnings).toEqual([]);
    });
});
