import { tool } from 'ai';
import { z } from 'zod';
import { checkCompilationErrors, DiagnosticsCheckResult } from './diagnostics-utils';
import { resolvePackageBasePath } from './path-utils';
import { CopilotEventHandler } from '../../utils/events';

export const DIAGNOSTICS_TOOL_NAME = "getCompilationErrors";

/**
 * Input schema for the diagnostics tool
 */
const DiagnosticsInputSchema = z.object({
    packagePath: z.string().optional().describe(
        "Relative path to the package within the workspace project. " +
        "Required for workspace projects - call this tool once per modified package. " +
        "Omit for single-package (non-workspace) projects."
    ),
});

/**
 * Creates the compilation errors checking tool
 *
 * This tool checks the current Ballerina package for compilation errors using the language server.
 * It operates on all files in the current project/package being modified.
 *
 * @param tempProjectPath - Path to the project root (the real workspace/project directory)
 * @param eventHandler - Event handler to emit tool execution events to the visualizer
 * @returns Tool instance for checking compilation errors
 */
export function createDiagnosticsTool(
    tempProjectPath: string,
    eventHandler: CopilotEventHandler
) {
    return tool({
        description: `Checks the compilation errors in the current Ballerina package.

Use this tool when:
// before you mark a task as completed, use this tool to check diagnostics.
- You have completed a significant portion of a task and want to verify the code compiles
- You want to catch errors early before marking a task as complete
- You need detailed diagnostics with resolving hints for any compilation issues

For workspace projects, you MUST call this tool separately for each modified package, providing the packagePath parameter.
For single-package projects, omit the packagePath parameter.

The tool analyzes the entire Ballerina package and returns:
- Compilation errors with file location, error message, and diagnostic code
- Resolving hints for common error codes to help fix issues quickly
- Empty list if no errors are found
`,
        inputSchema: DiagnosticsInputSchema,
        execute: async ({ packagePath }): Promise<DiagnosticsCheckResult> => {
            // Emit tool_call event to visualizer (shows "Checking for errors..." in UI)
            eventHandler({
                type: "tool_call",
                toolName: DIAGNOSTICS_TOOL_NAME,
            });

            // Validate and resolve packagePath. The helper rejects directory
            // traversal and requires packagePath for workspace projects, so an
            // agent-supplied path can never escape tempProjectPath and steer
            // the language server at an unrelated directory on disk.
            let targetPath: string;
            try {
                targetPath = resolvePackageBasePath(tempProjectPath, packagePath);
            } catch (e: any) {
                console.error("[Diagnostics] Invalid packagePath:", e?.message);
                const errorResult: DiagnosticsCheckResult = {
                    diagnostics: [],
                    message: e?.message ?? "Invalid packagePath",
                };
                eventHandler({
                    type: "tool_result",
                    toolName: DIAGNOSTICS_TOOL_NAME,
                    toolOutput: errorResult,
                });
                return errorResult;
            }


            const DIAGNOSTICS_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
            const timeoutResult: DiagnosticsCheckResult = {
                diagnostics: [],
                message:
                    "Diagnostics check timed out — the Language Server is still compiling the workspace " +
                    "(large multi-package project). Treat the current code as potentially having compilation " +
                    "errors and continue fixing any issues you can identify from the source. " +
                    "You may call this tool again later to recheck.",
            };

            const result = await Promise.race([
                checkCompilationErrors(targetPath),
                new Promise<DiagnosticsCheckResult>((resolve) =>
                    setTimeout(() => resolve(timeoutResult), DIAGNOSTICS_TIMEOUT_MS)
                ),
            ]);

            // Emit tool_result event to visualizer (shows result in UI)
            eventHandler({
                type: "tool_result",
                toolName: DIAGNOSTICS_TOOL_NAME,
                toolOutput: result
            });

            return result;
        }
    });
}
