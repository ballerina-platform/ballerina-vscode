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
import { QuickPickItem } from "vscode";
import {
    BallerinaDiagnosticsRequest,
    BallerinaDiagnosticsResponse,
    CommandsRequest,
    CommandsResponse,
    GoToSourceRequest,
    OpenExternalUrlRequest,
    FileOrDirResponse,
    RunExternalCommandRequest,
    RunExternalCommandResponse,
    TypeResponse,
    WorkspaceFileRequest,
    WorkspacesFileResponse,
    FileOrDirRequest,
    ProjectFileRequest,
    ProjectFileResponse,
    WorkspaceRootResponse,
    ShowErrorMessageRequest,
    WorkspaceTypeResponse,
    SetWebviewCacheRequestParam,
    ShowInfoModalRequest,
    SampleDownloadRequest,
    ShowQuickPickRequest,
    PublishToCentralResponse
} from "./interfaces";
import { AgentRunStatus } from "../../state-machine-types";
import { RequestType, NotificationType } from "vscode-messenger-common";

const _preFix = "common";
export const getTypeCompletions: RequestType<void, TypeResponse> = { method: `${_preFix}/getTypeCompletions` };
export const goToSource: NotificationType<GoToSourceRequest> = { method: `${_preFix}/goToSource` };
export const getWorkspaceFiles: RequestType<WorkspaceFileRequest, WorkspacesFileResponse> = { method: `${_preFix}/getWorkspaceFiles` };
export const getBallerinaDiagnostics: RequestType<BallerinaDiagnosticsRequest, BallerinaDiagnosticsResponse> = { method: `${_preFix}/getBallerinaDiagnostics` };
export const executeCommand: RequestType<CommandsRequest, CommandsResponse> = { method: `${_preFix}/executeCommand` };
export const getAgentRunStatus: RequestType<void, AgentRunStatus> = { method: `${_preFix}/getAgentRunStatus` };
export const runBackgroundTerminalCommand: RequestType<RunExternalCommandRequest, RunExternalCommandResponse> = { method: `${_preFix}/runBackgroundTerminalCommand` };
export const openExternalUrl: NotificationType<OpenExternalUrlRequest> = { method: `${_preFix}/openExternalUrl` };
export const selectFileOrDirPath: RequestType<FileOrDirRequest, FileOrDirResponse> = { method: `${_preFix}/selectFileOrDirPath` };
export const selectProjectRelativeFile: RequestType<ProjectFileRequest, ProjectFileResponse> = { method: `${_preFix}/selectProjectRelativeFile` };
export const selectFileOrFolderPath: RequestType<void, FileOrDirResponse> = { method: `${_preFix}/selectFileOrFolderPath` };
export const experimentalEnabled: RequestType<void, boolean> = { method: `${_preFix}/experimentalEnabled` };
export const getCopilotOrbTheme: RequestType<void, string> = { method: `${_preFix}/getCopilotOrbTheme` };
export const additionalTriggerSearchEnabled: RequestType<void, boolean> = { method: `${_preFix}/additionalTriggerSearchEnabled` };
export const isNPSupported: RequestType<void, boolean> = { method: `${_preFix}/isNPSupported` };
export const getWorkspaceRoot: RequestType<void, WorkspaceRootResponse> = { method: `${_preFix}/getWorkspaceRoot` };
export const showErrorMessage: NotificationType<ShowErrorMessageRequest> = { method: `${_preFix}/showErrorMessage` };
export const showInformationModal: RequestType<ShowInfoModalRequest, string> = { method: `${_preFix}/showInformationModal` };
export const showQuickPick: RequestType<ShowQuickPickRequest, QuickPickItem | undefined> = { method: `${_preFix}/showQuickPick` };
export const getCurrentProjectTomlValues: RequestType<void, void> = { method: `${_preFix}/getCurrentProjectTomlValues` };
export const getWorkspaceType: RequestType<void, WorkspaceTypeResponse> = { method: `${_preFix}/getWorkspaceType` };
export const SetWebviewCache: RequestType<SetWebviewCacheRequestParam, void> = { method: `${_preFix}/setWebviewCache` };
export const RestoreWebviewCache: RequestType<IDBValidKey, unknown> = { method: `${_preFix}/restoreWebviewCache` };
export const ClearWebviewCache: RequestType<IDBValidKey, void> = { method: `${_preFix}/clearWebviewCache` };
export const downloadSelectedSampleFromGithub: RequestType<SampleDownloadRequest, boolean> = { method: `${_preFix}/downloadSelectedSampleFromGithub` };
export const getDefaultOrgName: RequestType<void, { orgName: string }> = { method: `${_preFix}/getDefaultOrgName` };
export const publishToCentral: RequestType<void, PublishToCentralResponse> = { method: `${_preFix}/publishToCentral` };
export const hasCentralPATConfigured: RequestType<void, boolean> = { method: `${_preFix}/hasCentralPATConfigured` };
export const getPreferredTryItOption: RequestType<void, string | undefined> = { method: `${_preFix}/getPreferredTryItOption` };
export const setPreferredTryItOption: RequestType<string, void> = { method: `${_preFix}/setPreferredTryItOption` };
