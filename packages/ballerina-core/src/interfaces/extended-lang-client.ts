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

import { CodeAction, Diagnostic, DocumentSymbol, SymbolInformation, TextDocumentItem, WorkspaceEdit } from "vscode-languageserver-types";
import { CMDiagnostics, ComponentModel } from "./component";
import { DocumentIdentifier, LinePosition, LineRange, NOT_SUPPORTED_TYPE, Position, Range } from "./common";
import { BallerinaConnectorInfo, BallerinaExampleCategory, BallerinaModuleResponse, BallerinaModulesRequest, BallerinaTrigger, BallerinaTriggerInfo, BallerinaConnector, ExecutorPosition, ExpressionRange, JsonToRecordMapperDiagnostic, MainTriggerModifyRequest, NoteBookCellOutputValue, NotebookCellMetaInfo, OASpec, PackageSummary, PartialSTModification, ResolvedTypeForExpression, ResolvedTypeForSymbol, STModification, SequenceModel, SequenceModelDiagnostic, ServiceTriggerModifyRequest, SymbolDocumentation, XMLToRecordConverterDiagnostic, TypeField, ComponentInfo } from "./ballerina";
import { ModulePart, STNode } from "@wso2/syntax-tree";
import { CodeActionParams, DefinitionParams, DocumentSymbolParams, ExecuteCommandParams, InitializeParams, InitializeResult, LocationLink, RenameParams } from "vscode-languageserver-protocol";
import { Category, Flow, FlowNode, CodeData, ConfigVariable, FunctionNode, Property, PropertyTypeMemberInfo, DIRECTORY_MAP, Imports, NodeKind, InputType, FormFieldInputType, ProjectStructureArtifactResponse, VISIBILITY } from "./bi";
import { ConnectorRequest, ConnectorResponse } from "../rpc-types/connector-wizard/interfaces";
import { SqFlow } from "../rpc-types/sequence-diagram/interfaces";
import { FieldType, FunctionModel, ListenerModel, ServiceClassModel, ServiceInitModel, ServiceModel } from "./service";
import { CDModel } from "./component-diagram";
import { DMModel, ExpandedDMModel, IntermediateClause, Mapping, VisualizableField, FnMetadata, ResultClauseType, IOType } from "./data-mapper";
import { ArtifactData, DataMapperMetadata, SCOPE } from "./shared-types";
import { ToolParameters } from "../rpc-types/ai-agent/interfaces";

export interface DidOpenParams {
    textDocument: TextDocumentItem;
}

export interface DidCloseParams {
    textDocument: {
        uri: string;
    };
}

export interface DidChangeParams {
    textDocument: {
        uri: string;
        version: number;
    };
    contentChanges: [
        {
            text: string;
        }
    ];
}

export interface CompletionParams {
    textDocument: {
        uri: string;
    };
    position: {
        character: number;
        line: number;
    };
    context: {
        triggerKind: number;
    };
}

export interface Completion {
    detail: string;
    insertText: string;
    insertTextFormat: number;
    kind: number;
    label: string;
    additionalTextEdits?: TextEdit[];
    documentation?: string;
    sortText?: string;
    filterText?: string;
}

export interface TextEdit {
    newText: string,
    range: {
        end: {
            character: number;
            line: number;
        },
        start: {
            character: number;
            line: number;
        }
    }
}

export interface DidChangeWatchedFileParams {
    changes: Change[];
}

export interface Change {
    uri: string;
    type: number;
}

// <-------- BALLERINA RELATED --------->

interface BallerinaCapability {
    name: string;
    [key: string]: boolean | string;
}

export interface BallerinaInitializeParams {
    ballerinaClientCapabilities: BallerinaCapability[];
}

export interface BallerinaInitializeResult {
    ballerinaServerCapabilities: BallerinaCapability[];
}

export interface ComponentModelsParams {
    documentUris: string[];
}

export interface ComponentModels {
    componentModels: {
        [key: string]: ComponentModel;
    };
    diagnostics: CMDiagnostics[];
}

export interface PersistERModelParams {
    documentUri: string;
}

export interface PersistERModel {
    persistERModel: {
        [key: string]: ComponentModel;
    };
    diagnostics: CMDiagnostics[];
}

export interface DiagnosticsParams {
    documentIdentifier: {
        uri: string;
    };
}

export interface Diagnostics {
    uri: string;
    diagnostics: Diagnostic[];
}

export interface ExpressionType {
    documentIdentifier: {
        uri: string;
    };
    types: string[];
}

export interface ConnectorsParams extends BallerinaModulesRequest { }

export interface Connectors {
    central: BallerinaConnector[];
    local?: BallerinaConnector[];
    error?: string;
}

export interface TriggersParams extends BallerinaModulesRequest { }

export interface Triggers extends BallerinaModuleResponse {
    central: BallerinaTrigger[];
    error?: string;
}

export interface ConnectorParams extends BallerinaConnector { }

export interface Connector extends BallerinaConnectorInfo {
    error?: string;
}

export interface TriggerParams {
    id?: string;
    orgName?: string;
    packageName?: string;
}

export interface Trigger extends BallerinaTriggerInfo {
    error?: string;
}

export interface RecordParams {
    org: string;
    module: string;
    version: string;
    name: string;
}

export interface BallerinaRecord {
    org: string;
    module: string;
    version: string;
    name: string;
    ast?: STNode;
    error?: any;
}

export interface STModifyParams {
    documentIdentifier: { uri: string; };
    astModifications: STModification[];
}

export interface BallerinaSTParams {
    lineRange: Range;
    documentIdentifier: DocumentIdentifier;
}

export type TriggerModifyParams = MainTriggerModifyRequest | ServiceTriggerModifyRequest;

export interface SymbolInfoParams {
    textDocumentIdentifier: {
        uri: string;
    },
    position: {
        line: number;
        character: number;
    }
}

export interface SymbolInfo {
    symbolKind: string,
    documentation: SymbolDocumentation
}

export interface TypeFromExpressionParams {
    documentIdentifier: {
        uri: string;
    };
    expressionRanges: ExpressionRange[];
}

export interface TypesFromExpression {
    types: ResolvedTypeForExpression[];
}

export interface TypeFromSymbolParams {
    documentIdentifier: {
        uri: string;
    };
    positions: LinePosition[];
}

export interface TypesFromSymbol {
    types: ResolvedTypeForSymbol[];
}

export interface TypesFromFnDefinitionParams {
    documentIdentifier: {
        uri: string;
    };
    fnPosition: LinePosition;
    returnTypeDescPosition: LinePosition;
}

export interface VisibleVariableTypesParams {
    filePath: string;
    position: LinePosition;
}

export interface VisibleVariableTypes {
    categories: VisibleType[];
}

export interface VisibleType {
    name: string;
    types: TypeWithIdentifier[];
}

export interface TypeWithIdentifier {
    name: string;
    type: TypeField;
}

export interface InitialIDMSourceRequest {
    filePath: string;
    flowNode: FlowNode;
}

export interface InitialIDMSourceResponse {
    textEdits: {
        [key: string]: TextEdit[];
    };
    codedata?: CodeData;
}

export interface DataMapperModelRequest {
    filePath: string;
    codedata: CodeData;
    position: LinePosition;
    targetField?: string;
}

export interface DataMapperBase {
    filePath: string;
    codedata: CodeData;
    varName?: string;
    targetField?: string;
    position?: LinePosition;
    customFunctionsFilePath?: string;
}

export interface DataMapperSourceRequest extends DataMapperBase {
    mapping: Mapping;
    subMappingName?: string;
}

export interface AllDataMapperSourceRequest extends DataMapperBase {
    mappings: Mapping[];
}

export interface ExtendedDataMapperMetadata extends DataMapperMetadata {
    mappingsModel: DMModel;
}

export interface VisualizableFieldsRequest {
    filePath: string;
    codedata: CodeData;
}

export interface DataMapperModelResponse {
    mappingsModel: ExpandedDMModel | DMModel;
}

export interface DataMapperSourceResponse {
    textEdits?: {
        [key: string]: TextEdit[];
    };
    error?: string;
    userAborted?: boolean;
}

export interface ExpandModelOptions {
    processInputs?: boolean;
    processOutput?: boolean;
    processSubMappings?: boolean;
    previousModel?: ExpandedDMModel;
}

export interface DMModelRequest {
    model: DMModel;
    rootViewId: string;
    options?: ExpandModelOptions;
}

export interface ExpandedDMModelResponse {
    expandedModel: ExpandedDMModel;
    success: boolean;
    error?: string;
}

export interface ProcessTypeReferenceRequest {
    ref: string;
    fieldId: string;
    model: DMModel;
}

export interface ProcessTypeReferenceResponse {
    result: Partial<IOType>;
    success: boolean;
    error?: string;
}

export interface VisualizableFieldsResponse {
    visualizableProperties: VisualizableField;
}

export interface AddArrayElementRequest {
    filePath: string;
    codedata: CodeData;
    varName?: string;
    outputId: string;
    targetField: string;
    propertyKey?: string;
    subMappingName?: string;
}

export interface ConvertToQueryRequest {
    filePath: string;
    codedata: CodeData;
    mapping: Mapping;
    clauseType: ResultClauseType;
    varName?: string;
    targetField: string;
    propertyKey?: string;
    subMappingName?: string;
}

export interface AddClausesRequest {
    filePath: string;
    codedata: CodeData;
    index: number;
    clause: IntermediateClause;
    varName?: string;
    targetField: string;
    propertyKey?: string;
    subMappingName?: string;
}

export interface DeleteClauseRequest {
    filePath: string;
    codedata: CodeData;
    index: number;
    varName?: string;
    targetField: string;
    subMappingName?: string;
}

export interface AddSubMappingRequest {
    filePath: string;
    codedata: CodeData;
    index: number;
    flowNode: FlowNode;
    varName?: string;
    targetField: string;
}

export interface DeleteMappingRequest {
    filePath: string;
    codedata: CodeData;
    mapping: Mapping;
    varName?: string;
    targetField: string;
    subMappingName?: string;
}

export interface DeleteSubMappingRequest {
    filePath: string;
    codedata: CodeData;
    index: number;
    varName?: string;
    targetField: string;
    subMappingName?: string;
}

export interface MapWithFnRequest {
    filePath: string;
    codedata: CodeData;
    mapping: Mapping;
    functionMetadata: FnMetadata;
    varName?: string;
    targetField: string;
    subMappingName?: string;
}

export interface ResolveOutputRequest {
    filePath: string;
    codedata: CodeData;
    varName: string;
    targetField: string;
    subMappingName?: string;
}

export interface ClearTypeCacheResponse {
    success: boolean;
}

export interface GetDataMapperCodedataRequest {
    filePath: string;
    codedata: CodeData;
    name: string;
}

export interface GetSubMappingCodedataRequest {
    filePath: string;
    codedata: CodeData;
    view: string;
}

export interface GetDataMapperCodedataResponse {
    codedata: CodeData;
}

export interface PropertyRequest {
    filePath: string;
    codedata: CodeData;
    targetField: string;
}

export interface FieldPropertyRequest extends PropertyRequest {
    fieldId: string;
}

export interface PropertyResponse {
    property: Property;
}

export interface ClausePositionRequest {
    filePath: string;
    codedata: CodeData;
    targetField: string;
    index: number;
}

export interface ClausePositionResponse {
    position: LinePosition;
}

export interface ConvertExpressionRequest {
    outputType: string;
    expression: string;
    expressionType: string;
}

export interface ConvertExpressionResponse {
    convertedExpression: string;
}

export interface CreateConvertedVariableRequest {
    // Data Mapper related
    filePath: string;
    codedata: CodeData;
    varName: string;
    targetField: string;
    subMappingName?: string;

    // Converting variable related
    variableName: string;
    isInput: boolean;
    typeName: string;
    isArray: boolean;
    parentTypeName?: string;
    imports?: Imports;
}

export interface GraphqlDesignServiceParams {
    filePath: string;
    startLine: LinePosition;
    endLine: LinePosition;
}

export interface GraphqlDesignService {
    graphqlDesignModel: any;
    isIncompleteModel: boolean;
    errorMsg: string;
}

export interface SyntaxTreeParams {
    documentIdentifier: {
        uri: string;
    };
}

export interface SyntaxTree {
    syntaxTree: ModulePart | STNode;
    parseSuccess: boolean;
    source?: string;
    defFilePath?: string;
}

export interface BallerinaExampleListParams {
    filter?: string;
}

export interface BallerinaExampleList {
    samples: Array<BallerinaExampleCategory>;
}

export interface BallerinaProjectParams {
    documentIdentifier: DocumentIdentifier;
}

export interface BallerinaProject {
    kind?: string;
    path?: string;
    version?: string;
    author?: string;
    packageName?: string;
    orgName?: string;
}

export interface BallerinaPackagesParams {
    documentIdentifiers: DocumentIdentifier[];
}

export interface BallerinaProjectComponents {
    packages?: PackageSummary[];
}

export interface PackageConfigSchema {
    configSchema: any;
}

export interface SyntaxTreeNodeParams {
    documentIdentifier: DocumentIdentifier;
    range: Range;
}

export interface SyntaxTreeNode {
    kind: string;
}

export interface SequenceDiagramModelParams {
    filePath: string;
    startLine: LinePosition;
    endLine: LinePosition;
}

export type SequenceDiagramModel = {
    sequenceDiagram: SequenceModel;
    modelDiagnostic?: SequenceModelDiagnostic
};

export interface ExecutorPositions {
    executorPositions?: ExecutorPosition[];
}

// Test Manager related interfaces 

export interface TestsDiscoveryRequest {
    projectPath: string;
}

export interface TestsDiscoveryResponse {
    result?: Map<string, FunctionTreeNode[]>;
    errorMsg?: string;
    stacktrace?: string;
}

export interface FunctionTreeNode {
    functionName: string;
    lineRange: FunctionLineRange;
    kind: string;
    groups: string[];
}

export interface FunctionLineRange {
    fileName: string;
    startLine: LinePosition;
    endLine: LinePosition;
}

export interface ICPEnabledRequest {
    projectPath: string;
}

export interface ICPEnabledResponse {
    enabled?: boolean;
    errorMsg?: string;
    stacktrace?: string;
}

export interface WorkflowManagementRequest {
    projectPath: string;
}

export interface WorkflowManagementResponse {
    enabled?: boolean;
    errorMsg?: string;
    stacktrace?: string;
}

export interface GetTestFunctionRequest {
    filePath: string;
    functionName: string;
}

export interface AddOrUpdateTestFunctionRequest {
    filePath: string;
    function: TestFunction;
}

export interface TestSourceEditResponse {
    textEdits?: {
        [key: string]: TextEdit[];
    };
    errorMsg?: string;
    stacktrace?: string;
}

export interface GetTestFunctionResponse {
    function?: TestFunction;
    errorMsg?: string;
    stacktrace?: string;
}

export interface TestFunctionMetadata {
    label?: string;
    description?: string;
}

export interface Codedata {
    lineRange?: FunctionLineRange;
}

export interface ValueProperty {
    metadata?: TestFunctionMetadata;
    codedata?: Codedata;
    types: InputType[];
    originalName?: string;
    value?: any;
    placeholder?: string;
    optional?: boolean;
    editable?: boolean;
    advanced?: boolean;
    imports?: Imports;
}

export interface FunctionParameter {
    type?: ValueProperty;
    variable?: ValueProperty;
    defaultValue?: ValueProperty;
    optional?: boolean;
    editable?: boolean;
    advanced?: boolean;
}

export interface Annotation {
    metadata?: TestFunctionMetadata;
    codedata?: Codedata;
    org?: string;
    module?: string;
    name?: string;
    fields?: ValueProperty[];
}

export interface TestFunction {
    metadata?: TestFunctionMetadata;
    codedata?: Codedata;
    functionName?: ValueProperty;
    returnType?: ValueProperty;
    parameters?: FunctionParameter[];
    annotations?: Annotation[];
    editable?: boolean;
}

// End of Test Manager related interfaces

export interface JsonToRecordParams {
    jsonString: string;
    recordName: string;
    isRecordTypeDesc: boolean;
    isClosed: boolean;
    forceFormatRecordFields?: boolean;
    prefix?: string;
    filePathUri?: string;
}

export interface TypeDataWithReferences {
    types: {
        type: Type;
        refs: string[];
    }[];
}

export interface JsonToRecord {
    codeBlock: string;
    diagnostics?: JsonToRecordMapperDiagnostic[];
}

export interface XMLToRecordParams {
    xmlValue: string;
    isRecordTypeDesc?: boolean;
    isClosed?: boolean;
    forceFormatRecordFields?: boolean;
    prefix?: string;
    filePath?: string;
}

export interface XMLToRecord {
    codeBlock: string;
    diagnostics?: XMLToRecordConverterDiagnostic[];
}

export interface NoteBookCellOutputParams {
    source: string;
}

export interface NoteBookCellOutput {
    shellValue?: NoteBookCellOutputValue;
    errors: string[];
    diagnostics: string[];
    metaInfo?: NotebookCellMetaInfo;
    consoleOut: string;
}

export interface NotebookFileSource {
    content: string;
    filePath: string;
}

export interface NotebookVariable {
    name: string;
    type: string;
    value: string;
}

export interface NotebookDeleteDclnParams {
    varToDelete: string;
}

export interface PartialSTParams {
    codeSnippet: string;
    stModification?: PartialSTModification;
}

export interface PartialST {
    syntaxTree: STNode;
}

export interface OpenAPIConverterParams {
    documentFilePath: string;
    enableBalExtension?: boolean;
}

export interface OpenAPISpec {
    content: OASpec[];
    error?: string;
}

// <------ OTHERS -------

export interface PerformanceAnalyzerParams {
    documentIdentifier: DocumentIdentifier;
    isWorkerSupported: boolean;
}

export interface PerformanceAnalyzer {
    resourcePos: Range;
    endpoints: any;
    actionInvocations: any;
    type: string;
    message: string;
    name: string;
}

export interface BallerinaServerCapability {
    name: string;
    [key: string]: boolean | string;
}

export interface ProjectDiagnosticsRequest {
    projectRootIdentifier: DocumentIdentifier;
}

export interface ProjectDiagnosticsResponse {
    errorDiagnosticMap?: Map<string, Diagnostic[]>;
}

export interface MainFunctionParamsRequest {
    projectRootIdentifier: DocumentIdentifier;
}

export interface MainFunctionParamsResponse {
    hasMain: boolean;
    params?: TypeBindingPair[];
    restParams?: TypeBindingPair;
}

export interface TypeBindingPair {
    type: string;
    paramName: string;
    defaultValue?: string;
}

// <------------ EXTENDED LANG CLIENT INTERFACE --------->



// <------------ BI INTERFACES --------->
export interface BIFlowModelRequest {
    filePath?: string;
    startLine?: LinePosition;
    endLine?: LinePosition;
    forceAssign?: boolean;
    useFileSchema?: boolean;
}

export interface BISuggestedFlowModelRequest extends BIFlowModelRequest {
    text: string;
    position: LinePosition;
}

export type BIFlowModelResponse = {
    flowModel?: Flow;
    errorMsg?: string;
    stacktrace?: string;
};

export interface BISourceCodeRequest {
    filePath: string;
    flowNode: FlowNode | FunctionNode;
    isConnector?: boolean;
    isFunctionNodeUpdate?: boolean;
    isHelperPaneChange?: boolean;
    artifactData?: ArtifactData;
}

export type BISourceCodeResponse = {
    textEdits?: {
        [key: string]: TextEdit[];
    };
    errorMsg?: string;
    stacktrace?: string;
};

export type BIDeleteByComponentInfoRequest = {
    filePath: string;
    component: ComponentInfo;
    nodeType?: string;
}

export type BIDeleteByComponentInfoResponse = {
    textEdits: {
        [key: string]: TextEdit[];
    };
};

export interface BIAvailableNodesRequest {
    position: LinePosition;
    filePath: string;
    queryMap?: {
        [key: string]: string;
    }
}

export type BIAvailableNodesResponse = {
    categories: Category[];
};

export interface BIGetVisibleVariableTypesRequest {
    filePath: string;
    position: LinePosition;
}

export interface BIGetVisibleVariableTypesResponse {
    categories: VisibleType[];
}

export interface BINodeTemplateRequest {
    position: LinePosition;
    filePath: string;
    id: CodeData;
    forceAssign?: boolean;
    isLibrary?: boolean;
}

export type BINodeTemplateResponse = {
    flowNode: FlowNode;
};

export interface BIModuleNodesRequest {
    filePath: string;
}

export type BIModuleNodesResponse = {
    flowModel: Flow;
};

export type SearchQueryParams = {
    q?: string;
    limit?: number;
    offset?: number;
    orgName?: string;
    includeAvailableFunctions?: string;
    filterByCurrentOrg?: boolean;
    source?: string;
}

export type SearchKind =
    | "FUNCTION"
    | "CONNECTOR"
    | "TYPE"
    | "WORKFLOW_RUN"
    | "ACTIVITY_CALL"
    | "NP_FUNCTION"
    | "MODEL_PROVIDER"
    | "VECTOR_STORE"
    | "EMBEDDING_PROVIDER"
    | "KNOWLEDGE_BASE"
    | "DATA_LOADER"
    | "CHUNKER"
    | "AGENT"
    | "MEMORY"
    | "SHORT_TERM_MEMORY_STORE"
    | "AGENT_TOOL"
    | "CLASS_INIT"
    | "ALL";

export type BISearchRequest = {
    position?: LineRange;
    filePath: string;
    queryMap?: SearchQueryParams;
    searchKind: SearchKind;
}

export type BISearchResponse = {
    categories: Category[];
}

export interface WorkflowDataRequest {
    workflowName: string;
    filePath: string;
}

export interface WorkflowData {
    name: string;
    type: string;
}

export interface WorkflowDataResponse {
    data?: WorkflowData[];
    output?: {
        data?: WorkflowData[];
        events?: WorkflowData[];
    };
    events?: WorkflowData[];
    errorMsg?: string;
    stacktrace?: string;
}

export type BISearchNodesRequest = {
    filePath: string;
    position?: LinePosition;
    queryMap?: SearchNodesQueryParams;
}

export type BISearchNodesResponse = {
    output: FlowNode[];
    error: string;
}

export type SearchNodesQueryParams = {
    kind?: NodeKind;
    exactMatch?: string;
}

export type BIGetEnclosedFunctionRequest = {
    filePath: string;
    position: LinePosition;
    findClass?: boolean;
    useFileSchema?: boolean;
}

export type BIGetEnclosedFunctionResponse = {
    filePath: string;
    startLine: LinePosition;
    endLine: LinePosition;
}

export type BIConnectorsRequest = {
    queryMap: SearchQueryParams;
}

export type BIConnectorsResponse = {
    categories: Category[];
}

export type ServiceFromOASRequest = {
    openApiContractPath: string;
    projectPath: string;
    port: number;
}

export type ServiceFromOASResponse = {
    service: {
        fileName: string,
        startLine: LinePosition;
        endLine: LinePosition;
    },
    errorMsg?: string;
}

export interface ConfigVariableRequest {
    projectPath: string;
    includeLibraries?: boolean;
}

export type ConfigVariableResponse = {
    configVariables: ConfigVariable[];
    errorMsg?: any;
}

export interface UpdateConfigVariableRequestV2 {
    configFilePath: string;
    configVariable: FlowNode | FunctionNode;
    packageName: string;
    moduleName: string;
}

export type UpdateConfigVariableResponseV2 = {
    textEdits: {
        [key: string]: TextEdit[];
    };
    errorMsg?: any;
};

export interface DeleteConfigVariableRequestV2 {
    configFilePath: string;
    configVariable: FlowNode | FunctionNode;
    packageName: string;
    moduleName: string;
}

export type DeleteConfigVariableResponseV2 = {
    textEdits: {
        [key: string]: TextEdit[];
    };
    errorMsg?: any;
};

export interface GetConfigVariableNodeTemplateRequest {
    isNew: boolean;
    isEnvVariable?: boolean;
}

export interface OpenConfigTomlRequest {
    filePath: string
}

export interface BICopilotContextRequest {
    position: LinePosition;
    filePath: string;
}

export interface BICopilotContextResponse {
    prefix: string;
    suffix: string;
}

export interface BIDesignModelRequest {
    projectPath?: string;
    useFileSchema?: boolean;
}

export type BIDesignModelResponse = {
    designModel: CDModel;
};

export interface SequenceModelRequest {
    filePath: string;
    startLine: LinePosition;
    endLine: LinePosition;
}

export type SequenceModelResponse = {
    sequenceDiagram: SqFlow;
};

export interface ComponentsFromContent {
    content: string;
}

export enum TriggerKind {
    INVOKED = 1,
    TRIGGER_CHARACTER = 2,
    TRIGGER_FOR_INCOMPLETE_COMPLETIONS = 3,
}

export const TRIGGER_CHARACTERS = [':', '.', '>', '@', '/', '\\', '?'] as const;

export type TriggerCharacter = typeof TRIGGER_CHARACTERS[number];

export type ExpressionProperty = Property;

export interface ExpressionEditorContext {
    expression: string;
    startLine: LinePosition;
    offset: number;
    lineOffset: number;
    codedata: CodeData;
    property: ExpressionProperty;
}

export interface ExpressionCompletionsRequest {
    filePath: string;
    context: ExpressionEditorContext;
    completionContext: {
        triggerKind: TriggerKind;
        triggerCharacter?: TriggerCharacter;
    };
}

export interface ExpressionCompletionItem {
    label: string;
    kind: number;
    detail: string;
    sortText: string;
    filterText: string;
    insertText: string;
    insertTextFormat: number;
    additionalTextEdits?: TextEdit[];
    labelDetails?: {
        description?: string;
        detail: string;
    };
}

export type ExpressionCompletionsResponse = ExpressionCompletionItem[];

export interface SignatureHelpRequest {
    filePath: string;
    context: ExpressionEditorContext;
    signatureHelpContext: {
        isRetrigger: boolean;
        triggerCharacter?: TriggerCharacter;
        triggerKind: number;
    }
}

export interface SignatureInfo {
    label: string;
    documentation: {
        kind: string;
        value: string;
    };
    parameters: {
        label: number[];
        documentation: {
            kind: string;
            value: string;
        }
    }[];
}

export interface SignatureHelpResponse {
    signatures: SignatureInfo[];
    activeSignature: number;
    activeParameter: number;
}

export interface VisibleTypesRequest {
    filePath: string;
    position: LinePosition;
    typeConstraint?: string;
}

export interface VisibleTypeItem {
    insertText: string;
    kind: number;
    label: string;
    labelDetails: {
        description: string;
        detail: string;
    }
    detail?: string;
}

export type VisibleTypesResponse = VisibleTypeItem[];

export interface ReferenceLSRequest {
    textDocument: {
        uri: string;
    };
    position: {
        character: number;
        line: number;
    };
    context: {
        includeDeclaration: boolean;
    };
}
export interface Reference {
    uri: string;
    range: Range;
}

export interface FormDiagnosticsRequest {
    filePath: string;
    flowNode: FlowNode | FunctionNode;
    isConnector?: boolean;
    isFunctionNodeUpdate?: boolean;
}

export interface FormDiagnosticsResponse {
    flowNode?: FlowNode | FunctionNode;
    diagnostics?: Diagnostic[];
}

export interface ExpressionDiagnosticsRequest {
    filePath: string;
    context: ExpressionEditorContext;
}

export interface ExpressionDiagnosticsResponse {
    diagnostics: Diagnostic[];
}

export interface UpdateImportsRequest {
    filePath: string;
    importStatement: string;
}

export interface ImportsInfoResponse {
    prefix: string;
    moduleId: string;
}

export interface UpdateImportsResponse extends ImportsInfoResponse {
    importStatementOffset: number;
}

export const functionKinds = {
    CURRENT: 'CURRENT',
    IMPORTED: 'IMPORTED',
    AVAILABLE: 'AVAILABLE'
} as const;

export type FunctionKind = typeof functionKinds[keyof typeof functionKinds];

export interface AddFunctionRequest {
    filePath: string;
    codedata: CodeData;
    kind: FunctionKind;
    searchKind: SearchKind;
}

export interface AddImportItemResponse extends ImportsInfoResponse {
    template: string;
}

export interface RenameIdentifierRequest {
    fileName: string;
    position: Position;
    newName: string;
}

export interface ImportIntegrationRequest {
    packageName: string;
    orgName: string;
    sourcePath: string;
    parameters?: Record<string, any>;
}

export interface ProjectMigrationResult {
    projectName: string;
    textEdits: {
        [key: string]: string;
    };
    report: string;
}

export interface ImportIntegrationResponse {
    error: string;
    textEdits: {
        [key: string]: string;
    };
    report: string;
    jsonReport: string;
}

// <-------- Trigger Related ------->
export interface TriggerModelsRequest {
    organization?: string;
    packageName?: string;
    query?: string;
    keyWord?: string;
}

export interface TriggerModelsResponse {
    local: ServiceModel[];
}

// <-------- Trigger Related ------->

// <-------- Service Designer Related ------->
export interface ListenersRequest {
    filePath: string;
    moduleName: string;
    orgName?: string;
    pkgName?: string;
    listenerTypeName?: string;
    removeDeprecated?: boolean;
}
export interface ListenersResponse {
    hasListeners: boolean;
    listeners: string[];
}
export interface ListenerModelRequest {
    codedata: {
        orgName: string;
        packageName: string;
        moduleName: string;
        version: string;
        type?: string;
    };
    filePath: string;
    removeDeprecated?: boolean;
}
export interface ListenerModelResponse {
    listener: ListenerModel;
}

export interface ListenerSourceCodeRequest {
    filePath: string;
    listener: ListenerModel;
}
export interface ListenerSourceCodeResponse {
    textEdits: {
        [key: string]: TextEdit[];
    };
}
export interface ServiceModelRequest {
    filePath: string;
    moduleName: string;
    listenerName?: string;
    orgName?: string;
    pkgName?: string;
}
export interface ServiceModelResponse {
    service: ServiceModel;
}
export interface ServiceSourceCodeRequest {
    filePath: string;
    service: ServiceModel;
}
export interface ServiceSourceCodeResponse {
    textEdits: {
        [key: string]: TextEdit[];
    };
}

export interface ClassFieldModifierRequest {
    filePath: string;
    field: FieldType;
}

export interface AddFieldRequest {
    filePath: string;
    field: FieldType;
    codedata: {
        lineRange: LineRange;
    };
}

export interface ExpressionTokensRequest {
    expression: string;
    filePath: string;
    position?: LinePosition;
}

export interface ExpressionTokensResponse {
    data: number[];
}

export interface SourceEditResponse {
    textEdits?: {
        [key: string]: TextEdit[];
    };
    errorMsg?: string;
    stacktrace?: string;
}

export interface ServiceClassSourceRequest {
    filePath: string;
    serviceClass: ServiceClassModel;
}

export interface FunctionModelRequest {
    type: string;
    functionName: string;
}

export interface FunctionModelResponse {
    function: FunctionModel;
}
export interface ServiceModelFromCodeRequest {
    filePath: string;
    codedata: {
        lineRange: LineRange; // For the entire service
    };
}
export interface ServiceModelFromCodeResponse {
    service: ServiceModel;
}
export interface ListenerModelFromCodeRequest {
    filePath: string;
    codedata: {
        lineRange: LineRange; // For the entire service
    };
}

export interface ModelFromCodeRequest {
    filePath: string;
    codedata: {
        lineRange: LineRange;
    };
    context: string;
}

export interface ServiceClassModelResponse {
    model?: ServiceClassModel;
    errorMsg?: string;
    stacktrace?: string;
}

export interface ServiceModelInitResponse {
    serviceInitModel?: ServiceInitModel;
    errorMsg?: string;
    stacktrace?: string;
}

export interface ServiceInitSourceRequest {
    filePath: string;
    serviceInitModel: ServiceInitModel;
}

// <-------- Type Related ------->

export interface Type {
    name: string;
    editable: boolean;
    metadata: TypeMetadata;
    codedata: TypeCodeData;
    properties: Record<string, TypeProperty>;
    members: Member[];
    restMember?: Member;
    includes?: string[];
    functions?: TypeFunctionModel[];
    allowAdditionalFields?: boolean;
}

export interface SimpleType {
    name: string;
    imports?: Imports;
}

type ServiceFunctionKind = "RESOURCE" | "REMOTE" | "FUNCTION";

export interface TypeFunctionModel {
    qualifiers: string[];
    accessor: string;
    kind: ServiceFunctionKind;
    name?: string;
    description?: string;
    parameters: Member[];
    restParameter?: Member;
    returnType?: Type | string;
    refs: string[];
    imports?: Imports;
    isGraphqlId?: boolean;
    properties?: { [key: string]: any };
}

export interface TypeMetadata {
    label: string;
    description: string;
}

export type TypeNodeKind = "RECORD" | "ENUM" | "ARRAY" | "UNION" | "ERROR" | "MAP" | "STREAM" | "FUTURE" |
    "TYPEDESC" | "CLASS" | "OBJECT" | "INTERSECTION" | "SERVICE_DECLARATION" | "TABLE" | "TUPLE";
// todo make this consistant
export interface TypeCodeData {
    lineRange?: LineRange;
    node: TypeNodeKind;
}

export interface TypeProperty {
    metadata: TypeMetadata;
    valueType: FormFieldInputType;
    value: string | string[]; // as required for qualifiers
    optional: boolean;
    editable: boolean;
    advanced: boolean;
}

export interface Member {
    kind: string;
    refs: string[];
    type: string | Type;
    name?: string;
    docs?: string;
    defaultValue?: string;
    optional?: boolean;
    imports?: Imports;
    readonly?: boolean;
    selected?: boolean;
    typeName?: string;
    isGraphqlId?: boolean;
}

export interface GetGraphqlTypeRequest {
    filePath: string,
    linePosition: LinePosition;
}

export interface GetGraphqlTypeResponse {
    type: Type;
    refs: Type[];
}

export interface GetTypesRequest {
    filePath: string;
    useFileSchema?: boolean;
}

export interface GetTypeRequest {
    filePath: string;
    linePosition: LinePosition;
}

export interface UpdateTypeRequest {
    filePath: string;
    description: string;
    type: Type;
}

export interface UpdateTypesRequest {
    filePath: string;
    types: Type[];
}

export interface UpdateTypesResponse {
    textEdits: {
        [filePath: string]: TextEdit[];
    };
    errorMsg?: string;
    stacktrace?: string;
}

export interface DeleteTypeRequest {
    filePath: string;
    lineRange: LineRange;
}

export interface DeleteTypeResponse {
    textEdits: {
        [filePath: string]: TextEdit[];
    };
    errorMsg?: string;
    stacktrace?: string;
}

export interface VerifyTypeDeleteRequest {
    filePath: string;
    startPosition: LinePosition;
}

export interface VerifyTypeDeleteResponse {
    canDelete: boolean;
    errorMsg?: string;
    stacktrace?: string;
}

export interface GetTypesResponse {
    types: Type[];
}

export interface GetTypeResponse {
    type: Type;
}

export interface GetSimpleTypeOfExpressionRequest {
    filePath: string;
    position: LinePosition;
    expression: string;
}

export interface GetSimpleTypeOfExpressionResponse {
    type: SimpleType;
}

export interface JsonToTypeRequest {
    jsonString: string;
    typeName: string;
    prefix?: string;
    allowAdditionalFields?: boolean;
    asInline?: boolean;
    nullAsOptional?: boolean;
    filePath?: string;
}

export interface JsonToTypeResponse {
    types: {
        type: Type;
        refs: string[];
    }[];
}

export interface GetRecordConfigRequest {
    filePath: string;
    codedata: {
        org: string;
        module: string;
        version: string;
        packageName?: string;
    };
    typeConstraint: string;
}

export interface GetRecordConfigResponse {
    recordConfig?: TypeField;
    errorMsg?: string;
    stacktrace?: string;
}

export type RecordSourceGenRequest = {
    filePath: string;
    type: TypeField;
    // The type the generated value is assigned to, e.g. "jco:DestinationConfig|jco:AdvancedConfig".
    // Optional for backward compatibility.
    typeConstraint?: string;
    // Package coordinates of the type, used to resolve imports. Same shape passed to getRecordConfig.
    // Optional for backward compatibility.
    codedata?: {
        org: string;
        module: string;
        version: string;
        packageName?: string;
    };
}

export type RecordSourceGenResponse = {
    errorMessage?: string;
    stackTrace?: string;
    recordValue?: string;
}

export type UpdateRecordConfigRequest = {
    filePath: string;
    codedata: {
        org: string;
        module: string;
        version: string;
    };
    typeConstraint: string;
    expr: string;
}

export type GetRecordModelFromSourceRequest = {
    filePath: string;
    typeMembers: PropertyTypeMemberInfo[];
    expr: string;
}

export type GetRecordModelFromSourceResponse = {
    recordConfig: TypeField;
    typeName: string;
    errorMsg?: string;
    stacktrace?: string;
}


export interface TextEditRange {
    start: {
        line: number;
        character: number;
    };
    end: {
        line: number;
        character: number;
    };
}

export interface TextEdit {
    range: TextEditRange;
    newText: string;
}

export interface UpdateTypeResponse {
    name: string;
    textEdits: {
        [filePath: string]: TextEdit[];
    };
}

// <-------- Trigger Related ------->

export interface TriggerFunctionResponse {

}

export interface ListenerModelFromCodeResponse {
    listener: ListenerModel;
}
export interface HttpResourceModelRequest {
    type: "http",
    functionName: "resource"
}
export interface HttpResourceModelResponse {
    function: FunctionModel;
}
export interface FunctionSourceCodeRequest {
    filePath: string;
    function: FunctionModel;
    codedata: {
        lineRange: LineRange; // For the entire service
    };
    service?: ServiceModel;
    artifactType?: DIRECTORY_MAP;
}
export interface ResourceSourceCodeResponse {
    textEdits: {
        [key: string]: TextEdit[];
    };
}

export interface ResourceReturnTypesRequest {
    filePath?: string;
    context?: string;
}

export interface ResponseCode {
    category: string;
    label: string;
    type: string;
    statusCode: string;
    hasBody?: boolean;
}
export type ResourceReturnTypesResponse = VisibleTypeItem[];
// <-------- Service Designer Related ------->

export interface FunctionFromSourceRequest {
    filePath: string;
    codedata: CodeData;
}

export interface FunctionFromSourceResponse {
    function: FunctionModel;
    errorMsg?: string;
    stacktrace?: string;
}

export interface FunctionNodeRequest {
    projectPath?: string;
    fileName?: string;
    functionName: string;
}
export interface FunctionNodeResponse {
    functionDefinition: FunctionNode;
}

// <-------- AI Agent Related ------->

export interface AiModuleOrgRequest {
    projectPath: string;
}

export interface AiModuleOrgResponse {
    orgName: string;
}

export interface AINodesRequest {
    filePath: string;
    orgName: string;
}
export interface AINodesResponse {
    agents?: CodeData[];
    models?: CodeData[];
}
export interface MemoryManagersRequest {
    filePath: string;
    orgName: string;
}
export interface MemoryManagersResponse {
    memoryManagers?: CodeData[];
}
export interface AIModelsResponse {
    models: string[];
}

// TODO: Correct the data type
export interface AIModelsRequest {
    agent: any;
    filePath?: string;
    orgName: string;
}

export interface AIToolsRequest {
    filePath: string;
    serviceUrl?: string;
    configs?: Record<string, string>;
}

export interface AIToolsResponse {
    tools: string[];
}

export interface AIToolRequest {
    toolName: string;
    projectPath: string;
}

export interface AIToolResponse {
    name: string;
    source: string;
    toolParameters: Property;
    connection: string;
    description: string;
    toolDescription: string;
    diagram: FunctionNode;
    output: {
        [key: string]: TextEdit[];
    };
}

export interface CertConfig {
    path?: string;
    password?: string;
}

export interface SecureSocketConfig {
    cert?: CertConfig;
    key?: CertConfig;
    insecure?: boolean;
}

export interface McpToolsRequest {
    serviceUrl?: string;
    accessToken?: string;
    secureSocket?: SecureSocketConfig;
}

export interface McpToolsResponse {
    tools: Array<{
        name: string;
        description?: string;
    }>;
    errorMsg?: string;
}

export interface AIGentToolsRequest {
    filePath: string;
    flowNode: FlowNode;
    toolName: string;
    description: string;
    connection: string;
    toolParameters?: ToolParameters;
}

export interface AIGentToolsResponse {
    artifacts?: ProjectStructureArtifactResponse[];
    textEdits: {
        [key: string]: TextEdit[];
    };
}

export interface GenAgentToolRequest {
    filePath: string;
    agentVarName: string;
    includeContext: boolean;
    toolName: string;
    description: string;
}

export interface AIGetPackageVersionRequest {
    projectPath: string;
    org: string;
    packageName: string;
}

export interface AIGetPackageVersionResponse {
    version: string;
}

export type OpenAPIClientGenerationRequest = {
    openApiContractPath: string;
    projectPath: string;
    module: string;
}

interface OpenAPIClientSource {
    isModuleExists: boolean;
    textEditsMap: {
        [key: string]: TextEdit[];
    };
}

export type OpenAPIClientGenerationResponse = {
    source: OpenAPIClientSource;
}

export type OpenAPIGeneratedModulesRequest = {
    projectPath: string;
}

export type OpenAPIGeneratedModulesResponse = {
    modules: string[];
}

export type OpenAPIClientDeleteRequest = {
    projectPath: string;
    module: string;
}

export type OpenAPIClientDeleteData = {
    filesToDelete: string[];
    textEditsMap: {
        [key: string]: TextEdit[];
    };
}

export type OpenAPIClientDeleteResponse = {
    deleteData: OpenAPIClientDeleteData
}

// <-------- Deployment Related ------->

export interface ProjectScopeMapping {
    projectPath: string;
    projectTitle: string;
    integrationTypes?: SCOPE[];
}

export interface DeploymentRequest {
    integrationTypes: SCOPE[];
}

export interface DeploymentResponse {
    isCompleted: boolean;
}

export interface WorkspaceDeploymentRequest {
    projectScopes: ProjectScopeMapping[];
    rootDirectory: string;
}

// 2201.12.3 -> New Project Component Artifacts Tree

export interface BaseArtifact<T = any> {
    id: string;
    location: {
        fileName: string;
        startLine: {
            line: number;
            offset: number;
        };
        endLine: {
            line: number;
            offset: number;
        };
    };
    type: DIRECTORY_MAP;
    name: string;
    module?: string;
    scope: string;
    visibility?: VISIBILITY;
    icon?: string; // Optional for those that have an icon
    children?: Record<string, BaseArtifact>; // To allow nested structures
    accessor?: string; // Specific to Entry Points
    value?: T; // Generic value property to hold different types
}

// Artifact Types
export enum ARTIFACT_TYPE {
    Functions = "Functions",
    Workflows = "Workflows",
    Connections = "Connections",
    Agents = "Agents",
    Listeners = "Listeners",
    EntryPoints = "Entry Points",
    Types = "Types",
    NaturalFunctions = "Natural Functions",
    DataMappers = "Data Mappers",
    Configurations = "Configurations",
    Variables = "Variables"
}

export enum PROJECT_KIND {
    WORKSPACE_PROJECT = "WORKSPACE_PROJECT",
    BUILD_PROJECT = "BUILD_PROJECT"
}

export interface Artifacts {
    [ARTIFACT_TYPE.Functions]: Record<string, BaseArtifact>;
    [ARTIFACT_TYPE.Workflows]?: Record<string, BaseArtifact>;
    [ARTIFACT_TYPE.Connections]: Record<string, BaseArtifact>;
    [ARTIFACT_TYPE.Agents]: Record<string, BaseArtifact>;
    [ARTIFACT_TYPE.Listeners]: Record<string, BaseArtifact>;
    [ARTIFACT_TYPE.EntryPoints]: Record<string, BaseArtifact>;
    [ARTIFACT_TYPE.Types]: Record<string, BaseArtifact>;
    [ARTIFACT_TYPE.NaturalFunctions]: Record<string, BaseArtifact>;
    [ARTIFACT_TYPE.DataMappers]: Record<string, BaseArtifact>;
    [ARTIFACT_TYPE.Configurations]: Record<string, BaseArtifact>;
}

export interface ArtifactsNotification {
    uri: string;
    artifacts: Artifacts;
    moduleName?: string;
    projectName?: string;
}

export interface ProjectArtifactsRequest {
    projectPath: string;
}

export interface ProjectArtifacts {
    artifacts: Artifacts;
}

export interface ProjectInfoRequest {
    projectPath: string;
}

export interface ProjectInfo {
    projectKind: PROJECT_KIND;
    name?: string;
    title?: string;
    orgName?: string;
    org?: string;
    version?: string;
    projectPath?: string;
    children?: ProjectInfo[];
};

// <------------ BI INTERFACES --------->

export interface BaseLangClientInterface {
    init?: (params: InitializeParams) => Promise<InitializeResult>;
    didOpen: (Params: DidOpenParams) => void;
    didClose: (params: DidCloseParams) => void;
    didChange: (params: DidChangeParams) => void;
    definition: (params: DefinitionParams) => Promise<Location | Location[] | LocationLink[] | null>;
    close?: () => void;
}

export interface BIInterface extends BaseLangClientInterface {
    getSTByRange: (params: BallerinaSTParams) => Promise<SyntaxTree | NOT_SUPPORTED_TYPE>;
    getFlowModel: (params: BIFlowModelRequest) => Promise<BIFlowModelResponse>;
    getSourceCode: (params: BISourceCodeRequest) => Promise<BISourceCodeResponse>;
    getAvailableNodes: (params: BIAvailableNodesRequest) => Promise<BIAvailableNodesResponse>;
    getNodeTemplate: (params: BINodeTemplateRequest) => Promise<BINodeTemplateResponse>;
    getSequenceDiagramModel: (params: SequenceModelRequest) => Promise<SequenceModelResponse>;
    generateServiceFromOAS: (params: ServiceFromOASRequest) => Promise<ServiceFromOASResponse>;
    getExpressionCompletions: (params: ExpressionCompletionsRequest) => Promise<ExpressionCompletionsResponse>;
    getConfigVariablesV2: (params: ConfigVariableRequest) => Promise<ConfigVariableResponse>;
    updateConfigVariablesV2: (params: UpdateConfigVariableRequestV2) => Promise<UpdateConfigVariableResponseV2>;
    deleteConfigVariableV2: (params: DeleteConfigVariableRequestV2) => Promise<DeleteConfigVariableResponseV2>;
    getConfigVariableNodeTemplate: (params: GetConfigVariableNodeTemplateRequest) => Promise<BINodeTemplateResponse>;
    getComponentsFromContent: (params: ComponentsFromContent) => Promise<BallerinaProjectComponents>;
    getSignatureHelp: (params: SignatureHelpRequest) => Promise<SignatureHelpResponse>;
    getVisibleTypes: (params: VisibleTypesRequest) => Promise<VisibleTypesResponse>;
    getFormDiagnostics: (params: FormDiagnosticsRequest) => Promise<FormDiagnosticsResponse>;
    getExpressionDiagnostics: (params: ExpressionDiagnosticsRequest) => Promise<ExpressionDiagnosticsResponse>;
    getOpenApiGeneratedModules: (params: OpenAPIGeneratedModulesRequest) => Promise<OpenAPIGeneratedModulesResponse>

    // New Service Designer APIs
    getTriggerModels: (params: TriggerModelsRequest) => Promise<TriggerModelsResponse>;
    getListeners: (params: ListenersRequest) => Promise<ListenersResponse>;
    getListenerModel: (params: ListenerModelRequest) => Promise<ListenerModelResponse>;
    addListenerSourceCode: (params: ListenerSourceCodeRequest) => Promise<ListenerSourceCodeResponse>;
    getListenerFromSourceCode: (params: ListenerModelFromCodeRequest) => Promise<ListenerModelFromCodeResponse>;
    getServiceModel: (params: ServiceModelRequest) => Promise<ServiceModelResponse>;
    addServiceSourceCode: (params: ServiceSourceCodeRequest) => Promise<ListenerSourceCodeResponse>;
    getServiceModelFromCode: (params: ServiceModelFromCodeRequest) => Promise<ServiceModelFromCodeResponse>;
    getHttpResourceModel: (params: HttpResourceModelRequest) => Promise<HttpResourceModelResponse>;
    addResourceSourceCode: (params: FunctionSourceCodeRequest) => Promise<ResourceSourceCodeResponse>;
    addFunctionSourceCode: (params: FunctionSourceCodeRequest) => Promise<ResourceSourceCodeResponse>;
    getResourceReturnTypes: (params: ResourceReturnTypesRequest) => Promise<VisibleTypesResponse>;
    getServiceInitModel: (params: ServiceModelRequest) => Promise<ServiceModelInitResponse>;
    createServiceAndListener: (params: ServiceInitSourceRequest) => Promise<SourceEditResponse>;

    // Function APIs
    getFunctionNode: (params: FunctionNodeRequest) => Promise<FunctionNodeResponse>;
    getFunctionFromSource: (params: FunctionFromSourceRequest) => Promise<FunctionFromSourceResponse>;

    getDesignModel: (params: BIDesignModelRequest) => Promise<BIDesignModelResponse>;
    getType: (params: GetTypeRequest) => Promise<GetTypeResponse>;
    getTypes: (params: GetTypesRequest) => Promise<GetTypesResponse>;
    getSimpleTypeOfExpression: (params: GetSimpleTypeOfExpressionRequest) => Promise<GetSimpleTypeOfExpressionResponse>;
    updateType: (params: UpdateTypeRequest) => Promise<UpdateTypeResponse>;
    getAllData: (params: WorkflowDataRequest) => Promise<WorkflowDataResponse>;
    updateImports: (params: UpdateImportsRequest) => Promise<ImportsInfoResponse>;
    addFunction: (params: AddFunctionRequest) => Promise<AddImportItemResponse>;
    convertJsonToRecordType: (params: JsonToRecordParams) => Promise<TypeDataWithReferences>;
    convertXmlToRecordType: (params: XMLToRecordParams) => Promise<TypeDataWithReferences>;

    // AI Agent APIs
    getAllAgents: (params: AINodesRequest) => Promise<AINodesResponse>;
    getAllModels: (params: AIModelsRequest) => Promise<AINodesResponse>;
    getModels: (params: AIModelsRequest) => Promise<AIModelsResponse>;
    getTools: (params: AIToolsRequest) => Promise<AIToolsResponse>;
    getMcpTools: (params: McpToolsRequest) => Promise<McpToolsResponse>;
    genTool: (params: AIGentToolsRequest) => Promise<AIGentToolsResponse>;
    getPackageVersion: (params: AIGetPackageVersionRequest) => Promise<AIGetPackageVersionResponse>;
}

export interface ExtendedLangClientInterface extends BIInterface {
    rename(params: RenameParams): Promise<WorkspaceEdit | NOT_SUPPORTED_TYPE>;
    getDocumentSymbol(params: DocumentSymbolParams): Promise<DocumentSymbol[] | SymbolInformation[] | NOT_SUPPORTED_TYPE>;
    codeAction(params: CodeActionParams): Promise<CodeAction[]>;
    getCompletion(params: CompletionParams): Promise<Completion[]>;
    executeCommand(params: ExecuteCommandParams): Promise<any>;
    initBalServices(params: BallerinaInitializeParams): Promise<BallerinaInitializeResult>;
    getPackageComponentModels(params: ComponentModelsParams): Promise<ComponentModels>;
    getPersistERModel(params: PersistERModelParams): Promise<PersistERModel>;
    getDiagnostics(params: DiagnosticsParams): Promise<Diagnostics[] | NOT_SUPPORTED_TYPE>;
    getConnector(params: ConnectorRequest): Promise<ConnectorResponse | NOT_SUPPORTED_TYPE>;
    getRecord(params: RecordParams): Promise<BallerinaRecord | NOT_SUPPORTED_TYPE>;
    getSymbolDocumentation(params: SymbolInfoParams): Promise<SymbolInfo | NOT_SUPPORTED_TYPE>;
    getTypeFromExpression(params: TypeFromExpressionParams): Promise<TypesFromExpression | NOT_SUPPORTED_TYPE>;
    getTypeFromSymbol(params: TypeFromSymbolParams): Promise<TypesFromSymbol | NOT_SUPPORTED_TYPE>;
    getTypesFromFnDefinition(params: TypesFromFnDefinitionParams): Promise<TypesFromSymbol | NOT_SUPPORTED_TYPE>;
    getGraphqlModel(params: GraphqlDesignServiceParams): Promise<GraphqlDesignService | NOT_SUPPORTED_TYPE>;
    getSyntaxTree(req: SyntaxTreeParams): Promise<SyntaxTree | NOT_SUPPORTED_TYPE>;
    fetchExamples(args: BallerinaExampleListParams): Promise<BallerinaExampleList | NOT_SUPPORTED_TYPE>;
    getBallerinaProject(params: BallerinaProjectParams): Promise<BallerinaProject | NOT_SUPPORTED_TYPE>;
    getBallerinaProjectComponents(params: BallerinaPackagesParams): Promise<BallerinaProjectComponents | NOT_SUPPORTED_TYPE>;
    getBallerinaProjectConfigSchema(params: BallerinaProjectParams): Promise<PackageConfigSchema | NOT_SUPPORTED_TYPE>;
    getSyntaxTreeNode(params: SyntaxTreeNodeParams): Promise<SyntaxTreeNode | NOT_SUPPORTED_TYPE>;
    updateStatusBar(): void;
    getDidOpenParams(): DidOpenParams;
    getProjectArtifacts(params: ProjectArtifactsRequest): Promise<ProjectArtifacts>;
    getProjectInfo(params: ProjectInfoRequest): Promise<ProjectInfo>;
    getSimpleTypeOfExpression(params: GetSimpleTypeOfExpressionRequest): Promise<GetSimpleTypeOfExpressionResponse>;
    openConfigToml(params: OpenConfigTomlRequest): Promise<void>;
}
