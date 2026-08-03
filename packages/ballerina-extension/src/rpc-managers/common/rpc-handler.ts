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
    BallerinaDiagnosticsRequest,
    ClearWebviewCache,
    CommandsRequest,
    FileOrDirRequest,
    GoToSourceRequest,
    OpenExternalUrlRequest,
    RestoreWebviewCache,
    RunExternalCommandRequest,
    SetWebviewCache,
    SetWebviewCacheRequestParam,
    ShowErrorMessageRequest,
    showInformationModal,
    WorkspaceFileRequest,
    downloadSelectedSampleFromGithub,
    executeCommand,
    experimentalEnabled,
    getAgentRunStatus,
    getBallerinaDiagnostics,
    getCurrentProjectTomlValues,
    getDefaultOrgName,
    getPreferredTryItOption,
    getTypeCompletions,
    getWorkspaceFiles,
    getWorkspaceRoot,
    getWorkspaceType,
    goToSource,
    hasCentralPATConfigured,
    isNPSupported,
    openExternalUrl,
    publishToCentral,
    runBackgroundTerminalCommand,
    SampleDownloadRequest,
    selectFileOrDirPath,
    selectFileOrFolderPath,
    setPreferredTryItOption,
    showErrorMessage,
    ShowInfoModalRequest,
    showQuickPick,
    ShowQuickPickRequest
} from "@wso2/ballerina-core";
import { Messenger } from "vscode-messenger";
import { CommonRpcManager } from "./rpc-manager";

export function registerCommonRpcHandlers(messenger: Messenger) {
    const rpcManger = new CommonRpcManager();
    messenger.onRequest(getTypeCompletions, () => rpcManger.getTypeCompletions());
    messenger.onNotification(goToSource, (args: GoToSourceRequest) => rpcManger.goToSource(args));
    messenger.onRequest(getWorkspaceFiles, (args: WorkspaceFileRequest) => rpcManger.getWorkspaceFiles(args));
    messenger.onRequest(getBallerinaDiagnostics, (args: BallerinaDiagnosticsRequest) => rpcManger.getBallerinaDiagnostics(args));
    messenger.onRequest(executeCommand, (args: CommandsRequest) => rpcManger.executeCommand(args));
    messenger.onRequest(getAgentRunStatus, () => rpcManger.getAgentRunStatus());
    messenger.onRequest(runBackgroundTerminalCommand, (args: RunExternalCommandRequest) => rpcManger.runBackgroundTerminalCommand(args));
    messenger.onNotification(openExternalUrl, (args: OpenExternalUrlRequest) => rpcManger.openExternalUrl(args));
    messenger.onRequest(selectFileOrDirPath, (args: FileOrDirRequest) => rpcManger.selectFileOrDirPath(args));
    messenger.onRequest(selectFileOrFolderPath, () => rpcManger.selectFileOrFolderPath());
    messenger.onRequest(experimentalEnabled, () => rpcManger.experimentalEnabled());
    messenger.onRequest(isNPSupported, () => rpcManger.isNPSupported());
    messenger.onRequest(getWorkspaceRoot, () => rpcManger.getWorkspaceRoot());
    messenger.onNotification(showErrorMessage, (args: ShowErrorMessageRequest) => rpcManger.showErrorMessage(args));
    messenger.onRequest(showInformationModal, (params: ShowInfoModalRequest) => rpcManger.showInformationModal(params));
    messenger.onRequest(showQuickPick, (params: ShowQuickPickRequest) => rpcManger.showQuickPick(params));
    messenger.onRequest(getCurrentProjectTomlValues, () => rpcManger.getCurrentProjectTomlValues());
    messenger.onRequest(getWorkspaceType, () => rpcManger.getWorkspaceType());
    messenger.onRequest(SetWebviewCache, (params: SetWebviewCacheRequestParam) => rpcManger.setWebviewCache(params));
    messenger.onRequest(RestoreWebviewCache, (params: string) => rpcManger.restoreWebviewCache(params));
    messenger.onRequest(ClearWebviewCache, (params: string) => rpcManger.clearWebviewCache(params));
    messenger.onRequest(downloadSelectedSampleFromGithub, (args: SampleDownloadRequest) => rpcManger.downloadSelectedSampleFromGithub(args));
    messenger.onRequest(getDefaultOrgName, () => rpcManger.getDefaultOrgName());
    messenger.onRequest(publishToCentral, () => rpcManger.publishToCentral());
    messenger.onRequest(hasCentralPATConfigured, () => rpcManger.hasCentralPATConfigured());
    messenger.onRequest(getPreferredTryItOption, () => rpcManger.getPreferredTryItOption());
    messenger.onRequest(setPreferredTryItOption, (option: string) => rpcManger.setPreferredTryItOption(option));
}
