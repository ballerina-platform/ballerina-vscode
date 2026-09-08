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
    AIMachineEventType,
    AIMachineSnapshot,
    AIPanelAPI,
    AIPanelPrompt,
    AbortAIGenerationRequest,
    AddFilesToProjectRequest,
    CheckpointInfo,
    Command,
    GetRunStatusRequest,
    GetRunStatusResponse,
    DocGenerationRequest,
    GenerateAgentCodeRequest,
    GenerateOpenAPIRequest,
    GetModuleDirParams,
    LLMDiagnostics,
    LoginMethod,
    OpenFileDiffRequest,
    ProcessContextTypeCreationRequest,
    PromptEnhancementRequest,
    PromptEnhancementResponse,
    RequirementSpecification,
    RestoreCheckpointRequest,
    RevertGenerationRequest,
    SemanticDiffRequest,
    SemanticDiffResponse,
    SubmitFeedbackRequest,
    TestGenerationMentions,
    UIChatMessage,
    UpdateChatMessageRequest,
    UsageResponse,
    QuotaRequestParams,
    QuotaRequestResult,
    FollowupSuggestion,
    WebToolApprovalRequest,
    CompactConversationRequest,
    CompactConversationResponse,
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
    SkillEnableStage,
    SkillEntry,
    SkillTier,
    ParseSkillFileRequest,
    ParseSkillFileResponse,
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
    CreateManagedConnectionRequest,
    CreateManagedConnectionResponse,
    // TODO(auto-memory): temporarily disabled for this release.
    // ClearMemoryRequest,
    // OpenMemoryRequest,
} from "@wso2/ballerina-core";
import {
    getAgentsMdFileInfo as getAgentsMdFileInfoImpl,
    openOrCreateAgentsMd as openOrCreateAgentsMdImpl,
} from "../../features/ai/agent/agents-md";
import { ConfigurationTarget } from "vscode";
import { getMcpClientManager, ensureMcpConfigFileExists, writeMcpServer, updateMcpServer, deleteMcpServer, isMcpToolsEnabled, MCP_ENABLE_SETTING } from "../../features/ai/agent/mcp";
import { notifyMcpServersChanged, notifyMcpLoadErrorsChanged } from "../../RPCLayer";
import * as os from "os";
import * as fs from 'fs';
import path from "path";
import * as vscode from 'vscode';
import { window, workspace } from 'vscode';
import { LOGIN_REQUIRED_WARNING, SIGN_IN_BI_COPILOT } from '../../features/ai/constants';
// TODO(auto-memory): temporarily disabled for this release.
// import {
//     getGlobalMemoryDir,
//     getMemoryDir,
//     invalidateMemoryPromptCache,
// } from '@wso2/copilot-utilities/auto-memory';
// import { computeWorkspaceHash } from '@wso2/copilot-utilities/chat-persistence';

import { isNumber } from "lodash";
import { getServiceDeclarationNames } from "../../../src/features/ai/documentation/utils";
import { AIStateMachine, openAIPanelWithPrompt } from "../../../src/views/ai-panel/aiMachine";
import { checkToken } from "../../../src/views/ai-panel/utils";
import { extension } from "../../BalExtensionContext";
import { openChatWindowWithCommand } from "../../features/ai/data-mapper/index";
import { generateDocumentationForService } from "../../features/ai/documentation/generator";
import { generateOpenAPISpec } from "../../features/ai/openapi/index";
import { BACKEND_URL } from "../../features/ai/utils";
import { fetchWithAuth } from "../../features/ai/utils/ai-client";
import { sendSaveChatNotification, sendSkillEnableNotification } from "../../features/ai/utils/ai-utils";
import { submitFeedback as submitFeedbackUtil } from "../../features/ai/utils/feedback";
import { sendGenerationDiscardTelemetry } from "../../features/ai/utils/generation-response";
import { getLLMDiagnosticArrayAsString } from "../../features/natural-programming/utils";
import { enhancePrompt as enhancePromptService } from "../../features/ai/service/prompt-enhancement/promptEnhancement";
import { StateMachine, updateView } from "../../stateMachine";
import { isInDevant, isInWI } from "../../utils";
import { getLoginMethod, isPlatformExtensionAvailable, loginGithubCopilot } from "../../utils/ai/auth";
import { cancelConnectionCallback, ConnectionSettleReason, createConnectionState, waitForConnectionCallback } from "../../utils/uri-handlers";
import { exchangeManagedConnection, initiateManagedConnection } from "../platform-ext/managed-connections";
import { normalizeCodeContext } from "../../views/ai-panel/codeContextUtils";
import { resolveActiveFilePath } from "../../views/ai-panel/activeFileContext";
import { refreshDataMapper } from "../data-mapper/utils";
import {
    TEST_DIR_NAME
} from "./constants";
import { addToIntegration, searchDocumentation } from "./utils";

import { createExecutorConfig, generateAgent, resolveProjectRootPath } from '../../features/ai/agent/index';
import { REGISTERED_SKILLS } from '../../features/ai/agent/skills/index';
import { scanProjectSkills, scanUserSkills, readUserSkillContent, readProjectSkillContent, parseSkillMd } from '../../features/ai/agent/tools/skill-tool/skill-reader';
import * as unzipper from 'unzipper';
import {
    getSkillsConfig,
    setSkillEnabled,
    writeUserSkill,
    writeProjectSkill,
    deleteUserSkill,
    deleteProjectSkill,
} from '../../features/ai/agent/tools/skill-tool/skill-writer';
import { clearCompactionDisabledWarning } from '../../features/ai/agent/AgentExecutor';
import { LLM_API_BASE_PATH, WI_EXTENSION_ID } from "../../features/ai/constants";
import { ContextTypesExecutor } from '../../features/ai/executors/datamapper/ContextTypesExecutor';
import { approvalManager } from '../../features/ai/state/ApprovalManager';
import { approvalViewManager } from '../../features/ai/state/ApprovalViewManager';
import { chatStateStorage, isRevertible } from '../../views/ai-panel/chatStateStorage';
import { runEventStore } from '../../features/ai/utils/run-event-store';
import { restoreWorkspaceSnapshot } from '../../views/ai-panel/checkpoint/checkpointUtils';
import { runningServicesManager } from '../../features/ai/agent/tools/running-service-manager';
import { executeRun } from "../../features/ai/agent/tools/ballerina-run";
import { platformExtStore } from "../platform-ext/platform-store";

/** Validate an MCP server config DTO. Returns an error message or null on success. */
function validateMcpServerConfig(cfg: any): string | null {
    if (!cfg || (cfg.type !== "stdio" && cfg.type !== "http")) {
        return "Invalid server config.";
    }
    if (cfg.type === "stdio" && (typeof cfg.command !== "string" || !cfg.command.trim())) {
        return "Command is required for stdio servers.";
    }
    if (cfg.type === "http") {
        if (typeof cfg.url !== "string" || !cfg.url.trim()) {
            return "URL is required for HTTP servers.";
        }
        try { new URL(cfg.url); } catch {
            return "URL is not a valid URL.";
        }
    }
    return null;
}

function getActiveThreadId(projectRootPath?: string): string {
    return chatStateStorage.getActiveThreadId(projectRootPath ?? resolveProjectRootPath());
}

const OAUTH_CALLBACK_TIMEOUT_MS = 3 * 60 * 1_000;

// Shown when a flow ends without a connection id. "cancelled" and "superseded" are dropped by the
// webview's run-id guard, so those only reach the log.
const CONNECTION_FAILURE_MESSAGE: Record<ConnectionSettleReason, string> = {
    callback: "Managed connection failed.",
    timeout: "Timed out waiting for the connection to be authorized. Please try again.",
    denied: "The connection was not authorized. Please try again and approve access.",
    cancelled: "Connection cancelled.",
    superseded: "Connection cancelled — a newer connection attempt was started.",
};

/**
 * A run owns the active thread until it ends, so reparenting it mid-turn would strand the
 * run's writes. The panel already disables these actions; this backstops a webview reload
 * or a click that races the turn starting.
 */
function refuseWhileRunning(projectRootPath: string, action: string): boolean {
    if (!runEventStore.hasActiveRun(projectRootPath)) {
        return false;
    }
    console.warn(`[RPC] Refused ${action} — a response is still running for: ${projectRootPath}`);
    return true;
}

export class AiPanelRpcManager implements AIPanelAPI {

    async getLoginMethod(): Promise<LoginMethod> {
        return new Promise(async (resolve) => {
            const loginMethod = await getLoginMethod();
            resolve(loginMethod);
        });
    }

    async isPlatformExtensionAvailable(): Promise<boolean> {
        return isPlatformExtensionAvailable();
    }

    async getDefaultPrompt(): Promise<AIPanelPrompt> {
        let defaultPrompt: AIPanelPrompt = extension.aiChatDefaultPrompt;

        // Normalize code context to use workspace-relative paths
        if (defaultPrompt && 'codeContext' in defaultPrompt && defaultPrompt.codeContext) {
            const smCtx = StateMachine.context();
            const workspaceRoot = smCtx.workspacePath || smCtx.projectPath;
            defaultPrompt = {
                ...defaultPrompt,
                codeContext: normalizeCodeContext(defaultPrompt.codeContext, workspaceRoot, smCtx.projectPath)
            };
        }

        return new Promise((resolve) => {
            resolve(defaultPrompt);
        });
    }

    async getAIMachineSnapshot(): Promise<AIMachineSnapshot> {
        return {
            state: AIStateMachine.state(),
            context: AIStateMachine.context(),
        };
    }

    async clearInitialPrompt(): Promise<void> {
        extension.aiChatDefaultPrompt = undefined;
    }

    async isScaffoldEnvActive(): Promise<boolean> {
        return !!(process.env.INITIAL_SCAFFOLD_PROMPT && process.env.INITIAL_SCAFFOLD_STEPS);
    }

    async getServiceNames(): Promise<TestGenerationMentions> {
        return new Promise(async (resolve, reject) => {
            try {
                const projectPath = StateMachine.context().projectPath;
                if (!projectPath) {
                    resolve({ mentions: [] });
                    return;
                }
                const serviceDeclNames = await getServiceDeclarationNames(projectPath);
                resolve({
                    mentions: serviceDeclNames
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async getFromDocumentation(content: string): Promise<string> {
        return new Promise(async (resolve, reject) => {
            try {
                const response = await searchDocumentation(content);
                resolve(response.toString());
            } catch (error) {
                reject(error);
            }
        });
    }

    async promptGithubAuthorize(): Promise<boolean> {
        return await loginGithubCopilot();
        //Change state to notify?
        // return true;
    }

    async isCopilotSignedIn(): Promise<boolean> {
        const token = await extension.context.secrets.get('GITHUB_COPILOT_TOKEN');
        if (token && token !== '') {
            return true;
        }
        return false;
    }

    async showSignInAlert(): Promise<boolean> {
        // Don't show alert in WI environment (WSO2 Integrator extension is installed)
        const inWI = isInWI();
        if (inWI) {
            return false;
        }

        // Don't show alert in Devant environment
        if (isInDevant()) {
            return false;
        }

        // Check if alert was already dismissed
        const resp = await extension.context.secrets.get('LOGIN_ALERT_SHOWN');
        if (resp === 'true') {
            return false;
        }

        const isWso2Signed = await this.isCopilotSignedIn();
        if (isWso2Signed) {
            return false;
        }

        return true;
    }

    async markAlertShown(): Promise<void> {
        await extension.context.secrets.store('LOGIN_ALERT_SHOWN', 'true');
    }

    async updateRequirementSpecification(requirementsSpecification: RequirementSpecification) {
        const naturalProgrammingDir = path.join(StateMachine.context().projectPath, 'natural-programming');
        const requirementsFilePath = path.join(naturalProgrammingDir, 'requirements.txt');

        // Create the 'natural-programming' directory if it doesn't exist
        if (!fs.existsSync(naturalProgrammingDir)) {
            fs.mkdirSync(naturalProgrammingDir, { recursive: true });
        }

        // Write the requirements to the 'requirements.txt' file
        fs.writeFileSync(requirementsFilePath, requirementsSpecification.content, 'utf8');
    }

    async getDriftDiagnosticContents(): Promise<LLMDiagnostics> {
        const result = await getLLMDiagnosticArrayAsString(StateMachine.context().projectPath);
        if (isNumber(result)) {
            return {
                statusCode: result,
                diags: "Failed to check drift between the code and the documentation. Please try again."
            };
        }

        return {
            statusCode: 200,
            diags: result
        };
    }

    async createTestDirecoryIfNotExists() {
        const testDirName = path.join(StateMachine.context().projectPath, TEST_DIR_NAME);
        if (!fs.existsSync(testDirName)) {
            fs.mkdirSync(testDirName, { recursive: true }); // Add recursive: true
        }
    }

    async getModuleDirectory(params: GetModuleDirParams): Promise<string> {
        return new Promise((resolve) => {
            const projectFsPath = params.filePath;
            const moduleName = params.moduleName;
            const generatedPath = path.join(projectFsPath, "generated", moduleName);
            if (fs.existsSync(generatedPath) && fs.statSync(generatedPath).isDirectory()) {
                resolve("generated");
            } else {
                resolve("modules");
            }
        });
    }

    async submitFeedback(content: SubmitFeedbackRequest): Promise<boolean> {
        return await submitFeedbackUtil(content);
    }

    async generateOpenAPI(params: GenerateOpenAPIRequest): Promise<void> {
        await generateOpenAPISpec(params);
    }

    async abortAIGeneration(params: AbortAIGenerationRequest): Promise<void> {
        const projectRootPath = params?.projectRootPath || resolveProjectRootPath();
        // Callers pass `{}` (see AIChat's stop button), so falling back to a
        // hardcoded 'default' aborted a thread that holds no execution.
        const threadId = params?.threadId || getActiveThreadId(projectRootPath);

        const aborted = chatStateStorage.abortActiveExecution(projectRootPath, threadId);

        if (aborted) {
            console.log(`[RPC] Aborted execution for projectRootPath=${projectRootPath}, thread=${threadId}`);
        } else {
            console.warn(`[RPC] No active execution found for projectRootPath=${projectRootPath}, thread=${threadId}`);
        }
    }

    async getGeneratedDocumentation(params: DocGenerationRequest): Promise<void> {
        await generateDocumentationForService(params);
    }

    async addFilesToProject(params: AddFilesToProjectRequest): Promise<boolean> {
        try {
            let projectPath = StateMachine.context().projectPath;
            const workspacePath = StateMachine.context().workspacePath;
            if (workspacePath) {
                projectPath = workspacePath;
            }

            const ballerinaProjectFile = path.join(projectPath, "Ballerina.toml");
            if (!fs.existsSync(ballerinaProjectFile)) {
                throw new Error("Not a Ballerina project.");
            }
            await addToIntegration(projectPath, params.fileChanges);

            const context = StateMachine.context();
            const dataMapperMetadata = context.dataMapperMetadata;
            if (!dataMapperMetadata || !dataMapperMetadata.codeData) {
                updateView();
                return true;
            }

            // Refresh data mapper with the updated code
            let filePath = dataMapperMetadata.codeData.lineRange?.fileName;
            const varName = dataMapperMetadata.name;
            if (!filePath || !varName) {
                updateView();
                return true;
            }

            await refreshDataMapper(filePath, dataMapperMetadata.codeData, varName);
            return true;
        } catch (error) {
            console.error(">>> Failed to add files to the project", error);
            return false; //silently fail for timeout issues.
        }
    }

    async generateContextTypes(params: ProcessContextTypeCreationRequest): Promise<void> {
        try {
            // existingTempPath: operate on the real workspace directly, no temp copy.
            const config = createExecutorConfig(params, {
                command: Command.TypeCreator,
                chatStorageEnabled: true,  // Enable chat storage for checkpoint support
                cleanupStrategy: 'immediate',
                existingTempPath: resolveProjectRootPath(),
            });

            await new ContextTypesExecutor(config).run();
        } catch (error) {
            console.error('[RPC Manager] Error in generateContextTypes:', error);
            throw error;
        }
    }

    async openChatWindowWithCommand(): Promise<void> {
        await openChatWindowWithCommand();
    }

    async isUserAuthenticated(): Promise<boolean> {
        try {
            const token = await checkToken();
            return !!token;
        } catch (error) {
            return false;
        }
    }

    async enhancePrompt(params: PromptEnhancementRequest): Promise<PromptEnhancementResponse> {
        return await enhancePromptService(params);
    }

    promptForLogin(): void {
        window.showWarningMessage(LOGIN_REQUIRED_WARNING, SIGN_IN_BI_COPILOT).then(selection => {
            if (selection === SIGN_IN_BI_COPILOT) {
                AIStateMachine.service().send(AIMachineEventType.LOGIN);
            }
        });
    }

    async generateAgent(params: GenerateAgentCodeRequest): Promise<boolean> {
        const smCtx = StateMachine.context();
        const workspaceRoot = smCtx.workspacePath || smCtx.projectPath;

        // Contextual mini-chat launches bypass getDefaultPrompt(), where panel
        // launches normally convert the diagram's absolute file path to the
        // workspace-relative path expected by the agent.
        if (params.codeContext && path.isAbsolute(params.codeContext.filePath)) {
            params = {
                ...params,
                codeContext: normalizeCodeContext(params.codeContext, workspaceRoot, smCtx.projectPath),
            };
        }

        params = {
            ...params,
            // Always overwrite client input with a host-validated path.
            activeFilePath: resolveActiveFilePath(
                params.promptSource,
                smCtx.documentUri,
                workspaceRoot,
                smCtx.projectPath,
            ),
        };
        return await generateAgent(params);
    }

    async openAIPanel(params: AIPanelPrompt): Promise<void> {
        openAIPanelWithPrompt(params);
    }

    async getSemanticDiff(params: SemanticDiffRequest): Promise<SemanticDiffResponse> {
        const context = StateMachine.context();
        console.log(">>> requesting semantic diff from ls", JSON.stringify(params));
        try {
            const res: SemanticDiffResponse = await context.langClient.getSemanticDiff(params);
            console.log(">>> semantic diff response from ls", JSON.stringify(res));
            return res;
        } catch (error) {
            console.log(">>> error in getting semantic diff", error);
            return undefined;
        }
    }

    async isWorkspaceProject(): Promise<boolean> {
        const context = StateMachine.context();
        const isWorkspace = context.projectInfo?.projectKind === 'WORKSPACE_PROJECT';
        console.log(`>>> isWorkspaceProject: ${isWorkspace}`);
        return isWorkspace;
    }

    async revertGeneration(params: RevertGenerationRequest): Promise<void> {
        try {
            const projectRootPath = resolveProjectRootPath();
            // Resolve the thread from the generation the bar names, not the active-thread pointer:
            // another thread can hold its own revertible generation.
            const located = chatStateStorage.findGenerationScope(projectRootPath, params.generationId);
            const doneGeneration = located?.generation;
            if (!located || !isRevertible(doneGeneration)) {
                console.warn(`[Review Actions] Not a revertible generation: ${params.generationId}`);
                return;
            }
            const threadId = located.threadId;

            console.log(`[Review Actions] Reverting generation ${doneGeneration.id}`);

            // Restore workspace to state before this generation ran. Without a checkpoint
            // (checkpoints disabled, or the workspace exceeded the snapshot size cap)
            // nothing can be restored — that must fail loudly rather than mark the
            // generation reverted and tell the model files were restored when they weren't.
            const checkpoint = doneGeneration.checkpoint;
            if (!checkpoint) {
                const reason = "No checkpoint exists for this generation (checkpoints may be disabled, or the workspace exceeded the snapshot size limit), so the changes cannot be reverted automatically. Use source control to undo them if needed.";
                console.error(`[Review Actions] Revert refused for ${doneGeneration.id}: ${reason}`);
                window.showErrorMessage(`Could not revert the Copilot changes: ${reason}`);
                throw new Error(reason);
            }
            // restoreWorkspaceSnapshot reports its own failures to the user but does not throw, so a
            // failed applyEdit must not fall through to marking the generation reverted and telling
            // the model the files were restored when they weren't — the same refusal as no checkpoint.
            const restored = await restoreWorkspaceSnapshot(checkpoint, true);
            if (!restored) {
                const reason = "Restoring the workspace to the pre-generation checkpoint failed, so the changes were not reverted. Use source control to undo them if needed.";
                console.error(`[Review Actions] Revert refused for ${doneGeneration.id}: ${reason}`);
                throw new Error(reason);
            }

            // Append revert notification to model messages so the LLM knows changes were reverted
            const existingMessages = doneGeneration.modelMessages || [];
            chatStateStorage.updateGeneration(projectRootPath, threadId, doneGeneration.id, {
                modelMessages: [
                    ...existingMessages,
                    {
                        role: "user",
                        content: `<revert_notification>
User reverted the last made changes. The files have been restored to the state before this generation.
</revert_notification>`,
                    },
                ],
            });

            chatStateStorage.revertLastGeneration(projectRootPath, threadId);
            console.log(`[Review Actions] Reverted generation: ${doneGeneration.id}`);

            // Drop the manager's cached review for this generation so a queued/late
            // navigation cannot reopen the just-reverted diff.
            approvalViewManager.clearReviewData(doneGeneration.id);

            sendGenerationDiscardTelemetry(doneGeneration.id);

            sendSaveChatNotification(Command.Agent, doneGeneration.id);
        } catch (error) {
            console.error("[Review Actions] Error reverting generation:", error);
            throw error;
        }
    }

    async approvePlan(params: { requestId: string; comment?: string }): Promise<void> {
        approvalManager.resolvePlanApproval(params.requestId, true, params.comment);
    }

    async declinePlan(params: { requestId: string; comment?: string }): Promise<void> {
        approvalManager.resolvePlanApproval(params.requestId, false, params.comment);
    }

    async approveTask(params: { requestId: string; approvedTaskDescription?: string }): Promise<void> {
        approvalManager.resolveTaskApproval(params.requestId, true, undefined, params.approvedTaskDescription);
    }

    async declineTask(params: { requestId: string; comment?: string }): Promise<void> {
        approvalManager.resolveTaskApproval(params.requestId, false, params.comment);
    }

    async provideConnectorSpec(params: { requestId: string; spec: any }): Promise<void> {
        approvalManager.resolveConnectorSpec(params.requestId, true, params.spec);
    }

    async cancelConnectorSpec(params: { requestId: string; comment?: string }): Promise<void> {
        approvalManager.resolveConnectorSpec(params.requestId, false, undefined, params.comment);
    }

    async provideConfiguration(params: { requestId: string; configValues: Record<string, string> }): Promise<void> {
        approvalManager.resolveConfiguration(params.requestId, true, params.configValues);
    }

    async cancelConfiguration(params: { requestId: string; comment?: string }): Promise<void> {
        approvalManager.resolveConfiguration(params.requestId, false, undefined, params.comment);
    }

    async createManagedConnection(params: CreateManagedConnectionRequest): Promise<CreateManagedConnectionResponse> {
        console.log(`[ManagedConnection] start — vendor='${params.vendor}'`);

        // Unreachable in practice — no managed group means no button — but guard anyway.
        if (!extension.ballerinaExtInstance.enabledExperimentalFeatures()) {
            console.log("[ManagedConnection] experimental features are off — managed connections are unavailable. Aborting.");
            return { success: false, error: "Managed connections are an experimental feature." };
        }

        try {
            // 1. Ask the service which URL to open. `params.vendor` is already the backend
            //    provider key, resolved from the managed registry.
            //
            // The redirect URI carries a per-flow nonce (see uri-handlers). NOTE: this makes it
            // carry a query string, so the service's allow-listed redirect check must tolerate
            // the extra `state` param and append its own id with '&'.
            const connectionState = createConnectionState();
            const redirectUri = `${vscode.env.uriScheme}://wso2.ballerina/oauth-callback?state=${connectionState}`;
            console.log(`[ManagedConnection] step 1 — initiate: provider='${params.vendor}', redirectUri='${redirectUri}'`);
            const initiate = await initiateManagedConnection({ provider: params.vendor, redirectUri });
            console.log(`[ManagedConnection] step 1 done — next='${initiate?.next}'`);

            // `next` decides which URL to open. "select" means the org already has a connection
            // for this provider, so the service offers the selection page to reuse it rather than
            // authorizing a duplicate; that page delivers a connection id to the same redirect,
            // so from here both branches are identical.
            const nextUrl = initiate?.next === "select" ? initiate.selectionUrl : initiate?.authorizeUrl;
            if (!nextUrl) {
                console.log(`[ManagedConnection] initiate returned next='${initiate?.next}' with no matching URL. Aborting.`);
                return { success: false, error: `Could not start a managed connection for '${params.vendor}'.` };
            }

            // 2. Open the browser and wait for the redirect callback carrying the connection id.
            //    The service 302s back to redirectUri with the id appended.
            //
            //    The waiter is registered before the browser opens: a callback that arrives with
            //    no flow pending is dropped, and the service can redirect straight back.
            console.log(`[ManagedConnection] step 2 — opening ${initiate.next === "select" ? "connection selection" : "vendor consent"} and waiting for oauth-callback...`);
            const callback = waitForConnectionCallback(connectionState, OAUTH_CALLBACK_TIMEOUT_MS);
            let browserOpened = false;
            try {
                browserOpened = await vscode.env.openExternal(vscode.Uri.parse(nextUrl));
            } catch (err) {
                console.error("[ManagedConnection] step 2 — openExternal threw:", (err as Error)?.message ?? err);
            }
            if (!browserOpened) {
                // Release the waiter, otherwise the user sits out the full timeout and is told the
                // OAuth flow timed out when it never started.
                cancelConnectionCallback();
                return { success: false, error: "Could not open a browser to complete the connection." };
            }

            const { connectionId, reason } = await callback;
            if (!connectionId) {
                console.log(`[ManagedConnection] step 2 — no connection id (reason='${reason}'). Aborting.`);
                return { success: false, error: CONNECTION_FAILURE_MESSAGE[reason] };
            }
            console.log(`[ManagedConnection] step 2 done — received connectionId='${connectionId}'.`);

            // 3. Exchange the connection id for the credentials.
            console.log("[ManagedConnection] step 3 — exchange...");
            const credentials = await exchangeManagedConnection(connectionId);
            console.log(`[ManagedConnection] step 3 done — kind='${credentials?.kind}'.`);

            // Never write bot-token creds into a refresh config (or vice-versa) if the group was
            // mislabeled upstream.
            const expectedKind = params.authType === "staticToken" ? "bearer" : "oauth2_refresh";
            if (credentials.kind !== expectedKind) {
                console.log(`[ManagedConnection] kind mismatch — expected '${expectedKind}', got '${credentials.kind}'. Aborting.`);
                return { success: false, error: `Expected ${expectedKind} credentials but the service returned '${credentials.kind}'.` };
            }

            if (credentials.kind === "oauth2_refresh") {
                if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken || !credentials.tokenEndpoint) {
                    console.log("[ManagedConnection] incomplete refresh credentials in exchange response. Aborting.");
                    return { success: false, error: "Managed token service returned incomplete OAuth credentials." };
                }
                console.log("[ManagedConnection] success — returning refresh credentials to the config collector.");
                return {
                    success: true,
                    credentials: {
                        clientId: credentials.clientId,
                        clientSecret: credentials.clientSecret,
                        refreshToken: credentials.refreshToken,
                        // The proxy /token endpoint the connector uses to refresh — returned by
                        // the service per connection rather than hardcoded.
                        refreshUrl: credentials.tokenEndpoint,
                    },
                };
            }

            if (credentials.kind === "bearer") {
                if (!credentials.accessToken) {
                    console.log("[ManagedConnection] empty bearer token in exchange response. Aborting.");
                    return { success: false, error: "Managed token service returned an empty static token." };
                }
                console.log("[ManagedConnection] success — returning static token to the config collector.");
                return {
                    success: true,
                    credentials: {
                        // Auto-fills the connector's single token configurable (bot/bearer/static).
                        token: credentials.accessToken,
                    },
                };
            }

            console.log(`[ManagedConnection] unsupported credential kind '${credentials.kind}'. Aborting.`);
            return { success: false, error: `Unsupported credential kind '${credentials.kind}'.` };
        } catch (err) {
            // managed-connections.ts has already logged the URL, HTTP status and response body — the
            // detail the bare message drops. What surfaces here is the user-facing summary.
            const message = (err as Error)?.message ?? String(err);
            console.error("[ManagedConnection] flow failed:", message);
            return { success: false, error: message || "Failed to create a managed connection." };
        }
    }

    cancelManagedConnection(): void {
        // The user closed the consent tab (or gave up). Release the waiting
        // createManagedConnection immediately instead of holding them for the full callback
        // timeout; it returns a failure the webview discards as a user-initiated cancel.
        console.log("[ManagedConnection] cancelled by user — abandoning the pending callback wait.");
        cancelConnectionCallback();
    }

    async approveWebTool(params: WebToolApprovalRequest): Promise<void> {
        approvalManager.resolveWebToolApproval(params.requestId, true);
    }

    async declineWebTool(params: WebToolApprovalRequest): Promise<void> {
        approvalManager.resolveWebToolApproval(params.requestId, false);
    }

    async submitClarifyAnswer(params: ClarifyAnswerRequest): Promise<void> {
        approvalManager.resolveClarify(params.requestId, true, params.answers);
    }

    async cancelClarify(params: ClarifyCancelRequest): Promise<void> {
        approvalManager.resolveClarify(params.requestId, false);
    }

    async restoreCheckpoint(params: RestoreCheckpointRequest): Promise<void> {
        // Get project root path and thread identifiers
        const projectRootPath = resolveProjectRootPath();
        const threadId = chatStateStorage.getActiveThreadId(resolveProjectRootPath());

        // Find the checkpoint
        const found = chatStateStorage.findCheckpoint(projectRootPath, threadId, params.checkpointId);

        if (!found) {
            if (chatStateStorage.hasCompactedHistory(projectRootPath, threadId)) {
                window.showWarningMessage(
                    "This conversation was compacted to manage memory. Undo points prior to compaction are unavailable."
                );
                throw new Error("Checkpoint unavailable due to compaction");
            }
            throw new Error(`Checkpoint ${params.checkpointId} not found`);
        }

        const { checkpoint } = found;

        // 1. Restore workspace files from checkpoint snapshot.
        // restoreWorkspaceSnapshot reports its own failures to the user but does not throw, so a
        // failed restore must not fall through to truncating the thread history — that loss is
        // irreversible while the files would stay unchanged.
        const workspaceRestored = await restoreWorkspaceSnapshot(checkpoint);
        if (!workspaceRestored) {
            throw new Error('Restoring the workspace from the checkpoint failed; the conversation was not rewound.');
        }

        // 2. Truncate thread history to this checkpoint
        const restored = chatStateStorage.restoreThreadToCheckpoint(
            projectRootPath,
            threadId,
            params.checkpointId
        );

        if (!restored) {
            throw new Error('Failed to restore thread to checkpoint');
        }
    }

    async clearChat(): Promise<void> {
        const projectRootPath = resolveProjectRootPath();
        if (refuseWhileRunning(projectRootPath, 'clearChat')) { return; }
        // Create a new thread — preserves all existing history
        const newThreadId = chatStateStorage.createNewThread(projectRootPath);
        clearCompactionDisabledWarning(projectRootPath, newThreadId);
        console.log(`[RPC] New chat started (thread: ${newThreadId}) for: ${projectRootPath}`);
    }

    async listThreads(): Promise<ThreadSummary[]> {
        const projectRootPath = resolveProjectRootPath();
        return chatStateStorage.listThreadsSummary(projectRootPath);
    }

    async switchThread(params: SwitchThreadRequest): Promise<void> {
        const projectRootPath = resolveProjectRootPath();
        if (refuseWhileRunning(projectRootPath, 'switchThread')) { return; }
        chatStateStorage.switchToThread(projectRootPath, params.threadId);
    }

    async deleteThread(params: DeleteThreadRequest): Promise<void> {
        const projectRootPath = resolveProjectRootPath();
        if (refuseWhileRunning(projectRootPath, 'deleteThread')) { return; }
        await chatStateStorage.deleteThread(projectRootPath, params.threadId);
    }

    async renameThread(params: RenameThreadRequest): Promise<void> {
        chatStateStorage.renameThread(resolveProjectRootPath(), params.threadId, params.name);
    }

    // TODO(auto-memory): memory management temporarily disabled for this release — restore once the memory feature is refined.
    // async clearMemory(params: ClearMemoryRequest): Promise<void> {
    //     const projectRootPath = resolveProjectRootPath();
    //     const workspaceHash = computeWorkspaceHash(resolveWorkspaceIdentity(projectRootPath));
    //     const wipeDir = (dir: string) => {
    //         try {
    //             for (const f of fs.readdirSync(dir)) {
    //                 if (f.endsWith('.md') || f === '.consolidate-lock') {
    //                     try { fs.unlinkSync(path.join(dir, f)); } catch { /* best-effort */ }
    //                 }
    //             }
    //         } catch { /* dir may not exist yet */ }
    //     };
    //     if (params.scope === 'all') { wipeDir(getGlobalMemoryDir()); }
    //     wipeDir(getMemoryDir(workspaceHash));
    //     invalidateMemoryPromptCache(workspaceHash);
    // }
    //
    // async openMemoryFiles(params: OpenMemoryRequest): Promise<void> {
    //     const projectRootPath = resolveProjectRootPath();
    //     const workspaceHash = computeWorkspaceHash(resolveWorkspaceIdentity(projectRootPath));
    //     const dir = params.scope === 'global'
    //         ? getGlobalMemoryDir()
    //         : getMemoryDir(workspaceHash);
    //     const indexPath = path.join(dir, 'MEMORY.md');
    //     if (fs.existsSync(indexPath)) {
    //         await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(indexPath));
    //         return;
    //     }
    //     // MEMORY.md is missing — fall back to opening any topic file so the user
    //     let firstTopicFile: string | undefined;
    //     try {
    //         firstTopicFile = fs.readdirSync(dir)
    //             .find(f => f.endsWith('.md') && f !== 'MEMORY.md' && !f.startsWith('.'));
    //     } catch { /* dir may not exist yet */ }
    //     if (firstTopicFile) {
    //         await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(dir, firstTopicFile)));
    //         return;
    //     }
    //     vscode.window.showInformationMessage('No memories saved yet for this scope.');
    // }

    async updateChatMessage(params: UpdateChatMessageRequest): Promise<void> {
        const projectRootPath = params.projectRootPath || resolveProjectRootPath();
        let threadId = params.threadId
            || chatStateStorage.getActiveThreadId(projectRootPath);

        // The messageId is actually a generation ID. Legacy callers do not send
        // a thread, so locate the generation by its stable ID rather than trusting
        // the mutable active-thread pointer.
        let generation = chatStateStorage.getGeneration(projectRootPath, threadId, params.messageId);
        if (!generation && !params.threadId) {
            const located = chatStateStorage.findGenerationScope(projectRootPath, params.messageId);
            if (located) {
                threadId = located.threadId;
                generation = located.generation;
            }
        }

        if (!generation) {
            throw new Error(`[RPC] Generation ${params.messageId} not found in thread ${threadId}`);
        }

        // Persist first. ChatStateStorage reports disk failures so the replay
        // buffer remains available for another reconnect attempt.
        const persisted = chatStateStorage.updateGeneration(projectRootPath, threadId, params.messageId, {
            uiResponse: params.content
        });
        if (!persisted) {
            throw new Error(`[RPC] Failed to persist generation ${params.messageId}`);
        }

        // Intermediate save_chat events encountered during a finished-run replay
        // must not clear the only recovery source. The reconnect's final write
        // explicitly clears it after the fully rebuilt transcript is durable.
        const active = chatStateStorage.getActiveExecution(projectRootPath, threadId);
        if (params.clearRunBuffer !== false && active?.generationId !== params.messageId) {
            runEventStore.clearBuffer(projectRootPath, threadId, params.messageId);
        }

        console.log(`[RPC] Updated generation ${params.messageId} UI response`);
    }

    async getChatMessages(): Promise<UIChatMessage[]> {
        const projectRootPath = resolveProjectRootPath();
        const threadId = chatStateStorage.getActiveThreadId(resolveProjectRootPath());

        // Get all generations from chat storage
        const generations = chatStateStorage.getGenerations(projectRootPath, threadId);

        // Convert generations to UI messages format
        const uiMessages: UIChatMessage[] = [];
        for (const generation of generations) {
            // Add user message
            uiMessages.push({
                role: 'user',
                content: generation.userPrompt,
                checkpointId: generation.checkpoint?.id,
                messageId: generation.id
            });

            // Add assistant message if available
            if (generation.uiResponse) {
                uiMessages.push({
                    role: 'assistant',
                    content: generation.uiResponse,
                    messageId: generation.id,
                    // Never hand the panel a 'done' it cannot act on, or the bar renders live
                    // with dead buttons.
                    generationStatus: generation.reviewState.status === 'done' && !isRevertible(generation)
                        ? 'accepted'
                        : generation.reviewState.status
                });
            }
        }

        return uiMessages;
    }

    async getCheckpoints(): Promise<CheckpointInfo[]> {
        const projectRootPath = resolveProjectRootPath();
        const threadId = chatStateStorage.getActiveThreadId(resolveProjectRootPath());

        // Get checkpoints from ChatStateStorage
        const checkpoints = chatStateStorage.getCheckpoints(projectRootPath, threadId);

        // Convert to CheckpointInfo format
        return checkpoints.map(cp => ({
            id: cp.id,
            messageId: cp.messageId,
            timestamp: cp.timestamp,
            snapshotSize: cp.snapshotSize
        }));
    }

    async getActiveTempDir(): Promise<string> {
        const projectRootPath = resolveProjectRootPath();
        const threadId = chatStateStorage.getActiveThreadId(resolveProjectRootPath());

        // Always get tempProjectPath from the currently open ('done') generation
        const doneGeneration = chatStateStorage.getDoneGeneration(projectRootPath, threadId);
        if (!doneGeneration || !doneGeneration.reviewState.tempProjectPath) {
            console.log(">>> no open generation or temp project path found for semantic diff");
            return undefined;
        }

        const projectPath = doneGeneration.reviewState.tempProjectPath;
        console.log(">>> active temp project path", projectPath);
        return projectPath;
    }

    async getRunStatus(params: GetRunStatusRequest): Promise<GetRunStatusResponse> {
        const projectRootPath = params?.projectRootPath || resolveProjectRootPath();
        // Runs execute (and buffer their events) under the active thread — resolve
        // it the same way generateAgent does, or a reconnect on a non-default
        // thread would look up an empty buffer.
        const threadId = params?.threadId
            || chatStateStorage.getActiveThreadId(projectRootPath);
        const status = runEventStore.getRunStatus(projectRootPath, threadId, params?.sinceSeq);
        // Generation storage is materialized before beginRun, so the prompt and
        // mode are authoritative even when reconnect happens before the first event.
        const generation = status.generationId
            ? chatStateStorage.getGeneration(projectRootPath, threadId, status.generationId)
            : undefined;
        return {
            ...status,
            projectRootPath,
            threadId,
            isPlanMode: generation?.metadata?.isPlanMode,
            userPrompt: generation?.userPrompt,
            // Interactive prompts still awaiting an answer — lets the reopened panel
            // re-surface only still-pending prompts during replay and skip resolved ones.
            pendingRequestIds: approvalManager.getPendingRequestIds(),
        };
    }

    async getLatestFollowupSuggestions(): Promise<FollowupSuggestion[]> {
        const projectRootPath = resolveProjectRootPath();
        // Read the thread directly: getGenerations() would create and persist an empty thread if
        // this one is no longer in memory.
        const thread = chatStateStorage.getWorkspaceState(projectRootPath)?.threads.get(getActiveThreadId(projectRootPath));
        return thread?.generations[thread.generations.length - 1]?.followupSuggestions ?? [];
    }

    async compactConversation(_params: CompactConversationRequest): Promise<CompactConversationResponse> {
        // Manual compaction is no longer supported. Context is managed automatically
        // server-side via the compact_20260112 API during agent execution.
        return {
            success: false,
            error: 'Manual compaction is not available. Context is automatically managed by the server during agent execution.',
        };
    }

    async getShowContextUsage(): Promise<boolean> {
        return workspace.getConfiguration('ballerina.copilot').get<boolean>('showContextUsage', false);
    }

    async getUsage(): Promise<UsageResponse | undefined> {
        const loginMethod = await getLoginMethod();
        if (loginMethod !== LoginMethod.BI_INTEL) {
            return undefined;
        }
        try {
            const url = BACKEND_URL + LLM_API_BASE_PATH + "/usage";
            const response = await fetchWithAuth(url, { method: "GET" });
            if (response && response.ok) {
                const data = await response.json() as UsageResponse;
                const orgId = platformExtStore.getState().state?.selectedContext?.org?.uuid;
                return { ...data, orgId };
            }
            console.error("Failed to fetch usage: ", response?.status, response?.statusText);
            return undefined;
        } catch (error) {
            console.error("Failed to fetch usage:", error);
            return undefined;
        }
    }

    async requestQuota(params: QuotaRequestParams): Promise<QuotaRequestResult> {
        const loginMethod = await getLoginMethod();
        if (loginMethod !== LoginMethod.BI_INTEL) {
            return { status: "failed" };
        }
        const email = platformExtStore.getState().state?.userInfo?.userEmail;
        if (!email) {
            console.error("Failed to submit quota request: no account email available");
            return { status: "failed" };
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
            const url = BACKEND_URL + LLM_API_BASE_PATH + "/quota-requests";
            const response = await fetchWithAuth(url, {
                method: "POST",
                body: JSON.stringify({ note: params.note, email }),
                signal: controller.signal,
            });
            if (response?.status === 201) {
                return { status: "submitted" };
            }
            if (response?.status === 409) {
                return { status: "already_requested" };
            }
            console.error("Failed to submit quota request: ", response?.status, response?.statusText);
            return { status: "failed" };
        } catch (error) {
            console.error("Failed to submit quota request:", error);
            return { status: "failed" };
        } finally {
            clearTimeout(timeout);
        }
    }

    private static diffContentProviderRegistered = false;
    private static diffContentMap = new Map<string, string>();

    private static registerDiffContentProvider() {
        if (AiPanelRpcManager.diffContentProviderRegistered) { return; }
        const provider: vscode.TextDocumentContentProvider = {
            provideTextDocumentContent(uri: vscode.Uri): string {
                return AiPanelRpcManager.diffContentMap.get(uri.toString()) ?? '';
            }
        };
        extension.context.subscriptions.push(
            vscode.workspace.registerTextDocumentContentProvider('bi-diff', provider)
        );
        AiPanelRpcManager.diffContentProviderRegistered = true;
    }

    async openFileDiff(params: OpenFileDiffRequest): Promise<void> {
        AiPanelRpcManager.registerDiffContentProvider();

        const projectRootPath = resolveProjectRootPath();
        const generation = chatStateStorage.findGenerationScope(projectRootPath, params.generationId)?.generation;
        // Direct-edit mode edits the workspace in place, so the review root is the workspace root —
        // re-derived rather than restored, since a persisted absolute path can outlive its workspace.
        const tempProjectPath = generation?.reviewState.tempProjectPath ?? projectRootPath;

        if (!generation) {
            console.error("[openFileDiff] No generation for generationId:", params.generationId);
            return;
        }

        const modifiedFilePath = path.resolve(tempProjectPath, params.relativePath);

        if (!modifiedFilePath.startsWith(tempProjectPath + path.sep)) {
            console.error("[openFileDiff] Path escapes temp project root, rejecting");
            return;
        }

        // Clear previous diff entries to prevent unbounded memory growth
        AiPanelRpcManager.diffContentMap.clear();

        // Read original content from checkpoint snapshot — workspace already has generated code
        const snapshotKey = params.relativePath.split(path.sep).join('/');
        const originalContent = generation?.checkpoint?.workspaceSnapshot?.[snapshotKey] ?? '';

        let modifiedContent = '';
        try {
            modifiedContent = fs.readFileSync(modifiedFilePath, 'utf8');
        } catch (error) {
            console.error("[openFileDiff] Error reading modified file:", error);
            return;
        }

        const fileName = path.basename(params.relativePath);
        const ts = Date.now();
        const originalUri = vscode.Uri.parse(`bi-diff:original/${fileName}?${ts}`);
        const modifiedUri = vscode.Uri.parse(`bi-diff:modified/${fileName}?${ts}`);

        AiPanelRpcManager.diffContentMap.set(originalUri.toString(), originalContent);
        AiPanelRpcManager.diffContentMap.set(modifiedUri.toString(), modifiedContent);

        const title = `${fileName} (Review Diff)`;
        await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title, {
            viewColumn: vscode.ViewColumn.One,
        });
    }

    async getRunningServices(): Promise<RunningServiceInfo[]> {
        return runningServicesManager.getAll();
    }

    async stopRunningService(params: StopRunningServiceRequest): Promise<boolean> {
        return runningServicesManager.stopOne(params.taskId);
    }

    async runService(params: RunServiceRequest): Promise<boolean> {
        const { tempProjectPath, packagePath } = params;
        try {
            const result = await executeRun(
                {
                    runType: "service",
                    packagePath: packagePath,
                },
                tempProjectPath,
                runningServicesManager
            );
            if (!result || result.status !== 'started') {
                window.showErrorMessage(`Failed to start service${packagePath ? ` in package ${packagePath}` : ''}.`);
                return false;
            }
            return true;
        } catch (error) {
            console.error("[runService] Failed to start required services:", error);
            window.showErrorMessage(`Failed to start service${packagePath ? ` in package ${packagePath}` : ''}.`);
            return false;
        }
    }

    async getDefaultVertexCredsPath(): Promise<string> {
        const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (fromEnv && fs.existsSync(fromEnv)) {
            return fromEnv;
        }
        const adcPath = process.platform === "win32"
            ? path.join(process.env.APPDATA || "", "gcloud", "application_default_credentials.json")
            : path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json");
        if (fs.existsSync(adcPath)) {
            return adcPath;
        }
        return "";
    }

    // ── Skills helpers ────────────────────────────────────────────────────────

    /** Extracts the bare skill name from a prefixed id such as "user/foo" → "foo". */
    private extractBareSkillName(skillId: string): string {
        const slash = skillId.indexOf('/');
        return slash !== -1 ? skillId.slice(slash + 1) : skillId;
    }

    private buildBuiltinSkillEntries(allDisabled: Set<string>, allEnabled: Set<string>): SkillEntry[] {
        return REGISTERED_SKILLS.map(s => {
            let enabled: boolean;
            if (s.optional === false) {
                enabled = true;
            } else if (s.default === false) {
                enabled = allEnabled.has(s.name);
            } else {
                enabled = !allDisabled.has(s.name);
            }
            return {
                id: s.name,
                name: s.name,
                trigger: s.trigger,
                tier: SkillTier.BUILTIN,
                enabled,
                optional: s.optional,
                commandTemplates: s.commandTemplates,
                skillCommand: s.skillCommand,
            };
        });
    }

    private buildProjectSkillEntries(projectRootPath: string, allDisabled: Set<string>): SkillEntry[] {
        return scanProjectSkills(projectRootPath).map(s => {
            const content = readProjectSkillContent(projectRootPath, s.name);
            return {
                id: s.name,
                name: s.name,
                trigger: s.trigger,
                body: content?.content !== content?.trigger ? content?.content : undefined,
                tier: SkillTier.PROJECT,
                enabled: !allDisabled.has(s.name),
            };
        });
    }

    private buildUserSkillEntries(allDisabled: Set<string>): SkillEntry[] {
        return scanUserSkills().map(s => {
            const content = readUserSkillContent(s.name);
            return {
                id: s.name,
                name: s.name,
                trigger: s.trigger,
                body: content?.content !== content?.trigger ? content?.content : undefined,
                tier: SkillTier.USER,
                enabled: !allDisabled.has(s.name),
            };
        });
    }

    async getSkills(): Promise<GetSkillsResponse> {
        const projectRootPath = resolveProjectRootPath();
        const config = getSkillsConfig(projectRootPath);
        const allDisabled = new Set(config.disabledSkills);
        const allEnabled  = new Set(config.enabledSkills);

        return {
            skills: [
                ...this.buildBuiltinSkillEntries(allDisabled, allEnabled),
                ...(projectRootPath ? this.buildProjectSkillEntries(projectRootPath, allDisabled) : []),
                ...this.buildUserSkillEntries(allDisabled),
            ],
        };
    }

    async addSkill(params: AddSkillRequest): Promise<boolean> {
        try {
            if (params.tier === SkillTier.USER) {
                writeUserSkill(params.name, params.trigger, params.body);
            } else {
                const projectRootPath = resolveProjectRootPath();
                if (!projectRootPath) { return false; }
                writeProjectSkill(projectRootPath, params.name, params.trigger, params.body);
            }
            return true;
        } catch (error) {
            console.error('[Skills] addSkill failed:', error);
            return false;
        }
    }

    async toggleSkill(params: ToggleSkillRequest): Promise<boolean> {
        try {
            const builtinSkill = params.tier === SkillTier.BUILTIN
                ? REGISTERED_SKILLS.find(s => s.name === params.skillId)
                : undefined;
            const projectRootPath = resolveProjectRootPath();
            // USER skills always go to global user settings.
            // BUILTIN and PROJECT skills use workspace settings when in a project context.
            const scope: 'user' | 'workspace' =
                params.tier !== SkillTier.USER && !!projectRootPath ? 'workspace' : 'user';
            await setSkillEnabled(params.skillId, params.enabled, builtinSkill?.default === false, scope);
            return true;
        } catch (error) {
            console.error('[Skills] toggleSkill failed:', error);
            return false;
        }
    }

    async deleteSkill(params: DeleteSkillRequest): Promise<boolean> {
        try {
            const bareName = this.extractBareSkillName(params.skillId);
            if (params.tier === SkillTier.USER) {
                deleteUserSkill(bareName);
            } else {
                const projectRootPath = resolveProjectRootPath();
                if (!projectRootPath) { return false; }
                deleteProjectSkill(projectRootPath, bareName);
            }
            return true;
        } catch (error) {
            console.error('[Skills] deleteSkill failed:', error);
            return false;
        }
    }

    async enableSkillFromChat(params: SkillEnableRequest): Promise<boolean> {
        try {
            const projectRootPath = resolveProjectRootPath();
            const builtinSkill = REGISTERED_SKILLS.find(s => s.name === params.skillId);
            const isUserSkill = !builtinSkill && scanUserSkills().some(s => s.name === params.skillId);
            const resolvedScope = !isUserSkill && !!projectRootPath ? 'workspace' : 'user';
            if (builtinSkill?.default === false) {
                await setSkillEnabled(params.skillId, true, true, resolvedScope);
            } else {
                await setSkillEnabled(params.skillId, true, false, resolvedScope);
            }
            sendSkillEnableNotification({ type: "skill_enable_event", requestId: params.requestId, stage: SkillEnableStage.ENABLED, skillName: params.skillId, skillId: params.skillId } as any);
            approvalManager.resolveSkillEnable(params.requestId, true);
            return true;
        } catch (error) {
            console.error('[Skills] enableSkillFromChat failed:', error);
            approvalManager.resolveSkillEnable(params.requestId, false);
            return false;
        }
    }

    async cancelSkillEnable(params: SkillEnableCancelRequest): Promise<void> {
        const skillId = approvalManager.getSkillEnableId(params.requestId) ?? '';
        sendSkillEnableNotification({ type: "skill_enable_event", requestId: params.requestId, stage: SkillEnableStage.SKIPPED, skillName: skillId, skillId } as any);
        approvalManager.resolveSkillEnable(params.requestId, false);
    }

    async parseSkillFile(params: ParseSkillFileRequest): Promise<ParseSkillFileResponse> {
        try {
            const ext = path.extname(params.fileName).toLowerCase();

            if (ext === '.md') {
                const { name, trigger, content } = parseSkillMd(params.fileContent);
                if (!name || !trigger) {
                    return { error: 'Missing name or description in YAML front matter.' };
                }
                return { name, trigger, body: content !== trigger ? content : undefined };
            }

            if (ext === '.zip' || ext === '.skill') {
                const buf = Buffer.from(params.fileContent, 'base64');
                const zip = await unzipper.Open.buffer(buf);
                const entry = zip.files.find((f: any) => path.basename(f.path).toUpperCase() === 'SKILL.MD');
                if (!entry) {
                    return { error: 'No SKILL.md found inside the archive.' };
                }
                const raw = (await entry.buffer()).toString('utf-8');
                const { name, trigger, content } = parseSkillMd(raw);
                if (!name || !trigger) {
                    return { error: 'Missing name or description in SKILL.md.' };
                }
                return { name, trigger, body: content !== trigger ? content : undefined };
            }

            return { error: 'Unsupported file type. Use .md, .zip, or .skill.' };
        } catch (err: any) {
            return { error: err?.message ?? 'Failed to parse skill file.' };
        }
    }

    async listMcpServers(): Promise<McpServerStatusDTO[]> {
        const manager = getMcpClientManager();
        if (!manager) {
            return [];
        }
        try {
            await manager.refresh();
        } catch (err) {
            console.warn('[mcp] listMcpServers refresh failed:', err);
        }
        return manager.listServers();
    }

    async setMcpServerEnabled(params: SetMcpServerEnabledRequest): Promise<void> {
        const manager = getMcpClientManager();
        if (!manager) {
            return;
        }
        const scope = params.scope ?? "user";
        await manager.setEnabled(scope, params.name, params.enabled);
        notifyMcpServersChanged(manager.listServers());
    }

    async openMcpConfig(params: OpenMcpConfigRequest): Promise<void> {
        const scope = params?.scope ?? "user";
        let workspacePath: string | undefined;
        if (scope === "workspace") {
            workspacePath = resolveProjectRootPath() || undefined;
            if (!workspacePath) {
                vscode.window.showWarningMessage("No project is open — cannot edit project MCP config.");
                return;
            }
            if (!vscode.workspace.isTrusted) {
                vscode.window.showWarningMessage("This project is not trusted. Trust this project from the workspace trust prompt to enable project-scope MCP servers.");
                return;
            }
        }
        const filePath = ensureMcpConfigFileExists(scope, workspacePath);
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    async getMcpToolsEnabled(): Promise<boolean> {
        return isMcpToolsEnabled(resolveProjectRootPath() || undefined);
    }


    async getMcpWorkspaceContext(): Promise<McpWorkspaceContextResponse> {
        return { hasWorkspace: !!resolveProjectRootPath() && vscode.workspace.isTrusted };
    }

    async getMcpLoadErrors(): Promise<McpLoadErrorsDTO> {
        const manager = getMcpClientManager();
        if (!manager) {
            return {};
        }
        return manager.getLoadErrors();
    }

    async addMcpServer(params: AddMcpServerRequest): Promise<AddMcpServerResponse> {
        const name = (params?.name ?? "").trim();
        if (!name) {
            return { success: false, error: "Server name is required." };
        }
        if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(name)) {
            return { success: false, error: "Use letters, digits, _, ., or - only (max 64 chars)." };
        }
        const cfg = params?.config;
        const cfgError = validateMcpServerConfig(cfg);
        if (cfgError) {
            return { success: false, error: cfgError };
        }
        const scope = params.scope ?? "user";
        let workspacePath: string | undefined;
        if (scope === "workspace") {
            workspacePath = resolveProjectRootPath() || undefined;
            if (!workspacePath) {
                return { success: false, error: "No project is open — cannot add a project-scope server." };
            }
            if (!vscode.workspace.isTrusted) {
                return { success: false, error: "This project is not trusted. Trust this project from the workspace trust prompt to enable project-scope MCP servers." };
            }
        }
        try {
            writeMcpServer(name, cfg, scope, workspacePath);
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
        await this.refreshAndNotify();
        return { success: true };
    }

    async updateMcpServer(params: UpdateMcpServerRequest): Promise<AddMcpServerResponse> {
        const name = (params?.name ?? "").trim();
        if (!name) {
            return { success: false, error: "Server name is required." };
        }
        const cfg = params?.config;
        const cfgError = validateMcpServerConfig(cfg);
        if (cfgError) {
            return { success: false, error: cfgError };
        }
        const scope = params.scope ?? "user";
        let workspacePath: string | undefined;
        if (scope === "workspace") {
            workspacePath = resolveProjectRootPath() || undefined;
            if (!workspacePath) {
                return { success: false, error: "No project is open — cannot update a project-scope server." };
            }
            if (!vscode.workspace.isTrusted) {
                return { success: false, error: "This project is not trusted. Trust this project from the workspace trust prompt to enable project-scope MCP servers." };
            }
        }
        try {
            updateMcpServer(name, cfg, scope, workspacePath);
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
        await this.refreshAndNotify();
        return { success: true };
    }

    async deleteMcpServer(params: DeleteMcpServerRequest): Promise<AddMcpServerResponse> {
        const name = (params?.name ?? "").trim();
        if (!name) {
            return { success: false, error: "Server name is required." };
        }
        const scope = params.scope ?? "user";
        let workspacePath: string | undefined;
        if (scope === "workspace") {
            workspacePath = resolveProjectRootPath() || undefined;
            if (!workspacePath) {
                return { success: false, error: "No project is open." };
            }
            // Note: deleting an entry from an already-cloned untrusted .mcp.json is harmless,
            // so we don't require trust here.
        }
        try {
            deleteMcpServer(name, scope, workspacePath);
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
        const manager = getMcpClientManager();
        if (manager) {
            await manager.deleteServerOverride(scope, name);
        }
        await this.refreshAndNotify();
        return { success: true };
    }

    async setMcpToolsEnabled(params: SetMcpToolsEnabledRequest): Promise<void> {
        await workspace.getConfiguration('ballerina')
            .update(MCP_ENABLE_SETTING, !!params?.enabled, ConfigurationTarget.Global);
    }

    async getAgentsMdFileInfo(): Promise<AgentsMdFileInfoDTO> {
        return getAgentsMdFileInfoImpl();
    }

    async openOrCreateAgentsMd(): Promise<void> {
        await openOrCreateAgentsMdImpl();
    }

    private async refreshAndNotify(): Promise<void> {
        const manager = getMcpClientManager();
        if (!manager) {
            return;
        }
        try {
            await manager.refresh();
            notifyMcpServersChanged(manager.listServers());
            notifyMcpLoadErrorsChanged(manager.getLoadErrors());
        } catch (err) {
            console.warn('[mcp] post-write refresh failed:', err);
        }
    }

}
