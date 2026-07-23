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

import { NodePosition } from "@wso2/syntax-tree";
import { LinePosition } from "./common";
import { Diagnostic as VSCodeDiagnostic } from "vscode-languageserver-types";
import { ValueTypeConstraint } from "../rpc-types/ai-agent/interfaces";
import { Type } from "./extended-lang-client";

export type { NodePosition };

export type Flow = {
    fileName: string;
    nodes: FlowNode[];
    connections?: FlowNode[];
    variables?: FlowNode[];
};

export type Client = {
    id: string;
    label: string;
    kind: ClientKind;
    lineRange: ELineRange;
    scope: ClientScope;
    value: string;
    flags: number;
};

export type ClientKind = "HTTP" | "OTHER";

export type ClientScope = "LOCAL" | "OBJECT" | "GLOBAL";

export type FlowNode = {
    id: string;
    metadata: Metadata;
    codedata: CodeData;
    diagnostics?: Diagnostic;
    properties?: NodeProperties;
    branches: Branch[];
    flags?: number;
    returning: boolean;
    suggested?: boolean;
    viewState?: ViewState;
    hasBreakpoint?: boolean;
    isActiveBreakpoint?: boolean;
};

export type AgentToolData = Record<string, CodeDataValue> & (
    {
        node: FlowNode;
        connection: string;
        description: string;
        auth?: string;
        toolKind?: never;
    } | {
        toolKind: "AGENT_CALL";
        agentVarName: string;
        includeContext: boolean;
        description: string;
        node?: never;
        connection?: never;
    }
);

export type FunctionNode = {
    id: string;
    metadata: Metadata;
    codedata: CodeData;
    diagnostics?: Diagnostic;
    properties?: NodeProperties;
    flags?: number;
    returning: boolean;
};

export type AllowedConnector = {
    codedata: CodeData;
    addNewConnectionLabel: string;
};

export type Metadata = {
    label: string;
    description: string;
    icon?: string;
    keywords?: string[];
    draft?: boolean; // for diagram draft nodes
    data?: NodeMetadata | ParentMetadata;
    functionKind?: string;
    connectors?: AllowedConnector[];
};

export type NodeMetadata = {
    isDataMappedFunction?: boolean;
    isAgentTool?: boolean;
    connectorType?: string;
    isIsolatedFunction?: boolean;
    model?: ToolData;
    paramsToHide?: string[]; // List of properties keys to to hide from forms
    module?: string;
    type?: string;
    agentInfo?: AgentNodeInfo;
};

export type ParentMetadata = {
    kind: string;
    label: string;
    accessor?: string;
    parameters?: string[];
    sourceCode?: string;
    return?: string;
    isServiceFunction?: boolean;
};

export type ToolData = {
    name: string;
    description?: string;
    path?: string;
    type?: string;
};

export type AgentData = {
    role?: string;
    instructions?: string;
};

export type AgentNodeInfo = {
    description?: string;
    systemPrompt?: AgentData;
    tools?: ToolData[];
    modelProvider?: AgentModelProviderInfo;
    memory?: AgentMemoryInfo;
};

export type AgentModelProviderInfo = {
    propertyKey?: string;
    presentation?: ToolData;
};

export type AgentMemoryInfo = {
    propertyKey?: string;
    presentation?: MemoryData;
};

export type MemoryData = {
    type: string;
    size: string
};

export type Imports = {
    [prefix: string]: string;
};

export type FormFieldInputType = "TEXT" |
    "BOOLEAN" |
    "IDENTIFIER" |
    "AUTOCOMPLETE" |
    "SINGLE_SELECT" |
    "MULTIPLE_SELECT" |
    "TEXTAREA" |
    "TEMPLATE" |
    "TYPE" |
    "EXPRESSION" |
    "REPEATABLE_PROPERTY" |
    "PARAM_MANAGER" |
    "STRING" |
    "FILE_SELECT" |
    "ACTION_OR_EXPRESSION" |
    "MULTIPLE_SELECT_LISTENER" |
    "SINGLE_SELECT_LISTENER" |
    "EXPRESSION_SET" |
    "TEXT_SET" |
    "FLAG" |
    "CHOICE" |
    "LV_EXPRESSION" |
    "RAW_TEMPLATE" |
    "ai:Prompt" |
    "FIXED_PROPERTY" |
    "REPEATABLE_PROPERTY" |
    "ENUM" |
    "DM_JOIN_CLAUSE_RHS_EXPRESSION" |
    "RECORD_MAP_EXPRESSION" |
    "REPEATABLE_MAP" |
    "PROMPT" |
    "RECORD_FIELD_SELECTOR" |
    "SQL_QUERY" |
    "CLAUSE_EXPRESSION" |
    "SLIDER" |
    "HEADER_SET" |
    "DROPDOWN_CHOICE" |
    "CUSTOM_DROPDOWN" |
    "ACTION_TYPE" |
    "ACTION_EXPRESSION" |
    "VIEW" |
    "SERVICE_PATH" |
    "ACTION_PATH" |
    "NUMBER" |
    "REPEATABLE_LIST" |
    "CONDITIONAL_FIELDS" |
    "DOC_TEXT" |
    "ADVANCE_PARAM_LIST" |
    "GROUP_SECTION" |
    "CONNECTION"
    ;

export interface BaseType {
    fieldType: FormFieldInputType;
    ballerinaType?: string;
    selected: boolean;
    typeMembers?: PropertyTypeMemberInfo[];
    minItems?: number; // minimum items for EXPRESSION_SET fields
    defaultItems?: number; // default number of items for EXPRESSION_SET fields
    pattern?: string; // regex pattern for validation (e.g., for TEXT fields)
    patternErrorMessage?: string; // custom error message when pattern validation fails
}

export interface EnumOptions {
    label: string;
    value: string;
}

export interface DropdownType extends BaseType {
    fieldType: "SINGLE_SELECT" | "MULTIPLE_SELECT";
    options: EnumOptions[];
}

export interface TemplateType extends BaseType {
    template: Property | ValueTypeConstraint;
}

export interface IdentifierType extends BaseType {
    fieldType: "IDENTIFIER";
    scope: FieldScope;
}

export interface RecordFieldSelectorType extends BaseType {
    fieldType: "RECORD_FIELD_SELECTOR";
    recordSelectorType: RecordSelectorType;
}

export interface RecordSelectorType {
    rootType: Type;
    referencedTypes: Type[];
}


export type InputType =
    | BaseType
    | DropdownType
    | TemplateType
    | IdentifierType
    | RecordFieldSelectorType;

export type Property = {
    metadata: Metadata;
    diagnostics?: Diagnostic;
    value: string | string[] | ELineRange | NodeProperties | Property[] | Record<string, ValueTypeConstraint>;
    advanceProperties?: NodeProperties;
    optional: boolean;
    editable: boolean;
    advanced?: boolean;
    hidden?: boolean;
    placeholder?: string;
    types?: InputType[];
    codedata?: CodeData;
    imports?: Imports;
    advancedValue?: string;
    modified?: boolean;
    oldValue?: string;
    defaultValue?: string;
    itemOptions?: OptionProps[];
    dynamicFormFields?: { [key: string]: NodeProperties }
};

export type PropertyTypeMemberInfo = {
    type: string;
    kind: string;
    packageInfo: string;
    packageName?: string;
    selected: boolean;
};

export type RecordTypeField = {
    key: string;
    property: Property;
    recordTypeMembers: PropertyTypeMemberInfo[];
};

export type Diagnostic = {
    hasDiagnostics: boolean;
    diagnostics?: DiagnosticMessage[];
};

export type DiagnosticMessage = {
    message: string;
    severity: "ERROR" | "WARNING" | "INFO";
};

export type CodeData = {
    node?: NodeKind;
    org?: string;
    module?: string;
    packageName?: string;
    object?: string;
    symbol?: string;
    lineRange?: ELineRange;
    sourceCode?: string;
    parentSymbol?: string;
    inferredReturnType?: string;
    version?: string;
    isNew?: boolean;
    isGenerated?: boolean;
    resourcePath?: string;
    id?: string;
    kind?: string;
    originalName?: string;
    dependentProperty?: string[];
    data?: { [key: string]: CodeDataValue };
};

export type CodeDataValue = CodeData | string | boolean | FlowNode;

export type Branch = {
    label: string;
    kind: BranchKind;
    codedata: CodeData;
    repeatable: Repeatable;
    properties: NodeProperties;
    children: FlowNode[];
    viewState?: ViewState;
};

export type ELineRange = {
    fileName: string;
    startLine: LinePosition;
    endLine: LinePosition;
};

export type NodeProperties = { [P in NodePropertyKey]?: Property };

export type ViewState = {
    // element view state
    x: number;
    y: number;
    lw: number; // left width from center
    rw: number; // right width from center
    h: number; // height
    // container view state
    clw: number; // container left width from center
    crw: number; // container right width from center
    ch: number; // container height
    // flow start node
    startNodeId?: string;
    // is top level node
    isTopLevel?: boolean;
};

// Add node target position metadata
export type TargetMetadata = {
    topNodeId: string;
    bottomNodeId?: string;
    linkLabel?: string;
};

export enum DIRECTORY_MAP {
    ACTIVITY = "ACTIVITY",
    AGENT = "AGENT",
    AGENT_DEFINITION = "AGENT_DEFINITION",
    AUTOMATION = "AUTOMATION",
    CONFIGURABLE = "CONFIGURABLE",
    CONNECTION = "CONNECTION",
    CONNECTOR = "CONNECTOR",
    DATA_MAPPER = "DATA_MAPPER",
    AGENT_TOOL = "AGENT_TOOL",
    FUNCTION = "FUNCTION",
    LISTENER = "LISTENER",
    LOCAL_CONNECTORS = "localConnectors",
    MODEL_PROVIDER = "MODEL_PROVIDER",
    NP_FUNCTION = "NP_FUNCTION",
    REMOTE = "REMOTE",
    RESOURCE = "RESOURCE",
    SERVICE = "SERVICE",
    TYPE = "TYPE",
    VARIABLE = "VARIABLE",
    WORKFLOW = "WORKFLOW",
}

export enum FUNCTION_TYPE {
    REGULAR = "regular",
    EXPRESSION_BODIED = "expressionBodied",
    ALL = "all",
}

export enum VISIBILITY {
    PUBLIC = "public",
    PRIVATE = "private",
    MODULE = "module",
}

/**
 * Represents the directory structure of artifacts in a project.
 */
export type ProjectDirectoryMap = {
    [DIRECTORY_MAP.SERVICE]: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.AUTOMATION]: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.LISTENER]: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.FUNCTION]: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.CONNECTION]: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.TYPE]: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.CONFIGURABLE]: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.DATA_MAPPER]: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.NP_FUNCTION]: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.AGENT]: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.AGENT_DEFINITION]: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.LOCAL_CONNECTORS]: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.WORKFLOW]?: ProjectStructureArtifactResponse[];
    [DIRECTORY_MAP.ACTIVITY]?: ProjectStructureArtifactResponse[];
};

/**
 * Represents a single project's structure with its artifacts organized by directory type.
 */
export interface ProjectStructure {
    projectName: string;
    projectPath?: string;
    projectTitle?: string;
    isLibrary?: boolean;
    directoryMap: ProjectDirectoryMap;
}

/**
 * Unified response structure for both single projects and multi-project workspaces.
 * 
 * For single project:
 * - workspaceName: undefined
 * - projects: array with single project
 * 
 * For workspace with multiple projects:
 * - workspaceName: name of the workspace
 * - projects: array with multiple projects
 */
export interface ProjectStructureResponse {
    workspaceName?: string;
    workspaceTitle?: string;
    workspacePath?: string;
    projects: ProjectStructure[];
}

export interface ProjectStructureArtifactResponse {
    id: string;
    name: string;
    path: string;
    type: string;
    icon?: string;
    context?: string;
    moduleName?: string;
    position?: NodePosition;
    resources?: ProjectStructureArtifactResponse[];
    isNew?: boolean;
    visibility?: VISIBILITY;
}

export interface UpdatedArtifactsResponse {
    artifacts: ProjectStructureArtifactResponse[];
    error?: string;
}

export type Item = Category | AvailableNode;

export type Category = {
    metadata: Metadata;
    items: Item[];
};

export type AvailableNode = {
    metadata: Metadata;
    codedata: CodeData;
    enabled: boolean;
};

export type DiagramLabel = "On Fail" | "Body";

export type NodePropertyKey =
    | "agentType"
    | "credential"
    | "annotations"
    | "auth"
    | "checkError"
    | "client"
    | "collection"
    | "comment"
    | "condition"
    | "matchTarget"
    | "configValue"
    | "connection"
    | "defaultable"
    | "defaultValue"
    | "documentation"
    | "enableModelContext"
    | "expression"
    | "functionName"
    | "functionNameDescription"
    | "instructions"
    | "input"
    | "inputType"
    | "isIsolated"
    | "isPublic"
    | "maxIter"
    | "memory"
    | "method"
    | "model"
    | "modelProvider"
    | "msg"
    | "name"
    | "parameters"
    | "path"
    | "patterns"
    | "permittedTools"
    | "prompt"
    | "query"
    | "role"
    | "scope"
    | "serverUrl"
    | "sessionId"
    | "size"
    | "statement"
    | "store"
    | "systemPrompt"
    | "targetType"
    | "testConfigValue"
    | "toolKitName"
    | "tools"
    | "toolScopes"
    | "type"
    | "typeDescription"
    | "variable"
    | "verbose"
    | "vectorStore"
    | "embeddingModel"
    | "view";

export type BranchKind = "block" | "worker";

export type Repeatable = "ONE_OR_MORE" | "ZERO_OR_ONE" | "ONE" | "ZERO_OR_MORE";

export type Scope = "module" | "local" | "object";

export type FieldScope = "Global" | "Local" | "Object";

export type NodeKind =
    | "ACTION_OR_EXPRESSION"
    | "ACTIVITY"
    | "ACTIVITY_CALL"
    | "AGENTS"
    | "AGENT"
    | "AGENT_TYPE"
    | "AGENT_CALL"
    | "AGENT_ID_AUTH_CONFIG"
    | "AGENT_RUN"
    | "AGENT_TOOL"
    | "ASSIGN"
    | "AUTOMATION"
    | "BODY"
    | "BREAK"
    | "CLASS"
    | "CLASS_INIT"
    | "COMMENT"
    | "COMMIT"
    | "CONDITIONAL"
    | "CONFIG_VARIABLE"
    | "CONTINUE"
    | "DATA_MAPPER_CALL"
    | "DATA_MAPPER_DEFINITION"
    | "DATA_MAPPER_CREATION"
    | "DRAFT"
    | "ELSE"
    | "EMPTY"
    | "ERROR_HANDLER"
    | "EVENT_START"
    | "EXPRESSION"
    | "FAIL"
    | "FOREACH"
    | "FORK"
    | "FUNCTION"
    | "FUNCTION_CALL"
    | "FUNCTION_DEFINITION"
    | "FUNCTION_CREATION"
    | "IF"
    | "INCLUDED_FIELD"
    | "LOCK"
    | "LV_EXPRESSION"
    | "MATCH"
    | "METHOD_CALL"
    | "MEMORY"
    | "SHORT_TERM_MEMORY_STORE"
    | "MODEL_PROVIDER"
    | "MODEL_PROVIDERS"
    | "VARIABLE"
    | "VECTOR_STORE"
    | "VECTOR_STORES"
    | "KNOWLEDGE_BASE"
    | "KNOWLEDGE_BASE_CALL"
    | "KNOWLEDGE_BASES"
    | "EMBEDDING_PROVIDER"
    | "EMBEDDING_PROVIDERS"
    | "DATA_LOADER"
    | "DATA_LOADERS"
    | "CHUNKER"
    | "CHUNKERS"
    | "MCP_TOOL_KIT"
    | "NEW_CONNECTION"
    | "NEW_DATA"
    | "NP_FUNCTION"
    | "NP_FUNCTION_CALL"
    | "NP_FUNCTION_DEFINITION"
    | "ON_FAILURE"
    | "PANIC"
    | "PARALLEL_FLOW"
    | "RAW_TEMPLATE"
    | "REMOTE_ACTION_CALL"
    | "RESOURCE_ACTION_CALL"
    | "RETURN"
    | "RETRY"
    | "ROLLBACK"
    | "SEND_DATA"
    | "SLEEP"
    | "START"
    | "STOP"
    | "TRANSACTION"
    | "UPDATE_DATA"
    | "WAIT"
    | "WAIT_DATA"
    | "HUMAN_TASK"
    | "WHILE"
    | "WORKFLOW"
    | "WORKFLOW_RUN"
    | "WORKER"
    | "RECORD"
    | "VARIABLE";

export type OverviewFlow = {
    entryPoints: EntryPoint[];
    name: string;
    thinking: string;
    connections: Connection[];
};

export type EntryPoint = {
    id: string;
    name: string;
    type: string;
    status: string;
    dependencies: Dependency[];
};

export type Dependency = {
    id: string;
    status: string;
};

export type Connection = {
    id: string;
    name: string;
    status: string;
    org?: string;
    package?: string;
    client?: string;
};

export type Line = {
    line: number;
    offset: number;
};

export type ConfigVariable = {
    metadata: Metadata;
    codedata: CodeData;
    properties: NodeProperties;
    branches: Branch[];
    id: string;
    returning: boolean;
    diagnostics?: Diagnostic;
    flags?: number;
};

export type FormDiagnostics = {
    key: string;
    diagnostics: VSCodeDiagnostic[];
};

export type CompletionInsertText = {
    value: string;
    cursorOffset?: number;
};

export type OptionProps = {
    id?: string;
    content?: string;
    value: any;
    disabled?: boolean;
};
