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
    DefaultOrgNameResponse,
    PublishToCentralResponse
} from "./interfaces";
import { AgentRunStatus } from "../../state-machine-types";

export interface CommonRPCAPI {
    getTypeCompletions: () => Promise<TypeResponse>;
    goToSource: (params: GoToSourceRequest) => void;
    getWorkspaceFiles: (params: WorkspaceFileRequest) => Promise<WorkspacesFileResponse>;
    getBallerinaDiagnostics: (params: BallerinaDiagnosticsRequest) => Promise<BallerinaDiagnosticsResponse>;
    executeCommand: (params: CommandsRequest) => Promise<CommandsResponse>;
    getAgentRunStatus: () => Promise<AgentRunStatus>;
    runBackgroundTerminalCommand: (params: RunExternalCommandRequest) => Promise<RunExternalCommandResponse>;
    openExternalUrl: (params: OpenExternalUrlRequest) => void;
    selectFileOrDirPath: (params: FileOrDirRequest) => Promise<FileOrDirResponse>;
    selectProjectRelativeFile: (params: ProjectFileRequest) => Promise<ProjectFileResponse>;
    selectFileOrFolderPath: () => Promise<FileOrDirResponse>;
    experimentalEnabled: () => Promise<boolean>;
    getCopilotOrbTheme: () => Promise<string>;
    additionalTriggerSearchEnabled: () => Promise<boolean>;
    isNPSupported: () => Promise<boolean>;
    getWorkspaceRoot: () => Promise<WorkspaceRootResponse>;
    showErrorMessage: (params: ShowErrorMessageRequest) => void;
    showInformationModal: (params: ShowInfoModalRequest) => Promise<string>;
    showQuickPick: (params: ShowQuickPickRequest) => Promise<QuickPickItem | undefined>;
    getCurrentProjectTomlValues: () => Promise<Record<string, any>>;
    getWorkspaceType: () => Promise<WorkspaceTypeResponse>;
    setWebviewCache: (params: SetWebviewCacheRequestParam) => void;
    restoreWebviewCache: (params: IDBValidKey) => unknown;
    clearWebviewCache: (params: IDBValidKey) => void;
    downloadSelectedSampleFromGithub: (params: SampleDownloadRequest) => Promise<boolean>;
    getDefaultOrgName: () => Promise<DefaultOrgNameResponse>;
    publishToCentral: () => Promise<PublishToCentralResponse>;
    hasCentralPATConfigured: () => Promise<boolean>;
    getPreferredTryItOption: () => Promise<string | undefined>;
    setPreferredTryItOption: (option: string) => Promise<void>;
}
