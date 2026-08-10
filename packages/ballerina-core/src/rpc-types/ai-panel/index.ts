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
    ParseSkillFileRequest,
    ParseSkillFileResponse,
    SkillTier,
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

export interface AIPanelAPI {
    // ==================================
    // General Functions
    // ==================================
    getLoginMethod: () => Promise<LoginMethod>;
    isPlatformExtensionAvailable: () => Promise<boolean>;
    getDefaultPrompt: () => Promise<AIPanelPrompt>; //starting args
    getAIMachineSnapshot: () => Promise<AIMachineSnapshot>; //login state machine
    clearInitialPrompt: () => void; //starting args
    isScaffoldEnvActive: () => Promise<boolean>; // INITIAL_SCAFFOLD_PROMPT env present (Devant)
    // Data-mapper related functions
    openChatWindowWithCommand: () => void;
    generateContextTypes: (params: ProcessContextTypeCreationRequest) => void;
    getServiceNames: () => Promise<TestGenerationMentions>;
    promptGithubAuthorize: () => Promise<boolean>;
    isCopilotSignedIn: () => Promise<boolean>;
    showSignInAlert: () => Promise<boolean>;
    markAlertShown: () => void;
    getFromDocumentation: (params: string) => Promise<string>;
    getDriftDiagnosticContents: () => Promise<LLMDiagnostics>;
    updateRequirementSpecification: (params: RequirementSpecification) => void;
    createTestDirecoryIfNotExists: () => void;
    submitFeedback: (params: SubmitFeedbackRequest) => Promise<boolean>;
    generateOpenAPI: (params: GenerateOpenAPIRequest) => void;
    generateAgent: (params: GenerateAgentCodeRequest) => Promise<boolean>;
    abortAIGeneration: (params: AbortAIGenerationRequest) => void;
    // ==================================
    // Doc Generation Related Functions
    // ==================================
    getGeneratedDocumentation: (params: DocGenerationRequest) => Promise<void>;
    addFilesToProject: (params: AddFilesToProjectRequest) => Promise<boolean>;
    isUserAuthenticated: () => Promise<boolean>;
    openAIPanel: (params: AIPanelPrompt) => Promise<void>;
    // AI schema related functions
    getSemanticDiff: (params: SemanticDiffRequest) => Promise<SemanticDiffResponse>;
    isWorkspaceProject: () => Promise<boolean>;
    revertGeneration: (params: RevertGenerationRequest) => Promise<void>;
    // ==================================
    // Approval Related Functions (Human-in-the-Loop)
    // ==================================
    approvePlan: (params: PlanApprovalRequest) => Promise<void>;
    declinePlan: (params: PlanApprovalRequest) => Promise<void>;
    approveTask: (params: ApproveTaskRequest) => Promise<void>;
    declineTask: (params: TaskDeclineRequest) => Promise<void>;
    provideConnectorSpec: (params: ConnectorSpecRequest) => Promise<void>;
    cancelConnectorSpec: (params: ConnectorSpecCancelRequest) => Promise<void>;
    provideConfiguration: (params: ConfigurationProvideRequest) => Promise<void>;
    cancelConfiguration: (params: ConfigurationCancelRequest) => Promise<void>;
    createManagedConnection: (params: CreateManagedConnectionRequest) => Promise<CreateManagedConnectionResponse>;
    cancelManagedConnection: () => void;
    // ==================================
    // Chat State Management
    // ==================================
    getChatMessages: () => Promise<UIChatMessage[]>;
    getCheckpoints: () => Promise<CheckpointInfo[]>;
    restoreCheckpoint: (params: RestoreCheckpointRequest) => Promise<void>;
    clearChat: () => Promise<void>;
    updateChatMessage: (params: UpdateChatMessageRequest) => Promise<void>;
    getActiveTempDir: () => Promise<string>;
    getRunStatus: (params: GetRunStatusRequest) => Promise<GetRunStatusResponse>;
    getLatestFollowupSuggestions: () => Promise<FollowupSuggestion[]>;
    getUsage: () => Promise<UsageResponse | undefined>;
    requestQuota: (params: QuotaRequestParams) => Promise<QuotaRequestResult>;
    openFileDiff: (params: OpenFileDiffRequest) => void;
    approveWebTool: (params: WebToolApprovalRequest) => Promise<void>;
    declineWebTool: (params: WebToolApprovalRequest) => Promise<void>;
    compactConversation: (params: CompactConversationRequest) => Promise<CompactConversationResponse>;
    getShowContextUsage: () => Promise<boolean>;
    // Thread / session management
    listThreads: () => Promise<ThreadSummary[]>;
    switchThread: (params: SwitchThreadRequest) => Promise<void>;
    deleteThread: (params: DeleteThreadRequest) => Promise<void>;
    renameThread: (params: RenameThreadRequest) => Promise<void>;
    // TODO(auto-memory): memory management temporarily disabled for this release.
    // clearMemory: (params: ClearMemoryRequest) => Promise<void>;
    // openMemoryFiles: (params: OpenMemoryRequest) => void;
    // ==================================
    // Prompt Enhancement
    // ==================================
    enhancePrompt: (params: PromptEnhancementRequest) => Promise<PromptEnhancementResponse>;
    promptForLogin: () => void;
    submitClarifyAnswer: (params: ClarifyAnswerRequest) => Promise<void>;
    cancelClarify: (params: ClarifyCancelRequest) => Promise<void>;
    // ==================================
    // Running Services (long-lived agent processes)
    // ==================================
    getRunningServices: () => Promise<RunningServiceInfo[]>;
    stopRunningService: (params: StopRunningServiceRequest) => Promise<boolean>;
    runService: (params: RunServiceRequest) => Promise<boolean>;
    // ==================================
    // Vertex AI BYOK Helpers
    // ==================================
    getDefaultVertexCredsPath: () => Promise<string>;
    // ==================================
    // Skills Management
    // ==================================
    getSkills: () => Promise<GetSkillsResponse>;
    addSkill: (params: AddSkillRequest) => Promise<boolean>;
    toggleSkill: (params: ToggleSkillRequest) => Promise<boolean>;
    deleteSkill: (params: DeleteSkillRequest) => Promise<boolean>;
    enableSkillFromChat: (params: SkillEnableRequest) => Promise<boolean>;
    cancelSkillEnable: (params: SkillEnableCancelRequest) => Promise<void>;
    parseSkillFile: (params: ParseSkillFileRequest) => Promise<ParseSkillFileResponse>;
    // ==================================
    // MCP tool support
    // ==================================
    listMcpServers: () => Promise<McpServerStatusDTO[]>;
    setMcpServerEnabled: (params: SetMcpServerEnabledRequest) => Promise<void>;
    openMcpConfig: (params: OpenMcpConfigRequest) => Promise<void>;
    addMcpServer: (params: AddMcpServerRequest) => Promise<AddMcpServerResponse>;
    updateMcpServer: (params: UpdateMcpServerRequest) => Promise<AddMcpServerResponse>;
    deleteMcpServer: (params: DeleteMcpServerRequest) => Promise<AddMcpServerResponse>;
    setMcpToolsEnabled: (params: SetMcpToolsEnabledRequest) => Promise<void>;
    getMcpToolsEnabled: () => Promise<boolean>;
    getMcpWorkspaceContext: () => Promise<McpWorkspaceContextResponse>;
    getMcpLoadErrors: () => Promise<McpLoadErrorsDTO>;
    getAgentsMdFileInfo: () => Promise<AgentsMdFileInfoDTO>;
    openOrCreateAgentsMd: () => Promise<void>;
}
