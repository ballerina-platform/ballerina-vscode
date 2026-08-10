'use strict';
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

import path from "path";
import { StateMachine } from "../../stateMachine";
import { TestsDiscoveryRequest, TestsDiscoveryResponse, ProjectInfo, PROJECT_KIND, isPathInside } from "@wso2/ballerina-core";
import { BallerinaExtension } from "../../core";
import { Position, Range, TestController, Uri, TestItem, commands } from "vscode";
import { getWorkspaceRoot, getCurrentProjectRoot } from "../../utils/project-utils";
import { URI } from "vscode-uri";
import { getTestFunctionGroups } from "../../utils/test-discovery";

let groups: string[] = [];

export async function discoverTestFunctionsInProject(ballerinaExtInstance: BallerinaExtension,
    testController: TestController) {
    groups.push(testController.id);
    
    const workspaceRoot = getWorkspaceRoot();
    const projectInfo = await ballerinaExtInstance.langClient?.getProjectInfo({ projectPath: workspaceRoot });
    const isEmptyProject = projectInfo?.projectKind === PROJECT_KIND.WORKSPACE_PROJECT &&
        projectInfo.children?.length === 0;

    if (isEmptyProject) {
        return;
    }

    // Handle project with multiple integrations/libraries
    if (projectInfo?.children?.length > 0) {
        await discoverTestsInWorkspace(projectInfo.children, ballerinaExtInstance, testController);
        return;
    }

    // Handle single project
    await discoverTestsInSingleProject(ballerinaExtInstance, testController);
}

async function discoverTestsInWorkspace(
    projects: ProjectInfo[],
    ballerinaExtInstance: BallerinaExtension,
    testController: TestController
) {
    // Iterate over project children sequentially to allow awaiting each request
    for (const project of projects) {
        if (!project?.projectPath) {
            continue;
        }

        const response: TestsDiscoveryResponse = await ballerinaExtInstance.langClient?.getProjectTestFunctions({
            projectPath: project.projectPath
        });

        if (response) {
            createTests(response, testController, project.projectPath);
            setGroupsContext();
        }
    }
}

async function discoverTestsInSingleProject(
    ballerinaExtInstance: BallerinaExtension,
    testController: TestController,
) {
    const projectPath = await getCurrentProjectRoot();

    if (!projectPath) {
        console.warn('No project root found for test discovery');
        return;
    }

    const request: TestsDiscoveryRequest = { projectPath };
    const response: TestsDiscoveryResponse = await ballerinaExtInstance.langClient?.getProjectTestFunctions(request);

    if (response) {
        createTests(response, testController);
        setGroupsContext();
    }
}

function createTests(response: TestsDiscoveryResponse, testController: TestController, projectPath?: string) {
    if (!response.result) {
        return;
    }

    const entries = getTestFunctionGroups(response);

    // Determine if we're in a workspace context (multiple projects)
    const isWorkspaceContext = projectPath !== undefined;

    // Get or create the project-level group for workspace scenarios
    let projectGroupItem: TestItem | undefined;
    if (isWorkspaceContext) {
        const projectName = path.basename(projectPath);
        const projectGroupId = `project:${projectName}`;

        projectGroupItem = testController.items.get(projectGroupId);
        if (!projectGroupItem) {
            projectGroupItem = testController.createTestItem(projectGroupId, projectName, URI.file(projectPath));
            testController.items.add(projectGroupItem);
            groups.push(projectGroupId);
        }
    }

    // Iterate over the result map (test groups)
    for (const [group, testFunctions] of entries) {
        let groupItem: TestItem | undefined;
        // Remove leading/trailing quotes from group name for display
        const cleanedGroupName = group.replace(/^["']|["']$/g, '');

        // For workspace context with DEFAULT_GROUP, skip the group level and add tests directly to project
        if (isWorkspaceContext && group === 'DEFAULT_GROUP' && projectGroupItem) {
            groupItem = projectGroupItem;
        } else if (isWorkspaceContext && projectGroupItem) {
            // For workspace context with named groups, create test group under project
            const groupId = `group:${path.basename(projectPath)}:${group}`;
            groupItem = projectGroupItem.children.get(groupId);
            if (!groupItem) {
                groupItem = testController.createTestItem(groupId, cleanedGroupName);
                projectGroupItem.children.add(groupItem);
                groups.push(groupId);
            }
        } else {
            // Single project - create group at root level (including DEFAULT_GROUP)
            const groupId = `group:${group}`;
            groupItem = testController.items.get(groupId);
            if (!groupItem) {
                groupItem = testController.createTestItem(groupId, cleanedGroupName);
                testController.items.add(groupItem);
                groups.push(groupId);
            }
        }

        // Iterate over the test functions in the group.
        for (const testFunc of testFunctions) {
            // Generate a unique ID for the test item using the function name
            const fileName: string = testFunc.lineRange.fileName;
            const resolvedProjectPath = projectPath || StateMachine.context().projectPath;
            const fileUri = Uri.file(path.join(resolvedProjectPath, fileName));
            const testId = `test:${resolvedProjectPath}:${path.basename(fileUri.path)}:${testFunc.functionName}`;

            // Create a test item for the test function
            const testItem = testController.createTestItem(testId, testFunc.functionName, fileUri);

            // Set the range for the test (optional, for navigation)
            const startPosition = new Position(
                testFunc.lineRange.startLine.line, // Convert to 0-based line number
                testFunc.lineRange.startLine.offset
            );
            const endPosition = new Position(
                testFunc.lineRange.endLine.line, // Convert to 0-based line number
                testFunc.lineRange.endLine.offset
            );
            testItem.range = new Range(startPosition, endPosition);

            groupItem.children.add(testItem);
        }
    }
}


export async function handleFileChange(ballerinaExtInstance: BallerinaExtension,
    uri: Uri, testController: TestController) {
    // Determine which project this file belongs to
    const projectInfo = StateMachine.context().projectInfo;
    let targetProjectPath: string | undefined;
    const isWorkspace = projectInfo?.children?.length > 0;

    // Check if this file belongs to a child project in a workspace
    if (isWorkspace) {
        for (const child of projectInfo.children) {
            if (isPathInside(child.projectPath, uri.fsPath)) {
                targetProjectPath = child.projectPath;
                break;
            }
        }
    }

    // If not found in children, use the main project path
    if (!targetProjectPath) {
        targetProjectPath = await getCurrentProjectRoot();
    }

    if (!targetProjectPath) {
        console.warn('Could not determine project path for file change:', uri.path);
        return;
    }

    const request: TestsDiscoveryRequest = {
        projectPath: uri.path
    };
    const response: TestsDiscoveryResponse = await ballerinaExtInstance.langClient?.getFileTestFunctions(request);
    if (!response || !response.result) {
        return;
    }

    await handleFileDelete(uri, testController);
    createTests(response, testController, isWorkspace ? targetProjectPath : undefined);
    setGroupsContext();
}

export async function handleFileDelete(uri: Uri, testController: TestController) {
    // Determine which project this file belongs to
    const projectInfo = StateMachine.context().projectInfo;
    let targetProjectPath: string | undefined;

    // Check if this file belongs to a child project in a workspace
    if (projectInfo?.children?.length > 0) {
        for (const child of projectInfo.children) {
            if (isPathInside(child.projectPath, uri.fsPath)) {
                targetProjectPath = child.projectPath;
                break;
            }
        }
    }

    // If not found in children, use the main project path
    if (!targetProjectPath) {
        targetProjectPath = await getCurrentProjectRoot();
    }

    if (!targetProjectPath) {
        console.warn('Could not determine project path for file deletion:', uri.path);
        return;
    }

    const fileName = path.basename(uri.path);

    // Helper function to check if a test belongs to the specific file in the specific project
    const belongsToFile = (testItem: TestItem): boolean => {
        // Test ID format: test:${projectPath}:${fileName}:${functionName}
        // We need to match both the project path and the filename
        return testItem.id.startsWith(`test:${targetProjectPath}:${fileName}:`);
    };

    // Helper function to delete tests from a test group item
    const deleteTestsFromGroup = (groupItem: TestItem) => {
        const childrenToDelete: TestItem[] = [];
        groupItem.children.forEach((child) => {
            if (belongsToFile(child)) {
                childrenToDelete.push(child);
            }
        });

        // Remove the matching test function items
        childrenToDelete.forEach((child) => {
            groupItem.children.delete(child.id);
        });

        return groupItem.children.size === 0;
    };

    // Iterate over all root-level items in the Test Explorer
    testController.items.forEach((item) => {
        if (isProjectGroupItem(item)) {
            // Only process this project group if it matches our target project
            const projectName = path.basename(targetProjectPath);
            if (item.id !== `project:${projectName}`) {
                return; // Skip this project, it's not the one we're looking for
            }

            // Project group can contain either test groups or tests directly (when DEFAULT_GROUP is skipped)
            const groupsToDelete: TestItem[] = [];
            const testsToDelete: TestItem[] = [];

            item.children.forEach((child) => {
                if (isTestFunctionItem(child)) {
                    // Test added directly to project (DEFAULT_GROUP was skipped)
                    if (belongsToFile(child)) {
                        testsToDelete.push(child);
                    }
                } else if (isTestGroupItem(child)) {
                    // Test group - check if it becomes empty after deletion
                    const isEmpty = deleteTestsFromGroup(child);
                    if (isEmpty) {
                        groupsToDelete.push(child);
                    }
                }
            });

            // Remove tests that belong to the file
            testsToDelete.forEach((test) => {
                item.children.delete(test.id);
            });

            // Remove empty test groups
            groupsToDelete.forEach((groupItem) => {
                item.children.delete(groupItem.id);
                groups = groups.filter((group) => group !== groupItem.id);
            });

            // If the project group is empty after deletion, remove it
            if (item.children.size === 0) {
                testController.items.delete(item.id);
                groups = groups.filter((group) => group !== item.id);
            }
        } else if (isTestGroupItem(item)) {
            // Single project scenario - test group at root level
            const isEmpty = deleteTestsFromGroup(item);

            // If the group is empty after deletion, remove it
            if (isEmpty) {
                testController.items.delete(item.id);
                groups = groups.filter((group) => group !== item.id);
            }
        }
    });
}

export function isTestFunctionItem(item: TestItem): boolean {
    // Test function items have IDs starting with "test:"
    return item.id.startsWith('test:');
}

export function isTestGroupItem(item: TestItem): boolean {
    // Test group items have IDs starting with "group:"
    return item.id.startsWith('group:');
}

export function isProjectGroupItem(item: TestItem): boolean {
    // Project group items have IDs starting with "project:"
    return item.id.startsWith('project:');
}

function setGroupsContext() {
    commands.executeCommand('setContext', 'testGroups', groups);
}
