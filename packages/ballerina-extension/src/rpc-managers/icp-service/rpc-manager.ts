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
 */
import {
    ICPServiceAPI,
    ICPEnabledRequest,
    ICPEnabledResponse,
    isSamePath,
    TextEdit,
    WorkflowManagementResponse,
} from "@wso2/ballerina-core";
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { StateMachine } from "../../stateMachine";
import { updateSourceCode } from "../../utils/source-utils";
import { parse, stringify } from "@iarna/toml";
import { WorkflowManagementServiceRpcManager } from "../workflow-management-service/rpc-manager";
import { getProjectHandle, getStoredICPSecret } from "../../features/icp/setup";
import { ensureICPServerRunning, isICPServerRunning, getICPUrl } from "../../features/icp";

const ICP_IMPORTS = [
    'import wso2/icp.runtime.bridge as _;',
    'import ballerinax/metrics.logs as _;',
];

function getIntegrationName(projectPath: string): string {
    const context = StateMachine.context();
    const projectInfo = context.projectInfo;

    // title is the integration display name, name is the package name
    if (projectInfo?.children?.length) {
        const matched = projectInfo.children.find(child => isSamePath(child.projectPath, projectPath));
        if (matched) {
            return matched.title || matched.name || path.basename(projectPath);
        }
    }

    return projectInfo?.title || projectInfo?.name || path.basename(projectPath);
}

function buildAddImportsTextEdits(projectPath: string): { [key: string]: TextEdit[] } {
    const mainBalPath = path.join(projectPath, 'main.bal');
    if (!fs.existsSync(mainBalPath)) {
        return {};
    }

    const content = fs.readFileSync(mainBalPath, 'utf-8');
    const lines = content.split('\n');

    const missingImports = ICP_IMPORTS.filter(imp => !content.includes(imp));
    if (missingImports.length === 0) {
        return {};
    }

    // Insert after the last existing import line
    let insertLine = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('import ')) {
            insertLine = i + 1;
        }
    }

    const newText = missingImports.join('\n') + '\n';
    const edit: TextEdit = {
        range: {
            start: { line: insertLine, character: 0 },
            end: { line: insertLine, character: 0 },
        },
        newText,
    };

    return { [mainBalPath]: [edit] };
}

function buildRemoveImportsTextEdits(projectPath: string): { [key: string]: TextEdit[] } {
    const mainBalPath = path.join(projectPath, 'main.bal');
    if (!fs.existsSync(mainBalPath)) {
        return {};
    }

    const content = fs.readFileSync(mainBalPath, 'utf-8');
    const lines = content.split('\n');

    const edits: TextEdit[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (ICP_IMPORTS.includes(lines[i].trim())) {
            edits.push({
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i + 1, character: 0 },
                },
                newText: '',
            });
        }
    }

    if (edits.length === 0) {
        return {};
    }

    // Sort in reverse line order so removals don't shift subsequent line numbers
    edits.sort((a, b) => b.range.start.line - a.range.start.line);
    return { [mainBalPath]: edits };
}

function addICPBuildOptions(projectPath: string): void {
    const tomlPath = path.join(projectPath, 'Ballerina.toml');
    if (!fs.existsSync(tomlPath)) {
        return;
    }

    let content = fs.readFileSync(tomlPath, 'utf-8');
    const sectionHeader = '[build-options]';
    const lines = content.split('\n');
    const sectionIndex = lines.findIndex(line => line.trim() === sectionHeader);

    if (sectionIndex !== -1) {
        // Section exists — update/add keys within it
        let insertIndex = sectionIndex + 1;
        // Find the end of this section
        let sectionEnd = lines.length;
        for (let i = sectionIndex + 1; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                sectionEnd = i;
                break;
            }
            insertIndex = i + 1;
        }

        // Check if keys already exist, if not add them
        const sectionLines = lines.slice(sectionIndex + 1, sectionEnd);
        const hasObservability = sectionLines.some(l => l.trim().startsWith('observabilityIncluded'));
        const hasRemoteMgmt = sectionLines.some(l => l.trim().startsWith('remoteManagement'));

        const newLines: string[] = [];
        if (!hasObservability) { newLines.push('observabilityIncluded = true'); }
        if (!hasRemoteMgmt) { newLines.push('remoteManagement = true'); }

        if (newLines.length > 0) {
            lines.splice(sectionIndex + 1, 0, ...newLines);
        }
    } else {
        // Section doesn't exist — append it
        lines.push('', sectionHeader, 'observabilityIncluded = true', 'remoteManagement = true');
    }

    content = lines.join('\n');
    if (!content.endsWith('\n')) { content += '\n'; }
    fs.writeFileSync(tomlPath, content, 'utf-8');
}

function removeICPBuildOptions(projectPath: string): void {
    const tomlPath = path.join(projectPath, 'Ballerina.toml');
    if (!fs.existsSync(tomlPath)) {
        return;
    }

    let content = fs.readFileSync(tomlPath, 'utf-8');
    const lines = content.split('\n');
    const sectionHeader = '[build-options]';
    const sectionIndex = lines.findIndex(line => line.trim() === sectionHeader);

    if (sectionIndex === -1) {
        return;
    }

    // Find section boundaries
    let sectionEnd = lines.length;
    for (let i = sectionIndex + 1; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            sectionEnd = i;
            break;
        }
    }

    // Remove only the ICP-added keys
    const keysToRemove = ['observabilityIncluded', 'remoteManagement'];
    const filteredSection = lines.slice(sectionIndex + 1, sectionEnd).filter(line => {
        const trimmed = line.trim();
        return !keysToRemove.some(key => trimmed.startsWith(key));
    });

    // If no keys remain, remove the entire section
    if (filteredSection.every(l => l.trim() === '')) {
        lines.splice(sectionIndex, sectionEnd - sectionIndex);
    } else {
        lines.splice(sectionIndex + 1, sectionEnd - sectionIndex - 1, ...filteredSection);
    }

    content = lines.join('\n');
    if (content.length > 0 && !content.endsWith('\n')) { content += '\n'; }
    fs.writeFileSync(tomlPath, content, 'utf-8');
}

async function addICPConfigToml(projectPath: string): Promise<void> {
    const configPath = path.join(projectPath, 'Config.toml');
    let config: Record<string, any> = {};

    if (fs.existsSync(configPath)) {
        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            config = parse(content) as Record<string, any>;
        } catch (error) {
            console.error('[ICP] Error reading Config.toml:', error);
        }
    }

    // Build nested structure for [wso2.icp.runtime.bridge]
    if (!config.wso2) { config.wso2 = {}; }
    if (!config.wso2.icp) { config.wso2.icp = {}; }
    if (!config.wso2.icp.runtime) { config.wso2.icp.runtime = {}; }

    // Merge with existing bridge config to preserve keys like secret
    const existingBridge = config.wso2?.icp?.runtime?.bridge ?? {};
    const storedSecret = await getStoredICPSecret(projectPath);

    config.wso2.icp.runtime.bridge = {
        ...existingBridge,
        environment: 'dev',
        project: getProjectHandle(projectPath),
        integration: getIntegrationName(projectPath),
        runtime: os.hostname(),
        ...(storedSecret ? { secret: storedSecret } : {}),
    };

    fs.writeFileSync(configPath, stringify(config), 'utf-8');
}

function removeICPConfigToml(projectPath: string): void {
    const configPath = path.join(projectPath, 'Config.toml');

    if (!fs.existsSync(configPath)) {
        return;
    }

    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = parse(content) as Record<string, any>;

        // Remove the bridge section
        if (config.wso2?.icp?.runtime?.bridge) {
            delete config.wso2.icp.runtime.bridge;

            // Clean up empty parent objects
            if (Object.keys(config.wso2.icp.runtime).length === 0) { delete config.wso2.icp.runtime; }
            if (Object.keys(config.wso2.icp).length === 0) { delete config.wso2.icp; }
            if (Object.keys(config.wso2).length === 0) { delete config.wso2; }
        }

        fs.writeFileSync(configPath, stringify(config), 'utf-8');
    } catch (error) {
        console.error('[ICP] Error removing ICP config from Config.toml:', error);
    }
}

export class ICPServiceRpcManager implements ICPServiceAPI {

    async addICP(params: ICPEnabledRequest): Promise<ICPEnabledResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const projectPath: string = params.projectPath || context.projectPath;
                const param = { projectPath };
                const importEdits = buildAddImportsTextEdits(projectPath);
                if (Object.keys(importEdits).length > 0) {
                    await updateSourceCode({ textEdits: importEdits, description: 'ICP Creation' });
                }
                addICPBuildOptions(projectPath);
                await addICPConfigToml(projectPath);
                // When the integration contains workflow functions, enabling ICP also enables
                // Workflow Management by default (saving a click). The user can still disable it
                // independently afterwards.
                try {
                    const shouldEnableWfMgmt = await context.langClient
                        .shouldEnableWorkflowManagementByDefault(param) as WorkflowManagementResponse;
                    if (shouldEnableWfMgmt?.enabled) {
                        const wfMgmtResult = await new WorkflowManagementServiceRpcManager()
                            .addWorkflowManagement(param);
                        if (!wfMgmtResult?.enabled) {
                            console.log('[ICP] Auto-enable of Workflow Management did not take effect:', wfMgmtResult);
                        }
                    }
                } catch (wfError) {
                    console.log('[ICP] Failed to auto-enable Workflow Management:', wfError);
                }
                const result: ICPEnabledResponse = await context.langClient.isIcpEnabled(param);
                resolve(result);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async disableICP(params: ICPEnabledRequest): Promise<ICPEnabledResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const projectPath: string = params.projectPath || context.projectPath;
                const param = { projectPath };
                const importEdits = buildRemoveImportsTextEdits(projectPath);
                if (Object.keys(importEdits).length > 0) {
                    await updateSourceCode({ textEdits: importEdits, description: 'ICP Disable' });
                }
                removeICPBuildOptions(projectPath);
                removeICPConfigToml(projectPath);
                const result: ICPEnabledResponse = await context.langClient.isIcpEnabled(param);
                resolve(result);
            } catch (error) {
                console.log(error);
            }
        });
    }


    async isICPServerRunning(params: ICPEnabledRequest): Promise<ICPEnabledResponse> {
        return { enabled: isICPServerRunning() };
    }

    async viewInICP(params: ICPEnabledRequest): Promise<ICPEnabledResponse> {
        try {
            const icpUrl = getICPUrl();

            if (isICPServerRunning()) {
                await vscode.env.openExternal(vscode.Uri.parse(icpUrl));
                return { enabled: true };
            }

            const action = await vscode.window.showWarningMessage(
                'ICP server is not running. Start the server to view the ICP dashboard?',
                'Start ICP Server',
                'Cancel'
            );

            if (action !== 'Start ICP Server') {
                return { enabled: false };
            }

            await vscode.commands.executeCommand('ballerina.icp.start');

            if (!isICPServerRunning()) {
                return { enabled: false };
            }

            await vscode.env.openExternal(vscode.Uri.parse(icpUrl));
            return { enabled: true };
        } catch (error) {
            console.log(error);
            return { enabled: false, errorMsg: `Failed to open ICP: ${error}` };
        }
    }

    async isIcpEnabled(params: ICPEnabledRequest): Promise<ICPEnabledResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const projectPath: string = params.projectPath || context.projectPath;
                const param = { projectPath };
                const res: ICPEnabledResponse = await context.langClient.isIcpEnabled(param);
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }
}
