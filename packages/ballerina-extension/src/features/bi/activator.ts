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
import { commands, Uri, workspace, window, ConfigurationTarget, TreeItem } from "vscode";
import {
    BI_COMMANDS,
    BIDeleteByComponentInfoRequest,
    ComponentInfo,
    DIRECTORY_MAP,
    EVENT_TYPE,
    FlowNode,
    isSamePath,
    MACHINE_VIEW,
    NodePosition,
    normalizeProjectPath,
    ProjectInfo
} from "@wso2/ballerina-core";
import { BallerinaExtension } from "../../core";
import { openView } from "../../stateMachine";
import { ENABLE_DEBUG_LOG, ENABLE_TRACE_LOG, TRACE_SERVER } from "../../core/preferences";
import { prepareAndGenerateConfig } from "../config-generator/configGenerator";
import { StateMachine } from "../../stateMachine";
import { BiDiagramRpcManager } from "../../rpc-managers/bi-diagram/rpc-manager";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { isInDevant } from "../../utils";
import { isPositionEqual, isPositionWithinDeletedComponent } from "../../utils/history/util";
import { startDebugging } from "../editor-support/activator";
import {
    createBIProjectFromMigration,
    createBIProjectPure,
    createBIWorkspaceWithProject,
    createEmptyBIWorkspace
} from "../../utils/bi";
import { checkAndRunPendingEnhancement } from "../ai/migration/orchestrator";
import { createVersionNumber, findBallerinaPackageRoot, isSupportedSLVersion } from ".././../utils";
import { extension } from "../../BalExtensionContext";
import { VisualizerWebview } from "../../views/visualizer/webview";
import { getCurrentProjectRoot, tryGetCurrentBallerinaFile } from "../../utils/project-utils";
import { selectPackageOrPrompt, needsProjectDiscovery, requiresPackageSelection } from "../../utils/command-utils";
import { handleAIAgentServiceDeletion } from "../../utils/ai-service-utils";
import { findWorkspaceTypeFromWorkspaceFolders } from "../../rpc-managers/common/utils";
import { MESSAGES } from "../project";
import { ensureICPServerRunning } from "../icp";
import { TracerMachine } from "../tracing";
import { DefaultServer } from "../../webview-communication/DefaultServer";

const FOCUS_DEBUG_CONSOLE_COMMAND = 'workbench.debug.action.focusRepl';
const TRACE_SERVER_OFF = "off";
const TRACE_SERVER_VERBOSE = "verbose";

export function activate(context: BallerinaExtension) {
    const isWorkspaceSupported = isSupportedSLVersion(extension.ballerinaExtInstance, createVersionNumber(2201, 13, 0));

    // Set context for command visibility
    commands.executeCommand('setContext', 'ballerina.bi.workspaceSupported', isWorkspaceSupported);

    commands.registerCommand(BI_COMMANDS.BI_RUN_PROJECT, async () => {
        const stateMachineContext = StateMachine.context();
        const { workspacePath, view, projectPath, projectInfo } = stateMachineContext;
        const isWebviewOpen = VisualizerWebview.currentPanel !== undefined;
        const hasActiveTextEditor = !!window.activeTextEditor;

        // Check if ICP is enabled for this project (skip entirely in Devant)
        if (!isInDevant() && projectPath && stateMachineContext.langClient) {
            try {
                const icpStatus = await stateMachineContext.langClient.isIcpEnabled({ projectPath });
                if (icpStatus && 'enabled' in icpStatus && icpStatus.enabled) {
                    const proceed = await ensureICPServerRunning(projectPath);
                    if (!proceed) {
                        return;
                    }
                }
            } catch (error) {
                // ICP check failed, continue with run
                console.error('[ICP] Error checking ICP status:', error);
            }
        }

        const needsPackageSelection = requiresPackageSelection(
            workspacePath, view, projectPath, isWebviewOpen, hasActiveTextEditor
        );

        prepareAndGenerateConfig(context, projectPath, false, true, true, needsPackageSelection);
    });

    commands.registerCommand(BI_COMMANDS.BI_DEBUG_PROJECT, () => {
        commands.executeCommand(FOCUS_DEBUG_CONSOLE_COMMAND);
        handleDebugCommandWithContext();
    });

    commands.registerCommand(BI_COMMANDS.ADD_CONNECTIONS, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.AddConnectionWizard);
    });

    commands.registerCommand(BI_COMMANDS.ADD_AGENT, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.AddAgent);
    });

    commands.registerCommand(BI_COMMANDS.VIEW_AGENTS, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.AgentsOverview);
    });

    commands.registerCommand(BI_COMMANDS.ADD_CUSTOM_CONNECTOR, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.AddConnectionWizard);
    });

    commands.registerCommand(BI_COMMANDS.ADD_ENTRY_POINT, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.BIComponentView);
    });

    commands.registerCommand(BI_COMMANDS.ADD_TYPE, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.TypeDiagram, { addType: true });
    });

    commands.registerCommand(BI_COMMANDS.VIEW_TYPE_DIAGRAM, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.TypeDiagram, { rootDiagramId: `type-diagram-${Date.now()}` });
    });

    commands.registerCommand(BI_COMMANDS.ADD_FUNCTION, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.BIFunctionForm);
    });

    commands.registerCommand(BI_COMMANDS.ADD_CONFIGURATION, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.AddConfigVariables);
    });

    commands.registerCommand(BI_COMMANDS.VIEW_CONFIGURATION, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.ViewConfigVariables);
    });

    commands.registerCommand(BI_COMMANDS.SHOW_OVERVIEW, async () => {
        try {
            const result = await findWorkspaceTypeFromWorkspaceFolders();
            if (result.type === "BALLERINA_WORKSPACE") {
                openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.WorkspaceOverview });
            } else if (result.type === "SINGLE_PROJECT") {
                openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.PackageOverview });
            } else {
                const packageRoot = await getCurrentProjectRoot();
                if (!packageRoot || !window.activeTextEditor) {
                    window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
                    return;
                }
                const projectInfo = await StateMachine.langClient().getProjectInfo({ projectPath: packageRoot });
                await StateMachine.updateProjectRootAndInfo(packageRoot, projectInfo);
                openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.PackageOverview });

            }
        } catch (error) {
            if (error instanceof Error && error.message === 'No valid Ballerina project found') {
                window.showErrorMessage(error.message);
            } else {
                window.showErrorMessage("Unknown error occurred.");
            }
        }
    });

    commands.registerCommand(BI_COMMANDS.ADD_PROJECT, async () => {
        if (!isWorkspaceSupported) {
            window.showErrorMessage('This command requires Ballerina version 2201.13.0 or higher. ');
            return;
        }

        const projectPath = StateMachine.context().projectPath || StateMachine.context().workspacePath;
        if (projectPath) {
            openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.BIAddProjectForm });
        } else {
            openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.BIProjectForm });
        }
    });

    commands.registerCommand(BI_COMMANDS.ADD_DATA_MAPPER, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.BIDataMapperForm);
    });

    commands.registerCommand(BI_COMMANDS.ADD_NATURAL_FUNCTION, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.BINPFunctionForm);
    });

    commands.registerCommand(BI_COMMANDS.ADD_WORKFLOW, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.BIWorkflowForm);
    });

    commands.registerCommand(BI_COMMANDS.ADD_WORKFLOW_ACTIVITY, async (item?: TreeItem) => {
        await handleCommandWithContext(item, MACHINE_VIEW.BIActivityForm);
    });

    commands.registerCommand(BI_COMMANDS.TOGGLE_TRACE_LOGS, toggleTraceLogs);

    commands.registerCommand(BI_COMMANDS.CREATE_BI_PROJECT, async (params) => {
        let path: string;
        if (params.createAsWorkspace) {
            if (params.projectName) {
                path = await createBIWorkspaceWithProject(params);
            } else {
                path = await createEmptyBIWorkspace(params);
            }
        } else {
            path = await createBIProjectPure(params);
        }
        return path;
    });

    commands.registerCommand(BI_COMMANDS.CREATE_BI_MIGRATION_PROJECT, (params) => {
        return createBIProjectFromMigration(params);
    });

    // Lazily starts the WS server that serves the BI project-creation RPCs to the
    // embedded form (which is owned by this extension but hosted in the WSO2
    // Integrator webview), and returns the connection coordinates.
    commands.registerCommand(BI_COMMANDS.GET_BI_FORM_WS_BOOTSTRAP, () => {
        return DefaultServer.getInstance().getWsBootstrap();
    });

    commands.registerCommand(BI_COMMANDS.DELETE_COMPONENT, async (item?: TreeItem & { info?: string, position?: NodePosition }) => {
        // Guard: DELETE requires a tree item context
        if (!item) {
            window.showErrorMessage('This command must be invoked from the project explorer.');
            return;
        }

        console.log(">>> delete component", item);

        if (item.contextValue === DIRECTORY_MAP.CONNECTION || item.contextValue === DIRECTORY_MAP.AGENT) {
            await handleConnectionDeletion(item.label as string, item.info);
        } else if (item.contextValue === DIRECTORY_MAP.LOCAL_CONNECTORS) {
            await handleLocalModuleDeletion(item.label as string, item.info);
        } else {
            if (!item.position) {
                window.showErrorMessage('Position is required to delete a component.');
                return;
            }
            await handleComponentDeletion(item.contextValue as string, item.label as string, item.info, item.position as NodePosition);
        }
    });

    // Open the ballerina toml file as the first file for LS to trigger the project loading
    openBallerinaTomlFile(context);

    // After the language server and project are fully ready, check whether a
    // migration AI enhancement was scheduled before the last folder reload.
    const service = StateMachine.service();
    const subscription = service.subscribe((state) => {
        if (state.value === "extensionReady" && state.changed) {
            subscription.unsubscribe();
            checkAndRunPendingEnhancement().catch((err) =>
                console.error("[MigrationEnhancement] Unexpected error:", err)
            );
        }
    });
}


/**
 * Helper function to handle command invocation with proper context resolution.
 * Supports both tree view clicks and command palette invocation.
 * 
 * @param item - The tree item (undefined when invoked from command palette)
 * @param view - The view to open
 * @param additionalViewParams - Additional parameters to pass to the view
 */
async function handleCommandWithContext(
    item: TreeItem | undefined,
    view: MACHINE_VIEW,
    additionalViewParams: Record<string, any> = {}
): Promise<void> {
    const { projectInfo, projectPath, view: currentView, workspacePath } = StateMachine.context();
    const isWebviewOpen = VisualizerWebview.currentPanel !== undefined;
    const hasActiveTextEditor = !!window.activeTextEditor;

    const currentBallerinaFile = tryGetCurrentBallerinaFile();
    const projectRoot = await findBallerinaPackageRoot(currentBallerinaFile);

    // Scenario 1: Multi-package workspace invoked from command palette
    if (!item) {
        if (requiresPackageSelection(workspacePath, currentView, projectPath, isWebviewOpen, hasActiveTextEditor)) {
            await handleCommandWithPackageSelection(projectInfo, view, additionalViewParams);
            return;
        }

        if (needsProjectDiscovery(projectInfo, projectRoot, projectPath)) {
            try {
                const success = await tryHandleCommandWithDiscoveredProject(view, additionalViewParams);
                if (!success) {
                    window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
                }
            } catch {
                window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
            }
            return;
        }

        openView(EVENT_TYPE.OPEN_VIEW, {
            view,
            projectPath,
            ...additionalViewParams
        }, true);
    }
    // Scenario 2: Invoked from tree view with item context
    else if (item?.resourceUri) {
        const projectPath = normalizeProjectPath(item.resourceUri.fsPath);
        openView(EVENT_TYPE.OPEN_VIEW, {
            view,
            projectPath,
            ...additionalViewParams
        }, true);
    }
    // Scenario 3: Default - no specific context
    else {
        openView(EVENT_TYPE.OPEN_VIEW, { view, ...additionalViewParams }, true);
    }
}

/** Handles the debug command based on current workspace context. */
async function handleDebugCommandWithContext() {
    TracerMachine.startServer();
    const { workspacePath, view, projectPath, projectInfo } = StateMachine.context();
    const isWebviewOpen = VisualizerWebview.currentPanel !== undefined;
    const hasActiveTextEditor = !!window.activeTextEditor;

    const currentBallerinaFile = tryGetCurrentBallerinaFile();
    const projectRoot = await findBallerinaPackageRoot(currentBallerinaFile);

    if (requiresPackageSelection(workspacePath, view, projectPath, isWebviewOpen, hasActiveTextEditor)) {
        await handleDebugCommandWithPackageSelection(projectInfo);
        return;
    }

    if (needsProjectDiscovery(projectInfo, projectRoot, projectPath)) {
        try {
            await handleDebugCommandWithProjectDiscovery();
        } catch {
            window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
        }
        return;
    }

    if (!projectPath) {
        window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
        return;
    }

    startDebugging(Uri.file(projectPath), false, true);
}

/**
 * Prompts user to select an integration and starts debugging.
 * @param projectInfo - The project info
 * @returns void
 */
async function handleDebugCommandWithPackageSelection(projectInfo: ProjectInfo) {
    const availablePackages = projectInfo?.children.map((child: ProjectInfo) => child.projectPath) ?? [];

    const selectedPackage = await selectPackageOrPrompt(availablePackages, "Select an integration to debug");
    if (!selectedPackage) {
        return;
    }

    await StateMachine.updateProjectRootAndInfo(selectedPackage, projectInfo);
    startDebugging(Uri.file(selectedPackage), false, true);
}

/** Discovers project root from active file and starts debugging. */
async function handleDebugCommandWithProjectDiscovery() {
    const packageRoot = await getCurrentProjectRoot();

    if (packageRoot) {
        const projectInfo = await StateMachine.langClient().getProjectInfo({ projectPath: packageRoot });
        await StateMachine.updateProjectRootAndInfo(packageRoot, projectInfo);
        startDebugging(Uri.file(packageRoot), false, true);
    } else {
        window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
    }
}

function openBallerinaTomlFile(context: BallerinaExtension) {
    const projectPath = StateMachine.context().projectPath || StateMachine.context().workspacePath;
    if (!projectPath) {
        return;
    }
    const ballerinaTomlFile = path.join(projectPath, "Ballerina.toml");
    try {
        const content = readFileSync(ballerinaTomlFile, "utf8");
        if (content) {
            context.langClient.didOpen({
                textDocument: {
                    uri: Uri.file(ballerinaTomlFile).toString(),
                    languageId: "toml",
                    version: 1,
                    text: content,
                },
            });
            console.log(`>>> Opened file: ${ballerinaTomlFile}`);
        } else {
            console.error(`>>> No content found for file ${ballerinaTomlFile}`);
        }
    } catch (error) {
        console.error(`Error opening file ${ballerinaTomlFile}:`, error);
    }
}

function openAllBallerinaFiles(context: BallerinaExtension) {
    const projectPath = StateMachine.context().projectPath;

    if (context.langClient && projectPath) {
        try {
            // Find all Ballerina files in the project
            const ballerinaFiles = findBallerinaFiles(projectPath);
            console.log(`>>> Found ${ballerinaFiles.length} Ballerina files in the project`);

            // Open each Ballerina file
            ballerinaFiles.forEach((filePath) => {
                try {
                    const content = readFileSync(filePath, "utf8");
                    if (content) {
                        context.langClient.didOpen({
                            textDocument: {
                                uri: Uri.file(filePath).toString(),
                                languageId: "ballerina",
                                version: 1,
                                text: content,
                            },
                        });
                        console.log(`>>> Opened file: ${filePath}`);
                    } else {
                        console.error(`>>> No content found for file ${filePath}`);
                    }
                } catch (error) {
                    console.error(`Error opening file ${filePath}:`, error);
                }
            });
        } catch (error) {
            console.error("Error finding Ballerina files:", error);
        }
    }
}

// Function to recursively find all Ballerina files
const findBallerinaFiles = (dir: string, fileList: string[] = []): string[] => {
    const files = readdirSync(dir);

    files.forEach((file: string) => {
        const filePath = path.join(dir, file);
        const stat = statSync(filePath);

        if (stat.isDirectory() && !file.startsWith(".")) {
            // Recursively search directories, skip hidden directories
            fileList = findBallerinaFiles(filePath, fileList);
        } else if (file.endsWith(".bal")) {
            // Add Ballerina files to the list
            fileList.push(filePath);
        }
    });

    return fileList;
};

const handleComponentDeletion = async (componentType: string, itemLabel: string, filePath: string, position: NodePosition) => {
    const rpcClient = new BiDiagramRpcManager();
    const { projectPath, projectInfo } = StateMachine.context();
    const projectRoot = await findBallerinaPackageRoot(filePath);
    if (projectRoot && (!projectPath || !isSamePath(projectRoot, projectPath))) {
        await StateMachine.updateProjectRootAndInfo(projectRoot, projectInfo);
    }
    const projectStructure = await rpcClient.getProjectStructure();
    const project = projectStructure.projects.find(project => isSamePath(project.projectPath, projectRoot));
    const componentCategory = project?.directoryMap[componentType];

    if (!componentCategory) {
        console.error(`Component type ${componentType} not found in project structure`);
        return;
    }

    for (const component of componentCategory) {
        if (component.name === itemLabel && component?.position?.startLine === position.startLine && component?.position?.startColumn === position.startColumn) {
            if (component.name.startsWith("AI Agent Services")) {
                await handleAIAgentServiceDeletion(component, rpcClient, filePath, deleteComponent);
                return;
            }
            const componentInfo: ComponentInfo = {
                name: component.name,
                filePath: component.path,
                startLine: component.position.startLine,
                startColumn: component.position.startColumn,
                endLine: component.position.endLine,
                endColumn: component.position.endColumn,
                resources: component?.resources
            };

            await deleteComponent(componentInfo, rpcClient, filePath);
            return;
        }
    }
    console.error(`Component ${itemLabel} not found in project structure`);
    window.showErrorMessage(`Component '${itemLabel}' not found — deletion failed`);
};

const handleLocalModuleDeletion = async (moduleName: string, filePath: string) => {
    const rpcClient = new BiDiagramRpcManager();
    // Note: Project path is overriden at rpc-client level.
    rpcClient.deleteOpenApiGeneratedModules({ projectPath: "", module: moduleName }).then((response) => {
        console.log(">>> Updated source code after local connector delete", response);
    });
};

const handleConnectionDeletion = async (itemLabel: string, filePath: string) => {
    const rpcClient = new BiDiagramRpcManager();
    rpcClient.getModuleNodes().then((response) => {
        console.log(">>> moduleNodes", { moduleNodes: response });
        const connector = response?.flowModel?.connections.find(
            (node) => node.properties.variable.value === itemLabel.trim()
        );
        if (connector) {
            rpcClient
                .deleteFlowNode({
                    filePath: filePath,
                    flowNode: connector,
                })
                .then((response) => {
                    console.log(">>> Updated source code after delete", response);
                    if (response.artifacts) {
                        if (hasNoComponentsOpenInDiagram() || isFlowNodeOpenInDiagram(connector)) {
                            openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.PackageOverview });
                        }
                    } else {
                        console.error(">>> Error updating source code", response);
                    }
                });
        } else {
            console.error(">>> Error finding connector", { connectionName: itemLabel });
        }
    });
};

async function deleteComponent(component: ComponentInfo, rpcClient: BiDiagramRpcManager, filePath: string) {
    const req: BIDeleteByComponentInfoRequest = {
        filePath: filePath,
        component: component,
    };

    console.log(">>> delete component request", req);

    await rpcClient.deleteByComponentInfo(req);

    if (hasNoComponentsOpenInDiagram() || isComponentOpenInDiagram(component)) {
        openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.PackageOverview });
    }
}

function isComponentOpenInDiagram(component: ComponentInfo) {
    const openedCompoentPosition = StateMachine.context().position;
    const openedComponentFilePath = StateMachine.context().documentUri;

    if (!openedCompoentPosition) {
        return false;
    }

    const componentPosition = {
        startLine: component.startLine,
        startColumn: component.startColumn,
        endLine: component.endLine,
        endColumn: component.endColumn
    };
    const componentFilePath = component.filePath;
    const isWithinDeletedComponent = isPositionWithinDeletedComponent(openedCompoentPosition, componentPosition);
    const areFilePathsEqual = isFilePathsEqual(openedComponentFilePath, componentFilePath);
    return isWithinDeletedComponent && areFilePathsEqual;
}

function isFlowNodeOpenInDiagram(connector: FlowNode) {
    const openedCompoentPosition = StateMachine.context().position;
    const openedComponentFilePath = StateMachine.context().documentUri;

    if (!openedCompoentPosition) {
        return false;
    }

    const flowNodePosition = {
        startLine: connector.codedata.lineRange.startLine.line,
        startColumn: connector.codedata.lineRange.startLine.offset,
        endLine: connector.codedata.lineRange.endLine.line,
        endColumn: connector.codedata.lineRange.endLine.offset
    };
    const flowNodeFilePath = path.join(StateMachine.context().projectPath, connector.codedata.lineRange.fileName);

    return isFilePathsEqual(openedComponentFilePath, flowNodeFilePath)
        && isPositionEqual(openedCompoentPosition, flowNodePosition);
}

function hasNoComponentsOpenInDiagram() {
    return !StateMachine.context().position;
}

function isFilePathsEqual(filePath1: string, filePath2: string) {
    return path.normalize(filePath1) === path.normalize(filePath2);
}

function toggleTraceLogs() {
    const config = workspace.getConfiguration();

    const currentTraceServer = config.get<string>(TRACE_SERVER);
    const currentDebugLog = config.get<boolean>(ENABLE_DEBUG_LOG);
    const currentTraceLog = config.get<boolean>(ENABLE_TRACE_LOG);

    const isTraceEnabled = currentTraceServer === TRACE_SERVER_VERBOSE && currentDebugLog && currentTraceLog;

    if (isTraceEnabled) {
        config.update(TRACE_SERVER, TRACE_SERVER_OFF, ConfigurationTarget.Global);
        config.update(ENABLE_DEBUG_LOG, false, ConfigurationTarget.Global);
        config.update(ENABLE_TRACE_LOG, false, ConfigurationTarget.Global);
        window.showInformationMessage('BI extension trace logs disabled');
    } else {
        config.update(TRACE_SERVER, TRACE_SERVER_VERBOSE, ConfigurationTarget.Global);
        config.update(ENABLE_DEBUG_LOG, true, ConfigurationTarget.Global);
        config.update(ENABLE_TRACE_LOG, true, ConfigurationTarget.Global);
        window.showInformationMessage('BI extension trace logs enabled');
    }
}

async function handleCommandWithPackageSelection(
    projectInfo: ProjectInfo,
    view: MACHINE_VIEW,
    additionalViewParams: Record<string, any> = {}
): Promise<boolean> {
    const availablePackages = projectInfo?.children.map((child: any) => child.projectPath) ?? [];

    const selectedPackage = await selectPackageOrPrompt(availablePackages);

    if (!selectedPackage) {
        return false;
    }

    openView(EVENT_TYPE.OPEN_VIEW, {
        view,
        projectPath: selectedPackage,
        ...additionalViewParams
    });
    return true;
}

async function tryHandleCommandWithDiscoveredProject(
    view: MACHINE_VIEW,
    additionalViewParams: Record<string, any> = {}
): Promise<boolean> {
    const workspaceType = await findWorkspaceTypeFromWorkspaceFolders();
    const packageRoot = await getCurrentProjectRoot();

    if (!packageRoot) {
        return false;
    }

    if (workspaceType.type === "MULTIPLE_PROJECTS") {
        const projectInfo = await StateMachine.langClient().getProjectInfo({ projectPath: packageRoot });
        await StateMachine.updateProjectRootAndInfo(packageRoot, projectInfo);
        openView(EVENT_TYPE.OPEN_VIEW, {
            view,
            projectPath: packageRoot,
            ...additionalViewParams
        });
        return true;
    }

    if (workspaceType.type === "BALLERINA_WORKSPACE") {
        openView(EVENT_TYPE.OPEN_VIEW, {
            view,
            projectPath: packageRoot,
            ...additionalViewParams
        });
        return true;
    }

    return false;
}
