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
import { ScanDiagnostic, ScanDiagnostics } from "./scan-diagnostics";

export const COMMAND_FIX_WITH_COPILOT = "ballerina.scan.fixWithCopilot";
export const COMMAND_EXCLUDE_RULE = "ballerina.scan.excludeRule";
export const COMMAND_SUPPRESS = "ballerina.scan.suppress";
export const COMMAND_ENABLE_SUPPRESSIONS = "ballerina.scan.enableSuppressions";

/** Offers the scan quick fixes for the scan diagnostics under the cursor. */
export class ScanCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    constructor(private readonly store: ScanDiagnostics) {}

    provideCodeActions(document: vscode.TextDocument, _range: vscode.Range,
                       context: vscode.CodeActionContext): vscode.CodeAction[] {
        const diagnostics = context.diagnostics
            .map(diagnostic => this.store.find(document.uri, diagnostic))
            .filter((diagnostic): diagnostic is ScanDiagnostic => diagnostic !== undefined);
        const actions: vscode.CodeAction[] = [];
        const excludedRules = new Set<string>();
        const enabledPackages = new Set<string>();
        for (const diagnostic of diagnostics) {
            const enableSuppressions = diagnostic.issue.enableSuppressions;
            const annotated = enableSuppressions !== undefined;
            const fix = new vscode.CodeAction(`Fix "${diagnostic.issue.name}" with Copilot`,
                vscode.CodeActionKind.QuickFix);
            fix.diagnostics = [diagnostic];
            fix.isPreferred = !annotated;
            fix.command = { command: COMMAND_FIX_WITH_COPILOT, title: fix.title, arguments: [document.uri, diagnostic] };
            actions.push(fix);

            // An annotated finding is already suppressed in source; only the disabled setting keeps it reported.
            if (enableSuppressions && !enabledPackages.has(diagnostic.packagePath)) {
                enabledPackages.add(diagnostic.packagePath);
                const enable = new vscode.CodeAction(enableSuppressions.title, vscode.CodeActionKind.QuickFix);
                enable.diagnostics = [diagnostic];
                enable.isPreferred = true;
                enable.command = {
                    command: COMMAND_ENABLE_SUPPRESSIONS,
                    title: enable.title,
                    arguments: [diagnostic.packagePath]
                };
                actions.push(enable);
            }

            diagnostic.issue.suppressFixes?.forEach((suppressFix, index) => {
                const suppress = new vscode.CodeAction(suppressFix.title, vscode.CodeActionKind.QuickFix);
                suppress.diagnostics = [diagnostic];
                suppress.command = {
                    command: COMMAND_SUPPRESS,
                    title: suppress.title,
                    arguments: [document.uri, diagnostic, index]
                };
                actions.push(suppress);
            });

            if (!excludedRules.has(diagnostic.issue.ruleID)) {
                excludedRules.add(diagnostic.issue.ruleID);
                const exclude = new vscode.CodeAction(`Exclude rule ${diagnostic.issue.ruleID} in Scan.toml`,
                    vscode.CodeActionKind.QuickFix);
                exclude.diagnostics = [diagnostic];
                exclude.command = {
                    command: COMMAND_EXCLUDE_RULE,
                    title: exclude.title,
                    arguments: [diagnostic.packagePath, diagnostic.issue.ruleID]
                };
                actions.push(exclude);
            }
        }
        return actions;
    }
}
