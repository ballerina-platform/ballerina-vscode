// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).

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

import * as fs from "fs";
import * as path from "path";
import { AI_MIGRATION_DIR, AI_TRANSCRIPT_DIR, AI_SUMMARY_FILENAME, EnhanceTomlData, PackageEnhancementResult } from "./types";

/**
 * Records per-stage transcript markdown files and generates a concise
 * `summary.md` that the agent can use as context when resuming.
 *
 * File layout inside `.ballerina-ai-migration/`:
 * ```
 * transcripts/
 *   <pkg-rel-path>/          (multi-package)
 *     stage1.md
 *     stage2.md
 *   stage1.md                (single-package)
 *   workspace-validation.md  (multi-package only)
 * summary.md
 * ```
 */
export class TranscriptWriter {
    private readonly transcriptDir: string;
    private currentFilePath: string | undefined;

    constructor(private readonly projectRoot: string) {
        this.transcriptDir = path.join(projectRoot, AI_MIGRATION_DIR, AI_TRANSCRIPT_DIR);
    }

    /**
     * Begin a new stage transcript. Writes the markdown header.
     *
     * @param packageRelPath  Relative package path (empty string for single-package or workspace validation).
     * @param stageIndex      Zero-based stage index.
     * @param stageName       Human-readable stage name.
     * @param isWorkspaceValidation  If `true`, writes to `workspace-validation.md`.
     */
    startStage(
        packageRelPath: string,
        stageIndex: number,
        stageName: string,
        isWorkspaceValidation = false,
    ): void {
        const dir = packageRelPath
            ? path.join(this.transcriptDir, packageRelPath)
            : this.transcriptDir;

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const filename = isWorkspaceValidation
            ? "workspace-validation.md"
            : `stage${stageIndex + 1}.md`;

        this.currentFilePath = path.join(dir, filename);

        const header = `# ${stageName}\n\n_Started: ${new Date().toISOString()}_\n\n---\n\n`;
        fs.writeFileSync(this.currentFilePath, header, "utf8");
    }

    /**
     * Append streaming content text to the current stage transcript.
     * No-op when no stage is active.
     */
    appendContent(text: string): void {
        if (!this.currentFilePath || !text) { return; }
        try {
            fs.appendFileSync(this.currentFilePath, text, "utf8");
        } catch (err) {
            console.error("[TranscriptWriter] Failed to append content:", err);
        }
    }

    /**
     * Append a tool-call marker to the transcript.
     */
    appendToolCall(toolName: string, inputSummary?: string): void {
        if (!this.currentFilePath) { return; }
        const line = inputSummary
            ? `\n> 🔧 **${toolName}** — ${truncate(inputSummary, 200)}\n`
            : `\n> 🔧 **${toolName}**\n`;
        try {
            fs.appendFileSync(this.currentFilePath, line, "utf8");
        } catch (err) {
            console.error("[TranscriptWriter] Failed to append tool call:", err);
        }
    }

    /**
     * Append a tool-result marker to the transcript.
     */
    appendToolResult(toolName: string, succeeded: boolean): void {
        if (!this.currentFilePath) { return; }
        const icon = succeeded ? "✅" : "❌";
        const line = `> ${icon} **${toolName}** completed\n\n`;
        try {
            fs.appendFileSync(this.currentFilePath, line, "utf8");
        } catch (err) {
            console.error("[TranscriptWriter] Failed to append tool result:", err);
        }
    }

    /**
     * Write a completion marker at the end of the current stage transcript.
     */
    finalizeStage(): void {
        if (!this.currentFilePath) { return; }
        try {
            fs.appendFileSync(
                this.currentFilePath,
                `\n\n---\n\n_Completed: ${new Date().toISOString()}_\n`,
                "utf8",
            );
        } catch (err) {
            console.error("[TranscriptWriter] Failed to finalize stage:", err);
        }
        this.currentFilePath = undefined;
    }

    /**
     * Close the current stage transcript as failed, recording the error.
     *
     * Deliberately omits the `_Completed:` marker that `isStageCompleted` looks for, so a
     * resumed run re-attempts this stage instead of skipping it. Whatever partial work the
     * stage did produce stays in the file and is injected as the resume preamble.
     */
    failStage(errorMessage: string): void {
        if (!this.currentFilePath) { return; }
        try {
            fs.appendFileSync(
                this.currentFilePath,
                `\n\n---\n\n_Failed: ${new Date().toISOString()}_\n\n`
                + `> ❌ ${truncate(errorMessage, 500)}\n`,
                "utf8",
            );
        } catch (err) {
            console.error("[TranscriptWriter] Failed to record stage failure:", err);
        }
        this.currentFilePath = undefined;
    }

    /**
     * Generate a structured summary of the enhancement run so far.
     * This is written to `summary.md` and used as context when resuming.
     */
    generateSummary(
        tomlData: EnhanceTomlData,
        results: PackageEnhancementResult[],
    ): string {
        const lines: string[] = [];
        lines.push("# AI Enhancement Summary\n");
        lines.push(`_Generated: ${new Date().toISOString()}_\n`);

        // Overall status
        const succeeded = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        lines.push(`## Status\n`);
        lines.push(`- **Packages completed**: ${succeeded.length} of ${results.length}`);
        if (tomlData.completedPackages?.length) {
            lines.push(`- **Completed**: ${tomlData.completedPackages.join(", ")}`);
        }
        if (tomlData.currentPackage) {
            lines.push(`- **Last active package**: ${tomlData.currentPackage}`);
        }
        if (tomlData.currentStage !== undefined) {
            lines.push(`- **Last active stage**: ${tomlData.currentStage + 1}`);
        }
        if (failed.length > 0) {
            lines.push(`- **Failed**: ${failed.map(f => `${f.packagePath} (${f.error ?? "unknown"})`).join(", ")}`);
        }
        lines.push("");

        // Per-package transcript summaries
        lines.push(`## Per-Package Details\n`);
        for (const result of results) {
            const icon = result.success ? "✅" : "❌";
            lines.push(`### ${icon} ${result.packagePath}\n`);

            // Read stage files for this package to extract completion lines
            const pkgTranscriptDir = result.packagePath
                ? path.join(this.transcriptDir, result.packagePath)
                : this.transcriptDir;
            const stageFiles = this.listStageFiles(pkgTranscriptDir);
            for (const sf of stageFiles) {
                const firstLine = this.readFirstLine(sf);
                const completed = this.fileContainsCompletion(sf);
                const status = completed ? "completed" : "in-progress/aborted";
                lines.push(`- **${path.basename(sf, ".md")}**: ${firstLine ?? "unknown"} — ${status}`);
            }
            if (stageFiles.length === 0) {
                lines.push("- _No transcript files found_");
            }
            lines.push("");
        }

        return lines.join("\n");
    }

    /**
     * Generate a summary for a single-package project.
     */
    generateSinglePackageSummary(
        tomlData: EnhanceTomlData,
        aborted: boolean,
    ): string {
        const lines: string[] = [];
        lines.push("# AI Enhancement Summary\n");
        lines.push(`_Generated: ${new Date().toISOString()}_\n`);

        lines.push(`## Status\n`);
        lines.push(`- **Type**: Single package`);
        lines.push(`- **Outcome**: ${aborted ? "Paused/Aborted" : "Completed"}`);
        if (tomlData.currentStage !== undefined) {
            lines.push(`- **Last active stage**: ${tomlData.currentStage + 1}`);
        }
        lines.push("");

        lines.push(`## Stage Details\n`);
        const stageFiles = this.listStageFiles(this.transcriptDir);
        for (const sf of stageFiles) {
            const firstLine = this.readFirstLine(sf);
            const completed = this.fileContainsCompletion(sf);
            const status = completed ? "completed" : "in-progress/aborted";
            lines.push(`- **${path.basename(sf, ".md")}**: ${firstLine ?? "unknown"} — ${status}`);
        }
        if (stageFiles.length === 0) {
            lines.push("- _No transcript files found_");
        }
        lines.push("");

        return lines.join("\n");
    }

    /**
     * Write the summary markdown to disk.
     */
    writeSummary(summary: string): void {
        const summaryPath = path.join(
            this.projectRoot, AI_MIGRATION_DIR, AI_SUMMARY_FILENAME,
        );
        const dir = path.dirname(summaryPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        try {
            fs.writeFileSync(summaryPath, summary, "utf8");
            console.log(`[TranscriptWriter] Summary written to ${summaryPath}`);
        } catch (err) {
            console.error("[TranscriptWriter] Failed to write summary:", err);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private buildStageFilePath(packageRelPath: string, stageIndex: number, isWorkspaceValidation: boolean): string {
        const dir = packageRelPath
            ? path.join(this.transcriptDir, packageRelPath)
            : this.transcriptDir;
        const filename = isWorkspaceValidation ? "workspace-validation.md" : `stage${stageIndex + 1}.md`;
        return path.join(dir, filename);
    }

    /**
     * Returns true if the stage transcript file exists and contains a completion marker.
     */
    isStageCompleted(packageRelPath: string, stageIndex: number, isWorkspaceValidation = false): boolean {
        try {
            const filePath = this.buildStageFilePath(packageRelPath, stageIndex, isWorkspaceValidation);
            if (!fs.existsSync(filePath)) { return false; }
            const content = fs.readFileSync(filePath, "utf8");
            return content.includes("_Completed:");
        } catch { return false; }
    }

    /**
     * Returns the transcript file content for a stage, or null if not found.
     * Used to inject partial work as a resume preamble when the stage was interrupted.
     */
    readStageTranscript(packageRelPath: string, stageIndex: number, isWorkspaceValidation = false): string | null {
        try {
            const filePath = this.buildStageFilePath(packageRelPath, stageIndex, isWorkspaceValidation);
            if (!fs.existsSync(filePath)) { return null; }
            return fs.readFileSync(filePath, "utf8");
        } catch { return null; }
    }

    private listStageFiles(dir: string): string[] {
        try {
            if (!fs.existsSync(dir)) { return []; }
            return fs.readdirSync(dir)
                .filter(f => f.endsWith(".md"))
                .sort()
                .map(f => path.join(dir, f));
        } catch { return []; }
    }

    private readFirstLine(filePath: string): string | null {
        try {
            const content = fs.readFileSync(filePath, "utf8");
            const match = content.match(/^#\s+(.+)/m);
            return match?.[1] ?? null;
        } catch { return null; }
    }

    private fileContainsCompletion(filePath: string): boolean {
        try {
            const content = fs.readFileSync(filePath, "utf8");
            return content.includes("_Completed:");
        } catch { return false; }
    }
}

/** Truncate a string, appending `…` if it exceeds `maxLen`. */
function truncate(s: string, maxLen: number): string {
    return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + "…";
}
