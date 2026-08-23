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

import * as os from 'os';
import { NodePosition } from "@wso2/syntax-tree";
import { StateMachine } from "../../stateMachine";
import { Position, Progress, Range, Uri, ViewColumn, window, workspace, WorkspaceEdit } from "vscode";
import { isPathInside, isSamePath, PROJECT_KIND, ProjectInfo, TextEdit, WorkspaceTypeResponse } from "@wso2/ballerina-core";
import axios from 'axios';
import fs from 'fs';
import * as path from 'path';

import {
    checkIsBallerinaPackage,
    checkIsBallerinaWorkspace,
    findBallerinaPackageRoot,
    getBallerinaPackages,
    hasMultipleBallerinaPackages
} from '../../utils';
import { readOrWriteReadmeContent, resolveReadmePath } from '../bi-diagram/utils';
import { README_FILE } from '../../utils/bi';

export const BALLERINA_INTEGRATOR_ISSUES_URL = "https://github.com/wso2/product-ballerina-integrator/issues";
const PACKAGE_FILE = "PACKAGE.md";

interface ProgressMessage {
    message: string;
    increment?: number;
}

export function getUpdatedSource(
    statement: string,
    currentFileContent: string,
    targetPosition: NodePosition,
    skipSemiColon?: boolean,
): string {
    const updatedStatement = skipSemiColon ? statement : statement.trim().endsWith(";") ? statement : statement + ";";
    const updatedContent: string = addToTargetPosition(currentFileContent, targetPosition, updatedStatement,);
    return updatedContent;
}

export function addToTargetPosition(currentContent: string, position: NodePosition, codeSnippet: string): string {

    const splitContent: string[] = currentContent.split(/\n/g) || [];
    const splitCodeSnippet: string[] = codeSnippet.trimEnd().split(/\n/g) || [];
    const noOfLines: number = position.endLine - position.startLine + 1;
    const startLine = splitContent[position.startLine].slice(0, position.startColumn);
    const endLine = isFinite(position?.endLine) ?
        splitContent[position.endLine].slice(position.endColumn || position.startColumn) : '';

    const replacements = splitCodeSnippet.map((line, index) => {
        let modifiedLine = line;
        if (index === 0) {
            modifiedLine = startLine + modifiedLine;
        }
        if (index === splitCodeSnippet.length - 1) {
            modifiedLine = modifiedLine + endLine;
        }
        if (index > 0) {
            modifiedLine = " ".repeat(position.startColumn) + modifiedLine;
        }
        return modifiedLine;
    });

    splitContent.splice(position.startLine, noOfLines, ...replacements);

    return splitContent.join('\n');
}

export async function askProjectPath() {
    return await window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: Uri.file(os.homedir()),
        title: "Select a folder"
    });
}

export async function askFilePath(filters?: Record<string, string[]>) {
    return await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: Uri.file(StateMachine.context().projectPath  ?? os.homedir()),
        filters: filters ?? {
            'Files': ['yaml', 'json', 'yml', 'graphql', 'wsdl']
        },
        title: "Select a file",
    });
}

export async function askFileOrFolderPath() {
    return await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: Uri.file(os.homedir()),
        title: "Select a file or folder"
    });
}

/**
 * The Ballerina package (integration) the user is currently working in — the same notion of
 * "current integration" the visualizer state machine tracks. Falls back to walking up from the
 * state machine's project path in case it is nested inside a package root, then to walking down
 * in case it is instead a multi-package workspace folder with exactly one package underneath;
 * either fallback returns `undefined` if it doesn't resolve to a single package.
 */
export async function resolveIntegrationRoot(): Promise<string | undefined> {
    const projectPath = StateMachine.context()?.projectPath;
    if (!projectPath) {
        return undefined;
    }
    if (await checkIsBallerinaPackage(Uri.file(projectPath))) {
        return projectPath;
    }
    const ancestorRoot = await findBallerinaPackageRoot(projectPath);
    if (ancestorRoot) {
        return ancestorRoot;
    }
    const packages = await getBallerinaPackages(Uri.file(projectPath));
    return packages.length === 1 ? packages[0] : undefined;
}

/** `abs`, relative to `root`, `/`-separated and `./`-prefixed (e.g. `./resources/x.jar`). */
export function toIntegrationRelative(root: string, abs: string): string {
    const rel = path.relative(path.normalize(root), path.normalize(abs)).replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : `./${rel}`;
}

/** First of `filePath`, `<name>-1.<ext>`, `<name>-2.<ext>`, ... that does not already exist. */
export function nextAvailablePath(filePath: string): string {
    let counter = 1;
    let candidate = filePath;
    while (fs.existsSync(candidate)) {
        const parsedPath = path.parse(filePath);
        candidate = path.join(parsedPath.dir, `${parsedPath.name}-${counter}${parsedPath.ext}`);
        counter++;
    }
    return candidate;
}

/**
 * Copies `src` into `<root>/<targetDir>` (creating it if needed) and returns the destination path,
 * or `undefined` if the user cancelled a same-name collision prompt or the copy failed.
 *
 * A file already at the destination with the same name is not assumed to be identical — the user
 * is asked how to resolve it, since two dependencies could otherwise silently point at unrelated
 * files with the same name.
 */
export async function copyIntoIntegration(root: string, src: string, targetDir: string): Promise<string | undefined> {
    const destDir = path.resolve(path.join(root, targetDir));
    if (!isPathInside(root, destDir)) {
        window.showErrorMessage(`Invalid target directory: ${targetDir}`);
        return undefined;
    }
    try {
        fs.mkdirSync(destDir, { recursive: true });
    } catch (error) {
        window.showErrorMessage(`Failed to create ${targetDir}/: ${error}`);
        return undefined;
    }

    const fileName = path.basename(src);
    const destPath = path.join(destDir, fileName);

    if (fs.existsSync(destPath)) {
        const choice = await window.showInformationMessage(
            `${fileName} already exists in ${targetDir}/.`,
            { modal: true, detail: "Choose how to handle the existing file." },
            "Use Existing", "Replace", "Keep Both"
        );
        if (!choice) {
            return undefined;
        }
        if (choice === "Use Existing") {
            return destPath;
        }
        if (choice === "Keep Both") {
            const finalPath = nextAvailablePath(destPath);
            try {
                fs.copyFileSync(src, finalPath);
                return finalPath;
            } catch (error) {
                window.showErrorMessage(`Failed to copy ${fileName}: ${error}`);
                return undefined;
            }
        }
    }

    try {
        fs.copyFileSync(src, destPath);
        return destPath;
    } catch (error) {
        window.showErrorMessage(`Failed to copy ${fileName}: ${error}`);
        return undefined;
    }
}

export async function applyBallerinaTomlEdit(tomlPath: Uri, textEdit: TextEdit) {
    const workspaceEdit = new WorkspaceEdit();

    const range = new Range(new Position(textEdit.range.start.line, textEdit.range.start.character),
        new Position(textEdit.range.end.line, textEdit.range.end.character));

    // Create the position and range
    workspaceEdit.replace(tomlPath, range, textEdit.newText);

    // Apply the edit
    workspace.applyEdit(workspaceEdit).then(success => {
        if (success) {
        } else {
        }
    });
}

export async function selectSampleDownloadPath(): Promise<string> {
    const folderPath = await window.showOpenDialog({ title: 'Sample download directory', canSelectFolders: true, canSelectFiles: false, openLabel: 'Select Folder' });
    if (folderPath && folderPath.length > 0) {
        const newlySelectedFolder = folderPath[0].fsPath;
        return newlySelectedFolder;
    }
    return "";
}

async function downloadFile(url: string, filePath: string, progressCallback?: (downloadProgress: any) => void) {
    const writer = fs.createWriteStream(filePath);
    let totalBytes = 0;
    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            headers: {
                "User-Agent": "axios"
            },
            onDownloadProgress: (progressEvent) => {
                totalBytes = progressEvent.total ?? 0;
                if (totalBytes === 0) {
                    // Cannot calculate progress without total size
                    return;
                }
                const formatSize = (sizeInBytes: number) => {
                    const sizeInKB = sizeInBytes / 1024;
                    if (sizeInKB < 1024) {
                        return `${Math.floor(sizeInKB)} KB`;
                    } else {
                        return `${Math.floor(sizeInKB / 1024)} MB`;
                    }
                };
                const progress = {
                    percentage: Math.round((progressEvent.loaded * 100) / totalBytes),
                    downloadedAmount: formatSize(progressEvent.loaded),
                    downloadSize: formatSize(totalBytes)
                };
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
        window.showErrorMessage(`Error while downloading the file: ${error}`);
        throw error;
    }
}

export async function handleDownloadFile(rawFileLink: string, defaultDownloadsPath: string, progress: Progress<ProgressMessage>) {
    const handleProgress = (progressPercentage) => {
        progress.report({ message: "Downloading file...", increment: progressPercentage });
    };
    try {
        await downloadFile(rawFileLink, defaultDownloadsPath, handleProgress);
    } catch (error) {
        window.showErrorMessage(`Failed to download file: ${error}`);
    }
    progress.report({ message: "Download finished" });
}

export function findWorkspaceTypeFromProjectInfo(projectInfo: ProjectInfo): WorkspaceTypeResponse {
    const projectType = projectInfo.projectKind;
    switch (projectType) {
        case PROJECT_KIND.WORKSPACE_PROJECT:
            return { type: "BALLERINA_WORKSPACE" };
        case PROJECT_KIND.BUILD_PROJECT:
            return { type: "SINGLE_PROJECT" };
        default:
            return { type: "UNKNOWN" };
    }
}

export async function findWorkspaceTypeFromWorkspaceFolders(): Promise<WorkspaceTypeResponse> {
    const workspaceFolders = workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error("No workspaces found.");
    }

    if (workspaceFolders.length > 1) {
        let balPackagesCount = 0;
        for (const folder of workspaceFolders) {
            const packages = await getBallerinaPackages(folder.uri);
            balPackagesCount += packages.length;
        }

        const isWorkspaceFile = workspace.workspaceFile?.scheme === "file";
        if (balPackagesCount > 1) {
            return isWorkspaceFile
                ? { type: "VSCODE_WORKSPACE" }
                : { type: "MULTIPLE_PROJECTS" };
        }
    } else if (workspaceFolders.length === 1) {
        const workspaceFolderPath = workspaceFolders[0].uri.fsPath;

        const isBallerinaWorkspace = await checkIsBallerinaWorkspace(Uri.file(workspaceFolderPath));
        if (isBallerinaWorkspace) {
            return { type: "BALLERINA_WORKSPACE" };
        }

        const isBallerinaPackage = await checkIsBallerinaPackage(Uri.file(workspaceFolderPath));
        if (isBallerinaPackage) {
            return { type: "SINGLE_PROJECT" };
        }

        const hasMultiplePackages = await hasMultipleBallerinaPackages(Uri.file(workspaceFolderPath));
        if (hasMultiplePackages) {
            return { type: "MULTIPLE_PROJECTS" };
        }

        return { type: "UNKNOWN" };
    }

    return { type: "UNKNOWN" };
}

export function getTargetProjectForPublish(): {
    projectPath: string;
    projectName: string;
    artifactType: string;
} | null {
    const { projectPath, projectStructure } = StateMachine.context();
    const target = projectStructure?.projects.find((p) => isSamePath(p.projectPath, projectPath));
    if (!target) {
        return null;
    }
    const projectName = target.projectTitle || target.projectName;
    const artifactType = target.isLibrary ? 'library' : 'integration';
    return { projectPath, projectName, artifactType };
}

export type PublishDescriptionStatus = 'missing' | 'empty' | 'ready';

export interface PublishDescriptionInfo {
    status: PublishDescriptionStatus;
    activeDocPath: string;
    activeDocName: string;
}

export interface PublishPackageInfo {
    orgName: string;
    packageName: string;
    version: string;
}

export async function getPublishDescriptionInfo(projectPath: string): Promise<PublishDescriptionInfo> {
    const readmePath = resolveReadmePath(projectPath);
    const packagePath = resolveDocPath(projectPath, PACKAGE_FILE);

    const readmeContent = readmePath ? readFileContent(readmePath) : undefined;
    const packageContent = packagePath ? readFileContent(packagePath) : undefined;

    const hasReadyDescription = [readmeContent, packageContent].some((content) => hasNonEmptyContent(content));
    if (hasReadyDescription) {
        const activeDocPath = hasNonEmptyContent(readmeContent) && readmePath
            ? readmePath
            : hasNonEmptyContent(packageContent) && packagePath
                ? packagePath
                : path.join(projectPath, README_FILE);
        return {
            status: 'ready',
            activeDocPath,
            activeDocName: path.basename(activeDocPath)
        };
    }

    const hasAnyDescriptionFile = readmePath !== undefined || packagePath !== undefined;
    if (hasAnyDescriptionFile) {
        const activeDocPath = readmePath ?? packagePath ?? path.join(projectPath, README_FILE);
        return {
            status: 'empty',
            activeDocPath,
            activeDocName: path.basename(activeDocPath)
        };
    }

    return {
        status: 'missing',
        activeDocPath: path.join(projectPath, README_FILE),
        activeDocName: README_FILE
    };
}

export function getPublishConfirmation(
    projectName: string,
    artifactType: string,
    descriptionInfo: PublishDescriptionInfo,
    packageInfo: PublishPackageInfo
): { message: string; primaryButton: string } {
    const packageDetails = [
        `Organization: ${packageInfo.orgName || '<required>'}`,
        `Package: ${packageInfo.packageName || '<required>'}`,
        `Version: ${packageInfo.version || '<required>'}`,
        `Description file: ${descriptionInfo.activeDocName}`
    ].join('\n');

    if (descriptionInfo.status === 'missing') {
        return {
            message: `Publish "${projectName}" to Ballerina Central\n\n${packageDetails}\n\nA non-empty README.md file is required before publishing.`,
            primaryButton: 'Create Description File'
        };
    }
    if (descriptionInfo.status === 'empty') {
        return {
            message: `Publish "${projectName}" to Ballerina Central\n\n${packageDetails}\n\nThe detected description file is empty. Please add a description for your ${artifactType}.`,
            primaryButton: 'Edit Description File'
        };
    }
    return {
        message: `Publish "${projectName}" to Ballerina Central\n\n${packageDetails}\n\nYour ${artifactType} will be made available to the Ballerina community.`,
        primaryButton: 'Publish to Central'
    };
}


export async function handlePublishDescriptionSetup(
    descriptionInfo: PublishDescriptionInfo,
    projectPath: string,
    projectName: string,
    artifactType: string
): Promise<boolean> {
    if (descriptionInfo.status === 'missing') {
        const content = `# ${projectName} ${artifactType}\n\nAdd your ${artifactType} description here.`;
        await readOrWriteReadmeContent({ projectPath, content, read: false });
        await openDescriptionInEditor(path.join(projectPath, README_FILE));
        return true;
    }
    if (descriptionInfo.status === 'empty') {
        await openDescriptionInEditor(descriptionInfo.activeDocPath);
        return true;
    }
    return false;
}

export async function openPublishDescriptionInEditor(descriptionInfo: PublishDescriptionInfo): Promise<void> {
    await openDescriptionInEditor(descriptionInfo.activeDocPath);
}

async function openDescriptionInEditor(docPath: string): Promise<void> {
    try {
        const doc = await workspace.openTextDocument(docPath);
        await window.showTextDocument(doc, ViewColumn.Beside);
    } catch (error) {
        window.showErrorMessage(`Failed to open description file "${docPath}": ${error}`);
    }
}

export function getFirstBalaPath(projectPath: string): string | null {
    const balaDirPath = path.join(projectPath, 'target', 'bala');
    if (!fs.existsSync(balaDirPath)) {
        return null;
    }
    const files = fs.readdirSync(balaDirPath);
    return files.length > 0 ? path.join(balaDirPath, files[0]) : null;
}

function resolveDocPath(projectPath: string, fileName: string): string | undefined {
    try {
        const entries = fs.readdirSync(projectPath, { withFileTypes: true });
        const match = entries.find(
            (entry) => entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()
        );
        return match ? path.join(projectPath, match.name) : undefined;
    } catch {
        return undefined;
    }
}

function readFileContent(filePath: string): string {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        return '';
    }
}

function hasNonEmptyContent(content: string | undefined): boolean {
    return content !== undefined && content.trim() !== '';
}
