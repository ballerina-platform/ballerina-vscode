/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
 *
 * THIS FILE INCLUDES AUTO GENERATED CODE
 */
import {
    GetMigrationToolsResponse,
    ImportIntegrationRequest,
    ImportIntegrationResponse,
    ImportIntegrationRPCRequest,
    MigrateIntegrationAPI,
    MigrateRequest,
    MigrationToolPullRequest,
    OpenMigrationReportRequest,
    OpenSubProjectReportRequest,
    SaveMigrationReportRequest,
    StoreSubProjectReportsRequest,
} from "@wso2/ballerina-core";
import os from "os";
import path from "path";
import vscode from "vscode";
import { StateMachine } from "../../stateMachine";
import { createBIProjectFromMigration, getUsername, sanitizeName } from "../../utils/bi";
import { pullMigrationTool } from "../../utils/migrate-integration";
import { MigrationReportWebview } from "../../views/migration-report/webview";
import {
    getActiveMigrationSessionState,
    markEnhancementComplete,
    startMigrationEnhancement,
    runMigrationAgent,
    abortMigrationAgent,
    setMigrationModelId,
    setWizardProjectRoot,
    runWizardMigrationEnhancement,
    openMigratedProject,
    seedMigrationHistoryIntoChatState,
    getMigrationHistoryMessages,
} from "../../features/ai/migration/orchestrator";

interface ActiveMigrationSession {
    isActive: boolean;
    aiFeatureUsed: boolean;
    fullyEnhanced: boolean;
}

export class MigrateIntegrationRpcManager implements MigrateIntegrationAPI {
    private static instance: MigrateIntegrationRpcManager;
    private subProjectReports: Map<string, string> = new Map();

    private constructor() { }

    public static getInstance(): MigrateIntegrationRpcManager {
        if (!MigrateIntegrationRpcManager.instance) {
            MigrateIntegrationRpcManager.instance = new MigrateIntegrationRpcManager();
        }
        return MigrateIntegrationRpcManager.instance;
    }

    async pullMigrationTool(args: MigrationToolPullRequest): Promise<void> {
        // The language server owns the minimum-version rule (`needToPull`: active tool older than
        // `requiredVersion`, or missing), so ask it again once the pull has finished.
        const isActiveToolCompatible = async (): Promise<boolean | undefined> => {
            const { tools } = await this.getMigrationTools();
            const tool = tools?.find((t) => t.commandName === args.toolName);
            return tool ? !tool.needToPull : undefined;
        };
        try {
            await pullMigrationTool(args.toolName, args.version, isActiveToolCompatible);
        } catch (error) {
            console.error(`Failed to pull migration tool '${args.toolName}' (minimum version '${args.version}'):`, error);
            throw error;
        }
    }

    async importIntegration(params: ImportIntegrationRPCRequest): Promise<ImportIntegrationResponse> {
        const orgName = getUsername();
        const langParams: ImportIntegrationRequest = {
            orgName: orgName,
            packageName: sanitizeName(params.packageName),
            sourcePath: params.sourcePath,
            parameters: params.parameters,
        };
        StateMachine.langClient().registerMigrationToolCallbacks();
        switch (params.commandName) {
            case "migrate-tibco":
                return StateMachine.langClient().importTibcoToBI(langParams);
            case "migrate-mule":
                return StateMachine.langClient().importMuleToBI(langParams);
            default:
                console.error(`Unsupported integration type: ${params.commandName}`);
                throw new Error(`Unsupported integration type: ${params.commandName}`);
        }
    }

    async getMigrationTools(): Promise<GetMigrationToolsResponse> {
        return StateMachine.langClient().getMigrationTools();
    }

    async openMigrationReport(params: OpenMigrationReportRequest): Promise<void> {
        MigrationReportWebview.createOrShow(params.fileName, params.reportContent);
    }

    async openSubProjectReport(params: OpenSubProjectReportRequest): Promise<void> {
        let reportContent = this.subProjectReports.get(params.projectName);

        // If not found, try with _ballerina suffix
        if (!reportContent) {
            reportContent = this.subProjectReports.get(`${params.projectName}_ballerina`);
        }

        // If still not found, try to find a fuzzy match by checking all keys
        if (!reportContent) {
            const matchingKeys = Array.from(this.subProjectReports.keys()).filter(key =>
                key.startsWith(params.projectName)
            );
            if (matchingKeys.length > 0) {
                reportContent = this.subProjectReports.get(matchingKeys[0]);
            }
        }

        if (!reportContent) {
            const availableKeys = Array.from(this.subProjectReports.keys());
            throw new Error(`Report for project '${params.projectName}' not found. Available projects: ${availableKeys.join(', ')}`);
        }
        MigrationReportWebview.createOrShow(params.projectName, reportContent);
    }

    async storeSubProjectReports(params: StoreSubProjectReportsRequest): Promise<void> {
        this.subProjectReports.clear();
        Object.entries(params.reports).forEach(([projectName, reportContent]) => {
            this.subProjectReports.set(projectName, reportContent);
        });
    }

    async saveMigrationReport(params: SaveMigrationReportRequest): Promise<void> {

        // Check if this is a multi-project save (has projectReports)
        const hasMultipleProjects = params.projectReports && Object.keys(params.projectReports).length > 0;

        if (hasMultipleProjects) {
            // For multi-project scenarios, show folder dialog
            // Default to workspace root, or home directory as fallback (works on all OSes)
            let defaultUri: any;
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                defaultUri = vscode.workspace.workspaceFolders[0].uri;
            } else {
                // Fall back to user's home directory (cross-platform)
                defaultUri = vscode.Uri.file(os.homedir());
            }

            const folderUri = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                canSelectMany: false,
                defaultUri: defaultUri,
                title: 'Select folder to save migration reports'
            });

            if (!folderUri || folderUri.length === 0) {
                return;
            }

            const baseDir = folderUri[0];

            try {
                // Write the aggregate report at the root
                const aggregateReportPath = path.join(baseDir.fsPath, params.defaultFileName);
                await vscode.workspace.fs.writeFile(
                    vscode.Uri.file(aggregateReportPath),
                    new TextEncoder().encode(params.reportContent)
                );
                console.log(`Aggregate migration report saved to ${aggregateReportPath}`);

                // Write per-project reports in subdirectories
                for (const [projectName, reportContent] of Object.entries(params.projectReports)) {
                    const projectDir = path.join(baseDir.fsPath, projectName);
                    const projectReportPath = path.join(projectDir, 'migration_report.html');

                    // Create project subdirectory if it doesn't exist
                    await vscode.workspace.fs.createDirectory(vscode.Uri.file(projectDir));

                    // Write project report
                    await vscode.workspace.fs.writeFile(
                        vscode.Uri.file(projectReportPath),
                        new TextEncoder().encode(reportContent)
                    );
                    console.log(`Project migration report saved to ${projectReportPath}`);
                }

                vscode.window.showInformationMessage(
                    `Migration reports saved successfully to ${baseDir.fsPath}`
                );
            } catch (error) {
                console.error('Failed to save multi-project migration reports:', error);
                vscode.window.showErrorMessage(`Failed to save migration reports: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            // Single project - use simple save dialog
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(params.defaultFileName),
                filters: {
                    'HTML files': ['html'],
                    'All files': ['*']
                }
            });

            if (saveUri) {
                // Write the report content to the selected file
                await vscode.workspace.fs.writeFile(saveUri, new TextEncoder().encode(params.reportContent));
                vscode.window.showInformationMessage(`Migration report saved to ${saveUri.fsPath}`);
            }
        }
    }

    async migrateProject(params: MigrateRequest): Promise<void> {
        const projectRoot = await createBIProjectFromMigration(params);

        if (params.aiFeatureUsed === true && projectRoot) {
            // Store the project root for wizard-level AI enhancement.
            // The webview will call wizardEnhancementReady once it shows the
            // enhancement step, which triggers the agent.
            setWizardProjectRoot(projectRoot, params.sourcePath, params.keepStructure);
        }
    }

    async getActiveMigrationSession(): Promise<ActiveMigrationSession> {
        return getActiveMigrationSessionState() as ActiveMigrationSession;
    }

    async markEnhancementComplete(): Promise<void> {
        markEnhancementComplete();
    }

    async startMigrationEnhancement(): Promise<void> {
        await startMigrationEnhancement();
    }

    /**
     * Called by the migration panel webview once it's mounted and ready to
     * receive streaming events. If the session is active and not yet enhanced,
     * kicks off the migration agent.
     */
    async migrationPanelReady(): Promise<void> {
        const session = getActiveMigrationSessionState();
        if (session.isActive && !session.fullyEnhanced) {
            // Fire and forget – the agent streams events back to the panel
            runMigrationAgent().catch((err) =>
                console.error("[MigrateIntegrationRpc] Migration agent failed:", err)
            );
        }
    }

    /**
     * Called by the Visualizer webview (ImportIntegration wizard) once the
     * AI enhancement step is visible and ready to receive streaming events.
     * Kicks off the wizard-level migration agent.
     */
    async wizardEnhancementReady(): Promise<void> {
        runWizardMigrationEnhancement().catch((err) =>
            console.error("[MigrateIntegrationRpc] Wizard migration agent failed:", err)
        );
    }

    /**
     * Opens the migrated project in VS Code after wizard-level AI enhancement
     * completes or the user skips it.
     */
    async openMigratedProjectInVSCode(): Promise<void> {
        openMigratedProject();
    }

    async abortMigrationAgent(): Promise<void> {
        abortMigrationAgent();
    }

    async setMigrationModel(modelId: string): Promise<void> {
        setMigrationModelId(modelId);
    }

    async seedMigrationHistory(): Promise<boolean> {
        return seedMigrationHistoryIntoChatState();
    }

    async getMigrationHistoryMessages(): Promise<Array<{ role: string; content: string }>> {
        return getMigrationHistoryMessages();
    }
}
