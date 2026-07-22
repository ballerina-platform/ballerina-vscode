
import { ExtendedLangClient } from './core';
import { createMachine, assign, interpret } from 'xstate';
import { activateBallerina } from './extension';
import {
    EVENT_TYPE,
    SyntaxTree,
    History,
    MachineStateValue,
    IUndoRedoManager,
    VisualizerLocation,
    webviewReady,
    MACHINE_VIEW,
    DIRECTORY_MAP,
    SCOPE,
    ProjectStructureResponse,
    ProjectStructureArtifactResponse,
    CodeData,
    ProjectDiagnosticsResponse,
    Type,
    dependencyPullProgress,
    BI_COMMANDS,
    NodePosition,
    ProjectInfo,
    normalizeProjectPath,
    isSamePath
} from "@wso2/ballerina-core";
import { fetchAndCacheLibraryData } from './features/library-browser';
import { VisualizerWebview } from './views/visualizer/webview';
import { commands, extensions, Uri, window, workspace, WorkspaceFolder } from 'vscode';
import { notifyCurrentWebview, RPCLayer } from './RPCLayer';
import {
    generateUid,
    getComponentIdentifier,
    getNodeByIndex,
    getNodeByName,
    getNodeByUid,
    getView
} from './utils/state-machine-utils';
import * as path from 'path';
import { extension } from './BalExtensionContext';
import { AIStateMachine, openAIPanelWithPrompt } from './views/ai-panel/aiMachine';
import { StateMachinePopup } from './stateMachinePopup';
import { checkIsBallerinaPackage, checkIsBI, fetchScope, getOrgPackageName, UndoRedoManager, getProjectTomlValues, getOrgAndPackageName, checkIsBallerinaWorkspace, isInWI, isInDevant } from './utils';
import { activateDevantFeatures } from './features/devant/activator';
import { buildProjectsStructure } from './utils/project-artifacts';
import { runCommandWithOutput } from './utils/runCommand';
import { buildOutputChannel } from './utils/logger';
import { closeOrphanWebviewTabs } from './views/closeOrphanWebviewTabs';

export interface ProjectMetadata {
    readonly isBI: boolean;
    readonly workspacePath?: string;
    readonly projectPath?: string;
    readonly scope?: SCOPE;
    readonly orgName?: string;
    readonly packageName?: string;
}

interface MachineContext extends VisualizerLocation {
    langClient: ExtendedLangClient | null;
    isBISupported: boolean;
    errorCode: string | null;
    dependenciesResolved?: boolean;
    isInDevant: boolean;
    isViewUpdateTransition?: boolean;
}

export let history: History;
export let undoRedoManager: IUndoRedoManager;
let pendingProjectRootUpdateResolvers: Array<() => void> = [];
let scaffoldPromptTriggered = false;

const stateMachine = createMachine<MachineContext>(
    {
        /** @xstate-layout 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-S3PzToCjSzlMpTMmwo7JgCV-DMRcryOm7ruEMFwcdWhUmCK0QIeYfIMT2k7JYPl9rJurdYjF7yV7SQfZKZUjx7KvpMAnfaAR5GdAkRWSRwsgjmrvSwrBOD8GELMaQ8hGkqE0Mg80EsGqDVZgGJmZZthkOLV-P4qkThIJAfSaB+x2TEnOLMeR2UpYY5RorAa+yq04FLAKmE4+yLzUR2w1kxxvHckCd7kWUI5IyT7SdqVPMjSOgRwEvmQERUQaKbA4PHdwjClnIGKuezq0-G9DkbOks0nyRLoEk8Cz9isU4v4zZoVZz1PZq0x+3TuYYUglJGSDykqqQNQiEAA */
        id: "Visualizer",
        initial: 'initialize',
        predictableActionArguments: true,
        context: {
            langClient: null,
            errorCode: null,
            isBISupported: false,
            view: MACHINE_VIEW.PackageOverview,
            dependenciesResolved: false,
            isInDevant: isInDevant()
        },
        on: {
            RESET_TO_EXTENSION_READY: {
                target: "extensionReady"
            },
            UPDATE_PROJECT_STRUCTURE: {
                actions: [
                    assign({
                        projectStructure: (context, event) => event.payload,
                    }),
                    () => {
                        // Use queueMicrotask to ensure context is updated before command execution
                        queueMicrotask(() => {
                            refreshProjectExplorer();
                            // Check if the current view is Service desginer and if so don't notify the webview
                            if (StateMachine.context().view !== MACHINE_VIEW.ServiceDesigner && StateMachine.context().view !== MACHINE_VIEW.BIDiagram) {
                                notifyCurrentWebview();
                            }
                        });
                    }
                ]
            },
            UPDATE_PROJECT_ROOT_AND_INFO: {
                actions: [
                    assign({
                        projectPath: (context, event) => normalizeProjectPath(event.projectPath),
                        projectInfo: (context, event) => event.projectInfo
                    }),
                    async (context, event) => {
                        await buildProjectsStructure(event.projectInfo, StateMachine.langClient(), true);
                        notifyCurrentWebview();
                        notifyTreeView(event.projectPath, context.documentUri, context.position, context.view);
                        // Resolve the next pending promise waiting for project root update completion
                        pendingProjectRootUpdateResolvers.shift()?.();
                    }
                ]
            },
            REFRESH_PROJECT_INFO: {
                actions: [
                    async (context, event) => {
                        try {
                            const projectPath = context.workspacePath || context.projectPath;
                            if (!projectPath) {
                                console.warn("No project path available for refreshing project info");
                                return;
                            }

                            // Fetch updated project info from language server
                            const projectInfo = await context.langClient.getProjectInfo({ projectPath });

                            // Update context with new project info
                            stateService.send({
                                type: 'UPDATE_PROJECT_INFO',
                                projectInfo
                            });
                        } catch (error) {
                            console.error("Error refreshing project info:", error);
                        }
                    }
                ]
            },
            UPDATE_PROJECT_INFO: {
                actions: [
                    assign({
                        projectInfo: (context, event) => event.projectInfo
                    }),
                    async (context, event) => {
                        // Rebuild project structure with updated project info
                        await buildProjectsStructure(event.projectInfo, StateMachine.langClient(), true);
                        if (!event.silent) {
                            openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.WorkspaceOverview });
                        }
                    }
                ]
            },
            UPDATE_PROJECT_LOCATION: {
                actions: [
                    assign({
                        documentUri: (context, event) => event.viewLocation.documentUri ? event.viewLocation.documentUri : context.documentUri,
                        position: (context, event) => event.viewLocation.position ? event.viewLocation.position : context.position,
                        identifier: (context, event) => event.viewLocation.identifier ? event.viewLocation.identifier : context.identifier,
                        addType: (context, event) => event.viewLocation?.addType !== undefined ? event.viewLocation.addType : context?.addType,
                    }),
                    (context, event) => notifyTreeView(
                        context.projectPath,
                        event.viewLocation.documentUri || context.documentUri,
                        event.viewLocation.position || context.position,
                        context.view
                    )
                ]
            }
        },
        states: {
            initialize: {
                invoke: {
                    src: (context, event) => checkForProjects,
                    onDone: [
                        {
                            target: "renderInitialView",
                            cond: (context, event) => event.data && event.data.isBI,
                            actions: [
                                assign({
                                    isBI: (context, event) => event.data.isBI,
                                    projectPath: (context, event) => event.data.projectPath,
                                    workspacePath: (context, event) => event.data.workspacePath,
                                    scope: (context, event) => event.data.scope,
                                    org: (context, event) => event.data.orgName,
                                    package: (context, event) => event.data.packageName
                                }),
                                (context, event) => {
                                    notifyTreeView(
                                        event.data.projectPath,
                                        context.documentUri,
                                        context.position,
                                        context.view
                                    );
                                }
                            ]
                        },
                        {
                            target: "activateLS",
                            cond: (context, event) => event.data && event.data.isBI === false,
                            actions: [
                                assign({
                                    isBI: (context, event) => event.data.isBI,
                                    projectPath: (context, event) => event.data.projectPath,
                                    workspacePath: (context, event) => event.data.workspacePath,
                                    scope: (context, event) => event.data.scope,
                                    org: (context, event) => event.data.orgName,
                                    package: (context, event) => event.data.packageName
                                }),
                                (context, event) => {
                                    notifyTreeView(
                                        event.data.projectPath,
                                        context.documentUri,
                                        context.position,
                                        context.view
                                    );
                                }
                            ]
                        }
                    ],
                    onError: {
                        target: "activateLS"
                    }
                }
            },
            renderInitialView: {
                invoke: {
                    src: 'openWebView',
                    onDone: {
                        target: "activateLS"
                    },
                    onError: {
                        target: "activateLS"
                    }
                }
            },
            activateLS: {
                invoke: {
                    src: 'activateLanguageServer',
                    onDone: {
                        target: "fetchProjectInfo",
                        actions: assign({
                            langClient: (context, event) => event.data.langClient,
                            isBISupported: (context, event) => event.data.isBISupported
                        })
                    },
                    onError: {
                        target: "lsError",
                        actions: () => {
                            console.error("Error occurred while activating Language Server.");
                        }
                    }
                }
            },
            fetchProjectInfo: {
                invoke: {
                    src: 'fetchProjectInfo',
                    onDone: {
                        target: "fetchProjectStructure",
                        actions: assign({
                            projectInfo: (context, event) => event.data.projectInfo
                        })
                    },
                    onError: {
                        target: "lsError",
                        actions: () => {
                            console.error("Error occurred while fetching project info.");
                        }
                    }
                }
            },
            fetchProjectStructure: {
                invoke: {
                    src: 'registerProjectArtifactsStructure',
                    onDone: {
                        target: "extensionReady",
                        actions: [
                            assign({
                                projectStructure: (context, event) => event.data.projectStructure
                            }),
                            () => {
                            }
                        ]
                    },
                    onError: {
                        target: "lsError",
                        actions: () => {
                            console.error("Error occurred while fetching project structure.");
                        }
                    }
                }
            },
            lsError: {
                on: {
                    RETRY: "initialize"
                }
            },
            extensionReady: {
                on: {
                    OPEN_VIEW: {
                        target: "viewActive",
                        actions: [
                            assign({
                                org: (context, event) => event.viewLocation?.org,
                                package: (context, event) => event.viewLocation?.package,
                                view: (context, event) => event.viewLocation.view,
                                documentUri: (context, event) => event.viewLocation.documentUri,
                                position: (context, event) => event.viewLocation.position,
                                projectPath: (context, event) => event.viewLocation?.projectPath || context?.projectPath,
                                identifier: (context, event) => event.viewLocation.identifier,
                                serviceType: (context, event) => event.viewLocation.serviceType,
                                type: (context, event) => event.viewLocation?.type,
                                isGraphql: (context, event) => event.viewLocation?.isGraphql,
                                metadata: (context, event) => event.viewLocation?.metadata,
                                agentMetadata: (context, event) => event.viewLocation?.agentMetadata,
                                addType: (context, event) => event.viewLocation?.addType,
                                dataMapperMetadata: (context, event) => event.viewLocation?.dataMapperMetadata,
                                artifactInfo: (context, event) => event.viewLocation?.artifactInfo,
                                rootDiagramId: (context, event) => event.viewLocation?.rootDiagramId,
                                reviewData: (context, event) => event.viewLocation?.reviewData,
                                evalsetData: (context, event) => event.viewLocation?.evalsetData,
                                isViewUpdateTransition: false
                            }),
                            (context, event) => notifyTreeView(
                                context.projectPath,
                                event.viewLocation?.documentUri,
                                event.viewLocation?.position,
                                event.viewLocation?.view
                            )
                        ]
                    }
                }
            },
            viewActive: {
                initial: "viewInit",
                states: {
                    viewInit: {
                        invoke: {
                            src: 'openWebView',
                            onDone: [
                                {
                                    target: "resolveMissingDependencies",
                                    cond: (context) => !context.dependenciesResolved
                                },
                                {
                                    target: "webViewLoading"
                                }
                            ]
                        }
                    },
                    resolveMissingDependencies: {
                        invoke: {
                            src: 'resolveMissingDependencies',
                            onDone: {
                                target: "webViewLoading",
                                actions: assign({
                                    dependenciesResolved: true
                                })
                            }
                        }
                    },
                    webViewLoading: {
                        invoke: {
                            src: 'findView', // NOTE: We only find the view and indentifer from this state as we already have the position and the file URL
                            onDone: {
                                target: "webViewLoaded"
                            }
                        }
                    },
                    webViewLoaded: {
                        invoke: {
                            src: 'showView',
                            onDone: {
                                target: "viewReady",
                                actions: assign({
                                    view: (context, event) => event.data.view,
                                    identifier: (context, event) => event.data.identifier,
                                    parentIdentifier: (context, event) => event.data.parentIdentifier,
                                    position: (context, event) => event.data.position,
                                    syntaxTree: (context, event) => event.data.syntaxTree,
                                    focusFlowDiagramView: (context, event) => event.data.focusFlowDiagramView,
                                    agentMetadata: (context, event) => event.data.agentMetadata,
                                    dataMapperMetadata: (context, event) => event.data.dataMapperMetadata,
                                    reviewData: (context, event) => event.data.reviewData ?? context.reviewData,
                                    evalsetData: (context, event) => event.data.evalsetData,
                                    isViewUpdateTransition: false
                                })
                            }
                        }
                    },
                    viewReady: {
                        entry: () => {
                            if (!scaffoldPromptTriggered) {
                                const scaffoldPrompt = process.env.INITIAL_SCAFFOLD_PROMPT;
                                const scaffoldSteps = process.env.INITIAL_SCAFFOLD_STEPS;
                                if (scaffoldPrompt && scaffoldSteps) {
                                    scaffoldPromptTriggered = true;
                                    openAIPanelWithPrompt({
                                        type: 'text',
                                        text: scaffoldPrompt,
                                        planMode: true,
                                        autoSubmit: true,
                                        hiddenContext: scaffoldSteps
                                    });
                                }
                            }
                        },
                        on: {
                            OPEN_VIEW: {
                                target: "viewInit",
                                actions: [
                                    assign({
                                        view: (context, event) => event.viewLocation.view,
                                        documentUri: (context, event) => event.viewLocation.documentUri,
                                        position: (context, event) => event.viewLocation.position,
                                        identifier: (context, event) => event.viewLocation.identifier,
                                        serviceType: (context, event) => event.viewLocation.serviceType,
                                        projectPath: (context, event) => event.viewLocation?.projectPath || context?.projectPath,
                                        org: (context, event) => event.viewLocation?.org || context?.org,
                                        package: (context, event) => event.viewLocation?.package || context?.package,
                                        type: (context, event) => event.viewLocation?.type,
                                        isGraphql: (context, event) => event.viewLocation?.isGraphql,
                                        metadata: (context, event) => event.viewLocation?.metadata,
                                        agentMetadata: (context, event) => event.viewLocation?.agentMetadata,
                                        addType: (context, event) => event.viewLocation?.addType,
                                        dataMapperMetadata: (context, event) => event.viewLocation?.dataMapperMetadata,
                                        artifactInfo: (context, event) => event.viewLocation?.artifactInfo,
                                        rootDiagramId: (context, event) => event.viewLocation?.rootDiagramId,
                                        reviewData: (context, event) => event.viewLocation?.reviewData,
                                        evalsetData: (context, event) => event.viewLocation?.evalsetData,
                                        isViewUpdateTransition: false
                                    }),
                                    (context, event) => notifyTreeView(
                                        event.viewLocation?.projectPath || context?.projectPath,
                                        event.viewLocation?.documentUri,
                                        event.viewLocation?.position,
                                        event.viewLocation?.view
                                    )
                                ]
                            },
                            VIEW_UPDATE: {
                                target: "webViewLoaded",
                                actions: [
                                    assign({
                                        documentUri: (context, event) => event.viewLocation.documentUri,
                                        position: (context, event) => event.viewLocation.position,
                                        view: (context, event) => event.viewLocation.view,
                                        identifier: (context, event) => event.viewLocation.identifier,
                                        serviceType: (context, event) => event.viewLocation.serviceType,
                                        type: (context, event) => event.viewLocation?.type,
                                        agentMetadata: (context, event) => event.viewLocation?.agentMetadata,
                                        isGraphql: (context, event) => event.viewLocation?.isGraphql,
                                        addType: (context, event) => event.viewLocation?.addType,
                                        dataMapperMetadata: (context, event) => event.viewLocation?.dataMapperMetadata,
                                        reviewData: (context, event) => event.viewLocation?.reviewData,
                                        evalsetData: (context, event) => event.viewLocation?.evalsetData,
                                        metadata: (context, event) => event.viewLocation?.metadata ? {
                                            ...context.metadata,
                                            ...event.viewLocation.metadata
                                        } : context.metadata,
                                        isViewUpdateTransition: true
                                    }),
                                    (context, event) => notifyTreeView(
                                        context.projectPath,
                                        event.viewLocation?.documentUri,
                                        event.viewLocation?.position,
                                        event.viewLocation?.view
                                    )
                                ]
                            },
                            FILE_EDIT: {
                                target: "viewEditing"
                            },
                        },
                    },
                    viewEditing: {
                        on: {
                            EDIT_DONE: {
                                target: "viewReady",
                            }
                        }
                    }
                }
            }
        }
    }, {
    services: {
        activateLanguageServer: (context, event) => {
            return new Promise(async (resolve, reject) => {
                try {
                    commands.executeCommand('setContext', 'BI.status', 'loadingLS');
                    const ls = await activateBallerina();
                    fetchAndCacheLibraryData();
                    AIStateMachine.initialize();
                    StateMachinePopup.initialize();
                    commands.executeCommand('setContext', 'BI.status', 'loadingDone');
                    activateDevantFeatures(ls);
                    if (ls.langClient) {
                        if (!ls.biSupported) {
                            commands.executeCommand('setContext', 'BI.status', 'updateNeed');
                        }
                    } else {
                        commands.executeCommand('setContext', 'BI.status', 'noLS');
                    }
                    resolve({ langClient: ls.langClient, isBISupported: ls.biSupported });
                } catch (error) {
                    throw new Error("LS Activation failed", error);
                }
            });
        },
        fetchProjectInfo: (context, event) => {
            return new Promise(async (resolve, reject) => {
                try {
                    const projectPath = context.workspacePath || context.projectPath;
                    if (!projectPath) {
                        resolve({ projectInfo: undefined });
                    } else {
                        const projectInfo = await context.langClient.getProjectInfo({ projectPath });
                        resolve({ projectInfo });
                    }
                } catch (error) {
                    throw new Error("Error occurred while fetching project info.", error);
                }
            });
        },
        registerProjectArtifactsStructure: (context, event) => {
            return new Promise(async (resolve, reject) => {
                try {
                    // Register the event driven listener to get the artifact changes
                    context.langClient.registerPublishArtifacts();
                    // IF the project info is not set, we don't need to build the project structure
                    if (context.projectInfo) {

                        // Add a 2 second delay before registering artifacts
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        // Initial Project Structure
                        const projectStructure = await buildProjectsStructure(context.projectInfo, context.langClient);
                        resolve({ projectStructure });
                    } else {
                        resolve({ projectStructure: undefined });
                    }
                } catch (error) {
                    resolve({ projectStructure: undefined });
                }
            });
        },
        openWebView: (context, event) => {
            // Get context values from the project storage so that we can restore the earlier state when user reopens vscode
            return new Promise(async (resolve, reject) => {
                try {
                    if (!VisualizerWebview.currentPanel) {
                        await closeOrphanWebviewTabs([VisualizerWebview.viewType]);
                        extension.ballerinaExtInstance.setContext(extension.context);
                        VisualizerWebview.currentPanel = new VisualizerWebview();
                        RPCLayer._messenger.onNotification(webviewReady, () => {
                            history = new History();
                            undoRedoManager = new UndoRedoManager();
                            const webview = VisualizerWebview.currentPanel?.getWebview();
                            if (webview && (context.isBI || context.view === MACHINE_VIEW.BIWelcome)) {
                                const biExtension = isInWI() || extensions.getExtension('wso2.ballerina-integrator');
                                webview.iconPath = {
                                    light: Uri.file(path.join(extension.context.extensionPath, 'resources', 'icons', biExtension ? 'wso2-dark.svg' : 'ballerina.svg')),
                                    dark: Uri.file(path.join(extension.context.extensionPath, 'resources', 'icons', biExtension ? 'wso2-light.svg' : 'ballerina-inverse.svg'))
                                };
                            }
                            resolve(true);
                        });
                    } else {
                        VisualizerWebview.currentPanel!.getWebview()?.reveal();
                        resolve(true);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        },
        resolveMissingDependencies: (context, event) => {
            return new Promise(async (resolve, reject) => {
                if (context?.projectPath) {
                    const diagnostics: ProjectDiagnosticsResponse = await StateMachine.langClient().getProjectDiagnostics({
                        projectRootIdentifier: {
                            uri: Uri.file(context.projectPath).toString(),
                        }
                    });

                    // Check if there are any "cannot resolve module" diagnostics
                    const hasMissingModuleDiagnostics = diagnostics.errorDiagnosticMap &&
                        Object.values(diagnostics.errorDiagnosticMap).some(fileDiagnostics =>
                            fileDiagnostics.some(diagnostic =>
                                diagnostic.message.includes('cannot resolve module')
                            )
                        );

                    // Only proceed with build if there are missing module diagnostics
                    if (!hasMissingModuleDiagnostics) {
                        resolve(true);
                        return;
                    }

                    // Construct the build command
                    let buildCommand = 'bal build';

                    const config = workspace.getConfiguration('ballerina');
                    const ballerinaHome = config.get<string>('home');
                    if (ballerinaHome) {
                        buildCommand = path.join(ballerinaHome, 'bin', buildCommand);
                    }

                    try {
                        // Execute the build command with output streaming
                        const result = await runCommandWithOutput(
                            buildCommand,
                            context.projectPath,
                            buildOutputChannel,
                            (message: string) => {
                                // Send progress notification to the visualizer
                                RPCLayer._messenger.sendNotification(
                                    dependencyPullProgress,
                                    { type: 'webview', webviewType: VisualizerWebview.viewType },
                                    message
                                );
                            }
                        );

                        if (result.success) {
                            // Retry resolving missing dependencies after build is successful. This is a temporary solution to ensure the project is reloaded with new dependencies.
                            const projectUri = Uri.file(context.projectPath).toString();
                            await StateMachine.langClient().resolveMissingDependencies({
                                documentIdentifier: {
                                    uri: projectUri
                                }
                            });


                            // Close the output panel on successful completion
                            commands.executeCommand('workbench.action.closePanel');
                        } else {
                            const errorMsg = `Failed to build Ballerina package. Exit code: ${result.exitCode}`;
                            console.error(errorMsg);
                            window.showErrorMessage(errorMsg);
                        }

                    } catch (error) {
                        const errorMsg = `Failed to build Ballerina package: ${error}`;
                        console.error(errorMsg, error);
                        window.showErrorMessage(errorMsg);
                    }
                }

                resolve(true);
            });
        },
        findView(context, event): Promise<void> {
            return new Promise(async (resolve, reject) => {
                const { orgName, packageName } = getOrgAndPackageName(context.projectInfo, context.projectPath);
                if (!context.view && context.langClient) {
                    if (!context.position || ("groupId" in context.position)) {
                        if (!context.projectPath && context.workspacePath) {
                            history.push({
                                location: {
                                    view: MACHINE_VIEW.WorkspaceOverview
                                }
                            });
                        } else {
                            history.push({
                                location: {
                                    view: MACHINE_VIEW.PackageOverview,
                                    documentUri: context.documentUri,
                                    org: orgName || context.org,
                                    package: packageName || context.package,
                                }
                            });
                        }
                        return resolve();
                    }
                    const view = await getView(context.documentUri, context.position, context?.projectPath);
                    view.location.package = packageName || context.package;
                    view.location.package = packageName || context.package;
                    history.push(view);
                    return resolve();
                } else {
                    history.push({
                        location: {
                            view: context.view,
                            documentUri: context.documentUri,
                            position: context.position,
                            identifier: context.identifier,
                            parentIdentifier: context.parentIdentifier,
                            artifactType: context.artifactType,
                            focusFlowDiagramView: context?.focusFlowDiagramView,
                            org: orgName || context.org,
                            package: packageName || context.package,
                            type: context?.type,
                            isGraphql: context?.isGraphql,
                            addType: context?.addType,
                            agentMetadata: context?.agentMetadata,
                            dataMapperMetadata: context?.dataMapperMetadata,
                            reviewData: context?.reviewData,
                            evalsetData: context?.evalsetData
                        }
                    });
                    return resolve();
                }
            });
        },
        showView(context, event): Promise<VisualizerLocation> {
            return new Promise(async (resolve, reject) => {
                StateMachinePopup.resetState();
                const selectedEntry = getLastHistory();
                if (!context.langClient) {
                    if (!selectedEntry) {
                        return resolve(
                            context.workspacePath
                                ? { view: MACHINE_VIEW.WorkspaceOverview }
                                : { view: MACHINE_VIEW.PackageOverview, documentUri: context.documentUri }
                        );
                    }
                    return resolve({ ...selectedEntry.location, view: selectedEntry.location.view ? selectedEntry.location.view : MACHINE_VIEW.PackageOverview });
                }

                if (selectedEntry && (selectedEntry.location.view === MACHINE_VIEW.ERDiagram || selectedEntry.location.view === MACHINE_VIEW.ServiceDesigner || selectedEntry.location.view === MACHINE_VIEW.BIDiagram || selectedEntry.location.view === MACHINE_VIEW.ReviewMode)) {
                    // Get updated location and identifier if transition was from VIEW_UPDATE event
                    if (context.isViewUpdateTransition && selectedEntry.location.view !== MACHINE_VIEW.ReviewMode) {
                        const updatedView = await getView(selectedEntry.location.documentUri, selectedEntry.location.position, context?.projectPath);
                        return resolve(updatedView.location);
                    }
                    return resolve(selectedEntry.location);
                }

                const defaultLocation = {
                    documentUri: context.documentUri,
                    position: undefined
                };
                const {
                    location = defaultLocation,
                    uid
                } = selectedEntry ?? {};

                const { documentUri, position } = location;

                // TODO: Refactor this to remove the full ST request
                const node = documentUri && await StateMachine.langClient().getSyntaxTree({
                    documentIdentifier: {
                        uri: Uri.file(documentUri).toString()
                    }
                }) as SyntaxTree;

                if (!selectedEntry?.location.view) {
                    return resolve(
                        context.workspacePath
                            ? { view: MACHINE_VIEW.WorkspaceOverview }
                            : { view: MACHINE_VIEW.PackageOverview, documentUri: context.documentUri }
                    );
                }

                let selectedST;

                if (node?.parseSuccess) {
                    const fullST = node.syntaxTree;
                    if (!uid && position) {
                        const generatedUid = generateUid(position, fullST);
                        selectedST = getNodeByUid(generatedUid, fullST);
                        if (generatedUid) {
                            history.updateCurrentEntry({
                                ...selectedEntry,
                                location: {
                                    ...selectedEntry.location,
                                    position: selectedST.position,
                                    syntaxTree: selectedST
                                },
                                uid: generatedUid
                            });
                        } else {
                            // show identification failure message
                        }
                    }

                    if (uid && position) {
                        selectedST = getNodeByUid(uid, fullST);

                        if (!selectedST) {
                            const nodeWithUpdatedUid = getNodeByName(uid, fullST);
                            selectedST = nodeWithUpdatedUid[0];

                            if (selectedST) {
                                history.updateCurrentEntry({
                                    ...selectedEntry,
                                    location: {
                                        ...selectedEntry.location,
                                        position: selectedST.position,
                                        syntaxTree: selectedST
                                    },
                                    uid: nodeWithUpdatedUid[1]
                                });
                            } else {
                                const nodeWithUpdatedUid = getNodeByIndex(uid, fullST);
                                selectedST = nodeWithUpdatedUid[0];

                                if (selectedST) {
                                    history.updateCurrentEntry({
                                        ...selectedEntry,
                                        location: {
                                            ...selectedEntry.location,
                                            identifier: getComponentIdentifier(selectedST),
                                            position: selectedST.position,
                                            syntaxTree: selectedST
                                        },
                                        uid: nodeWithUpdatedUid[1]
                                    });
                                } else {
                                    // show identification failure message
                                }
                            }
                        } else {
                            history.updateCurrentEntry({
                                ...selectedEntry,
                                location: {
                                    ...selectedEntry.location,
                                    position: selectedST.position,
                                    syntaxTree: selectedST
                                }
                            });
                        }
                    }
                }
                const lastView = getLastHistory().location;
                return resolve(lastView);
            });
        }
    }
});

// Create a service to interpret the machine
const stateService = interpret(stateMachine);

function startMachine(): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        stateService.start().onTransition((state) => {
            if (state.value === "extensionReady") {
                resolve();
            }
        });
    });
}

// Define your API as functions
export const StateMachine = {
    initialize: async () => {
        await startMachine();
    },
    service: () => { return stateService; },
    context: () => { return stateService.getSnapshot().context; },
    langClient: () => { return stateService.getSnapshot().context.langClient; },
    state: () => { return stateService.getSnapshot().value as MachineStateValue; },
    setEditMode: () => { stateService.send({ type: EVENT_TYPE.FILE_EDIT }); },
    setReadyMode: () => { stateService.send({ type: EVENT_TYPE.EDIT_DONE }); },
    isReady: () => {
        const state = stateService.getSnapshot().value;
        return typeof state === 'object' && 'viewActive' in state && state.viewActive === "viewReady";
    },
    sendEvent: (eventType: EVENT_TYPE) => { stateService.send({ type: eventType }); },
    updateProjectStructure: (payload: ProjectStructureResponse) => { stateService.send({ type: "UPDATE_PROJECT_STRUCTURE", payload }); },
    updateProjectRootAndInfo: (projectPath: string, projectInfo: ProjectInfo): Promise<void> => {
        return new Promise<void>((resolve) => {
            pendingProjectRootUpdateResolvers.push(resolve);
            stateService.send({ type: "UPDATE_PROJECT_ROOT_AND_INFO", projectPath, projectInfo });
        });
    },
    refreshProjectInfo: () => {
        stateService.send({ type: 'REFRESH_PROJECT_INFO' });
    },
    updateProjectInfo: (projectInfo: ProjectInfo, options?: { silent?: boolean }) => {
        stateService.send({ type: 'UPDATE_PROJECT_INFO', projectInfo, silent: options?.silent });
    },
    resetToExtensionReady: () => {
        stateService.send({ type: 'RESET_TO_EXTENSION_READY' });
    },
};

export function openView(type: EVENT_TYPE, viewLocation: VisualizerLocation, resetHistory = false) {
    if (resetHistory) {
        StateMachine.setReadyMode();
        history?.clear();
    }
    extension.hasPullModuleResolved = false;
    extension.hasPullModuleNotification = false;
    const projectPath = viewLocation.projectPath || StateMachine.context().projectPath;
    const { orgName, packageName } = getOrgAndPackageName(StateMachine.context().projectInfo, projectPath);
    viewLocation.org = orgName;
    viewLocation.package = packageName;
    stateService.send({ type: type, viewLocation: viewLocation });
}

export function updateView(refreshTreeView?: boolean, updatedIdentifier?: string) {
    if (StateMachinePopup.isActive()) {
        return;
    }
    let lastView = getLastHistory();
    // Step over to the next location if the last view is skippable
    if (!refreshTreeView && lastView?.location.view.includes("SKIP")) {
        history.pop(); // Remove the last entry
        lastView = getLastHistory(); // Get the new last entry
    }

    let newLocation: VisualizerLocation = lastView?.location;
    let newLocationFound = false;
    if (lastView && lastView.location?.artifactType && lastView.location?.identifier) {
        newLocation = { ...lastView.location };
        const currentIdentifier = lastView.location?.identifier;
        let currentArtifact: ProjectStructureArtifactResponse;
        let targetedArtifactType = lastView.location?.artifactType;

        if (targetedArtifactType === DIRECTORY_MAP.RESOURCE || targetedArtifactType === DIRECTORY_MAP.REMOTE) {
            // If the artifact type is resource/remote, we need to target the service
            targetedArtifactType = DIRECTORY_MAP.SERVICE;
        }

        if (targetedArtifactType === DIRECTORY_MAP.AGENT) {
            // Agents are stored under the "agents" key, not the "AGENT" artifactType.
            targetedArtifactType = DIRECTORY_MAP.AGENTS;
        }

        const projectPath = StateMachine.context().projectPath;
        const project = StateMachine.context().projectStructure?.projects.find(project => isSamePath(project.projectPath, projectPath));

        // These changes will be revisited in the revamp
        project?.directoryMap[targetedArtifactType]?.forEach((artifact: ProjectStructureArtifactResponse) => {
            if (artifact.id === currentIdentifier || artifact.name === currentIdentifier || artifact.id === updatedIdentifier || artifact.name === updatedIdentifier) {
                currentArtifact = artifact;
            }
            // Check if artifact has resources and find within those
            if (artifact.resources && artifact.resources.length > 0) {
                const resource = artifact.resources.find((resource: ProjectStructureArtifactResponse) => resource.id === currentIdentifier || resource.name === currentIdentifier || resource.id === updatedIdentifier || resource.name === updatedIdentifier);
                if (resource) {
                    currentArtifact = resource;
                }
            }
        });

        const newPosition = currentArtifact?.position || lastView.location.position;
        newLocation = { ...lastView.location, position: newPosition };

        history.updateCurrentEntry({
            ...lastView,
            location: newLocation
        });
        newLocationFound = true;
    }

    // Check for service class model in the new location
    if (!newLocationFound && lastView?.location?.type) {
        let currentArtifact: ProjectStructureArtifactResponse;

        const projectPath = StateMachine.context().projectPath;
        const project = StateMachine.context().projectStructure?.projects.find(project => isSamePath(project.projectPath, projectPath));

        project?.directoryMap[DIRECTORY_MAP.TYPE]?.forEach((artifact) => {
            if (artifact.id === lastView.location.type.name || artifact.name === lastView.location.type.name) {
                currentArtifact = artifact;
            }
        });
        const newPosition = currentArtifact?.position || lastView.location.position;
        const updatedType: Type = {
            ...lastView.location.type,
            codedata: {
                ...lastView.location.type.codedata,
                lineRange: {
                    ...lastView.location.type.codedata.lineRange,
                    startLine: { line: newPosition.startLine, offset: newPosition.startColumn },
                    endLine: { line: newPosition.endLine, offset: newPosition.endColumn }
                }
            }
        };

        newLocation = { ...lastView.location, position: newPosition, type: updatedType };
        history.updateCurrentEntry({
            ...lastView,
            location: newLocation
        });

    }


    stateService.send({ type: "VIEW_UPDATE", viewLocation: lastView ? newLocation : { view: "Overview" } });
    if (refreshTreeView) {
        buildProjectsStructure(StateMachine.context().projectInfo, StateMachine.langClient(), true);
    }
    notifyCurrentWebview();
}

export function updateDataMapperView(codedata?: CodeData, variableName?: string): void {
    const dataMapperMetadata = {
        codeData: codedata,
        name: variableName
    };

    if (StateMachinePopup.isActive()) {
        // Update popup context when data mapper is in popup view
        const popupLocation = StateMachinePopup.context();
        popupLocation.dataMapperMetadata = dataMapperMetadata;

        StateMachinePopup.sendEvent(EVENT_TYPE.VIEW_UPDATE, popupLocation);
    } else {
        // Update main view history when data mapper is in main view
        const lastView = getLastHistory();
        if (lastView && lastView.location) {
            lastView.location.dataMapperMetadata = dataMapperMetadata;
            stateService.send({ type: EVENT_TYPE.VIEW_UPDATE, viewLocation: lastView.location });
        }
    }

    notifyCurrentWebview();
}


function getLastHistory() {
    const historyStack = history?.get();
    return historyStack?.[historyStack?.length - 1];
}

async function checkForProjects() {
    const workspaceFolders = workspace.workspaceFolders;

    if (!workspaceFolders) {
        return { isBI: false, projects: [] };
    }

    if (workspaceFolders.length > 1) {
        return await handleMultipleWorkspaceFolders(workspaceFolders);
    }

    return await handleSingleWorkspaceFolder(workspaceFolders[0].uri);
}

async function handleMultipleWorkspaceFolders(workspaceFolders: readonly WorkspaceFolder[]): Promise<ProjectMetadata> {
    const balProjectChecks = await Promise.all(
        workspaceFolders.map(async folder => ({
            folder,
            isBallerinaPackage: await checkIsBallerinaPackage(folder.uri)
        }))
    );
    const balProjects = balProjectChecks
        .filter(result => result.isBallerinaPackage)
        .map(result => result.folder);

    if (balProjects.length > 1 && workspace.workspaceFile?.scheme === "file") {
        // Show notification to guide users to use Ballerina workspaces instead of VSCode workspaces
        window.showInformationMessage(
            'Multiple Ballerina projects detected in VSCode workspace. Please use Ballerina workspaces for better project management and native support.',
            'Learn More'
        ).then(selection => {
            if (selection === 'Learn More') {
                commands.executeCommand('vscode.open', Uri.parse('https://ballerina.io/learn/workspaces'));
            }
        });

        // Return empty result to indicate no project should be loaded
        return { isBI: false };
    } else if (balProjects.length === 1) {
        const isBI = checkIsBI(balProjects[0].uri);
        const scope = isBI && fetchScope(balProjects[0].uri);
        const { orgName, packageName } = getOrgPackageName(balProjects[0].uri.fsPath);
        const projectPath = normalizeProjectPath(balProjects[0].uri.fsPath);
        setContextValues(isBI, projectPath);
        return { isBI, projectPath, scope, orgName, packageName };
    }

    return { isBI: false };
}

async function handleSingleWorkspaceFolder(workspaceURI: Uri): Promise<ProjectMetadata> {
    const normalizedFsPath = normalizeProjectPath(workspaceURI.fsPath);
    const isBallerinaWorkspace = await checkIsBallerinaWorkspace(workspaceURI);

    if (isBallerinaWorkspace) {
        const isBI = checkIsBI(workspaceURI);
        setContextValues(isBI, undefined, normalizedFsPath);

        return { isBI, workspacePath: normalizedFsPath };
    } else {
        const isBallerinaPackage = await checkIsBallerinaPackage(workspaceURI);
        const isBI = isBallerinaPackage && checkIsBI(workspaceURI);
        const scope = fetchScope(workspaceURI);
        const projectPath = isBallerinaPackage ? normalizedFsPath : "";
        const { orgName, packageName } = getOrgPackageName(projectPath);

        setContextValues(isBI, projectPath);
        if (!isBI) {
            console.error("No BI enabled workspace found");
        }

        return { isBI, projectPath, scope, orgName, packageName };
    }
}

function refreshProjectExplorer() {
    try {
        const integratorExtension = extensions.getExtension('wso2.wso2-integrator');
        if (integratorExtension && !integratorExtension.isActive) {
            return;
        }
    
        commands.executeCommand(BI_COMMANDS.PROJECT_EXPLORER_REFRESH);
    } catch (error) {
        console.error('Error refreshing project explorer:', error);
    }
}

function notifyTreeView(
    projectPath?: string,
    documentUri?: string,
    position?: NodePosition,
    view?: MACHINE_VIEW
) {
    try {
        const integratorExtension = extensions.getExtension('wso2.wso2-integrator');
        if (integratorExtension && !integratorExtension.isActive) {
            return;
        }

        commands.executeCommand(BI_COMMANDS.NOTIFY_PROJECT_EXPLORER, {
            projectPath,
            documentUri,
            position,
            view
        });
    } catch (error) {
        console.error('Error notifying tree view:', error);
    }
}

function setContextValues(isBI: boolean, projectPath?: string, workspacePath?: string) {
    commands.executeCommand('setContext', 'isBIProject', isBI);
    commands.executeCommand('setContext', 'isSupportedProject', projectPath || workspacePath);
}
