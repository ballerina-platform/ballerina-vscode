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
import * as path from 'path';
import vscode, { Diagnostic, Uri } from 'vscode';
import { extension } from "../../BalExtensionContext";
import { ReadableStream } from 'stream/web';
import { CustomDiagnostic } from './custom-diagnostics';
import { requirementsSpecification, isErrorCode } from "../../rpc-managers/ai-panel/utils";
import { BallerinaPluginConfig, ResultItem, DriftResponseData, DriftResponse, BallerinaSource } from "./interfaces";
import {
    DEVELOPER_OVERVIEW_FILENAME, NATURAL_PROGRAMMING_PATH, DEVELOPER_OVERVIEW_RELATIVE_PATH,
    REQUIREMENT_DOC_PREFIX, REQUIREMENT_TEXT_DOCUMENT, REQUIREMENT_MD_DOCUMENT,
    README_FILE_NAME_LOWERCASE, DRIFT_DIAGNOSTIC_ID,
    LACK_OF_API_DOCUMENTATION_WARNING, DOES_NOT_HAVE_ANY_API_DOCUMENTATION,
    NO_DOCUMENTATION_WARNING, CONFIG_FILE_NAME,
    DEFAULT_MODULE, MISSING_README_FILE_WARNING, README_DOCUMENTATION_IS_MISSING,
    MISSING_REQUIREMENT_FILE, MISSING_API_DOCS, API_DOCUMENTATION_IS_MISSING,
    PROGRESS_BAR_MESSAGE_FOR_NP_TOKEN,
    ERROR_NO_BALLERINA_SOURCES,
    loginRequiredWarning
} from "./constants";
import { isNumber } from 'lodash';
import { HttpStatusCode } from 'axios';
import { AIMachineEventType, BallerinaProject, BIIntelSecrets, LoginMethod } from '@wso2/ballerina-core';
import { BACKEND_URL, isBallerinaProjectAsync } from '../ai/utils';
import { getCurrentBallerinaProjectFromContext } from '../config-generator/configGenerator';
import { BallerinaExtension } from 'src/core';
import { getAccessToken as getAccesstokenFromUtils, getLoginMethod, getRefreshedAccessToken, TOKEN_NOT_AVAILABLE_ERROR_MESSAGE, TOKEN_REFRESH_ONLY_SUPPORTED_FOR_BI_INTEL } from '../../utils/ai/auth';
import { AIStateMachine } from '../../views/ai-panel/aiMachine';
import { performApiDocsDriftCheck, performDocumentationDriftCheck } from './drift-check';
import { ApiDocsDriftResponse, DocumentationDriftResponse } from './drift-check/schemas';
import { LLM_API_BASE_PATH } from '../ai/constants';

export async function getLLMDiagnostics(projectPath: string, diagnosticCollection
    : vscode.DiagnosticCollection): Promise<number | null> {
    const ballerinaProjectSource: BallerinaSource = await getBallerinaProjectSourceFiles(projectPath);
    const sourcesOfNonDefaultModulesWithReadme: BallerinaSource[]
        = getSourcesOfNonDefaultModulesWithReadme(path.join(projectPath, "modules"));

    const sources: BallerinaSource[] = [ballerinaProjectSource, ...sourcesOfNonDefaultModulesWithReadme];

    const responses = await getLLMResponses(sources);

    if (isNumber(responses)) {
        return responses;
    }

    await createDiagnosticCollection(responses, projectPath, diagnosticCollection);
    return null;
}

async function getLLMResponses(sources: BallerinaSource[])
    : Promise<DriftResponseData[] | number> {
    try {
        const promises: Promise<ApiDocsDriftResponse | DocumentationDriftResponse>[] = [];
        const nonDefaultModulesWithReadmeFiles: string[]
            = sources.map(source => source.moduleName).filter(name => name !== DEFAULT_MODULE);

        // API docs drift check
        promises.push(
            performApiDocsDriftCheck({
                ballerinaSourceFiles: sources[0].balFiles
            })
        );

        // Documentation drift check for each source
        sources.forEach(source => {
            promises.push(
                performDocumentationDriftCheck({
                    ballerinaSourceFiles: source.balFiles,
                    requirementSpecification: source.requirements,
                    readmeDocumentation: source.readme,
                    developerDocumentation: source.developerOverview,
                    nonDefaultModules: source.moduleName === DEFAULT_MODULE
                        ? nonDefaultModulesWithReadmeFiles.join(", ")
                        : undefined
                })
            );
        });

        const responses = await Promise.all(promises);

        // Convert structured responses to DriftResponseData format
        const driftResponses: DriftResponseData[] = responses
            .filter(response => response && response.results && response.results.length > 0)
            .map(response => ({ results: response.results as ResultItem[] }));

        return driftResponses;
    } catch (error) {
        console.error('Error in drift check:', error);
        return HttpStatusCode.InternalServerError;
    }
}

async function createDiagnosticCollection(
    responses: DriftResponseData[],
    projectPath: string,
    diagnosticCollection: vscode.DiagnosticCollection
) {
    let diagnosticsMap = new Map<string, vscode.Diagnostic[]>();

    for (const response of responses) {
        diagnosticsMap = await createDiagnosticsResponse(response, projectPath, diagnosticsMap);
    }

    // Set diagnostics in VS Code
    diagnosticCollection.clear();
    diagnosticsMap.forEach((diagnostics, filePath) => {
        const uri = vscode.Uri.file(filePath);
        diagnosticCollection.set(uri, diagnostics);
    });
}

async function createDiagnosticsResponse(data: DriftResponseData, projectPath: string,
    diagnosticsMap: Map<string, vscode.Diagnostic[]>): Promise<Map<string, vscode.Diagnostic[]>> {
    for (const result of data.results) {
        let fileName = result.fileName;

        if (isSkippedDiagnostic(result)) {
            continue;
        }

        if (result.codeFileName != undefined && result.codeFileName != null && result.codeFileName != "") {
            fileName = result.codeFileName;
        }

        const uri = vscode.Uri.file(path.join(projectPath, fileName));
        const diagnostic = await createDiagnostic(result, uri);

        // Store diagnostics per file
        if (!diagnosticsMap.has(uri.path)) {
            diagnosticsMap.set(uri.path, []);
        }
        diagnosticsMap.get(uri.path)!.push(diagnostic);
    }

    return diagnosticsMap;
}

async function createDiagnostic(result: ResultItem, uri: Uri): Promise<CustomDiagnostic> {
    function hasCodeChangedRows(item: Partial<ResultItem>): boolean {
        return isValidRow(item.startRowforImplementationChangedAction) && isValidRow(item.endRowforImplementationChangedAction);
    }

    function hasDocChangedRows(item: Partial<ResultItem>): boolean {
        return isValidRow(item.startRowforDocChangedAction) && isValidRow(item.endRowforDocChangedAction);
    }

    function isValidRow(row: number) {
        return row != undefined && row != null && row >= 1;
    }

    const isSolutionsAvailable = hasCodeChangedRows(result);
    const isDocChangeSolutionsAvailable: boolean = hasDocChangedRows(result);
    let codeChangeEndPosition = isSolutionsAvailable
        ? new vscode.Position(result.endRowforImplementationChangedAction - 1, 0)
        : new vscode.Position(0, 0);
    let docChangeEndPosition = isDocChangeSolutionsAvailable
        ? new vscode.Position(result.endRowforDocChangedAction - 1, 0)
        : new vscode.Position(0, 0);

    let range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
    const filePath = uri.fsPath;
    let document = null;
    if ((isSolutionsAvailable || isDocChangeSolutionsAvailable) && fs.existsSync(filePath)) {
        document = await vscode.workspace.openTextDocument(uri);
    }

    try {
        if (document != null) {
            if (isSolutionsAvailable) {
                codeChangeEndPosition = document.lineAt(result.endRowforImplementationChangedAction - 1).range.end;
                if (isDocChangeSolutionsAvailable) {
                    docChangeEndPosition = document.lineAt(result.endRowforDocChangedAction - 1).range.end;
                }
                range = new vscode.Range(
                    new vscode.Position(result.startRowforImplementationChangedAction - 1, 0),
                    codeChangeEndPosition
                );
            } else if (isDocChangeSolutionsAvailable) {
                docChangeEndPosition = document.lineAt(result.endRowforDocChangedAction - 1).range.end;
                range = new vscode.Range(
                    new vscode.Position(result.startRowforDocChangedAction - 1, 0),
                    docChangeEndPosition
                );
            }
        }
    } catch (error) {
        // ignore
    }

    const diagnostic = new CustomDiagnostic(
        range,
        result.cause,
        vscode.DiagnosticSeverity.Warning,
        {
            implementationChangeSolution: result.implementationChangeSolution,
            docChangeSolution: result.docChangeSolution,
            fileName: result.fileName,
            id: DRIFT_DIAGNOSTIC_ID,
            docRange: isDocChangeSolutionsAvailable ? new vscode.Range(
                new vscode.Position(result.startRowforDocChangedAction - 1, 0),
                docChangeEndPosition
            ) : null
        }
    );

    diagnostic.code = {
        value: DRIFT_DIAGNOSTIC_ID,
        target: uri
    };

    return diagnostic;
}

export async function getLLMDiagnosticArrayAsString(projectPath: string): Promise<string | number> {
    const ballerinaProjectSource: BallerinaSource = await getBallerinaProjectSourceFiles(projectPath);
    const sourcesOfNonDefaultModulesWithReadme: BallerinaSource[]
        = getSourcesOfNonDefaultModulesWithReadme(path.join(projectPath, "modules"));

    const sources: BallerinaSource[] = [ballerinaProjectSource, ...sourcesOfNonDefaultModulesWithReadme];

    const responses = await getLLMResponses(sources);

    if (isNumber(responses)) {
        return responses;
    }

    const diagnosticArray = (await createDiagnosticArray(responses, projectPath)).map(diagnostic => {
        return `${diagnostic.message}`;
    })
        .join("\n\n");

    return diagnosticArray;
}

async function createDiagnosticArray(responses: DriftResponseData[], projectPath: string): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    for (const response of responses) {
        await createDiagnosticList(response, projectPath, diagnostics);
    }

    function filterUniqueDiagnostics(diagnostics: vscode.Diagnostic[]): vscode.Diagnostic[] {
        const messageCount = new Map<string, number>();

        diagnostics.forEach(diagnostic => {
            const message = diagnostic.message;
            messageCount.set(message, (messageCount.get(message) || 0) + 1);
        });

        return diagnostics.filter(diagnostic => messageCount.get(diagnostic.message) === 1);
    }

    return filterUniqueDiagnostics(diagnostics);
}

export function extractResponseAsJsonFromString(jsonString: string): any {
    try {
        const driftResponse: DriftResponse = JSON.parse(jsonString);
        const drift = driftResponse.drift;
        if (drift == null) {
            return null;
        }

        const jsonRegex = /\{\s*"results":\s*\[[\s\S]*?\]\s*\}/g;
        const jsonMatches = drift.match(jsonRegex);
        if (!jsonMatches || jsonMatches.length === 0) {
            return null;
        }

        for (let i = jsonMatches.length - 1; i >= 0; i--) {
            try {
                const extractedJson = jsonMatches[i];
                const parsedJson: DriftResponseData = JSON.parse(extractedJson);
                if (parsedJson && parsedJson.results && Array.isArray(parsedJson.results)) {
                    return parsedJson;
                }
            } catch (error) {
                console.log(error);
                // Ignore parsing errors and continue checking earlier JSON objects
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

export async function createDiagnosticList(data: DriftResponseData, projectPath: string, diagnostics: Diagnostic[]) {
    for (const result of data.results) {
        let fileName = result.fileName;

        if (isSkippedDiagnostic(result)) {
            continue;
        }

        if (result.codeFileName != undefined && result.codeFileName != null && result.codeFileName != "") {
            fileName = result.codeFileName;
        }

        const uri = vscode.Uri.file(path.join(projectPath, fileName));
        const diagnostic = await createDiagnostic(result, uri);  // Wait for each createDiagnostic call to complete
        diagnostics.push(diagnostic);  // Push the diagnostic result after it's created
    }

    return diagnostics;
}

function formatWithLineNumbers(content: string): string {
    return content
        .split("\n")
        .map((line, index) => `${index + 1}|${line}`)
        .join("\n");
}

function getBalFiles(dir: string, relativePath: string = ""): string {
    let balFiles = "";
    if (!fs.existsSync(dir)) { return; }
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isFile() && file.endsWith(".bal")) {
            const content = fs.readFileSync(fullPath, "utf8");
            const formattedContent = formatWithLineNumbers(content);
            balFiles += `  <file filename=\"${relativePath}${file}\">\n    ${formattedContent}\n  </file>\n`;
        }
    }
    return balFiles;
}

function getNonDefaultModuleBalSources(modulesDir: string): string {
    let moduleBalFiles = "";

    if (!fs.existsSync(modulesDir)) { return ""; }
    const moduleDirs = fs.readdirSync(modulesDir).filter(dir =>
        fs.statSync(path.join(modulesDir, dir)).isDirectory()
    );

    if (moduleDirs.length == 0) {
        return "";
    }

    for (const moduleName of moduleDirs) {
        const relativeModulePath = `modules/${moduleName}/`;
        const modulePath = path.join(modulesDir, moduleName);
        moduleBalFiles += getBalFiles(modulePath, relativeModulePath);
    }
    return moduleBalFiles;
}

async function getRequirementAndDeveloperOverviewFiles(naturalProgrammingDir: string): Promise<[string, string]> {
    if (!fs.existsSync(naturalProgrammingDir)) { return ["", ""]; }

    const files = fs.readdirSync(naturalProgrammingDir);
    let requirementsContent = "";
    let developerContent = "";

    for (const file of files) {
        const fullPath = path.join(naturalProgrammingDir, file);
        const filenameLowercase = file.toLowerCase();

        if (filenameLowercase.startsWith(DEVELOPER_OVERVIEW_FILENAME)) {
            developerContent = `<developer_documentation filename=\"${DEVELOPER_OVERVIEW_RELATIVE_PATH}\">\n${fs.readFileSync(fullPath, "utf8")}\n</developer_documentation>\n`;
        }

        if (filenameLowercase.startsWith(REQUIREMENT_DOC_PREFIX)) {
            let content = "";
            if (filenameLowercase.startsWith(REQUIREMENT_TEXT_DOCUMENT) || filenameLowercase.startsWith(REQUIREMENT_MD_DOCUMENT)) {
                content = fs.readFileSync(fullPath, "utf8");
            } else {
                const requirementContent = await requirementsSpecification(fullPath);
                if (!isErrorCode(requirementContent)) {
                    content = requirementContent.toString();
                }
            }
            requirementsContent += `<requirement_specification filename=\"${NATURAL_PROGRAMMING_PATH}/${file}\">\n${content}\n</requirement_specification>\n`;
        }
    }
    return [requirementsContent, developerContent];
}

function getReadmeContent(folderPath: string, relativePath: string = ""): string {
    if (!fs.existsSync(folderPath)) { return ""; }

    const files = fs.readdirSync(folderPath);
    const readmeFile = files.find(file => file.toLowerCase() === README_FILE_NAME_LOWERCASE);

    if (!readmeFile) { return ""; }

    const readmePath = path.join(folderPath, readmeFile);
    const content = fs.readFileSync(readmePath, "utf8");

    return `<readme filename="${relativePath}${readmeFile}">\n${content}\n</readme>\n`;
}

export async function getBallerinaProjectSourceFiles(folderPath: string): Promise<BallerinaSource> {
    const moduleSources = getNonDefaultModuleBalSources(path.join(folderPath, "modules"));
    const nlContent = await getRequirementAndDeveloperOverviewFiles(path.join(folderPath, NATURAL_PROGRAMMING_PATH));
    const readmeContentOfDefaultModule = getReadmeContent(folderPath);

    let balFiles = "<project>\n";
    balFiles += getBalFiles(folderPath);
    balFiles += moduleSources;
    balFiles += "</project>";

    return {
        balFiles,
        readme: readmeContentOfDefaultModule.trim(),
        requirements: nlContent[0].trim(),
        developerOverview: nlContent[1].trim(),
        moduleName: DEFAULT_MODULE
    };
}

function getSourcesOfNonDefaultModulesWithReadme(modulesDir: string): BallerinaSource[] {
    if (!fs.existsSync(modulesDir)) { return []; }

    const moduleDirs = fs.readdirSync(modulesDir).filter(dir =>
        fs.statSync(path.join(modulesDir, dir)).isDirectory()
    );

    if (moduleDirs.length == 0) {
        return [];
    }

    const sources: BallerinaSource[] = [];
    for (const moduleName of moduleDirs) {
        const relativeModulePath = `modules/${moduleName}/`;
        const modulePath = path.join(modulesDir, moduleName);
        const readmeContent = getReadmeContent(modulePath, relativeModulePath);
        if (readmeContent.length > 0) {
            const moduleBalFiles = getBalFiles(modulePath, relativeModulePath);
            sources.push({
                balFiles: moduleBalFiles,
                readme: readmeContent.trim(),
                requirements: "",
                developerOverview: "",
                moduleName: moduleName
            });
        }
    }
    return sources;
}

export function getPluginConfig(): BallerinaPluginConfig {
    return vscode.workspace.getConfiguration('ballerina');
}

export async function getAccessToken(): Promise<string> {
    return new Promise(async (resolve) => {
        let token: string;
        const loginMethod = await getLoginMethod();
        if (loginMethod === LoginMethod.BI_INTEL) {
            const credentials = await getAccesstokenFromUtils();
            const secrets = credentials.secrets as BIIntelSecrets;
            token = secrets.accessToken;
        }
        resolve(token as string);
    });
}

export async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8");
    let result = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        result += decoder.decode(value, { stream: true });
    }

    return result;
}

export function handleChatSummaryFailure(message: string) {
    vscode.window.showWarningMessage(message);
    return;
}

// Function to find a file in a case-insensitive way
function findFileCaseInsensitive(directory: string, fileName: string) {
    const files = fs.readdirSync(directory);
    const targetFile = files.find(file => file.toLowerCase() === fileName.toLowerCase());
    const file = targetFile ? targetFile : fileName;
    return path.join(directory, file);
}

export function addDefaultModelConfigForNaturalFunctions(
    projectPath: string, token: string, backendUrl: string, isNaturalFunctionsAvailableInBallerinaOrg: boolean) {
    const moduleOrg = isNaturalFunctionsAvailableInBallerinaOrg ? "ballerina" : "ballerinax";
    const targetTable = `[${moduleOrg}.np.defaultModelConfig]`;
    const urlLine = `url = "${backendUrl}"`;
    const accessTokenLine = `accessToken = "${token}"`;
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
        return;
    }

    // Table exists, update it
    const tableEndIndex = fileContent.indexOf('\n', tableStartIndex);

    let updatedTableContent = `${targetTable}\n${urlLine}\n${accessTokenLine}`;

    let urlLineIndex = fileContent.indexOf('url =', tableStartIndex);
    let accessTokenLineIndex = fileContent.indexOf('accessToken =', tableStartIndex);

    if (urlLineIndex !== -1 && accessTokenLineIndex !== -1) {
        // url and accessToken lines exist, replace them
        const existingUrlLineEnd = fileContent.indexOf('\n', urlLineIndex);
        const existingAccessTokenLineEnd = fileContent.indexOf('\n', accessTokenLineIndex);

        fileContent =
            fileContent.substring(0, urlLineIndex) +
            urlLine +
            fileContent.substring(existingUrlLineEnd, accessTokenLineIndex) +
            accessTokenLine +
            fileContent.substring(existingAccessTokenLineEnd);
        fs.writeFileSync(configFilePath, fileContent);
        return;
    }

    // If url or accessToken line does not exist, just replace the entire table
    let nextTableStartIndex = fileContent.indexOf('[', tableEndIndex + 1);
    if (nextTableStartIndex === -1) {
        fileContent = fileContent.substring(0, tableStartIndex)
            + updatedTableContent + fileContent.substring(tableEndIndex + 1);
    } else {
        let nextLineBreakIndex = fileContent.substring(tableEndIndex + 1).indexOf('\n');
        if (nextLineBreakIndex === -1) {
            fileContent = fileContent.substring(0, tableStartIndex) + updatedTableContent;
        } else {
            fileContent = fileContent.substring(0, tableStartIndex)
                + updatedTableContent + fileContent.substring(tableEndIndex + 1);
        }
    }
    fs.writeFileSync(configFilePath, fileContent);
}

export async function getTokenForNaturalFunction() {
    try {
        const token = await getRefreshedAccessToken();
        if (!token) {
            vscode.window.showWarningMessage(loginRequiredWarning());
            return null;
        }
        return token;
    } catch (error) {
        if ((error as Error).message === TOKEN_NOT_AVAILABLE_ERROR_MESSAGE || (error as Error).message === TOKEN_REFRESH_ONLY_SUPPORTED_FOR_BI_INTEL) {
            vscode.window.showWarningMessage(loginRequiredWarning());
        }
        throw error;
    }
}

function isSkippedDiagnostic(result: ResultItem) {
    const cause = result.cause.toLowerCase();
    if (cause.includes(LACK_OF_API_DOCUMENTATION_WARNING) || cause.includes(DOES_NOT_HAVE_ANY_API_DOCUMENTATION) || cause.includes(API_DOCUMENTATION_IS_MISSING)
        || cause.includes(MISSING_API_DOCS) || cause.includes(NO_DOCUMENTATION_WARNING) || cause.includes(MISSING_README_FILE_WARNING)
        || cause.includes(MISSING_REQUIREMENT_FILE) || cause.includes(README_DOCUMENTATION_IS_MISSING)) {
        return true;
    }
    return false;
}

export function getVsCodeRootPath(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (workspaceFolders && workspaceFolders.length > 0) {
        return workspaceFolders[0].uri.fsPath;
    }

    return "";
}

export async function getConfigFilePath(ballerinaExtInstance: BallerinaExtension, rootPath: string): Promise<string> {
    if (await isBallerinaProjectAsync(rootPath)) {
        return rootPath;
    }

    const activeTextEditor = vscode.window.activeTextEditor;
    const currentProject = ballerinaExtInstance.getDocumentContext().getCurrentProject();
    let activeFilePath = "";
    let configPath = "";

    if (rootPath != "") {
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

        if (configPath == undefined && configPath == "") {
            return await showNoBallerinaSourceWarningMessage();
        }
        return configPath;
    } catch (error) {
        return await showNoBallerinaSourceWarningMessage();
    }
}

async function showNoBallerinaSourceWarningMessage() {
    return await vscode.window.showWarningMessage(ERROR_NO_BALLERINA_SOURCES);
}

export async function addConfigFile(configPath: string, isNaturalFunctionsAvailableInBallerinaOrg: boolean) {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: PROGRESS_BAR_MESSAGE_FOR_NP_TOKEN,
            cancellable: false,
        },
        async () => {
            try {
                const token: string = await getTokenForNaturalFunction();
                if (token == null) {
                    AIStateMachine.service().send(AIMachineEventType.LOGOUT);
                    return;
                }
                const openAiEpUrl = BACKEND_URL + LLM_API_BASE_PATH + "/openai";
                addDefaultModelConfigForNaturalFunctions(configPath, token, openAiEpUrl, isNaturalFunctionsAvailableInBallerinaOrg);
            } catch (error) {
                AIStateMachine.service().send(AIMachineEventType.LOGOUT);
                return;
            }
        }
    );
}
