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
    abortAIGeneration,
    AbortAIGenerationRequest,
    addFilesToProject,
    AddFilesToProjectRequest,
    AIPanelPrompt,
    approvePlan,
    approveTask,
    ApproveTaskRequest,
    cancelConfiguration,
    cancelConnectorSpec,
    clearChat,
    clearInitialPrompt,
    ConfigurationCancelRequest,
    ConfigurationProvideRequest,
    ConnectorSpecCancelRequest,
    ConnectorSpecRequest,
    createTestDirecoryIfNotExists,
    revertGeneration,
    declinePlan,
    declineTask,
    DocGenerationRequest,
    enhancePrompt,
    generateAgent,
    GenerateAgentCodeRequest,
    generateContextTypes,
    generateOpenAPI,
    GenerateOpenAPIRequest,
    getActiveTempDir,
    getRunStatus,
    getLatestFollowupSuggestions,
    getAIMachineSnapshot,
    getChatMessages,
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
    OpenFileDiffRequest,
    PlanApprovalRequest,
    ProcessContextTypeCreationRequest,
    PromptEnhancementRequest,
    promptForLogin,
    promptGithubAuthorize,
    provideConfiguration,
    createManagedConnection,
    cancelManagedConnection,
    CreateManagedConnectionRequest,
    provideConnectorSpec,
    RequirementSpecification,
    restoreCheckpoint,
    RestoreCheckpointRequest,
    RevertGenerationRequest,
    SemanticDiffRequest,
    showSignInAlert,
    submitFeedback,
    SubmitFeedbackRequest,
    TaskDeclineRequest,
    updateChatMessage,
    UpdateChatMessageRequest,
    updateRequirementSpecification,
    approveWebTool,
    declineWebTool,
    WebToolApprovalRequest,
    QuotaRequestParams,
    getUsage,
    requestQuota,
    compactConversation,
    CompactConversationRequest,
    getShowContextUsage,
    submitClarifyAnswer,
    cancelClarify,
    ClarifyAnswerRequest,
    ClarifyCancelRequest,
    getRunningServices,
    stopRunningService,
    StopRunningServiceRequest,
    runService,
    RunServiceRequest,
    getDefaultVertexCredsPath,
    getSkills,
    addSkill,
    toggleSkill,
    deleteSkill,
    enableSkillFromChat,
    cancelSkillEnable,
    parseSkillFile,
    AddSkillRequest,
    ToggleSkillRequest,
    DeleteSkillRequest,
    SkillEnableRequest,
    SkillEnableCancelRequest,
    ParseSkillFileRequest,
    listMcpServers,
    setMcpServerEnabled,
    SetMcpServerEnabledRequest,
    openMcpConfig,
    addMcpServer,
    AddMcpServerRequest,
    updateMcpServer,
    UpdateMcpServerRequest,
    deleteMcpServer,
    DeleteMcpServerRequest,
    setMcpToolsEnabled,
    SetMcpToolsEnabledRequest,
    getMcpToolsEnabled,
    getMcpWorkspaceContext,
    getMcpLoadErrors,
    OpenMcpConfigRequest,
    getAgentsMdFileInfo,
    openOrCreateAgentsMd,
    listThreads,
    switchThread,
    SwitchThreadRequest,
    deleteThread,
    DeleteThreadRequest,
    renameThread,
    RenameThreadRequest,
    // TODO(auto-memory): temporarily disabled for this release.
    // clearMemory,
    // ClearMemoryRequest,
    // openMemoryFiles,
    // OpenMemoryRequest,
} from "@wso2/ballerina-core";
import { workspace } from 'vscode';
import { Messenger } from "vscode-messenger";
import { AiPanelRpcManager } from "./rpc-manager";
import { sendConfigChangeNotification } from "../../features/ai/utils/ai-utils";
import { runningServicesManager } from "../../features/ai/agent/tools/running-service-manager";
import { notifyRunningServicesChanged } from "../../RPCLayer";

export function registerAiPanelRpcHandlers(messenger: Messenger) {
    const rpcManger = new AiPanelRpcManager();
    messenger.onRequest(getLoginMethod, () => rpcManger.getLoginMethod());
    messenger.onRequest(isPlatformExtensionAvailable, () => rpcManger.isPlatformExtensionAvailable());
    messenger.onRequest(getDefaultPrompt, () => rpcManger.getDefaultPrompt());
    messenger.onRequest(isScaffoldEnvActive, () => rpcManger.isScaffoldEnvActive());
    messenger.onRequest(getAIMachineSnapshot, () => rpcManger.getAIMachineSnapshot());
    messenger.onNotification(clearInitialPrompt, () => rpcManger.clearInitialPrompt());
    messenger.onNotification(openChatWindowWithCommand, () => rpcManger.openChatWindowWithCommand());
    messenger.onNotification(generateContextTypes, (args: ProcessContextTypeCreationRequest) => rpcManger.generateContextTypes(args));
    messenger.onRequest(getServiceNames, () => rpcManger.getServiceNames());
    messenger.onRequest(promptGithubAuthorize, () => rpcManger.promptGithubAuthorize());
    messenger.onRequest(isCopilotSignedIn, () => rpcManger.isCopilotSignedIn());
    messenger.onRequest(showSignInAlert, () => rpcManger.showSignInAlert());
    messenger.onNotification(markAlertShown, () => rpcManger.markAlertShown());
    messenger.onRequest(getFromDocumentation, (args: string) => rpcManger.getFromDocumentation(args));
    messenger.onRequest(getDriftDiagnosticContents, () => rpcManger.getDriftDiagnosticContents());
    messenger.onNotification(updateRequirementSpecification, (args: RequirementSpecification) => rpcManger.updateRequirementSpecification(args));
    messenger.onNotification(createTestDirecoryIfNotExists, () => rpcManger.createTestDirecoryIfNotExists());
    messenger.onRequest(submitFeedback, (args: SubmitFeedbackRequest) => rpcManger.submitFeedback(args));
    messenger.onNotification(generateOpenAPI, (args: GenerateOpenAPIRequest) => rpcManger.generateOpenAPI(args));
    messenger.onRequest(generateAgent, (args: GenerateAgentCodeRequest) => rpcManger.generateAgent(args));
    messenger.onNotification(abortAIGeneration, (args: AbortAIGenerationRequest) => rpcManger.abortAIGeneration(args));
    messenger.onRequest(getGeneratedDocumentation, (args: DocGenerationRequest) => rpcManger.getGeneratedDocumentation(args));
    messenger.onRequest(addFilesToProject, (args: AddFilesToProjectRequest) => rpcManger.addFilesToProject(args));
    messenger.onRequest(isUserAuthenticated, () => rpcManger.isUserAuthenticated());
    messenger.onRequest(openAIPanel, (args: AIPanelPrompt) => rpcManger.openAIPanel(args));
    messenger.onRequest(getSemanticDiff, (args: SemanticDiffRequest) => rpcManger.getSemanticDiff(args));
    messenger.onRequest(isWorkspaceProject, () => rpcManger.isWorkspaceProject());
    messenger.onRequest(revertGeneration, (args: RevertGenerationRequest) => rpcManger.revertGeneration(args));
    messenger.onRequest(approvePlan, (args: PlanApprovalRequest) => rpcManger.approvePlan(args));
    messenger.onRequest(declinePlan, (args: PlanApprovalRequest) => rpcManger.declinePlan(args));
    messenger.onRequest(approveTask, (args: ApproveTaskRequest) => rpcManger.approveTask(args));
    messenger.onRequest(declineTask, (args: TaskDeclineRequest) => rpcManger.declineTask(args));
    messenger.onRequest(provideConnectorSpec, (args: ConnectorSpecRequest) => rpcManger.provideConnectorSpec(args));
    messenger.onRequest(cancelConnectorSpec, (args: ConnectorSpecCancelRequest) => rpcManger.cancelConnectorSpec(args));
    messenger.onRequest(provideConfiguration, (args: ConfigurationProvideRequest) => rpcManger.provideConfiguration(args));
    messenger.onRequest(cancelConfiguration, (args: ConfigurationCancelRequest) => rpcManger.cancelConfiguration(args));
    messenger.onRequest(createManagedConnection, (args: CreateManagedConnectionRequest) => rpcManger.createManagedConnection(args));
    messenger.onNotification(cancelManagedConnection, () => rpcManger.cancelManagedConnection());
    messenger.onRequest(getChatMessages, () => rpcManger.getChatMessages());
    messenger.onRequest(getCheckpoints, () => rpcManger.getCheckpoints());
    messenger.onRequest(restoreCheckpoint, (args: RestoreCheckpointRequest) => rpcManger.restoreCheckpoint(args));
    messenger.onRequest(clearChat, () => rpcManger.clearChat());
    messenger.onRequest(updateChatMessage, (args: UpdateChatMessageRequest) => rpcManger.updateChatMessage(args));
    messenger.onRequest(getActiveTempDir, () => rpcManger.getActiveTempDir());
    messenger.onRequest(getRunStatus, (args) => rpcManger.getRunStatus(args));
    messenger.onRequest(getLatestFollowupSuggestions, () => rpcManger.getLatestFollowupSuggestions());
    messenger.onRequest(getUsage, () => rpcManger.getUsage());
    messenger.onRequest(requestQuota, (args: QuotaRequestParams) => rpcManger.requestQuota(args));
    messenger.onNotification(openFileDiff, (args: OpenFileDiffRequest) => rpcManger.openFileDiff(args));
    messenger.onRequest(approveWebTool, (args: WebToolApprovalRequest) => rpcManger.approveWebTool(args));
    messenger.onRequest(declineWebTool, (args: WebToolApprovalRequest) => rpcManger.declineWebTool(args));
    messenger.onRequest(compactConversation, (args: CompactConversationRequest) => rpcManger.compactConversation(args));
    messenger.onRequest(getShowContextUsage, () => rpcManger.getShowContextUsage());

    // Notify webview immediately when the showContextUsage setting is toggled
    workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('ballerina.copilot.showContextUsage')) {
            const value = workspace.getConfiguration('ballerina.copilot').get<boolean>('showContextUsage', false);
            sendConfigChangeNotification('showContextUsage', value);
        }
    });
    messenger.onRequest(enhancePrompt, (args: PromptEnhancementRequest) => rpcManger.enhancePrompt(args));
    messenger.onNotification(promptForLogin, () => rpcManger.promptForLogin());
    messenger.onRequest(submitClarifyAnswer, (args: ClarifyAnswerRequest) => rpcManger.submitClarifyAnswer(args));
    messenger.onRequest(cancelClarify, (args: ClarifyCancelRequest) => rpcManger.cancelClarify(args));
    messenger.onRequest(getRunningServices, () => rpcManger.getRunningServices());
    messenger.onRequest(stopRunningService, (args: StopRunningServiceRequest) => rpcManger.stopRunningService(args));
    messenger.onRequest(runService, (args: RunServiceRequest) => rpcManger.runService(args));
    messenger.onRequest(getDefaultVertexCredsPath, () => rpcManger.getDefaultVertexCredsPath());
    messenger.onRequest(getSkills, () => rpcManger.getSkills());
    messenger.onRequest(addSkill, (args: AddSkillRequest) => rpcManger.addSkill(args));
    messenger.onRequest(toggleSkill, (args: ToggleSkillRequest) => rpcManger.toggleSkill(args));
    messenger.onRequest(deleteSkill, (args: DeleteSkillRequest) => rpcManger.deleteSkill(args));
    messenger.onRequest(enableSkillFromChat, (args: SkillEnableRequest) => rpcManger.enableSkillFromChat(args));
    messenger.onRequest(cancelSkillEnable, (args: SkillEnableCancelRequest) => rpcManger.cancelSkillEnable(args));
    messenger.onRequest(parseSkillFile, (args: ParseSkillFileRequest) => rpcManger.parseSkillFile(args));
    messenger.onRequest(listMcpServers, () => rpcManger.listMcpServers());
    messenger.onRequest(setMcpServerEnabled, (args: SetMcpServerEnabledRequest) => rpcManger.setMcpServerEnabled(args));
    messenger.onRequest(openMcpConfig, (args: OpenMcpConfigRequest) => rpcManger.openMcpConfig(args));
    messenger.onRequest(addMcpServer, (args: AddMcpServerRequest) => rpcManger.addMcpServer(args));
    messenger.onRequest(updateMcpServer, (args: UpdateMcpServerRequest) => rpcManger.updateMcpServer(args));
    messenger.onRequest(deleteMcpServer, (args: DeleteMcpServerRequest) => rpcManger.deleteMcpServer(args));
    messenger.onRequest(setMcpToolsEnabled, (args: SetMcpToolsEnabledRequest) => rpcManger.setMcpToolsEnabled(args));
    messenger.onRequest(getMcpToolsEnabled, () => rpcManger.getMcpToolsEnabled());
    messenger.onRequest(getMcpWorkspaceContext, () => rpcManger.getMcpWorkspaceContext());
    messenger.onRequest(getMcpLoadErrors, () => rpcManger.getMcpLoadErrors());
    messenger.onRequest(getAgentsMdFileInfo, () => rpcManger.getAgentsMdFileInfo());
    messenger.onRequest(openOrCreateAgentsMd, () => rpcManger.openOrCreateAgentsMd());
    messenger.onRequest(listThreads, () => rpcManger.listThreads());
    messenger.onRequest(switchThread, (args: SwitchThreadRequest) => rpcManger.switchThread(args));
    messenger.onRequest(deleteThread, (args: DeleteThreadRequest) => rpcManger.deleteThread(args));
    messenger.onRequest(renameThread, (args: RenameThreadRequest) => rpcManger.renameThread(args));
    // TODO(auto-memory): temporarily disabled for this release.
    // messenger.onRequest(clearMemory, (args: ClearMemoryRequest) => rpcManger.clearMemory(args));
    // messenger.onNotification(openMemoryFiles, (args: OpenMemoryRequest) => rpcManger.openMemoryFiles(args));

    // Push updates to the webview whenever the set of running services changes.
    runningServicesManager.onChange = (services) => {
        notifyRunningServicesChanged(services);
    };
}
