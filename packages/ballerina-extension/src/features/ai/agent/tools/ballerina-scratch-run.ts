// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { tool } from 'ai';
import { z } from 'zod';
import { CopilotEventHandler } from '../../utils/events';
import { extension } from '../../../../BalExtensionContext';
import { spawnProcess, killProcessGroup } from './running-service-manager';
import { BALLERINA_COMMANDS } from '../../../project/cmds/cmd-runner';
import { resolvePackageBasePath } from './path-utils';
import { DIAGNOSTICS_TOOL_NAME } from './diagnostics';

export const BALLERINA_SCRATCH_RUN_TOOL_NAME = "runBallerinaScratch";

const SCRATCH_TEST_FILE = "scratch_run_test.bal";
const SCRATCH_TEST_FUNCTION = "scratchRun";

/** Skipped when copying: `target` is build output keyed to the original path, and both are large. */
const EXCLUDED_COPY_DIRS = new Set(['target', '.git']);

const DEFAULT_SCRATCH_TIMEOUT = 180000;

export interface ScratchRunResult {
    status: 'completed' | 'error' | 'timeout';
    exitCode: number;
    output: string;
    message: string;
    /** The exact file the snippet was compiled into, so the agent can map errors back. */
    scratchFile?: string;
}

const ScratchRunInputSchema = z.object({
    code: z.string().min(1).describe(
        "Ballerina statements to execute, as they would appear inside a function body. " +
        "The package's module-level declarations (clients, configurables, types, functions) are " +
        "already in scope — do not redeclare them. Use io:println to report what you want to see. " +
        "The enclosing function returns error?, so `check` is available."
    ),
    imports: z.array(z.string()).optional().describe(
        "Modules the snippet needs, as import paths without the `import` keyword or the trailing " +
        "semicolon (e.g. \"ballerina/io\", \"myPackage.fooApi\"). ballerina/test is always imported. " +
        "Only list modules the snippet actually uses — an unused import is a compilation error."
    ),
    declarations: z.string().optional().describe(
        "Optional module-level declarations the snippet needs (records, constants, helper functions). " +
        "Leave empty unless the snippet cannot be written without them."
    ),
    packagePath: z.string().optional().describe(
        "Relative path to the package directory from the project root. Leave empty for the default/root package."
    ),
    timeout: z.number().optional().describe(
        `Timeout in milliseconds. Default: ${DEFAULT_SCRATCH_TIMEOUT}. The run includes a build, so keep it generous.`
    ),
});

export function createBallerinaScratchRunTool(
    tempProjectPath: string,
    eventHandler: CopilotEventHandler
) {
    return tool({
        description: `Runs a throwaway Ballerina snippet against this project **without modifying it**.

The snippet is compiled into a temporary copy of the project as a test case and executed with \`bal test\`, then the copy is discarded. The real project is never touched: no file is added, and the package's own \`main\` function is left alone.

**Use this to verify behaviour you cannot confirm by reading code** — that a connector call returns what you expect, that a transformation produces the right shape, that a configurable is wired correctly. Prefer it over adding a temporary \`main\` function or test file to the project and then cleaning it up.

**Scope:** the snippet runs inside the package's test scope, so everything declared at module level in the package (clients, configurables, types, functions) is directly in scope with no import. Import only external modules and the package's own submodules.

**Prerequisites:** the project must compile cleanly — run \`${DIAGNOSTICS_TOOL_NAME}\` and fix errors first. Compilation errors reported here are errors in the snippet or in the package, not in the harness.

**Note:** the snippet runs for real. It will make live network calls and use real credentials from the project's configuration, exactly as the package itself would.

**REQUIRED before calling this tool:** You MUST tell the user what you are about to run and why.
`,
        inputSchema: ScratchRunInputSchema,
        execute: async (input, context?: { toolCallId?: string }): Promise<ScratchRunResult> => {
            const toolCallId = context?.toolCallId || `fallback-${Date.now()}`;

            eventHandler({
                type: "tool_call",
                toolName: BALLERINA_SCRATCH_RUN_TOOL_NAME,
                toolCallId,
                toolInput: { command: "bal test", scratch: true },
            });

            const result = await executeScratchRun(input, tempProjectPath);

            eventHandler({
                type: "tool_result",
                toolName: BALLERINA_SCRATCH_RUN_TOOL_NAME,
                toolCallId,
                toolOutput: { status: result.status, command: "bal test", exitCode: result.exitCode, output: result.output },
            });

            return result;
        }
    });
}

/**
 * Renders the snippet as a test, not a `main`: a package may declare only one `main`, and
 * `bal run` on a package that declares services never terminates. `bal test` has neither problem.
 */
export function buildScratchTestSource(input: {
    code: string;
    imports?: string[];
    declarations?: string;
}): string {
    const imports = ['ballerina/test', ...(input.imports ?? [])]
        // The model tends to send back the full statement despite the schema; accept both.
        .map(entry => entry.trim().replace(/^import\s+/, '').replace(/;$/, '').trim())
        .filter(entry => entry.length > 0);

    const seen = new Set<string>();
    const importLines = imports
        .filter(entry => (seen.has(entry) ? false : (seen.add(entry), true)))
        .map(entry => `import ${entry};`)
        .join('\n');

    const declarations = input.declarations?.trim() ? `\n${input.declarations.trim()}\n` : '';
    const body = input.code.replace(/\r\n/g, '\n').split('\n').map(line => `    ${line}`).join('\n');

    return `${importLines}
${declarations}
@test:Config {}
function ${SCRATCH_TEST_FUNCTION}() returns error? {
${body}
}
`;
}

/** Copies the whole project root, not just the target package, so workspace siblings resolve. */
async function copyProjectForScratch(projectRoot: string): Promise<string> {
    const projectHash = crypto.createHash('sha256').update(projectRoot).digest('hex').slice(0, 16);
    const scratchRoot = path.join(
        os.tmpdir(),
        `bal-scratch-${projectHash}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    );
    const normalizedRoot = path.resolve(projectRoot);

    await fs.promises.cp(projectRoot, scratchRoot, {
        recursive: true,
        filter: (source: string) => {
            const relative = path.relative(normalizedRoot, path.resolve(source));
            if (!relative) {
                return true;
            }
            return !relative.split(path.sep).some(segment => EXCLUDED_COPY_DIRS.has(segment));
        },
    });

    return scratchRoot;
}

/**
 * Drops the copy's own test sources so a pre-existing failing suite cannot decide the outcome of
 * an unrelated scratch run. Non-`.bal` files (tests/Config.toml, resources) are kept.
 */
function clearCopiedTestSources(testsDir: string): void {
    if (!fs.existsSync(testsDir)) {
        return;
    }
    for (const entry of fs.readdirSync(testsDir, { withFileTypes: true })) {
        const entryPath = path.join(testsDir, entry.name);
        if (entry.isDirectory()) {
            clearCopiedTestSources(entryPath);
        } else if (entry.isFile() && entry.name.endsWith('.bal')) {
            fs.rmSync(entryPath, { force: true });
        }
    }
}

export async function executeScratchRun(
    input: z.infer<typeof ScratchRunInputSchema>,
    tempProjectPath: string
): Promise<ScratchRunResult> {
    // Validated against the real project before anything is copied.
    let packageRelative: string;
    try {
        const resolved = resolvePackageBasePath(tempProjectPath, input.packagePath);
        packageRelative = path.relative(path.resolve(tempProjectPath), resolved);
    } catch (e: any) {
        console.error("[BallerinaScratchRun] Invalid packagePath:", e?.message);
        return {
            status: "error",
            exitCode: -1,
            output: "",
            message: e?.message ?? "Invalid packagePath",
        };
    }

    let scratchRoot: string | undefined;
    try {
        scratchRoot = await copyProjectForScratch(tempProjectPath);
        const scratchPackage = path.join(scratchRoot, packageRelative);
        const testsDir = path.join(scratchPackage, 'tests');

        clearCopiedTestSources(testsDir);
        fs.mkdirSync(testsDir, { recursive: true });
        fs.writeFileSync(path.join(testsDir, SCRATCH_TEST_FILE), buildScratchTestSource(input), 'utf8');

        const timeout = input.timeout ?? DEFAULT_SCRATCH_TIMEOUT;
        const run = await runScratchTest(scratchPackage, timeout);
        const scratchFile = path.posix.join('tests', SCRATCH_TEST_FILE);

        if (run.timedOut) {
            return {
                status: "timeout",
                exitCode: -1,
                output: run.output,
                message: `The scratch run did not finish within ${timeout}ms. If the snippet waits on something slow, raise the timeout; otherwise it may be blocked.`,
                scratchFile,
            };
        }

        return {
            status: run.exitCode === 0 ? "completed" : "error",
            exitCode: run.exitCode,
            output: run.output,
            message: run.exitCode === 0
                ? "Scratch run completed. The project was not modified."
                : `The scratch run failed. Compilation errors reported against '${scratchFile}' are in the snippet you supplied; errors against any other file are in the package. The project was not modified.`,
            scratchFile,
        };
    } catch (error) {
        console.error("[BallerinaScratchRun] Failed:", error);
        return {
            status: "error",
            exitCode: -1,
            output: "",
            message: `Could not run the scratch snippet: ${error instanceof Error ? error.message : String(error)}`,
        };
    } finally {
        if (scratchRoot) {
            try {
                fs.rmSync(scratchRoot, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error(`[BallerinaScratchRun] Failed to remove scratch copy at ${scratchRoot}:`, cleanupError);
            }
        }
    }
}

async function runScratchTest(cwd: string, timeout: number): Promise<{ output: string; exitCode: number; timedOut: boolean }> {
    const balCmd = extension.ballerinaExtInstance.getBallerinaCmd();
    const logs: string[] = [];
    const { process: proc } = spawnProcess(
        balCmd,
        [BALLERINA_COMMANDS.TEST, '--tests', SCRATCH_TEST_FUNCTION],
        cwd,
        logs
    );

    let exited = false;
    let exitCode = -1;
    proc.on('close', (code) => {
        exitCode = code ?? -1;
        exited = true;
    });
    proc.on('error', (err) => {
        logs.push(`\nFailed to start process: ${err.message}\n`);
        exited = true;
    });

    const startTime = Date.now();
    while (!exited && (Date.now() - startTime) < timeout) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!exited) {
        await killProcessGroup(proc, 'SIGTERM');
        return { output: logs.join(''), exitCode: -1, timedOut: true };
    }

    return { output: logs.join(''), exitCode, timedOut: false };
}
