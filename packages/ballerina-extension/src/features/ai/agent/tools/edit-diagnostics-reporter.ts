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
 * The per-run reporter behind each file edit's `<new-diagnostics>` block. Import-light on purpose:
 * the language-server call is passed in, so unit tests drive it without the LS or vscode.
 */

import * as path from 'path';
import { affectsCompilation, DeliveredTracker, FileDiagnostics, findPackageRoot, formatNewDiagnostics, pathKey } from './new-diagnostics';

/** Reads a package's diagnostics from the language server. */
export type PackageCheck = (packageRoot: string) => Promise<FileDiagnostics[]>;

export interface ReporterTimings {
    /**
     * How long one check may take once it starts. The language server compiles incrementally from
     * the project it already holds, so this is normally milliseconds.
     */
    checkMs: number;
    /** How long a check may wait behind earlier checks of the same package before it gives up. */
    queueMs: number;
}

export const DEFAULT_REPORTER_TIMINGS: ReporterTimings = { checkMs: 20_000, queueMs: 60_000 };

/** The promise's value, or undefined once `ms` pass first; the timer is always cleared. */
export async function resolveWithin<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([promise, new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ms); })]);
    } finally {
        clearTimeout(timer);
    }
}

/** One run's view of which compiler errors the model has already been shown. */
export interface EditDiagnosticsReporter {
    /**
     * Called before an edit is written. The first edit to a package in the run waits here while the
     * package's current errors are recorded as already known, so the edit reports only what it adds.
     */
    beforeEdit(filePath: string): Promise<void>;
    /**
     * The `<new-diagnostics>` block for errors in the edited file's package that this run has not
     * delivered yet, a note when they could not be read, or undefined when there are none.
     */
    afterEdit(filePath: string): Promise<string | undefined>;
    /** Records a package's diagnostics the model saw some other way (the diagnostics tool) as delivered. */
    recordDelivered(diagnostics: FileDiagnostics[], packageRoot: string): void;
}

export function createEditDiagnosticsReporter(
    projectRoot: string,
    check: PackageCheck,
    diagnosticsToolName: string,
    timings: ReporterTimings = DEFAULT_REPORTER_TIMINGS,
): EditDiagnosticsReporter {
    const tracker = new DeliveredTracker();
    // One language-server check at a time per package, each starting after the one before it has
    // answered: its result then includes every edit that landed first, and parallel edits or a
    // check that outlives its budget never pile compiles onto the server.
    const lastCheck = new Map<string, Promise<unknown>>();
    // The baseline read of each package this run, started by its first edit.
    const baselines = new Map<string, Promise<void>>();

    /**
     * Queues a check of the package. It resolves to the diagnostics, or undefined when the check
     * itself runs past `checkMs` (timed from its own start, not from when it was queued) or waits
     * past `queueMs` to start.
     */
    const queueCheck = (packageRoot: string): Promise<FileDiagnostics[] | undefined> => {
        const previous = lastCheck.get(packageRoot) ?? Promise.resolve();
        const current = previous.then(() => check(packageRoot));
        lastCheck.set(packageRoot, current.catch(() => undefined));
        return resolveWithin(previous.then(() => resolveWithin(current, timings.checkMs)), timings.queueMs);
    };

    /** Said in place of the block when the check did not complete, so a missing block always means no new errors. */
    const uncheckedNote = (reason: string) =>
        `Compiler errors were not checked after this edit: ${reason}. Call ${diagnosticsToolName} before treating the code as compiling.`;

    const packageOf = (filePath: string) => {
        const absolute = path.resolve(projectRoot, filePath);
        return { absolute, packageRoot: findPackageRoot(absolute, projectRoot) };
    };

    return {
        async beforeEdit(filePath: string): Promise<void> {
            if (!affectsCompilation(filePath)) {
                return;
            }
            const { packageRoot } = packageOf(filePath);
            if (!packageRoot) {
                return;
            }
            let baseline = baselines.get(packageRoot);
            if (!baseline) {
                // Without a baseline (it failed or ran out of time) the edit reports every error, as before.
                baseline = queueCheck(packageRoot)
                    .then(diagnostics => { if (diagnostics) { tracker.takeNew(diagnostics, packageRoot); } })
                    .catch(error => console.warn(`[EditDiagnostics] Could not read the baseline for ${packageRoot}:`, error));
                baselines.set(packageRoot, baseline);
            }
            await baseline;
        },
        async afterEdit(filePath: string): Promise<string | undefined> {
            if (!affectsCompilation(filePath)) {
                return undefined;
            }
            const { absolute, packageRoot } = packageOf(filePath);
            if (!packageRoot) {
                return uncheckedNote('the file is not inside a Ballerina package yet (no Ballerina.toml above it)');
            }
            tracker.clear(pathKey(absolute));
            try {
                const diagnostics = await queueCheck(packageRoot);
                if (!diagnostics) {
                    console.warn(`[EditDiagnostics] No diagnostics for ${filePath} in time`);
                    return uncheckedNote(`the language server did not answer within ${timings.checkMs / 1000} s`);
                }
                return formatNewDiagnostics(tracker.takeNew(diagnostics, packageRoot), projectRoot);
            } catch (error) {
                // A package that cannot compile at all is the diagnostics tool's to explain.
                console.warn(`[EditDiagnostics] Could not read diagnostics after editing ${filePath}:`, error);
                return uncheckedNote('the package could not be compiled');
            }
        },
        recordDelivered(diagnostics: FileDiagnostics[], packageRoot: string): void {
            tracker.takeNew(diagnostics, packageRoot);
        },
    };
}

/**
 * Wraps a file tool's execute so a successful result also carries the compiler errors the edit newly
 * surfaced. The report runs after the tool returns, and so after its file lock is released: a slow
 * compile never holds up the next edit to the same file.
 */
export function withEditDiagnostics<A extends { file_path: string }, R extends { success: boolean; message: string }>(
    reporter: EditDiagnosticsReporter | undefined,
    execute: (args: A) => Promise<R>
): (args: A) => Promise<R> {
    if (!reporter) {
        return execute;
    }
    return async (args) => {
        await reporter.beforeEdit(args.file_path);
        const result = await execute(args);
        const block = result.success ? await reporter.afterEdit(args.file_path) : undefined;
        return block ? { ...result, message: `${result.message}\n\n${block}` } : result;
    };
}
