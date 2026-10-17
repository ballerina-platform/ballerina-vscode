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

// The extension's shutdown sequence, kept free of VS Code imports so it can run under jest.
// `extension.ts` wires the real language client and managers into `runDeactivation`.

/**
 * How long the language client gets to complete its `shutdown`/`exit` exchange before the server process is
 * killed. `LanguageClient.stop(timeout)` races the exchange against this and kills the child afterwards, so the
 * value bounds the whole step rather than only the request.
 */
export const LANG_CLIENT_STOP_TIMEOUT_MS = 3000;

/** Upper bound on every other step, so no single disposer can stall deactivation. */
export const DEACTIVATION_STEP_TIMEOUT_MS = 2000;

export interface DeactivationSteps {
    /**
     * Stops the language client, which ends the language-server JVM. Undefined when no client was ever started.
     * Runs first: VS Code gives `deactivate` very little time on a window reload, and an orphaned server JVM
     * holds a gigabyte of heap until the machine goes down, so nothing may run ahead of it.
     */
    stopLanguageClient?: (timeoutMs: number) => Promise<unknown>;
    /** Flushes telemetry. Only meaningful once a client existed. */
    disposeTelemetry?: () => void;
    /** Kills the services the AI agent started on the user's behalf. */
    disposeRunningServices: () => Promise<unknown>;
}

/**
 * Runs the deactivation steps in order. Every step is isolated: a throwing or hanging step is reported through
 * `warn` and the remaining steps still run, so a stuck disposer can never leave the language server alive.
 */
export async function runDeactivation(
    steps: DeactivationSteps,
    warn: (message: string) => void = () => undefined,
): Promise<void> {
    if (steps.stopLanguageClient) {
        await runStep('language client stop', () => steps.stopLanguageClient!(LANG_CLIENT_STOP_TIMEOUT_MS),
            LANG_CLIENT_STOP_TIMEOUT_MS + DEACTIVATION_STEP_TIMEOUT_MS, warn);
    }
    if (steps.disposeTelemetry) {
        await runStep('telemetry dispose', async () => steps.disposeTelemetry!(), DEACTIVATION_STEP_TIMEOUT_MS, warn);
    }
    await runStep('running services dispose', steps.disposeRunningServices, DEACTIVATION_STEP_TIMEOUT_MS, warn);
}

async function runStep(
    name: string,
    step: () => Promise<unknown>,
    timeoutMs: number,
    warn: (message: string) => void,
): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    try {
        const outcome = await Promise.race([Promise.resolve().then(step).then(() => 'done' as const), timeout]);
        if (outcome === 'timeout') {
            warn(`Deactivation step '${name}' did not finish within ${timeoutMs}ms; continuing.`);
        }
    } catch (error) {
        warn(`Deactivation step '${name}' failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}
