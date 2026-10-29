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

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { BallerinaExtension } from "../../core";
import { openAIPanelWithPrompt } from "../../views/ai-panel/aiMachine";
import { HandshakeResponse, ScanClient, ScanResponse, ScanTomlEditResponse, SuppressFix } from "./scan-client";
import {
    COMMAND_ENABLE_SUPPRESSIONS, COMMAND_EXCLUDE_RULE, COMMAND_FIX_WITH_COPILOT, COMMAND_SUPPRESS, ScanCodeActionProvider
} from "./scan-code-actions";
import { ScanDiagnostic, ScanDiagnostics, toRange } from "./scan-diagnostics";
import { ScanReportWebview } from "./scan-report-webview";

const SCAN_ENABLED_CONFIG = "ballerina.scan.enabled";
const COMMAND_ENABLE = "ballerina.scan.enable";
const COMMAND_DISABLE = "ballerina.scan.disable";
const COMMAND_RUN = "ballerina.scan.run";
const COMMAND_INCLUDE_RULE = "ballerina.scan.includeRule";
const COMMAND_SCAN_AND_REPORT = "ballerina.scan.report";
const BALLERINA_TOML = "Ballerina.toml";
const SCAN_TOML = "Scan.toml";

export function activate(ballerinaExtInstance: BallerinaExtension): void {
    const context = ballerinaExtInstance.context;
    const scanner = new Scanner(new ScanClient(() => ballerinaExtInstance.langClient));
    const scanTomlWatcher = vscode.workspace.createFileSystemWatcher(`**/${SCAN_TOML}`);
    context.subscriptions.push(
        scanner,
        vscode.languages.registerCodeActionsProvider({ language: "ballerina" },
            new ScanCodeActionProvider(scanner.diagnostics),
            { providedCodeActionKinds: ScanCodeActionProvider.providedCodeActionKinds }),
        vscode.commands.registerCommand(COMMAND_ENABLE, () => setEnabled(true)),
        vscode.commands.registerCommand(COMMAND_DISABLE, () => setEnabled(false)),
        vscode.commands.registerCommand(COMMAND_RUN, () => scanner.scanWorkspace(true)),
        vscode.commands.registerCommand(COMMAND_SCAN_AND_REPORT, (uri?: vscode.Uri) => scanner.scanAndReport(uri)),
        vscode.commands.registerCommand(COMMAND_FIX_WITH_COPILOT, fixWithCopilot),
        vscode.commands.registerCommand(COMMAND_SUPPRESS,
            (uri: vscode.Uri, diagnostic: ScanDiagnostic, index: number) => scanner.suppress(uri, diagnostic, index)),
        vscode.commands.registerCommand(COMMAND_ENABLE_SUPPRESSIONS, async (packagePath: string) => {
            // While scanning is on, the Scan.toml watcher rescans; otherwise the finding would stay until a manual scan.
            if (await scanner.enableSuppressions(packagePath) && !isEnabled()) {
                await scanner.scan([packagePath], true);
            }
        }),
        vscode.commands.registerCommand(COMMAND_EXCLUDE_RULE,
            (packagePath: string, ruleId: string) => scanner.excludeRule(packagePath, ruleId)),
        vscode.commands.registerCommand(COMMAND_INCLUDE_RULE, () => scanner.includeRule()),
        vscode.workspace.onDidSaveTextDocument(document => {
            if (isEnabled() && document.languageId === "ballerina") {
                const packagePath = findPackageRoot(document.uri.fsPath);
                if (packagePath && !isInHiddenFolder(packagePath)) {
                    scanner.scan([packagePath], false);
                }
            }
        }),
        scanTomlWatcher,
        ...[scanTomlWatcher.onDidCreate, scanTomlWatcher.onDidChange, scanTomlWatcher.onDidDelete].map(event =>
            event(uri => {
                const packagePath = path.dirname(uri.fsPath);
                if (isEnabled() && !isInHiddenFolder(packagePath)
                    && fs.existsSync(path.join(packagePath, BALLERINA_TOML))) {
                    scanner.scan([packagePath], false);
                }
            })),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.contentChanges.length > 0 && event.document.languageId === "ballerina") {
                scanner.diagnostics.trackEdit(event.document.uri, event.contentChanges);
            }
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(SCAN_ENABLED_CONFIG)) {
                scanner.onEnablementChanged(isEnabled());
            }
        })
    );
    scanner.onEnablementChanged(isEnabled());
}

function isEnabled(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>(SCAN_ENABLED_CONFIG, false);
}

async function setEnabled(enabled: boolean): Promise<void> {
    const target = vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    await vscode.workspace.getConfiguration().update(SCAN_ENABLED_CONFIG, enabled, target);
}

class Scanner implements vscode.Disposable {
    readonly diagnostics = new ScanDiagnostics();
    private readonly statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    private readonly inFlight = new Map<string, Promise<void>>();
    private readonly pending = new Set<string>();
    private readonly retriedOnline = new Set<string>();
    private toolReady = false;
    private installPromptShown = false;

    constructor(private readonly client: ScanClient) {
        this.statusBar.command = "workbench.actions.view.problems";
        this.diagnostics.onDidChange(() => this.updateStatusBar());
    }

    onEnablementChanged(enabled: boolean): void {
        if (enabled) {
            this.statusBar.show();
            this.updateStatusBar();
            this.scanWorkspace(false);
        } else {
            this.diagnostics.clear();
            this.statusBar.hide();
        }
    }

    async scanWorkspace(manual: boolean): Promise<void> {
        const roots = await findScanRoots();
        if (roots.length === 0) {
            if (manual) {
                vscode.window.showInformationMessage("No Ballerina package found to scan.");
            }
            return;
        }
        if (manual) {
            this.statusBar.show();
        }
        await this.scan(roots, manual);
    }

    async scan(paths: string[], manual: boolean): Promise<void> {
        if (!await this.ensureTool(manual)) {
            return;
        }
        await Promise.all(paths.map(projectPath => this.scanOne(projectPath, manual)));
    }

    /** Scans the package of the given or active file, shows its findings as diagnostics and opens its report. */
    async scanAndReport(uri?: vscode.Uri): Promise<void> {
        const file = uri ?? vscode.window.activeTextEditor?.document.uri;
        const packagePath = file && findPackageRoot(file.fsPath);
        if (!packagePath) {
            vscode.window.showInformationMessage("Open a file of a Ballerina package to scan it.");
            return;
        }
        let showInEditor = isEnabled();
        if (!showInEditor) {
            const enable = "Enable and Continue";
            const reportOnly = "Continue to Report";
            const choice = await vscode.window.showWarningMessage("Automatic scanning is disabled", {
                modal: true,
                detail: "Enable it to also show the findings in the editor and rescan on save."
            }, enable, reportOnly);
            if (!choice) {
                return;
            }
            if (choice === enable) {
                await setEnabled(true);
                showInEditor = true;
            }
        }
        if (!await this.ensureTool(true)) {
            return;
        }
        if (showInEditor) {
            this.statusBar.show();
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Scanning ${path.basename(packagePath)}`
        }, async () => {
            try {
                const response = await this.scanPackage(packagePath, true);
                if (!response.success) {
                    vscode.window.showErrorMessage(`Ballerina scan failed: ${response.error}`);
                    return;
                }
                for (const pkg of response.packages ?? []) {
                    if (pkg.skippedReason) {
                        vscode.window.showWarningMessage(`Skipped scanning ${pkg.name}: ${pkg.skippedReason}`);
                        continue;
                    }
                    if (showInEditor) {
                        this.diagnostics.setPackage(pkg);
                    }
                    if (pkg.reportPath) {
                        ScanReportWebview.show(pkg.reportPath, pkg.name);
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Ballerina scan failed: ${(error as Error).message}`);
            }
        });
    }

    async excludeRule(packagePath: string, ruleId: string): Promise<void> {
        const edit = await this.client.excludeRuleEdit(packagePath, ruleId);
        if (!edit.success) {
            vscode.window.showErrorMessage(`Cannot exclude rule ${ruleId}: ${edit.error}`);
            return;
        }
        if (edit.changed) {
            await applyScanTomlEdit(edit);
        }
        this.diagnostics.removeRule(packagePath, ruleId);
        notifyScanTomlChange(`Rule ${ruleId} is excluded for this package.`, edit.path);
    }

    async suppress(uri: vscode.Uri, diagnostic: ScanDiagnostic, index: number): Promise<void> {
        const fix = diagnostic.issue.suppressFixes?.[index];
        if (!fix) {
            return;
        }
        if (!diagnostic.suppressionEnabled) {
            const enable = "Enable and Suppress";
            const anyway = "Suppress Anyway";
            const choice = await vscode.window.showWarningMessage("Suppressions are disabled in Scan.toml", {
                modal: true,
                detail: "The annotation has no effect until suppressions are enabled."
            }, enable, anyway);
            if (!choice) {
                return;
            }
            if (choice === enable && !await this.enableSuppressions(diagnostic.packagePath)) {
                return;
            }
        }
        // Removed first: the edit moves the finding, after which it is a different diagnostic.
        this.diagnostics.remove(uri, diagnostic);
        await applySuppressFix(uri, fix);
    }

    async enableSuppressions(packagePath: string): Promise<boolean> {
        const edit = await this.client.enableSuppressionEdit(packagePath);
        if (!edit.success) {
            vscode.window.showErrorMessage(`Cannot enable suppressions: ${edit.error}`);
            return false;
        }
        if (edit.changed) {
            await applyScanTomlEdit(edit);
            notifyScanTomlChange("Suppressions are enabled for this package.", edit.path);
        }
        return true;
    }

    async includeRule(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        const packagePath = editor ? findPackageRoot(editor.document.uri.fsPath) : (await findScanRoots())[0];
        if (!packagePath) {
            vscode.window.showInformationMessage("Open a file of the package whose rule to re-enable.");
            return;
        }
        const ruleId = await vscode.window.showInputBox({
            prompt: `Rule to re-enable for ${path.basename(packagePath)}`,
            placeHolder: "ballerina/http:2"
        });
        if (!ruleId) {
            return;
        }
        const edit = await this.client.includeRuleEdit(packagePath, ruleId);
        if (!edit.success) {
            vscode.window.showErrorMessage(`Cannot re-enable rule ${ruleId}: ${edit.error}`);
            return;
        }
        if (!edit.changed) {
            vscode.window.showInformationMessage(`Rule ${ruleId} is not excluded.`);
            return;
        }
        await applyScanTomlEdit(edit);
        await this.scan([packagePath], true);
    }

    dispose(): void {
        this.diagnostics.dispose();
        this.statusBar.dispose();
    }

    // A save during a running scan queues one rescan instead of starting a second one.
    private async scanOne(projectPath: string, manual: boolean): Promise<void> {
        const running = this.inFlight.get(projectPath);
        if (running) {
            this.pending.add(projectPath);
            return running;
        }
        const run = this.runScan(projectPath, manual).finally(() => {
            this.inFlight.delete(projectPath);
            this.updateStatusBar();
            if (this.pending.delete(projectPath)) {
                this.scanOne(projectPath, false);
            }
        });
        this.inFlight.set(projectPath, run);
        this.updateStatusBar();
        return run;
    }

    private async runScan(projectPath: string, manual: boolean): Promise<void> {
        try {
            const response = await this.scanPackage(projectPath, false);
            if (!response.success) {
                this.toolReady = response.code !== "TOOL_NOT_FOUND" && response.code !== "TOOL_INCOMPATIBLE";
                vscode.window.showErrorMessage(`Ballerina scan failed for ${path.basename(projectPath)}: `
                    + response.error);
                return;
            }
            for (const pkg of response.packages ?? []) {
                this.diagnostics.setPackage(pkg);
                if (pkg.skippedReason && manual) {
                    vscode.window.showWarningMessage(`Skipped scanning ${pkg.name}: ${pkg.skippedReason}`);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Ballerina scan failed: ${(error as Error).message}`);
        }
    }

    // Offline reuses the dependencies the language server already resolved; resolving online costs seconds per scan.
    // A package skipped offline may only be missing a dependency, so it is retried online once until a scan succeeds.
    private async scanPackage(projectPath: string, report: boolean): Promise<ScanResponse> {
        const offline = await this.client.scan(projectPath, report, true);
        const skipped = offline.success && offline.packages?.some(pkg => pkg.skippedReason) === true;
        if (!skipped) {
            this.retriedOnline.delete(projectPath);
            return offline;
        }
        if (this.retriedOnline.has(projectPath)) {
            return offline;
        }
        this.retriedOnline.add(projectPath);
        return this.client.scan(projectPath, report, false);
    }

    private async ensureTool(manual: boolean): Promise<boolean> {
        if (this.toolReady) {
            return true;
        }
        let handshake: HandshakeResponse | undefined;
        try {
            handshake = await this.client.handshake();
        } catch (error) {
            vscode.window.showErrorMessage(`Ballerina scan is unavailable: ${(error as Error).message}`);
            return false;
        }
        if (!handshake) {
            vscode.window.showWarningMessage("This version of the Ballerina language server cannot run scans.");
            return false;
        }
        if (handshake.available) {
            this.toolReady = true;
            return true;
        }
        if (manual || !this.installPromptShown) {
            this.installPromptShown = true;
            void this.promptInstall(handshake);
        }
        return false;
    }

    // Installing a tool changes the user's machine, so it only happens when they choose it.
    private async promptInstall(handshake: HandshakeResponse): Promise<void> {
        const update = handshake.code === "TOOL_INCOMPATIBLE";
        const action = update ? "Update scan tool" : "Install scan tool";
        const choice = await vscode.window.showWarningMessage(handshake.error ?? "The scan tool is not installed.",
            action, "Disable scanning");
        if (choice === action) {
            const terminal = vscode.window.createTerminal("Ballerina scan tool");
            terminal.show();
            terminal.sendText(update ? "bal tool update scan" : "bal tool pull scan");
        } else if (choice === "Disable scanning") {
            await setEnabled(false);
        }
    }

    private updateStatusBar(): void {
        if (this.inFlight.size > 0) {
            this.statusBar.text = "$(sync~spin) Scanning";
            this.statusBar.tooltip = "Ballerina scan is running";
            return;
        }
        const { vulnerabilities, bugs, codeSmells, suppressed } = this.diagnostics.counts();
        const parts = [
            plural(vulnerabilities, "vulnerability", "vulnerabilities"),
            plural(bugs, "bug", "bugs"),
            plural(codeSmells, "code smell", "code smells")
        ].filter((part): part is string => part !== undefined);
        this.statusBar.text = `$(shield) ${parts.length > 0 ? parts.join(", ") : "No scan issues"}`;
        this.statusBar.tooltip = "Ballerina scan results"
            + (suppressed > 0 ? ` (${plural(suppressed, "issue", "issues")} suppressed with @scan:Suppress)` : "")
            + ". Click to open the Problems panel.";
    }
}

function plural(count: number, singular: string, pluralForm: string): string | undefined {
    return count === 0 ? undefined : `${count} ${count === 1 ? singular : pluralForm}`;
}

// The visible prompt only names the finding, which the developer has just read; the model gets the rest as hidden context.
function fixWithCopilot(uri: vscode.Uri, diagnostic: ScanDiagnostic): void {
    const { issue } = diagnostic;
    const range = diagnostic.range;
    const file = vscode.workspace.asRelativePath(uri);
    const lines = range.start.line === range.end.line ? `line ${range.start.line + 1}`
        : `lines ${range.start.line + 1}-${range.end.line + 1}`;
    const kind = capitalize(issue.ruleKind.toLowerCase().replace("_", " "));
    const standards = [
        ...(issue.cwe ?? []).map(cwe => `CWE-${cwe}`),
        ...(issue.owasp ?? []).flatMap(owasp => owasp.categories.map(category =>
            `OWASP A${String(category).padStart(2, "0")}:${owasp.year}`))
    ];

    const text = `Fix bal scan finding ${issue.ruleID} "${issue.name}" in ${file} at ${lines}.`;

    const hiddenContext = [
        `Problem: ${issue.message}`,
        issue.details ? `Rule details: ${issue.details}` : undefined,
        `Kind: ${kind}` + (issue.severity ? `, ${issue.severity.toLowerCase()} severity` : "")
            + (standards.length > 0 ? ` (${standards.join("; ")})` : ""),
        issue.helpUri ? `Rule documentation: ${issue.helpUri}` : undefined,
        "The flagged code is the selected code.",
        "Resolve the finding with the smallest change that keeps the program's behaviour. If the fix changes a "
            + "function's signature, update its callers in the package. Do not add @scan:Suppress and do not exclude "
            + "the rule in Scan.toml. After editing, say briefly what changed and why it resolves the finding."
    ].filter((line): line is string => line !== undefined).join("\n");

    openAIPanelWithPrompt({
        type: "text",
        text,
        planMode: false,
        codeContext: {
            type: "selection",
            startPosition: { line: range.start.line, offset: range.start.character },
            endPosition: { line: range.end.line, offset: range.end.character },
            filePath: uri.fsPath
        },
        hiddenContext
    });
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

// The snippet puts the cursor on the reason, which the report and reviewers see.
async function applySuppressFix(uri: vscode.Uri, fix: SuppressFix): Promise<void> {
    await vscode.window.showTextDocument(uri);
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(uri, fix.edits.map(edit => edit.snippet
        ? snippetEdit(toRange(edit.textRange), edit.newText)
        : new vscode.TextEdit(toRange(edit.textRange), edit.newText)));
    await vscode.workspace.applyEdit(workspaceEdit);
}

// The tool writes each line's indentation, so VS Code must not indent the snippet's lines again.
function snippetEdit(range: vscode.Range, snippet: string): vscode.SnippetTextEdit {
    const edit = new vscode.SnippetTextEdit(range, new vscode.SnippetString(snippet));
    edit.keepWhitespace = true;
    return edit;
}

// Not awaited, so the notification does not hold up the rescan or the edit that follows.
function notifyScanTomlChange(message: string, scanTomlPath: string | undefined): void {
    vscode.window.showInformationMessage(message, "Open Scan.toml")
        .then(choice => choice && scanTomlPath ? vscode.window.showTextDocument(vscode.Uri.file(scanTomlPath)) : undefined);
}

// Applied as a workspace edit rather than written by the server, so Ctrl+Z works and an open Scan.toml buffer
// is not overwritten behind the editor's back. Saved so the next scan, which reads from disk, sees it.
async function applyScanTomlEdit(edit: ScanTomlEditResponse): Promise<void> {
    const uri = vscode.Uri.file(edit.path!);
    const workspaceEdit = new vscode.WorkspaceEdit();
    if (edit.exists) {
        const document = await vscode.workspace.openTextDocument(uri);
        const fullRange = document.validateRange(new vscode.Range(0, 0, document.lineCount, 0));
        workspaceEdit.replace(uri, fullRange, edit.content!);
    } else {
        workspaceEdit.createFile(uri, { ignoreIfExists: true });
        workspaceEdit.insert(uri, new vscode.Position(0, 0), edit.content!);
    }
    await vscode.workspace.applyEdit(workspaceEdit);
    await (await vscode.workspace.openTextDocument(uri)).save();
}

function findPackageRoot(filePath: string): string | undefined {
    let dir = path.dirname(filePath);
    while (true) {
        const toml = path.join(dir, BALLERINA_TOML);
        if (fs.existsSync(toml) && !isWorkspaceToml(toml)) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            return undefined;
        }
        dir = parent;
    }
}

// A workspace root covers its packages, so packages inside one are not scanned twice. Hidden folders hold copies,
// fixtures and tool state rather than packages to scan.
async function findScanRoots(): Promise<string[]> {
    const tomls = await vscode.workspace.findFiles(`**/${BALLERINA_TOML}`, "**/{target,node_modules,.*}/**");
    const dirs = tomls.map(toml => path.dirname(toml.fsPath));
    const workspaces = tomls.filter(toml => isWorkspaceToml(toml.fsPath)).map(toml => path.dirname(toml.fsPath));
    return dirs.filter(dir => !workspaces.some(root => root !== dir && dir.startsWith(root + path.sep)));
}

// Only folders inside the workspace count, so a workspace that itself lives under a hidden folder is still scanned.
function isInHiddenFolder(fsPath: string): boolean {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fsPath));
    if (!folder) {
        return false;
    }
    return path.relative(folder.uri.fsPath, fsPath).split(path.sep).some(segment => segment.startsWith("."));
}

function isWorkspaceToml(tomlPath: string): boolean {
    try {
        return /^\s*\[workspace\]/m.test(fs.readFileSync(tomlPath, "utf8"));
    } catch {
        return false;
    }
}
