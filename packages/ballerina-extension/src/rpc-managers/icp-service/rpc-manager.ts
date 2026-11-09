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
} from "@wso2/ballerina-core";
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { StateMachine } from "../../stateMachine";
import { parse, stringify } from "@iarna/toml";
import { getProjectHandle, getStoredICPSecret } from "../../features/icp/setup";
import { ensureICPServerRunning, isICPServerRunning, getICPUrl } from "../../features/icp";
import { isICPSupported } from "../../utils/config";
import { addICPBuildOptions, removeICPBuildOptions } from "./build-options";
import {
    ballerinaTomlPathOf,
    configTomlPathOf,
    buildAddImportsTextEdits,
    buildRemoveImportsTextEdits,
    checkCanToggleICP,
    isICPEnabledOnDisk,
} from "./icp-files";

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

// Not updateSourceCode: it waits for an artifact change, and an import-only edit makes none, so it
// timed out and aborted the toggle before the Ballerina.toml and Config.toml writes.
async function applyImportEdits(textEdits: { [key: string]: TextEdit[] }): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    for (const [filePath, edits] of Object.entries(textEdits)) {
        const uri = vscode.Uri.file(filePath);
        if (!fs.existsSync(filePath)) {
            workspaceEdit.createFile(uri, { ignoreIfExists: true });
        }
        for (const edit of edits) {
            const { start, end } = edit.range;
            workspaceEdit.replace(uri, new vscode.Range(start.line, start.character, end.line, end.character), edit.newText);
        }
    }
    if (!await vscode.workspace.applyEdit(workspaceEdit)) {
        throw new Error('Failed to update the ICP imports');
    }
    for (const filePath of Object.keys(textEdits)) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        if (document.isDirty && !await document.save()) {
            throw new Error(`Failed to save the ICP imports in ${filePath}`);
        }
    }
}

function isUnsaved(filePath: string): boolean {
    return vscode.workspace.textDocuments.some(document => document.isDirty && isSamePath(document.uri.fsPath, filePath));
}

// Tell the user why the toggle failed rather than leaving the checkbox to change silently.
function reportFailure(enabled: boolean, errorMsg: string): ICPEnabledResponse {
    vscode.window.showErrorMessage(errorMsg);
    return { enabled, errorMsg };
}

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function updateBallerinaToml(projectPath: string, edit: (content: string) => string): void {
    const tomlPath = ballerinaTomlPathOf(projectPath);
    const content = fs.readFileSync(tomlPath, 'utf-8');
    const updated = edit(content);
    if (updated !== content) {
        fs.writeFileSync(tomlPath, updated, 'utf-8');
    }
}

async function addICPConfigToml(projectPath: string): Promise<void> {
    const configPath = configTomlPathOf(projectPath);
    let config: Record<string, any> = {};

    // A Config.toml that does not parse is left alone: writing over it would drop the user's
    // own configuration.
    if (fs.existsSync(configPath)) {
        config = parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>;
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
    const configPath = configTomlPathOf(projectPath);

    if (!fs.existsSync(configPath)) {
        return;
    }

    // Throws on a Config.toml that does not parse, so disableICP reports it rather than
    // reporting success with the bridge settings still in place.
    const config = parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>;
    if (!config.wso2?.icp?.runtime?.bridge) {
        return;
    }

    delete config.wso2.icp.runtime.bridge;
    // Clean up empty parent objects
    if (Object.keys(config.wso2.icp.runtime).length === 0) { delete config.wso2.icp.runtime; }
    if (Object.keys(config.wso2.icp).length === 0) { delete config.wso2.icp; }
    if (Object.keys(config.wso2).length === 0) { delete config.wso2; }

    fs.writeFileSync(configPath, stringify(config), 'utf-8');
}

export class ICPServiceRpcManager implements ICPServiceAPI {

    async addICP(params: ICPEnabledRequest): Promise<ICPEnabledResponse> {
        if (!isICPSupported()) {
            return { enabled: false };
        }
        const projectPath: string = params.projectPath || StateMachine.context().projectPath;
        try {
            checkCanToggleICP(projectPath, isUnsaved, true);
            await applyImportEdits(buildAddImportsTextEdits(projectPath));
            updateBallerinaToml(projectPath, addICPBuildOptions);
            await addICPConfigToml(projectPath);
            return { enabled: isICPEnabledOnDisk(projectPath) };
        } catch (error) {
            console.error('[ICP] Failed to enable ICP for', projectPath, error);
            // Report off even if the imports and build options were written: every step is
            // idempotent, so the user can tick the checkbox again to retry.
            return reportFailure(false, `Failed to enable ICP: ${errorText(error)}`);
        }
    }

    async disableICP(params: ICPEnabledRequest): Promise<ICPEnabledResponse> {
        if (!isICPSupported()) {
            return { enabled: false };
        }
        const projectPath: string = params.projectPath || StateMachine.context().projectPath;
        try {
            checkCanToggleICP(projectPath, isUnsaved, false);
            await applyImportEdits(buildRemoveImportsTextEdits(projectPath));
            updateBallerinaToml(projectPath, removeICPBuildOptions);
            removeICPConfigToml(projectPath);
            return { enabled: isICPEnabledOnDisk(projectPath) };
        } catch (error) {
            console.error('[ICP] Failed to disable ICP for', projectPath, error);
            // The files may be partly reverted, so report what they now say.
            return reportFailure(isICPEnabledOnDisk(projectPath), `Failed to disable ICP: ${errorText(error)}`);
        }
    }

    async isICPServerRunning(params: ICPEnabledRequest): Promise<ICPEnabledResponse> {
        return { enabled: isICPSupported() && isICPServerRunning() };
    }

    async viewInICP(params: ICPEnabledRequest): Promise<ICPEnabledResponse> {
        if (!isICPSupported()) {
            return { enabled: false };
        }
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

    // The same check addICP and disableICP report, so the checkbox reads a half-done enable as off.
    async isIcpEnabled(params: ICPEnabledRequest): Promise<ICPEnabledResponse> {
        if (!isICPSupported()) {
            return { enabled: false };
        }
        return { enabled: isICPEnabledOnDisk(params.projectPath || StateMachine.context().projectPath) };
    }
}
