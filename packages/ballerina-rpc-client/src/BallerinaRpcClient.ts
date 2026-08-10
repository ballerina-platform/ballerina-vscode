/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
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

import { Messenger } from "vscode-messenger-webview";
import { VisualizerRpcClient } from "./rpc-clients/visualizer/rpc-client";
import {
    AIMachineStateValue,
    MachineStateValue,
    VisualizerLocation,
    aiStateChanged,
    getVisualizerLocation,
    sendAIStateEvent,
    stateChanged,
    vscode,
    webviewReady,
    projectContentUpdated,
    ParentPopupData,
    onParentPopupSubmitted,
    PopupMachineStateValue,
    popupStateChanged,
    PopupVisualizerLocation,
    getPopupVisualizerState,
    onDownloadProgress,
    onMigrationToolLogs,
    onMigrationToolStateChanged,
    DownloadProgress,
    breakpointChanged,
    AIMachineEventType,
    ArtifactData,
    ProjectStructureArtifactResponse,
    onArtifactUpdatedNotification,
    onArtifactUpdatedRequest,
    ColorThemeKind,
    currentThemeChanged,
    ChatNotify,
    onChatNotify,
    onCopilotChatNotify,
    AgentRunStatus,
    agentRunStatusChanged,
    checkpointCaptured,
    CheckpointCapturedPayload,
    promptUpdated,
    AIMachineSendableEvent,
    dependencyPullProgress,
    ProjectMigrationResult,
    onMigratedProject,
    navigateReviewIndex,
    reviewModeOpened,
    reviewModeClosed,
    approvalOverlayState,
    ApprovalOverlayState,
    onIdentifierUpdated,
    traceAnimationChanged,
    TraceAnimationEvent,
    webToolToggle,
    WebToolToggle,
    runningServicesChanged,
    RunningServiceInfo,
    mcpServersChanged,
    McpServerStatusDTO,
    mcpLoadErrorsChanged,
    McpLoadErrorsDTO,
    agentsMdFileInfoChanged,
    AgentsMdFileInfoDTO,
    evaluationHistoryUpdated
} from "@wso2/ballerina-core";
import { LangClientRpcClient } from "./rpc-clients/lang-client/rpc-client";
import { LibraryBrowserRpcClient } from "./rpc-clients/library-browser/rpc-client";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { CommonRpcClient, GraphqlDesignerRpcClient, PersistDiagramRpcClient, RecordCreatorRpcClient, ServiceDesignerRpcClient, AiPanelRpcClient, MigrateIntegrationRpcClient } from "./rpc-clients";
import { BiDiagramRpcClient } from "./rpc-clients/bi-diagram/rpc-client";
import { ConnectorWizardRpcClient } from "./rpc-clients/connector-wizard/rpc-client";
import { SequenceDiagramRpcClient } from "./rpc-clients/sequence-diagram/rpc-client";
import { DataMapperRpcClient } from "./rpc-clients/data-mapper/rpc-client";
import { TestManagerServiceRpcClient } from "./rpc-clients";
import { AiAgentRpcClient } from "./rpc-clients/ai-agent/rpc-client";
import { ICPServiceRpcClient } from "./rpc-clients/icp-service/rpc-client";
import { WorkflowManagementServiceRpcClient } from "./rpc-clients/workflow-management-service/rpc-client";
import { AgentChatRpcClient } from "./rpc-clients/agent-chat/rpc-client";
import { PlatformExtRpcClient } from "./rpc-clients/platform-ext/platform-ext-client";

export class BallerinaRpcClient {

    private messenger: Messenger;
    private _visualizer: VisualizerRpcClient;
    private _langClient: LangClientRpcClient;
    private _libraryBrowser: LibraryBrowserRpcClient;
    private _serviceDesigner: ServiceDesignerRpcClient;
    private _common: CommonRpcClient;
    private _persistDiagram: PersistDiagramRpcClient;
    private _GraphqlDesigner: GraphqlDesignerRpcClient;
    private _RecordCreator: RecordCreatorRpcClient;
    private _biDiagram: BiDiagramRpcClient;
    private _SequenceDiagram: SequenceDiagramRpcClient;
    private _aiPanel: AiPanelRpcClient;
    private _connectorWizard: ConnectorWizardRpcClient;
    private _dataMapper: DataMapperRpcClient;
    private _migrateIntegration: MigrateIntegrationRpcClient;
    private _testManager: TestManagerServiceRpcClient;
    private _aiAgent: AiAgentRpcClient;
    private _icpManager: ICPServiceRpcClient;
    private _workflowManagementManager: WorkflowManagementServiceRpcClient;
    private _agentChat: AgentChatRpcClient;
    private _platformExt: PlatformExtRpcClient;
    private _identifierUpdatedCallbacks = new Set<(response: ProjectStructureArtifactResponse[]) => void>();
    private _runningServicesChangedCallbacks = new Set<(services: RunningServiceInfo[]) => void>();
    private _mcpServersChangedCallbacks = new Set<(servers: McpServerStatusDTO[]) => void>();
    private _mcpLoadErrorsChangedCallbacks = new Set<(errors: McpLoadErrorsDTO) => void>();
    private _agentsMdFileInfoChangedCallbacks = new Set<(state: AgentsMdFileInfoDTO) => void>();
    private _projectContentUpdatedCallbacks = new Set<(state: boolean) => void>();
    private _evaluationHistoryUpdatedCallbacks = new Set<() => void>();

    constructor() {
        this.messenger = new Messenger(vscode);
        this.messenger.start();
        this._visualizer = new VisualizerRpcClient(this.messenger);
        this._langClient = new LangClientRpcClient(this.messenger);
        this._libraryBrowser = new LibraryBrowserRpcClient(this.messenger);
        this._serviceDesigner = new ServiceDesignerRpcClient(this.messenger);
        this._common = new CommonRpcClient(this.messenger);
        this._persistDiagram = new PersistDiagramRpcClient(this.messenger);
        this._GraphqlDesigner = new GraphqlDesignerRpcClient(this.messenger);
        this._RecordCreator = new RecordCreatorRpcClient(this.messenger);
        this._biDiagram = new BiDiagramRpcClient(this.messenger);
        this._SequenceDiagram = new SequenceDiagramRpcClient(this.messenger);
        this._aiPanel = new AiPanelRpcClient(this.messenger);
        this._connectorWizard = new ConnectorWizardRpcClient(this.messenger);
        this._dataMapper = new DataMapperRpcClient(this.messenger);
        this._migrateIntegration = new MigrateIntegrationRpcClient(this.messenger);
        this._testManager = new TestManagerServiceRpcClient(this.messenger);
        this._aiAgent = new AiAgentRpcClient(this.messenger);
        this._icpManager = new ICPServiceRpcClient(this.messenger);
        this._workflowManagementManager = new WorkflowManagementServiceRpcClient(this.messenger);
        this._agentChat = new AgentChatRpcClient(this.messenger);
        this._platformExt = new PlatformExtRpcClient(this.messenger);
        this.messenger.onNotification(onIdentifierUpdated, (response: ProjectStructureArtifactResponse[]) => {
            this._identifierUpdatedCallbacks.forEach((callback) => callback(response));
        });
        this.messenger.onNotification(runningServicesChanged, (services: RunningServiceInfo[]) => {
            this._runningServicesChangedCallbacks.forEach((callback) => callback(services));
        });
        this.messenger.onNotification(mcpServersChanged, (servers: McpServerStatusDTO[]) => {
            this._mcpServersChangedCallbacks.forEach((callback) => callback(servers));
        });
        this.messenger.onNotification(mcpLoadErrorsChanged, (errors: McpLoadErrorsDTO) => {
            this._mcpLoadErrorsChangedCallbacks.forEach((callback) => callback(errors));
        });
        this.messenger.onNotification(agentsMdFileInfoChanged, (state: AgentsMdFileInfoDTO) => {
            this._agentsMdFileInfoChangedCallbacks.forEach((callback) => callback(state));
        });
        this.messenger.onNotification(projectContentUpdated, (state: boolean) => {
            this._projectContentUpdatedCallbacks.forEach((callback) => callback(state));
        });
        this.messenger.onNotification(evaluationHistoryUpdated, () => {
            this._evaluationHistoryUpdatedCallbacks.forEach((callback) => callback());
        });
    }

    getAIAgentRpcClient(): AiAgentRpcClient {
        return this._aiAgent;
    }

    getICPRpcClient(): ICPServiceRpcClient {
        return this._icpManager;
    }

    getWorkflowManagementRpcClient(): WorkflowManagementServiceRpcClient {
        return this._workflowManagementManager;
    }

    getConnectorWizardRpcClient(): ConnectorWizardRpcClient {
        return this._connectorWizard;
    }

    getVisualizerRpcClient(): VisualizerRpcClient {
        return this._visualizer;
    }

    getServiceDesignerRpcClient(): ServiceDesignerRpcClient {
        return this._serviceDesigner;
    }

    getTestManagerRpcClient(): TestManagerServiceRpcClient {
        return this._testManager;
    }

    getBIDiagramRpcClient(): BiDiagramRpcClient {
        return this._biDiagram;
    }

    getSequenceDiagramRpcClient(): SequenceDiagramRpcClient {
        return this._SequenceDiagram;
    }

    getPersistDiagramRpcClient(): PersistDiagramRpcClient {
        return this._persistDiagram;
    }

    getGraphqlDesignerRpcClient(): GraphqlDesignerRpcClient {
        return this._GraphqlDesigner;
    }

    getLangClientRpcClient(): LangClientRpcClient {
        return this._langClient;
    }

    getLibraryBrowserRPCClient(): LibraryBrowserRpcClient {
        return this._libraryBrowser;
    }

    getCommonRpcClient(): CommonRpcClient {
        return this._common;
    }

    getRecordCreatorRpcClient(): RecordCreatorRpcClient {
        return this._RecordCreator;
    }

    getAiPanelRpcClient(): AiPanelRpcClient {
        return this._aiPanel;
    }

    getDataMapperRpcClient(): DataMapperRpcClient {
        return this._dataMapper;
    }

    getMigrateIntegrationRpcClient(): MigrateIntegrationRpcClient {
        return this._migrateIntegration;
    }

    getPlatformRpcClient(): PlatformExtRpcClient {
        return this._platformExt;
    }

    getVisualizerLocation(): Promise<VisualizerLocation> {
        return this.messenger.sendRequest(getVisualizerLocation, HOST_EXTENSION);
    }

    onStateChanged(callback: (state: MachineStateValue) => void) {
        this.messenger.onNotification(stateChanged, callback);
    }

    onAIPanelStateChanged(callback: (state: AIMachineStateValue) => void) {
        this.messenger.onNotification(aiStateChanged, callback);
    }

    sendAIStateEvent(event: AIMachineEventType | AIMachineSendableEvent) {
        this.messenger.sendRequest(sendAIStateEvent, HOST_EXTENSION, event);
    }

    onCheckpointCaptured(callback: (payload: CheckpointCapturedPayload) => void) {
        this.messenger.onNotification(checkpointCaptured, callback);
    }

    onPromptUpdated(callback: () => void) {
        this.messenger.onNotification(promptUpdated, callback);
    }

    onProjectContentUpdated(callback: (state: boolean) => void): () => void {
        this._projectContentUpdatedCallbacks.add(callback);
        return () => {
            this._projectContentUpdatedCallbacks.delete(callback);
        };
    }

    onEvaluationHistoryUpdated(callback: () => void): () => void {
        this._evaluationHistoryUpdatedCallbacks.add(callback);
        return () => {
            this._evaluationHistoryUpdatedCallbacks.delete(callback);
        };
    }

    onIdentifierUpdated(callback: (response: ProjectStructureArtifactResponse[]) => void) {
        this._identifierUpdatedCallbacks.add(callback);
        return () => {
            this._identifierUpdatedCallbacks.delete(callback);
        };
    }

    // <----- This is used to register given artifact updated callback notification ----->
    onArtifactUpdated(artifactData: ArtifactData, callback: (artifacts: ProjectStructureArtifactResponse[]) => void) {
        this.messenger.sendRequest(onArtifactUpdatedRequest, HOST_EXTENSION, artifactData);
        this.messenger.onNotification(onArtifactUpdatedNotification, callback);
    }

    webviewReady(): void {
        this.messenger.sendNotification(webviewReady, HOST_EXTENSION);
    }

    onParentPopupSubmitted(callback: (parent: ParentPopupData) => void) {
        this.messenger.onNotification(onParentPopupSubmitted, callback);
    }

    onPopupStateChanged(callback: (state: PopupMachineStateValue) => void) {
        this.messenger.onNotification(popupStateChanged, callback);
    }

    onBreakpointChanges(callback: (state: boolean) => void) {
        this.messenger.onNotification(breakpointChanged, callback);
    }

    onDownloadProgress(callback: (state: DownloadProgress) => void) {
        this.messenger.onNotification(onDownloadProgress, callback);
    }

    onChatNotify(callback: (state: ChatNotify) => void) {
        this.messenger.onNotification(onChatNotify, callback);
    }

    /** Copilot chat stream mirrored to the visualizer webview (mini-chat overlay) while the AI panel is closed. */
    onCopilotChatNotify(callback: (state: ChatNotify) => void) {
        this.messenger.onNotification(onCopilotChatNotify, callback);
    }

    onAgentRunStatusChanged(callback: (status: AgentRunStatus) => void) {
        this.messenger.onNotification(agentRunStatusChanged, callback);
    }

    onMigrationToolLogs(callback: (message: string) => void) {
        this.messenger.onNotification(onMigrationToolLogs, callback);
    }

    onMigrationToolStateChanged(callback: (state: string) => void) {
        this.messenger.onNotification(onMigrationToolStateChanged, callback);
    }

    onDependencyPullProgress(callback: (message: string) => void) {
        this.messenger.onNotification(dependencyPullProgress, callback);
    }

    onMigratedProject(callback: (result: ProjectMigrationResult) => void) {
        this.messenger.onNotification(onMigratedProject, callback);
    }

    getPopupVisualizerState(): Promise<PopupVisualizerLocation> {
        return this.messenger.sendRequest(getPopupVisualizerState, HOST_EXTENSION);
    }

    getAgentChatRpcClient(): AgentChatRpcClient {
        return this._agentChat;
    }

    onThemeChanged(callback: (kind: ColorThemeKind) => void) {
        this.messenger.onNotification(currentThemeChanged, callback);
    }

    onNavigateReviewIndex(callback: (index: number) => void) {
        this.messenger.onNotification(navigateReviewIndex, callback);
    }

    onReviewModeOpened(callback: () => void) {
        this.messenger.onNotification(reviewModeOpened, callback);
    }

    onReviewModeClosed(callback: () => void) {
        this.messenger.onNotification(reviewModeClosed, callback);
    }

    onApprovalOverlayState(callback: (data: ApprovalOverlayState) => void) {
        this.messenger.onNotification(approvalOverlayState, callback);
    }

    onWebToolToggle(callback: (data: WebToolToggle) => void) {
        this.messenger.onNotification(webToolToggle, callback);
    }

    onTraceAnimationChanged(callback: (event: TraceAnimationEvent) => void) {
        this.messenger.onNotification(traceAnimationChanged, callback);
    }

    onRunningServicesChanged(callback: (services: RunningServiceInfo[]) => void): () => void {
        this._runningServicesChangedCallbacks.add(callback);
        return () => {
            this._runningServicesChangedCallbacks.delete(callback);
        };
    }

    onMcpServersChanged(callback: (servers: McpServerStatusDTO[]) => void): () => void {
        this._mcpServersChangedCallbacks.add(callback);
        return () => {
            this._mcpServersChangedCallbacks.delete(callback);
        };
    }

    onMcpLoadErrorsChanged(callback: (errors: McpLoadErrorsDTO) => void): () => void {
        this._mcpLoadErrorsChangedCallbacks.add(callback);
        return () => {
            this._mcpLoadErrorsChangedCallbacks.delete(callback);
        };
    }

    onAgentsMdFileInfoChanged(callback: (state: AgentsMdFileInfoDTO) => void): () => void {
        this._agentsMdFileInfoChangedCallbacks.add(callback);
        return () => {
            this._agentsMdFileInfoChangedCallbacks.delete(callback);
        };
    }
}
