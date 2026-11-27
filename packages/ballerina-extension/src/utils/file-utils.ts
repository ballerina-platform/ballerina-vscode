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
import { window, Uri, workspace, ProgressLocation, ConfigurationTarget, MessageItem, Progress, commands, StatusBarAlignment, languages, Range, Selection, ViewColumn } from "vscode";
import { SyntaxTree } from "@wso2/ballerina-core";
import axios from "axios";
import { createHash } from "crypto";
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FILE_DOWNLOAD_PATH, BallerinaExtension, ExtendedLangClient } from "../core";
import {
    CMP_OPEN_VSCODE_URL,
    TM_EVENT_OPEN_FILE_CANCELED,
    TM_EVENT_OPEN_FILE_CHANGE_PATH,
    TM_EVENT_OPEN_FILE_NEW_FOLDER,
    TM_EVENT_OPEN_FILE_SAME_FOLDER,
    TM_EVENT_OPEN_REPO_CANCELED,
    TM_EVENT_OPEN_REPO_CHANGE_PATH,
    TM_EVENT_OPEN_REPO_CLONE_NOW,
    TM_EVENT_OPEN_REPO_NEW_FOLDER,
    TM_EVENT_OPEN_REPO_SAME_FOLDER,
    sendTelemetryEvent
} from "../features/telemetry";
import { NodePosition } from "@wso2/syntax-tree";
import { existsSync } from "fs";
import { checkIsBallerinaPackage } from "./config";
interface ProgressMessage {
    message: string;
    increment?: number;
}

const ALLOWED_ORG_LIST = ['ballerina-platform', 'ballerina-guides', 'ballerinax', 'wso2'];
const GIT_DOMAIN = "github.com";
const GIST_OWNER = "ballerina-github-bot";
const NEXT_STARTING_UP_FILE = "next-starting-up-file";
const REPO_LOCATIONS = "repository-locations";

const buildStatusItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);

export async function handleOpenFile(ballerinaExtInstance: BallerinaExtension, gist: string, file: string, repoFileUrl?: string) {

    const defaultDownloadsPath = path.join(os.homedir(), 'Downloads'); // Construct the default downloads path
    const selectedPath = ballerinaExtInstance.getFileDownloadPath() || defaultDownloadsPath;
    await updateDirectoryPath(selectedPath);
    let validDomain = false;
    let validGist = false;
    let validRepo = false;
    // Domain verification for git file download
    if (repoFileUrl) {
        const url = new URL(repoFileUrl);
        const mainDomain = url.hostname;
        validDomain = mainDomain === GIT_DOMAIN;
        if (validDomain) {
            const username = getGithubUsername(repoFileUrl);
            if (ALLOWED_ORG_LIST.includes(username)) {
                validRepo = true;
            }
        }
    }
    const fileName = file || path.basename(new URL(repoFileUrl).pathname);
    const filePath = path.join(selectedPath, fileName);
    let isSuccess = false;

    await window.withProgress({
        location: ProgressLocation.Notification,
        title: 'Opening file',
        cancellable: true
    }, async (progress, cancellationToken) => {

        let cancelled: boolean = false;
        cancellationToken.onCancellationRequested(async () => {
            cancelled = true;
        });

        try {
            if (fileName.endsWith('.bal')) {
                let rawFileLink = repoFileUrl && getGitHubRawFileUrl(repoFileUrl);
                if (gist) {
                    const response = await axios.get(`https://api.github.com/gists/${gist}`);
                    const gistDetails = response.data;
                    rawFileLink = gistDetails.files[fileName].raw_url;
                    const responseOwner = gistDetails.owner.login;
                    validGist = GIST_OWNER === responseOwner;
                }
                if (validGist || validRepo) {
                    await handleDownloadFile(rawFileLink, filePath, progress, cancelled);
                    isSuccess = true;
                    return;
                } else {
                    window.showErrorMessage(`File url is not valid.`);
                    return;
                }
            } else {
                window.showErrorMessage(`Not a ballerina file.`);
                return;
            }
        } catch (error) {
            window.showErrorMessage(`The given file is not valid.`, error);
        }
    });

    if (isSuccess) {
        const successMsg = `The Ballerina sample file has been downloaded successfully to the following directory: ${filePath}.`;
        const changePath: MessageItem = { title: 'Change Directory' };
        openFileInVSCode(ballerinaExtInstance, filePath);
        const success = await window.showInformationMessage(
            successMsg,
            changePath
        );
        if (success === changePath) {
            sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_OPEN_FILE_CHANGE_PATH, CMP_OPEN_VSCODE_URL);
            await selectFileDownloadPath();
        }
    }
}

export async function handleOpenRepo(ballerinaExtInstance: BallerinaExtension, repoUrl: string, specificFileName?: string) {
    try {
        const defaultDownloadsPath = path.join(os.homedir(), 'Downloads'); // Construct the default downloads path
        const selectedPath = ballerinaExtInstance.getFileDownloadPath() || defaultDownloadsPath;
        const url = new URL(repoUrl);
        const validHost = url.protocol === "https:" && url.hostname === GIT_DOMAIN;
        const username = getGithubUsername(repoUrl);
        if (validHost && ALLOWED_ORG_LIST.includes(username)) {
            const cleanRepoUrl = repoUrl.replace(".git", "");
            const repoLocation = await getRepositoryLocation(ballerinaExtInstance, cleanRepoUrl);
            if (repoLocation) {
                if (specificFileName) {
                    const filePath = path.join(repoLocation, specificFileName);
                    setNextStartingUpFile(ballerinaExtInstance, filePath);
                }
                openRepoInVSCode(ballerinaExtInstance, repoLocation);
            } else {
                const message = `Ballerina : Opening Repository.`;
                const details = `You requested to open “${repoUrl}” in vscode.\nThe repository will be cloned to \n“${selectedPath}”`;
                const cloneAnyway: MessageItem = { title: "Clone Now" };
                const changePath: MessageItem = { title: 'Change Directory' };
                const result = await window.showInformationMessage(message, { detail: details, modal: true }, cloneAnyway, changePath);
                if (result === cloneAnyway) {
                    sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_OPEN_REPO_CLONE_NOW, CMP_OPEN_VSCODE_URL);
                    cloneRepo(repoUrl, selectedPath, specificFileName, ballerinaExtInstance);
                } else if (result === changePath) {
                    sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_OPEN_REPO_CHANGE_PATH, CMP_OPEN_VSCODE_URL);
                    const newPath = await selectFileDownloadPath();
                    cloneRepo(repoUrl, newPath, specificFileName, ballerinaExtInstance);
                } else {
                    sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_OPEN_REPO_CANCELED, CMP_OPEN_VSCODE_URL);
                    window.showErrorMessage(`Repository clone canceled.`);
                    return;
                }
            }
        } else {
            window.showErrorMessage(`Unauthorized repository.`);
            return;
        }
    } catch (error: any) {
        const errorMsg = `Repository cloning error: ${error.message}`;
        await window.showErrorMessage(errorMsg);
    }
}

async function cloneRepo(repoUrl: string, selectedPath: string, specificFileName: string, ballerinaExtInstance: BallerinaExtension) {
    const cleanRepoUrl = repoUrl.replace(".git", "");
    const repoFolderName = path.basename(new URL(cleanRepoUrl).pathname);
    const repoPath = path.join(selectedPath, repoFolderName);
    await setRepositoryLocation(ballerinaExtInstance, cleanRepoUrl, repoPath);
    if (specificFileName) {
        const filePath = path.join(repoPath, specificFileName);
        setNextStartingUpFile(ballerinaExtInstance, filePath);
    }
    await commands.executeCommand('git.clone', repoUrl, selectedPath);
}

async function downloadFile(url, filePath, progressCallback) {
    const writer = fs.createWriteStream(filePath);
    let totalBytes = 0;
    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            onDownloadProgress: (progressEvent) => {
                totalBytes = progressEvent.total;
                const progress = (progressEvent.loaded / totalBytes) * 100;
                if (progressCallback) {
                    progressCallback(progress);
                }
            }
        });
        response.data.pipe(writer);
        await new Promise<void>((resolve, reject) => {
            writer.on('finish', () => {
                writer.close();
                resolve();
            });

            writer.on('error', (error) => {
                reject(error);
            });
        });
    } catch (error) {
        window.showErrorMessage(`File download failed.`, error);
        throw error;
    }
}

async function selectFileDownloadPath() {
    const folderPath = await window.showOpenDialog({ title: 'Ballerina extension downloads directory', canSelectFolders: true, canSelectFiles: false, openLabel: 'Select Folder' });
    if (folderPath && folderPath.length > 0) {
        const newlySelectedFolder = folderPath[0].fsPath;
        try {
            await updateDirectoryPath(newlySelectedFolder);
            return newlySelectedFolder;
        } catch (error) {
            window.showErrorMessage(`Directory update failed.`, error);
        }
    }
    return;
}

async function updateDirectoryPath(newlySelectedFolder) {
    const config = workspace.getConfiguration();
    await config.update(FILE_DOWNLOAD_PATH, newlySelectedFolder, ConfigurationTarget.Global);
}

async function handleDownloadFile(rawFileLink: string, defaultDownloadsPath: string, progress: Progress<ProgressMessage>, cancelled: boolean) {
    const handleProgress = (progressPercentage) => {
        progress.report({ message: "Downloading file...", increment: progressPercentage });
    };

    progress.report({ message: "Downloading file..." });
    try {
        await downloadFile(rawFileLink, defaultDownloadsPath, handleProgress);
    } catch (error) {
        window.showErrorMessage(`Failed to download file: ${error}`);
    }
    progress.report({ message: "Download finished" });
}

async function openFileInVSCode(ballerinaExtInstance: BallerinaExtension, filePath: string): Promise<void> {
    const uri = Uri.file(filePath);
    const message = `Would you like to open the downloaded file?`;
    const newWindow: MessageItem = { title: "Open in New Window" };
    const sameWindow: MessageItem = { title: 'Open' };
    const result = await window.showInformationMessage(message, { modal: true }, sameWindow, newWindow);
    if (!result) {
        sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_OPEN_FILE_CANCELED, CMP_OPEN_VSCODE_URL);
        return; // User cancelled
    }
    try {
        switch (result) {
            case newWindow:
                await commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
                sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_OPEN_FILE_NEW_FOLDER, CMP_OPEN_VSCODE_URL);
                break;
            case sameWindow:
                const document = await workspace.openTextDocument(uri);
                await window.showTextDocument(document, { preview: false });
                sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_OPEN_FILE_SAME_FOLDER, CMP_OPEN_VSCODE_URL);
                break;
            default:
                break;
        }
    } catch (error) {
        window.showErrorMessage(`Failed to open file: ${error}`);
    }
}

async function openRepoInVSCode(ballerinaExtInstance: BallerinaExtension, filePath: string): Promise<void> {
    const uri = Uri.file(`${filePath}`);
    const message = `Repository already exists. Would you like to open the existing repository folder?`;
    const newWindow: MessageItem = { title: "Open in New Window" };
    const sameWindow: MessageItem = { title: 'Open' };
    const result = await window.showInformationMessage(message, { modal: true }, sameWindow, newWindow);
    if (!result) {
        sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_OPEN_REPO_CANCELED, CMP_OPEN_VSCODE_URL);
        return; // User cancelled
    }
    handleSameWorkspaceFileOpen(ballerinaExtInstance, filePath); // If opened workspace is same as cloned open the file
    try {
        switch (result) {
            case newWindow:
                await commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
                sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_OPEN_REPO_NEW_FOLDER, CMP_OPEN_VSCODE_URL);
                break;
            case sameWindow:
                await commands.executeCommand('vscode.openFolder', uri);
                sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_OPEN_REPO_SAME_FOLDER, CMP_OPEN_VSCODE_URL);
                break;
            default:
                break;
        }
    } catch (error) {
        window.showErrorMessage(`Failed to open folder: ${error}`);
    }
}

async function handleSameWorkspaceFileOpen(ballerinaExtInstance: BallerinaExtension, filePath: string) {
    const workspaceFolders = workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceFolder = workspaceFolders[0];
        const workspaceFolderPath = workspaceFolder.uri.fsPath;
        if (filePath === workspaceFolderPath) {
            openClonedTempFile(ballerinaExtInstance);
        }
    }
}

function setNextStartingUpFile(ballerinaExtInstance: BallerinaExtension, selectedPath) {
    ballerinaExtInstance.context.globalState.update(NEXT_STARTING_UP_FILE, selectedPath); // NEXT_STARTING_UP_FILE
}

// Function to open the stored cloned file path from the global state
export async function openClonedTempFile(ballerinaExtInstance: BallerinaExtension) {
    const isRepo = await isRepositoryLocation(ballerinaExtInstance);
    if (isRepo) {
        // Get latests changes
        await commands.executeCommand('git.pull');
    }
    const pathValue = ballerinaExtInstance.context.globalState.get(NEXT_STARTING_UP_FILE) as string;
    if (isRepo && pathValue) {
        try {
            // Open the specific file
            const document = await workspace.openTextDocument(pathValue);
            await window.showTextDocument(document);
        } catch (error) {
            window.showErrorMessage(`Error opening ${pathValue}: ${error}`);
        }
        setNextStartingUpFile(ballerinaExtInstance, "");
    }
}


async function isRepositoryLocation(ballerinaExtInstance: BallerinaExtension) {
    // Repository locations are stored in global state
    let repositoryLocations: Record<string, string> | undefined = ballerinaExtInstance.context.globalState.get(REPO_LOCATIONS);
    const workspaceFolders = workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceFolder = workspaceFolders[0];
        const workspaceFolderPath = workspaceFolder.uri.fsPath;
        if (isPathInRepositoryLocations(workspaceFolderPath, repositoryLocations)) {
            return true;
        }
    }
    return false;
}

// Check if the given path exists in the repositoryLocations Map
function isPathInRepositoryLocations(pathToCheck: string, repositoryLocations: Record<string, string> | undefined): boolean {
    if (repositoryLocations) {
        const values = Object.values(repositoryLocations);
        return values.includes(pathToCheck);
    }
    return false; // Location not found in the map or map is undefined
}

// Function to extract the organization/username
function getGithubUsername(url) {
    const urlParts = url.split('/');
    const username = urlParts[3];
    return username;
}

function getGitHubRawFileUrl(githubFileUrl) {
    const urlParts = githubFileUrl.split('/');
    const username = urlParts[3];
    const repository = urlParts[4];
    const branch = urlParts[6];
    const filePath = urlParts.slice(7).join('/');

    const rawFileUrl = `https://raw.githubusercontent.com/${username}/${repository}/${branch}/${filePath}`;
    return rawFileUrl;
}

async function resolveModules(langClient: ExtendedLangClient, pathValue) {
    const ballerinProjectPath = await findBallerinaPackageRoot(pathValue);
    if (ballerinProjectPath) {
        // Create a status bar item for the build notification
        buildStatusItem.text = "$(sync~spin) Pulling modules...";
        buildStatusItem.tooltip = "Pulling the missing ballerina modules.";
        const uriString = Uri.file(pathValue).toString();
        buildStatusItem.show();
        // Show the progress bar.
        await window.withProgress({
            location: ProgressLocation.Notification,
            title: `Pulling all missing ballerina modules...`,
            cancellable: true
        }, async (progress, cancellationToken) => {
            cancellationToken.onCancellationRequested(async () => {
                buildStatusItem.hide();
            });
            progress.report({ increment: 30 });
            // Resolve missing dependencies.
            const dependenciesResponse = await langClient.resolveMissingDependencies({
                documentIdentifier: {
                    uri: uriString
                }
            });
            const response = dependenciesResponse as SyntaxTree;
            if (response.parseSuccess) {
                progress.report({ increment: 60 });
                // Rebuild the file to update the LS.
                await langClient.didChange({
                    contentChanges: [{ text: "" }],
                    textDocument: {
                        uri: uriString,
                        version: 1
                    }
                });
                progress.report({ increment: 100 });
            } else {
                window.showErrorMessage("Failed to pull modules");
            }
            buildStatusItem.hide();
        });
    }
}

export async function findBallerinaPackageRoot(filePath: string) {
    if (!filePath) {
        return null;
    }
    
    // Start with the path itself if it's a directory, otherwise start with its parent
    let currentFolderPath: string;
    try {
        currentFolderPath = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath);
    } catch {
        currentFolderPath = path.dirname(filePath);
    }

    while (currentFolderPath !== path.sep) {
        const isBallerinaPackage = await checkIsBallerinaPackage(Uri.parse(currentFolderPath));
        if (isBallerinaPackage) {
            return currentFolderPath;
        }

        const parentPath = path.dirname(currentFolderPath);
        // Prevent infinite loop
        if (parentPath === currentFolderPath) {
            break;
        }
        currentFolderPath = parentPath;
    }

    return null;
}

export async function handleResolveMissingDependencies(ballerinaExtInstance: BallerinaExtension) {
    openClonedTempFile(ballerinaExtInstance);
    const langClient = ballerinaExtInstance.langClient;
    // Listen for diagnostic changes for cloned repo using vscode open feature
    const isRepo = await isRepositoryLocation(ballerinaExtInstance);
    if (isRepo) {
        languages.onDidChangeDiagnostics(async (e) => {
            const activeEditor = window.activeTextEditor;
            if (activeEditor && activeEditor.document.languageId === 'ballerina') {
                const uri = activeEditor.document.uri;
                const diagnostics = languages.getDiagnostics(uri);
                if (diagnostics.length > 0 && diagnostics.filter(diag => diag.code === "BCE2003").length > 0) {
                    if (!ballerinaExtInstance.getIsOpenedOnce()) {
                        ballerinaExtInstance.setIsOpenedOnce(true);
                        resolveModules(langClient, uri.fsPath);
                    } else {
                        const message = `Unresolved modules found.`;
                        const pullModules: MessageItem = { title: "Pull Modules" };
                        const result = await window.showInformationMessage(message, pullModules);
                        if (result === pullModules) {
                            resolveModules(langClient, uri.fsPath);
                        }
                    }
                }
            }
        });
    }
}

async function setRepositoryLocation(ballerinaExtInstance: BallerinaExtension, gitUrl: string, location: string) {
    // Repository locations are stored in global state
    let repositoryLocations: Record<string, string> | undefined = ballerinaExtInstance.context.globalState.get(REPO_LOCATIONS);
    // If the locations are not set before create the location map
    if (repositoryLocations === undefined) {
        repositoryLocations = {};
    }
    const gitUrlHash = urlToUniqueID(gitUrl);
    repositoryLocations[gitUrlHash] = location; // Get URL hash value as the projectID
    ballerinaExtInstance.context.globalState.update(REPO_LOCATIONS, repositoryLocations);
}

async function _removeLocation(ballerinaExtInstance: BallerinaExtension, gitUrlHash: string) {
    let repositoryLocations: Record<string, string> | undefined = ballerinaExtInstance.context.globalState.get(REPO_LOCATIONS);
    // If the locations are not set before create the location map
    if (repositoryLocations === undefined) {
        repositoryLocations = {};
    }
    delete repositoryLocations[gitUrlHash];
    ballerinaExtInstance.context.globalState.update(REPO_LOCATIONS, repositoryLocations);
}

async function getRepositoryLocation(ballerinaExtInstance: BallerinaExtension, gitUrl: string): Promise<string | undefined> {
    let repositoryLocations: Record<string, string> | undefined = ballerinaExtInstance.context.globalState.get(REPO_LOCATIONS);
    const gitUrlHash = urlToUniqueID(gitUrl);
    const filePath: string | undefined = (repositoryLocations) ? repositoryLocations[gitUrlHash] : undefined;
    if (filePath !== undefined) {
        if (fs.existsSync(filePath)) {
            return filePath;
        } else {
            _removeLocation(ballerinaExtInstance, gitUrlHash);
        }
    }
    // If not, remove the location from the state
    return undefined;
}

function urlToUniqueID(url) {
    const hash = createHash('sha256');
    hash.update(url);
    return hash.digest('hex');
}

export function getProjectWorkingDirectory(projectPath: string): string {
    try {
        return fs.statSync(projectPath).isFile() ? path.dirname(projectPath) : projectPath;
    } catch (error) {
        throw error;
    }
}

export async function goToSource(nodePosition: NodePosition, documentUri: string) {
    const { startLine, startColumn, endLine, endColumn } = nodePosition;
    if (!existsSync(documentUri)) {
        return;
    }
    let editor = window.visibleTextEditors.find(editor => editor.document.uri.fsPath === documentUri);
    if (!editor && documentUri) {
        const document = await workspace.openTextDocument(Uri.file(documentUri));
        editor = await window.showTextDocument(document, ViewColumn.Beside);
    }
    if (editor) {
        const range = new Range(startLine, startColumn, endLine, endColumn);
        editor.selection = new Selection(range.start, range.end);
        editor.revealRange(range);
    }
}
