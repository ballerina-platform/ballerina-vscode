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
    AgentRunStatus,
    BallerinaDiagnosticsRequest,
    BallerinaDiagnosticsResponse,
    CommandsRequest,
    CommandsResponse,
    CommonRPCAPI,
    DefaultOrgNameResponse,
    FileOrDirRequest,
    FileOrDirResponse,
    GoToSourceRequest,
    OpenExternalUrlRequest,
    PackageTomlValues,
    PublishToCentralResponse,
    RunExternalCommandRequest,
    RunExternalCommandResponse,
    SampleDownloadRequest,
    ShowErrorMessageRequest,
    TypeResponse,
    WorkspaceFileRequest,
    WorkspaceRootResponse,
    WorkspaceTypeResponse,
    WorkspacesFileResponse,
    downloadSelectedSampleFromGithub,
    executeCommand,
    experimentalEnabled,
    getAgentRunStatus,
    getBallerinaDiagnostics,
    getCurrentProjectTomlValues,
    getDefaultOrgName,
    getTypeCompletions,
    getWorkspaceFiles,
    getWorkspaceRoot,
    getWorkspaceType,
    getPreferredTryItOption,
    goToSource,
    hasCentralPATConfigured,
    isNPSupported,
    openExternalUrl,
    publishToCentral,
    runBackgroundTerminalCommand,
    selectFileOrDirPath,
    selectFileOrFolderPath,
    setPreferredTryItOption,
    showErrorMessage,
    SetWebviewCacheRequestParam,
    SetWebviewCache,
    RestoreWebviewCache,
    ClearWebviewCache,
    ShowInfoModalRequest,
    showInformationModal,
    ShowQuickPickRequest,
    showQuickPick
} from "@wso2/ballerina-core";
import { QuickPickItem } from "vscode";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class CommonRpcClient implements CommonRPCAPI {
    private _messenger: Messenger;

    constructor(messenger: Messenger) {
        this._messenger = messenger;
    }

    getTypeCompletions(): Promise<TypeResponse> {
        return this._messenger.sendRequest(getTypeCompletions, HOST_EXTENSION);
    }

    goToSource(params: GoToSourceRequest): void {
        return this._messenger.sendNotification(goToSource, HOST_EXTENSION, params);
    }

    getWorkspaceFiles(params: WorkspaceFileRequest): Promise<WorkspacesFileResponse> {
        return this._messenger.sendRequest(getWorkspaceFiles, HOST_EXTENSION, params);
    }

    getBallerinaDiagnostics(params: BallerinaDiagnosticsRequest): Promise<BallerinaDiagnosticsResponse> {
        return this._messenger.sendRequest(getBallerinaDiagnostics, HOST_EXTENSION, params);
    }

    executeCommand(params: CommandsRequest): Promise<CommandsResponse> {
        return this._messenger.sendRequest(executeCommand, HOST_EXTENSION, params);
    }

    getAgentRunStatus(): Promise<AgentRunStatus> {
        return this._messenger.sendRequest(getAgentRunStatus, HOST_EXTENSION);
    }

    runBackgroundTerminalCommand(params: RunExternalCommandRequest): Promise<RunExternalCommandResponse> {
        return this._messenger.sendRequest(runBackgroundTerminalCommand, HOST_EXTENSION, params);
    }

    openExternalUrl(params: OpenExternalUrlRequest): void {
        return this._messenger.sendNotification(openExternalUrl, HOST_EXTENSION, params);
    }

    selectFileOrDirPath(params: FileOrDirRequest): Promise<FileOrDirResponse> {
        return this._messenger.sendRequest(selectFileOrDirPath, HOST_EXTENSION, params);
    }

    selectFileOrFolderPath(): Promise<FileOrDirResponse> {
        return this._messenger.sendRequest(selectFileOrFolderPath, HOST_EXTENSION);
    }

    experimentalEnabled(): Promise<boolean> {
        return this._messenger.sendRequest(experimentalEnabled, HOST_EXTENSION);
    }

    isNPSupported(): Promise<boolean> {
        return this._messenger.sendRequest(isNPSupported, HOST_EXTENSION);
    }

    getWorkspaceRoot(): Promise<WorkspaceRootResponse> {
        return this._messenger.sendRequest(getWorkspaceRoot, HOST_EXTENSION);
    }

    showErrorMessage(params: ShowErrorMessageRequest): void {
        return this._messenger.sendNotification(showErrorMessage, HOST_EXTENSION, params);
    }

    showInformationModal(params: ShowInfoModalRequest): Promise<string> {
        return this._messenger.sendRequest(showInformationModal, HOST_EXTENSION, params);
    }

    showQuickPick(params: ShowQuickPickRequest): Promise<QuickPickItem | undefined> {
        return this._messenger.sendRequest(showQuickPick, HOST_EXTENSION, params);
    }

    getCurrentProjectTomlValues(): Promise<Partial<PackageTomlValues>> {
        return this._messenger.sendRequest(getCurrentProjectTomlValues, HOST_EXTENSION);
    }

    getWorkspaceType(): Promise<WorkspaceTypeResponse> {
        return this._messenger.sendRequest(getWorkspaceType, HOST_EXTENSION);
    }

    setWebviewCache(params: SetWebviewCacheRequestParam): Promise<void> {
        return this._messenger.sendRequest(SetWebviewCache, HOST_EXTENSION, params);
    }

    restoreWebviewCache(params: IDBValidKey): Promise<unknown> {
        return this._messenger.sendRequest(RestoreWebviewCache, HOST_EXTENSION, params);
    }

    clearWebviewCache(params: IDBValidKey): Promise<void> {
        return this._messenger.sendRequest(ClearWebviewCache, HOST_EXTENSION, params);
    }

    downloadSelectedSampleFromGithub(params: SampleDownloadRequest): Promise<boolean> {
        return this._messenger.sendRequest(downloadSelectedSampleFromGithub, HOST_EXTENSION, params);
    }

    getDefaultOrgName(): Promise<DefaultOrgNameResponse> {
        return this._messenger.sendRequest(getDefaultOrgName, HOST_EXTENSION);
    }

    publishToCentral(): Promise<PublishToCentralResponse> {
        return this._messenger.sendRequest(publishToCentral, HOST_EXTENSION);
    }

    hasCentralPATConfigured(): Promise<boolean> {
        return this._messenger.sendRequest(hasCentralPATConfigured, HOST_EXTENSION);
    }

    getPreferredTryItOption(): Promise<string | undefined> {
        return this._messenger.sendRequest(getPreferredTryItOption, HOST_EXTENSION);
    }

    setPreferredTryItOption(option: string): Promise<void> {
        return this._messenger.sendRequest(setPreferredTryItOption, HOST_EXTENSION, option);
    }
}
