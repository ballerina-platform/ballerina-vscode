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

import { ExtensionContext, commands, window, Location, Uri, TextEditor, extensions, workspace } from 'vscode';
import * as vscode from 'vscode';
import { BallerinaExtension } from './core';
import { activate as activateBBE } from './views/bbe';
import {
    activate as activateTelemetryListener, CMP_EXTENSION_CORE, sendTelemetryEvent,
    TM_EVENT_EXTENSION_ACTIVATE
} from './features/telemetry';
import { activateDebugConfigProvider } from './features/debugger';
import { activate as activateProjectFeatures } from './features/project';
import { activate as activateEditorSupport } from './features/editor-support';
import { activate as activateTesting } from './features/testing/activator';
import { activate as activateBITesting } from './features/test-explorer/activator';
import { StaticFeature, DocumentSelector, ServerCapabilities, InitializeParams, FeatureState } from 'vscode-languageclient';
import { ExtendedLangClient } from './core/extended-language-client';
import { activate as activateNotebook } from './views/notebook';
import { activate as activateLibraryBrowser } from './features/library-browser';
import { activate as activateBIFeatures } from './features/bi';
import { activate as activateERDiagram } from './views/persist-layer-diagram';
import { activateAiPanel } from './views/ai-panel';
import { activateMigrationPanel } from './views/migration-panel';
import { debug, handleResolveMissingDependencies, isICPSupported, isInDevant, log } from './utils';
import { activateUriHandlers } from './utils/uri-handlers';
import { StateMachine } from './stateMachine';
import { activateSubscriptions } from './views/visualizer/activate';
import { VisualizerWebview } from './views/visualizer/webview';
import { AiPanelWebview } from './views/ai-panel/webview';
import { extension } from './BalExtensionContext';
import { BI_COMMANDS, ExtendedClientCapabilities } from '@wso2/ballerina-core';
import { DefaultServer } from './webview-communication/DefaultServer';
import { RPCLayer } from './RPCLayer';
import { activateAIFeatures } from './features/ai/activator';
import { runningServicesManager } from './features/ai/agent/tools/running-service-manager';
import { activateTryItCommand } from './features/tryit/activator';
import { activate as activateNPFeatures } from './features/natural-programming/activator';
import { activateAgentChatPanel } from './views/agent-chat/activate';
import { activateTracing } from './features/tracing';
import { activateICP } from './features/icp';
import { onWizardChatNotify, setWizardProjectRoot, runWizardMigrationEnhancement, abortMigrationAgent, openMigratedProject, isAIAuthenticated, signInForAI, signInWithAnthropicKey, signInWithAwsBedrock, signInWithVertexAI } from './features/ai/migration/orchestrator';

let langClient: ExtendedLangClient;
export let isPluginStartup = true;

/**
 * Utility class to expose Ballerina extension state to other extensions
 */
export class BallerinaExtensionState {
    /**
     * Check if a debug session is currently active.
     * BI run mode also creates a VS Code debug session with noDebug enabled,
     * so only sessions started in actual debug mode should return true.
     * @returns true if a debug-mode session is active, false otherwise
     */
    public static isDebugSessionActive(): boolean {
        const activeSession = vscode.debug.activeDebugSession;
        return activeSession !== undefined && activeSession.configuration.noDebug !== true;
    }
}

// TODO initializations should be contributions from each component
function onBeforeInit(langClient: ExtendedLangClient) {
    class TraceLogsFeature implements StaticFeature {
        preInitialize?: (capabilities: ServerCapabilities<any>, documentSelector: DocumentSelector) => void;
        getState(): FeatureState {
            throw new Error('Method not implemented.');
        }
        fillInitializeParams?: ((params: InitializeParams) => void) | undefined;
        dispose(): void {
        }
        fillClientCapabilities(capabilities: ExtendedClientCapabilities): void {
            capabilities.experimental = capabilities.experimental || { introspection: false, showTextDocument: false };
            capabilities.experimental.introspection = true;
        }
        initialize(_capabilities: ServerCapabilities, _documentSelector: DocumentSelector | undefined): void {
        }
    }

    class ShowFileFeature implements StaticFeature {
        preInitialize?: (capabilities: ServerCapabilities<any>, documentSelector: DocumentSelector) => void;
        getState(): FeatureState {
            throw new Error('Method not implemented.');
        }
        fillInitializeParams?: ((params: InitializeParams) => void) | undefined;
        dispose(): void {

        }
        fillClientCapabilities(capabilities: ExtendedClientCapabilities): void {
            capabilities.experimental = capabilities.experimental || { introspection: false, showTextDocument: false };
            capabilities.experimental.showTextDocument = true;
        }
        initialize(_capabilities: ServerCapabilities, _documentSelector: DocumentSelector | undefined): void {
        }
    }

    class ExperimentalLanguageFeatures implements StaticFeature {
        getState(): FeatureState {
            throw new Error('Method not implemented.');
        }
        fillInitializeParams?: ((params: InitializeParams) => void) | undefined;
        dispose(): void {
        }
        fillClientCapabilities(capabilities: ExtendedClientCapabilities): void {
            capabilities.experimental = capabilities.experimental || { introspection: false, showTextDocument: false };
            capabilities.experimental.experimentalLanguageFeatures = extension.ballerinaExtInstance.enabledExperimentalFeatures();
        }
        initialize(_capabilities: ServerCapabilities, _documentSelector: DocumentSelector | undefined): void {
        }
    }

    langClient.registerFeature(new TraceLogsFeature());
    langClient.registerFeature(new ShowFileFeature());
    langClient.registerFeature(new ExperimentalLanguageFeatures());
}

export async function activate(context: ExtensionContext) {
    extension.context = context;
    // The BallerinaExtension instance is created HERE, before the state machine
    // starts, rather than lazily in `activateBallerina`. The machine's very first
    // states render the visualizer's loading panel (`renderInitialView`), and
    // building that panel reads this instance (`getComposerWebViewOptions` and
    // friends resolve resource paths through `ballerinaExtInstance.context`).
    // While it was created only in `activateBallerina` — which runs later, in the
    // `activateLS` state — `openWebView` threw on `undefined` and the machine fell
    // through to `activateLS` with the error swallowed, so no webview appeared
    // until the language server, project info and project structure were all
    // ready. The constructor is cheap (path setup + status bar item).
    extension.ballerinaExtInstance = new BallerinaExtension();
    extension.ballerinaExtInstance.setContext(context);
    // Registered HERE, ahead of `await StateMachine.initialize()`, rather than with the rest
    // of the BI commands (`features/bi/activator`) which only run after the language server
    // is up. The embedded Create flow's first screen needs nothing but this bridge, and the
    // machine does not reach `extensionReady` until the LS has started and project info and
    // structure have been fetched — several seconds the user spent staring at a spinner
    // before the first screen of the wizard appeared. `getWsBootstrap` needs only
    // `ballerinaExtInstance` (for its download-progress event), which exists by this line.
    context.subscriptions.push(
        commands.registerCommand(BI_COMMANDS.GET_BI_FORM_WS_BOOTSTRAP, () =>
            DefaultServer.getInstance().getWsBootstrap()
        )
    );
    // Init RPC Layer methods
    RPCLayer.init();

    // Register serializers that dispose orphaned webview tabs restored by VS Code after a restart.
    // Without this, previously open panels leave behind empty placeholder tabs on reload.
    const disposeOnRestore: vscode.WebviewPanelSerializer = {
        deserializeWebviewPanel: async (panel) => { panel.dispose(); }
    };
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer(VisualizerWebview.viewType, disposeOnRestore),
        vscode.window.registerWebviewPanelSerializer(AiPanelWebview.viewType, disposeOnRestore),
    );

    // Wait for the ballerina extension to be ready
    await StateMachine.initialize();

    // Then return the ballerina extension context
    return {
        ballerinaExtInstance: extension.ballerinaExtInstance,
        projectPath: StateMachine.context().projectPath,
        VisualizerWebview,
        BallerinaExtensionState,
        migration: {
            setWizardProjectRoot,
            wizardEnhancementReady: runWizardMigrationEnhancement,
            abortAgent: abortMigrationAgent,
            openMigratedProject,
            onChatNotify: onWizardChatNotify,
            isAIAuthenticated,
            signInForAI,
            signInWithAnthropicKey,
            signInWithAwsBedrock,
            signInWithVertexAI,
        },
        onDownloadProgress: extension.ballerinaExtInstance.onDownloadProgress,
    };
}

export async function activateBallerina(): Promise<BallerinaExtension> {
    // Normally created in `activate` (see the note there) so the initial visualizer
    // panel can be rendered before the language server activates; construct one
    // here only for entry points that reach this without going through `activate`.
    const ballerinaExtInstance = extension.ballerinaExtInstance ?? new BallerinaExtension();
    extension.ballerinaExtInstance = ballerinaExtInstance;
    debug('Active the Ballerina VS Code extension.');
    try {
        debug('Sending telemetry event.');
        sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_EXTENSION_ACTIVATE, CMP_EXTENSION_CORE);
    } catch (error) {
        debug('Error sending telemetry event.');
    }
    debug('Setting context.');
    ballerinaExtInstance.setContext(extension.context);
    // Anything that throws between here and the feature-support calculation would otherwise
    // leave `featureSupportReady` pending forever, and the Create flow gates its "Next"
    // button on that promise. Settle it on every exit path (the call is idempotent).
    try {
        return await activateBallerinaInternal(ballerinaExtInstance);
    } finally {
        ballerinaExtInstance.markFeatureSupportResolved();
    }
}

async function activateBallerinaInternal(ballerinaExtInstance: BallerinaExtension): Promise<BallerinaExtension> {
    await updateCodeServerConfig();
    // Enable URI handlers
    debug('Activating URI handlers.');
    activateUriHandlers(ballerinaExtInstance);
    // Activate Subscription Commands
    debug('Activating subscription commands.');
    activateSubscriptions();
    debug('Starting ballerina extension initialization.');
    await ballerinaExtInstance.init(onBeforeInit).then(() => {
        debug('Ballerina extension activated successfully.');
        // <------------ CORE FUNCTIONS ----------->
        // Activate Library Browser
        activateLibraryBrowser(ballerinaExtInstance);

        // Enable Ballerina Project related features
        activateProjectFeatures();

        // Enable Ballerina Debug Config Provider
        activateDebugConfigProvider(ballerinaExtInstance);

        // Activate editor support
        activateEditorSupport(ballerinaExtInstance);

        // <------------ MAIN FEATURES ----------->
        // TODO: Enable Ballerina by examples once the samples are available
        // https://github.com/wso2/product-ballerina-integrator/issues/1967
        // activateBBE(ballerinaExtInstance);

        //Enable BI Feature
        activateBIFeatures(ballerinaExtInstance);

        // Enable ballerina test explorer
        if (ballerinaExtInstance.biSupported) {
            activateBITesting(ballerinaExtInstance);
        } else {
            activateTesting(ballerinaExtInstance);
        }

        // Enable Ballerina Notebook
        activateNotebook(ballerinaExtInstance);

        // activateDesignDiagramView(ballerinaExtInstance);
        activateERDiagram(ballerinaExtInstance);

        // <------------ OTHER FEATURES ----------->
        // Enable Ballerina Telemetry listener
        activateTelemetryListener(ballerinaExtInstance);

        //activate ai panel
        activateAiPanel(ballerinaExtInstance);

        // Activate migration enhancement panel
        activateMigrationPanel(ballerinaExtInstance);

        // Activate AI features
        activateAIFeatures(ballerinaExtInstance);

        // Activate Try It command
        activateTryItCommand(ballerinaExtInstance);

        // Activate natural programming features
        activateNPFeatures(ballerinaExtInstance);

        // Activate Agent Chat Panel
        activateAgentChatPanel(ballerinaExtInstance);

        // Activate Tracing Feature
        activateTracing(ballerinaExtInstance);

        // Activate ICP (Integration Control Plane) — skip in Devant and without the Integrator extension
        if (!isInDevant() && isICPSupported()) {
            activateICP(ballerinaExtInstance);
        }

        langClient = <ExtendedLangClient>ballerinaExtInstance.langClient;
        // Register showTextDocument listener
        langClient.onNotification('window/showTextDocument', (location: Location) => {
            if (location.uri !== undefined) {
                window.showTextDocument(Uri.parse(location.uri.toString()), { selection: location.range });
            }
        });
        isPluginStartup = false;
    }).catch((e) => {
        debug('Failed to activate Ballerina extension.');
        log("Failed to activate Ballerina extension. " + (e.message ? e.message : e));
        const cmds: any[] = ballerinaExtInstance.extension.packageJSON.contributes.commands;

        // LS Extension fails
        commands.executeCommand('setContext', 'BI.status', 'noLS');

        if (e.message && e.message.includes('Error when checking ballerina version.')) {
            ballerinaExtInstance.showMessageInstallBallerina();
            ballerinaExtInstance.showMissingBallerinaErrInStatusBar();

            // TODO: Fix this properly
            // cmds.forEach((cmd) => {
            //     const cmdID: string = cmd.command;
            //     // This is to skip the command un-registration
            //     if (!(cmdID.includes("ballerina-setup") || cmdID.includes(SHARED_COMMANDS.OPEN_BI_WELCOME))) {
            //         commands.registerCommand(cmdID, () => {
            //             ballerinaExtInstance.showMessageInstallBallerina();
            //         });
            //     }
            // });
        }
        // When plugins fails to start, provide a warning upon each command execution
        else if (!ballerinaExtInstance.langClient) {
            // TODO: Fix this properly
            // cmds.forEach((cmd) => {
            //     const cmdID: string = cmd.command;
            //     // This is to skip the command un-registration
            //     if (!(cmdID.includes("ballerina-setup") || cmdID.includes(SHARED_COMMANDS.OPEN_BI_WELCOME))) {
            //         commands.registerCommand(cmdID, () => {
            //             const actionViewLogs = "View Logs";
            //             window.showWarningMessage("Ballerina extension did not start properly."
            //                 + " Please check extension logs for more info.", actionViewLogs)
            //                 .then((action) => {
            //                     if (action === actionViewLogs) {
            //                         const logs = ballerinaExtInstance.getOutPutChannel();
            //                         if (logs) {
            //                             logs.show();
            //                         }
            //                     }
            //                 });
            //         });
            //     }
            // });
        }
    }).finally(() => {
        if (ballerinaExtInstance.langClient) {
            handleResolveMissingDependencies(ballerinaExtInstance);
        }
    });
    return ballerinaExtInstance;
}

async function updateCodeServerConfig() {
    if (!isInDevant()) {
        return;
    }
    log("Code server environment detected");
    const config = workspace.getConfiguration('ballerina');
    await config.update('enableRunFast', true);
}

export async function deactivate(): Promise<void> {
    debug('Deactive the Ballerina VS Code extension.');

    await runningServicesManager.dispose();

    if (!langClient) {
        return;
    }
    extension.ballerinaExtInstance.telemetryReporter.dispose();
    await langClient.stop();
}
