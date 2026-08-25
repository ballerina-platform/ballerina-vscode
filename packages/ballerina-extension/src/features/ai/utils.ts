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

import * as fs from 'fs';
import path from "path";
import vscode, { Uri, workspace } from 'vscode';
import { parse as parseToml } from '@iarna/toml';
import { removeConfigKeys } from '../../utils/toml-utils';

import { StateMachine } from "../../stateMachine";
import {
    getRefreshedAccessToken,
    TOKEN_NOT_AVAILABLE_ERROR_MESSAGE,
    getAuthCredentials,
    isPlatformExtensionAvailable,
    isDevantUserLoggedIn,
    getPlatformStsToken,
    exchangeStsToCopilotToken,
    storeAuthCredentials,
    NO_AUTH_CREDENTIALS_FOUND,
    getAccessToken
} from '../../utils/ai/auth';
import { AIStateMachine } from '../../views/ai-panel/aiMachine';
import { AIMachineEventType } from '@wso2/ballerina-core/lib/state-machine-types';
import { CONFIG_FILE_NAME, DEFAULT_PROVIDER_TOKEN_REFRESH_FAILED, ERROR_NO_BALLERINA_SOURCES, LLM_API_BASE_PATH, PROGRESS_BAR_MESSAGE_FROM_WSO2_DEFAULT_EMBEDDING, PROGRESS_BAR_MESSAGE_FROM_WSO2_DEFAULT_MODEL } from './constants';
import { getCurrentBallerinaProjectFromContext } from '../config-generator/configGenerator';
import { BallerinaProject, LoginMethod, AuthCredentials, DefaultProviderKind } from '@wso2/ballerina-core';
import { BallerinaExtension } from 'src/core';

const config = workspace.getConfiguration('ballerina');
const PLATFORM_ENV_SETTING = "WSO2.WSO2-Platform.Advanced.ChoreoEnvironment";
// Same order the WSO2 Platform extension resolves its environment in.
const devantEnv = (process.env.CHOREO_ENV || process.env.CLOUD_ENV
    || workspace.getConfiguration().get<string>(PLATFORM_ENV_SETTING) || "").trim().toLowerCase();
const COPILOT_ROOT_URLS = new Map<string, string>([
    ["dev", process.env.COPILOT_DEV_ROOT_URL],
    ["stage", process.env.COPILOT_STAGE_ROOT_URL || process.env.COPILOT_DEV_ROOT_URL],
]);
export const BACKEND_URL: string = config.get('rootUrl') || COPILOT_ROOT_URLS.get(devantEnv) || process.env.COPILOT_ROOT_URL;

export const DEVANT_TOKEN_EXCHANGE_URL: string = BACKEND_URL + "/auth-api/v1.0/auth/token-exchange";

// This refers to old backend before FE Migration. We need to eventually remove this.
export const OLD_BACKEND_URL: string = BACKEND_URL + "/v2.0";

export async function closeAllBallerinaFiles(dirPath: string): Promise<void> {
    // Check if the directory exists
    if (!fs.existsSync(dirPath)) {
        console.error(`Directory does not exist: ${dirPath}`);
        return;
    }

    // Get the language client
    const langClient = StateMachine.langClient();

    // Function to recursively find and close .bal files
    async function processDir(currentPath: string): Promise<void> {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = path.join(currentPath, entry.name);

            if (entry.isDirectory()) {
                // Recursively process subdirectories
                await processDir(entryPath);
            } else if (entry.isFile() && entry.name.endsWith('.bal')) {
                // Convert file path to URI
                const fileUri = Uri.file(entryPath).toString();

                // Call didClose for this Ballerina file
                await langClient.didClose({
                    textDocument: { uri: fileUri }
                });
                await langClient.didChangedWatchedFiles({
                    changes: [
                        {
                            uri: fileUri,
                            type: 3
                        }
                    ]
                });

                console.log(`Closed file: ${entryPath}`);
            }
        }
    }

    // Start the recursive processing
    await processDir(dirPath);
}

export async function getConfigFilePath(ballerinaExtInstance: BallerinaExtension, rootPath: string): Promise<string> {
    if (await isBallerinaProjectAsync(rootPath)) {
        return rootPath;
    }

    const activeTextEditor = vscode.window.activeTextEditor;
    const currentProject = ballerinaExtInstance.getDocumentContext().getCurrentProject();
    let activeFilePath = "";
    let configPath = "";

    if (rootPath !== "") {
        return rootPath;
    }

    if (activeTextEditor) {
        activeFilePath = activeTextEditor.document.uri.fsPath;
    }

    if (currentProject == null && activeFilePath == "") {
        return await showNoBallerinaSourceWarningMessage();
    }

    try {
        const currentBallerinaProject: BallerinaProject = await getCurrentBallerinaProjectFromContext(ballerinaExtInstance);

        if (!currentBallerinaProject) {
            return await showNoBallerinaSourceWarningMessage();
        }

        if (currentBallerinaProject.kind == 'SINGLE_FILE_PROJECT') {
            configPath = path.dirname(currentBallerinaProject.path);
        } else {
            configPath = currentBallerinaProject.path;
        }

        if (configPath == undefined || configPath == "") {
            return await showNoBallerinaSourceWarningMessage();
        }
        return configPath;
    } catch (error) {
        return await showNoBallerinaSourceWarningMessage();
    }
}

export async function getTokenForDefaultModel() {
    // Priority 1: Check stored credentials
    const credentials = await getAuthCredentials();

    if (credentials) {
        if (!credentials) {
            throw new Error(NO_AUTH_CREDENTIALS_FOUND);
        }

        // Check login method and handle accordingly
        if (credentials.loginMethod === LoginMethod.BI_INTEL) {
            // Re-exchange STS token to get a fresh token
            const token = await getRefreshedAccessToken();
            return token;
        } else {
            const errorMessage = 'This feature is only available for BI Intelligence users.';
            vscode.window.showErrorMessage(errorMessage);
            throw new Error(errorMessage);
        }
    }

    // Priority 2: No stored credentials — check Devant Platform extension
    if (isPlatformExtensionAvailable()) {
        const isLoggedIn = await isDevantUserLoggedIn();
        if (isLoggedIn) {
            const stsToken = await getPlatformStsToken();
            if (stsToken) {
                const secrets = await exchangeStsToCopilotToken(stsToken);
                const newCredentials: AuthCredentials = {
                    loginMethod: LoginMethod.BI_INTEL,
                    secrets
                };
                await storeAuthCredentials(newCredentials);
                return secrets.accessToken;
            }
        }
    }

    throw new Error(TOKEN_NOT_AVAILABLE_ERROR_MESSAGE);
}

// Function to find a file in a case-insensitive way
function findFileCaseInsensitive(directory: string, fileName: string): string {
    const files = fs.readdirSync(directory);
    const targetFile = files.find(file => file.toLowerCase() === fileName.toLowerCase());
    const file = targetFile ? targetFile : fileName;
    return path.join(directory, file);
}

// Helper to add or replace a config line
function addOrReplaceConfigLine(lines: string[], key: string, value: string) {
    const configLine = `${key} = "${value}"`;
    const idx = lines.findIndex(l => l.trim().startsWith(`${key} =`));
    if (idx === -1) {
        // Add after header
        lines.splice(1, 0, configLine);
    } else {
        lines[idx] = configLine;
    }
}

const WSO2_PROVIDER_CONFIG_TABLE = `[ballerina.ai.wso2ProviderConfig]`;

function addDefaultModelConfig(
    projectPath: string, token: string, backendUrl: string): boolean {
    const targetTable = WSO2_PROVIDER_CONFIG_TABLE;
    const SERVICE_URL_KEY = 'serviceUrl';
    const ACCESS_TOKEN_KEY = 'accessToken';
    const urlLine = `${SERVICE_URL_KEY} = "${backendUrl}"`;
    const accessTokenLine = `${ACCESS_TOKEN_KEY} = "${token}"`;
    const configFilePath = findFileCaseInsensitive(projectPath, CONFIG_FILE_NAME);

    let fileContent = '';

    if (fs.existsSync(configFilePath)) {
        fileContent = fs.readFileSync(configFilePath, 'utf-8');
    }

    const tableStartIndex = fileContent.indexOf(targetTable);

    if (tableStartIndex === -1) {
        // Table doesn't exist, create it
        if (fileContent.length > 0 && !fileContent.endsWith('\n')) {
            fileContent += '\n\n';
        }
        fileContent += `\n${targetTable}\n${urlLine}\n${accessTokenLine}\n`;
        fs.writeFileSync(configFilePath, fileContent);
        return true;
    }

    // Table exists, update it
    // Find the end of the table (next table or end of file)
    let tableEndIndex = fileContent.indexOf('\n[', tableStartIndex);
    if (tableEndIndex === -1) {
        tableEndIndex = fileContent.length;
    }

    // Extract table content and split into lines once
    let tableContent = fileContent.substring(tableStartIndex, tableEndIndex);
    let lines = tableContent.split('\n');

    // Add or replace serviceUrl
    addOrReplaceConfigLine(lines, SERVICE_URL_KEY, backendUrl);
    // Add or replace accessToken (after serviceUrl)
    // Ensure accessToken is after serviceUrl
    let serviceUrlIdx = lines.findIndex(l => l.trim().startsWith(`${SERVICE_URL_KEY} =`));
    let accessTokenIdx = lines.findIndex(l => l.trim().startsWith(`${ACCESS_TOKEN_KEY} =`));
    if (accessTokenIdx === -1) {
        lines.splice(serviceUrlIdx + 1, 0, `${ACCESS_TOKEN_KEY} = "${token}"`);
    } else {
        lines[accessTokenIdx] = `${ACCESS_TOKEN_KEY} = "${token}"`;
        // Move accessToken if not after serviceUrl
        if (accessTokenIdx !== serviceUrlIdx + 1) {
            const accessTokenLine = lines[accessTokenIdx];
            lines.splice(accessTokenIdx, 1);
            lines.splice(serviceUrlIdx + 1, 0, accessTokenLine);
        }
    }

    // Join lines and replace the table in the file content
    const updatedTableContent = lines.join('\n');
    fileContent = fileContent.substring(0, tableStartIndex) + updatedTableContent + fileContent.substring(tableEndIndex);
    fs.writeFileSync(configFilePath, fileContent);
    return true;
}

// Also writes to tests/Config.toml if that folder exists.
function writeDefaultModelConfigToProject(projectPath: string, token: string): boolean {
    const openAiEpUrl = BACKEND_URL + LLM_API_BASE_PATH + "/openai";
    const success = addDefaultModelConfig(projectPath, token, openAiEpUrl);

    const testsDir = path.join(projectPath, 'tests');
    if (fs.existsSync(testsDir) && fs.statSync(testsDir).isDirectory()) {
        addDefaultModelConfig(testsDir, token, openAiEpUrl);
    }

    return success;
}

/**
 * Options for {@link addConfigFile}.
 *
 * `signOutOnFailure` is what a failed token fetch means to the caller. For the interactive flows it
 * means the session is no longer usable, so the user is signed out. A caller that configures the
 * provider as a non-fatal side effect of something else (creating a durable agent, say) must pass
 * `false`: ending the user's AI session because a background write hit a network blip is a much
 * larger consequence than the write it was attached to.
 */
export interface AddConfigFileOptions {
    signOutOnFailure?: boolean;
}

export async function addConfigFile(
    configPath: string,
    kind: DefaultProviderKind = "model",
    options: AddConfigFileOptions = {}
): Promise<boolean> {
    const signOutOnFailure = options.signOutOnFailure ?? true;
    const progress = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: kind === "embedding" ? PROGRESS_BAR_MESSAGE_FROM_WSO2_DEFAULT_EMBEDDING : PROGRESS_BAR_MESSAGE_FROM_WSO2_DEFAULT_MODEL,
            cancellable: false,
        },
        async () => {
            try {
                const token: string | null = await getTokenForDefaultModel();
                if (token === null) {
                    if (signOutOnFailure) {
                        AIStateMachine.service().send(AIMachineEventType.LOGOUT);
                    }
                    throw new Error(TOKEN_NOT_AVAILABLE_ERROR_MESSAGE);
                }

                if (writeDefaultModelConfigToProject(configPath, token)) {
                    return true;
                }
            } catch (error) {
                if (signOutOnFailure) {
                    AIStateMachine.service().send(AIMachineEventType.LOGOUT);
                }
                throw error;
            }
        }
    );
    return progress;
}

function hasConfiguredProviderToken(projectPath: string): boolean {
    const configFilePath = findFileCaseInsensitive(projectPath, CONFIG_FILE_NAME);
    if (!fs.existsSync(configFilePath)) {
        return false;
    }

    try {
        const config = parseToml(fs.readFileSync(configFilePath, 'utf-8')) as any;
        return typeof config?.ballerina?.ai?.wso2ProviderConfig?.accessToken === 'string';
    } catch (error) {
        console.error('Failed to parse Config.toml while checking the WSO2 default provider token:', error);
        return false;
    }
}

// Calls that pull the WSO2 default provider into generated code.
const DEFAULT_PROVIDER_SOURCE_MARKERS = ['getDefaultModelProvider', 'getDefaultEmbeddingProvider'];

async function isDefaultProviderReferencedInSource(projectPath: string): Promise<boolean> {
    const projectSource = await getProjectSourceWithTests(projectPath);
    if (!projectSource) {
        return false;
    }

    const allSourceFiles = [
        ...projectSource.sourceFiles,
        ...projectSource.projectModules.flatMap(m => m.sourceFiles),
        ...projectSource.projectTests
    ];
    return allSourceFiles.some(({ content }) =>
        DEFAULT_PROVIDER_SOURCE_MARKERS.some(marker => content.includes(marker)));
}

function removeDefaultProviderConfigFromProject(projectPath: string): void {
    for (const dir of [projectPath, path.join(projectPath, 'tests')]) {
        if (fs.existsSync(dir)) {
            removeConfigKeys(findFileCaseInsensitive(dir, CONFIG_FILE_NAME), ['wso2ProviderConfig'], 'ballerina', 'ai');
        }
    }
}

// Refreshes the token if still used; removes the stale config entry otherwise.
export async function refreshDefaultProviderToken(projectPath: string): Promise<void> {
    if (!hasConfiguredProviderToken(projectPath)) {
        return;
    }

    try {
        if (!(await isDefaultProviderReferencedInSource(projectPath))) {
            removeDefaultProviderConfigFromProject(projectPath);
            return;
        }

        const credentials = await getAccessToken();
        if (credentials?.loginMethod !== LoginMethod.BI_INTEL) {
            return;
        }

        writeDefaultModelConfigToProject(projectPath, credentials.secrets.accessToken);
    } catch (error) {
        console.error('Failed to refresh the WSO2 default model provider token:', error);
        vscode.window.showWarningMessage(DEFAULT_PROVIDER_TOKEN_REFRESH_FAILED);
    }
}

export async function isBallerinaProjectAsync(rootPath: string): Promise<boolean> {
    try {
        if (!fs.existsSync(rootPath)) {
            return false;
        }

        const files = fs.readdirSync(rootPath);
        return files.some(file =>
            file.toLowerCase() === 'ballerina.toml' ||
            file.toLowerCase().endsWith('.bal')
        );
    } catch (error) {
        console.error(`Error checking Ballerina project: ${error}`);
        return false;
    }
}

async function showNoBallerinaSourceWarningMessage() {
    return await vscode.window.showWarningMessage(ERROR_NO_BALLERINA_SOURCES);
}

// =========== PROJECT ANALYSIS UTILITIES ===========

import { ProjectSource, ProjectModule, OpenAPISpec } from '@wso2/ballerina-core';
import { langClient } from './activator';

/**
 * Gets the project source including all .bal files and modules
 */
export async function getProjectSource(projectRoot: string): Promise<ProjectSource | null> {

    const projectSource: ProjectSource = {
        sourceFiles: [],
        projectTests: [],
        projectModules: [],
        projectName: "",
        packagePath: projectRoot,
        isActive: true
    };

    // Read root-level .bal files
    const rootFiles = fs.readdirSync(projectRoot);
    for (const file of rootFiles) {
        if (file.endsWith('.bal')) {
            const filePath = path.join(projectRoot, file);
            const content = await fs.promises.readFile(filePath, 'utf-8');
            projectSource.sourceFiles.push({ filePath, content });
        }
    }

    // Read modules
    const modulesDir = path.join(projectRoot, 'modules');
    if (fs.existsSync(modulesDir)) {
        const modules = fs.readdirSync(modulesDir, { withFileTypes: true });
        for (const moduleDir of modules) {
            if (moduleDir.isDirectory()) {
                const projectModule: ProjectModule = {
                    moduleName: moduleDir.name,
                    sourceFiles: [],
                    isGenerated: false,
                };

                const moduleFiles = fs.readdirSync(path.join(modulesDir, moduleDir.name));
                for (const file of moduleFiles) {
                    if (file.endsWith('.bal')) {
                        const filePath = path.join(modulesDir, moduleDir.name, file);
                        const content = await fs.promises.readFile(filePath, 'utf-8');
                        projectModule.sourceFiles.push({ filePath, content });
                    }
                }

                projectSource.projectModules.push(projectModule);
            }
        }
    }

    return projectSource;
}

/**
 * Gets the project source including test files
 */
export async function getProjectSourceWithTests(projectRoot: string): Promise<ProjectSource | null> {

    const projectSourceWithTests: ProjectSource = await getProjectSource(projectRoot);

    // Read tests
    const testsDir = path.join(projectRoot, 'tests');
    if (fs.existsSync(testsDir)) {
        const testFiles = fs.readdirSync(testsDir);
        for (const file of testFiles) {
            if (file.endsWith('.bal') || file.endsWith('Config.toml')) {
                const filePath = path.join(testsDir, file);
                const content = await fs.promises.readFile(filePath, 'utf-8');
                projectSourceWithTests.projectTests.push({ filePath, content });
            }
        }
    }

    return projectSourceWithTests;
}

/**
 * Gets the OpenAPI specification for a given Ballerina service file
 */
export async function getOpenAPISpecification(documentFilePath: string): Promise<string> {
    const response = await langClient.convertToOpenAPI({ documentFilePath, enableBalExtension: true }) as OpenAPISpec;
    if (response.error) {
        throw new Error(response.error);
    }
    return JSON.stringify(response.content[0].spec);
}
