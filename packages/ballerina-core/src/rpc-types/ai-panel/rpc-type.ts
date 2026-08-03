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
import { LoginMethod, FollowupSuggestion } from "../../state-machine-types";
import {
    TestGenerationMentions,
    RequirementSpecification,
    LLMDiagnostics,
    AIPanelPrompt,
    AIMachineSnapshot,
    SubmitFeedbackRequest,
    GenerateOpenAPIRequest,
    GenerateAgentCodeRequest,
    DocGenerationRequest,
    AddFilesToProjectRequest,
    ProcessContextTypeCreationRequest,
    SemanticDiffRequest,
    SemanticDiffResponse,
    RestoreCheckpointRequest,
    RevertGenerationRequest,
    UpdateChatMessageRequest,
    PlanApprovalRequest,
    ApproveTaskRequest,
    TaskDeclineRequest,
    ConnectorSpecRequest,
    ConnectorSpecCancelRequest,
    ConfigurationProvideRequest,
    ConfigurationCancelRequest,
    CreateManagedConnectionRequest,
    CreateManagedConnectionResponse,
    UIChatMessage,
    CheckpointInfo,
    AbortAIGenerationRequest,
    UsageResponse,
    QuotaRequestParams,
    QuotaRequestResult,
    OpenFileDiffRequest,
    WebToolApprovalRequest,
    CompactConversationRequest,
    CompactConversationResponse,
    PromptEnhancementRequest,
    PromptEnhancementResponse,
    ClarifyAnswerRequest,
    ClarifyCancelRequest,
    RunningServiceInfo,
    StopRunningServiceRequest,
    RunServiceRequest,
    GetSkillsResponse,
    AddSkillRequest,
    ToggleSkillRequest,
    DeleteSkillRequest,
    SkillEnableRequest,
    SkillEnableCancelRequest,
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
    ParseSkillFileRequest,
    ParseSkillFileResponse,
    ThreadSummary,
    SwitchThreadRequest,
    DeleteThreadRequest,
    RenameThreadRequest,
    // TODO(auto-memory): temporarily disabled for this release.
    // ClearMemoryRequest,
    // OpenMemoryRequest,
    GetRunStatusRequest,
    GetRunStatusResponse,
} from "./interfaces";
import { RequestType, NotificationType } from "vscode-messenger-common";

const _preFix = "ai-panel";
export const getLoginMethod: RequestType<void, LoginMethod> = { method: `${_preFix}/getLoginMethod` };
export const isPlatformExtensionAvailable: RequestType<void, boolean> = { method: `${_preFix}/isPlatformExtensionAvailable` };
export const getDefaultPrompt: RequestType<void, AIPanelPrompt> = { method: `${_preFix}/getDefaultPrompt` };
export const getAIMachineSnapshot: RequestType<void, AIMachineSnapshot> = { method: `${_preFix}/getAIMachineSnapshot` };
export const clearInitialPrompt: NotificationType<void> = { method: `${_preFix}/clearInitialPrompt` };
export const isScaffoldEnvActive: RequestType<void, boolean> = { method: `${_preFix}/isScaffoldEnvActive` };
export const openChatWindowWithCommand: NotificationType<void> = { method: `${_preFix}/openChatWindowWithCommand` };
export const generateContextTypes: NotificationType<ProcessContextTypeCreationRequest> = { method: `${_preFix}/generateContextTypes` };
export const getServiceNames: RequestType<void, TestGenerationMentions> = { method: `${_preFix}/getServiceNames` };
export const promptGithubAuthorize: RequestType<void, boolean> = { method: `${_preFix}/promptGithubAuthorize` };
export const isCopilotSignedIn: RequestType<void, boolean> = { method: `${_preFix}/isCopilotSignedIn` };
export const showSignInAlert: RequestType<void, boolean> = { method: `${_preFix}/showSignInAlert` };
export const markAlertShown: NotificationType<void> = { method: `${_preFix}/markAlertShown` };
export const getFromDocumentation: RequestType<string, string> = { method: `${_preFix}/getFromDocumentation` };
export const getDriftDiagnosticContents: RequestType<void, LLMDiagnostics> = { method: `${_preFix}/getDriftDiagnosticContents` };
export const updateRequirementSpecification: NotificationType<RequirementSpecification> = { method: `${_preFix}/updateRequirementSpecification` };
export const createTestDirecoryIfNotExists: NotificationType<void> = { method: `${_preFix}/createTestDirecoryIfNotExists` };
export const submitFeedback: RequestType<SubmitFeedbackRequest, boolean> = { method: `${_preFix}/submitFeedback` };
export const generateOpenAPI: NotificationType<GenerateOpenAPIRequest> = { method: `${_preFix}/generateOpenAPI` };
export const generateAgent: RequestType<GenerateAgentCodeRequest, boolean> = { method: `${_preFix}/generateAgent` };
export const abortAIGeneration: NotificationType<AbortAIGenerationRequest> = { method: `${_preFix}/abortAIGeneration` };
export const getGeneratedDocumentation: RequestType<DocGenerationRequest, void> = { method: `${_preFix}/getGeneratedDocumentation` };
export const addFilesToProject: RequestType<AddFilesToProjectRequest, boolean> = { method: `${_preFix}/addFilesToProject` };
export const isUserAuthenticated: RequestType<void, boolean> = { method: `${_preFix}/isUserAuthenticated` };
export const openAIPanel: RequestType<AIPanelPrompt, void> = { method: `${_preFix}/openAIPanel` };
export const getSemanticDiff: RequestType<SemanticDiffRequest, SemanticDiffResponse> = { method: `${_preFix}/getSemanticDiff` };
export const isWorkspaceProject: RequestType<void, boolean> = { method: `${_preFix}/isWorkspaceProject` };
export const revertGeneration: RequestType<RevertGenerationRequest, void> = { method: `${_preFix}/revertGeneration` };
export const approvePlan: RequestType<PlanApprovalRequest, void> = { method: `${_preFix}/approvePlan` };
export const declinePlan: RequestType<PlanApprovalRequest, void> = { method: `${_preFix}/declinePlan` };
export const approveTask: RequestType<ApproveTaskRequest, void> = { method: `${_preFix}/approveTask` };
export const declineTask: RequestType<TaskDeclineRequest, void> = { method: `${_preFix}/declineTask` };
export const provideConnectorSpec: RequestType<ConnectorSpecRequest, void> = { method: `${_preFix}/provideConnectorSpec` };
export const cancelConnectorSpec: RequestType<ConnectorSpecCancelRequest, void> = { method: `${_preFix}/cancelConnectorSpec` };
export const provideConfiguration: RequestType<ConfigurationProvideRequest, void> = { method: `${_preFix}/provideConfiguration` };
export const cancelConfiguration: RequestType<ConfigurationCancelRequest, void> = { method: `${_preFix}/cancelConfiguration` };
export const createManagedConnection: RequestType<CreateManagedConnectionRequest, CreateManagedConnectionResponse> = { method: `${_preFix}/createManagedConnection` };
export const cancelManagedConnection: NotificationType<void> = { method: `${_preFix}/cancelManagedConnection` };
export const getChatMessages: NotificationType<void> = { method: `${_preFix}/getChatMessages` };
export const getCheckpoints: NotificationType<void> = { method: `${_preFix}/getCheckpoints` };
export const restoreCheckpoint: RequestType<RestoreCheckpointRequest, void> = { method: `${_preFix}/restoreCheckpoint` };
export const clearChat: RequestType<void, void> = { method: `${_preFix}/clearChat` };
export const updateChatMessage: RequestType<UpdateChatMessageRequest, void> = { method: `${_preFix}/updateChatMessage` };
export const getActiveTempDir: RequestType<void, string> = { method: `${_preFix}/getActiveTempDir` };
export const getRunStatus: RequestType<GetRunStatusRequest, GetRunStatusResponse> = { method: `${_preFix}/getRunStatus` };
export const getLatestFollowupSuggestions: RequestType<void, FollowupSuggestion[]> = { method: `${_preFix}/getLatestFollowupSuggestions` };
export const getUsage: RequestType<void, UsageResponse | undefined> = { method: `${_preFix}/getUsage` };
export const requestQuota: RequestType<QuotaRequestParams, QuotaRequestResult> = { method: `${_preFix}/requestQuota` };
export const openFileDiff: NotificationType<OpenFileDiffRequest> = { method: `${_preFix}/openFileDiff` };
export const approveWebTool: RequestType<WebToolApprovalRequest, void> = { method: `${_preFix}/approveWebTool` };
export const declineWebTool: RequestType<WebToolApprovalRequest, void> = { method: `${_preFix}/declineWebTool` };
export const compactConversation: RequestType<CompactConversationRequest, CompactConversationResponse> = { method: `${_preFix}/compactConversation` };
export const getShowContextUsage: RequestType<void, boolean> = { method: `${_preFix}/getShowContextUsage` };
export const enhancePrompt: RequestType<PromptEnhancementRequest, PromptEnhancementResponse> = { method: `${_preFix}/enhancePrompt` };
export const promptForLogin: NotificationType<void> = { method: `${_preFix}/promptForLogin` };
export const submitClarifyAnswer: RequestType<ClarifyAnswerRequest, void> = { method: `${_preFix}/submitClarifyAnswer` };
export const cancelClarify: RequestType<ClarifyCancelRequest, void> = { method: `${_preFix}/cancelClarify` };
export const getRunningServices: RequestType<void, RunningServiceInfo[]> = { method: `${_preFix}/getRunningServices` };
export const stopRunningService: RequestType<StopRunningServiceRequest, boolean> = { method: `${_preFix}/stopRunningService` };
export const runService: RequestType<RunServiceRequest, boolean> = { method: `${_preFix}/runService` };
export const runningServicesChanged: NotificationType<RunningServiceInfo[]> = { method: `${_preFix}/runningServicesChanged` };
export const getDefaultVertexCredsPath: RequestType<void, string> = { method: `${_preFix}/getDefaultVertexCredsPath` };
export const getSkills: RequestType<void, GetSkillsResponse> = { method: `${_preFix}/getSkills` };
export const addSkill: RequestType<AddSkillRequest, boolean> = { method: `${_preFix}/addSkill` };
export const toggleSkill: RequestType<ToggleSkillRequest, boolean> = { method: `${_preFix}/toggleSkill` };
export const deleteSkill: RequestType<DeleteSkillRequest, boolean> = { method: `${_preFix}/deleteSkill` };
export const enableSkillFromChat: RequestType<SkillEnableRequest, boolean> = { method: `${_preFix}/enableSkillFromChat` };
export const cancelSkillEnable: RequestType<SkillEnableCancelRequest, void> = { method: `${_preFix}/cancelSkillEnable` };
export const parseSkillFile: RequestType<ParseSkillFileRequest, ParseSkillFileResponse> = { method: `${_preFix}/parseSkillFile` };
export const listMcpServers: RequestType<void, McpServerStatusDTO[]> = { method: `${_preFix}/listMcpServers` };
export const setMcpServerEnabled: RequestType<SetMcpServerEnabledRequest, void> = { method: `${_preFix}/setMcpServerEnabled` };
export const openMcpConfig: RequestType<OpenMcpConfigRequest, void> = { method: `${_preFix}/openMcpConfig` };
export const addMcpServer: RequestType<AddMcpServerRequest, AddMcpServerResponse> = { method: `${_preFix}/addMcpServer` };
export const updateMcpServer: RequestType<UpdateMcpServerRequest, AddMcpServerResponse> = { method: `${_preFix}/updateMcpServer` };
export const deleteMcpServer: RequestType<DeleteMcpServerRequest, AddMcpServerResponse> = { method: `${_preFix}/deleteMcpServer` };
export const setMcpToolsEnabled: RequestType<SetMcpToolsEnabledRequest, void> = { method: `${_preFix}/setMcpToolsEnabled` };
export const getMcpToolsEnabled: RequestType<void, boolean> = { method: `${_preFix}/getMcpToolsEnabled` };
export const getMcpWorkspaceContext: RequestType<void, McpWorkspaceContextResponse> = { method: `${_preFix}/getMcpWorkspaceContext` };
export const getMcpLoadErrors: RequestType<void, McpLoadErrorsDTO> = { method: `${_preFix}/getMcpLoadErrors` };
export const mcpServersChanged: NotificationType<McpServerStatusDTO[]> = { method: `${_preFix}/mcpServersChanged` };
export const mcpLoadErrorsChanged: NotificationType<McpLoadErrorsDTO> = { method: `${_preFix}/mcpLoadErrorsChanged` };
export const getAgentsMdFileInfo: RequestType<void, AgentsMdFileInfoDTO> = { method: `${_preFix}/getAgentsMdFileInfo` };
export const openOrCreateAgentsMd: RequestType<void, void> = { method: `${_preFix}/openOrCreateAgentsMd` };
export const agentsMdFileInfoChanged: NotificationType<AgentsMdFileInfoDTO> = { method: `${_preFix}/agentsMdFileInfoChanged` };
export const listThreads: RequestType<void, ThreadSummary[]> = { method: `${_preFix}/listThreads` };
export const switchThread: RequestType<SwitchThreadRequest, void> = { method: `${_preFix}/switchThread` };
export const deleteThread: RequestType<DeleteThreadRequest, void> = { method: `${_preFix}/deleteThread` };
export const renameThread: RequestType<RenameThreadRequest, void> = { method: `${_preFix}/renameThread` };
// TODO(auto-memory): temporarily disabled for this release.
// export const clearMemory: RequestType<ClearMemoryRequest, void> = { method: `${_preFix}/clearMemory` };
// export const openMemoryFiles: NotificationType<OpenMemoryRequest> = { method: `${_preFix}/openMemoryFiles` };
