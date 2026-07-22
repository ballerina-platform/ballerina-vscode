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

import { NotificationType, RequestType } from "vscode-messenger-common";
import { NodePosition, STNode } from "@wso2/syntax-tree";
import { Command } from "./interfaces/ai-panel";
import { LinePosition } from "./interfaces/common";
import { ProjectInfo, ProjectMigrationResult, Type } from "./interfaces/extended-lang-client";
import { DIRECTORY_MAP, ProjectStructureArtifactResponse, ProjectStructureResponse } from "./interfaces/bi";
import { SCOPE, ArtifactData, DataMapperMetadata } from "./interfaces/shared-types";
import { DiagnosticEntry, DocumentationGeneratorIntermediaryState, SourceFile, CodeContext, FileAttatchment, SkillEnableStage } from "./rpc-types/ai-panel/interfaces";

export type MachineStateValue =
    | 'initialize'
    | 'lsError'
    | 'lsReady'
    | 'viewActive'
    | 'disabled'
    | { viewActive: 'viewInit' } | { viewActive: 'webViewLoaded' } | { viewActive: 'viewReady' } | { viewActive: 'viewEditing' } | { viewActive: 'resolveMissingDependencies' };

export type PopupMachineStateValue = 'initialize' | 'ready' | {
    open: 'active';
} | {
    ready: 'reopen';
} | {
    ready: 'notify';
} | 'disabled';

export enum EVENT_TYPE {
    OPEN_VIEW = "OPEN_VIEW",
    GET_STARTED = "GET_STARTED",
    CANCEL_CREATION = "CANCEL_CREATION",
    FILE_EDIT = "FILE_EDIT",
    EDIT_DONE = "EDIT_DONE",
    CLOSE_VIEW = "CLOSE_VIEW",
    VIEW_UPDATE = "VIEW_UPDATE",
    UPDATE_PROJECT_LOCATION = "UPDATE_PROJECT_LOCATION"
}

export type VoidCommands = "OPEN_LOW_CODE" | "OPEN_PROJECT" | "CREATE_PROJECT";

export enum MACHINE_VIEW {
    PackageOverview = "Overview",
    WorkspaceOverview = "Workspace Overview",
    BallerinaUpdateView = "Ballerina Update View",
    SequenceDiagram = "Sequence Diagram",
    ServiceDesigner = "Service Designer",
    ERDiagram = "ER Diagram",
    DataMapper = "Data Mapper",
    InlineDataMapper = "Inline Data Mapper",
    GraphQLDiagram = "GraphQL Diagram",
    TypeDiagram = "Type Diagram",
    SetupView = "Setup View",
    BIDiagram = "BI Diagram",
    BIWelcome = "BI Welcome",
    BIProjectForm = "BI Project SKIP",
    BIImportIntegration = "BI Import Integration SKIP",
    BIAddProjectForm = "BI Add Project SKIP",
    BIComponentView = "BI Component View",
    AddConnectionWizard = "Add Connection Wizard",
    AddAgent = "Add Agent",
    ConnectionConfiguration = "Connection Configuration",
    AddCustomConnector = "Add Custom Connector",
    ViewConfigVariables = "View Config Variables",
    EditConfigVariables = "Edit Config Variables",
    AddConfigVariables = "Add Config Variables",
    EditConnectionWizard = "Edit Connection Wizard",
    BIMainFunctionForm = "Add Automation SKIP",
    BIFunctionForm = "Add Function SKIP",
    BIAgentToolForm = "Add Agent Tool SKIP",
    BIWorkflowForm = "Add Durable Workflow SKIP",
    BIActivityForm = "Add Workflow Activity SKIP",
    BINPFunctionForm = "Add Natural Function SKIP",
    BITestFunctionForm = "Add Test Function SKIP",
    BIAIEvaluationForm = "AI Evaluation SKIP",
    BIServiceWizard = "Service Wizard SKIP",
    BIServiceConfigView = "Service Config View",
    BIListenerConfigView = "Listener Config View",
    BIServiceClassDesigner = "Service Class Designer",
    BIServiceClassConfigView = "Service Class Config View",
    BIDataMapperForm = "Add Data Mapper SKIP",
    AIAgentDesigner = "AI Agent Designer",
    AIChatAgentWizard = "AI Chat Agent Wizard",
    ResolveMissingDependencies = "Resolve Missing Dependencies",
    ServiceFunctionForm = "Service Function Form",
    BISamplesView = "BI Samples View",
    ReviewMode = "Review Mode SKIP",
    EvalsetViewer = "Evalset Viewer SKIP",
    ConfigurationCollector = "Configuration Collector"
}

export interface MachineEvent {
    type: EVENT_TYPE;
}

export interface CommandProps {
    command: VoidCommands;
    projectName?: string;
    isService?: boolean
}

export const FOCUS_FLOW_DIAGRAM_VIEW = {
    NP_FUNCTION: "NP_FUNCTION",
    AGENT: "AGENT",
    AGENT_TYPE: "AGENT_TYPE",
} as const;

export type FocusFlowDiagramView = typeof FOCUS_FLOW_DIAGRAM_VIEW[keyof typeof FOCUS_FLOW_DIAGRAM_VIEW];

// State Machine context values
export interface VisualizerLocation {
    view?: MACHINE_VIEW | null;
    documentUri?: string;
    projectPath?: string;
    workspacePath?: string;
    projectInfo?: ProjectInfo;
    identifier?: string;
    parentIdentifier?: string;
    artifactType?: DIRECTORY_MAP;
    position?: NodePosition;
    syntaxTree?: STNode;
    isBI?: boolean;
    isInDevant?: boolean;
    focusFlowDiagramView?: FocusFlowDiagramView;
    serviceType?: string;
    type?: Type;
    addType?: boolean;
    isGraphql?: boolean;
    rootDiagramId?: string;
    metadata?: VisualizerMetadata;
    agentMetadata?: AgentMetadata;
    scope?: SCOPE;
    projectStructure?: ProjectStructureResponse;
    org?: string;
    package?: string;
    moduleName?: string;
    version?: string;
    dataMapperMetadata?: DataMapperMetadata;
    artifactInfo?: ArtifactInfo;
    reviewData?: ReviewModeData;
    evalsetData?: EvalsetData;
}

export interface ArtifactInfo {
    org?: string;
    packageName?: string;
    moduleName?: string;
    version?: string;
}

export interface ConfigurationCollectorMetadata {
    requestId: string;
    variables: Array<{
        name: string;
        description: string;
        type?: string;
        secret?: boolean;
    }>;
    existingValues?: Record<string, string>;
    message: string;
    isTestConfig?: boolean;
}

export interface AgentMetadata {
    configurationCollector?: ConfigurationCollectorMetadata;
}

export interface ApprovalOverlayState {
    show: boolean;
    message?: string;
    requestId?: string;
}

export interface VisualizerMetadata {
    haveLS?: boolean;
    isBISupported?: boolean;
    recordFilePath?: string;
    enableSequenceDiagram?: boolean; // Enable sequence diagram view
    target?: LinePosition;
    featureSupport?: {
        aiEvaluation?: boolean;
    };
    // Connection Configuration metadata
    selectedConnectorId?: string;
    selectedConnectorOrg?: string;
    selectedConnectorModule?: string;
    selectedConnectorPackageName?: string;
    selectedConnectorObject?: string;
    selectedConnectorSymbol?: string;
    selectedConnectorVersion?: string;
    selectedConnectorIsGenerated?: boolean;
    selectedConnectorNode?: string;
    selectedConnectorLabel?: string;
    selectedConnectorDescription?: string;
    selectedConnectorIcon?: string;
    categoryName?: string;
}

export interface ReviewViewItem {
    type: 'component' | 'flow' | 'type';
    filePath: string;
    position: NodePosition;
    projectPath: string;
    label?: string;
    changeType?: number;
}

export interface ReviewModeData {
    views: ReviewViewItem[];
    currentIndex: number;
    onAccept?: string;
    onReject?: string;
    semanticDiffs?: object[];
    loadDesignDiagrams?: boolean;
    affectedPackages?: string[];
    modifiedFiles?: string[];
    tempProjectPath?: string;
    isWorkspace?: boolean;
}

// --- Evalset Trace Types ---
export type EvalRole = 'system' | 'user' | 'assistant' | 'function';

export interface EvalChatUserMessage {
    role: 'user';
    content: string | any;
    name?: string;
}

export interface EvalChatSystemMessage {
    role: 'system';
    content: string | any;
    name?: string;
}

export interface EvalChatAssistantMessage {
    role: 'assistant';
    content?: string | null;
    name?: string;
    toolCalls?: EvalFunctionCall[];
}

export interface EvalChatFunctionMessage {
    role: 'function';
    content?: string | null;
    name: string;
    id?: string;
}

export type EvalChatMessage = EvalChatUserMessage | EvalChatSystemMessage | EvalChatAssistantMessage | EvalChatFunctionMessage;

export interface EvalFunctionCall {
    name: string;
    arguments?: { [key: string]: any };
    id?: string;
}

export interface EvalToolSchema {
    name: string;
    description: string;
    parametersSchema?: { [key: string]: any };
}

export interface EvalIteration {
    history: EvalChatMessage[];
    output: EvalChatAssistantMessage | EvalChatFunctionMessage | any;
    startTime: string;
    endTime: string;
}

export interface EvalsetTrace {
    id: string;
    userMessage: EvalChatUserMessage;
    iterations: EvalIteration[];
    output: EvalChatAssistantMessage | any;
    tools: EvalToolSchema[];
    toolCalls?: EvalFunctionCall[];
    startTime: string;
    endTime: string;
}

export interface EvalThread {
    id: string;
    description: string;
    traces: EvalsetTrace[];
    created_on: string;
}

export interface EvalSet {
    id: string;
    name?: string;
    description?: string;
    threads: EvalThread[];
    created_on: string;
}

export interface EvalsetData {
    filePath: string;
    content: EvalSet;
    threadId?: string;
}

export interface PopupVisualizerLocation extends VisualizerLocation {
    recentIdentifier?: string;
    artifactType?: DIRECTORY_MAP;
}

export interface ParentPopupData {
    recentIdentifier: string;
    artifactType: DIRECTORY_MAP;
    dataMapperMetadata?: DataMapperMetadata;
}

export interface DownloadProgress {
    totalSize?: number;
    downloadedSize?: number;
    percentage?: number;
    success: boolean;
    message: string;
    step?: number;
}

export type ChatNotify =
    | ChatStart
    | IntermidaryState
    | ChatContent
    | CodeDiagnostics
    | CodeMessages
    | ChatStop
    | ChatAbort
    | SaveChat
    | ChatError
    | ToolCall
    | ToolResult
    | EvalsToolResult
    | UsageMetricsEvent
    | TaskApprovalRequest
    | WebToolApprovalEvent
    | GeneratedSourcesEvent
    | ConnectorGenerationNotification
    | ConfigurationCollectionEvent
    | ClarifyEvent
    | SkillEnableEvent
    | ChatComponentEvent
    | PlanUpdated
    | CompactionStartEvent
    | CompactionEndEvent
    | CompactionDisabledEvent
    | ConfigChangeEvent
    | MigrationProgressEvent;

/** Structured progress event emitted by the migration orchestrator at each stage boundary. */
export interface MigrationProgressEvent {
    type: "migration_progress";
    /** 0-based index of the package currently being enhanced. */
    currentPackageIndex: number;
    /** Total number of packages in the workspace (1 for single-package projects). */
    totalPackages: number;
    /** Display name of the package currently being enhanced (empty for single-package). */
    currentPackageName: string;
    /** 0-based stage index within the current package. */
    currentStageIndex: number;
    /** Total stages in this package (4 for regular packages, 1 for workspace validation). */
    totalStagesInPackage: number;
    /** Short human-readable stage label (e.g. "Fidelity Check", "Diagnostics"). */
    currentStageName: string;
    /** Cumulative completed stage count across all packages — numerator for progress %. */
    completedStagesOverall: number;
    /** Total stage count across all packages — denominator for progress %. */
    totalStagesOverall: number;
}

export interface ChatStart {
    type: "start";
}

export interface IntermidaryState {
    type: "intermediary_state";
    state: DocumentationGeneratorIntermediaryState;
}

//TODO: Maybe rename content_block to content_append?
export interface ChatContent {
    type: "content_block" | "content_replace";
    content: string;
}

export interface CodeDiagnostics {
    type: "diagnostics";
    diagnostics: DiagnosticEntry[];
}

//TODO: I'm not sure about messages, maybe revisit later.
export interface CodeMessages {
    type: "messages";
    messages: any[];
}

export interface ChatStop {
    type: "stop";
    command: Command | undefined;
}

export interface ChatAbort {
    type: "abort";
    command: Command | undefined;
}

export interface SaveChat {
    type: "save_chat";
    command: Command | undefined;
    messageId: string;
}

export type ChatErrorCode = "usage_limit";

export interface ChatError {
    type: "error";
    content: string;
    code?: ChatErrorCode;
}

export interface ToolCall {
    type: "tool_call";
    toolName: string;
    toolInput?: any;
    toolCallId?: string;
}

export interface ToolResult {
    type: "tool_result";
    toolName: string;
    toolOutput?: any;
    toolCallId?: string;
    failed?: boolean;
}

export interface EvalsToolResult {
    type: "evals_tool_result";
    toolName: string;
    output: any;
}

export interface UsageMetricsEvent {
    type: "usage_metrics";
    isRepair?: boolean;
    model?: string;
    usage: {
        inputTokens: number;
        cacheCreationInputTokens: number;
        cacheReadInputTokens: number;
        outputTokens: number;
    };
    breakdown?: {
        systemInstructions: number;
        toolDefinitions: number;
        reservedOutput: number;
        files: number;
        messages: number;
        toolResults: number;
    };
}

export interface TaskApprovalRequest {
    type: "task_approval_request";
    requestId: string;
    approvalType: "plan" | "completion";
    tasks: Task[];
    taskDescription?: string;
    message?: string;
    autoApproved?: boolean;
}

export interface WebToolApprovalEvent {
    type: "web_tool_approval_request";
    requestId: string;
    toolName: "web_search" | "web_fetch";
    content: string;
}

export interface GeneratedSourcesEvent {
    type: "generated_sources";
    fileArray: SourceFile[];
}

export interface ConnectorGenerationNotification {
    type: "connector_generation_notification";
    requestId: string;
    stage: "requesting_input" | "input_received" | "generating" | "generated" | "skipped" | "error";
    serviceName?: string;
    serviceDescription?: string;
    spec?: {
        version: string;
        title: string;
        description?: string;
        baseUrl?: string;
        endpointCount: number;
        methods: string[];
    };
    connector?: {
        moduleName: string;
        importStatement: string;
    };
    error?: {
        message: string;
        code: string;
    };
    message: string;
}

export interface ConfigurationCollectionEvent {
    type: "configuration_collection_event";
    requestId: string;
    stage: "creating_file" | "collecting" | "done" | "skipped" | "error";
    variables?: Array<{
        name: string;
        description: string;
        type?: string;
        secret?: boolean;
    }>;
    existingValues?: Record<string, string>;
    message: string;
    isTestConfig?: boolean;
    error?: {
        message: string;
        code: string;
    };
}

export interface ClarifyQuestion {
    question: string;
    tabLabel: string;
    options: Array<{ label: string; value: string }>;
    selectionType: "single" | "multiple";
}

export interface ClarifyEvent {
    type: "clarify_event";
    requestId: string;
    stage: "asking" | "answered" | "skipped";
    questions: ClarifyQuestion[];
    answers?: Array<{ question: string; answers: string[] }>;
}

export interface SkillEnableEvent {
    type: "skill_enable_event";
    requestId: string;
    stage: SkillEnableStage;
    skillName: string;
    skillId: string;
}

export interface ChatComponentEvent {
    type: "chat_component";
    id?: string;
    componentType: string;
    data: Record<string, any>;
}

export interface PlanUpdated {
    type: "plan_updated";
    plan: Plan;
}

// ==================================
// Server-side Compaction Events
// ==================================

/** Fired when the server starts compacting (detected mid-stream via providerMetadata) */
export interface CompactionStartEvent {
    type: 'compaction_start';
}

/** Fired when server-side compaction completes; carries the extracted summary */
export interface CompactionEndEvent {
    type: 'compaction_end';
    /** Extracted <summary> content from the compaction block */
    summary?: string;
}

/** Fired once per session when compaction is disabled because the codebase floor exceeds the trigger */
export interface CompactionDisabledEvent {
    type: 'compaction_disabled';
}

/** Fired when a VS Code configuration setting relevant to the AI panel changes */
export interface ConfigChangeEvent {
    type: 'config_change';
    key: 'showContextUsage' | 'mcpToolsEnabled';
    value: boolean;
}

export const stateChanged: NotificationType<MachineStateValue> = { method: 'stateChanged' };
export const onDownloadProgress: NotificationType<DownloadProgress> = { method: 'onDownloadProgress' };
export const onChatNotify: NotificationType<ChatNotify> = { method: 'onChatNotify' };
export const onMigrationToolLogs: NotificationType<string> = { method: 'onMigrationToolLogs' };
export const onMigrationToolStateChanged: NotificationType<string> = { method: 'onMigrationToolStateChanged' };
export const onMigratedProject: NotificationType<ProjectMigrationResult> = { method: 'onMigratedProject' };
export const projectContentUpdated: NotificationType<boolean> = { method: 'projectContentUpdated' };
export const onIdentifierUpdated: NotificationType<ProjectStructureArtifactResponse[]> = { method: 'onIdentifierUpdated' };
export const promptUpdated: NotificationType<void> = { method: 'promptUpdated' };
export const getVisualizerLocation: RequestType<void, VisualizerLocation> = { method: 'getVisualizerLocation' };
export const webviewReady: NotificationType<void> = { method: `webviewReady` };
export const dependencyPullProgress: NotificationType<string> = { method: 'dependencyPullProgress' };

// Artifact updated request and notification
export const onArtifactUpdatedNotification: NotificationType<ProjectStructureArtifactResponse[]> = { method: 'onArtifactUpdatedNotification' };
export const onArtifactUpdatedRequest: RequestType<ArtifactData, void> = { method: 'onArtifactUpdatedRequest' };

// Popup machine methods
export const onParentPopupSubmitted: NotificationType<ParentPopupData> = { method: `onParentPopupSubmitted` };
export const popupStateChanged: NotificationType<PopupMachineStateValue> = { method: 'popupStateChanged' };
export const getPopupVisualizerState: RequestType<void, PopupVisualizerLocation> = { method: 'getPopupVisualizerState' };

export const breakpointChanged: NotificationType<boolean> = { method: 'breakpointChanged' };
export const approvalOverlayState: NotificationType<ApprovalOverlayState> = { method: 'approvalOverlayState' };

// ------------------> AI Related state types <-----------------------
export type AIMachineStateValue =
    | 'Initialize'          // (checking auth, first load)
    | 'Unauthenticated'     // (show login window)
    | { Authenticating: 'determineFlow' | 'ssoFlow' | 'apiKeyFlow' | 'validatingApiKey' | 'awsBedrockFlow' | 'validatingAwsCredentials' | 'vertexAiFlow' | 'validatingVertexAiCredentials' } // hierarchical substates
    | 'Authenticated'       // (ready, main view)
    | 'Disabled';           // (optional: if AI Chat is globally unavailable)

export enum AIMachineEventType {
    CHECK_AUTH = 'CHECK_AUTH',
    LOGIN = 'LOGIN',
    AUTH_WITH_API_KEY = 'AUTH_WITH_API_KEY',
    SUBMIT_API_KEY = 'SUBMIT_API_KEY',
    AUTH_WITH_AWS_BEDROCK = 'AUTH_WITH_AWS_BEDROCK',
    SUBMIT_AWS_CREDENTIALS = 'SUBMIT_AWS_CREDENTIALS',
    AUTH_WITH_VERTEX_AI = 'AUTH_WITH_VERTEX_AI',
    SUBMIT_VERTEX_AI_CREDENTIALS = 'SUBMIT_VERTEX_AI_CREDENTIALS',
    LOGOUT = 'LOGOUT',
    SILENT_LOGOUT = "SILENT_LOGOUT",
    COMPLETE_AUTH = 'COMPLETE_AUTH',
    CANCEL_LOGIN = 'CANCEL_LOGIN',
    RETRY = 'RETRY',
    DISPOSE = 'DISPOSE',
}

export type AIMachineEventMap = {
    [AIMachineEventType.CHECK_AUTH]: undefined;
    [AIMachineEventType.LOGIN]: undefined;
    [AIMachineEventType.AUTH_WITH_API_KEY]: undefined;
    [AIMachineEventType.SUBMIT_API_KEY]: { apiKey: string };
    [AIMachineEventType.AUTH_WITH_AWS_BEDROCK]: undefined;
    [AIMachineEventType.SUBMIT_AWS_CREDENTIALS]: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
        sessionToken?: string;
    };
    [AIMachineEventType.AUTH_WITH_VERTEX_AI]: undefined;
    [AIMachineEventType.SUBMIT_VERTEX_AI_CREDENTIALS]: {
        projectId: string;
        location: string;
        keyFile: string;
    };
    [AIMachineEventType.LOGOUT]: undefined;
    [AIMachineEventType.SILENT_LOGOUT]: undefined;
    [AIMachineEventType.COMPLETE_AUTH]: undefined;
    [AIMachineEventType.CANCEL_LOGIN]: undefined;
    [AIMachineEventType.RETRY]: undefined;
    [AIMachineEventType.DISPOSE]: undefined;
};

export type AIMachineSendableEvent =
    | { [K in keyof AIMachineEventMap]: AIMachineEventMap[K] extends undefined
        ? { type: K }
        : { type: K; payload: AIMachineEventMap[K] }
    }[keyof AIMachineEventMap];

export interface ChatMessage {
    id: string;
    content: string;
    uiResponse: string;
    modelMessages: any[];
    timestamp: number;
    checkpointId?: string;
}

export interface Checkpoint {
    id: string;
    messageId: string;
    timestamp: number;
    workspaceSnapshot: { [filePath: string]: string };
    fileList: string[];
    snapshotSize: number;
}

// ==================================
// Thread-Based Chat State Types
// ==================================

/**
 * Review state for a generation
 */
export interface GenerationReviewState {
    /** Status of the generation review */
    status: 'pending' | 'under_review' | 'accepted' | 'error';
    /** Temp project path while under review (shared across generations in same thread) */
    tempProjectPath?: string;
    /** Files modified in this specific generation */
    modifiedFiles: string[];
    /** Packages that have changes (absolute package paths) */
    affectedPackagePaths?: string[];
    /** Error message if status is 'error' */
    errorMessage?: string;
}

/**
 * Metadata attached to a compacted generation (C15 + M07).
 */
export interface GenerationCompactionMetadata {
    /** Unix timestamp when compaction occurred */
    compactedAt: number;
    /** Message count before compaction */
    originalMessageCount: number;
    /** Token estimate before compaction */
    originalTokenEstimate: number;
    /** Token estimate after compaction */
    compactedTokenEstimate: number;
    /** Number of retry attempts used */
    retries: number;
    /** Whether triggered automatically or manually */
    mode: 'auto' | 'manual';
    /** Custom instructions provided by user, if any */
    userInstructions?: string;
    /** Path to pre-compaction backup file (M07) */
    backupPath?: string;
    /** IDs of generations that were replaced (M07) */
    compactedGenerationIds?: string[];
    /** Marker flag indicating this is a compacted synthetic generation (M07) */
    isCompactedGeneration?: boolean;
}

/**
 * Metadata for a generation
 */
export interface GenerationMetadata {
    /** Whether this was a plan mode generation */
    isPlanMode: boolean;
    /** Operation type for the generation */
    operationType?: OperationType;
    /** Generation type (agent or datamapper) */
    generationType?: 'agent' | 'datamapper';
    /** Command type if triggered by command */
    commandType?: string;
    /** C15/M07: Compaction metadata if this generation was created by compaction */
    compactionMetadata?: GenerationCompactionMetadata;
    /** Hash of AGENTS.md content injected this turn (or "removed" sentinel after a removal note). */
    agentsMdLastReadHash?: string;
}

/**
 * Generation represents a single user prompt + complete AI response cycle
 * Contains all data needed to render UI and pass to LLM
 */
export interface Generation {
    /** Unique generation ID */
    id: string;
    /** User prompt content */
    userPrompt: string;
    /** Model messages from AI SDK (for LLM context) */
    modelMessages: any[];
    /** UI response formatted for display */
    uiResponse: string;
    /** Timestamp when generation started */
    timestamp: number;

    /** Review state (embedded, not separate context) */
    reviewState: GenerationReviewState;

    /** Checkpoint linked to this generation (optional) */
    checkpoint?: Checkpoint;
    /** Plan associated with this generation (optional) */
    plan?: Plan;
    /** Current task index for plan execution */
    currentTaskIndex: number;
    /** File attachments for this generation */
    fileAttachments?: FileAttatchment[];
    /** Code context for this generation */
    codeContext?: CodeContext;
    /** Generation metadata */
    metadata: GenerationMetadata;
}

/**
 * Thread represents a conversation with multiple generations
 */
export interface ChatThread {
    /** Unique thread ID */
    id: string;
    /** Display name for thread */
    name: string;
    /** Array of generations in chronological order */
    generations: Generation[];
    /** Session ID for backend correlation */
    sessionId?: string;
    /** Thread creation timestamp */
    createdAt: number;
    /** Last update timestamp */
    updatedAt: number;
}

/**
 * Workspace-level storage container
 * One per workspace, contains multiple threads
 */
export interface WorkspaceChatState {
    /** Root path for chat storage (workspace root or package root) */
    projectRootPath: string;
    /** Map of thread ID to thread */
    threads: Map<string, ChatThread>;
    /** Currently active thread ID */
    activeThreadId: string;
}

/**
 * Task status enum
 */
export enum TaskStatus {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    REVIEW = "review"
}

export enum TaskTypes {
    SERVICE_DESIGN = "service_design",
    IMPLEMENTATION = "implementation",
    EXECUTION = "execution"
}

/**
 * Task interface representing a single implementation task
 */
export interface Task {
    description: string;
    status: TaskStatus;
    type: TaskTypes;
}

export interface Plan {
    id: string;
    tasks: Task[];
    createdAt: number;
    updatedAt: number;
}

export interface Question {
    id: string;
    question: string;
    context?: string;
    timestamp: number;
}

export interface UserApproval {
    comment?: string;
}

export type OperationType = "CODE_FOR_USER_REQUIREMENT" | "TESTS_FOR_USER_REQUIREMENT";


export enum LoginMethod {
    BI_INTEL = 'biIntel',
    ANTHROPIC_KEY = 'anthropic_key',
    AWS_BEDROCK = 'aws_bedrock',
    VERTEX_AI = 'vertex_ai'
}

export interface BIIntelSecrets {
    accessToken: string;
    expiresAt?: number;  // Unix timestamp in milliseconds
}

export interface AnthropicKeySecrets {
    apiKey: string;
}

interface AwsBedrockSecrets {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    sessionToken?: string;
}

export interface VertexAiSecrets {
    projectId: string;
    location: string;
    keyFile: string;
}

export type AuthCredentials =
    | {
        loginMethod: LoginMethod.BI_INTEL;
        secrets: BIIntelSecrets;
    }
    | {
        loginMethod: LoginMethod.ANTHROPIC_KEY;
        secrets: AnthropicKeySecrets;
    }
    | {
        loginMethod: LoginMethod.AWS_BEDROCK;
        secrets: AwsBedrockSecrets;
    }
    | {
        loginMethod: LoginMethod.VERTEX_AI;
        secrets: VertexAiSecrets;
    };

export interface AIUserToken {
    credentials: AuthCredentials;
    usageToken?: string;
    metadata?: {
        lastRefresh?: string;
        expiresAt?: string;
        [key: string]: any;
    };
}

export interface AIMachineContext {
    loginMethod?: LoginMethod;
    userToken?: AIUserToken;
    errorMessage?: string;
}

export enum ColorThemeKind {
    Light = 1,
    Dark = 2,
    HighContrast = 3,
    HighContrastLight = 4
}

// Type alias for backward compatibility - use UIChatMessage from rpc-types/ai-panel instead
export type { UIChatMessage as UIChatHistoryMessage } from "./rpc-types/ai-panel/interfaces";

export const aiStateChanged: NotificationType<AIMachineStateValue> = { method: 'aiStateChanged' };
export const sendAIStateEvent: RequestType<AIMachineEventType | AIMachineSendableEvent, void> = { method: 'sendAIStateEvent' };
export const currentThemeChanged: NotificationType<ColorThemeKind> = { method: 'currentThemeChanged' };

export interface CheckpointCapturedPayload {
    messageId: string;
    checkpointId: string;
}
export const checkpointCaptured: NotificationType<CheckpointCapturedPayload> = { method: 'checkpointCaptured' };

// Connector Generator RPC methods
export interface ConnectorGeneratorResponsePayload {
    requestId: string;
    action: 'provide' | 'skip';
    spec?: any;
    inputMethod?: 'file' | 'paste' | 'url';
    sourceIdentifier?: string;
    comment?: string;
}
export const sendConnectorGeneratorResponse: RequestType<ConnectorGeneratorResponsePayload, void> = { method: 'sendConnectorGeneratorResponse' };

// Trace animation notification types
export interface TraceAnimationEvent {
    type: 'invoke_agent' | 'chat' | 'execute_tool';
    toolNames: string[];
    activeToolName?: string;
    spanId: string;
    active: boolean;
    systemInstructions?: string;
    entrypointServiceName?: string;
    entrypointFunctionName?: string;
}

export const traceAnimationChanged: NotificationType<TraceAnimationEvent> = { method: 'traceAnimationChanged' };
