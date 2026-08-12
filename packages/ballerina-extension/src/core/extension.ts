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
    workspace, window, commands, languages, Uri, ConfigurationChangeEvent, extensions, Extension, ExtensionContext,
    IndentAction, OutputChannel, StatusBarItem, StatusBarAlignment, env, TextEditor, ThemeColor,
    ConfigurationTarget, ProgressLocation, EventEmitter, Event
} from "vscode";
import {
    INVALID_HOME_MSG, INSTALL_BALLERINA, DOWNLOAD_BALLERINA, MISSING_SERVER_CAPABILITY, ERROR, COMMAND_NOT_FOUND,
    NO_SUCH_FILE, CONFIG_CHANGED, OLD_BALLERINA_VERSION, INVALID_FILE, INVALID_PROJECT,
    OLD_PLUGIN_INSTALLED,
    COOKIE_SETTINGS,
    UPDATE_BALLERINA_VERSION
} from "./messages";
import { join, sep } from 'path';
import { exec, spawnSync, execSync } from 'child_process';
import { LanguageClientOptions, State as LS_STATE, RevealOutputChannelOn, ServerOptions } from "vscode-languageclient/node";
import { getServerOptions } from '../utils/server/server';
import { ExtendedLangClient } from './extended-language-client';
import {
    debug,
    log,
    getOutputChannel,
    outputChannel,
    isWindows,
    isWSL,
    quoteShellPath,
    isSupportedVersion,
    VERSION,
    isSupportedSLVersion,
    createVersionNumber,
    checkIsBallerinaWorkspace,
    isInWI
} from '../utils';
import { AssertionError } from "assert";
import {
    BALLERINA_HOME, ENABLE_ALL_CODELENS, ENABLE_TELEMETRY, ENABLE_SEMANTIC_HIGHLIGHTING, OVERRIDE_BALLERINA_HOME,
    ENABLE_PERFORMANCE_FORECAST, ENABLE_DEBUG_LOG, ENABLE_BALLERINA_LS_DEBUG,
    ENABLE_EXPERIMENTAL_FEATURES, ENABLE_NOTEBOOK_DEBUG, ENABLE_RUN_FAST, ENABLE_ADDITIONAL_TRIGGER_SEARCH,
    ENABLE_INLAY_HINTS, FILE_DOWNLOAD_PATH,
    ENABLE_LIVE_RELOAD,
    ENABLE_AI_SUGGESTIONS,
    ENABLE_SEQUENCE_DIAGRAM_VIEW,
    ENABLE_BACKGROUND_DRIFT_CHECK,
    ENABLE_BALLERINA_INTEGRATOR,
    DEFINE_BALLERINA_INTEGRATOR_SCOPE,
    SHOW_LIBRARY_CONFIG_VARIABLES,
    LANG_SERVER_PATH,
    USE_BALLERINA_CLI_LANG_SERVER,
    SHOW_ADVANCED_AI_NODES
}
    from "./preferences";
import TelemetryReporter from "vscode-extension-telemetry";
import {
    createTelemetryReporter, CMP_EXTENSION_CORE, sendTelemetryEvent, sendTelemetryException,
    TM_EVENT_ERROR_INVALID_BAL_HOME_CONFIGURED, TM_EVENT_EXTENSION_INIT, TM_EVENT_EXTENSION_INI_FAILED,
    TM_EVENT_ERROR_OLD_BAL_HOME_DETECTED,
    getMessageObject
} from "../features/telemetry";
import { BALLERINA_COMMANDS, runCommand } from "../features/project";
import { gitStatusBarItem } from "../features/editor-support/git-status";
import { checkIsPersistModelFile } from "../views/persist-layer-diagram/activator";
import { BallerinaProject, DownloadProgress, onDownloadProgress, SHARED_COMMANDS } from "@wso2/ballerina-core";
import os from "os";
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import * as glob from 'glob';
import { RPCLayer } from "../RPCLayer";
import { VisualizerWebview } from "../views/visualizer/webview";

const SWAN_LAKE_REGEX = /(s|S)wan( |-)(l|L)ake/g;

export const EXTENSION_ID = 'wso2.ballerina';
const PREV_EXTENSION_ID = 'ballerina.ballerina';
export enum LANGUAGE {
    BALLERINA = 'ballerina',
    TOML = 'toml'
}

export enum WEBVIEW_TYPE {
    PERFORMANCE_FORECAST,
    SWAGGER,
    BBE,
    CONFIGURABLE
}
export interface ConstructIdentifier {
    filePath: string;
    kind: string;
    startLine: number;
    startColumn: number;
    name: string;
}

export interface Change {
    fileUri: Uri;
    startLine: number;
    startColumn: number;
}

export interface ChoreoSession {
    loginStatus: boolean;
    choreoUser?: string;
    choreoAccessToken?: string;
    choreoCookie?: string;
    choreoRefreshToken?: string;
    choreoLoginTime?: Date;
    tokenExpirationTime?: number;
}

export interface CodeServerContext {
    codeServerEnv: boolean;
    manageChoreoRedirectUri?: string;
    statusBarItem?: gitStatusBarItem;
    infoMessageStatus: {
        messageFirstEdit: boolean;
        sourceControlMessage: boolean;
    };
    telemetryTracker?: TelemetryTracker;
}

interface PerformanceForecastContext {
    infoMessageStatus: {
        signinChoreo: boolean;
    };
    temporaryDisabled?: boolean;
}

export interface WebviewContext {
    isOpen: boolean;
    type?: WEBVIEW_TYPE;
}

const showMessageInstallBallerinaCommand = 'ballerina.showMessageInstallBallerina';
const SDK_PREFIX = 'Ballerina ';
export class BallerinaExtension {
    public telemetryReporter: TelemetryReporter;
    public ballerinaHome: string;
    private ballerinaCmd: string;
    public ballerinaVersion: string;
    public biSupported: boolean;
    public isNPSupported: boolean;
    public isWorkspaceSupported: boolean;
    public extension: Extension<any>;
    private clientOptions: LanguageClientOptions;
    public langClient?: ExtendedLangClient;
    public context?: ExtensionContext;
    public isPersist?: boolean;
    private sdkVersion: StatusBarItem;
    private documentContext: DocumentContext;
    private codeServerContext: CodeServerContext;
    private webviewContext: WebviewContext;
    private perfForecastContext: PerformanceForecastContext;
    private ballerinaConfigPath: string;
    private isOpenedOnce: boolean;
    private ballerinaUserHome: string;
    private ballerinaUserHomeName: string;
    private ballerinaIntegratorReleaseUrl: string;
    private ballerinaHomeCustomDirName: string;
    private ballerinaInstallationDir: string;
    private updateToolServerUrl: string;
    private ballerinaUpdateToolUserAgent: string;
    private readonly _downloadProgressEmitter = new EventEmitter<DownloadProgress>();
    public readonly onDownloadProgress: Event<DownloadProgress> = this._downloadProgressEmitter.event;
    private _wiCommandAvailable: boolean | undefined = undefined;
    private _resolveFeatureSupport!: () => void;
    /**
     * Whether {@link biSupported}/{@link isNPSupported}/{@link isWorkspaceSupported} hold a
     * real answer yet. They are all initialized to `false` in the constructor, so before
     * this flips a reader cannot tell "unsupported" from "not determined yet" — anything
     * user-facing must await {@link featureSupportReady} instead of reading them directly.
     */
    public featureSupportResolved = false;
    /**
     * Resolves once the feature-support flags are settled — after the distribution version
     * is known, which is far earlier than the language server being up. Also resolves (with
     * the flags left `false`) when initialization fails, so waiters never hang on a machine
     * without a Ballerina distribution.
     */
    public readonly featureSupportReady: Promise<void> = new Promise<void>((resolve) => {
        this._resolveFeatureSupport = resolve;
    });

    constructor() {
        debug("[EXTENSION] Starting constructor initialization...");

        try {
            // Initialize basic properties
            this.ballerinaHome = '';
            this.ballerinaCmd = '';
            this.ballerinaVersion = '';
            this.biSupported = false;
            this.isNPSupported = false;
            this.isWorkspaceSupported = false;
            this.isPersist = false;
            this.ballerinaUserHomeName = '.ballerina';

            debug("[EXTENSION] Basic properties initialized");

            // Set up directory paths
            try {
                const userHomeDir = this.getUserHomeDirectory();
                debug(`[EXTENSION] User home directory: ${userHomeDir}`);
                this.ballerinaUserHome = path.join(userHomeDir, this.ballerinaUserHomeName);
                debug(`[EXTENSION] Ballerina user home: ${this.ballerinaUserHome}`);
            } catch (error) {
                debug(`[EXTENSION] Error setting up user home directory: ${error}`);
                throw error;
            }

            this.ballerinaIntegratorReleaseUrl = "https://api.github.com/repos/ballerina-platform/ballerina-distribution/releases";
            this.ballerinaHomeCustomDirName = "ballerina-home";

            try {
                this.ballerinaInstallationDir = path.join(this.getBallerinaUserHome(), this.ballerinaHomeCustomDirName);
                debug(`[EXTENSION] Ballerina installation directory: ${this.ballerinaInstallationDir}`);
            } catch (error) {
                debug(`[EXTENSION] Error setting installation directory: ${error}`);
                throw error;
            }

            // Set up server URLs
            this.updateToolServerUrl = "https://api.central.ballerina.io/2.0/update-tool";
            try {
                if (this.overrideBallerinaHome()) {
                    this.updateToolServerUrl = "https://api.staging-central.ballerina.io/2.0/update-tool";
                    debug("[EXTENSION] Using staging update tool server URL");
                }
                debug(`[EXTENSION] Update tool server URL: ${this.updateToolServerUrl}`);
            } catch (error) {
                debug(`[EXTENSION] Error setting update tool server URL: ${error}`);
            }

            try {
                this.ballerinaUpdateToolUserAgent = this.getUpdateToolUserAgent();
                debug(`[EXTENSION] Update tool user agent: ${this.ballerinaUpdateToolUserAgent}`);
            } catch (error) {
                debug(`[EXTENSION] Error getting update tool user agent: ${error}`);
                this.ballerinaUpdateToolUserAgent = null;
            }

            try {
                this.showStatusBarItem();
                debug("[EXTENSION] Status bar item initialized");
            } catch (error) {
                debug(`[EXTENSION] Error initializing status bar: ${error}`);
            }

            // Load the extension
            try {
                this.extension = extensions.getExtension(EXTENSION_ID)!;
                if (this.extension) {
                    debug(`[EXTENSION] Extension loaded successfully: ${EXTENSION_ID}`);
                } else {
                    throw new Error(`Extension ${EXTENSION_ID} not found`);
                }
            } catch (error) {
                debug(`[EXTENSION] Error loading extension: ${error}`);
                throw error;
            }

            // Set up client options
            try {
                this.clientOptions = {
                    documentSelector: [{ scheme: 'file', language: LANGUAGE.BALLERINA }, {
                        scheme: 'file', language:
                            LANGUAGE.TOML
                    }],
                    synchronize: { configurationSection: LANGUAGE.BALLERINA },
                    outputChannel: getOutputChannel(),
                    revealOutputChannelOn: RevealOutputChannelOn.Never,
                    initializationOptions: {
                        "enableSemanticHighlighting": <string>workspace.getConfiguration().get(ENABLE_SEMANTIC_HIGHLIGHTING),
                        "enableBackgroundDriftCheck": <string>workspace.getConfiguration().get(ENABLE_BACKGROUND_DRIFT_CHECK),
                        "enableInlayHints": <string>workspace.getConfiguration().get(ENABLE_INLAY_HINTS),
                        "supportBalaScheme": "true",
                        "supportQuickPick": "true",
                        "supportPositionalRenamePopup": "true"
                    }
                };
                debug("[EXTENSION] Client options configured");
            } catch (error) {
                debug(`[EXTENSION] Error setting up client options: ${error}`);
                throw error;
            }

            try {
                this.telemetryReporter = createTelemetryReporter(this);
                debug("[EXTENSION] Telemetry reporter created");
            } catch (error) {
                debug(`[EXTENSION] Error creating telemetry reporter: ${error}`);
                // Don't throw here, telemetry is not critical
            }

            try {
                this.documentContext = new DocumentContext();
                debug("[EXTENSION] Document context initialized");
            } catch (error) {
                debug(`[EXTENSION] Error initializing document context: ${error}`);
                throw error;
            }

            try {
                this.codeServerContext = {
                    codeServerEnv: this.isCodeServerEnv(),
                    manageChoreoRedirectUri: process.env.VSCODE_CHOREO_DEPLOY_URI,
                    infoMessageStatus: {
                        sourceControlMessage: true,
                        messageFirstEdit: true
                    }
                };
                debug(`[EXTENSION] Code server context initialized. Code server env: ${this.codeServerContext.codeServerEnv}`);
            } catch (error) {
                debug(`[EXTENSION] Error initializing code server context: ${error}`);
                throw error;
            }

            if (this.isCodeServerEnv()) {
                try {
                    commands.executeCommand('workbench.action.closeAllEditors');
                    this.showCookieConsentMessage();
                    this.getCodeServerContext().telemetryTracker = new TelemetryTracker();
                    debug("[EXTENSION] Code server environment setup completed");
                } catch (error) {
                    debug(`[EXTENSION] Error setting up code server environment: ${error}`);
                }
            }

            this.webviewContext = { isOpen: false };
            this.perfForecastContext = {
                infoMessageStatus: {
                    signinChoreo: true
                }
            };
            this.ballerinaConfigPath = '';

            debug("[EXTENSION] Constructor completed successfully");
        } catch (error) {
            debug(`[EXTENSION] Fatal error in constructor: ${error}`);
            throw error;
        }
    }

    setContext(context: ExtensionContext) {
        this.context = context;
    }

    /**
     * Publishes the feature-support flags to everything awaiting {@link featureSupportReady}.
     * Idempotent — called both when the flags are computed and on the initialization failure
     * path, where they keep their `false` defaults.
     */
    markFeatureSupportResolved() {
        this.featureSupportResolved = true;
        this._resolveFeatureSupport();
    }

    init(_onBeforeInit: Function): Promise<void> {
        debug("[INIT] Starting extension initialization...");
        debug(`[INIT] Platform: ${process.platform}, Architecture: ${process.arch}`);
        debug(`[INIT] Node version: ${process.version}`);
        debug(`[INIT] VS Code version: ${env.appName} ${env.appHost}`);
        debug(`[INIT] Extension version: ${this.getVersion()}`);

        // Log environment information for WSL debugging
        debug(`[INIT] Environment variables:`);
        debug(`[INIT] WSL_DISTRO_NAME: ${process.env.WSL_DISTRO_NAME || 'Not set'}`);
        debug(`[INIT] WSLENV: ${process.env.WSLENV || 'Not set'}`);
        debug(`[INIT] PATH: ${process.env.PATH || 'Not set'}`);
        debug(`[INIT] HOME: ${process.env.HOME || 'Not set'}`);
        debug(`[INIT] USERPROFILE: ${process.env.USERPROFILE || 'Not set'}`);

        try {
            // Check for old extension version
            if (extensions.getExtension(PREV_EXTENSION_ID)) {
                debug("[INIT] Found old extension version, showing uninstall message");
                this.showUninstallOldVersion();
            } else {
                debug("[INIT] No old extension version found");
            }

            // Register show logs command
            try {
                const showLogs = commands.registerCommand('ballerina.showLogs', () => {
                    outputChannel.show();
                });
                this.context!.subscriptions.push(showLogs);
                debug("[INIT] Show logs command registered successfully");
            } catch (error) {
                debug(`[INIT] Error registering show logs command: ${error}`);
                throw error;
            }

            // Register other commands
            try {
                commands.registerCommand(showMessageInstallBallerinaCommand, () => {
                    this.showMessageInstallBallerina();
                });
                debug("[INIT] Install Ballerina message command registered");

                commands.registerCommand('ballerina.setup-ballerina', () => {
                    debug("[SETUP] Ballerina setup command started");
                    this.installBallerina();
                });
                debug("[INIT] Setup Ballerina command registered");

                commands.registerCommand('ballerina.update-ballerina', () => {
                    this.updateBallerina();
                });
                debug("[INIT] Update Ballerina command registered");

                commands.registerCommand('ballerina.update-ballerina-visually', () => {
                    this.updateBallerinaVisually();
                });
                debug("[INIT] Update Ballerina visually command registered");
            } catch (error) {
                debug(`[INIT] Error registering commands: ${error}`);
                throw error;
            }

            // Register pre init handlers
            try {
                debug("[INIT] Registering pre-initialization handlers...");
                this.registerPreInitHandlers();
                debug("[INIT] Pre-initialization handlers registered successfully");
            } catch (error) {
                debug(`[INIT] Error registering pre-init handlers: ${error}`);
                throw error;
            }

            // Check and configure Ballerina home
            try {
                if (this.overrideBallerinaHome()) {
                    debug("[INIT] Override Ballerina home is enabled");
                    const configuredHome = this.getConfiguredBallerinaHome();
                    if (!configuredHome) {
                        const message = "Trying to get ballerina version without setting ballerina home.";
                        debug(`[INIT] Error: ${message}`);
                        sendTelemetryEvent(this, TM_EVENT_ERROR_INVALID_BAL_HOME_CONFIGURED, CMP_EXTENSION_CORE, getMessageObject(message));
                        throw new AssertionError({
                            message: message
                        });
                    }

                    debug(`[INIT] Configured Ballerina home: ${configuredHome}`);
                    this.ballerinaHome = configuredHome;
                } else {
                    debug("[INIT] Override Ballerina home is disabled, will auto-detect");
                }
            } catch (error) {
                debug(`[INIT] Error configuring Ballerina home: ${error}`);
                throw error;
            }

            debug(`[INIT] Current Ballerina home: ${this.ballerinaHome}`);
            debug(`[INIT] Override Ballerina home setting: ${this.overrideBallerinaHome()}`);
            debug("[INIT] Starting Ballerina version validation...");

            // Validate the ballerina version
            return this.getBallerinaVersion(this.ballerinaHome, this.overrideBallerinaHome()).then(async runtimeVersion => {
                debug("=".repeat(60));
                debug("[INIT] Ballerina version retrieved successfully");

                try {
                    this.ballerinaVersion = runtimeVersion;
                    log(`Plugin version: ${this.getVersion()}`);
                    log(`Ballerina version: ${this.ballerinaVersion}`);
                    debug(`[INIT] Version information logged`);
                } catch (error) {
                    debug(`[INIT] Error logging version information: ${error}`);
                    throw error;
                }

                try {
                    this.biSupported = isSupportedSLVersion(this, createVersionNumber(2201, 12, 3)); // Minimum supported version for BI: 2201.12.3
                    this.isNPSupported = isSupportedSLVersion(this, createVersionNumber(2201, 13, 0)) && this.enabledExperimentalFeatures(); // Minimum supported requirements for NP: 2201.13.0

                    this.isWorkspaceSupported = isSupportedSLVersion(this, createVersionNumber(2201, 13, 0)); // Minimum supported requirements for Workspace: 2201.13.0
                    const workspaceFolders = workspace.workspaceFolders;

                    if (workspaceFolders && workspaceFolders.length === 1) {
                        const isBalWorkspace = await checkIsBallerinaWorkspace(workspaceFolders[0].uri);
                        if (isBalWorkspace && !this.isWorkspaceSupported) {
                            window.showInformationMessage(
                                'Your current ballerina distribution is not supported for workspaces. Please update to version 2201.13.0 or above to use workspaces. You will need to reload VS Code after updating.',
                                'Update'
                            ).then(selection => {
                                if (selection === 'Update') {
                                    commands.executeCommand('ballerina.update-ballerina-visually');
                                }
                            });
                        }
                    }
                    debug(`[INIT] Feature support calculated - BI: ${this.biSupported}, NP: ${this.isNPSupported}, Workspace: ${this.isWorkspaceSupported}`);
                } catch (error) {
                    debug(`[INIT] Error calculating feature support: ${error}`);
                    // Don't throw here, we can continue without these features
                } finally {
                    // Release waiters as soon as the flags are settled — the Create flow gates
                    // its project chooser on this and must not wait for the language server.
                    this.markFeatureSupportResolved();
                }

                try {
                    const { home, isOldBallerinaDist, isBallerinaNotFound } = this.autoDetectBallerinaHome();
                    this.ballerinaHome = home;
                    debug(`[INIT] Auto-detected Ballerina Home: ${this.ballerinaHome}`);
                    debug(`[INIT] Is old Ballerina distribution: ${isOldBallerinaDist}`);
                    debug(`[INIT] Is Ballerina not found: ${isBallerinaNotFound}`);

                    // Check for multiple Ballerina installations in PATH
                    this.checkMultipleBallerinaInstallations();
                } catch (error) {
                    debug(`[INIT] Error auto-detecting Ballerina home: ${error}`);
                    throw error;
                }

                debug(`[INIT] Final Ballerina Home: ${this.ballerinaHome}`);
                debug(`[INIT] Plugin Dev Mode: ${this.overrideBallerinaHome()}`);
                debug(`[INIT] Debug Mode: ${this.enableLSDebug()}`);
                debug(`[INIT] Feature flags - Experimental: ${this.enabledExperimentalFeatures()}, BI: ${this.biSupported}, NP: ${this.isNPSupported}, Workspace: ${this.isWorkspaceSupported}`);

                // Check version compatibility
                try {
                    if (!this.ballerinaVersion.match(SWAN_LAKE_REGEX) || (this.ballerinaVersion.match(SWAN_LAKE_REGEX) &&
                        !isSupportedVersion(this, VERSION.BETA, 3))) {
                        debug(`[INIT] Unsupported Ballerina version detected: ${this.ballerinaVersion}`);
                        this.showMessageOldBallerina();
                        const message = `Ballerina version ${this.ballerinaVersion} is not supported. 
                            The extension supports Ballerina Swan Lake Beta 3+ versions.`;
                        sendTelemetryEvent(this, TM_EVENT_ERROR_OLD_BAL_HOME_DETECTED, CMP_EXTENSION_CORE, getMessageObject(message));
                        debug("[INIT] Returning early due to unsupported version");
                        return;
                    }
                    debug("[INIT] Ballerina version is compatible");
                } catch (error) {
                    debug(`[INIT] Error checking version compatibility: ${error}`);
                    throw error;
                }

                // Set up and start Language Server
                try {
                    debug("[INIT] Setting up Language Server...");
                    let serverOptions: ServerOptions;
                    serverOptions = getServerOptions(this);
                    debug("[INIT] Server options retrieved");

                    this.langClient = new ExtendedLangClient('ballerina-vscode', 'Ballerina LS Client', serverOptions,
                        this.clientOptions, this, false);
                    debug("[INIT] Extended Language Client created");

                    _onBeforeInit(this.langClient);
                    debug("[INIT] Before init callback executed");

                    await this.langClient.start();
                    debug(`[INIT] Language Server started with state: ${this.langClient.state}`);
                } catch (error) {
                    debug(`[INIT] Error setting up/starting Language Server: ${error}`);
                    throw error;
                }

                // Handle server startup results
                try {
                    if (this.langClient.state === LS_STATE.Stopped) {
                        const message = "Couldn't establish language server connection.";
                        debug(`[INIT] Language server failed to start: ${message}`);
                        sendTelemetryEvent(this, TM_EVENT_EXTENSION_INI_FAILED, CMP_EXTENSION_CORE, getMessageObject(message));
                        log(message);
                        this.showPluginActivationError();
                    } else if (this.langClient.state === LS_STATE.Running) {
                        debug("[INIT] Language server is running, registering extended API capabilities");
                        await this.langClient?.registerExtendedAPICapabilities();
                        this.updateStatusBar(this.ballerinaVersion);
                        sendTelemetryEvent(this, TM_EVENT_EXTENSION_INIT, CMP_EXTENSION_CORE);
                        debug("[INIT] Extension initialization completed successfully");
                    }
                } catch (error) {
                    debug(`[INIT] Error handling server startup results: ${error}`);
                    throw error;
                }

                // Register stop command
                try {
                    commands.registerCommand('ballerina.stopLangServer', () => {
                        debug("[INIT] Stop Language Server command executed");
                        this.langClient.stop();
                    });
                    debug("[INIT] Stop Language Server command registered");
                } catch (error) {
                    debug(`[INIT] Error registering stop command: ${error}`);
                    // Don't throw here, this is not critical
                }

                debug("=".repeat(60));
                debug("[INIT] Extension initialization completed successfully");
            }, (reason) => {
                debug(`[INIT] Error getting ballerina version: ${reason.message || reason}`);
                sendTelemetryException(this, reason, CMP_EXTENSION_CORE);
                this.showMessageInstallBallerina();
                throw new Error(reason);
            }).catch(e => {
                debug(`[INIT] Caught error during initialization: ${e.message || e}`);
                const msg = `Error when checking ballerina version. ${e.message}`;
                sendTelemetryException(this, e, CMP_EXTENSION_CORE, getMessageObject(msg));
                this.telemetryReporter?.dispose();
                throw new Error(msg);
            });
        } catch (ex) {
            debug(`[INIT] Fatal error initializing Ballerina Extension: ${ex}`);
            let msg = "Fatal error during extension initialization.";
            if (ex instanceof Error) {
                msg = "Error while activating plugin. " + (ex.message ? ex.message : ex);
                debug(`[INIT] Error details: ${msg}`);
                // If any failure occurs while initializing show an error message
                this.showPluginActivationError();
                sendTelemetryException(this, ex, CMP_EXTENSION_CORE, getMessageObject(msg));
                this.telemetryReporter?.dispose();
            }
            debug(`[INIT] Rejecting promise with: ${msg}`);
            return Promise.reject(msg);
        }
    }

    private getUpdateToolUserAgent(): string {
        debug("[USER_AGENT] Detecting platform for user agent...");

        const platform = os.platform();
        const arch = os.arch();

        debug(`[USER_AGENT] Platform: ${platform}, Architecture: ${arch}`);

        // Log additional environment info for WSL debugging
        if (process.env.WSL_DISTRO_NAME) {
            debug(`[USER_AGENT] WSL environment detected: ${process.env.WSL_DISTRO_NAME}`);
        }

        let userAgent: string | null = null;

        if (platform === 'win32') {
            userAgent = "ballerina/2201.11.0 (win-64) Updater/1.4.5";
            debug("[USER_AGENT] Selected Windows user agent");
        } else if (platform === 'linux') {
            userAgent = "ballerina/2201.11.0 (linux-64) Updater/1.4.5";
            debug("[USER_AGENT] Selected Linux user agent");

            if (process.env.WSL_DISTRO_NAME) {
                debug("[USER_AGENT] Note: Running in WSL environment");
            }
        } else if (platform === 'darwin') {
            if (arch === 'arm64') {
                userAgent = "ballerina/2201.11.0 (macos-arm-64) Updater/1.4.5";
                debug("[USER_AGENT] Selected macOS ARM64 user agent");
            } else {
                userAgent = "ballerina/2201.11.0 (macos-64) Updater/1.4.5";
                debug("[USER_AGENT] Selected macOS x64 user agent");
            }
        } else {
            debug(`[USER_AGENT] Unknown platform: ${platform}, returning null`);
        }

        debug(`[USER_AGENT] Final user agent: ${userAgent}`);
        return userAgent;
    }

    async getLatestBallerinaVersion(): Promise<string> {
        try {
            const latestDistributionVersionResponse = await this.axiosWithRetry({
                method: 'get',
                url: this.updateToolServerUrl + "/distributions/latest?version=2201.0.0&type=patch",
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const latestDistributionVersion = latestDistributionVersionResponse.data.patch;
            debug(`[SETUP] Latest distribution version: ${latestDistributionVersion}`);
            return latestDistributionVersion.toString();
        } catch (error) {
            debug(`[SETUP] Error getting the latest distribution version: ${error}`);
            window.showErrorMessage('Error getting the latest distribution version:', error);
            return null;
        }
    }

    async axiosWithRetry(
        config: AxiosRequestConfig,
        maxRetries: number = 3
    ): Promise<AxiosResponse> {
        let retries = 0;

        while (true) {
            try {
                return await axios(config);
            } catch (error) {
                retries++;

                if (retries > maxRetries) {
                    console.error(`Maximum retries (${maxRetries}) exceeded`);
                    throw error;
                }

                console.log(`Attempt ${retries} failed, retrying...`);

                // Optional: add exponential backoff
                const delay = 1000 * Math.pow(2, retries - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }


    async updateBallerina(restartWindow?: boolean) {
        this.getBallerinaVersion(this.ballerinaHome, false).then(async runtimeVersion => {
            const currentBallerinaVersion = runtimeVersion.split('-')[0];
            console.log('Current Ballerina version:', currentBallerinaVersion);
            const terminal = window.createTerminal('Update Ballerina');
            terminal.show();
            terminal.sendText('bal dist update');
            window.showInformationMessage('Please proceed with the bal command to update the ballerina distribution');
        }, (reason) => {
            console.error('Error getting the ballerina version:', reason.message);
            this.showMessageSetupBallerina(restartWindow);
        });
    }

    async updateBallerinaVisually() {
        try {
            await commands.executeCommand(SHARED_COMMANDS.SETUP_BALLERINA);
        } catch (error) {
            console.warn("[SETUP] Failed to open setup flow", error);
        }
        const realPath = this.ballerinaHome ? fs.realpathSync.native(this.ballerinaHome) : "";
        this.executeCommandWithProgress(realPath.includes("ballerina-home") ? 'bal dist update' : 'sudo bal dist update');
    }

    private async executeCommandWithProgress(command: string) {
        // Check if this is a sudo command (for macOS/Linux) or needs admin rights (Windows)
        const isSudoCommand = command.trim().startsWith('sudo');
        window.showInformationMessage(`Executing: ${command}`);
        if (isSudoCommand) {
            if (isWindows()) {
                // Windows: Use PowerShell with "Run as Administrator"
                return this.executeWindowsAdminCommand(command);
            } else {
                const terminal = window.createTerminal('Update Ballerina');
                terminal.show();
                terminal.sendText(command);
                window.showInformationMessage('Please proceed with the sudo command to update the ballerina distribution');
            }
        } else {
            // Regular non-elevated command
            return this.executeRegularCommand(command);
        }
    }

    // Execute a regular (non-admin) command
    private async executeRegularCommand(command: string): Promise<void> {
        let progressStep = 0;

        // Send initial progress notification
        let res: DownloadProgress = {
            message: `Starting execution of command...`,
            percentage: 0,
            success: false,
            step: progressStep
        };
        this.notifyDownloadProgress(res);

        return new Promise((resolve, reject) => {
            // Use exec for regular commands
            const childProcess = exec(command, { maxBuffer: 1024 * 1024 });
            let percentage = 0;
            childProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log('Command output:', output);

                progressStep++;

                // Extract version and download percentage if present
                const downloadMatch = output.match(/Downloading\s+(\d+\.\d+\.\d+)\s+(\d+)%/);
                const message = downloadMatch ? `Downloading ${downloadMatch[1]}` : `${output.trim()}`;
                // Use the extracted percentage if available, otherwise calculate based on steps
                percentage = downloadMatch && parseInt(downloadMatch[2], 10);

                res = {
                    message: message,
                    percentage: percentage,
                    success: false,
                    step: progressStep
                };
                this.notifyDownloadProgress(res);
            });

            childProcess.stderr.on('data', (data) => {
                const errorOutput = data.toString();
                console.error('Command error:', errorOutput);

                res = {
                    message: `Error: ${errorOutput.trim()}`,
                    percentage: 0,
                    success: false,
                    step: -1
                };
                this.notifyDownloadProgress(res);
            });

            childProcess.on('close', (code) => {
                console.log(`Command exited with code ${code}`);

                res = {
                    message: code === 0 ? 'Command completed successfully' : `Command failed with code ${code}`,
                    percentage: 100,
                    success: code === 0,
                    step: code === 0 ? progressStep + 1 : -1
                };
                this.notifyDownloadProgress(res);

                if (code === 0) {
                    window.showInformationMessage('Command executed successfully');
                    commands.executeCommand('workbench.action.reloadWindow');
                    resolve();
                } else {
                    window.showErrorMessage(`Command failed with exit code ${code}`);
                    reject(new Error(`Command failed with exit code ${code}`));
                }
            });
        });
    }

    // Execute a command with administrator privileges on Windows
    private async executeWindowsAdminCommand(command: string): Promise<void> {
        let progressStep = 0;

        // Remove 'sudo' prefix if present
        const actualCommand = command.replace(/^sudo\s+/, '');

        // Create PowerShell command to run as administrator
        const psCommand = `powershell -Command "Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command \"${actualCommand}\"'"`;

        let res: DownloadProgress = {
            message: `Starting a powershell to update ballerina distribution...`,
            percentage: 0,
            success: false,
            step: progressStep
        };
        this.notifyDownloadProgress(res);

        // Show a message to the user that they'll need to respond to the UAC prompt
        window.showInformationMessage('Please confirm the User Account Control (UAC) prompt to run this command with administrator privileges');
        await new Promise(() => {
            try {
                // Execute the PowerShell command
                const childProcess = exec(psCommand, { maxBuffer: 1024 * 1024 });
                childProcess.stderr.on('data', (data) => {
                    const errorOutput = data.toString();
                    console.error('Command error:', errorOutput);
                    // Check for UAC cancellation
                    if (errorOutput.includes('cancelled by the user') || errorOutput.includes('was canceled')) {
                        const errorMessage = `Administrator privileges were denied. Command cannot be executed.`;
                        throw new Error(errorMessage);
                    }
                });
                childProcess.on('close', async (code) => {
                    // Note: with Windows UAC, the actual admin process is detached, so this code
                    // only confirms the elevation request was successful, not the command itself
                    if (code === 0) {
                        // Check the versions
                        const initialVersion = this.ballerinaVersion;
                        // Get the current version
                        const currentVersion = await this.getBallerinaVersion(this.ballerinaHome, this.overrideBallerinaHome());
                        // If version changed or timeout reached, we're done
                        if (currentVersion !== initialVersion) {
                            console.log(`Update completed. Version changed from ${initialVersion} to ${currentVersion}`);
                            res = {
                                message: `Successfully updated to version: ${currentVersion}`,
                                percentage: 0,
                                success: true,
                                step: -1
                            };
                            this.notifyDownloadProgress(res);
                            setTimeout(() => {
                                commands.executeCommand('workbench.action.reloadWindow');
                            }, 2000);
                        }
                    } else {
                        const errorMessage = `Failed to execute command with administrator privileges. Exit code: ${code}`;
                        throw new Error(errorMessage);
                    }
                });
            } catch (error) {
                const err = error instanceof Error ? error.message : String(error);
                const errorMessage = `Error executing admin command: ${err}`;
                console.error(errorMessage, error);
                throw new Error(errorMessage);
            }
        }).catch((error) => {
            console.error('Error executing Windows admin command:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            res = {
                message: `${errorMessage}`,
                percentage: 0,
                success: false,
                step: -1
            };
            this.notifyDownloadProgress(res);
            window.showErrorMessage(`Error executing admin command: ${errorMessage}`);
        });
    }


    // Install ballerina from the central
    private async installBallerina(restartWindow?: boolean) {
        try {
            let continueInstallation = true;
            // Remove the existing Ballerina version
            fs.rmSync(this.ballerinaInstallationDir, { recursive: true, force: true });
            debug("[SETUP] Removed the existing Ballerina installation directory");

            // Download the latest update tool version
            continueInstallation = await this.downloadUpdateTool();
            debug(`[SETUP] Downloaded Ballerina update tool`);
            if (!continueInstallation) {
                return;
            }
            // Get the latest distribution version
            const latestDistributionVersion = await this.getLatestBallerinaVersion();
            debug(`[SETUP] Latest distribution version: ${latestDistributionVersion}`);
            if (latestDistributionVersion === null) {
                debug(`[SETUP] Error getting the latest distribution version`);
                window.showErrorMessage('Error getting the latest distribution version. Please try again.');
                return;
            }

            // Download the latest distribution zip
            continueInstallation = await this.downloadBallerina(latestDistributionVersion);
            if (!continueInstallation) {
                debug(`[SETUP] Error downloading Ballerina ${latestDistributionVersion}`);
                return;
            }

            let supportedJreVersion;
            try {
                if (this.updateToolServerUrl.includes('staging')) {
                    supportedJreVersion = "jdk-21.0.5+11-jre";
                    debug(`[SETUP] Supported JRE version: ${supportedJreVersion}`);
                } else {
                    // Get supported jre version
                    const distributionsResponse = await this.axiosWithRetry({
                        method: 'get',
                        url: this.updateToolServerUrl + "/distributions",
                        headers: {
                            'User-Agent': this.ballerinaUpdateToolUserAgent,
                            'Content-Type': 'application/json'
                        }
                    });
                    const distributions = distributionsResponse.data.list;
                    debug(`[SETUP] Filtered Distributions: ${distributions.filter((distribution: any) => distribution.version === latestDistributionVersion)}`);
                    console.log('Filtered Distributions:', distributions.filter((distribution: any) => distribution.version === latestDistributionVersion));
                    supportedJreVersion = distributions.filter((distribution: any) => distribution.version === latestDistributionVersion)[0].dependencies[0].name;
                }
            } catch (error) {
                debug(`[SETUP] Error fetching Ballerina dependencies: ${error}`);
                console.error('Error fetching Ballerina dependencies:', error);
                window.showErrorMessage('Error fetching Ballerina dependencies (JRE version). Please try again.');
                return;
            }

            if (supportedJreVersion !== undefined) {
                debug(`[SETUP] Downloading JRE ${supportedJreVersion}`);
                // Download the JRE zip
                continueInstallation = await this.downloadJre(supportedJreVersion);
                debug(`[SETUP] Downloaded JRE ${supportedJreVersion}`);
                if (!continueInstallation) {
                    debug(`[SETUP] Error downloading Ballerina dependencies (JRE). Please try again.`);
                    window.showErrorMessage('Error downloading Ballerina dependencies (JRE). Please try again.');
                    return;
                }

                // Set the Ballerina Home and Command for vscode
                await this.setBallerinaHomeAndCommand();

                // Set the executable permissions
                await this.setExecutablePermissions();

                // Set the Ballerina version in ballerina-version files
                const distributionFilePath = path.join(this.ballerinaInstallationDir, 'distributions', 'ballerina-version');
                const ballerinaUserHomeFilePath = path.join(this.getBallerinaUserHome(), 'ballerina-version');
                fs.writeFileSync(distributionFilePath, `ballerina-${latestDistributionVersion}`);
                fs.writeFileSync(ballerinaUserHomeFilePath, `ballerina-${latestDistributionVersion}`);
                console.log(`Updated ${distributionFilePath} and ${ballerinaUserHomeFilePath} with version: ${latestDistributionVersion}`);
                debug(`[SETUP] Updated ${distributionFilePath} and ${ballerinaUserHomeFilePath} with version: ${latestDistributionVersion}`);
                // Set the Ballerina Home and Command for the user
                this.setBallerinaCommandForUser();
                debug(`[SETUP] Set the Ballerina command path for the user`);

                let res: DownloadProgress = {
                    message: `Success..`,
                    success: true,
                    step: 5 // This is the last step
                };
                this.notifyDownloadProgress(res);
                debug(`[SETUP] Ballerina has been installed successfully`);
                console.log('Ballerina has been installed successfully');
                if (restartWindow) {
                    debug(`[SETUP] Restarting the window`);
                    commands.executeCommand('workbench.action.reloadWindow');
                } else {
                    debug(`[SETUP] Showing information message`);
                    window.showInformationMessage(`Ballerina has been installed successfully. Please restart the window to apply the changes.`);
                }
            }
        } catch (error) {
            debug(`[SETUP] Error downloading or setting up Ballerina: ${error}`);
            console.error('Error downloading or setting up Ballerina:', error);
            window.showErrorMessage('Error downloading or setting up Ballerina. Please restart the window and try again.');
            throw error;
        }
    }

    private async downloadJre(jreVersion: string) {
        let status = false;
        const encodedJreVersion = jreVersion.replace('+', '%2B');
        const jreDownloadUrl = `${this.updateToolServerUrl}/dependencies/${encodedJreVersion}`;
        const ballerinaDependenciesPath = path.join(this.ballerinaInstallationDir, 'dependencies');
        debug(`[SETUP] Downloading Ballerina ${jreVersion}`);
        try {
            // Create destination folder if it doesn't exist
            if (!fs.existsSync(ballerinaDependenciesPath)) {
                debug(`[SETUP] Creating Ballerina dependencies directory`);
                fs.mkdirSync(ballerinaDependenciesPath, { recursive: true });
            }

            // Download the artifact and save it to the user home directory
            let response;
            let res: DownloadProgress = {
                downloadedSize: 0,
                message: "Download starting...",
                percentage: 0,
                success: false,
                totalSize: 0,
                step: 4
            };
            try {
                this.notifyDownloadProgress(res);
                const sizeMB = 1024 * 1024;
                await window.withProgress(
                    {
                        location: ProgressLocation.Notification,
                        title: `Downloading Ballerina dependencies`,
                        cancellable: false,
                    },
                    async (progress) => {
                        let lastPercentageReported = 0;

                        response = await this.axiosWithRetry({
                            url: jreDownloadUrl,
                            method: 'GET',
                            responseType: 'arraybuffer',
                            headers: {
                                'User-Agent': this.ballerinaUpdateToolUserAgent
                            },
                            onDownloadProgress: (progressEvent) => {
                                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                                console.log(`Total Size: ${progressEvent.total / sizeMB}MB`);
                                console.log(`Download progress: ${percentCompleted}%`);

                                if (percentCompleted > lastPercentageReported) {
                                    progress.report({ increment: percentCompleted - lastPercentageReported, message: `${percentCompleted}% of ${Math.round(progressEvent.total / sizeMB)}MB` });
                                    lastPercentageReported = percentCompleted;
                                }

                                // Sizes will be sent as MB
                                res = {
                                    downloadedSize: progressEvent.loaded / sizeMB,
                                    message: "Downloading...",
                                    percentage: percentCompleted,
                                    success: false,
                                    totalSize: progressEvent.total / sizeMB,
                                    step: 4
                                };
                                this.notifyDownloadProgress(res);
                            }
                        });
                        return;
                    }
                );
            } catch (error) {
                // Sizes will be sent as MB
                res = {
                    ...res,
                    message: `Failed: ${error}`,
                    success: false,
                    step: -1 // Error step
                };
                debug(`[SETUP] Error downloading Ballerina dependencies: ${error}`);
                this.notifyDownloadProgress(res);
                console.error('Error downloading Ballerina dependencies:', error);
            }
            console.log('response:', response.data);
            const zipFilePath = path.join(ballerinaDependenciesPath, jreVersion + '.zip');
            fs.writeFileSync(zipFilePath, response.data);
            console.log(`Downloaded Ballerina dependencies to ${ballerinaDependenciesPath}`);
            debug(`[SETUP] Downloaded Ballerina dependencies to ${ballerinaDependenciesPath}`);

            // Setting the Ballerina Home location
            res = {
                ...res,
                message: `Setting the Ballerina dependencies...`,
                success: false,
                step: 4
            };
            this.notifyDownloadProgress(res);
            const zip = new AdmZip(zipFilePath);
            debug(`[SETUP] Extracting Ballerina dependencies to ${ballerinaDependenciesPath}`);
            zip.extractAllTo(ballerinaDependenciesPath, true);

            // Cleanup: Remove the downloaded zip file
            res = {
                ...res,
                message: `Cleaning up the temporary files...`,
                success: false,
                step: 4
            };
            this.notifyDownloadProgress(res);
            fs.rmSync(zipFilePath);
            debug(`[SETUP] Removed the downloaded zip file ${zipFilePath}`);
            console.log('Cleanup complete.');
            status = true;
        } catch (error) {
            debug(`[SETUP] Error downloading Ballerina dependencies: ${error}`);
            console.error('Error downloading Ballerina dependencies:', error);
            window.showErrorMessage('Error downloading Ballerina dependencies:', error);
        }
        return status;
    }

    private async downloadBallerina(distributionVersion: string) {
        let status = false;
        const distributionVersionUrl = `${this.updateToolServerUrl}/distributions/${distributionVersion}`;
        const ballerinaDistributionsPath = path.join(this.ballerinaInstallationDir, 'distributions');
        const distributionZipName = `ballerina-${distributionVersion}.zip`;
        debug(`[SETUP] Downloading Ballerina ${distributionZipName}`);
        try {
            // Create destination folder if it doesn't exist
            if (!fs.existsSync(ballerinaDistributionsPath)) {
                fs.mkdirSync(ballerinaDistributionsPath, { recursive: true });
            }

            // Download the artifact and save it to the user home directory
            let response;
            let res: DownloadProgress = {
                downloadedSize: 0,
                message: "Download starting...",
                percentage: 0,
                success: false,
                totalSize: 0,
                step: 3
            };
            try {
                this.notifyDownloadProgress(res);
                const sizeMB = 1024 * 1024;
                await window.withProgress(
                    {
                        location: ProgressLocation.Notification,
                        title: `Downloading Ballerina ${distributionVersion}`,
                        cancellable: false,
                    },
                    async (progress) => {
                        let lastPercentageReported = 0;

                        response = await this.axiosWithRetry({
                            url: distributionVersionUrl,
                            method: 'GET',
                            responseType: 'arraybuffer',
                            headers: {
                                'User-Agent': this.ballerinaUpdateToolUserAgent
                            },
                            onDownloadProgress: (progressEvent) => {
                                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                                console.log(`Total Size: ${progressEvent.total / sizeMB}MB`);
                                console.log(`Download progress: ${percentCompleted}%`);

                                if (percentCompleted > lastPercentageReported) {
                                    progress.report({ increment: percentCompleted - lastPercentageReported, message: `${percentCompleted}% of ${Math.round(progressEvent.total / sizeMB)}MB` });
                                    lastPercentageReported = percentCompleted;
                                }

                                // Sizes will be sent as MB
                                res = {
                                    downloadedSize: progressEvent.loaded / sizeMB,
                                    message: "Downloading...",
                                    percentage: percentCompleted,
                                    success: false,
                                    totalSize: progressEvent.total / sizeMB,
                                    step: 3
                                };
                                this.notifyDownloadProgress(res);
                            }
                        });
                        return;
                    }
                );
            } catch (error) {
                // Sizes will be sent as MB
                res = {
                    ...res,
                    message: `Failed: ${error}`,
                    success: false,
                    step: -1 // Error step
                };
                debug(`[SETUP] Error downloading Ballerina ${distributionZipName}: ${error}`);
                this.notifyDownloadProgress(res);
                console.error('Error downloading Ballerina:', error);
            }
            const zipFilePath = path.join(ballerinaDistributionsPath, distributionZipName);
            fs.writeFileSync(zipFilePath, response.data);
            debug(`[SETUP] Downloaded Ballerina to ${zipFilePath}`);
            console.log(`Downloaded Ballerina to ${zipFilePath}`);

            // Setting the Ballerina Home location
            res = {
                ...res,
                message: `Setting the Ballerina Home location...`,
                success: false,
                step: 3
            };
            this.notifyDownloadProgress(res);
            const zip = new AdmZip(zipFilePath);
            debug(`[SETUP] Extracting Ballerina ${distributionZipName}`);
            zip.extractAllTo(ballerinaDistributionsPath, true);

            // Cleanup: Remove the downloaded zip file
            res = {
                ...res,
                message: `Cleaning up the temporary files...`,
                success: false,
                step: 3
            };
            this.notifyDownloadProgress(res);
            debug(`[SETUP] Removed the downloaded zip file ${zipFilePath}`);
            fs.rmSync(zipFilePath);
            console.log('Cleanup complete.');
            status = true;
        } catch (error) {
            debug(`[SETUP] Error downloading Ballerina ${distributionZipName}: ${error}`);
            console.error('Error downloading Ballerina:', error);
            window.showErrorMessage('Error downloading Ballerina:', error);
        }
        return status;
    }

    private async downloadUpdateTool() {
        let status = false;
        try {
            let res: DownloadProgress = {
                downloadedSize: 0,
                message: "Fetching Ballerina release details..",
                percentage: 0,
                success: false,
                totalSize: 0,
                step: 1
            };
            this.notifyDownloadProgress(res);
            debug("[SETUP] Fetching Ballerina release details..");
            const latestToolVersionResponse = await this.axiosWithRetry({
                method: 'get',
                url: this.updateToolServerUrl + "/versions/latest",
                headers: {
                    'User-Agent': this.ballerinaUpdateToolUserAgent,
                    'Content-Type': 'application/json'
                }
            });
            const latestToolVersion = latestToolVersionResponse.data.version;
            const latestToolVersionUrl = `${this.updateToolServerUrl}/versions/${latestToolVersion}`;
            const updateToolZipName = `ballerina-command-${latestToolVersion}.zip`;
            debug(`[SETUP] Ballerina update tool version: ${updateToolZipName}`);
            // Create destination folder if it doesn't exist
            if (!fs.existsSync(this.getBallerinaUserHome())) {
                debug("[SETUP] Creating Ballerina user home directory");
                fs.mkdirSync(this.getBallerinaUserHome(), { recursive: true });
            }

            // Download the artifact and save it to the user home directory
            let response;
            res = {
                downloadedSize: 0,
                message: "Download starting...",
                percentage: 0,
                success: false,
                totalSize: 0,
                step: 2
            };
            try {
                this.notifyDownloadProgress(res);
                const sizeMB = 1024 * 1024;
                await window.withProgress(
                    {
                        location: ProgressLocation.Notification,
                        title: `Downloading Ballerina update tool ${latestToolVersion}`,
                        cancellable: false,
                    },
                    async (progress) => {
                        let lastPercentageReported = 0;

                        response = await this.axiosWithRetry({
                            method: 'GET',
                            url: latestToolVersionUrl,
                            responseType: 'arraybuffer',
                            headers: {
                                'User-Agent': this.ballerinaUpdateToolUserAgent,
                                'Content-Type': 'application/json'
                            },
                            onDownloadProgress: (progressEvent) => {
                                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                                console.log(`Total Size: ${progressEvent.total / sizeMB}MB`);
                                console.log(`Download progress: ${percentCompleted}%`);

                                if (percentCompleted > lastPercentageReported) {
                                    progress.report({ increment: percentCompleted - lastPercentageReported, message: `${percentCompleted}% of ${Math.round(progressEvent.total / sizeMB)}MB` });
                                    lastPercentageReported = percentCompleted;
                                }

                                // Sizes will be sent as MB
                                res = {
                                    downloadedSize: progressEvent.loaded / sizeMB,
                                    message: "Downloading...",
                                    percentage: percentCompleted,
                                    success: false,
                                    totalSize: progressEvent.total / sizeMB,
                                    step: 2
                                };
                                this.notifyDownloadProgress(res);
                            }
                        });
                        return;
                    }
                );
            } catch (error) {
                // Sizes will be sent as MB
                res = {
                    ...res,
                    message: `Failed: ${error}`,
                    success: false,
                    step: -1 // Error step
                };
                this.notifyDownloadProgress(res);
                console.error('Error downloading Ballerina update tool:', error);
                debug(`[SETUP] Error downloading Ballerina update tool: ${error}`);
            }
            const zipFilePath = path.join(this.getBallerinaUserHome(), updateToolZipName);
            fs.writeFileSync(zipFilePath, response.data);
            debug(`[SETUP] Downloaded Ballerina update tool to ${zipFilePath}`);
            console.log(`Downloaded Ballerina to ${zipFilePath}`);

            // Setting the Ballerina Home location
            res = {
                ...res,
                message: `Setting the Ballerina Home location...`,
                success: false,
                step: 2
            };
            this.notifyDownloadProgress(res);
            const zip = new AdmZip(zipFilePath);
            debug(`[SETUP] Extracting Ballerina update tool to ${this.getBallerinaUserHome()}`);
            zip.extractAllTo(this.getBallerinaUserHome(), true);
            const tempRootPath = path.join(this.getBallerinaUserHome(), updateToolZipName.replace('.zip', ''));
            fs.renameSync(tempRootPath, this.ballerinaInstallationDir);
            debug(`[SETUP] Renamed Ballerina update tool to ${this.ballerinaInstallationDir}`);

            // Cleanup: Remove the downloaded zip file
            res = {
                ...res,
                message: `Cleaning up the temporary files...`,
                success: false,
                step: 2
            };
            this.notifyDownloadProgress(res);
            fs.rmSync(zipFilePath);
            debug(`[SETUP] Removed the downloaded zip file ${zipFilePath}`);
            console.log('Cleanup complete.');
            status = true;
        } catch (error) {
            debug(`[SETUP] Error downloading Ballerina update tool: ${error}`);
            console.error('Error downloading Ballerina update tool:', error);
            window.showErrorMessage('Error downloading Ballerina update tool');
        }
        return status;
    }

    private setBallerinaCommandForUser() {
        const binFolderPath = path.join(this.getBallerinaHome(), 'bin');
        debug(`[SETUP] Setting the Ballerina command path: ${binFolderPath}`);
        // Update the configuration with the new Ballerina Home
        let res: DownloadProgress = {
            message: `Setting the environment variables for user...`,
            success: false,
            step: 5
        };
        this.notifyDownloadProgress(res);
        const platform = os.platform();
        if (platform === 'win32') {
            const command = `Set-ItemProperty -Path 'HKCU:\\Environment' -Name 'Path' -Value ([System.Environment]::GetEnvironmentVariable('Path', 'User') + ';${binFolderPath}')`;

            exec(`powershell.exe -Command "${command}"`, (error, stdout, stderr) => {
                if (error) {
                    window.showErrorMessage(`Failed to set command path: ${stderr}`);
                } else {
                    console.log(`Ballerina command path set successfully. You may need to restart your terminal for changes to take effect.`);
                }
            });
        } else if (isWSL()) {
            const homeDir = os.homedir();
            const shellPath = process.env.SHELL || '';
            const bashrcPath = path.join(homeDir, '.bashrc');
            const zshrcPath = path.join(homeDir, '.zshrc');
            const profilePath = path.join(homeDir, '.profile');

            // Prefer current shell rc, then fallback to existing rc, then .profile
            let rcPath = path.join(homeDir, shellPath.includes('zsh') ? '.zshrc' : '.bashrc');
            debug(`[SETUP] Prefered shell rc path: ${rcPath}`);
            if (!fs.existsSync(rcPath)) {
                if (fs.existsSync(bashrcPath)) {
                    debug(`[SETUP] Bashrc path: ${bashrcPath}`);
                    rcPath = bashrcPath;
                } else if (fs.existsSync(zshrcPath)) {
                    debug(`[SETUP] Zshrc path: ${zshrcPath}`);
                    rcPath = zshrcPath;
                } else {
                    debug(`[SETUP] Profile path: ${profilePath}`);
                    rcPath = profilePath;
                }
            }

            // Normalize potential Windows path to WSL path
            let binPathForShell = binFolderPath;
            if (binPathForShell.includes('\\')) {
                debug(`[SETUP] Normalizing potential Windows path to WSL path`);
                binPathForShell = binPathForShell.replace(/\\/g, '/');
            }
            if (/^[A-Za-z]:\//.test(binPathForShell)) {
                debug(`[SETUP] Normalizing potential Windows path to WSL path`);
                const driveLetter = binPathForShell.charAt(0).toLowerCase();
                binPathForShell = `/mnt/${driveLetter}${binPathForShell.slice(2)}`;
                debug(`[SETUP] Normalized potential Windows path to WSL path: ${binPathForShell}`);
            }

            const exportLine = `export PATH="${binPathForShell}:$PATH"`;
            debug(`[SETUP] Export line: ${exportLine}`);
            fs.readFile(rcPath, 'utf8', (readErr, data) => {
                if (!readErr && data && (data.includes(binPathForShell) || data.includes(exportLine))) {
                    console.log(`Ballerina command path already present in ${rcPath}.`);
                    debug(`[SETUP] Ballerina command path already present in ${rcPath}.`);
                    return;
                }

                const contentToAppend = `\n# Added by Ballerina VS Code extension\n${exportLine}\n`;
                debug(`[SETUP] Content to append: ${contentToAppend}`);
                fs.appendFile(rcPath, contentToAppend, (err) => {
                    if (err) {
                        debug(`[SETUP] Failed to update shell rc file (${rcPath}): ${err.message}`);
                        window.showErrorMessage(`Failed to update shell rc file (${rcPath}): ${err.message}`);
                    } else {
                        debug(`[SETUP] Ballerina command path set successfully in ${rcPath}. You may need to restart your terminal for changes to take effect.`);
                        console.log(`Ballerina command path set successfully in ${rcPath}. You may need to restart your terminal for changes to take effect.`);
                    }
                });
            });
        } else if (platform === 'darwin') {
            debug(`[SETUP] Setting the Ballerina command path for macOS`);
            const zshrcPath = path.join(os.homedir(), '.zshrc');
            const exportCommand = `\nexport PATH="${binFolderPath}:$PATH"\n`;

            fs.appendFile(zshrcPath, exportCommand, (err) => {
                if (err) {
                    window.showErrorMessage(`Failed to update .zshrc: ${err.message}`);
                } else {
                    console.log(`Ballerina command path set successfully. You may need to restart your terminal for changes to take effect.`);
                }
            });
        } else if (platform === 'linux') {
            debug(`[SETUP] Setting the Ballerina command path for Linux`);
            const bashrcPath = path.join(os.homedir(), '.bashrc');
            const exportCommand = `\nexport PATH="${binFolderPath}:$PATH"\n`;

            fs.appendFile(bashrcPath, exportCommand, (err) => {
                if (err) {
                    window.showErrorMessage(`Failed to update .bashrc: ${err.message}`);
                } else {
                    console.log(`Ballerina command path set successfully. You may need to restart your terminal for changes to take effect.`);
                }
            });
        } else {
            debug(`[SETUP] Running on ${platform}`);
            console.log(`Running on ${platform}`);
        }
    }

    private async setBallerinaHomeAndCommand(isDev?: boolean) {
        debug(`[SETUP] Setting the Ballerina Home and Command`);
        let exeExtension = "";
        if (isWindows()) {
            exeExtension = ".bat";
        } else if (isWSL()) {
            // In WSL, check if we have a Linux installation in the WSL filesystem
            const wslBallerinaPath = process.env.HOME + '/.ballerina';
            if (fs.existsSync(wslBallerinaPath)) {
                const wslInstallationPath = join(wslBallerinaPath, "ballerina-home");
                if (fs.existsSync(wslInstallationPath)) {
                    exeExtension = "";
                    debug("[SETUP] WSL environment detected with Linux Ballerina installation, using no extension");
                }
            } else {
                exeExtension = ".bat";
                debug("[SETUP] WSL environment detected, using .bat extension for Windows executables");
            }
        }

        // Set the Ballerina Home and Command
        this.ballerinaHome = this.ballerinaInstallationDir;
        this.ballerinaCmd = join(this.ballerinaHome, "bin") + sep + "bal" + exeExtension;

        debug(`[SETUP] Ballerina Home: ${this.ballerinaCmd}`);
        // Update the configuration with the new Ballerina Home
        let res: DownloadProgress = {
            message: `Setting the configurable values in vscode...`,
            success: false,
            step: 5
        };
        this.notifyDownloadProgress(res);
        if (isDev) { // Set the vscode configurable values only for dev mode
            debug(`[SETUP] Setting the Ballerina Home: ${this.ballerinaHome}`);
            workspace.getConfiguration().update(BALLERINA_HOME, this.ballerinaHome, ConfigurationTarget.Global);
            workspace.getConfiguration().update(OVERRIDE_BALLERINA_HOME, true, ConfigurationTarget.Global);
        } else { // Turn off the dev mode when using prod installation
            debug(`[SETUP] Setting the Ballerina Home: ${this.ballerinaHome}`);
            workspace.getConfiguration().update(OVERRIDE_BALLERINA_HOME, false, ConfigurationTarget.Global);
        }
    }

    private async setExecutablePermissions() {
        try {
            debug(`[SETUP] Setting the Ballerina distribution permissions...`);
            let res: DownloadProgress = {
                message: `Setting the Ballerina distribution permissions...`,
                success: false,
                step: 5
            };
            this.notifyDownloadProgress(res);

            // Set permissions for the ballerina command
            await fs.promises.chmod(this.getBallerinaCmd(), 0o755);
            debug(`[SETUP] Set the Ballerina command permissions`);

            // Set permissions for lib
            await this.setPermissionsForDirectory(path.join(this.getBallerinaHome(), 'lib'), 0o755);
            debug(`[SETUP] Set the Ballerina lib permissions`);
            // Set permissions for all files in the distributions
            await this.setPermissionsForDirectory(path.join(this.getBallerinaHome(), 'distributions'), 0o755);
            debug(`[SETUP] Set the Ballerina distributions permissions`);
            // Set permissions for all files in the dependencies
            await this.setPermissionsForDirectory(path.join(this.getBallerinaHome(), 'dependencies'), 0o755);
            debug(`[SETUP] Set the Ballerina dependencies permissions`);
            console.log('Command files are now executable.');
        } catch (error) {
            console.error('Failed to set executable permissions:', error);
            debug(`[SETUP] Error setting the Ballerina distribution permissions: ${error}`);
        }
    }

    private async setPermissionsForDirectory(directory: string, permissions: number) {
        const files = fs.readdirSync(directory);
        for (const file of files) {
            const fullPath = path.join(directory, file);
            if (fs.statSync(fullPath).isDirectory()) {
                await this.setPermissionsForDirectory(fullPath, permissions);
            } else {
                await fs.promises.chmod(fullPath, permissions);
            }
        }
    }

    private getUserHomeDirectory(): string {
        debug("[HOME_DIR] Getting user home directory...");

        const homeDir = os.homedir();
        debug(`[HOME_DIR] OS homedir(): ${homeDir}`);

        // Log environment variables for debugging WSL issues
        debug(`[HOME_DIR] Environment variables:`);
        debug(`[HOME_DIR] - HOME: ${process.env.HOME || 'Not set'}`);
        debug(`[HOME_DIR] - USERPROFILE: ${process.env.USERPROFILE || 'Not set'}`);
        debug(`[HOME_DIR] - WSL_DISTRO_NAME: ${process.env.WSL_DISTRO_NAME || 'Not set'}`);

        // Validate the home directory exists
        try {
            const homeStats = fs.statSync(homeDir);
            if (homeStats.isDirectory()) {
                debug(`[HOME_DIR] Home directory is valid and accessible: ${homeDir}`);
            } else {
                debug(`[HOME_DIR] Warning: Home path exists but is not a directory: ${homeDir}`);
            }
        } catch (error) {
            debug(`[HOME_DIR] Warning: Cannot access home directory ${homeDir}: ${error}`);
        }

        return homeDir;
    }

    getBallerinaUserHome(): string {
        return this.ballerinaUserHome;
    }

    showStatusBarItem() {
        debug("[STATUS_BAR] Creating status bar item...");

        try {
            this.sdkVersion = window.createStatusBarItem(StatusBarAlignment.Right, 100);
            debug("[STATUS_BAR] Status bar item created successfully");

            this.updateStatusBar("Detecting");
            debug("[STATUS_BAR] Status bar text set to 'Detecting'");

            this.sdkVersion.command = "ballerina.showLogs";
            debug("[STATUS_BAR] Status bar command set to 'ballerina.showLogs'");

            this.sdkVersion.show();
            debug("[STATUS_BAR] Status bar item shown successfully");

            window.onDidChangeActiveTextEditor((editor) => {
                debug("[STATUS_BAR] Active text editor changed");
                try {
                    this.sdkVersion.text = this.sdkVersion.text.replace(SDK_PREFIX, '');
                    if (!editor) {
                        debug("[STATUS_BAR] No active editor");
                        this.updateStatusBar(this.sdkVersion.text);
                        this.sdkVersion.show();
                    } else if (editor.document.uri.scheme === 'file' && editor.document.languageId === 'ballerina') {
                        debug("[STATUS_BAR] Ballerina file is active");
                        this.sdkVersion.show();
                    } else {
                        debug(`[STATUS_BAR] Non-Ballerina file is active: ${editor.document.languageId}`);
                        this.sdkVersion.hide();
                    }
                } catch (error) {
                    debug(`[STATUS_BAR] Error updating status bar on editor change: ${error}`);
                }
            });

            debug("[STATUS_BAR] Status bar initialization completed successfully");
        } catch (error) {
            debug(`[STATUS_BAR] Error initializing status bar: ${error}`);
            throw error;
        }
    }

    updateStatusBar(text: string) {
        if (!window.activeTextEditor) {
            this.sdkVersion.text = `${SDK_PREFIX}${text}`;
        } else {
            this.sdkVersion.text = text;
        }
    }

    showPluginActivationError(): any {
        // message to display on Unknown errors.
        // ask to enable debug logs.
        // we can ask the user to report the issue.

        // HACK: Remove this for the Ballerina extension. This should handle with Ballerina setup page.
        // this.updateStatusBar("Error");
        // this.sdkVersion.backgroundColor = new ThemeColor("statusBarItem.errorBackground");
        // window.showErrorMessage(UNKNOWN_ERROR);
    }

    registerPreInitHandlers(): any {
        // We need to restart VSCode if we change plugin configurations.
        workspace.onDidChangeConfiguration((params: ConfigurationChangeEvent) => {
            if (params.affectsConfiguration(BALLERINA_HOME)
                || params.affectsConfiguration(OVERRIDE_BALLERINA_HOME)
                || params.affectsConfiguration(ENABLE_ALL_CODELENS)
                || params.affectsConfiguration(ENABLE_DEBUG_LOG)
                || params.affectsConfiguration(ENABLE_BALLERINA_LS_DEBUG)
                || params.affectsConfiguration(ENABLE_EXPERIMENTAL_FEATURES)
                || params.affectsConfiguration(ENABLE_NOTEBOOK_DEBUG)
                || params.affectsConfiguration(ENABLE_LIVE_RELOAD)
                || params.affectsConfiguration(ENABLE_BALLERINA_INTEGRATOR)
                || params.affectsConfiguration(DEFINE_BALLERINA_INTEGRATOR_SCOPE)
                || params.affectsConfiguration(LANG_SERVER_PATH)
                || params.affectsConfiguration(USE_BALLERINA_CLI_LANG_SERVER)
            ) {
                this.showMsgAndRestart(CONFIG_CHANGED);
            }
        });

        languages.setLanguageConfiguration('ballerina', {
            onEnterRules: [
                {
                    beforeText: new RegExp('^\\s*#'),
                    action: {
                        appendText: '# ',
                        indentAction: IndentAction.None,
                    }
                }
            ]
        });
    }

    showMsgAndRestart(msg: string): void {
        const action = 'Restart Now';
        window.showInformationMessage(msg, action).then((selection) => {
            if (action === selection) {
                commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }

    async getBallerinaVersion(ballerinaHome: string, overrideBallerinaHome: boolean): Promise<string> {
        debug("[VERSION] Starting Ballerina version detection...");
        debug(`[VERSION] Input parameters - ballerinaHome: '${ballerinaHome}', overrideBallerinaHome: ${overrideBallerinaHome}`);

        // Use WSO2_INTEGRATOR_BALLERINA_HOME in WSO2 Integrator if set, otherwise fallback to system PATH
        if (process.env.WSO2_INTEGRATOR_RUNTIME && process.env.WSO2_INTEGRATOR_BALLERINA_HOME) {
            debug(`[VERSION] Detected WSO2 Integrator environment with WSO2_INTEGRATOR_BALLERINA_HOME: ${process.env.WSO2_INTEGRATOR_BALLERINA_HOME}`);
            ballerinaHome = process.env.WSO2_INTEGRATOR_BALLERINA_HOME;
            overrideBallerinaHome = true;
        } else {
            try {
                // Initialize with fresh environment
                debug("[VERSION] Syncing environment variables...");
                await this.syncEnvironment();
                debug("[VERSION] Environment sync completed");
            } catch (error) {
                debug(`[VERSION] Warning: Failed to sync environment: ${error}`);
                // Continue anyway, don't fail the whole process
            }
        }

        // Log current environment for debugging
        debug(`[VERSION] Current working directory: ${process.cwd()}`);
        debug(`[VERSION] Current PATH: ${process.env.PATH?.substring(0, 200)}...`);
        debug(`[VERSION] Shell: ${process.env.SHELL || 'Not set'}`);

        // if ballerina home is overridden, use ballerina cmd inside distribution
        // otherwise use wrapper command
        if (ballerinaHome) {
            debug(`[VERSION] Ballerina Home provided: ${ballerinaHome}`);

            // Check if the directory exists
            try {
                const homeStats = fs.statSync(ballerinaHome);
                if (!homeStats.isDirectory()) {
                    throw new Error(`Ballerina home path is not a directory: ${ballerinaHome}`);
                }
                debug(`[VERSION] Ballerina home directory exists and is accessible`);
            } catch (error) {
                debug(`[VERSION] Error accessing Ballerina home directory: ${error}`);
                throw new Error(`Cannot access Ballerina home directory: ${ballerinaHome}. ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            debug("[VERSION] No Ballerina home provided, will use system PATH");
        }

        let distPath = "";
        if (overrideBallerinaHome) {
            try {
                distPath = join(ballerinaHome, "bin") + sep;
                debug(`[VERSION] Using distribution path: ${distPath}`);

                // Check if bin directory exists
                const binPath = join(ballerinaHome, "bin");
                if (!fs.existsSync(binPath)) {
                    throw new Error(`Ballerina bin directory not found: ${binPath}`);
                }
                debug(`[VERSION] Bin directory exists: ${binPath}`);
            } catch (error) {
                debug(`[VERSION] Error setting up distribution path: ${error}`);
                throw error;
            }
        } else if (isWSL()) {
            // In WSL, try to detect Ballerina installation dynamically
            // First try to use 'bal' command to get the home directory
            try {
                const balHomeOutput = execSync('bal home', {
                    encoding: 'utf8',
                    timeout: 10000,
                    env: { ...process.env }
                }).trim();

                if (balHomeOutput) {
                    const wslBinPath = join(balHomeOutput, "bin");
                    if (fs.existsSync(wslBinPath)) {
                        distPath = wslBinPath + sep;
                        debug(`[VERSION] Using WSL Ballerina installation from 'bal home': ${distPath}`);
                    }
                }
            } catch (error) {
                debug(`[VERSION] Failed to get Ballerina home via 'bal home' command: ${error}`);
                // Fallback to checking common installation paths
                const commonPaths = [
                    process.env.HOME + '/.ballerina/ballerina-home',
                    '/usr/lib/ballerina/distributions/ballerina-*',
                ];
                for (const pathPattern of commonPaths) {
                    if (pathPattern.includes('*')) {
                        // Handle glob patterns
                        const matches = glob.sync(pathPattern);
                        for (const match of matches) {
                            const binPath = join(match, "bin");
                            if (fs.existsSync(binPath)) {
                                distPath = binPath + sep;
                                debug(`[VERSION] Using WSL Ballerina installation from glob pattern: ${distPath}`);
                                break;
                            }
                        }
                    } else {
                        const binPath = join(pathPattern, "bin");
                        if (fs.existsSync(binPath)) {
                            distPath = binPath + sep;
                            debug(`[VERSION] Using WSL Ballerina installation from common path: ${distPath}`);
                            break;
                        }
                    }
                    if (distPath) { break; }
                }
            }
        } else if (isWindows() && !ballerinaHome) {
            // On Windows, if syncEnvironment() already merged the User+Machine PATH the
            // 'bal.bat version' call below will just work via PATH lookup (distPath stays
            // empty).  But for restricted environments (where even User
            // PATH is locked, or where VSCode's inherited PATH is still stale), we run a
            // proactive directory search here so that we can use an absolute path instead
            // of relying on PATH resolution.
            const detectedBinPath = findWindowsBallerinaPath();
            if (detectedBinPath) {
                distPath = detectedBinPath;
                debug(`[VERSION] Windows fallback search found Ballerina bin: ${distPath}`);
            }
        }

        let exeExtension = "";
        if (isWindows()) {
            exeExtension = ".bat";
            debug("[VERSION] Windows platform detected, using .bat extension");
        } else if (isWSL()) {
            // In WSL, determine extension based on the detected installation
            if (distPath) {
                // If we found a Linux installation path, use no extension
                exeExtension = "";
                debug("[VERSION] WSL environment detected with Linux Ballerina installation, using no extension");
            } else {
                // Fallback to .bat extension for Windows executables
                exeExtension = ".bat";
                debug("[VERSION] WSL environment detected, using .bat extension for Windows executables");
            }
        } else {
            debug("[VERSION] Non-Windows platform detected, no extension needed");
        }

        // Build the executable path separately so we can quote it for shell execution
        let balExecutablePath = distPath + 'bal' + exeExtension;

        // Handle WSL environment - prefer native Linux installation over Windows .bat files
        if (isWSL()) {
            if (exeExtension === ".bat") {
                // Try to find a native Linux installation first
                try {
                    // Check if 'bal' command is available in PATH
                    execSync('which bal', { encoding: 'utf8', timeout: 5000 });
                    // If we get here, 'bal' is available, use it instead of .bat
                    balExecutablePath = 'bal';
                    debug("[VERSION] WSL detected native 'bal' command, using it instead of .bat file");
                } catch (error) {
                    debug("[VERSION] No native 'bal' command found in WSL, will try .bat file");
                    // If the path contains Windows-style paths, we need to handle them properly
                    if (balExecutablePath.includes('\\') || balExecutablePath.match(/^[A-Za-z]:/)) {
                        debug("[VERSION] WSL detected with Windows path, attempting to convert to WSL path");
                        // Try to convert Windows path to WSL path
                        balExecutablePath = balExecutablePath.replace(/^([A-Za-z]):/, '/mnt/$1').replace(/\\/g, '/').toLowerCase();
                        debug(`[VERSION] Converted Windows path to WSL path: ${balExecutablePath}`);
                    }
                }
            } else {
                // We have a native Linux installation, use it directly
                balExecutablePath = 'bal';
                debug("[VERSION] WSL detected with native Linux installation, using 'bal version'");
            }
        }

        // Quote the executable path to handle spaces in directory names
        let ballerinaCommand = `${quoteShellPath(balExecutablePath)} version`;

        debug(`[VERSION] Executing command: '${ballerinaCommand}'`);

        let ballerinaExecutor = '';
        return new Promise((resolve, reject) => {
            const execOptions = {
                timeout: 30000, // 30 second timeout
                maxBuffer: 1024 * 1024, // 1MB buffer
                env: { ...process.env }, // Use current environment
                cwd: process.env.HOME || process.cwd() // Use current working directory
            };

            debug(`[VERSION] Exec environment PATH: ${execOptions.cwd}...`);
            debug(`[VERSION] Exec options: timeout=${execOptions.timeout}ms, maxBuffer=${execOptions.maxBuffer}, cwd=${execOptions.cwd}`);

            const startTime = Date.now();
            exec(ballerinaCommand, execOptions, (err, stdout, stderr) => {
                const executionTime = Date.now() - startTime;
                debug(`[VERSION] Command execution completed in ${executionTime}ms`);

                if (stdout) {
                    debug(`[VERSION] stdout (${stdout.length} chars): ${stdout.substring(0, 500)}${stdout.length > 500 ? '...' : ''}`);
                }
                if (stderr) {
                    debug(`[VERSION] stderr (${stderr.length} chars): ${stderr.substring(0, 500)}${stderr.length > 500 ? '...' : ''}`);
                }
                if (err) {
                    debug(`[VERSION] Command error: ${err}`);
                    debug(`[VERSION] Error code: ${err.code}`);
                    debug(`[VERSION] Error signal: ${err.signal}`);
                    debug(`[VERSION] Error killed: ${err.killed}`);

                    // Provide more specific error messages for WSL environment
                    let errorMessage = `Failed to execute 'bal version' command: ${err.message}`;

                    if (process.env.WSL_DISTRO_NAME) {
                        errorMessage += `\n[WSL Environment Detected: ${process.env.WSL_DISTRO_NAME}]`;
                        errorMessage += `\nCommon WSL issues: Path case sensitivity, Windows/Linux path mixing, file permissions`;
                        errorMessage += `\nWSL-specific solutions:`;
                        errorMessage += `\n- Ensure Ballerina is installed on Windows and accessible from WSL`;
                        errorMessage += `\n- Check if the Windows PATH is properly accessible in WSL`;
                        errorMessage += `\n- Try running 'wsl.exe bal version' from Windows Command Prompt to test`;
                        errorMessage += `\n- Consider installing Ballerina directly in WSL if Windows installation is not accessible`;
                    }

                    reject(new Error(errorMessage));
                    return;
                }

                // Check for common error patterns in stdout
                if (stdout.length === 0) {
                    debug("[VERSION] Empty stdout received");
                    reject(new Error("Empty response from 'bal version' command"));
                    return;
                }

                if (stdout.startsWith(ERROR)) {
                    debug(`[VERSION] Error response detected: ${stdout}`);
                    reject(new Error(`Ballerina command returned error: ${stdout}`));
                    return;
                }

                if (stdout.includes(NO_SUCH_FILE)) {
                    debug(`[VERSION] 'No such file' error detected`);
                    reject(new Error(`Ballerina executable not found. Output: ${stdout}`));
                    return;
                }

                if (stdout.includes(COMMAND_NOT_FOUND)) {
                    debug(`[VERSION] 'Command not found' error detected`);
                    reject(new Error(`Ballerina command not found in PATH. Output: ${stdout}`));
                    return;
                }

                ballerinaExecutor = 'bal';
                debug(`[VERSION] 'bal' executor is picked up by the plugin.`);

                try {
                    this.ballerinaCmd = (distPath + ballerinaExecutor + exeExtension).trim();
                    debug(`[VERSION] Ballerina command set to: '${this.ballerinaCmd}'`);

                    debug(`[VERSION] Parsing version from output: ${stdout}`);
                    const lines = stdout.split('\n');
                    debug(`[VERSION] Output has ${lines.length} lines`);

                    if (lines.length === 0) {
                        throw new Error("No lines in version output");
                    }

                    const implVersionLine = lines[0];
                    debug(`[VERSION] First line: '${implVersionLine}'`);

                    if (!implVersionLine || implVersionLine.trim().length === 0) {
                        throw new Error("First line of version output is empty");
                    }

                    const replacePrefix = implVersionLine.startsWith("jBallerina")
                        ? /jBallerina /
                        : /Ballerina /;

                    debug(`[VERSION] Using prefix pattern: ${replacePrefix}`);
                    const parsedVersion = implVersionLine.replace(replacePrefix, '').replace(/[\n\t\r]/g, '');
                    debug(`[VERSION] Parsed version: '${parsedVersion}'`);

                    if (!parsedVersion || parsedVersion.trim().length === 0) {
                        throw new Error(`Unable to parse version from: '${implVersionLine}'`);
                    }

                    debug(`[VERSION] Successfully resolved Ballerina version: '${parsedVersion}'`);
                    return resolve(parsedVersion);
                } catch (parseError) {
                    debug(`[VERSION] Error parsing version output: ${parseError}`);
                    reject(new Error(`Failed to parse Ballerina version from output: ${stdout}. Error: ${parseError instanceof Error ? parseError.message : String(parseError)}`));
                    return;
                }
            });
        });
    }

    showMissingBallerinaErrInStatusBar(): any {
        this.updateStatusBar("Not Found");
        this.sdkVersion.backgroundColor = new ThemeColor("statusBarItem.errorBackground");
        this.sdkVersion.command = showMessageInstallBallerinaCommand;
    }

    showMessageInstallBallerina(): any {
        const download: string = 'Download';
        const viewLogs: string = 'View Logs';
        window.showWarningMessage(INSTALL_BALLERINA, download, viewLogs).then((selection) => {
            if (download === selection) {
                commands.executeCommand('vscode.open', Uri.parse(DOWNLOAD_BALLERINA));
            } else if (viewLogs === selection) {
                const balOutput = this.getOutPutChannel();
                if (balOutput) {
                    balOutput.show();
                }
            }

        });
    }

    showMessageUpdateBallerina(): any {
        const update = 'Update';
        window.showWarningMessage(UPDATE_BALLERINA_VERSION, update).then(selection => {
            if (selection === update) {
                const terminal = window.createTerminal('Update Ballerina');
                terminal.show();
                terminal.sendText('bal dist update');
                window.showInformationMessage('Ballerina update started. Please wait...');
            }
        });
    }

    showMessageSetupBallerina(restartWindow?: boolean): any {
        const installBallerina = 'Install Ballerina';
        window.showWarningMessage(INSTALL_BALLERINA, installBallerina).then(selection => {
            if (selection === installBallerina) {
                this.installBallerina(restartWindow);
            }
        });
    }

    showUninstallOldVersion(): void {
        const action = 'Uninstall';
        window.showErrorMessage(OLD_PLUGIN_INSTALLED, action).then(selection => {
            if (selection === action) {
                runCommand('', 'code', BALLERINA_COMMANDS.OTHER, '--uninstall-extension', PREV_EXTENSION_ID);
            }
        });
    }

    showMessageInvalidBallerinaHome(): void {
        const action = 'Open Settings';
        window.showWarningMessage(INVALID_HOME_MSG, action).then((selection) => {
            if (action === selection) {
                commands.executeCommand('workbench.action.openGlobalSettings');
            }
        });
    }

    showMessageOldBallerina(): any {
        const download: string = 'Download';
        window.showWarningMessage(OLD_BALLERINA_VERSION, download).then((selection) => {
            if (download === selection) {
                commands.executeCommand('vscode.open', Uri.parse(DOWNLOAD_BALLERINA));
            }
        });
    }

    showCookieConsentMessage(): any {
        const go: string = 'Go to console';
        window.showInformationMessage(COOKIE_SETTINGS, go).then(async (selection) => {
            const url = process.env.VSCODE_CHOREO_DEPLOY_URI;
            if (go === selection && url) {
                const callbackUri = await env.asExternalUri(Uri.parse(url));
                commands.executeCommand("vscode.open", callbackUri);
            }
        });
    }

    showMessageServerMissingCapability(): any {
        const download: string = 'Download';
        window.showErrorMessage(MISSING_SERVER_CAPABILITY, download).then((selection) => {
            if (download === selection) {
                commands.executeCommand('vscode.open', Uri.parse(DOWNLOAD_BALLERINA));
            }
        });
    }

    showMessageInvalidFile(): any {
        window.showErrorMessage(INVALID_FILE);
    }

    showMessageInvalidProject(): any {
        window.showErrorMessage(INVALID_PROJECT);
    }

    getPersistDiagramStatus(): boolean {
        return this.isPersist;
    }

    /**
     * Get ballerina home path.
     *
     * @returns {string}
     * @memberof BallerinaExtension
     */
    getBallerinaHome(): string {
        return this.ballerinaHome;
    }

    /**
    * Get ballerina executor command.
    *
    * @returns {string}
    * @memberof BallerinaExtension
    */
    getBallerinaCmd(): string {
        return this.ballerinaCmd;
    }

    /**
     * Get ballerina home path configured in preferences.
     *
     * @returns {string}
     * @memberof BallerinaExtension
     */
    getConfiguredBallerinaHome(): string {
        return <string>workspace.getConfiguration().get(BALLERINA_HOME);
    }

    getWebviewContext(): WebviewContext {
        return this.webviewContext;
    }

    setWebviewContext(context: WebviewContext) {
        this.webviewContext = context;
    }

    autoDetectBallerinaHome(): { home: string, isOldBallerinaDist: boolean, isBallerinaNotFound: boolean } {
        debug("[AUTO_DETECT] Starting Ballerina home auto-detection...");

        let balHomeOutput = "",
            isBallerinaNotFound = false,
            isOldBallerinaDist = false;

        try {
            const args = ['home'];
            debug(`[AUTO_DETECT] Executing command with args: ${JSON.stringify(args)}`);
            debug(`[AUTO_DETECT] Using ballerinaCmd: '${this.ballerinaCmd}'`);

            let response;
            const execOptions = {
                shell: false,
                encoding: 'utf8' as const,
                timeout: 15000, // 15 second timeout
                maxBuffer: 1024 * 1024, // 1MB buffer
                env: { ...process.env }
            };

            if (isWindows()) {
                debug("[AUTO_DETECT] Windows platform detected, using cmd.exe to run .bat files");
                // On Windows, use cmd.exe to run .bat files
                execOptions.shell = true;
                response = spawnSync('cmd.exe', ['/c', quoteShellPath(this.ballerinaCmd), ...args], execOptions);
                debug(`[AUTO_DETECT] Windows command executed: cmd.exe /c ${quoteShellPath(this.ballerinaCmd)} ${args.join(' ')}`);
            } else if (isWSL()) {
                debug("[AUTO_DETECT] WSL environment detected");
                // In WSL, try to use native 'bal' command first
                try {
                    // Check if 'bal' command is available in PATH
                    execSync('which bal', { encoding: 'utf8', timeout: 5000 });
                    // If we get here, 'bal' is available, use it
                    response = spawnSync('bal', args, execOptions);
                    debug(`[AUTO_DETECT] WSL using native 'bal' command: bal ${args.join(' ')}`);
                } catch (error) {
                    debug("[AUTO_DETECT] No native 'bal' command found in WSL, trying .bat file");
                    if (this.ballerinaCmd.endsWith('.bat')) {
                        // Fallback to .bat file with shell execution
                        execOptions.shell = true;
                        response = spawnSync(quoteShellPath(this.ballerinaCmd), args, execOptions);
                        debug(`[AUTO_DETECT] WSL command executed: ${quoteShellPath(this.ballerinaCmd)} ${args.join(' ')}`);
                    } else {
                        // Use the configured command
                        response = spawnSync(this.ballerinaCmd, args, execOptions);
                        debug(`[AUTO_DETECT] WSL command executed: ${this.ballerinaCmd} ${args.join(' ')}`);
                    }
                }
            } else {
                debug("[AUTO_DETECT] Non-Windows platform, using spawnSync directly");
                // On other platforms, use spawnSync directly
                response = spawnSync(this.ballerinaCmd, args, execOptions);
                debug(`[AUTO_DETECT] Unix command executed: ${this.ballerinaCmd} ${args.join(' ')}`);
            }

            debug(`[AUTO_DETECT] Command execution completed`);
            debug(`[AUTO_DETECT] Exit code: ${response.status}`);
            debug(`[AUTO_DETECT] Error code: ${response.error?.code}`);
            debug(`[AUTO_DETECT] Signal: ${response.signal}`);
            debug(`[AUTO_DETECT] PID: ${response.pid}`);

            if (response.stdout && response.stdout.length > 0) {
                balHomeOutput = response.stdout.toString().trim();
                debug(`[AUTO_DETECT] stdout (${balHomeOutput.length} chars): '${balHomeOutput}'`);

                // Validate the output path
                if (balHomeOutput) {
                    try {
                        const homeStats = fs.statSync(balHomeOutput);
                        if (homeStats.isDirectory()) {
                            debug(`[AUTO_DETECT] Detected home directory is valid: ${balHomeOutput}`);
                        } else {
                            debug(`[AUTO_DETECT] Warning: Detected path is not a directory: ${balHomeOutput}`);
                        }
                    } catch (pathError) {
                        debug(`[AUTO_DETECT] Warning: Cannot access detected path ${balHomeOutput}: ${pathError}`);
                    }
                }
            } else {
                debug("[AUTO_DETECT] No stdout received");
            }

            if (response.stderr && response.stderr.length > 0) {
                let message = response.stderr.toString();
                debug(`[AUTO_DETECT] stderr (${message.length} chars): '${message}'`);

                // Check for specific error patterns
                const unknownCommandPattern = "bal: unknown command 'home'";
                const commandNotFoundPatterns = [
                    'command not found',
                    'unknown command',
                    'is not recognized as an internal or external command'
                ];

                if (message.includes(unknownCommandPattern)) {
                    debug("[AUTO_DETECT] Detected old Ballerina distribution (unknown home command)");
                    isOldBallerinaDist = true;
                } else if (commandNotFoundPatterns.some(pattern => message.includes(pattern))) {
                    debug("[AUTO_DETECT] Detected Ballerina not found");
                    isBallerinaNotFound = true;
                }

                // Special handling for WSL environments
                if (process.env.WSL_DISTRO_NAME) {
                    debug(`[AUTO_DETECT] WSL environment detected: ${process.env.WSL_DISTRO_NAME}`);
                    if (message.includes('Permission denied') || message.includes('EACCES')) {
                        debug("[AUTO_DETECT] WSL permission issue detected");
                        message += `\n[WSL] Try running with proper permissions or check file system mount options`;
                    }
                }

                log(`[AUTO_DETECT] Error executing 'bal home'.\n<---- cmd output ---->\n${message}<---- cmd output ---->\n`);
            } else {
                debug("[AUTO_DETECT] No stderr received");
            }

            // Handle command execution errors
            if (response.error) {
                debug(`[AUTO_DETECT] Spawn error occurred: ${response.error}`);
                if (response.error.code === 'ENOENT') {
                    debug("[AUTO_DETECT] Command not found (ENOENT)");
                    isBallerinaNotFound = true;
                } else if (response.error.code === 'EACCES') {
                    debug("[AUTO_DETECT] Permission denied (EACCES)");
                    isBallerinaNotFound = true;
                } else if (response.error.code === 'ETIMEDOUT') {
                    debug("[AUTO_DETECT] Command timed out");
                    // Don't mark as not found, might be a temporary issue
                }
            }

            // Special handling for Windows when no output is received
            if (balHomeOutput === "" && isWindows() && !response.error) {
                debug("[AUTO_DETECT] Windows special case: no output received, assuming old Ballerina distribution");
                isOldBallerinaDist = true;
            }

        } catch (er) {
            debug(`[AUTO_DETECT] Exception caught during execution: ${er}`);
            if (er instanceof Error) {
                const { message, code, errno } = er as any;
                debug(`[AUTO_DETECT] Exception details - message: ${message}, code: ${code}, errno: ${errno}`);

                // Check for specific error patterns in exception
                const unknownCommandPattern = "bal: unknown command 'home'";
                const commandNotFoundPatterns = [
                    'command not found',
                    'unknown command',
                    'is not recognized as an internal or external command'
                ];

                if (message.includes(unknownCommandPattern)) {
                    debug("[AUTO_DETECT] Exception indicates old Ballerina distribution");
                    isOldBallerinaDist = true;
                } else if (commandNotFoundPatterns.some(pattern => message.includes(pattern))) {
                    debug("[AUTO_DETECT] Exception indicates Ballerina not found");
                    isBallerinaNotFound = true;
                } else if (code === 'ENOENT') {
                    debug("[AUTO_DETECT] Exception ENOENT - command not found");
                    isBallerinaNotFound = true;
                } else if (code === 'EACCES') {
                    debug("[AUTO_DETECT] Exception EACCES - permission denied");
                    isBallerinaNotFound = true;
                }

                log(`[AUTO_DETECT] Error executing 'bal home'.\n<---- cmd output ---->\n${message}<---- cmd output ---->\n`);
            }
        }

        const result = {
            home: isBallerinaNotFound || isOldBallerinaDist ? '' : balHomeOutput,
            isBallerinaNotFound,
            isOldBallerinaDist
        };

        debug(`[AUTO_DETECT] Auto-detection completed:`);
        debug(`[AUTO_DETECT] - home: '${result.home}'`);
        debug(`[AUTO_DETECT] - isBallerinaNotFound: ${result.isBallerinaNotFound}`);
        debug(`[AUTO_DETECT] - isOldBallerinaDist: ${result.isOldBallerinaDist}`);

        return result;
    }

    /**
     * Check if multiple Ballerina installations exist in the system PATH.
     * Logs a warning if different installations are detected, as this can cause
     * unpredictable behavior when different versions are used for different actions.
     */
    private checkMultipleBallerinaInstallations(): void {
        debug("[MULTI_BAL_CHECK] Checking for multiple Ballerina installations in PATH...");

        if (isInWI()) {
            debug("[MULTI_BAL_CHECK] Skipping multiple installation warning in WSO2 Integrator environment");
            return;
        }

        const MULTIPLE_INSTALLATIONS_WARNING = 'Multiple Ballerina installations detected. This may cause unpredictable behavior.';
        const RESOLUTION_ADVICE = 'Consider removing duplicate installations or adjusting your PATH to avoid version conflicts.';

        try {
            let ballerinaPathsOutput = '';
            const execOptions = {
                encoding: 'utf8' as const,
                timeout: 10000,
                env: { ...process.env },
                shell: isWindows() ? undefined : '/bin/sh'
            };

            const command = isWindows()
                ? 'where bal'
                : 'which -a bal 2>/dev/null || command -v bal 2>/dev/null || type -ap bal 2>/dev/null';

            try {
                ballerinaPathsOutput = execSync(command, execOptions).toString();
                debug(`[MULTI_BAL_CHECK] '${command}' output: ${ballerinaPathsOutput}`);
            } catch (error) {
                debug(`[MULTI_BAL_CHECK] Command to find bal executables failed: ${error}`);
                return;
            }

            // Parse the output to get unique paths
            const paths = ballerinaPathsOutput
                .split(/\r?\n/)
                .map(p => p.trim())
                .filter(p => p.length > 0);

            debug(`[MULTI_BAL_CHECK] Found ${paths.length} Ballerina path(s): ${JSON.stringify(paths)}`);

            if (paths.length >= 2) {
                // Get unique parent directories to identify different installations
                const installationDirs = new Set<string>();
                for (const balPath of paths) {
                    installationDirs.add(path.dirname(path.resolve(balPath)));
                }

                if (installationDirs.size >= 2) {
                    const pathsList = Array.from(installationDirs).map((p, i) => `${i + 1}. ${p}`);

                    // Log warnings
                    log(`[WARNING] ${MULTIPLE_INSTALLATIONS_WARNING}`);
                    log(`[WARNING] Detected Ballerina paths:`);
                    pathsList.forEach(p => log(`[WARNING] ${p}`));
                    log(`[WARNING] ${RESOLUTION_ADVICE}`);

                    // Show popup notification to user
                    const viewDetails = 'View Details';
                    window.showWarningMessage(MULTIPLE_INSTALLATIONS_WARNING, viewDetails).then((selection) => {
                        if (selection === viewDetails) {
                            const detailMessage = `Detected Ballerina installations:\n${pathsList.join('\n')}\n\n${RESOLUTION_ADVICE}`;
                            window.showWarningMessage(detailMessage, { modal: true });
                        }
                    });
                } else {
                    debug(`[MULTI_BAL_CHECK] Multiple paths found but they point to the same installation directory`);
                }
            } else if (paths.length === 1) {
                debug(`[MULTI_BAL_CHECK] Single Ballerina installation found: ${paths[0]}`);
            } else {
                debug(`[MULTI_BAL_CHECK] No Ballerina paths found in PATH`);
            }
        } catch (error) {
            // No need to throw. This is a non-critical check.
            debug(`[MULTI_BAL_CHECK] Error checking for multiple installations: ${error}`);
        }
    }

    public overrideBallerinaHome(): boolean {
        return <boolean>workspace.getConfiguration().get(OVERRIDE_BALLERINA_HOME);
    }

    public getID(): string {
        return this.extension.id;
    }

    public getVersion(): string {
        return this.extension.packageJSON.version;
    }

    public getOutPutChannel(): OutputChannel | undefined {
        return getOutputChannel();
    }

    public isTelemetryEnabled(): boolean {
        return <boolean>workspace.getConfiguration().get(ENABLE_TELEMETRY);
    }

    public isAllCodeLensEnabled(): boolean {
        return <boolean>workspace.getConfiguration().get(ENABLE_ALL_CODELENS);
    }

    public isCodeServerEnv(): boolean {
        return process.env.CODE_SERVER_ENV === 'true';
    }

    public enableLSDebug(): boolean {
        return <boolean>workspace.getConfiguration().get(ENABLE_BALLERINA_LS_DEBUG);
    }

    public enabledLiveReload(): boolean {
        return isSupportedSLVersion(this, createVersionNumber(2201, 10, 0)) && workspace.getConfiguration().get(ENABLE_LIVE_RELOAD);
    }

    public enabledPerformanceForecasting(): boolean {
        return <boolean>workspace.getConfiguration().get(ENABLE_PERFORMANCE_FORECAST);
    }

    public enabledExperimentalFeatures(): boolean {
        return <boolean>workspace.getConfiguration().get(ENABLE_EXPERIMENTAL_FEATURES);
    }

    public enabledNotebookDebugMode(): boolean {
        return <boolean>workspace.getConfiguration().get(ENABLE_NOTEBOOK_DEBUG);
    }

    public enabledRunFast(): boolean {
        return <boolean>workspace.getConfiguration().get(ENABLE_RUN_FAST);
    }

    public enabledAdditionalTriggerSearch(): boolean {
        return <boolean>workspace.getConfiguration().get(ENABLE_ADDITIONAL_TRIGGER_SEARCH);
    }

    public getFileDownloadPath(): string {
        return <string>workspace.getConfiguration().get(FILE_DOWNLOAD_PATH);
    }

    public getConfiguredLangServerPath(): string {
        return <string>workspace.getConfiguration().get(LANG_SERVER_PATH);
    }

    public useDistributionLanguageServer(): boolean {
        return <boolean>workspace.getConfiguration().get(USE_BALLERINA_CLI_LANG_SERVER);
    }

    public async updatePerformanceForecastSetting(status: boolean) {
        await workspace.getConfiguration().update(ENABLE_PERFORMANCE_FORECAST, status);
    }

    public enableSequenceDiagramView(): boolean {
        return <boolean>workspace.getConfiguration().get(ENABLE_SEQUENCE_DIAGRAM_VIEW);
    }

    public enableAiSuggestions(): boolean {
        return <boolean>workspace.getConfiguration().get(ENABLE_AI_SUGGESTIONS);
    }

    public showLibraryConfigVariables(): boolean {
        return <boolean>workspace.getConfiguration().get(SHOW_LIBRARY_CONFIG_VARIABLES);
    }

    public getShowAdvancedAiNodes(): boolean {
        return <boolean>workspace.getConfiguration().get(SHOW_ADVANCED_AI_NODES);
    }

    public getDocumentContext(): DocumentContext {
        return this.documentContext;
    }

    public setDiagramActiveContext(value: boolean) {
        commands.executeCommand('setContext', 'isBallerinaDiagram', value);
        this.documentContext.setActiveDiagram(value);
    }

    public setPersistStatusContext(textEditor: TextEditor) {
        if (textEditor?.document) {
            const fileUri: Uri = textEditor.document.uri;
            checkIsPersistModelFile(fileUri).then(isPersistModelFile => {
                this.isPersist = isPersistModelFile;
                commands.executeCommand('setContext', 'isPersistModelActive', isPersistModelFile);
            });
            return;
        }
        commands.executeCommand('setContext', 'isPersistModelActive', false);
    }

    public setChoreoAuthEnabled(value: boolean) {
        commands.executeCommand('setContext', 'isChoreoAuthEnabled', value);
    }
    public getChoreoSession(): ChoreoSession {
        return {
            loginStatus: false
        };
    }

    public getCodeServerContext(): CodeServerContext {
        return this.codeServerContext;
    }

    public getPerformanceForecastContext(): PerformanceForecastContext {
        return this.perfForecastContext;
    }

    public setPerformanceForecastContext(context: PerformanceForecastContext) {
        this.perfForecastContext = context;
    }

    public setBallerinaConfigPath(path: string) {
        this.ballerinaConfigPath = path;
    }

    public getBallerinaConfigPath(): string {
        return this.ballerinaConfigPath;
    }

    public setNotebookVariableViewEnabled(value: boolean) {
        commands.executeCommand('setContext', 'isNotebookVariableViewEnabled', value);
    }

    public setNotebookDebugModeEnabled(value: boolean) {
        commands.executeCommand('setContext', 'isNotebookDebugModeEnabled', value);
    }

    public getIsOpenedOnce(): boolean {
        return this.isOpenedOnce;
    }

    public setIsOpenedOnce(state: boolean) {
        this.isOpenedOnce = state;
    }


    /**
     * Sends a download-progress notification to the webview via RPC and also fires
     * the VSCode-style event so that other extensions (e.g. WI) can subscribe.
     */
    public notifyDownloadProgress(res: DownloadProgress): void {
        RPCLayer._messenger.sendNotification(onDownloadProgress, { type: 'webview', webviewType: VisualizerWebview.viewType }, res);
        this._downloadProgressEmitter.fire(res);
        if (this._wiCommandAvailable !== false) {
            commands.executeCommand('wso2.integrator.onDownloadProgress', res).then(
                () => { this._wiCommandAvailable = true; },
                () => { this._wiCommandAvailable = false; }
            );
        }
    }

    /**
     * Synchronize process environment with the latest shell environment
     * This is especially important after Ballerina installation when PATH has been updated
     */
    private async syncEnvironment(): Promise<void> {
        debug("[SYNC_ENV] Starting environment synchronization...");
        try {
            const freshEnv = await getShellEnvironment();
            debug('[SYNC_ENV] Syncing process environment with shell environment');
            updateProcessEnv(freshEnv);
            debug('[SYNC_ENV] Environment synchronization completed successfully');
        } catch (error) {
            debug(`[SYNC_ENV] Failed to sync environment: ${error}`);
            // Log more details about the error
            if (error instanceof Error) {
                debug(`[SYNC_ENV] Error name: ${error.name}`);
                debug(`[SYNC_ENV] Error message: ${error.message}`);
                debug(`[SYNC_ENV] Error stack: ${error.stack}`);
            }
            // Don't throw the error, as this is not critical for basic functionality
        }
    }
}

/**
 * Class keeps data related to text and diagram document changes.
 */
class DocumentContext {
    private diagramTreeElementClickedCallbacks: Array<(construct: ConstructIdentifier) => void> = [];
    private editorChangesCallbacks: Array<(change: Change) => void> = [];
    private latestDocument: Uri | undefined;
    private activeDiagram: boolean = false;
    private ballerinProject: BallerinaProject;

    public diagramTreeElementClicked(construct: ConstructIdentifier): void {
        this.diagramTreeElementClickedCallbacks.forEach((callback) => {
            callback(construct);
        });
    }

    public onDiagramTreeElementClicked(callback: (construct: ConstructIdentifier) => void) {
        this.diagramTreeElementClickedCallbacks.push(callback);
    }

    public onEditorChanged(callback: (change: Change) => void) {
        this.editorChangesCallbacks.push(callback);
    }

    public didEditorChange(change: Change): void {
        this.editorChangesCallbacks.forEach((callback) => {
            callback(change);
        });
    }

    public setLatestDocument(uri: Uri | undefined) {
        if (uri && (uri.scheme !== 'file' || uri.fsPath.split(sep).pop()?.split(".").pop() !== "bal")) {
            return;
        }
        this.latestDocument = uri;
    }

    public setCurrentProject(ballerinProject: BallerinaProject) {
        commands.executeCommand('setContext', 'isBallerinaProject', true);
        this.ballerinProject = ballerinProject;
    }

    public getCurrentProject(): BallerinaProject {
        return this.ballerinProject;
    }

    public getLatestDocument(): Uri | undefined {
        return this.latestDocument;
    }

    public isActiveDiagram(): boolean {
        return this.activeDiagram;
    }

    public setActiveDiagram(isActiveDiagram: boolean) {
        this.activeDiagram = isActiveDiagram;
    }
}

/**
 * Telemetry tracker keeps track of the events, and
 * it is used to send telemetry events in batches.
 */
export class TelemetryTracker {
    private textEditCount: number;
    private diagramEditCount: number;

    constructor() {
        this.diagramEditCount = 0;
        this.textEditCount = 0;
    }

    public reset() {
        this.textEditCount = 0;
        this.diagramEditCount = 0;
    }

    public hasTextEdits(): boolean {
        return this.textEditCount > 0;
    }

    public hasDiagramEdits(): boolean {
        return this.diagramEditCount > 0;
    }

    public incrementTextEditCount() {
        this.textEditCount++;
    }

    public incrementDiagramEditCount() {
        this.diagramEditCount++;
    }
}

function updateProcessEnv(newEnv: NodeJS.ProcessEnv): void {
    debug("[UPDATE_ENV] Starting process environment update...");
    debug(`[UPDATE_ENV] Received ${Object.keys(newEnv).length} environment variables`);

    const originalPath = isWindows() ? process.env.Path : process.env.PATH;
    debug(`[UPDATE_ENV] Original PATH length: ${originalPath?.length || 0} chars`);

    // Update PATH/Path specially to preserve existing values that might not be in shell env
    if (isWindows() && newEnv.Path) {
        debug(`[UPDATE_ENV] Updating Windows Path (${newEnv.Path.length} chars)`);
        process.env.Path = newEnv.Path;
    } else if (newEnv.PATH) {
        debug(`[UPDATE_ENV] Updating Unix PATH (${newEnv.PATH.length} chars)`);
        process.env.PATH = newEnv.PATH;
    } else {
        debug("[UPDATE_ENV] No PATH variable found in new environment");
    }

    // Update other environment variables
    let updatedCount = 0;
    let skippedCount = 0;

    for (const key in newEnv) {
        // Skip PATH as we've already handled it, and skip some internal variables
        if (key !== 'PATH' && key !== 'Path' && !key.startsWith('npm_') && !key.startsWith('_')) {
            const oldValue = process.env[key];
            const newValue = newEnv[key];

            if (oldValue !== newValue) {
                process.env[key] = newValue;
                updatedCount++;

                // Log important variable changes
                if (['HOME', 'USERPROFILE', 'WSL_DISTRO_NAME', 'JAVA_HOME'].includes(key)) {
                    debug(`[UPDATE_ENV] Updated ${key}: ${oldValue || '(unset)'} -> ${newValue || '(unset)'}`);
                }
            }
        } else {
            skippedCount++;
        }
    }

    const finalPath = isWindows() ? process.env.Path : process.env.PATH;
    debug(`[UPDATE_ENV] Final PATH length: ${finalPath?.length || 0} chars`);
    debug(`[UPDATE_ENV] Updated ${updatedCount} variables, skipped ${skippedCount} variables`);
    debug("[UPDATE_ENV] Process environment update completed");
}

/**
 * Searches for the Ballerina bin directory on Windows using two strategies:
 *   1. Read the User-scope and Machine-scope PATH entries from the registry and look
 *      for a directory that contains bal.bat.
 *   2. Check well-known installation directories (LOCALAPPDATA, ProgramFiles, etc.).
 *
 * Returns the bin directory path (with trailing separator) or an empty string when
 * nothing is found. This is used as a last-resort fallback for environments where the
 * process PATH was not updated (e.g. company laptops with restricted System PATH, or
 * VS Code opened before the installer ran).
 */
function findWindowsBallerinaPath(): string {
    debug('[WIN_BAL_FIND] Searching for Ballerina installation on Windows...');

    // --- Strategy 1: scan PATH entries from User + Machine registry scopes ---
    try {
        const psCommand =
            '[Environment]::GetEnvironmentVariable(\'Path\',\'Machine\') + \';\' + ' +
            '[Environment]::GetEnvironmentVariable(\'Path\',\'User\')';
        const rawPaths = execSync(
            `powershell.exe -NoProfile -Command "${psCommand}"`,
            { encoding: 'utf8', timeout: 10000 }
        ).trim();

        debug(`[WIN_BAL_FIND] Registry PATH (Machine+User) length: ${rawPaths.length} chars`);

        const pathEntries = rawPaths.split(';').map(p => p.trim()).filter(Boolean);
        for (const entry of pathEntries) {
            const candidate = path.join(entry, 'bal.bat');
            if (fs.existsSync(candidate)) {
                debug(`[WIN_BAL_FIND] Found bal.bat in registry PATH entry: ${entry}`);
                return entry + path.sep;
            }
        }
        debug('[WIN_BAL_FIND] bal.bat not found in registry PATH entries');
    } catch (err) {
        debug(`[WIN_BAL_FIND] Failed to read registry PATH: ${err}`);
    }

    // --- Strategy 2: check well-known Ballerina installation directories ---
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const searchRoots = [
        localAppData ? path.join(localAppData, 'Programs', 'Ballerina') : '',
        path.join(programFiles, 'Ballerina'),
        path.join(programFilesX86, 'Ballerina'),
        'C:\\Ballerina',
    ].filter(Boolean);

    for (const root of searchRoots) {
        const directBin = path.join(root, 'bin');
        if (fs.existsSync(path.join(directBin, 'bal.bat'))) {
            debug(`[WIN_BAL_FIND] Found bal.bat in common directory: ${directBin}`);
            return directBin + path.sep;
        }
        // Handle versioned subdirectory layout, e.g. Ballerina\ballerina-2.x.x\bin
        try {
            const children = fs.readdirSync(root);
            for (const child of children) {
                const versionedBin = path.join(root, child, 'bin');
                if (fs.existsSync(path.join(versionedBin, 'bal.bat'))) {
                    debug(`[WIN_BAL_FIND] Found bal.bat in versioned directory: ${versionedBin}`);
                    return versionedBin + path.sep;
                }
            }
        } catch (err) {
            // Directory doesn't exist or isn't readable — skip
            debug(`[WIN_BAL_FIND] Failed to read directory "${root}" for versioned Ballerina installations: ${err}`);
        }
    }

    debug('[WIN_BAL_FIND] Ballerina installation not found via fallback search');
    return '';
}

function getShellEnvironment(): Promise<NodeJS.ProcessEnv> {
    return new Promise((resolve, reject) => {
        debug('[SHELL_ENV] Starting shell environment retrieval...');

        let command = '';
        const isWindowsPlatform = isWindows();

        if (isWindowsPlatform) {
            debug('[SHELL_ENV] Windows platform detected');
            // Windows: read from registry (Machine + User scopes) so that paths added by
            // a fresh Ballerina install (which goes to the User PATH registry key) are
            // picked up even when VS Code's process was launched before the installation.
            // We start with the current Process environment so that VS Code-internal
            // variables are preserved, but we override Path with the merged registry value.
            command = 'powershell.exe -NoProfile -Command "' +
                '$e=[Environment]::GetEnvironmentVariables(\'Process\');' +
                '$mp=[Environment]::GetEnvironmentVariable(\'Path\',\'Machine\');' +
                '$up=[Environment]::GetEnvironmentVariable(\'Path\',\'User\');' +
                'if($mp -and $up){$e[\'Path\']=$mp+\';\'+$up}' +
                'elseif($mp){$e[\'Path\']=$mp}' +
                'elseif($up){$e[\'Path\']=$up};' +
                '$e | ConvertTo-Json"';
            debug(`[SHELL_ENV] Windows command: ${command}`);
        } else if (isWSL()) {
            debug("[SHELL_ENV] Windows WSL platform, using non-interactive shell");
            // WSL: Use non-interactive shell to avoid job control issues
            const shell = process.env.SHELL || '/bin/bash';
            if (shell.includes('zsh')) {
                // For zsh in WSL, source profile and get environment without interactive mode
                command = 'zsh -c "test -f ~/.zshrc && source ~/.zshrc > /dev/null 2>&1; env"';
                debug(`[SHELL_ENV] Windows zsh in WSL: ${command}`);
            } else {
                // For bash in WSL, source profile and get environment without interactive mode
                command = 'bash -c "test -f ~/.bashrc && source ~/.bashrc > /dev/null 2>&1; env"';
                debug(`[SHELL_ENV] Windows bash in WSL: ${command}`);
            }
        } else {
            debug('[SHELL_ENV] Unix-like platform detected');
            // Unix-like systems: source profile files and print environment
            const shell = process.env.SHELL || '/bin/bash';
            debug(`[SHELL_ENV] Detected shell: ${shell}`);

            if (shell.includes('zsh')) {
                command = 'zsh -i -c "source ~/.zshrc > /dev/null 2>&1; env"';
                debug('[SHELL_ENV] Using zsh command');
            } else {
                command = 'bash -i -c "source ~/.bashrc > /dev/null 2>&1; env"';
                debug('[SHELL_ENV] Using bash command');
            }
            debug(`[SHELL_ENV] Unix command: ${command}`);
        }

        const execOptions = {
            timeout: 10000, // 10 second timeout
            maxBuffer: 2 * 1024 * 1024, // 2MB buffer for environment
            env: { ...process.env }
        };

        debug(`[SHELL_ENV] Exec options: timeout=${execOptions.timeout}ms, maxBuffer=${execOptions.maxBuffer}`);

        const startTime = Date.now();
        exec(command, execOptions, (error, stdout, stderr) => {
            const executionTime = Date.now() - startTime;
            debug(`[SHELL_ENV] Command execution completed in ${executionTime}ms`);

            if (error) {
                debug(`[SHELL_ENV] Error getting shell environment: ${error.message}`);
                debug(`[SHELL_ENV] Error code: ${(error as any).code}`);
                debug(`[SHELL_ENV] Error signal: ${(error as any).signal}`);

                // Provide WSL-specific debugging information
                if (process.env.WSL_DISTRO_NAME) {
                    debug(`[SHELL_ENV] WSL environment detected: ${process.env.WSL_DISTRO_NAME}`);
                    debug(`[SHELL_ENV] WSL may have issues with shell initialization`);
                }

                return reject(error);
            }

            if (stderr && stderr.trim().length > 0) {
                debug(`[SHELL_ENV] Warning - stderr output (${stderr.length} chars): ${stderr.substring(0, 200)}${stderr.length > 200 ? '...' : ''}`);
            }

            const env = { ...process.env }; // Start with current env
            debug(`[SHELL_ENV] Starting with ${Object.keys(env).length} existing environment variables`);

            try {
                if (isWindowsPlatform) {
                    debug('[SHELL_ENV] Parsing Windows PowerShell JSON output...');
                    // Parse PowerShell JSON output
                    const envVars = JSON.parse(stdout);
                    const parsedVarCount = Object.keys(envVars).length;
                    debug(`[SHELL_ENV] Parsed ${parsedVarCount} environment variables from PowerShell`);

                    Object.keys(envVars).forEach(key => {
                        const value = envVars[key].toString();
                        env[key] = value;

                        // Log important environment variables
                        if (['PATH', 'Path', 'HOME', 'USERPROFILE', 'WSL_DISTRO_NAME'].includes(key)) {
                            debug(`[SHELL_ENV] Important var ${key}: ${value.length > 100 ? value.substring(0, 100) + '...' : value}`);
                        }
                    });
                } else {
                    debug('[SHELL_ENV] Parsing Unix env output...');
                    // Parse Unix env output (KEY=value format)
                    const lines = stdout.split('\n');
                    let parsedCount = 0;

                    lines.forEach(line => {
                        const match = line.match(/^([^=]+)=(.*)$/);
                        if (match) {
                            const [, key, value] = match;
                            env[key] = value;
                            parsedCount++;

                            // Log important environment variables
                            if (['PATH', 'HOME', 'SHELL', 'WSL_DISTRO_NAME'].includes(key)) {
                                debug(`[SHELL_ENV] Important var ${key}: ${value.length > 100 ? value.substring(0, 100) + '...' : value}`);
                            }
                        }
                    });

                    debug(`[SHELL_ENV] Parsed ${parsedCount} environment variables from shell`);
                }

                debug(`[SHELL_ENV] Final environment contains ${Object.keys(env).length} variables`);
                debug('[SHELL_ENV] Successfully retrieved fresh environment variables');
                resolve(env);
            } catch (parseError) {
                debug(`[SHELL_ENV] Error parsing environment output: ${parseError}`);
                debug(`[SHELL_ENV] Raw output length: ${stdout.length} chars`);
                debug(`[SHELL_ENV] Output sample: ${stdout.substring(0, 500)}${stdout.length > 500 ? '...' : ''}`);

                if (parseError instanceof Error) {
                    debug(`[SHELL_ENV] Parse error name: ${parseError.name}`);
                    debug(`[SHELL_ENV] Parse error message: ${parseError.message}`);
                }

                reject(parseError);
            }
        });
    });
}
