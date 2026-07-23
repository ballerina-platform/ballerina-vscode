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
    BallerinaDiagnosticsRequest,
    BallerinaDiagnosticsResponse,
    ARTIFACT_TYPE,
    CommandResponse,
    CommandsRequest,
    CommandsResponse,
    CommonRPCAPI,
    Completion,
    CompletionParams,
    DefaultOrgNameResponse,
    DiagnosticData,
    FileOrDirRequest,
    FileOrDirResponse,
    GoToSourceRequest,
    OpenExternalUrlRequest,
    PackageTomlValues,
    PublishToCentralResponse,
    RunExternalCommandRequest,
    RunExternalCommandResponse,
    SampleDownloadRequest,
    SettingsTomlValues,
    ShowErrorMessageRequest,
    SyntaxTree,
    VISIBILITY,
    TypeResponse,
    WorkspaceFileRequest,
    WorkspaceRootResponse,
    WorkspacesFileResponse,
    WorkspaceTypeResponse,
    SetWebviewCacheRequestParam,
    ShowInfoModalRequest,
    ShowQuickPickRequest,
    isPathInside,
} from "@wso2/ballerina-core";
import child_process from 'child_process';
import path from "path";
import os from "os";
import fs from "fs";
import * as unzipper from 'unzipper';
import { commands, env, MarkdownString, ProgressLocation, QuickPickItem, Uri, window, workspace } from "vscode";
import { URI } from "vscode-uri";
import { parse } from "@iarna/toml";
import { load as loadYaml } from "js-yaml";
import { extension } from "../../BalExtensionContext";
import { StateMachine } from "../../stateMachine";
import {
    getProjectTomlValues,
    getWorkspaceTomlValues,
    goToSource
} from "../../utils";
import { getUsername } from "../../utils/bi";
import {
    askFileOrFolderPath,
    askFilePath,
    askProjectPath,
    BALLERINA_INTEGRATOR_ISSUES_URL,
    findWorkspaceTypeFromWorkspaceFolders,
    getFirstBalaPath,
    getPublishDescriptionInfo,
    getPublishConfirmation,
    PublishPackageInfo,
    getTargetProjectForPublish,
    getUpdatedSource,
    handleDownloadFile,
    handlePublishDescriptionSetup,
    openPublishDescriptionInEditor,
    selectSampleDownloadPath
} from "./utils";
import { syncPackageKeyword, updatePackageDetails } from "./package-toml";
import { VisualizerWebview } from "../../views/visualizer/webview";

export class CommonRpcManager implements CommonRPCAPI {
    async getTypeCompletions(): Promise<TypeResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            const completionParams: CompletionParams = {
                textDocument: {
                    uri: Uri.file(context.documentUri!).toString()
                },
                context: {
                    triggerKind: 25,
                },
                position: {
                    character: 0,
                    line: 0
                }
            };

            const completions: Completion[] = await StateMachine.langClient().getCompletion(completionParams);
            const filteredCompletions: Completion[] = completions.filter(value => value.kind === 25 || value.kind === 23 || value.kind === 22);
            resolve({ data: filteredCompletions });
        });
    }

    async goToSource(params: GoToSourceRequest): Promise<void> {
        const context = StateMachine.context();
        let filePath = params?.filePath || context.documentUri!;
        if (params?.fileName && context?.projectPath) {
            filePath = path.join(context.projectPath, params.fileName);
        }
        goToSource(params.position, filePath);
    }

    async getWorkspaceFiles(params: WorkspaceFileRequest): Promise<WorkspacesFileResponse> {
        // Get the workspace files form vscode workspace
        const files = [];
        // Get workspace path
        const workspaceRoot = workspace.workspaceFolders![0].uri.fsPath;
        const workspaceFiles = params.glob ? await workspace.findFiles(params.glob) : await workspace.findFiles('**/*.bal', '**/*test.bal');
        workspaceFiles.forEach(file => {
            // Push the file path relative to the workspace root without the leading slash
            files.push({ relativePath: file.fsPath.replace(workspaceRoot, '').substring(1), path: file.fsPath });
        });
        return { files, workspaceRoot };
    }

    async getBallerinaDiagnostics(params: BallerinaDiagnosticsRequest): Promise<BallerinaDiagnosticsResponse> {
        return new Promise(async (resolve) => {
            // Get the current working document Uri
            const documentUri = URI.file(StateMachine.context().documentUri).toString();

            const fullST = await StateMachine.langClient().getSyntaxTree({
                documentIdentifier: { uri: documentUri }
            }) as SyntaxTree;

            const currentSource = fullST.syntaxTree.source;

            // Get the updated source when applied to the current source
            const updatedSource = getUpdatedSource(params.ballerinaSource, currentSource, params.targetPosition, params.skipSemiColon);
            if (updatedSource) {
                // Send the didChange event with new changes
                StateMachine.langClient().didChange({
                    contentChanges: [
                        {
                            text: updatedSource
                        }
                    ],
                    textDocument: {
                        uri: documentUri,
                        version: 1
                    }
                });

                // Get any diagnostics
                const diagResp = await StateMachine.langClient().getDiagnostics({
                    documentIdentifier: {
                        uri: documentUri,
                    }
                }) as DiagnosticData[];

                // Revert the changes back to the original
                StateMachine.langClient().didChange({
                    contentChanges: [
                        {
                            text: currentSource
                        }
                    ],
                    textDocument: {
                        uri: documentUri,
                        version: 1
                    }
                });

                const response = {
                    diagnostics: params.checkSeverity ?
                        diagResp[0]?.diagnostics.filter(diag => diag.severity === params.checkSeverity) || [] :
                        diagResp[0]?.diagnostics || []
                } as BallerinaDiagnosticsResponse;
                resolve(response);

            }
        });
    }

    async executeCommand(params: CommandsRequest): Promise<CommandsResponse> {
        return new Promise(async (resolve, reject) => {
            if (params.commands.length >= 1) {
                const cmdArgs = params.commands.length > 1 ? params.commands.slice(1) : [];
                try {
                    await commands.executeCommand(params.commands[0], ...cmdArgs);
                    resolve({ data: "SUCCESS" });
                } catch (error) {
                    reject(error);
                }
            }
        });
    }

    async selectFileOrDirPath(params: FileOrDirRequest): Promise<FileOrDirResponse> {
        return new Promise(async (resolve) => {
            if (params.isFile) {
                const selectedFile = await askFilePath(params.filters);
                if (!selectedFile || selectedFile.length === 0) {
                    window.showErrorMessage('A file must be selected');
                    resolve({ path: "" });
                } else {
                    const filePath = selectedFile[0].fsPath;
                    const projectPath = StateMachine.context().projectPath;
                    if (!params.allowOutsideProject && projectPath && !isPathInside(projectPath, filePath)) {
                        const resp = await window.showErrorMessage('The selected file is not within your project. Do you want to move it inside the project?', { modal: true }, 'Yes');
                        if (resp === 'Yes') {
                            // Move the file inside the project
                            const fileName = path.basename(filePath);
                            const newFilePath = path.join(projectPath, fileName);
                            // if newFilePath already exists, append a number to the file name
                            let counter = 1;
                            let finalFilePath = newFilePath;
                            while (fs.existsSync(finalFilePath)) {
                                const parsedPath = path.parse(newFilePath);
                                finalFilePath = path.join(parsedPath.dir, `${parsedPath.name}-${counter}${parsedPath.ext}`);
                                counter++;
                            }
                            fs.copyFileSync(filePath, finalFilePath);
                            resolve({ path: finalFilePath });
                            return;
                        }
                        resolve({ path: "" });
                        return;
                    }
                    resolve({ path: filePath });
                }
            } else {
                const selectedDir = await askProjectPath();
                if (!selectedDir || selectedDir.length === 0) {
                    window.showErrorMessage('A folder must be selected');
                    resolve({ path: "" });
                } else {
                    const dirPath = selectedDir[0].fsPath;
                    resolve({ path: dirPath });
                }
            }
        });
    }

    async selectFileOrFolderPath(): Promise<FileOrDirResponse> {
        return new Promise(async (resolve) => {
            const selectedFileOrFolder = await askFileOrFolderPath();
            if (!selectedFileOrFolder || selectedFileOrFolder.length === 0) {
                window.showErrorMessage('A file or folder must be selected');
                resolve({ path: "" });
            } else {
                const fileOrFolderPath = selectedFileOrFolder[0].fsPath;
                let isDirectory: boolean | undefined;
                try {
                    isDirectory = fs.statSync(fileOrFolderPath).isDirectory();
                } catch {
                    // Leave undefined so the caller falls back to its filename heuristic.
                }
                resolve({ path: fileOrFolderPath, isDirectory });
            }
        });
    }

    async experimentalEnabled(): Promise<boolean> {
        return extension.ballerinaExtInstance.enabledExperimentalFeatures();
    }

    async runBackgroundTerminalCommand(params: RunExternalCommandRequest): Promise<RunExternalCommandResponse> {
        return new Promise<CommandResponse>(function (resolve) {
            child_process.exec(`${params.command}`, async (err, stdout, stderr) => {
                console.log(">>> command stdout: ", stdout);
                if (err) {
                    resolve({
                        error: true,
                        message: stderr + "\n" + stdout
                    });
                } else {
                    resolve({
                        error: false,
                        message: stdout
                    });
                }
            });
        });
    }

    async openExternalUrl(params: OpenExternalUrlRequest): Promise<void> {
        env.openExternal(Uri.parse(params.url));
    }

    async getWorkspaceRoot(): Promise<WorkspaceRootResponse> {
        return new Promise(async (resolve) => {
            const workspaceFolders = workspace.workspaceFolders;
            resolve(workspaceFolders ? { path: workspaceFolders[0].uri.fsPath } : { path: "" });
        });
    }

    async showErrorMessage(params: ShowErrorMessageRequest): Promise<void> {
        const messageWithLink = new MarkdownString(params.message);
        messageWithLink.appendMarkdown(`\n\nPlease [create an issue](${BALLERINA_INTEGRATOR_ISSUES_URL}) if the issue persists.`);
        window.showErrorMessage(messageWithLink.value);
    }

    async showInformationModal(params: ShowInfoModalRequest): Promise<string> {
        return window.showInformationMessage(params?.message, { modal: true, detail: params?.detail }, ...(params?.items || []));
    }

    async showQuickPick(params: ShowQuickPickRequest): Promise<QuickPickItem> {
        return window.showQuickPick(params.items, params?.options);
    }

    async isNPSupported(): Promise<boolean> {
        return extension.ballerinaExtInstance.isNPSupported;
    }

    async getCurrentProjectTomlValues(): Promise<Partial<PackageTomlValues>> {
        const tomlValues = await getProjectTomlValues(StateMachine.context().projectPath);
        return tomlValues ?? {};
    }

    async getWorkspaceType(): Promise<WorkspaceTypeResponse> {
        return await findWorkspaceTypeFromWorkspaceFolders();
    }


    async downloadSelectedSampleFromGithub(params: SampleDownloadRequest): Promise<boolean> {
        const repoUrl = 'https://devant-cdn.wso2.com/bi-samples/v1/';
        const rawFileLink = repoUrl + params.zipFileName + '.zip';
        const defaultDownloadsPath = path.join(os.homedir(), 'Downloads'); // Construct the default downloads path
        const pathFromDialog = await selectSampleDownloadPath();
        if (pathFromDialog === "") {
            return false;
        }
        const selectedPath = pathFromDialog === "" ? defaultDownloadsPath : pathFromDialog;
        const filePath = path.join(selectedPath, params.zipFileName + '.zip');
        let isSuccess = false;

        if (fs.existsSync(filePath)) {
            // already downloaded
            isSuccess = true;
        } else {
            await window.withProgress({
                location: ProgressLocation.Notification,
                title: 'Downloading file',
                cancellable: true
            }, async (progress, cancellationToken) => {

                let cancelled: boolean = false;
                cancellationToken.onCancellationRequested(async () => {
                    cancelled = true;
                    // Clean up partial download
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                });

                try {
                    await handleDownloadFile(rawFileLink, filePath, progress);
                    isSuccess = true;
                    return;
                } catch (error) {
                    window.showErrorMessage(`Error while downloading the file: ${error}`);
                }
            });
        }

        if (isSuccess) {
            const successMsg = `The Integration sample file has been downloaded successfully to the following directory: ${filePath}.`;
            const zipReadStream = fs.createReadStream(filePath);
            if (fs.existsSync(path.join(selectedPath, params.zipFileName))) {
                // already extracted
                let uri = Uri.file(path.join(selectedPath, params.zipFileName));
                commands.executeCommand("vscode.openFolder", uri, true);
                return true;
            }

            let extractionError: Error | null = null;
            const parseStream = unzipper.Parse();

            // Handle errors on the read stream
            zipReadStream.on("error", (error) => {
                extractionError = error;
                window.showErrorMessage(`Failed to read zip file: ${error.message}`);
            });

            // Handle errors on the parse stream
            parseStream.on("error", (error) => {
                extractionError = error;
                window.showErrorMessage(`Failed to parse zip file. The file may be corrupted: ${error.message}`);
            });

            parseStream.on("entry", function (entry) {
                // Skip processing if we've already encountered an error
                if (extractionError) {
                    entry.autodrain();
                    return;
                }

                var isDir = entry.type === "Directory";
                var fullpath = path.join(selectedPath, entry.path);
                var directory = isDir ? fullpath : path.dirname(fullpath);

                try {
                    if (!fs.existsSync(directory)) {
                        fs.mkdirSync(directory, { recursive: true });
                    }
                } catch (error) {
                    extractionError = error as Error;
                    window.showErrorMessage(`Failed to create directory "${directory}": ${error instanceof Error ? error.message : String(error)}`);
                    entry.autodrain();
                    return;
                }

                if (!isDir) {
                    const writeStream = fs.createWriteStream(fullpath);

                    // Handle write stream errors
                    writeStream.on("error", (error) => {
                        extractionError = error;
                        window.showErrorMessage(`Failed to write file "${fullpath}": ${error.message}. This may be due to insufficient disk space or permission issues.`);
                        entry.autodrain();
                    });

                    // Handle entry stream errors
                    entry.on("error", (error) => {
                        extractionError = error;
                        window.showErrorMessage(`Failed to extract entry "${entry.path}": ${error.message}`);
                        writeStream.destroy();
                    });

                    entry.pipe(writeStream);
                }
            });

            parseStream.on("close", () => {
                if (extractionError) {
                    console.error("Extraction failed:", extractionError);
                    window.showErrorMessage(`Sample extraction failed: ${extractionError.message}`);
                    return;
                }

                console.log("Extraction complete!");
                window.showInformationMessage('Where would you like to open the project?',
                    { modal: true },
                    'Current Window',
                    'New Window'
                ).then(selection => {
                    if (selection === "Current Window") {
                        // Dispose the current webview
                        VisualizerWebview.currentPanel?.dispose();
                        const folderUri = Uri.file(path.join(selectedPath, params.zipFileName));
                        const workspaceFolders = workspace.workspaceFolders || [];
                        if (!workspaceFolders.some(folder => folder.uri.fsPath === folderUri.fsPath)) {
                            workspace.updateWorkspaceFolders(workspaceFolders.length, 0, { uri: folderUri });
                        }
                    } else if (selection === "New Window") {
                        commands.executeCommand('vscode.openFolder', Uri.file(path.join(selectedPath, params.zipFileName)));
                    }
                });
            });

            zipReadStream.pipe(parseStream);
            window.showInformationMessage(
                successMsg,
            );
        }
        return isSuccess;
    }

    async setWebviewCache(params: SetWebviewCacheRequestParam): Promise<void> {
        await extension.context.workspaceState.update(params.cacheKey, params.data);
    }

    async restoreWebviewCache(cacheKey: string): Promise<unknown> {
        return extension.context.workspaceState.get(cacheKey);
    }

    async clearWebviewCache(cacheKey: string): Promise<void> {
        await extension.context.workspaceState.update(cacheKey, undefined);
    }

    async getDefaultOrgName(): Promise<DefaultOrgNameResponse> {
        try {
            const projectPath = StateMachine.context()?.workspacePath;

            if (projectPath) {
                // Check .wso2/context.yaml then .choreo/context.yaml
                for (const contextDir of ['.wso2', '.choreo']) {
                    try {
                        const contextYamlPath = path.join(projectPath, contextDir, "context.yaml");
                        const content = await fs.promises.readFile(contextYamlPath, "utf-8");
                        const parsed = loadYaml(content);
                        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].org === "string" && parsed[0].org) {
                            return { orgName: parsed[0].org, isLocked: true };
                        }
                    } catch { /* file missing or unreadable — try next */ }
                }

                // Check existing packages listed in the workspace Ballerina.toml
                const workspaceToml = await getWorkspaceTomlValues(projectPath);
                const packages = workspaceToml?.workspace?.packages ?? [];
                for (const pkg of packages) {
                    const pkgToml = await getProjectTomlValues(path.join(projectPath, pkg));
                    if (pkgToml?.package?.org) {
                        return { orgName: pkgToml.package.org, isLocked: true };
                    }
                }
            }

            const integrationPath = StateMachine.context()?.projectPath;

            if (integrationPath) {
                // Check for existing packages in the project Ballerina.toml
                const projectToml = await getProjectTomlValues(integrationPath);
                if (projectToml?.package?.org) {
                    return { orgName: projectToml.package.org, isLocked: true };
                }
            }
        } catch {
            // fall through to default
        }
        return { orgName: getUsername(), isLocked: false };
    }

    async publishToCentral(): Promise<PublishToCentralResponse> {
        const failResponse = (): PublishToCentralResponse => ({ success: false, message: '' });

        const project = getTargetProjectForPublish();
        if (!project) {
            return failResponse();
        }

        const { projectPath, projectName, artifactType } = project;
        let packageInfo = await this.getPublishPackageInfo(projectPath, projectName);

        while (true) {
            const descriptionInfo = await getPublishDescriptionInfo(projectPath);
            const confirmation = getPublishConfirmation(projectName, artifactType, descriptionInfo, packageInfo);
            const actionButtons = ['Edit Package Details'];
            if (descriptionInfo.status !== 'missing') {
                actionButtons.push('Open Description File');
            }

            const selectedAction = await window.showInformationMessage(
                confirmation.message,
                { modal: true },
                confirmation.primaryButton,
                ...actionButtons
            );

            if (!selectedAction) {
                return failResponse();
            }

            if (selectedAction === 'Edit Package Details') {
                const updatedDetails = await this.promptForPublishPackageInfo(packageInfo);
                if (!updatedDetails) {
                    continue;
                }

                const updated = await this.updateProjectPackageInfo(projectPath, updatedDetails);
                if (!updated) {
                    window.showErrorMessage('Failed to update package details in Ballerina.toml');
                    return failResponse();
                }

                packageInfo = updatedDetails;
                continue;
            }

            if (selectedAction === 'Open Description File') {
                await openPublishDescriptionInEditor(descriptionInfo);
                continue;
            }

            const descriptionHandled = await handlePublishDescriptionSetup(descriptionInfo, projectPath, projectName, artifactType);
            if (descriptionHandled) {
                return failResponse();
            }

            break;
        }

        if (artifactType === 'library') {
            await this.syncAgentDefinitionKeyword(projectPath);
        }

        const result = await this.packAndPushToCentral(projectPath);
        this.showPublishResult(result);
        return result;
    }

    private async getPublishPackageInfo(projectPath: string, fallbackName: string): Promise<PublishPackageInfo> {
        const tomlValues = await getProjectTomlValues(projectPath);
        return {
            orgName: tomlValues?.package?.org ?? getUsername(),
            packageName: tomlValues?.package?.name ?? fallbackName,
            version: tomlValues?.package?.version ?? '0.1.0'
        };
    }

    private async promptForPublishPackageInfo(current: PublishPackageInfo): Promise<PublishPackageInfo | undefined> {
        const orgName = await window.showInputBox({
            title: 'Edit Package Details',
            prompt: 'Organization name',
            value: current.orgName,
            ignoreFocusOut: true,
            validateInput: (value) => value.trim() ? undefined : 'Organization name is required'
        });
        if (orgName === undefined) {
            return undefined;
        }

        const packageName = await window.showInputBox({
            title: 'Edit Package Details',
            prompt: 'Package name',
            value: current.packageName,
            ignoreFocusOut: true,
            validateInput: (value) => value.trim() ? undefined : 'Package name is required'
        });
        if (packageName === undefined) {
            return undefined;
        }

        const version = await window.showInputBox({
            title: 'Edit Package Version',
            prompt: 'Version',
            value: current.version,
            ignoreFocusOut: true,
            validateInput: (value) => value.trim() ? undefined : 'Version is required'
        });
        if (version === undefined) {
            return undefined;
        }

        return {
            orgName: orgName.trim(),
            packageName: packageName.trim(),
            version: version.trim()
        };
    }

    private async updateProjectPackageInfo(projectPath: string, details: PublishPackageInfo): Promise<boolean> {
        const ballerinaTomlPath = path.join(projectPath, 'Ballerina.toml');
        if (!fs.existsSync(ballerinaTomlPath)) {
            return false;
        }

        try {
            const tomlContent = await fs.promises.readFile(ballerinaTomlPath, 'utf-8');
            await fs.promises.writeFile(ballerinaTomlPath, updatePackageDetails(tomlContent, details), 'utf-8');
            return true;
        } catch (error) {
            console.error('Failed to update Ballerina.toml package metadata:', error);
            return false;
        }
    }

    private async syncAgentDefinitionKeyword(projectPath: string): Promise<void> {
        const hasPublicAgentDefinition = await this.hasPublicAgentDefinition(projectPath);
        if (hasPublicAgentDefinition === undefined) {
            console.warn('Skipping Type/Agent keyword synchronization: unable to read project artifacts.');
            return;
        }

        const ballerinaTomlPath = path.join(projectPath, 'Ballerina.toml');
        try {
            const tomlContent = await fs.promises.readFile(ballerinaTomlPath, 'utf-8');
            const updatedToml = syncPackageKeyword(tomlContent, 'Type/Agent', hasPublicAgentDefinition);
            if (updatedToml === tomlContent) {
                return;
            }
            await fs.promises.writeFile(ballerinaTomlPath, updatedToml, 'utf-8');
        } catch (error) {
            console.warn('Failed to synchronize the Type/Agent package keyword:', error);
        }
    }

    private async hasPublicAgentDefinition(projectPath: string): Promise<boolean | undefined> {
        try {
            const artifacts = await StateMachine.langClient().getProjectArtifacts({ projectPath });
            return Object.values(artifacts?.artifacts?.[ARTIFACT_TYPE.AgentDefinitions] ?? {})
                .some((artifact) => artifact.visibility === VISIBILITY.PUBLIC);
        } catch (error) {
            console.warn('Failed to inspect agent definitions before publishing:', error);
            return undefined;
        }
    }

    private async packAndPushToCentral(projectPath: string): Promise<PublishToCentralResponse> {
        const result: PublishToCentralResponse = { success: false, message: '' };

        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: 'Publishing project to Ballerina Central',
                cancellable: false
            },
            async (progress) => {
                try {
                    progress.report({ message: 'Packing...' });
                    const packResult = await this.runPackCommand(projectPath);
                    if (packResult.error) {
                        result.message = packResult.message ?? '';
                        return;
                    }

                    progress.report({ message: 'Publishing...' });
                    const balaFilePath = getFirstBalaPath(projectPath);
                    if (!balaFilePath) {
                        result.message = 'No publishable artifact found at the target/bala directory';
                        return;
                    }

                    const pushResult = await this.runPushCommand(balaFilePath);
                    if (pushResult.error) {
                        result.message = pushResult.message ?? '';
                        return;
                    }
                    result.success = true;
                } catch (error) {
                    console.error('Failed to publish project to Ballerina Central:', error);
                }
            }
        );

        return result;
    }

    private async runPackCommand(projectPath: string): Promise<RunExternalCommandResponse> {
        return this.runBackgroundTerminalCommand({ command: `bal pack "${projectPath}"` });
    }

    private async runPushCommand(balaFilePath: string): Promise<RunExternalCommandResponse> {
        return this.runBackgroundTerminalCommand({ command: `bal push "${balaFilePath}"` });
    }

    private showPublishResult(result: PublishToCentralResponse): void {
        if (result.success) {
            window.showInformationMessage('Project published to ballerina central successfully');
        } else {
            window.showErrorMessage(result.message || 'Failed to publish project to Ballerina Central');
        }
    }

    async getPreferredTryItOption(): Promise<string | undefined> {
        return extension.context.globalState.get<string>("ballerina.bi.preferredTryItOption");
    }

    async setPreferredTryItOption(option: string): Promise<void> {
        await extension.context.globalState.update("ballerina.bi.preferredTryItOption", option);
    }

    async hasCentralPATConfigured(): Promise<boolean> {
        // check if the central PAT is configured in the environment variable
        const token = process.env.BALLERINA_CENTRAL_ACCESS_TOKEN;
        if (token !== undefined && token !== '') {
            return true;
        }

        // check if the central PAT is configured in the settings.toml
        const settingsTomlFilePath = path.join(os.homedir(), '.ballerina', 'settings.toml');
        if (fs.existsSync(settingsTomlFilePath)) {
            const tomlContent = await fs.promises.readFile(settingsTomlFilePath, 'utf-8');
            try {
                const tomlValues = parse(tomlContent) as Partial<SettingsTomlValues>;
                const token = tomlValues.central?.accesstoken;
                return token !== undefined && token !== '';
            } catch (error) {
                return false;
            }
        }

        return false;
    }
}
