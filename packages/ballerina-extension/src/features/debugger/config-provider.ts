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

import {
    DebugConfigurationProvider, WorkspaceFolder, DebugConfiguration, debug, ExtensionContext, window, commands, DebugAdapterInlineImplementation,
    DebugSession, DebugAdapterExecutable, DebugAdapterDescriptor, DebugAdapterDescriptorFactory, DebugAdapterServer, Uri, workspace, RelativePattern, ConfigurationTarget, WorkspaceConfiguration,
    Task,
    tasks,
    TaskDefinition,
    ShellExecution,
    TaskExecution,
    DebugAdapterTrackerFactory,
    DebugAdapterTracker,
    ViewColumn,
    TaskScope,
    TaskPanelKind
} from 'vscode';
import * as child_process from "child_process";
import { getPortPromise } from 'portfinder';
import * as path from "path";
import {
    BallerinaExtension, LANGUAGE, OLD_BALLERINA_VERSION_DEBUGGER_RUNINTERMINAL,
    UNSUPPORTED_DEBUGGER_RUNINTERMINAL_KIND, INVALID_DEBUGGER_RUNINTERMINAL_KIND
} from '../../core';
import {
    TM_EVENT_START_DEBUG_SESSION, CMP_DEBUGGER, sendTelemetryEvent, sendTelemetryException,
    CMP_NOTEBOOK, TM_EVENT_START_NOTEBOOK_DEBUG
} from '../telemetry';
import {
    log,
    debug as debugLog,
    isSupportedSLVersion,
    isWindows,
    createVersionNumber
} from "../../utils";
import { getProjectWorkingDirectory } from "../../utils/file-utils";
import { quoteShellPath } from "../../utils/config";
import { decimal, ExecutableOptions } from 'vscode-languageclient/node';
import { BAL_NOTEBOOK, getTempFile, NOTEBOOK_CELL_SCHEME } from '../../views/notebook';
import fileUriToPath from 'file-uri-to-path';
import { existsSync } from 'fs';
import { join } from 'path';
import { LoggingDebugSession, OutputEvent, TerminatedEvent } from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { PALETTE_COMMANDS } from '../project/cmds/cmd-runner';
import { Disposable } from 'monaco-languageclient';
import { getCurrentProjectRoot, selectBallerinaProjectForDebugging } from '../../utils/project-utils';
import { BallerinaProjectComponents, BIGetEnclosedFunctionRequest, EVENT_TYPE, MainFunctionParamsResponse, isPathInside } from '@wso2/ballerina-core';
import { openView, StateMachine } from '../../stateMachine';
import { waitForBallerinaService } from '../tryit/utils';
import { BreakpointManager } from './breakpoint-manager';
import { notifyBreakpointChange } from '../../RPCLayer';
import { VisualizerWebview } from '../../views/visualizer/webview';
import { URI } from 'vscode-uri';
import { prepareAndGenerateConfig, cleanAndValidateProject } from '../config-generator/configGenerator';
import { extension } from '../../BalExtensionContext';
import * as fs from 'fs';
import { findHighestVersionJdk } from '../../utils/server/server';
import { PlatformExtRpcManager } from '../../rpc-managers/platform-ext/rpc-manager';
import { confirmAndStopActiveRun, markTaskRunStarted, FORCE_START_PROMPT, RUN_CONFLICT_PROMPT } from '../project/integration-runner-state';
import { ensureDependenciesCompatible } from '../project/dependency-compatibility';

const BALLERINA_COMMAND = "ballerina.command";
const EXTENDED_CLIENT_CAPABILITIES = "capabilities";

export enum DEBUG_REQUEST {
    LAUNCH = 'launch'
}

export enum DEBUG_CONFIG {
    SOURCE_DEBUG_NAME = 'Ballerina Debug',
    TEST_DEBUG_NAME = 'Ballerina Test'
}


class DebugConfigProvider implements DebugConfigurationProvider {
    async resolveDebugConfiguration(_folder: WorkspaceFolder, config: DebugConfiguration)
        : Promise<DebugConfiguration | null | undefined> {
        if (!config.type) {
            commands.executeCommand('workbench.action.debug.configure');
            return undefined;
        }

        if (config.noDebug && (extension.ballerinaExtInstance.enabledRunFast() || StateMachine.context().isBI)) {
            await handleMainFunctionParams(config);
        }
        const configs = await getModifiedConfigs(_folder, config);

        // Old locked packages fail on Java 25; offer the update before building on them.
        if (!configs.notebookDebug && !await ensureDependenciesCompatible(configs.script)) {
            return undefined;
        }

        // Per-integration restart guard (#1012): integrations run
        // concurrently, but a single integration has at most one running
        // instance. Re-launching an integration that is already running
        // prompts to restart it, across all launch paths (BI run, fast run,
        // and debug). Test and notebook sessions are exempt (the notebook
        // flag is used because getModifiedConfigs overwrites config.name).
        // Returning undefined cancels the new launch cleanly, leaving the
        // current run untouched.
        if (!configs.debugTests && !configs.notebookDebug) {
            const guardResult = await confirmAndStopActiveRun(configs.script);
            if (guardResult === 'cancelled') {
                return undefined;
            }
            if (guardResult === 'force-started') {
                // The user already confirmed twice (restart + force start) while
                // the old process is still alive; suppress the adapter-level
                // conflict prompt so this launch does not ask a third time.
                configs.forceStartedRun = true;
            }
        }

        // Check if config generation is required before starting the debug session
        const shouldProceed = await prepareAndGenerateConfig(extension.ballerinaExtInstance, configs.script, false, StateMachine.context().isBI, false);
        if (!shouldProceed) {
            return undefined;
        }

        // connect to Devant if applicable
        await new PlatformExtRpcManager().setupDevantProxyForDebugging(configs);
        return configs;
    }
}

function getValueFromProgramArgs(programArgs: string[], idx: number) {
    return programArgs.length + 1 > idx ? programArgs[idx] : "";
}

async function handleMainFunctionParams(config: DebugConfiguration) {
    const res = await extension.ballerinaExtInstance.langClient?.getMainFunctionParams({
        projectRootIdentifier: {
            uri: Uri.file(StateMachine.context().projectPath).toString()
        }
    }) as MainFunctionParamsResponse;
    if (res.hasMain) {
        let i;
        let programArgs = config.programArgs;
        let values: string[] = [];
        if (res.params) {
            let params = res.params;
            for (i = 0; i < params.length; i++) {
                let param = params[i];
                let value = param.defaultValue ? param.defaultValue : getValueFromProgramArgs(programArgs, i);
                await showInputBox(param.paramName, value, param.type, false).then(r => {
                    values.push(r);
                });
            }
        }
        if (res.restParams) {
            while (true) {
                let value = getValueFromProgramArgs(programArgs, i);
                i++;
                let result = await showInputBox(res.restParams.paramName, value, res.restParams.type, true);
                if (result) {
                    values.push(result);
                } else {
                    break;
                }
            }
        }
        config.programArgs = values;
    }
}

async function showInputBox(paramName: string, value: string, type: string, isRest: boolean) {
    // TODO: The type information should come from the LS
    let baseType = type;
    let isOptional = false;
    if (baseType.endsWith('?')) {
        isOptional = true;
        baseType = baseType.substring(0, baseType.length - 1);
    }

    // Construct prompt message based on the flags
    let promptMessage = '';
    if (isOptional) {
        promptMessage = 'This is optional and can be left empty';
    } else if (isRest) {
        promptMessage = 'This parameter accepts multiple values. ' +
            "You'll be prompted to enter each value one by one. Press 'Escape' when finished.";
    }

    // Construct placeholder message based on the type and the flags
    let placeholderMessage = `Enter value for '${paramName}'`;
    switch (baseType) {
        case 'boolean':
            placeholderMessage += ' (enter "true" or "false")';
            break;
        case 'int':
            placeholderMessage += ' (e.g., 42)';
            break;
        case 'float':
        case 'decimal':
            placeholderMessage += ' (e.g., 3.14)';
            break;
        case 'byte':
            placeholderMessage += ' (e.g. 127)';
            break;
        case 'string':
            placeholderMessage += ' (e.g., text)';
            break;
    }

    // Show the input box to the user
    const inout = await window.showInputBox({
        title: `${paramName} (type: ${type})`,
        ignoreFocusOut: true,
        placeHolder: placeholderMessage,
        prompt: promptMessage,
        value: value,
        validateInput: (input: string) => {
            if (!isOptional && input === "") {
                return `The input is required`;
            }

            // Validate the input value based on its type
            switch (baseType) {
                case 'string':
                    return null;
                case 'int':
                    if (!Number.isInteger(Number(input)) || isNaN(Number(input))) {
                        return "The input must be an integer";
                    }
                    return null;
                case 'float':
                case 'decimal':
                    if (isNaN(Number(input))) {
                        return "The input must be a number";
                    }
                    return null;
                case 'byte':
                    const byteValue = Number(input);
                    if (!Number.isInteger(byteValue) || isNaN(byteValue) || byteValue < 0 || byteValue > 255) {
                        return "The input must be an integer between 0 and 255";
                    }
                    return null;
                case 'boolean':
                    if (input !== 'true' && input !== 'false') {
                        return "The input must be either 'true' or 'false'";
                    }
                    return null;
                default:
                    return `Unsupported type: ${baseType}. Expected one of: string, int, float, decimal, byte, boolean`;
            }
        },
    });

    // Add quotes to string by default
    return baseType === "string" && !isOptional ? `"${inout}"` : inout;
}

async function getModifiedConfigs(workspaceFolder: WorkspaceFolder, config: DebugConfiguration) {
    const debuggeePort = config.debuggeePort ?? await findFreePort();
    config.debuggeePort = debuggeePort.toString();

    const ballerinaHome = extension.ballerinaExtInstance.getBallerinaHome();
    config['ballerina.home'] = ballerinaHome;
    config[BALLERINA_COMMAND] = extension.ballerinaExtInstance.getBallerinaCmd();
    config[EXTENDED_CLIENT_CAPABILITIES] = { supportsReadOnlyEditors: true, supportsFastRun: isFastRunEnabled() };

    if (!config.type) {
        config.type = LANGUAGE.BALLERINA;
    }

    if (!config.request) {
        config.request = DEBUG_REQUEST.LAUNCH;
    }

    config.noDebug = Boolean(config.noDebug);

    // Notify debug server that the debug session is started in low-code mode
    const isWebviewPresent = isVisualizerWebviewActive();
    if (isWebviewPresent && StateMachine.context().isBI) {
        config.lowCodeMode = true;
    }

    const activeTextEditor = window.activeTextEditor;

    if (activeTextEditor && activeTextEditor.document.fileName.endsWith(BAL_NOTEBOOK)) {
        sendTelemetryEvent(extension.ballerinaExtInstance, TM_EVENT_START_NOTEBOOK_DEBUG, CMP_NOTEBOOK);
        let activeTextEditorUri = activeTextEditor.document.uri;
        if (activeTextEditorUri.scheme === NOTEBOOK_CELL_SCHEME) {
            activeTextEditorUri = Uri.file(getTempFile());
            config.script = fileUriToPath(activeTextEditorUri.toString(true));
        } else {
            return Promise.reject();
        }
    }

    if (!config.script) {
        // If webview is present and in BI mode, use the project path from the state machine (focused project in BI)
        if (StateMachine.context().isBI && isWebviewPresent && StateMachine.context().projectPath) {
            config.script = StateMachine.context().projectPath;
        } else {
            config.script = await selectBallerinaProjectForDebugging(workspaceFolder);
        }
    }

    config.name = path.basename(config.script);

    // To make compatible with 1.2.x which supports scriptArguments
    if (config.programArgs) {
        config.scriptArguments = config.programArgs;
    }

    if (config.terminal) {
        var balVersion: decimal = parseFloat(extension.ballerinaExtInstance.ballerinaVersion);
        if (balVersion < 2201.3) {
            window.showWarningMessage(OLD_BALLERINA_VERSION_DEBUGGER_RUNINTERMINAL);
        } else if (config.terminal.toLowerCase() === "external") {
            window.showWarningMessage(UNSUPPORTED_DEBUGGER_RUNINTERMINAL_KIND);
        } else if (config.terminal.toLowerCase() !== "integrated") {
            window.showErrorMessage(INVALID_DEBUGGER_RUNINTERMINAL_KIND);
            return Promise.reject();
        }
    }

    if (!config.debugServer) {
        const debugServerPort = await findFreePort();
        config.debugServer = debugServerPort.toString();
    }

    return config;
}

function isVisualizerWebviewActive() {
    return VisualizerWebview.currentPanel !== undefined;
}

export async function constructDebugConfig(uri: Uri, testDebug: boolean, args?: any): Promise<DebugConfiguration> {

    const launchConfig: WorkspaceConfiguration = workspace.getConfiguration('launch').length > 0 ? workspace.getConfiguration('launch') :
        workspace.getConfiguration('launch', uri);
    const debugConfigs: DebugConfiguration[] = launchConfig.configurations;

    if (debugConfigs.length == 0) {
        const initialConfigurations: DebugConfiguration[] = extension.ballerinaExtInstance.extension.packageJSON.contributes.debuggers[0].initialConfigurations;

        debugConfigs.push(...initialConfigurations);
        launchConfig.update('configurations', debugConfigs, ConfigurationTarget.WorkspaceFolder, true);
    }

    let debugConfig: DebugConfiguration | undefined;
    for (let i = 0; i < debugConfigs.length; i++) {
        if ((testDebug && debugConfigs[i].name == DEBUG_CONFIG.TEST_DEBUG_NAME) ||
            (!testDebug && debugConfigs[i].name == DEBUG_CONFIG.SOURCE_DEBUG_NAME)) {
            debugConfig = debugConfigs[i];
            break;
        }
    }

    if (!debugConfig) {
        window.showErrorMessage("Failed to resolve correct Ballerina debug configuration for the current workspace.");
        return Promise.reject();
    }

    debugConfig.script = uri.fsPath;
    debugConfig.debugTests = testDebug;
    debugConfig.tests = testDebug ? args : undefined;
    return debugConfig;
}

export function activateDebugConfigProvider(ballerinaExtInstance: BallerinaExtension) {
    let context = <ExtensionContext>extension.ballerinaExtInstance.context;

    context.subscriptions.push(debug.registerDebugConfigurationProvider('ballerina', new DebugConfigProvider()));

    const factory = new BallerinaDebugAdapterDescriptorFactory(ballerinaExtInstance);
    context.subscriptions.push(debug.registerDebugAdapterDescriptorFactory('ballerina', factory));

    context.subscriptions.push(debug.registerDebugAdapterTrackerFactory('ballerina', new BallerinaDebugAdapterTrackerFactory()));

    // Listener to support reflect breakpoint changes in diagram when debugger is inactive
    context.subscriptions.push(debug.onDidChangeBreakpoints((session) => {
        // Only notify if there's no active debug session
        // When debugging, breakpoint changes are handled by the tracker factory
        if (!debug.activeDebugSession) {
            notifyBreakpointChange();
        }
    }));
}

class BallerinaDebugAdapterTrackerFactory implements DebugAdapterTrackerFactory {
    createDebugAdapterTracker(session: DebugSession): DebugAdapterTracker {
        return {
            onWillStartSession() {
                new BreakpointManager();
            },

            onWillStopSession() {
                // clear the active breakpoint
                BreakpointManager.getInstance().setActiveBreakpoint(undefined);
                notifyBreakpointChange();
                commands.executeCommand('setContext', 'isBIProjectRunning', false);
            },

            // Debug Adapter -> VS Code
            onDidSendMessage: async (message: DebugProtocol.ProtocolMessage) => {
                if (message.type === "response") {
                    const msg = <DebugProtocol.Response>message;
                    if ((msg.command === "launch" || msg.command == "restart") && StateMachine.context().isBI) {
                        // clear the active breakpoint
                        BreakpointManager.getInstance().setActiveBreakpoint(undefined);
                        notifyBreakpointChange();

                        // if `suggestTryit` is undefined, that means the debug session is directly started from the debug button. Therefore we should trigger the Try-It view.
                        const suggestTryit = session.configuration.suggestTryit === undefined || session.configuration.suggestTryit === true;
                        if (suggestTryit) {
                            // Target the integration this session actually ran. The Try-It
                            // trigger fires only after the service is up, so deriving the
                            // project from the then-current UI context would prompt for an
                            // integration if the user navigated away in the meantime (#1012).
                            // The script is forwarded even for single-file runs — the Try-It
                            // side normalizes file paths to their directory. It holds an fs
                            // path (set from uri.fsPath during config resolution), so no
                            // URI-to-path conversion is needed.
                            const sessionScript = (session.configuration as { script?: string })?.script;
                            const runProjectDir = sessionScript && fs.existsSync(sessionScript) ? sessionScript : undefined;
                            const serviceWaitDir = runProjectDir ? getProjectWorkingDirectory(runProjectDir) : workspace.workspaceFolders![0].uri.fsPath;
                            // Trigger Try-It view when starting/restarting debug sessions in low-code mode
                            waitForBallerinaService(serviceWaitDir).then(() => {
                                commands.executeCommand(PALETTE_COMMANDS.TRY_IT, true, undefined, undefined, undefined, undefined, runProjectDir);
                            }).catch((error) => {
                                debugLog(`Skipping Try-It suggestion: ${error}`);
                            });
                        }
                    } else if (msg.command === "setBreakpoints") {
                        const breakpoints = msg.body.breakpoints;
                        // convert debug points to client breakpoints
                        if (breakpoints) {
                            const clientBreakpoints = breakpoints.map(bp => ({
                                ...bp,
                                line: bp.line - 1
                            }));
                            // set the breakpoints in the diagram
                            BreakpointManager.getInstance().addBreakpoints(clientBreakpoints);
                            notifyBreakpointChange();
                        }
                    } else if (msg.command === "stackTrace") {
                        const uri = Uri.parse(msg.body.stackFrames[0].source.path);
                        const isWebviewPresent = VisualizerWebview.currentPanel !== undefined;

                        // Instead of closing editor tab, arrange them side by side
                        if (isWebviewPresent) {
                            // Show webview on LHS
                            VisualizerWebview.currentPanel.getWebview().reveal(ViewColumn.Active, false);

                            // Open or focus the text editor next to the webview
                            const document = await workspace.openTextDocument(uri);
                            const editor = await window.showTextDocument(document, {
                                viewColumn: ViewColumn.Beside,
                                preserveFocus: true,
                            });
                        }

                        const hitBreakpoint = msg.body.stackFrames[0];
                        console.log(" >>> active breakpoint stackTrace ", hitBreakpoint);

                        const clientBreakpoint = {
                            ...hitBreakpoint,
                            line: Math.max(0, hitBreakpoint.line - 1),
                            column: Math.max(0, hitBreakpoint.column - 1)
                        };

                        BreakpointManager.getInstance().setActiveBreakpoint(clientBreakpoint);

                        if (isWebviewPresent) {
                            await handleDebugHitVisualization(uri, clientBreakpoint);
                        }
                    } else if (msg.command === "continue" || msg.command === "next" || msg.command === "stepIn" || msg.command === "stepOut") {
                        // clear the active breakpoint
                        BreakpointManager.getInstance().setActiveBreakpoint(undefined);
                        notifyBreakpointChange();
                    }
                }

                if (message.type === "event") {
                    const msg = <DebugProtocol.Event>message;
                    if (msg.event === "startFastRun") {
                        // clear the active breakpoint
                        BreakpointManager.getInstance().setActiveBreakpoint(undefined);
                        notifyBreakpointChange();

                        // restart the fast-run
                        getCurrentProjectRoot().then(async (root) => {
                            const didStop = await stopRunFast(root);
                            if (didStop) {
                                runFast(root, msg.body);
                            }
                        });
                    } else if (msg.event === "output") {
                        if (msg.body.output === "Running executable\n") {
                            const workspaceRoot = workspace.workspaceFolders && workspace.workspaceFolders[0].uri.fsPath;
                            if (workspaceRoot) {
                                // Get the component list
                                const components: BallerinaProjectComponents = await extension.ballerinaExtInstance?.langClient?.getBallerinaProjectComponents({
                                    documentIdentifiers: [{ uri: URI.file(workspaceRoot).toString() }]
                                });

                                // Iterate and extract the services
                                const services = components.packages
                                    ?.flatMap(pkg => pkg.modules)
                                    .flatMap(module => module.services);

                                if (services && services.length > 0) {
                                    commands.executeCommand('setContext', 'isBIProjectRunning', true);
                                }
                            }
                        }
                    }
                }
            },
        };
    }
}

async function handleDebugHitVisualization(uri: Uri, clientBreakpoint: DebugProtocol.StackFrame) {
    const newContext = StateMachine.context();

    // Check if breakpoint is in a different package
    if (!isPathInside(newContext.projectPath, uri.fsPath)) {
        console.log("Debug hit in a different package");
        window.showInformationMessage("Cannot visualize debug hit since it belongs to a different integration");
        openView(EVENT_TYPE.OPEN_VIEW, newContext);
        notifyBreakpointChange();
        return;
    }

    // Get enclosed function definition
    const req: BIGetEnclosedFunctionRequest = {
        filePath: uri.fsPath,
        position: {
            line: clientBreakpoint.line,
            offset: clientBreakpoint.column
        }
    };

    const res = await StateMachine.langClient().getEnclosedFunctionDef(req);

    if (!res?.startLine || !res?.endLine) {
        window.showInformationMessage("Failed to open the respective view for the debug hit. Please manually navigate to the respective view.");
        notifyBreakpointChange();
        return;
    }

    // Update context with new position
    newContext.documentUri = uri.fsPath;
    newContext.view = undefined;
    newContext.position = {
        startLine: res.startLine.line,
        startColumn: res.startLine.offset,
        endLine: res.endLine.line,
        endColumn: res.endLine.offset
    };
    openView(EVENT_TYPE.OPEN_VIEW, newContext);
}



class BallerinaDebugAdapterDescriptorFactory implements DebugAdapterDescriptorFactory {
    private ballerinaExtInstance: BallerinaExtension;
    private notificationHandler: Disposable | null = null;

    constructor(ballerinaExtInstance: BallerinaExtension) {
        this.ballerinaExtInstance = ballerinaExtInstance;
    }

    async createDebugAdapterDescriptor(session: DebugSession, executable: DebugAdapterExecutable | undefined): Promise<DebugAdapterDescriptor> {
        // Check if the project contains errors(and fix the possible ones) before starting the debug session.
        // Prefer the launch config's script — it points at the integration the
        // user actually triggered, which may differ from the "current" project
        // when multiple integrations are open (#1012).
        const langClient = extension.ballerinaExtInstance.langClient;
        const sessionScript = (session.configuration as { script?: string })?.script;
        const projectRoot = sessionScript && fs.existsSync(sessionScript) && fs.statSync(sessionScript).isDirectory()
            ? sessionScript
            : await getCurrentProjectRoot();
        await cleanAndValidateProject(langClient, projectRoot);

        if (session.configuration.noDebug && extension.ballerinaExtInstance.enabledRunFast()) {
            return new Promise((resolve) => {
                resolve(new DebugAdapterInlineImplementation(new FastRunDebugAdapter()));
            });
        }

        if (session.configuration.noDebug) {
            return new Promise((resolve) => {
                resolve(new DebugAdapterInlineImplementation(new BIRunAdapter(session)));
            });
        }

        const port = session.configuration.debugServer;
        const configEnv = session.configuration.configEnv;
        const cwd = this.getCurrentWorkingDir();
        let args: string[] = [];
        const cmd = this.getScriptPath(args);
        args.push(port.toString());

        let opt: ExecutableOptions = { cwd, shell: true };
        opt.env = Object.assign({}, process.env, configEnv);

        try {
            log(`Starting debug adapter: '${extension.ballerinaExtInstance.getBallerinaCmd()} start-debugger-adapter ${port.toString()}`);
            const serverProcess = child_process.spawn(cmd, args, opt);

            await new Promise<void>((resolve) => {
                serverProcess.stdout.on('data', (data) => {
                    if (data.toString().includes('Debug server started')) {
                        resolve();
                    }
                    log(`${data}`);
                });

                serverProcess.stderr.on('data', (data) => {
                    debugLog(`${data}`);
                });
            });
            sendTelemetryEvent(extension.ballerinaExtInstance, TM_EVENT_START_DEBUG_SESSION, CMP_DEBUGGER);
            this.registerLogTraceNotificationHandler(session);
            return new DebugAdapterServer(port);
        } catch (error) {
            sendTelemetryException(extension.ballerinaExtInstance, error as Error, CMP_DEBUGGER);
            return await Promise.reject(error);
        }
    }

    private registerLogTraceNotificationHandler(session: DebugSession) {
        const langClient = extension.ballerinaExtInstance.langClient;
        const notificationHandler = langClient.onNotification('$/logTrace', (params: any) => {
            if (params.verbose === "stopped") {
                // do nothing
            } else {
                if (params && params.message) {
                    const category = params.verbose === 'err' ? 'stderr' : 'stdout';
                    session.customRequest('output', { output: params.message, category: category });
                }
            }
        });
        this.notificationHandler = notificationHandler;
    }
    getScriptPath(args: string[]): string {
        args.push('start-debugger-adapter');
        // Quote the path to handle spaces in directory names (used with shell: true)
        return quoteShellPath(extension.ballerinaExtInstance.getBallerinaCmd());
    }
    getCurrentWorkingDir(): string {
        return path.join(extension.ballerinaExtInstance.ballerinaHome, "bin");
    }
}

class FastRunDebugAdapter extends LoggingDebugSession {

    notificationHandler: Disposable | null = null;
    root: string | null = null;
    programArgs: string[] = [];

    protected launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments, request?: DebugProtocol.Request): void {
        const langClient = extension.ballerinaExtInstance.langClient;
        const notificationHandler = langClient.onNotification('$/logTrace', (params: any) => {
            if (params.verbose === "stopped") { // even if a single channel (stderr,stdout) stopped, we stop the debug session
                notificationHandler!.dispose();
                this.sendEvent(new TerminatedEvent());
            } else {
                const category = params.verbose === 'err' ? 'stderr' : 'stdout';
                this.sendEvent(new OutputEvent(params.message, category));
            }
        });
        this.notificationHandler = notificationHandler;
        this.programArgs = (args as any).programArgs;
        getCurrentProjectRoot().then((root) => {
            this.root = root;
            runFast(root, { programArgs: this.programArgs }).then((didRan) => {
                response.success = didRan;
                this.sendResponse(response);
            });
        });
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): void {
        const notificationHandler = this.notificationHandler;
        stopRunFast(this.root).then((didStop) => {
            response.success = didStop;
            notificationHandler!.dispose();
            this.sendResponse(response);
        });
    }
}

class BIRunAdapter extends LoggingDebugSession {

    notificationHandler: Disposable | null = null;
    root: string | null = null;
    task: TaskExecution | null = null;
    taskTerminationListener: Disposable | null = null;

    private session: DebugSession;
    private disconnected = false;
    // True once this adapter finished without (or after) a running task —
    // cancelled/failed/superseded launches included. Gate for slot
    // restoration: an ended adapter must never be restored (#1690).
    private ended = false;
    // One adapter slot per integration (keyed by resolved project path):
    // different integrations run concurrently, while two launches of the SAME
    // integration conflict (#1012).
    private static activeAdapters: Map<string, BIRunAdapter> = new Map();
    private slotKey: string = '';

    constructor(session: DebugSession) {
        super();
        this.session = session;
    }

    protected launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments, request?: DebugProtocol.Request): void {
        // Claim the per-integration slot synchronously before any await —
        // serializes concurrent launchRequests of the same integration so
        // neither can read an empty slot and race past the conflict check.
        // The script is set by resolveDebugConfiguration for every launch;
        // if it is ever missing, fall back to a per-session unique key so
        // unrelated script-less sessions never collide on a shared slot.
        const configScript = (this.session.configuration as { script?: string })?.script;
        this.slotKey = configScript ? path.resolve(configScript) : `session:${this.session.id}`;
        const existingAdapter = BIRunAdapter.activeAdapters.get(this.slotKey) ?? null;
        BIRunAdapter.activeAdapters.set(this.slotKey, this);

        getCurrentProjectRoot().then(async (projectRoot) => {
            // Prefer the launch config's script — it points at the integration
            // the user actually triggered, which may differ from the "current"
            // project when multiple integrations are open and running.
            if (configScript && fs.existsSync(configScript) && fs.statSync(configScript).isDirectory()) {
                projectRoot = configScript;
            }

            // Treat any non-null existingAdapter as a conflict, even if its task hasn't
            // started yet (adapter claimed slot but still launching). Skipped when the
            // registry guard already resolved the conflict via force-start — the old
            // task is intentionally still alive and the user must not be re-prompted.
            const forceStarted = (this.session.configuration as { forceStartedRun?: boolean })?.forceStartedRun === true;
            if (existingAdapter && !forceStarted) {
                const existingTask = existingAdapter.task;
                const choice = await window.showInformationMessage(RUN_CONFLICT_PROMPT, 'Yes', 'No');
                if (choice !== 'Yes') {
                    // Prevent the debug tracker from triggering the Try It view for this cancelled session.
                    (this.session.configuration as any).suggestTryit = false;
                    // Restore the previous adapter so the next launch still detects it.
                    this.restoreOrReleaseSlot(existingAdapter);
                    this.ended = true;
                    response.success = true;
                    this.sendResponse(response);
                    this.sendEvent(new TerminatedEvent());
                    return;
                }

                // Slot is already ours. Only wait for termination if the task has actually
                // started — if existingTask is null the previous launch hadn't begun yet.
                if (existingTask) {
                    // Await full termination before starting the new task to avoid port conflicts.
                    // The old adapter's taskTerminationListener uses an identity-guarded clear
                    // and will not clobber our reference.
                    const shouldProceed = await new Promise<boolean>((resolve) => {
                        let listener: { dispose(): void };
                        const timeout = setTimeout(async () => {
                            listener.dispose();
                            const forceChoice = await window.showWarningMessage(FORCE_START_PROMPT,
                                'Force Start', 'Cancel new launch'
                            );
                            if (forceChoice === 'Force Start') {
                                resolve(true);
                            } else {
                                // Process is still running — restore the previous adapter so
                                // subsequent launches still detect it as a conflict.
                                this.restoreOrReleaseSlot(existingAdapter);
                                resolve(false);
                            }
                        }, 10000);
                        listener = tasks.onDidEndTaskProcess(e => {
                            if (e.execution === existingTask) {
                                clearTimeout(timeout);
                                listener.dispose();
                                resolve(true);
                            }
                        });
                        // Task may have already ended while the confirmation dialog was open.
                        if (!tasks.taskExecutions.some(e => e === existingTask)) {
                            clearTimeout(timeout);
                            listener.dispose();
                            resolve(true);
                            return;
                        }
                        existingTask.terminate();
                    });

                    if (!shouldProceed) {
                        (this.session.configuration as any).suggestTryit = false;
                        this.ended = true;
                        response.success = true;
                        this.sendResponse(response);
                        this.sendEvent(new TerminatedEvent());
                        return;
                    }
                }
            }

            // Unique task identity per integration so VS Code runs them as
            // separate tasks instead of deduplicating into a single "already
            // active" task. The 'ballerina-run' type is registered in
            // package.json (taskDefinitions) with projectRoot as an identity
            // property — ad-hoc properties on 'shell' tasks are NOT part of
            // the task identity and would collide across integrations.
            const taskDefinition: TaskDefinition = {
                type: 'ballerina-run',
                projectRoot: path.resolve(projectRoot),
                // Unique per launch: a force-started run overlaps the old
                // instance of the SAME integration, and an identical identity
                // would trip VS Code's built-in "task is already active" modal.
                instanceId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            };

            let runCommand: string = `${quoteShellPath(extension.ballerinaExtInstance.getBallerinaCmd())} run`;

            const programArgs = (args as any).programArgs;
            if (programArgs && programArgs.length > 0) {
                runCommand = `${runCommand} -- ${programArgs.join(' ')}`;
            }

            if (isSupportedSLVersion(extension.ballerinaExtInstance, createVersionNumber(2201, 13, 0)) && extension.ballerinaExtInstance.enabledExperimentalFeatures()) {
                runCommand = `${runCommand} --experimental`;
            }

            // Use the current process environment which should have the updated PATH
            const env = { ...process.env, ...((args as any)?.env || {}) };
            debugLog(`[BIRunAdapter] Creating shell execution with env. PATH length: ${env.PATH?.length || 0}`);

            // Determine the correct working directory for the task
            let cwd: string;
            try {
                cwd = getProjectWorkingDirectory(projectRoot);
                debugLog(`[BIRunAdapter] Setting cwd to project root: ${cwd}`);
            } catch (error) {
                window.showErrorMessage(`Failed to determine working directory`);
                if (BIRunAdapter.activeAdapters.get(this.slotKey) === this) {
                    BIRunAdapter.activeAdapters.delete(this.slotKey);
                }
                this.ended = true;
                response.success = false;
                this.sendResponse(response);
                this.sendEvent(new TerminatedEvent());
                return;
            }

            const execution = new ShellExecution(runCommand, {
                env: env as { [key: string]: string },
                cwd: cwd
            });
            const task = new Task(
                taskDefinition,
                TaskScope.Workspace,
                `Ballerina Run - ${path.basename(projectRoot)}`,
                'ballerina',
                execution
            );
            // Dedicated terminal per integration: concurrent runs must not
            // share (and steal) each other's task terminal.
            task.presentationOptions = {
                panel: TaskPanelKind.Dedicated,
                showReuseMessage: false,
                clear: false
            };

            // Guard against being superseded while awaiting getCurrentProjectRoot() or the
            // termination wait above — the other adapter already owns the slot.
            if (BIRunAdapter.activeAdapters.get(this.slotKey) !== this) {
                (this.session.configuration as any).suggestTryit = false;
                this.ended = true;
                response.success = true;
                this.sendResponse(response);
                this.sendEvent(new TerminatedEvent());
                return;
            }

            try {
                const taskExecution = await tasks.executeTask(task);
                this.task = taskExecution;
                // Register with the central runner state so the single-instance
                // guard can await full process termination before the next run.
                markTaskRunStarted(taskExecution, projectRoot);

                this.taskTerminationListener = tasks.onDidEndTaskProcess(e => {
                    if (e.execution === this.task) {
                        this.taskTerminationListener?.dispose();
                        this.taskTerminationListener = null;
                        this.ended = true;
                        if (BIRunAdapter.activeAdapters.get(this.slotKey) === this) {
                            BIRunAdapter.activeAdapters.delete(this.slotKey);
                        }
                        // Skip TerminatedEvent if disconnectRequest already fired —
                        // the session is already being torn down by VS Code.
                        if (!this.disconnected) {
                            this.sendEvent(new TerminatedEvent());
                        }
                    }
                });

                response.success = true;
                this.sendResponse(response);
            } catch (error) {
                window.showErrorMessage(`Failed to run Ballerina package: ${error}`);
                if (BIRunAdapter.activeAdapters.get(this.slotKey) === this) {
                    BIRunAdapter.activeAdapters.delete(this.slotKey);
                }
                this.ended = true;
                response.success = false;
                this.sendResponse(response);
                this.sendEvent(new TerminatedEvent());
            }
        }).catch((error) => {
            window.showErrorMessage(`Failed to determine project root: ${error}`);
            if (BIRunAdapter.activeAdapters.get(this.slotKey) === this) {
                BIRunAdapter.activeAdapters.delete(this.slotKey);
            }
            this.ended = true;
            response.success = false;
            this.sendResponse(response);
            this.sendEvent(new TerminatedEvent());
        });
    }

    /**
     * Hands the slot back to the previous adapter after a cancelled launch —
     * but only while its run is still actually alive. Restoring a dead
     * adapter would make every future launch report "already running" even
     * though the integration is stopped (product-integrator#1690).
     *
     * Alive means: not ended (cancelled/failed/superseded launches set the
     * `ended` flag even though they never had a task), and either its task
     * process is still running or it is genuinely still mid-launch.
     */
    private restoreOrReleaseSlot(existingAdapter: BIRunAdapter): void {
        if (BIRunAdapter.activeAdapters.get(this.slotKey) !== this) {
            return;
        }
        const existingTask = existingAdapter.task;
        const existingAlive = !existingAdapter.ended && (
            existingTask
                ? tasks.taskExecutions.some(execution => execution === existingTask)
                : true // no task yet and not ended — the previous launch is still in flight
        );
        if (existingAlive) {
            BIRunAdapter.activeAdapters.set(this.slotKey, existingAdapter);
        } else {
            BIRunAdapter.activeAdapters.delete(this.slotKey);
        }
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): void {
        this.disconnected = true;
        if (this.task) {
            this.task.terminate();
            // Don't clear the adapter slot here — the process is still shutting
            // down. taskTerminationListener clears it once onDidEndTaskProcess fires.
        } else {
            // Disconnected before the task ever started: this launch is over.
            this.ended = true;
            if (BIRunAdapter.activeAdapters.get(this.slotKey) === this) {
                BIRunAdapter.activeAdapters.delete(this.slotKey);
            }
        }
        if (this.notificationHandler) {
            this.notificationHandler.dispose();
            this.notificationHandler = null;
        }
        response.success = true;
        this.sendResponse(response);
    }

}

async function runFast(root: string, options: { debugPort?: number; env?: Map<string, string>; programArgs?: string[]; } = {}): Promise<boolean> {
    try {
        if (window.activeTextEditor?.document.isDirty) {
            await commands.executeCommand(PALETTE_COMMANDS.SAVE_ALL);
        }
        const { debugPort = -1, env = new Map(), programArgs = [] } = options;

        const javaCommand: string = getJavaCommand();
        const commandArguments = [
            { key: "command", value: javaCommand },
            { key: "path", value: root },
            { key: "debugPort", value: debugPort },
            { key: "env", value: env },
            { key: "programArgs", value: programArgs }
        ];

        return await extension.ballerinaExtInstance.langClient.executeCommand({
            command: "RUN",
            arguments: commandArguments,
        });
    } catch (error) {
        console.error('Error while executing the fast-run command:', error);
        return false;
    }
}

async function stopRunFast(root: string): Promise<boolean> {
    return await extension.ballerinaExtInstance.langClient.executeCommand({
        command: "STOP", arguments: [
            { key: "path", value: root! }]
    });
}

function getJavaCommand(): string {
    const ballerinaHome = isWindows() ? fs.realpathSync.native(extension.ballerinaExtInstance.getBallerinaHome()) : extension.ballerinaExtInstance.getBallerinaHome();
    // Get the base ballerina home by removing the distribution part
    const baseHome = ballerinaHome.includes('distributions')
        ? ballerinaHome.substring(0, ballerinaHome.indexOf('distributions'))
        : ballerinaHome;

    // Find any JDK in the dependencies directory
    const dependenciesDir = join(baseHome, 'dependencies');
    const jdkDir = findHighestVersionJdk(dependenciesDir);

    if (!jdkDir) {
        log(`No JDK found in dependencies directory: ${dependenciesDir}`);
        throw new Error(`JDK not found in ${dependenciesDir}`);
    }

    const jdkVersionMatch = jdkDir.match(/jdk-(.+)-jre/);
    if (jdkVersionMatch) {
        log(`JDK Version: ${jdkVersionMatch[1]}`);
    }

    const javaExecutable = isWindows() ? 'java.exe' : 'java';
    const cmd = join(jdkDir, 'bin', javaExecutable);
    return cmd;
}

function findFreePort(): Promise<number> {
    return getPortPromise({ port: 5010, stopPort: 20000 });
}

function isFastRunEnabled(): boolean {
    const config = workspace.getConfiguration('ballerina');
    return config.get<boolean>('enableRunFast');
}
