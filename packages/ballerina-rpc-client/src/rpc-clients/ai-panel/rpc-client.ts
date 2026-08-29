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
    AIMachineSnapshot,
    AIPanelAPI,
    AIPanelPrompt,
    AbortAIGenerationRequest,
    AddFilesToProjectRequest,
    ApproveTaskRequest,
    CheckpointInfo,
    ConfigurationCancelRequest,
    ConfigurationProvideRequest,
    ConnectorSpecCancelRequest,
    ConnectorSpecRequest,
    DocGenerationRequest,
    GenerateAgentCodeRequest,
    GenerateOpenAPIRequest,
    LLMDiagnostics,
    LoginMethod,
    OpenFileDiffRequest,
    PlanApprovalRequest,
    ProcessContextTypeCreationRequest,
    PromptEnhancementRequest,
    PromptEnhancementResponse,
    RequirementSpecification,
    RestoreCheckpointRequest,
    RevertGenerationRequest,
    SemanticDiffRequest,
    SemanticDiffResponse,
    SubmitFeedbackRequest,
    TaskDeclineRequest,
    TestGenerationMentions,
    UIChatMessage,
    UpdateChatMessageRequest,
    UsageResponse,
    QuotaRequestParams,
    QuotaRequestResult,
    WebToolApprovalRequest,
    ClarifyAnswerRequest,
    ClarifyCancelRequest,
    approveWebTool,
    declineWebTool,
    submitClarifyAnswer,
    cancelClarify,
    abortAIGeneration,
    addFilesToProject,
    approvePlan,
    approveTask,
    cancelConfiguration,
    cancelConnectorSpec,
    clearChat,
    clearInitialPrompt,
    createTestDirecoryIfNotExists,
    revertGeneration,
    declinePlan,
    declineTask,
    enhancePrompt,
    generateAgent,
    generateContextTypes,
    generateOpenAPI,
    getAIMachineSnapshot,
    getActiveTempDir,
    getChatMessages,
    getRunStatus,
    GetRunStatusRequest,
    GetRunStatusResponse,
    getLatestFollowupSuggestions,
    FollowupSuggestion,
    getCheckpoints,
    getDefaultPrompt,
    isScaffoldEnvActive,
    getDriftDiagnosticContents,
    getFromDocumentation,
    getGeneratedDocumentation,
    getLoginMethod,
    getSemanticDiff,
    getServiceNames,
    isCopilotSignedIn,
    isPlatformExtensionAvailable,
    isUserAuthenticated,
    isWorkspaceProject,
    markAlertShown,
    openAIPanel,
    openChatWindowWithCommand,
    openFileDiff,
    promptForLogin,
    promptGithubAuthorize,
    provideConfiguration,
    createManagedConnection,
    cancelManagedConnection,
    CreateManagedConnectionRequest,
    CreateManagedConnectionResponse,
    provideConnectorSpec,
    restoreCheckpoint,
    showSignInAlert,
    submitFeedback,
    updateChatMessage,
    updateRequirementSpecification,
    getUsage,
    requestQuota,
    compactConversation,
    CompactConversationRequest,
    CompactConversationResponse,
    getShowContextUsage,
    getRunningServices,
    stopRunningService,
    RunningServiceInfo,
    StopRunningServiceRequest,
    RunServiceRequest,
    runService,
    getDefaultVertexCredsPath,
    getSkills,
    addSkill,
    toggleSkill,
    deleteSkill,
    enableSkillFromChat,
    cancelSkillEnable,
    parseSkillFile,
    GetSkillsResponse,
    AddSkillRequest,
    ToggleSkillRequest,
    DeleteSkillRequest,
    SkillEnableRequest,
    SkillEnableCancelRequest,
    ParseSkillFileRequest,
    ParseSkillFileResponse,
    listMcpServers,
    setMcpServerEnabled,
    openMcpConfig,
    addMcpServer,
    updateMcpServer,
    deleteMcpServer,
    setMcpToolsEnabled,
    getMcpToolsEnabled,
    getMcpWorkspaceContext,
    getMcpLoadErrors,
    getAgentsMdFileInfo,
    openOrCreateAgentsMd,
    McpServerStatusDTO,
    SetMcpServerEnabledRequest,
    AddMcpServerRequest,
    AddMcpServerResponse,
    OpenMcpConfigRequest,
    McpWorkspaceContextResponse,
    UpdateMcpServerRequest,
    DeleteMcpServerRequest,
    SetMcpToolsEnabledRequest,
    McpLoadErrorsDTO,
    AgentsMdFileInfoDTO,
    listThreads,
    switchThread,
    SwitchThreadRequest,
    deleteThread,
    DeleteThreadRequest,
    renameThread,
    RenameThreadRequest,
    ThreadSummary,
    // TODO(auto-memory): temporarily disabled for this release.
    // clearMemory,
    // ClearMemoryRequest,
    // openMemoryFiles,
    // OpenMemoryRequest,
} from "@wso2/ballerina-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class AiPanelRpcClient implements AIPanelAPI {
    private _messenger: Messenger;

    constructor(messenger: Messenger) {
        this._messenger = messenger;
    }

    getLoginMethod(): Promise<LoginMethod> {
        return this._messenger.sendRequest(getLoginMethod, HOST_EXTENSION);
    }

    isPlatformExtensionAvailable(): Promise<boolean> {
        return this._messenger.sendRequest(isPlatformExtensionAvailable, HOST_EXTENSION);
    }

    getDefaultPrompt(): Promise<AIPanelPrompt> {
        return this._messenger.sendRequest(getDefaultPrompt, HOST_EXTENSION);
    }

    getAIMachineSnapshot(): Promise<AIMachineSnapshot> {
        return this._messenger.sendRequest(getAIMachineSnapshot, HOST_EXTENSION);
    }

    clearInitialPrompt(): void {
        return this._messenger.sendNotification(clearInitialPrompt, HOST_EXTENSION);
    }

    isScaffoldEnvActive(): Promise<boolean> {
        return this._messenger.sendRequest(isScaffoldEnvActive, HOST_EXTENSION);
    }

    openChatWindowWithCommand(): void {
        return this._messenger.sendNotification(openChatWindowWithCommand, HOST_EXTENSION);
    }

    generateContextTypes(params: ProcessContextTypeCreationRequest): void {
        return this._messenger.sendNotification(generateContextTypes, HOST_EXTENSION, params);
    }

    getServiceNames(): Promise<TestGenerationMentions> {
        return this._messenger.sendRequest(getServiceNames, HOST_EXTENSION);
    }

    promptGithubAuthorize(): Promise<boolean> {
        return this._messenger.sendRequest(promptGithubAuthorize, HOST_EXTENSION);
    }

    isCopilotSignedIn(): Promise<boolean> {
        return this._messenger.sendRequest(isCopilotSignedIn, HOST_EXTENSION);
    }

    showSignInAlert(): Promise<boolean> {
        return this._messenger.sendRequest(showSignInAlert, HOST_EXTENSION);
    }

    markAlertShown(): void {
        return this._messenger.sendNotification(markAlertShown, HOST_EXTENSION);
    }

    getFromDocumentation(params: string): Promise<string> {
        return this._messenger.sendRequest(getFromDocumentation, HOST_EXTENSION, params);
    }

    getDriftDiagnosticContents(): Promise<LLMDiagnostics> {
        return this._messenger.sendRequest(getDriftDiagnosticContents, HOST_EXTENSION);
    }

    updateRequirementSpecification(params: RequirementSpecification): void {
        return this._messenger.sendNotification(updateRequirementSpecification, HOST_EXTENSION, params);
    }

    createTestDirecoryIfNotExists(): void {
        return this._messenger.sendNotification(createTestDirecoryIfNotExists, HOST_EXTENSION);
    }

    submitFeedback(params: SubmitFeedbackRequest): Promise<boolean> {
        return this._messenger.sendRequest(submitFeedback, HOST_EXTENSION, params);
    }

    generateOpenAPI(params: GenerateOpenAPIRequest): void {
        return this._messenger.sendNotification(generateOpenAPI, HOST_EXTENSION, params);
    }

    generateAgent(params: GenerateAgentCodeRequest): Promise<boolean> {
        return this._messenger.sendRequest(generateAgent, HOST_EXTENSION, params);
    }

    abortAIGeneration(params: AbortAIGenerationRequest): void {
        return this._messenger.sendNotification(abortAIGeneration, HOST_EXTENSION, params);
    }

    getGeneratedDocumentation(params: DocGenerationRequest): Promise<void> {
        return this._messenger.sendRequest(getGeneratedDocumentation, HOST_EXTENSION, params);
    }

    addFilesToProject(params: AddFilesToProjectRequest): Promise<boolean> {
        return this._messenger.sendRequest(addFilesToProject, HOST_EXTENSION, params);
    }

    isUserAuthenticated(): Promise<boolean> {
        return this._messenger.sendRequest(isUserAuthenticated, HOST_EXTENSION);
    }

    openAIPanel(params: AIPanelPrompt): Promise<void> {
        return this._messenger.sendRequest(openAIPanel, HOST_EXTENSION, params);
    }


    getSemanticDiff(params: SemanticDiffRequest): Promise<SemanticDiffResponse> {
        return this._messenger.sendRequest(getSemanticDiff, HOST_EXTENSION, params);
    }

    isWorkspaceProject(): Promise<boolean> {
        return this._messenger.sendRequest(isWorkspaceProject, HOST_EXTENSION);
    }

    revertGeneration(params: RevertGenerationRequest): Promise<void> {
        return this._messenger.sendRequest(revertGeneration, HOST_EXTENSION, params);
    }

    approvePlan(params: PlanApprovalRequest): Promise<void> {
        return this._messenger.sendRequest(approvePlan, HOST_EXTENSION, params);
    }

    declinePlan(params: PlanApprovalRequest): Promise<void> {
        return this._messenger.sendRequest(declinePlan, HOST_EXTENSION, params);
    }

    approveTask(params: ApproveTaskRequest): Promise<void> {
        return this._messenger.sendRequest(approveTask, HOST_EXTENSION, params);
    }

    declineTask(params: TaskDeclineRequest): Promise<void> {
        return this._messenger.sendRequest(declineTask, HOST_EXTENSION, params);
    }

    provideConnectorSpec(params: ConnectorSpecRequest): Promise<void> {
        return this._messenger.sendRequest(provideConnectorSpec, HOST_EXTENSION, params);
    }

    cancelConnectorSpec(params: ConnectorSpecCancelRequest): Promise<void> {
        return this._messenger.sendRequest(cancelConnectorSpec, HOST_EXTENSION, params);
    }

    provideConfiguration(params: ConfigurationProvideRequest): Promise<void> {
        return this._messenger.sendRequest(provideConfiguration, HOST_EXTENSION, params);
    }

    cancelConfiguration(params: ConfigurationCancelRequest): Promise<void> {
        return this._messenger.sendRequest(cancelConfiguration, HOST_EXTENSION, params);
    }

    createManagedConnection(params: CreateManagedConnectionRequest): Promise<CreateManagedConnectionResponse> {
        return this._messenger.sendRequest(createManagedConnection, HOST_EXTENSION, params);
    }

    cancelManagedConnection(): void {
        return this._messenger.sendNotification(cancelManagedConnection, HOST_EXTENSION);
    }

    getChatMessages(): Promise<UIChatMessage[]> {
        return this._messenger.sendRequest(getChatMessages, HOST_EXTENSION);
    }

    getCheckpoints(): Promise<CheckpointInfo[]> {
        return this._messenger.sendRequest(getCheckpoints, HOST_EXTENSION);
    }

    restoreCheckpoint(params: RestoreCheckpointRequest): Promise<void> {
        return this._messenger.sendRequest(restoreCheckpoint, HOST_EXTENSION, params);
    }

    clearChat(): Promise<void> {
        return this._messenger.sendRequest(clearChat, HOST_EXTENSION);
    }

    updateChatMessage(params: UpdateChatMessageRequest): Promise<void> {
        return this._messenger.sendRequest(updateChatMessage, HOST_EXTENSION, params);
    }

    getActiveTempDir(): Promise<string> {
        return this._messenger.sendRequest(getActiveTempDir, HOST_EXTENSION);
    }

    getRunStatus(params: GetRunStatusRequest): Promise<GetRunStatusResponse> {
        return this._messenger.sendRequest(getRunStatus, HOST_EXTENSION, params);
    }

    getLatestFollowupSuggestions(): Promise<FollowupSuggestion[]> {
        return this._messenger.sendRequest(getLatestFollowupSuggestions, HOST_EXTENSION);
    }

    getUsage(): Promise<UsageResponse | undefined> {
        return this._messenger.sendRequest(getUsage, HOST_EXTENSION);
    }

    requestQuota(params: QuotaRequestParams): Promise<QuotaRequestResult> {
        return this._messenger.sendRequest(requestQuota, HOST_EXTENSION, params);
    }

    openFileDiff(params: OpenFileDiffRequest): void {
        return this._messenger.sendNotification(openFileDiff, HOST_EXTENSION, params);
    }

    approveWebTool(params: WebToolApprovalRequest): Promise<void> {
        return this._messenger.sendRequest(approveWebTool, HOST_EXTENSION, params);
    }

    declineWebTool(params: WebToolApprovalRequest): Promise<void> {
        return this._messenger.sendRequest(declineWebTool, HOST_EXTENSION, params);
    }

    compactConversation(params: CompactConversationRequest): Promise<CompactConversationResponse> {
        return this._messenger.sendRequest(compactConversation, HOST_EXTENSION, params);
    }

    getShowContextUsage(): Promise<boolean> {
        return this._messenger.sendRequest(getShowContextUsage, HOST_EXTENSION);
    }

    
    enhancePrompt(params: PromptEnhancementRequest): Promise<PromptEnhancementResponse> {
        return this._messenger.sendRequest(enhancePrompt, HOST_EXTENSION, params);
    }

    promptForLogin(): void {
        return this._messenger.sendNotification(promptForLogin, HOST_EXTENSION);
    }

    submitClarifyAnswer(params: ClarifyAnswerRequest): Promise<void> {
        return this._messenger.sendRequest(submitClarifyAnswer, HOST_EXTENSION, params);
    }

    cancelClarify(params: ClarifyCancelRequest): Promise<void> {
        return this._messenger.sendRequest(cancelClarify, HOST_EXTENSION, params);
    }

    getRunningServices(): Promise<RunningServiceInfo[]> {
        return this._messenger.sendRequest(getRunningServices, HOST_EXTENSION);
    }

    stopRunningService(params: StopRunningServiceRequest): Promise<boolean> {
        return this._messenger.sendRequest(stopRunningService, HOST_EXTENSION, params);
    }

    runService(params: RunServiceRequest): Promise<boolean> {
        return this._messenger.sendRequest(runService, HOST_EXTENSION, params);
    }

    getDefaultVertexCredsPath(): Promise<string> {
        return this._messenger.sendRequest(getDefaultVertexCredsPath, HOST_EXTENSION);
    }

    getSkills(): Promise<GetSkillsResponse> {
        return this._messenger.sendRequest(getSkills, HOST_EXTENSION);
    }

    addSkill(params: AddSkillRequest): Promise<boolean> {
        return this._messenger.sendRequest(addSkill, HOST_EXTENSION, params);
    }

    toggleSkill(params: ToggleSkillRequest): Promise<boolean> {
        return this._messenger.sendRequest(toggleSkill, HOST_EXTENSION, params);
    }

    deleteSkill(params: DeleteSkillRequest): Promise<boolean> {
        return this._messenger.sendRequest(deleteSkill, HOST_EXTENSION, params);
    }

    enableSkillFromChat(params: SkillEnableRequest): Promise<boolean> {
        return this._messenger.sendRequest(enableSkillFromChat, HOST_EXTENSION, params);
    }

    cancelSkillEnable(params: SkillEnableCancelRequest): Promise<void> {
        return this._messenger.sendRequest(cancelSkillEnable, HOST_EXTENSION, params);
    }

    parseSkillFile(params: ParseSkillFileRequest): Promise<ParseSkillFileResponse> {
        return this._messenger.sendRequest(parseSkillFile, HOST_EXTENSION, params);
    }

    listMcpServers(): Promise<McpServerStatusDTO[]> {
        return this._messenger.sendRequest(listMcpServers, HOST_EXTENSION);
    }

    setMcpServerEnabled(params: SetMcpServerEnabledRequest): Promise<void> {
        return this._messenger.sendRequest(setMcpServerEnabled, HOST_EXTENSION, params);
    }

    openMcpConfig(params: OpenMcpConfigRequest): Promise<void> {
        return this._messenger.sendRequest(openMcpConfig, HOST_EXTENSION, params);
    }

    addMcpServer(params: AddMcpServerRequest): Promise<AddMcpServerResponse> {
        return this._messenger.sendRequest(addMcpServer, HOST_EXTENSION, params);
    }

    updateMcpServer(params: UpdateMcpServerRequest): Promise<AddMcpServerResponse> {
        return this._messenger.sendRequest(updateMcpServer, HOST_EXTENSION, params);
    }

    deleteMcpServer(params: DeleteMcpServerRequest): Promise<AddMcpServerResponse> {
        return this._messenger.sendRequest(deleteMcpServer, HOST_EXTENSION, params);
    }

    setMcpToolsEnabled(params: SetMcpToolsEnabledRequest): Promise<void> {
        return this._messenger.sendRequest(setMcpToolsEnabled, HOST_EXTENSION, params);
    }

    getMcpToolsEnabled(): Promise<boolean> {
        return this._messenger.sendRequest(getMcpToolsEnabled, HOST_EXTENSION);
    }

    getMcpWorkspaceContext(): Promise<McpWorkspaceContextResponse> {
        return this._messenger.sendRequest(getMcpWorkspaceContext, HOST_EXTENSION);
    }

    getMcpLoadErrors(): Promise<McpLoadErrorsDTO> {
        return this._messenger.sendRequest(getMcpLoadErrors, HOST_EXTENSION);
    }

    getAgentsMdFileInfo(): Promise<AgentsMdFileInfoDTO> {
        return this._messenger.sendRequest(getAgentsMdFileInfo, HOST_EXTENSION);
    }

    openOrCreateAgentsMd(): Promise<void> {
        return this._messenger.sendRequest(openOrCreateAgentsMd, HOST_EXTENSION);
    }

    listThreads(): Promise<ThreadSummary[]> {
        return this._messenger.sendRequest(listThreads, HOST_EXTENSION);
    }

    switchThread(params: SwitchThreadRequest): Promise<void> {
        return this._messenger.sendRequest(switchThread, HOST_EXTENSION, params);
    }

    deleteThread(params: DeleteThreadRequest): Promise<void> {
        return this._messenger.sendRequest(deleteThread, HOST_EXTENSION, params);
    }

    renameThread(params: RenameThreadRequest): Promise<void> {
        return this._messenger.sendRequest(renameThread, HOST_EXTENSION, params);
    }

    // TODO(auto-memory): temporarily disabled for this release.
    // clearMemory(params: ClearMemoryRequest): Promise<void> {
    //     return this._messenger.sendRequest(clearMemory, HOST_EXTENSION, params);
    // }
    //
    // openMemoryFiles(params: OpenMemoryRequest): void {
    //     this._messenger.sendNotification(openMemoryFiles, HOST_EXTENSION, params);
    // }
}
