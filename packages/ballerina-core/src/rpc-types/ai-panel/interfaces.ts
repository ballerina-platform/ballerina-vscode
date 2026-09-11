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

import { FunctionDefinition } from "@wso2/syntax-tree";
import { AIMachineContext, AIMachineStateValue, ChatNotify, GenerationReviewState } from "../../state-machine-types";
import { Command, SkillCommand, TemplateId } from "../../interfaces/ai-panel";
import { AllDataMapperSourceRequest, ExtendedDataMapperMetadata } from "../../interfaces/extended-lang-client";
import { ComponentInfo, Diagnostics, DMModel, ImportStatements, LinePosition, LineRange, OperationType } from "../..";
import { DataMapperMetadata } from "../../interfaces/shared-types";

// ==================================
// General Interfaces
// ==================================
export type AIPanelPrompt =
    | { type: 'command-template'; command: Command; templateId: TemplateId; text?: string; params?: Record<string, string>; metadata?: Record<string, any>; hiddenContext?: string }
    | { type: 'text'; text: string; planMode: boolean; codeContext?: CodeContext; autoSubmit?: boolean; hiddenContext?: string; suggestedCommandTemplates?: AIPanelPrompt[];    inputPlaceholder?:string; attachments?: Attachment[]; newThread?: boolean; }
    | { type: 'skill'; skillId: string; skillName: string; args?: string; tagParams?: Record<string, string>; autoSubmit?: boolean; hiddenContext?: string }
    | undefined;

export interface AIMachineSnapshot {
    state: AIMachineStateValue;
    context: AIMachineContext;
}

export interface ProjectSource {
    projectModules?: ProjectModule[];
    projectTests?: SourceFile[];
    sourceFiles: SourceFile[];
    projectName: string; // Actual package name from package's Ballerina.toml (e.g., "mypackage")
    packagePath: string; // Relative path from workspace root (e.g., "package1", "packages/foo"), empty string for non-workspace
    isActive: boolean; // True if this is the currently active package in the workspace
}

export interface ProjectModule {
    moduleName: string;
    sourceFiles: SourceFile[];
    isGenerated: boolean;
}

export interface SourceFile {
    filePath: string;
    content: string;
}

export interface GetModuleDirParams {
    filePath: string;
    moduleName: string;
}

export interface MappingDiagnostics {
    uri: string;
    diagnostics: DiagnosticEntry[];
}

export interface DiagnosticEntry {
    line?: number;
    message: string;
    code?: string;
}

export interface AddFilesToProjectRequest {
    fileChanges: FileChanges[];
}

export interface FileChanges {
    filePath: string;
    content: string;
    deleted?: boolean;
}

export interface ProjectImports {
    projectPath: string;
    imports: ImportStatements[];
}

// Data-mapper related interfaces
export interface MetadataWithAttachments {
    metadata: ExtendedDataMapperMetadata;
    attachments: Attachment[];
}

export interface InlineMappingsSourceResult {
    allMappingsRequest: AllDataMapperSourceRequest;
    tempFileMetadata: ExtendedDataMapperMetadata;
    tempDir: string;
}

export interface ProcessContextTypeCreationRequest {
    attachments: Attachment[];
}

export interface ProcessMappingParametersRequest {
    parameters: MappingParameters;
    metadata?: ExtendedDataMapperMetadata;
    attachments?: Attachment[];
}

export interface CreateTempFileRequest {
    tempDir: string;
    filePath: string;
    metadata: ExtendedDataMapperMetadata;
    inputs?: DataMappingRecord[];
    output?: DataMappingRecord;
    functionName?: string;
    inputNames?: string[];
    imports?: ImportInfo[];
    hasMatchingFunction?: boolean;
}

export interface DatamapperModelContext {
    documentUri?: string;
    identifier?: string;
    dataMapperMetadata?: DataMapperMetadata;
}

export interface DiagnosticList {
    diagnosticsList: Diagnostics[];
}

export interface DataMappingRecord {
    type: string;
    isArray: boolean;
    filePath: string;
}

export interface GenerateTypesFromRecordRequest {
    attachment: Attachment[]
}

export interface GenerateTypesFromRecordResponse {
    typesCode: string;
}

export interface MappingParameters {
    inputRecord: string[];
    outputRecord: string,
    functionName?: string;
}

export interface ImportInfo {
    moduleName: string;
    alias?: string;
    recordName?: string;
}

export interface TempDirectoryPath {
    filePaths: string[];
    tempDir?: string;
}

export interface ExtractMappingDetailsRequest {
    parameters: MappingParameters;                
    recordMap: Record<string, DataMappingRecord>;  
    allImports: ImportInfo[];  
    existingFunctions: ComponentInfo[];    
    functionContents: Record<string, string>;        
}

export interface MatchedFunction {
    matchingFunctionFilePath: string;
    functionDefNode: FunctionDefinition;
}

export interface ExtractMappingDetailsResponse {
    inputs: DataMappingRecord[];
    output: DataMappingRecord;
    inputParams: string[];
    outputParam: string;
    imports: ImportInfo[];
    inputNames: string[];
    matchedFunction: MatchedFunction | null;
}

export interface RepairCodeParams {
    tempFileMetadata: ExtendedDataMapperMetadata;
    customFunctionsFilePath?: string;
    imports?: ImportInfo[];
    tempDir?: string;
}

export interface RepairedMapping {
    output: string;       
    expression: string; 
}

export interface repairCodeRequest {
    dmModel: DMModel;
    imports: ImportInfo[];
}

export interface RepairCodeResponse {
    repairedMappings: RepairedMapping[];
}

export interface TestGenerationMentions {
    mentions: string[];
}

export interface DocumentationGeneratorIntermediaryState {
    serviceName: string;
    documentation: string;
    projectSource: ProjectSource;
    openApiSpec?: string;
}

export interface RequirementSpecification {
    content: string;
}

export interface DocAssistantResponse {
    content: string;
    references: string[];
}

export interface LLMDiagnostics {
    statusCode: number;
    diags: string;
}

export interface ExistingFunction {
    name: string;
    filePath: string;
    startLine: number;
    endLine: number;
}

// ==================================
// Attachment-Related Interfaces
// ==================================
export interface Attachment {
    name: string;
    path?: string;
    content?: string;
    status: AttachmentStatus;
    mimeType?: string;
}

export enum AttachmentStatus {
    Success = "Success",
    FileSizeExceeded = "FileSizeExceeded",
    UnsupportedFileFormat = "UnsupportedFileFormat",
    UnknownError = "UnknownError",
}

// ==================================
// Feedback form related Interfaces
// ==================================
export interface SubmitFeedbackRequest {
    positive: boolean;
    messages: FeedbackMessage[];
    feedbackText : string;
    diagnostics: DiagnosticEntry[];
}

export interface FeedbackMessage {
    command?: string;
    content: string;
    role : string;
}

export interface ChatEntry {
    actor: string;
    message: string;
    isCodeGeneration?: boolean;
}

export interface GenerateOpenAPIRequest {
    query: string;
    chatHistory: ChatEntry[];
}

export interface ChatEntry {
    actor: string;
    message: string;
    isCodeGeneration?: boolean;
}

export interface FileAttatchment {
    fileName: string;
    content: string;
    mimeType?: string;
}

export type CodeContext =
    | { type: 'addition'; position: LinePosition, filePath: string }
    | { type: 'selection'; startPosition: LinePosition; endPosition: LinePosition, filePath: string };

export interface GenerateAgentCodeRequest {
    /** Client-created run identity used to reject late events from older runs. */
    generationId?: string;
    usecase: string;
    hiddenContext?: string;
    operationType?: OperationType;
    fileAttachmentContents: FileAttatchment[];
    threadId?: string; //TODO: Make this required once we support threads in UI
    isPlanMode: boolean;
    codeContext?: CodeContext;
    webSearchEnabled?: boolean;
    /** Identifies the UI surface so the host can resolve the correct ambient file context. */
    promptSource?: 'ai-panel' | 'mini-chat';
    /** Host-validated workspace-relative Ballerina file currently associated with the prompt surface. */
    activeFilePath?: string;
}

export type LibraryMode = "CORE" | "HEALTHCARE" | "ALL";

export interface CopilotAllLibrariesRequest {
    mode: LibraryMode;
}
export interface MinifiedLibrary {
    name: string;
    description: string;
}
export interface CopilotCompactLibrariesResponse {
    libraries: MinifiedLibrary[];
}

export interface CopilotFilterLibrariesRequest {
    libNames: string[];
}

export interface CopilotFilterLibrariesResponse {
    libraries: any[];
}

export interface CopilotSearchLibrariesBySearchRequest {
    keywords: string[];
}

export interface CopilotSearchLibrariesBySearchResponse {
    libraries: MinifiedLibrary[];
}

// ==================================
// Doc Generation Related Interfaces
// ==================================
export enum DocGenerationType {
    User = "user",
}

export interface DocGenerationRequest {
    type: DocGenerationType;
    serviceName: string;
}

export const GENERATE_TEST_AGAINST_THE_REQUIREMENT = "Generate tests against the requirements";
export const GENERATE_CODE_AGAINST_THE_REQUIREMENT = "Generate code based on the requirements";

// ==================================
// Execution Context
// ==================================

/**
 * Execution context for AI code generation operations.
 *
 * Contains project path information needed for code generation without
 * depending on global StateMachine state. This enables:
 * - Parallel test execution with isolated contexts
 * - Explicit path dependencies
 * - Better testability and code clarity
 *
 * @property projectPath - Absolute path to the active Ballerina project/package
 * @property workspacePath - Optional absolute path to workspace root (for multi-package workspaces)
 */
export interface ExecutionContext {
    /** Absolute path to the current Ballerina project */
    readonly projectPath: string;

    /** Optional absolute path to workspace root (if multi-package workspace) */
    readonly workspacePath?: string;

    /** Temporary project path (set by AICommandExecutor.initialize()) */
    tempProjectPath?: string;
}

export interface SemanticDiffRequest {
    projectPath: string;
}

/** One file's frozen baseline content, relative to the package root. */
export interface AiBaselineFile {
    filePath: string;
    content: string;
}

/**
 * Request to (re)establish a package's ai:// frozen baseline from explicit file contents.
 * Unlike the didOpen/didChange notification protocol, the LS applies everything before
 * responding, so callers can await the baseline being in place.
 */
export interface EnsureAiBaselineRequest {
    projectPath: string;
    files: AiBaselineFile[];
}

export interface EnsureAiBaselineResponse {
    seededFileCount: number;
    /** Files whose baseline content could not be applied; the rest are in place. */
    failedFiles?: string[];
    errorMsg?: string;
}

/**
 * Request to warm the LS module-package caches for a package's direct dependencies,
 * so the first review-diff flow-model fetch does not pay the one-time dependency
 * resolution/compilation cost interactively. Fired in the background at run start.
 */
export interface PrewarmDependenciesRequest {
    projectPath: string;
}

export interface PrewarmDependenciesResponse {
    warmedDependencyCount?: number;
    errorMsg?: string;
}

// Numeric enum values from the API
export enum ChangeTypeEnum {
    ADDITION = 0,
    DELETION = 1,
    MODIFICATION = 2,

}

/**
 * Mirrors the LS NodeKind wire ordinals
 * (io.ballerina.copilotagent.core.models.NodeKind) — the single TS copy.
 */
export enum NodeKindEnum {
    MODULE_FUNCTION = 0,
    OBJECT_FUNCTION = 1,
    TYPE_DEFINITION = 2,
    DATA_MAPPING_FUNCTION = 3,
    MODULE_VARIABLE = 4,
    CONSTANT = 5,
    LISTENER = 6,
    CLASS_DEFINITION = 7,
    ENUM_DECLARATION = 8,
    IMPORT_DECLARATION = 9,
}

export type ChangeType = "ADDITION" | "MODIFICATION" | "DELETION";

export interface IdentifierMetadata {
    name: string;
    /**
     * Before/after source text, present on construct kinds the review UI renders as
     * source blocks (module vars, constants, listeners, classes, enums, imports).
     * Either side is absent for a pure addition/deletion.
     */
    oldSource?: string;
    newSource?: string;
}

export interface ResourceMetadata {
    accessor: string;
    servicePath: string;
    resourcePath: string;
}

export interface SemanticDiff {
    changeType: number; // API returns numeric value
    nodeKind: number;   // API returns numeric value
    uri: string;
    lineRange: LineRange;
    previousLineRange?: LineRange;
    metadata?: ResourceMetadata | IdentifierMetadata;
}

export interface SemanticDiffResponse {
    loadDesignDiagrams: boolean;
    semanticDiffs: SemanticDiff[];
    /** Set when diff computation failed entirely; semanticDiffs is absent in that case. */
    errorMsg?: string;
    /**
     * Set when the syntax-level diffs succeeded but the package failed to compile
     * (design-model comparison). The diffs are still usable, but flow diagrams
     * will likely be unavailable for the same reason.
     */
    compilationError?: string;
}

export interface RevertGenerationRequest {
    generationId: string;
}

export interface RestoreCheckpointRequest {
    checkpointId: string;
}

export interface UpdateChatMessageRequest {
    messageId: string;
    content: string;
    /** Exact workspace/thread owning the generation. Omitted only by legacy callers. */
    projectRootPath?: string;
    threadId?: string;
    /**
     * Set false for intermediate recovery writes. The reconnect buffer is only
     * cleared by the final, fully rebuilt transcript write.
     */
    clearRunBuffer?: boolean;
}

export interface PlanApprovalRequest {
    requestId: string;
    comment?: string;
}

export interface ApproveTaskRequest {
    requestId: string;
    approvedTaskDescription?: string;
}

export interface TaskDeclineRequest {
    requestId: string;
    comment?: string;
}

export interface ConnectorSpecRequest {
    requestId: string;
    spec: any;
}

export interface ConnectorSpecCancelRequest {
    requestId: string;
    comment?: string;
}

export interface ConfigurationProvideRequest {
    requestId: string;
    configValues: Record<string, string>;
}

export interface ConfigurationCancelRequest {
    requestId: string;
    comment?: string;
}

export interface CreateManagedConnectionRequest {
    vendor: string;
    // Expected grant shape, used to verify the service returned a matching credential kind.
    authType: "oauth2RefreshToken" | "staticToken";
}

export interface CreateManagedConnectionResponse {
    success: boolean;
    // Populated per grant shape: refresh fills clientId/clientSecret/refreshToken/refreshUrl,
    // static fills token.
    credentials?: {
        clientId?: string;
        clientSecret?: string;
        refreshToken?: string;
        refreshUrl?: string;
        token?: string;
    };
    error?: string;
}

export interface WebToolApprovalRequest {
    requestId: string;
}

export interface ClarifyAnswerRequest {
    requestId: string;
    answers: Array<{ question: string; answers: string[] }>;
}

export interface ClarifyCancelRequest {
    requestId: string;
}

export type ErrorCode = {
    code: number;
    message: string;
}

// ==================================
// Chat State Interfaces (for RPC)
// ==================================

/**
 * UI-formatted chat message for display
 */
export interface UIChatMessage {
    role: "user" | "assistant";
    content: string;
    checkpointId?: string;
    messageId?: string;
    generationStatus?: GenerationReviewState["status"];
}

/**
 * Checkpoint metadata for time-travel functionality
 */
export interface CheckpointInfo {
    id: string;
    messageId: string;
    timestamp: number;
    snapshotSize: number;
}

/**
 * Summary of a chat thread for session history display
 */
export interface ThreadSummary {
    id: string;
    /** Display name — auto-set from first user message */
    name: string;
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
    turnCount: number;
}

export interface SwitchThreadRequest {
    threadId: string;
}

export interface DeleteThreadRequest {
    threadId: string;
}

export interface RenameThreadRequest {
    threadId: string;
    name: string;
}

// TODO(auto-memory): temporarily disabled for this release — restore once the memory feature is refined.
// export interface ClearMemoryRequest {
//     scope: 'workspace' | 'all';
// }
//
// export interface OpenMemoryRequest {
//     scope: 'global' | 'workspace';
// }

/**
 * Request to abort AI generation
 * Optional params default to current workspace and 'default' thread
 */
export interface AbortAIGenerationRequest {
    /** Project root path (defaults to current workspace/project root) */
    projectRootPath?: string;
    /** Thread identifier (defaults to 'default') */
    threadId?: string;
}

/**
 * Request for the current run status of a thread (panel reconnection).
 * Optional params default to current workspace and 'default' thread.
 */
export interface GetRunStatusRequest {
    /** Project root path (defaults to current workspace/project root) */
    projectRootPath?: string;
    /** Thread identifier (defaults to 'default') */
    threadId?: string;
    /** When set, only return buffered events with `seq > sinceSeq` (polling dedup) */
    sinceSeq?: number;
}

/**
 * Response describing whether a run is in flight and the buffered events a
 * reconnecting panel should replay.
 */
export interface GetRunStatusResponse {
    isRunning: boolean;
    events: ChatNotify[];
    /** Resolved identity of the buffer that was queried. */
    projectRootPath: string;
    threadId: string;
    isPlanMode?: boolean;
    /** Id of the buffered (active or finished-but-unrecorded) generation, if any. */
    generationId?: string;
    /** Persisted prompt for the buffered generation, when available. */
    userPrompt?: string;
    /**
     * True when the buffer overflowed and its earliest events were evicted, so a
     * replay cannot rebuild the turn from the beginning.
     */
    truncated?: boolean;
    /**
     * Request ids of interactive prompts (clarify/approval/etc.) still awaiting a user
     * response. On reopen the panel re-surfaces the buffered prompt for these (so the
     * question can be answered) and skips prompts already resolved earlier in the run.
     */
    pendingRequestIds?: string[];
}

export interface UsageResponse {
    remainingUsagePercentage: number;
    resetsIn: number; // in seconds
    orgId?: string;  // org UUID for the quota request portal link
    alreadyRequested?: boolean;  // an open quota top-up request already exists for this cap-hit
}

export interface QuotaRequestParams {
    note?: string;  // optional message from the user to the reviewer
}

export interface QuotaRequestResult {
    status: "submitted" | "already_requested" | "failed";
}

export interface OpenFileDiffRequest {
    relativePath: string;
    generationId: string;
}

// ==================================
// Running Services (long-lived processes started by the AI agent)
// ==================================

/** Serializable view of a running service tracked by the agent's RunningServicesManager. */
export interface RunningServiceInfo {
    /** Unique identifier returned by the runBallerinaPackage tool. */
    taskId: string;
    /** Filesystem path of the package being run. */
    packagePath: string;
    /** Epoch ms when the process started. */
    startedAt: number;
    /** True once the process has exited (naturally or via stop). */
    exited: boolean;
    /** Exit code of the process. 0 while still running. */
    exitCode: number;
}

export interface StopRunningServiceRequest {
    taskId: string;
}

export interface RunServiceRequest {
    /** Relative path from workspace root to the package to run (undefined if running from workspace root). */
    packagePath?: string;
    /** Absolute path to the temp directory containing the package. */
    tempProjectPath: string;
}

// ==================================
// Skills Management Interfaces
// ==================================

export enum SkillTier {
    BUILTIN = 'builtin',
    PROJECT = 'project',
    USER = 'user',
}

export interface SkillCommandTemplate {
    id: string;
    text: string;
    placeholders: Array<{ id: string; text: string; multiline: boolean }>;
    defaultVisibility?: boolean;
}

export interface SkillEntry {
    id: string;
    name: string;
    trigger: string;
    body?: string;
    tier: SkillTier;
    enabled: boolean;
    /** False = always active, no toggle shown in UI. Undefined/true = user can toggle. */
    optional?: boolean;
    commandTemplates?: SkillCommandTemplate[];
    /** Identifies this skill as a specific slash command, used for attachment type resolution. */
    skillCommand?: SkillCommand;
}

export interface DeleteSkillRequest {
    skillId: string;
    tier: SkillTier.PROJECT | SkillTier.USER;
}

export interface GetSkillsResponse {
    skills: SkillEntry[];
}

export interface AddSkillRequest {
    tier: SkillTier.PROJECT | SkillTier.USER;
    name: string;
    trigger: string;
    body?: string;
}

export interface ToggleSkillRequest {
    skillId: string;
    enabled: boolean;
    tier: SkillTier;
}

export enum SkillEnableStage {
    PROMPTING = 'prompting',
    ENABLED = 'enabled',
    SKIPPED = 'skipped',
}

export interface SkillEnableRequest {
    requestId: string;
    skillId: string;
}

export interface SkillEnableCancelRequest {
    requestId: string;
}

export interface ParseSkillFileRequest {
    fileName: string;
    fileContent: string;
}

export interface ParseSkillFileResponse {
    name?: string;
    trigger?: string;
    body?: string;
    error?: string;
}

// ==================================
// Compaction Related Interfaces
// ==================================

export interface CompactConversationRequest {
    /** Optional user instructions for guiding the summarization (e.g., "focus on test changes") */
    customInstructions?: string;
}

export interface CompactConversationResponse {
    success: boolean;
    /** Token count before compaction */
    originalTokens?: number;
    /** Token count after compaction */
    compactedTokens?: number;
    /** Percentage of tokens reduced */
    reductionPercentage?: number;
    /** The LLM-generated summary text shown to the user after compaction */
    summary?: string;
    /** Error message if compaction failed */
    error?: string;
}

// ==================================
// Prompt Enhancement Related Interfaces
// ==================================

export enum PromptMode {
    ROLE = "role",
    INSTRUCTIONS = "instructions",
    QUERY = "query",
    DEFAULT = "default"
}

export interface PromptEnhancementRequest {
    originalPrompt: string;
    additionalInstructions?: string;
    mode: PromptMode;
    isGeneration?: boolean;
}

export interface PromptEnhancementResponse {
    enhancedPrompt: string;
}

// ==================================
// MCP (Model Context Protocol) tool support
// ==================================
export type McpTransportType = "stdio" | "http";
export type McpConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";
export type McpScope = "user" | "workspace" | "builtin";
/** Scopes the user can add/edit/delete. Built-ins are read-only. */
export type McpMutableScope = "user" | "workspace";
export interface McpToolSummaryDTO {
    name: string;
    description?: string;
}
export type McpServerConfigDTO =
    | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
    | { type: "http"; url: string; headers?: Record<string, string>; headersFromEnv?: Record<string, string> };
export interface McpServerStatusDTO {
    name: string;
    scope: McpScope;
    transport: McpTransportType;
    enabled: boolean;
    status: McpConnectionStatus;
    error?: string;
    tools: McpToolSummaryDTO[];
    /** Raw config as stored on disk — used by the Edit dialog to pre-fill fields. */
    config: McpServerConfigDTO;
    /** True when this user-scope server is shadowed by a same-named workspace-scope server. */
    shadowed?: boolean;
}
export interface SetMcpServerEnabledRequest {
    name: string;
    scope: McpScope;
    enabled: boolean;
}
export interface AddMcpServerRequest {
    name: string;
    scope: McpMutableScope;
    config: McpServerConfigDTO;
}
export interface AddMcpServerResponse {
    success: boolean;
    error?: string;
}
export interface OpenMcpConfigRequest {
    scope: McpMutableScope;
}
export interface McpWorkspaceContextResponse {
    hasWorkspace: boolean;
}
export interface UpdateMcpServerRequest {
    name: string;
    scope: McpMutableScope;
    config: McpServerConfigDTO;
}
export interface DeleteMcpServerRequest {
    name: string;
    scope: McpMutableScope;
}
export interface SetMcpToolsEnabledRequest {
    enabled: boolean;
}
/** Per-scope parse / read errors for `mcp.json` files. Both fields are optional — missing means OK. */
export interface McpLoadErrorsDTO {
    user?: string;
    workspace?: string;
}

// ==================================
// AGENTS.md Settings
// ==================================
export interface AgentsMdFileInfoDTO {
    fileExists: boolean;
    lineCount?: number;
    isEmpty?: boolean;
    hasWorkspace: boolean;
}
