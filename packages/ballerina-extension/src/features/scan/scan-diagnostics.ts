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

import * as vscode from "vscode";
import { ScanIssue, ScannedPackage, SuppressionProblem, TextRange } from "./scan-client";
import { TextChange, trackRange } from "./range-tracking";

export const SCAN_DIAGNOSTIC_SOURCE = "ballerina-scan";

/** A scan diagnostic keeps its issue and package so quick fixes can act on it. */
export class ScanDiagnostic extends vscode.Diagnostic {
    constructor(readonly issue: ScanIssue, readonly packagePath: string, readonly suppressionEnabled: boolean) {
        super(toRange(issue.textRange), issue.enableSuppressions
            ? `${issue.message} ${issue.enableSuppressions.note}` : issue.message, toSeverity(issue));
        this.source = SCAN_DIAGNOSTIC_SOURCE;
        this.code = issue.helpUri ? { value: issue.ruleID, target: vscode.Uri.parse(issue.helpUri) } : issue.ruleID;
    }
}

/** A problem with a `@scan:Suppress` annotation, shown on the annotation. */
export class SuppressionProblemDiagnostic extends vscode.Diagnostic {
    constructor(problem: SuppressionProblem) {
        super(toRange(problem.textRange), problem.message, problem.severity === "ERROR"
            ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
        this.source = SCAN_DIAGNOSTIC_SOURCE;
        this.code = "suppression";
    }
}

function track(diagnostic: vscode.Diagnostic, changes: readonly TextChange[]): vscode.Diagnostic | undefined {
    const range = trackRange(diagnostic.range, changes);
    if (!range) {
        return undefined;
    }
    if (!(diagnostic instanceof ScanDiagnostic)) {
        diagnostic.range = range;
        return diagnostic;
    }
    const { issue } = diagnostic;
    const suppressFixes = issue.suppressFixes?.flatMap(fix => {
        const edits = fix.edits.map(edit => {
            const editRange = trackRange(toRange(edit.textRange), changes);
            return editRange && { ...edit, textRange: fromRange(editRange) };
        });
        return edits.every(edit => edit !== undefined) ? [{ ...fix, edits }] : [];
    });
    return new ScanDiagnostic({ ...issue, textRange: fromRange(range), suppressFixes }, diagnostic.packagePath,
        diagnostic.suppressionEnabled);
}

function fromRange(range: vscode.Range): TextRange {
    return {
        startLine: range.start.line,
        startLineOffset: range.start.character,
        endLine: range.end.line,
        endLineOffset: range.end.character
    };
}

export function toRange({ startLine, startLineOffset, endLine, endLineOffset }: TextRange): vscode.Range {
    return new vscode.Range(startLine, startLineOffset, endLine, endLineOffset);
}

// Scan findings never break the build, so they never show as errors next to compiler errors.
function toSeverity(issue: ScanIssue): vscode.DiagnosticSeverity {
    return issue.ruleKind === "CODE_SMELL" ? vscode.DiagnosticSeverity.Information
        : vscode.DiagnosticSeverity.Warning;
}

export interface ScanCounts {
    vulnerabilities: number;
    bugs: number;
    codeSmells: number;
    suppressed: number;
}

/** Holds the latest scan result per package and mirrors it into one diagnostic collection. */
export class ScanDiagnostics implements vscode.Disposable {
    private readonly collection = vscode.languages.createDiagnosticCollection(SCAN_DIAGNOSTIC_SOURCE);
    private readonly byPackage = new Map<string, Map<string, vscode.Diagnostic[]>>();
    private readonly suppressedByPackage = new Map<string, number>();
    private readonly changeEmitter = new vscode.EventEmitter<void>();
    readonly onDidChange = this.changeEmitter.event;

    setPackage(pkg: ScannedPackage): void {
        const byFile = new Map<string, vscode.Diagnostic[]>();
        const add = (filePath: string, diagnostic: vscode.Diagnostic) => {
            const key = vscode.Uri.file(filePath).toString();
            byFile.set(key, [...(byFile.get(key) ?? []), diagnostic]);
        };
        pkg.issues.forEach(issue => add(issue.filePath, new ScanDiagnostic(issue, pkg.path,
            pkg.suppressionEnabled !== false)));
        pkg.suppressionDiagnostics?.forEach(problem => add(problem.filePath,
            new SuppressionProblemDiagnostic(problem)));
        const previousFiles = this.byPackage.get(pkg.path)?.keys() ?? [];
        this.byPackage.set(pkg.path, byFile);
        this.suppressedByPackage.set(pkg.path, pkg.suppressedIssues?.length ?? 0);
        for (const file of new Set([...previousFiles, ...byFile.keys()])) {
            this.refresh(file);
        }
        this.changeEmitter.fire();
    }

    /**
     * Moves a document's findings with an edit until the next scan replaces them. A finding whose code the edit
     * touches is dropped, and so is a suppression fix whose insertion point it touches.
     */
    trackEdit(uri: vscode.Uri, changes: readonly TextChange[]): void {
        const key = uri.toString();
        let changed = false;
        for (const byFile of this.byPackage.values()) {
            const diagnostics = byFile.get(key);
            if (!diagnostics) {
                continue;
            }
            byFile.set(key, diagnostics.flatMap(diagnostic => {
                const tracked = track(diagnostic, changes);
                return tracked ? [tracked] : [];
            }));
            changed = true;
        }
        if (changed) {
            this.refresh(key);
            this.changeEmitter.fire();
        }
    }

    remove(uri: vscode.Uri, diagnostic: ScanDiagnostic): void {
        const key = uri.toString();
        for (const byFile of this.byPackage.values()) {
            const diagnostics = byFile.get(key);
            if (diagnostics?.includes(diagnostic)) {
                byFile.set(key, diagnostics.filter(candidate => candidate !== diagnostic));
                this.refresh(key);
                this.changeEmitter.fire();
                return;
            }
        }
    }

    removeRule(packagePath: string, ruleId: string): void {
        const byFile = this.byPackage.get(packagePath);
        if (!byFile) {
            return;
        }
        for (const [file, diagnostics] of byFile) {
            byFile.set(file, diagnostics.filter(diagnostic => !(diagnostic instanceof ScanDiagnostic)
                || diagnostic.issue.ruleID !== ruleId));
            this.refresh(file);
        }
        this.changeEmitter.fire();
    }

    /** Finds the scan diagnostic VS Code handed back, which is a copy rather than the instance that was set. */
    find(uri: vscode.Uri, diagnostic: vscode.Diagnostic): ScanDiagnostic | undefined {
        if (diagnostic.source !== SCAN_DIAGNOSTIC_SOURCE) {
            return undefined;
        }
        const code = typeof diagnostic.code === "object" ? diagnostic.code.value : diagnostic.code;
        const key = uri.toString();
        for (const byFile of this.byPackage.values()) {
            const match = byFile.get(key)?.find((candidate): candidate is ScanDiagnostic =>
                candidate instanceof ScanDiagnostic && candidate.issue.ruleID === code
                && candidate.range.isEqual(diagnostic.range));
            if (match) {
                return match;
            }
        }
        return undefined;
    }

    clear(): void {
        this.byPackage.clear();
        this.suppressedByPackage.clear();
        this.collection.clear();
        this.changeEmitter.fire();
    }

    counts(): ScanCounts {
        const counts: ScanCounts = { vulnerabilities: 0, bugs: 0, codeSmells: 0, suppressed: 0 };
        this.suppressedByPackage.forEach(count => counts.suppressed += count);
        for (const byFile of this.byPackage.values()) {
            for (const diagnostics of byFile.values()) {
                for (const diagnostic of diagnostics) {
                    if (!(diagnostic instanceof ScanDiagnostic)) {
                        continue;
                    }
                    const { issue } = diagnostic;
                    if (issue.ruleKind === "VULNERABILITY") {
                        counts.vulnerabilities++;
                    } else if (issue.ruleKind === "BUG") {
                        counts.bugs++;
                    } else {
                        counts.codeSmells++;
                    }
                }
            }
        }
        return counts;
    }

    dispose(): void {
        this.collection.dispose();
        this.changeEmitter.dispose();
    }

    private refresh(file: string): void {
        const diagnostics = [...this.byPackage.values()].flatMap(byFile => byFile.get(file) ?? []);
        this.collection.set(vscode.Uri.parse(file), diagnostics);
    }
}
