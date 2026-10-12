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

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getBallerinaPackages } from '../../utils/config';
import { EVALSET_EXCLUDE, EVALSET_GLOB } from './evalset-utils';

// Interface matching the EvalThread object structure
interface EvalThreadJson {
    id: string;
    description: string;
    traces: any[];
}

// Interface matching the new EvalSet JSON structure
interface EvalSetJson {
    id: string;
    name?: string;
    description?: string;
    threads: EvalThreadJson[]; // Array of Thread objects
    created_on?: number;
}

/**
 * Represents a Ballerina project node in the tree view (for multi-project workspaces)
 */
class ProjectNode {
    constructor(
        public readonly projectPath: string,
        public readonly label: string
    ) { }
}

/**
 * Represents an evalset file node in the tree view
 */
class EvalsetFileNode {
    constructor(
        public readonly uri: vscode.Uri,
        public readonly label: string,
        public readonly threadCount: number,
        public readonly description?: string
    ) { }
}

/**
 * Represents a single thread within an evalset
 */
class EvalsetThreadNode {
    constructor(
        public readonly parentUri: vscode.Uri,
        public readonly threadIndex: number,
        public readonly label: string,
        public readonly threadId: string,
        public readonly traceCount: number
    ) { }
}

type EvalsetNode = ProjectNode | EvalsetFileNode | EvalsetThreadNode;

/**
 * TreeDataProvider for displaying evalsets
 */
export class EvalsetTreeDataProvider implements vscode.TreeDataProvider<EvalsetNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<EvalsetNode | undefined | null | void> =
        new vscode.EventEmitter<EvalsetNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<EvalsetNode | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private fileWatcher: vscode.FileSystemWatcher | undefined;

    constructor() {
        this.setupFileWatcher();
    }

    private setupFileWatcher(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        // Watch all evalset files in workspace
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(EVALSET_GLOB);

        // Refresh on file changes
        this.fileWatcher.onDidCreate(() => this.refresh());
        this.fileWatcher.onDidChange(() => this.refresh());
        this.fileWatcher.onDidDelete(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: EvalsetNode): vscode.TreeItem {
        if (element instanceof ProjectNode) {
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.Expanded
            );
            item.iconPath = new vscode.ThemeIcon('project');
            item.contextValue = 'evalsetProject';
            return item;
        } else if (element instanceof EvalsetFileNode) {
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            item.tooltip = element.description || `EvalSet with ${element.threadCount} threads`;
            item.description = `${element.threadCount} thread${element.threadCount !== 1 ? 's' : ''}`;
            item.iconPath = new vscode.ThemeIcon('collection');
            item.contextValue = 'evalsetFile';
            item.resourceUri = element.uri;
            item.command = {
                command: 'ballerina.openEvalsetViewer',
                title: 'Open Evalset',
                arguments: [element.uri]
            };
            return item;
        } else {
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.None
            );
            item.tooltip = `Thread ID: ${element.threadId} (${element.traceCount} traces)`;

            item.iconPath = new vscode.ThemeIcon('file-text');
            item.contextValue = 'evalsetThread';
            item.resourceUri = element.parentUri;

            item.command = {
                command: 'ballerina.openEvalsetViewer',
                title: 'Open Evalset Thread',
                arguments: [element.parentUri, element.threadId]
            };
            return item;
        }
    }

    async getChildren(element?: EvalsetNode): Promise<EvalsetNode[]> {
        if (!element) {
            return this.getRootChildren();
        } else if (element instanceof ProjectNode) {
            return this.getEvalsetFilesForProject(element.projectPath);
        } else if (element instanceof EvalsetFileNode) {
            return this.getThreadsForFile(element.uri);
        }

        return [];
    }

    /**
     * Get root-level children. If multiple Ballerina projects exist, show project nodes.
     * Otherwise, show evalset files directly.
     */
    private async getRootChildren(): Promise<EvalsetNode[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        // Discover all Ballerina packages across all workspace folders
        const allPackages: string[] = [];
        for (const folder of workspaceFolders) {
            const packages = await getBallerinaPackages(folder.uri);
            allPackages.push(...packages);
        }

        if (allPackages.length > 1) {
            // Multiple projects: show project grouping nodes (only for projects that have evalsets)
            const projectNodes: ProjectNode[] = [];
            for (const packagePath of allPackages) {
                const hasEvalsets = await this.projectHasEvalsets(packagePath);
                if (hasEvalsets) {
                    const label = path.basename(packagePath);
                    projectNodes.push(new ProjectNode(packagePath, label));
                }
            }
            return projectNodes;
        }

        // Single project or no packages found: show evalset files directly
        return this.getEvalsetFiles();
    }

    /**
     * Check if a project directory contains any evalset files
     */
    private async projectHasEvalsets(projectPath: string): Promise<boolean> {
        const pattern = new vscode.RelativePattern(projectPath, EVALSET_GLOB);
        const files = await vscode.workspace.findFiles(pattern, EVALSET_EXCLUDE, 1);
        return files.length > 0;
    }

    /**
     * Get evalset files scoped to a specific project
     */
    private async getEvalsetFilesForProject(projectPath: string): Promise<EvalsetFileNode[]> {
        const pattern = new vscode.RelativePattern(projectPath, EVALSET_GLOB);
        const evalsetFiles = await vscode.workspace.findFiles(pattern, EVALSET_EXCLUDE);
        return this.parseEvalsetFiles(evalsetFiles);
    }

    /**
     * Get all evalset files in the workspace (used for single-project workspaces)
     */
    private async getEvalsetFiles(): Promise<EvalsetFileNode[]> {
        const evalsetFiles = await vscode.workspace.findFiles(EVALSET_GLOB, EVALSET_EXCLUDE);
        return this.parseEvalsetFiles(evalsetFiles);
    }

    /**
     * Parse evalset file URIs into EvalsetFileNodes
     */
    private async parseEvalsetFiles(evalsetFiles: vscode.Uri[]): Promise<EvalsetFileNode[]> {
        const nodes: EvalsetFileNode[] = [];

        for (const uri of evalsetFiles) {
            try {
                const content = await fs.promises.readFile(uri.fsPath, 'utf-8');
                const evalsetData: EvalSetJson = JSON.parse(content);

                // Validation for new format
                if (!evalsetData.threads || !Array.isArray(evalsetData.threads)) {
                    continue;
                }

                const threadCount = evalsetData.threads.length;
                const label = evalsetData.name || path.basename(uri.fsPath, '.evalset.json');
                const description = evalsetData.description || '';

                nodes.push(new EvalsetFileNode(uri, label, threadCount, description));
            } catch (error) {
                console.error(`Failed to parse evalset file ${uri.fsPath}:`, error);
            }
        }

        return nodes;
    }

    /**
     * Get threads for a specific evalset file
     */
    private async getThreadsForFile(uri: vscode.Uri): Promise<EvalsetThreadNode[]> {
        try {
            const content = await fs.promises.readFile(uri.fsPath, 'utf-8');
            const evalsetData: EvalSetJson = JSON.parse(content);
            const nodes: EvalsetThreadNode[] = [];

            if (!evalsetData.threads || !Array.isArray(evalsetData.threads)) {
                return [];
            }

            evalsetData.threads.forEach((threadObj: EvalThreadJson, index: number) => {
                // Ensure traces is an array
                const traceCount = Array.isArray(threadObj.traces) ? threadObj.traces.length : 0;

                // Use the name defined in the thread object, fallback to generated name
                const label = threadObj.id || `thread ${index + 1}`;
                const threadId = threadObj.id || `thread-${index + 1}`;

                nodes.push(new EvalsetThreadNode(
                    uri,
                    index,
                    label,
                    threadId,
                    traceCount
                ));
            });

            return nodes;
        } catch (error) {
            console.error(`Failed to get threads for ${uri.fsPath}:`, error);
            return [];
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.fileWatcher?.dispose();
        this._onDidChangeTreeData.dispose();
    }
}
