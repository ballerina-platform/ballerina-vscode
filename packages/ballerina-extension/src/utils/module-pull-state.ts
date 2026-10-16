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

/** Token prefix of the LS's module-pull work-done progress (`PullModuleExecutor`). */
const PULL_MODULE_TOKEN_PREFIX = "pull-module-";

/**
 * How long a pull counts as running without its `end`, and how long a single wait keeps being
 * extended. The LS can fail to send `end` (it restarts, or the pull task throws before reaching it).
 * A wait that is extended near this limit still gets its full delay, so it ends by this limit plus
 * one delay at the latest. Observed first-save pulls took 8–71 s; past two minutes a timeout is
 * more useful to the user than a longer spinner.
 */
export const MAX_MODULE_PULL_WAIT_MS = 2 * 60 * 1000;

export type ProgressKind = "begin" | "report" | "end";

/** Running pulls by token, with when each began. */
const activePulls = new Map<string, number>();
const listeners = new Set<(kind: ProgressKind) => void>();

/**
 * Feeds a work-done progress update from the LS. Called from the language client's
 * `handleWorkDoneProgress` middleware, which sees every update without replacing the client's
 * own `$/progress` dispatch.
 */
export function trackModulePullProgress(token: string | number, kind: ProgressKind): void {
    if (typeof token !== "string" || !token.startsWith(PULL_MODULE_TOKEN_PREFIX)) {
        return;
    }
    if (kind === "begin") {
        activePulls.set(token, Date.now());
    } else if (kind === "end") {
        activePulls.delete(token);
    }
    listeners.forEach(listener => listener(kind));
}

/**
 * The language client's `handleWorkDoneProgress` middleware: records module-pull progress, then
 * always passes the update on, so a failing pull listener can't stop progress reaching the client.
 */
export function forwardWorkDoneProgress<P extends { kind: ProgressKind }>(
    token: string | number,
    params: P,
    next: (token: string | number, params: P) => void
): void {
    try {
        trackModulePullProgress(token, params.kind);
    } finally {
        next(token, params);
    }
}

export function isModulePullInProgress(): boolean {
    // Forget pulls whose `end` was lost, so they don't stretch every later wait.
    const now = Date.now();
    activePulls.forEach((beganAt, token) => {
        if (now - beganAt >= MAX_MODULE_PULL_WAIT_MS) {
            activePulls.delete(token);
        }
    });
    return activePulls.size > 0;
}

/** Listens to module-pull progress updates; returns the function that stops listening. */
export function onModulePullProgress(listener: (kind: ProgressKind) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export interface PullAwareTimeout {
    cancel: () => void;
}

/**
 * Calls `onTimeout` after `ms` without a module pull running. While the LS pulls modules, the
 * countdown starts over each time it runs out, and again in full when a pull ends. It stops being
 * extended {@link MAX_MODULE_PULL_WAIT_MS} after the start, so `onTimeout` runs by that limit plus
 * `ms` at the latest. The last delay is not shortened to fit the limit: a pull ending just before
 * it would otherwise leave the LS almost no time to publish.
 */
export function startPullAwareTimeout(onTimeout: () => void, ms: number): PullAwareTimeout {
    const startedAt = Date.now();
    const withinCap = () => Date.now() - startedAt < MAX_MODULE_PULL_WAIT_MS;
    let timeoutId: ReturnType<typeof setTimeout>;
    const arm = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            if (isModulePullInProgress() && withinCap()) {
                arm();
                return;
            }
            stopListening();
            onTimeout();
        }, ms);
    };
    // A pull that ends just before the countdown runs out would leave the LS almost no time to
    // publish what it was waiting on, so give it the full delay again.
    const stopListening = onModulePullProgress(kind => {
        if (kind === "end" && withinCap()) {
            arm();
        }
    });
    arm();
    return {
        cancel: () => {
            clearTimeout(timeoutId);
            stopListening();
        }
    };
}
