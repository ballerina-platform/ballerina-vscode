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

import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { isRecording, recordLs } from "../test-support/fixtureRecorder";
import { CodeAction, CodeActionParams, DocumentSymbol, DocumentSymbolParams, ExecuteCommandParams, RenameParams, SymbolInformation, WorkspaceEdit } from "monaco-languageclient";
import {
    Connectors,
    STModifyParams,
    SyntaxTree,
    DiagnosticsParams,
    CompletionParams,
    Completion,
    DidChangeParams,
    TypesFromExpression,
    NOT_SUPPORTED_TYPE,
    SymbolInfo,
    APITimeConsumption,
    BallerinaProject,
    NotebookVariable,
    DidOpenParams,
    DidCloseParams,
    BallerinaInitializeParams,
    BallerinaInitializeResult,
    ComponentModelsParams,
    ComponentModels,
    PersistERModelParams,
    PersistERModel,
    Diagnostics,
    ExpressionType,
    ConnectorsParams,
    TriggersParams,
    Triggers,
    Connector,
    TriggerParams,
    Trigger,
    RecordParams,
    BallerinaRecord,
    BallerinaSTParams,
    TriggerModifyParams,
    SymbolInfoParams,
    TypeFromExpressionParams,
    TypeFromSymbolParams,
    TypesFromFnDefinitionParams,
    VisibleVariableTypesParams,
    GraphqlDesignServiceParams,
    SyntaxTreeParams,
    BallerinaExampleListParams,
    BallerinaExampleList,
    BallerinaProjectParams,
    BallerinaPackagesParams,
    BallerinaProjectComponents,
    PackageConfigSchema,
    SyntaxTreeNodeParams,
    SyntaxTreeNode,
    ExecutorPositions,
    TestsDiscoveryRequest,
    TestsDiscoveryResponse,
    JsonToRecordParams,
    XMLToRecordParams,
    XMLToRecord,
    JsonToRecord,
    NoteBookCellOutputParams,
    NoteBookCellOutput,
    NotebookFileSource,
    NotebookDeleteDclnParams,
    PartialSTParams,
    OpenAPIConverterParams,
    OpenAPISpec,
    TypesFromSymbol,
    GraphqlDesignService,
    PartialST,
    BallerinaServerCapability,
    ExtendedLangClientInterface,
    BIAvailableNodesRequest,
    BIAvailableNodesResponse,
    BINodeTemplateRequest,
    BINodeTemplateResponse,
    BIFlowModelRequest,
    BIFlowModelResponse,
    BISourceCodeRequest,
    BISourceCodeResponse,
    ConnectorRequest,
    ConnectorResponse,
    BISuggestedFlowModelRequest,
    BICopilotContextRequest,
    BICopilotContextResponse,
    SequenceModelRequest,
    SequenceModelResponse,
    ServiceFromOASRequest,
    ServiceFromOASResponse,
    ExpressionCompletionsRequest,
    ExpressionCompletionsResponse,
    VisibleVariableTypes,
    ConfigVariableResponse,
    ConfigVariableRequest,
    ProjectDiagnosticsRequest,
    ProjectDiagnosticsResponse,
    MainFunctionParamsRequest,
    MainFunctionParamsResponse,
    BIModuleNodesRequest,
    BIModuleNodesResponse,
    ComponentsFromContent,
    SignatureHelpRequest,
    SignatureHelpResponse,
    VisibleTypesRequest,
    ReferenceLSRequest,
    Reference,
    VisibleTypesResponse,
    BIDeleteByComponentInfoRequest,
    ExpressionDiagnosticsRequest,
    ExpressionDiagnosticsResponse,
    TriggerModelsRequest,
    TriggerModelsResponse,
    BIGetEnclosedFunctionRequest,
    BIGetEnclosedFunctionResponse,
    HttpResourceModelRequest,
    HttpResourceModelResponse,
    ListenerModelRequest,
    ListenerModelResponse,
    ListenerSourceCodeRequest,
    ListenerSourceCodeResponse,
    ListenersRequest,
    ListenersResponse,
    FunctionSourceCodeRequest,
    ResourceSourceCodeResponse,
    ServiceModelFromCodeRequest,
    ServiceModelFromCodeResponse,
    ServiceModelRequest,
    ServiceModelResponse,
    ServiceSourceCodeRequest,
    BIDesignModelRequest,
    BIDesignModelResponse,
    GetTypesResponse,
    GetTypesRequest,
    UpdateTypeRequest,
    UpdateTypeResponse,
    GetGraphqlTypeRequest,
    GetGraphqlTypeResponse,
    GetTypeRequest,
    GetTypeResponse,
    ListenerModelFromCodeRequest,
    ListenerModelFromCodeResponse,
    AddFunctionRequest,
    AddImportItemResponse,
    UpdateImportsRequest,
    DataMapperModelRequest,
    DataMapperSourceRequest,
    DataMapperSourceResponse,
    DataMapperModelResponse,
    VisualizableFieldsRequest,
    VisualizableFieldsResponse,
    AddArrayElementRequest,
    ConvertToQueryRequest,
    GetTestFunctionRequest,
    GetTestFunctionResponse,
    AddOrUpdateTestFunctionRequest,
    TestSourceEditResponse,
    FunctionNodeResponse,
    FunctionNodeRequest,
    ModelFromCodeRequest,
    ServiceClassModelResponse,
    ClassFieldModifierRequest,
    SourceEditResponse,
    ServiceClassSourceRequest,
    AddFieldRequest,
    FunctionModelRequest,
    FunctionModelResponse,
    TypeDataWithReferences,
    AiModuleOrgRequest,
    AiModuleOrgResponse,
    AINodesResponse,
    AIModelsRequest,
    AIToolsRequest,
    AIToolsResponse,
    AIGentToolsRequest,
    AIGentToolsResponse,
    GenAgentToolRequest,
    ICPEnabledRequest,
    ICPEnabledResponse,
    WorkflowManagementRequest,
    WorkflowManagementResponse,
    AINodesRequest,
    BISearchRequest,
    BISearchResponse,
    WorkflowDataRequest,
    WorkflowDataResponse,
    AIModelsResponse,
    GetRecordConfigRequest,
    GetRecordConfigResponse,
    UpdateRecordConfigRequest,
    RecordSourceGenResponse,
    RecordSourceGenRequest,
    GetRecordModelFromSourceRequest,
    GetRecordModelFromSourceResponse,
    UpdateTypesRequest,
    UpdateTypesResponse,
    DidChangeWatchedFileParams,
    OpenAPIClientGenerationRequest,
    OpenAPIClientGenerationResponse,
    OpenAPIGeneratedModulesRequest,
    OpenAPIGeneratedModulesResponse,
    OpenAPIClientDeleteResponse,
    OpenAPIClientDeleteRequest,
    ImportsInfoResponse,
    ProjectArtifactsRequest,
    ProjectArtifacts,
    Artifacts,
    MemoryManagersRequest,
    MemoryManagersResponse,
    ArtifactsNotification,
    AddClausesRequest,
    PropertyRequest,
    PropertyResponse,
    OpenConfigTomlRequest,
    UpdateConfigVariableRequestV2,
    UpdateConfigVariableResponseV2,
    DeleteConfigVariableRequestV2,
    DeleteConfigVariableResponseV2,
    ResourceReturnTypesRequest,
    JsonToTypeRequest,
    JsonToTypeResponse,
    McpToolsRequest,
    McpToolsResponse,
    CopilotCompactLibrariesResponse,
    CopilotAllLibrariesRequest,
    CopilotFilterLibrariesResponse,
    CopilotFilterLibrariesRequest,
    GetConfigVariableNodeTemplateRequest,
    FunctionFromSourceRequest,
    FunctionFromSourceResponse,
    GetDataMapperCodedataRequest,
    GetDataMapperCodedataResponse,
    GetSubMappingCodedataRequest,
    AddSubMappingRequest,
    DeleteMappingRequest,
    MapWithFnRequest,
    AIToolResponse,
    AIToolRequest,
    VerifyTypeDeleteRequest,
    VerifyTypeDeleteResponse,
    DeleteTypeRequest,
    DeleteTypeResponse,
    ImportIntegrationRequest,
    ImportIntegrationResponse,
    onMigrationToolStateChanged,
    onMigrationToolLogs,
    GetMigrationToolsResponse,
    ServiceModelInitResponse,
    ServiceInitSourceRequest,
    DeleteSubMappingRequest,
    DeleteClauseRequest,
    ClearTypeCacheResponse,
    FormDiagnosticsRequest,
    FormDiagnosticsResponse,
    BISearchNodesRequest,
    BISearchNodesResponse,
    ExpressionTokensRequest,
    ExpressionTokensResponse,
    ProjectInfoRequest,
    ProjectInfo,
    onMigratedProject,
    ProjectMigrationResult,
    FieldPropertyRequest,
    ClausePositionResponse,
    ClausePositionRequest,
    SemanticDiffRequest,
    SemanticDiffResponse,
    ConvertExpressionRequest,
    ConvertExpressionResponse,
    IntrospectDatabaseRequest,
    IntrospectDatabaseResponse,
    PersistClientGenerateRequest,
    PersistClientGenerateResponse,
    WSDLApiClientGenerationRequest,
    WSDLApiClientGenerationResponse,
    CopilotSearchLibrariesBySearchRequest,
    CopilotSearchLibrariesBySearchResponse,
    ResolveOutputRequest,
    CreateConvertedVariableRequest,
    IntrospectCredentialsRequest,
    IntrospectCredentialsResponse,
    GetSimpleTypeOfExpressionResponse,
    GetSimpleTypeOfExpressionRequest,
    AIGetPackageVersionRequest,
    AIGetPackageVersionResponse
} from "@wso2/ballerina-core";
import { BallerinaExtension } from "./index";
import { emitMigrationToolState, emitMigrationToolLog, emitMigratedProject } from "../features/ai/migration/migrationEvents";
import { debug, handlePullModuleProgress } from "../utils";
import { CMP_LS_CLIENT_COMPLETIONS, CMP_LS_CLIENT_DIAGNOSTICS, getMessageObject, sendTelemetryEvent, TM_EVENT_LANG_CLIENT } from "../features/telemetry";
import { DefinitionParams, InitializeParams, InitializeResult, Location, LocationLink, TextDocumentPositionParams } from 'vscode-languageserver-protocol';
import { updateProjectArtifacts } from "../utils/project-artifacts";
import { RPCLayer } from "../../src/RPCLayer";
import { VisualizerWebview } from "../../src/views/visualizer/webview";

export const CONNECTOR_LIST_CACHE = "CONNECTOR_LIST_CACHE";
export const HTTP_CONNECTOR_LIST_CACHE = "HTTP_CONNECTOR_LIST_CACHE";
export const BALLERINA_LANG_ID = "ballerina";
export const NOT_SUPPORTED = {};

enum EXTENDED_APIS {
    DOCUMENT_ST_NODE = 'ballerinaDocument/syntaxTreeNode',
    DOCUMENT_EXECUTOR_POSITIONS = 'ballerinaDocument/executorPositions',
    DOCUMENT_ST_MODIFY = 'ballerinaDocument/syntaxTreeModify',
    DOCUMENT_DIAGNOSTICS = 'ballerinaDocument/diagnostics',
    DOCUMENT_ST = 'ballerinaDocument/syntaxTree',
    DOCUMENT_AST_MODIFY = 'ballerinaDocument/astModify',
    DOCUMENT_TRIGGER_MODIFY = 'ballerinaDocument/triggerModify',
    SYMBOL_TYPE = 'ballerinaSymbol/type',
    CONNECTOR_CONNECTORS = 'ballerinaConnector/connectors',
    CONNECTOR_CONNECTOR = 'ballerinaConnector/connector',
    CONNECTOR_RECORD = 'ballerinaConnector/record',
    PACKAGE_COMPONENTS = 'ballerinaPackage/components',
    PACKAGE_METADATA = 'ballerinaPackage/metadata',
    PACKAGE_CONFIG_SCHEMA = 'ballerinaPackage/configSchema',
    JSON_TO_RECORD_CONVERT = 'jsonToRecord/convert',
    XML_TO_RECORD_CONVERT = 'xmlToRecord/convert',
    JSON_TO_TYPE_CONVERT = 'typesManager/jsonToType',
    JSON_TO_RECORD_TYPE_CONVERT = 'jsonToRecordTypes/convert',
    XML_TO_RECORD_TYPE_CONVERT = 'xmlToRecordTypes/convert',
    PARTIAL_PARSE_SINGLE_STATEMENT = 'partialParser/getSTForSingleStatement',
    PARTIAL_PARSE_EXPRESSION = 'partialParser/getSTForExpression',
    PARTIAL_PARSE_MODULE_MEMBER = 'partialParser/getSTForModuleMembers',
    PARTIAL_PARSE_MODULE_PART = 'partialParser/getSTForModulePart',
    PARTIAL_PARSE_RESOURCE = 'partialParser/getSTForResource',
    EXAMPLE_LIST = 'ballerinaExample/list',
    PERF_ANALYZER_RESOURCES_ENDPOINTS = 'performanceAnalyzer/getResourcesWithEndpoints',
    RESOLVE_MISSING_DEPENDENCIES = 'ballerinaDocument/resolveMissingDependencies',
    RESOLVE_MODULE_DEPENDENCIES = 'ballerinaDocument/resolveModuleDependencies',
    BALLERINA_TO_OPENAPI = 'openAPILSExtension/generateOpenAPI',
    NOTEBOOK_RESULT = "balShell/getResult",
    NOTEBOOK_FILE_SOURCE = "balShell/getShellFileSource",
    NOTEBOOK_RESTART = "balShell/restartNotebook",
    NOTEBOOK_VARIABLES = "balShell/getVariableValues",
    NOTEBOOK_DELETE_DCLNS = "balShell/deleteDeclarations",
    SYMBOL_DOC = 'ballerinaSymbol/getSymbol',
    SYMBOL_TYPE_FROM_EXPRESSION = 'ballerinaSymbol/getTypeFromExpression',
    SYMBOL_TYPE_FROM_SYMBOL = 'ballerinaSymbol/getTypeFromSymbol',
    SYMBOL_TYPES_FROM_FN_SIGNATURE = 'ballerinaSymbol/getTypesFromFnDefinition',
    COMPONENT_MODEL_ENDPOINT = 'projectDesignService/getProjectComponentModels',
    GRAPHQL_DESIGN_MODEL = 'graphqlDesignService/getGraphqlModel',
    DOCUMENT_ST_FUNCTION = 'ballerinaDocument/syntaxTreeByName',
    DEFINITION_POSITION = 'ballerinaDocument/syntaxTreeNodeByPosition',
    PERSIST_MODEL_ENDPOINT = 'persistERGeneratorService/getPersistERModels',
    DOCUMENT_ST_BY_RANGE = 'ballerinaDocument/syntaxTreeByRange',
    SEQUENCE_DIAGRAM_MODEL = 'sequenceModelGeneratorService/getSequenceDiagramModel',
    BI_FLOW_MODEL = 'flowDesignService/getFlowModel',
    BI_SUGGESTED_FLOW_MODEL = 'flowDesignService/getSuggestedFlowModel',
    BI_COPILOT_CONTEXT = 'flowDesignService/getCopilotContext',
    BI_SOURCE_CODE = 'flowDesignService/getSourceCode',
    BI_DELETE_NODE = 'flowDesignService/deleteFlowNode',
    BI_DELETE_BY_COMPONENT_INFO = 'flowDesignService/deleteComponent',
    BI_VERIFY_TYPE_DELETE = 'typesManager/verifyTypeDelete',
    BI_DELETE_TYPE = 'typesManager/deleteType',
    BI_AVAILABLE_NODES = 'flowDesignService/getAvailableNodes',
    BI_AVAILABLE_AGENTS = 'flowDesignService/getAvailableAgents',
    BI_AVAILABLE_MODEL_PROVIDERS = 'flowDesignService/getAvailableModelProviders',
    BI_AVAILABLE_VECTOR_STORES = 'flowDesignService/getAvailableVectorStores',
    BI_AVAILABLE_EMBEDDING_PROVIDERS = 'flowDesignService/getAvailableEmbeddingProviders',
    BI_AVAILABLE_KNOWLEDGE_BASES = 'flowDesignService/getAvailableVectorKnowledgeBases',
    BI_AVAILABLE_DATA_LOADERS = 'flowDesignService/getAvailableDataLoaders',
    BI_AVAILABLE_CHUNKS = 'flowDesignService/getAvailableChunkers',
    BI_NODE_TEMPLATE = 'flowDesignService/getNodeTemplate',
    BI_GEN_OPEN_API = 'flowDesignService/generateServiceFromOpenApiContract',
    BI_MODULE_NODES = 'flowDesignService/getModuleNodes',
    BI_GEN_ERROR_HANDLER = 'flowDesignService/addErrorHandler',
    BI_GET_ENCLOSED_FUNCTION = 'flowDesignService/getEnclosedFunctionDef',
    BI_EXPRESSION_COMPLETIONS = 'expressionEditor/completion',
    BI_DATA_MAPPER_COMPLETIONS = 'expressionEditor/dataMapperCompletion',
    VISIBLE_VARIABLE_TYPES = 'expressionEditor/visibleVariableTypes',
    DATA_MAPPER_MAPPINGS = 'dataMapper/mappings',
    DATA_MAPPER_GET_SOURCE = 'dataMapper/getSource',
    DATA_MAPPER_VISUALIZABLE = 'dataMapper/visualizable',
    DATA_MAPPER_ADD_ELEMENT = 'dataMapper/addElement',
    DATA_MAPPER_CONVERT_TO_QUERY = 'dataMapper/convertToQuery',
    DATA_MAPPER_ADD_CLAUSES = 'dataMapper/addClauses',
    DATA_MAPPER_DELETE_CLAUSE = 'dataMapper/deleteClause',
    DATA_MAPPER_ADD_SUB_MAPPING = 'dataMapper/addSubMapping',
    DATA_MAPPER_DELETE_MAPPING = 'dataMapper/deleteMapping',
    DATA_MAPPER_DELETE_SUB_MAPPING = 'dataMapper/deleteSubMapping',
    DATA_MAPPER_MAP_WITH_CUSTOM_FN = 'dataMapper/customFunction',
    DATA_MAPPER_MAP_WITH_TRANSFORM_FN = 'dataMapper/transformationFunction',
    DATA_MAPPER_RESOLVE_OUTPUT = 'dataMapper/resolveOutput',
    DATA_MAPPER_CODEDATA = 'dataMapper/nodePosition',
    DATA_MAPPER_SUB_MAPPING_CODEDATA = 'dataMapper/subMapping',
    DATA_MAPPER_PROPERTY = 'dataMapper/targetFieldPosition',
    DATA_MAPPER_FIELD_PROPERTY = 'dataMapper/fieldPosition',
    DATA_MAPPER_CLAUSE_POSITION = 'dataMapper/clausePosition',
    DATA_MAPPER_CLEAR_TYPE_CACHE = 'dataMapper/clearTypeCache',
    DATA_MAPPER_CONVERT_EXPRESSION = 'dataMapper/convertExpression',
    DATA_MAPPER_CREATE_CONVERTED_VARIABLE = 'dataMapper/convertType',
    VIEW_CONFIG_VARIABLES_V2 = 'configEditorV2/getConfigVariables',
    UPDATE_CONFIG_VARIABLES_V2 = 'configEditorV2/updateConfigVariable',
    DELETE_CONFIG_VARIABLE_V2 = 'configEditorV2/deleteConfigVariable',
    GET_NODE_CONFIG_VARIABLES_V2 = 'configEditorV2/getNodeTemplate',
    OPEN_CONFIG_TOML = 'configEditor/openConfigToml',
    RUNNER_DIAGNOSTICS = 'ballerinaRunner/diagnostics',
    RUNNER_MAIN_FUNCTION_PARAMS = 'ballerinaRunner/mainFunctionParams',
    BI_GET_COMPONENTS_FROM_CONTENT = 'flowDesignService/getSuggestedComponents',
    BI_SIGNATURE_HELP = 'expressionEditor/signatureHelp',
    BI_VISIBLE_TYPES = 'expressionEditor/types',
    REFERENCES = 'textDocument/references',
    BI_FORM_DIAGNOSTICS = 'flowDesignService/diagnostics',
    BI_EXPRESSION_DIAGNOSTICS = 'expressionEditor/diagnostics',
    BI_TRIGGER_MODELS = 'triggerDesignService/getTriggerModels',
    BI_TRIGGER_MODEL = 'triggerDesignService/getTriggerModel',
    BI_TRIGGER_SOURCE_CODE = 'triggerDesignService/getSourceCode',
    BI_TRIGGER_MODEL_FROM_CODE = 'triggerDesignService/getTriggerModelFromCode',
    BI_TRIGGER_UPDATE_FROM_CODE = 'triggerDesignService/updateTrigger',
    BI_TRIGGER_ADD_FUNCTION = 'triggerDesignService/addTriggerFunction',
    BI_TRIGGER_UPDATE_FUNCTION = 'triggerDesignService/updateTriggerFunction',
    BI_GET_TYPES = 'typesManager/getTypes',
    BI_GET_TYPE = 'typesManager/getType',
    BI_GET_SIMPLE_TYPE_OF_EXPRESSION = 'typesManager/getTypeOfExpression',
    BI_UPDATE_TYPE = 'typesManager/updateType',
    BI_UPDATE_TYPES = 'typesManager/updateTypes',
    BI_GET_GRAPHQL_TYPE = 'typesManager/getGraphqlType',
    BI_CREATE_GRAPHQL_CLASS_TYPE = 'typesManager/createGraphqlClassType',
    BI_GET_RECORD_CONFIG = 'typesManager/recordConfig',
    BI_UPDATE_RECORD_CONFIG = 'typesManager/updateRecordConfig',
    BI_GET_RECORD_MODEL_FROM_SOURCE = 'typesManager/findMatchingType',
    BI_GET_RECORD_SOURCE = 'typesManager/generateValue',
    BI_SERVICE_GET_TRIGGER_MODELS = 'serviceDesign/getTriggerModels',
    BI_SERVICE_GET_LISTENERS = 'serviceDesign/getListeners',
    BI_SERVICE_GET_LISTENER = 'serviceDesign/getListenerModel',
    BI_SERVICE_ADD_LISTENER = 'serviceDesign/addListener',
    BI_SERVICE_UPDATE_LISTENER = 'serviceDesign/updateListener',
    BI_SERVICE_GET_LISTENER_SOURCE = 'serviceDesign/getListenerFromSource',
    BI_SERVICE_GET_SERVICE = 'serviceDesign/getServiceModel',
    BI_SERVICE_GET_SERVICE_INIT = 'serviceDesign/getServiceInitModel',
    BI_SERVICE_CREATE_SERVICE_AND_LISTENER = 'serviceDesign/addServiceAndListener',
    BI_SERVICE_GET_FUNCTION = 'serviceDesign/getFunctionModel',
    BI_SERVICE_ADD_SERVICE = 'serviceDesign/addService',
    BI_SERVICE_UPDATE_SERVICE = 'serviceDesign/updateService',
    BI_SERVICE_GET_SERVICE_SOURCE = 'serviceDesign/getServiceFromSource',
    BI_SERVICE_UPDATE_SERVICE_CLASS = 'serviceDesign/updateServiceClass',
    BI_SERVICE_GET_RESOURCE = 'serviceDesign/getFunctionModel',
    BI_SERVICE_GET_RESOURCE_RETURN_TYPES = 'serviceDesign/types',
    BI_SERVICE_ADD_RESOURCE = 'serviceDesign/addResource',
    BI_SERVICE_ADD_FUNCTION = 'serviceDesign/addFunction',
    BI_SERVICE_UPDATE_RESOURCE = 'serviceDesign/updateFunction',
    BI_SERVICE_SERVICE_CLASS_MODEL = 'serviceDesign/getServiceClassModelFromSource',
    BI_GET_FUNCTION_FROM_SOURCE = 'serviceDesign/getFunctionFromSource',
    BI_UPDATE_CLASS_FIELD = 'serviceDesign/updateClassField',
    BI_ADD_CLASS_FIELD = 'serviceDesign/addField',
    BI_DESIGN_MODEL = 'designModelService/getDesignModel',
    BI_UPDATE_IMPORTS = 'expressionEditor/importModule',
    BI_ADD_FUNCTION = 'expressionEditor/functionCallTemplate',
    BI_DISCOVER_TESTS_IN_PROJECT = 'testManagerService/discoverInProject',
    BI_DISCOVER_TESTS_IN_FILE = 'testManagerService/discoverInFile',
    BI_GET_TEST_FUNCTION = 'testManagerService/getTestFunction',
    BI_ADD_TEST_FUNCTION = 'testManagerService/addTestFunction',
    BI_UPDATE_TEST_FUNCTION = 'testManagerService/updateTestFunction',
    BI_EDIT_FUNCTION_NODE = 'flowDesignService/functionDefinition',
    BI_GET_EXPRESSION_TOKENS = 'expressionEditor/semanticTokens',
    BI_AI_AGENT_ORG = 'agentManager/getAiModuleOrg',
    BI_AI_ALL_AGENTS = 'agentManager/getAllAgents',
    BI_AI_ALL_MODELS = 'agentManager/getAllModels',
    BI_AI_ALL_MEMORY_MANAGERS = 'agentManager/getAllMemoryManagers',
    BI_AI_GET_MODELS = 'agentManager/getModels',
    BI_AI_GET_TOOLS = 'agentManager/getTools',
    BI_AI_GET_TOOL = 'agentManager/getTool',
    BI_AI_GET_MCP_TOOLS = 'agentManager/getMcpTools',
    BI_AI_GEN_TOOLS = 'agentManager/genTool',
    BI_AI_GEN_AGENT_TOOL = 'agentManager/genAgentTool',
    BI_AI_GET_PACKAGE_VERSION = 'agentManager/getPackageVersion',
    BI_GET_SEMANTIC_DIFF = 'copilotAgentService/getSemanticDiff',
    BI_IS_ICP_ENABLED = 'icpService/isIcpEnabled',
    BI_ADD_ICP = 'icpService/addICP',
    BI_DISABLE_ICP = 'icpService/disableICP',
    BI_IS_WORKFLOW_MGMT_ENABLED = 'workflowManagementService/isWorkflowManagementEnabled',
    BI_ADD_WORKFLOW_MGMT = 'workflowManagementService/addWorkflowManagement',
    BI_DISABLE_WORKFLOW_MGMT = 'workflowManagementService/disableWorkflowManagement',
    BI_SHOULD_ENABLE_WORKFLOW_MGMT_DEFAULT = 'workflowManagementService/shouldEnableWorkflowManagementByDefault',
    BI_WORKFLOW_ALL_DATA = 'workflowManager/getAllData',
    BI_SEARCH = 'flowDesignService/search',
    BI_SEARCH_NODES = 'flowDesignService/searchNodes',
    OPEN_API_GENERATE_CLIENT = 'openAPIService/genClient',
    OPEN_API_GENERATED_MODULES = 'openAPIService/getModules',
    OPEN_API_CLIENT_DELETE = 'openAPIService/deleteModule',
    PERSIST_DATABASE_INTROSPECTION = 'persistService/introspectDatabase',
    PERSIST_CREDENTIALS_INTROSPECTION = 'persistService/introspectCredentials',
    PERSIST_CLIENT_GENERATE = 'persistService/generatePersistClient',
    WSDL_API_CLIENT_GENERATE = 'wsdlService/genClient',
    GET_PROJECT_INFO = 'designModelService/projectInfo',
    GET_ARTIFACTS = 'designModelService/artifacts',
    PUBLISH_ARTIFACTS = 'designModelService/publishArtifacts',
    COPILOT_ALL_LIBRARIES = 'copilotLibraryManager/getLibrariesList',
    COPILOT_FILTER_LIBRARIES = 'copilotLibraryManager/getFilteredLibraries',
    COPILOT_SEARCH_LIBRARIES = 'copilotLibraryManager/getLibrariesBySearch',
    GET_MIGRATION_TOOLS = 'projectService/getMigrationTools',
    TIBCO_TO_BI = 'projectService/importTibco',
    MULE_TO_BI = 'projectService/importMule',
    MIGRATION_TOOL_STATE = 'projectService/stateCallback',
    MIGRATION_TOOL_LOG = 'projectService/logCallback',
    PUSH_MIGRATED_PROJECT = 'projectService/pushMigratedProject'
}

enum EXTENDED_APIS_ORG {
    DOCUMENT = 'ballerinaDocument',
    PACKAGE = 'ballerinaPackage',
    EXAMPLE = 'ballerinaExample',
    JSON_TO_RECORD = 'jsonToRecord',
    XML_TO_RECORD = 'xmlToRecord',
    SYMBOL = 'ballerinaSymbol',
    CONNECTOR = 'ballerinaConnector',
    TRIGGER = 'ballerinaTrigger',
    PERF_ANALYZER = 'performanceAnalyzer',
    PARTIAL_PARSER = 'partialParser',
    BALLERINA_TO_OPENAPI = 'openAPILSExtension',
    NOTEBOOK_SUPPORT = "balShell",
    GRAPHQL_DESIGN = "graphqlDesignService",
    SEQUENCE_DIAGRAM = "sequenceModelGeneratorService",
    RUNNER = "ballerinaRunner"
}

export enum DIAGNOSTIC_SEVERITY {
    INTERNAL = "INTERNAL",
    HINT = "HINT",
    INFO = "INFO",
    WARNING = "WARNING",
    ERROR = "ERROR"
}

enum VSCODE_APIS {
    DID_OPEN = 'textDocument/didOpen',
    DID_CLOSE = 'textDocument/didClose',
    DID_CHANGE = 'textDocument/didChange',
    DEFINITION = 'textDocument/definition',
    COMPLETION = 'textDocument/completion',
    RENAME = 'textDocument/rename',
    DOC_SYMBOL = 'textDocument/documentSymbol',
    CODE_ACTION = 'textDocument/codeAction',
    EXECUTE_CMD = 'workspace/executeCommand',
    PUBLISH_DIAGNOSTICS = 'textDocument/publishDiagnostics',
    DID_CHANGE_WATCHED_FILES = 'workspace/didChangeWatchedFiles'
}

// Cached once at module load: recording is enabled process-wide via BAL_RECORD_FIXTURES
// before the extension launches and never toggles at runtime, so the per-request
// sendRequest hook below branches on this const instead of reading process.env each call.
const RECORDING_ENABLED = isRecording();

export class ExtendedLangClient extends LanguageClient implements ExtendedLangClientInterface {
    private ballerinaExtendedServices: Set<String> | undefined;
    private isDynamicRegistrationSupported: boolean;
    isInitialized: boolean = true;
    private ballerinaExtInstance: BallerinaExtension | undefined;
    private timeConsumption: APITimeConsumption;
    private initBalRequestSent = false;

    constructor(id: string, name: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions,
        ballerinaExtInstance: BallerinaExtension | undefined, forceDebug?: boolean) {
        super(id, name, serverOptions, clientOptions, forceDebug);
        this.isDynamicRegistrationSupported = true;
        this.ballerinaExtInstance = ballerinaExtInstance;
        this.timeConsumption = { diagnostics: [], completion: [] };
    }
    init?: (params: InitializeParams) => Promise<InitializeResult>;

    // Records all LS request/response traffic to fixtures when BAL_RECORD_FIXTURES is set.
    // When not recording this is a single branch on a cached const per request (no env read).
    // See src/test-support/fixtureRecorder.ts.
    public sendRequest<R = any>(...args: any[]): Promise<R> {
        const result = (super.sendRequest as any)(...args) as Promise<R>;
        if (RECORDING_ENABLED) {
            const method = typeof args[0] === "string" ? args[0] : args[0]?.method;
            const maybeParams = args[1];
            const request =
                maybeParams && typeof maybeParams.isCancellationRequested === "boolean" ? undefined : maybeParams;
            Promise.resolve(result).then(
                (response) => recordLs(method, request, response),
                () => { /* ignore rejected LS calls */ }
            );
        }
        return result;
    }

    // <------------ VS CODE RELATED APIS START --------------->
    didOpen(params: DidOpenParams): void {
        debug(`didOpen at ${new Date()} - ${new Date().getTime()}`);
        this.sendNotification(VSCODE_APIS.DID_OPEN, params);
    }

    didClose(params: DidCloseParams): void {
        debug(`didClose at ${new Date()} - ${new Date().getTime()}`);
        this.sendNotification(VSCODE_APIS.DID_CLOSE, params);
    }

    didChange(params: DidChangeParams): void {
        debug(`didChange at ${new Date()} - ${new Date().getTime()}`);
        this.sendNotification(VSCODE_APIS.DID_CHANGE, params);
    }

    didChangedWatchedFiles(params: DidChangeWatchedFileParams): void {
        debug(`didChangedWatchedFiles at ${new Date()} - ${new Date().getTime()}`);
        this.sendNotification(VSCODE_APIS.DID_CHANGE_WATCHED_FILES, params);
    }

    registerPublishDiagnostics(): void {
        this.onNotification(VSCODE_APIS.PUBLISH_DIAGNOSTICS, () => {
        });
    }

    registerPublishArtifacts(): void {
        this.onNotification(EXTENDED_APIS.PUBLISH_ARTIFACTS, (res: ArtifactsNotification) => {
            try {
                console.log("Publish Artifacts", { res });
                if (res && Object.keys(res).length > 0) {
                    updateProjectArtifacts(res);
                }
            } catch (error) {
                console.error("Error in PUBLISH_ARTIFACTS handler:", error);
            }
        });
    }

    registerMigrationToolCallbacks(): void {
        this.onNotification(EXTENDED_APIS.MIGRATION_TOOL_STATE, (res: ArtifactsNotification) => {
            try {
                RPCLayer._messenger.sendNotification(
                    onMigrationToolStateChanged,
                    { type: "webview", webviewType: VisualizerWebview.viewType },
                    res
                );
                emitMigrationToolState(res as any);
            } catch (error) {
                console.error("Error in MIGRATION_TOOL_STATE handler:", error);
            }
        });

        this.onNotification(EXTENDED_APIS.MIGRATION_TOOL_LOG, (res: ArtifactsNotification) => {
            try {
                RPCLayer._messenger.sendNotification(
                    onMigrationToolLogs,
                    { type: "webview", webviewType: VisualizerWebview.viewType },
                    res
                );
                emitMigrationToolLog(res as any);
            } catch (error) {
                console.error("Error in MIGRATION_TOOL_LOG handler:", error);
            }
        });

        this.onNotification(EXTENDED_APIS.PUSH_MIGRATED_PROJECT, async (res: ProjectMigrationResult) => {
            try {
                RPCLayer._messenger.sendNotification(
                    onMigratedProject,
                    { type: "webview", webviewType: VisualizerWebview.viewType },
                    res
                );
                emitMigratedProject(res);
            } catch (error) {
                console.error("Error in PUSH_MIGRATED_PROJECT handler:", error);
            }
        });
    }

    async getProjectArtifacts(params: ProjectArtifactsRequest): Promise<ProjectArtifacts> {
        return this.sendRequest<ProjectArtifacts>(EXTENDED_APIS.GET_ARTIFACTS, params);
    }

    async getProjectInfo(params: ProjectInfoRequest): Promise<ProjectInfo> {
        return this.sendRequest<ProjectInfo>(EXTENDED_APIS.GET_PROJECT_INFO, params);
    }

    async definition(params: DefinitionParams): Promise<Location | Location[] | LocationLink[]> {
        return this.sendRequest<Location | Location[] | LocationLink[]>(VSCODE_APIS.DEFINITION, params);
    }

    async getCompletion(params: CompletionParams): Promise<Completion[]> {
        const start = new Date().getTime();
        const response: Completion[] = await this.sendRequest(VSCODE_APIS.COMPLETION, params);
        this.timeConsumption.completion.push(new Date().getTime() - start);
        return response;
    }

    async rename(params: RenameParams): Promise<WorkspaceEdit | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(VSCODE_APIS.RENAME, params);
    }

    async getDocumentSymbol(params: DocumentSymbolParams): Promise<DocumentSymbol[] | SymbolInformation[] | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(VSCODE_APIS.DOC_SYMBOL, params);
    }

    async codeAction(params: CodeActionParams): Promise<CodeAction[]> {
        return this.sendRequest(VSCODE_APIS.CODE_ACTION, params);
    }

    async executeCommand(params: ExecuteCommandParams): Promise<any> {
        return this.sendRequest(VSCODE_APIS.EXECUTE_CMD, params);
    }

    // <------------ VS CODE RELATED APIS END --------------->

    // <------------ EXTENDED APIS START --------------->
    async initBalServices(params: BallerinaInitializeParams): Promise<BallerinaInitializeResult> {
        return this.sendRequest("initBalServices", params);
    }

    async getPackageComponentModels(params: ComponentModelsParams): Promise<ComponentModels> {
        return this.sendRequest(EXTENDED_APIS.COMPONENT_MODEL_ENDPOINT, params);
    }

    async getPersistERModel(params: PersistERModelParams): Promise<PersistERModel> {
        return this.sendRequest(EXTENDED_APIS.PERSIST_MODEL_ENDPOINT, params);
    }

    async getDiagnostics(params: DiagnosticsParams): Promise<Diagnostics[] | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.DOCUMENT_DIAGNOSTICS);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        const start = new Date().getTime();
        const response = await this.sendRequest<Diagnostics[]>(EXTENDED_APIS.DOCUMENT_DIAGNOSTICS, params);
        this.timeConsumption.diagnostics.push(new Date().getTime() - start);
        return response;
    }

    // async getType(params: TypeParams): Promise<ExpressionType | NOT_SUPPORTED_TYPE> {
    //     return this.sendRequest(EXTENDED_APIS.SYMBOL_TYPE, params);
    // }

    async getConnectors(params: ConnectorsParams, reset?: boolean): Promise<Connectors | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.CONNECTOR_CONNECTORS);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        if (!reset && params.query === "" && !params.keyword && !params.organization && !params.offset) {
            let connectorList = this.ballerinaExtInstance?.context?.globalState.get(CONNECTOR_LIST_CACHE) as Connectors;
            if (connectorList && connectorList.central?.length > 0) {
                return Promise.resolve().then(() => connectorList);
            }
        } else if (!reset && params.query === "http" && !params.keyword && !params.organization && !params.offset) {
            const connectorList = this.ballerinaExtInstance?.context?.globalState.get(HTTP_CONNECTOR_LIST_CACHE) as Connectors;
            if (connectorList && connectorList.central?.length > 0) {
                return Promise.resolve().then(() => connectorList);
            }
        }
        return this.sendRequest<Connectors>(EXTENDED_APIS.CONNECTOR_CONNECTORS, params);
    }

    async getConnector(params: ConnectorRequest): Promise<ConnectorResponse | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.CONNECTOR_CONNECTOR);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest<Connector>(EXTENDED_APIS.CONNECTOR_CONNECTOR, params);
    }

    async introspectDatabase(params: IntrospectDatabaseRequest): Promise<IntrospectDatabaseResponse> {
        return this.sendRequest<IntrospectDatabaseResponse>(EXTENDED_APIS.PERSIST_DATABASE_INTROSPECTION, params);
    }

    async generatePersistClient(params: PersistClientGenerateRequest): Promise<PersistClientGenerateResponse> {
        return this.sendRequest<PersistClientGenerateResponse>(EXTENDED_APIS.PERSIST_CLIENT_GENERATE, params);
    }

    async introspectCredentials(params: IntrospectCredentialsRequest): Promise<IntrospectCredentialsResponse> {
        return this.sendRequest<IntrospectCredentialsResponse>(EXTENDED_APIS.PERSIST_CREDENTIALS_INTROSPECTION, params);
    }

    async generateWSDLApiClient(params: WSDLApiClientGenerationRequest): Promise<WSDLApiClientGenerationResponse> {
        return this.sendRequest<WSDLApiClientGenerationResponse>(EXTENDED_APIS.WSDL_API_CLIENT_GENERATE, params);
    }

    async getRecord(params: RecordParams): Promise<BallerinaRecord | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.CONNECTOR_RECORD);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest<BallerinaRecord>(EXTENDED_APIS.CONNECTOR_RECORD, params);
    }

    async astModify(params: STModifyParams): Promise<SyntaxTree | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.DOCUMENT_AST_MODIFY);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest<SyntaxTree>(EXTENDED_APIS.DOCUMENT_AST_MODIFY, params);
    }

    async stModify(params: STModifyParams): Promise<SyntaxTree | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.DOCUMENT_ST_MODIFY);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest<SyntaxTree>(EXTENDED_APIS.DOCUMENT_ST_MODIFY, params);
    }

    async getSTForFunction(params: STModifyParams): Promise<SyntaxTree | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.DOCUMENT_ST_FUNCTION);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest<SyntaxTree>(EXTENDED_APIS.DOCUMENT_ST_FUNCTION, params);
    }

    async getDefinitionPosition(params: TextDocumentPositionParams): Promise<SyntaxTree | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.DEFINITION_POSITION);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest<SyntaxTree>(EXTENDED_APIS.DEFINITION_POSITION, params);
    }

    async getSTByRange(params: BallerinaSTParams): Promise<SyntaxTree | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.DOCUMENT_ST_BY_RANGE);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest<SyntaxTree>(EXTENDED_APIS.DOCUMENT_ST_BY_RANGE, params);
    }

    async triggerModify(params: TriggerModifyParams): Promise<SyntaxTree | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.DOCUMENT_TRIGGER_MODIFY);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest<SyntaxTree>(EXTENDED_APIS.DOCUMENT_TRIGGER_MODIFY, params);
    }

    async getSymbolDocumentation(params: SymbolInfoParams): Promise<SymbolInfo | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.SYMBOL_DOC);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest<SymbolInfo>(EXTENDED_APIS.SYMBOL_DOC, params);
    }

    async getTypeFromExpression(params: TypeFromExpressionParams): Promise<TypesFromExpression | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.SYMBOL_TYPE_FROM_EXPRESSION);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest<TypesFromExpression>(EXTENDED_APIS.SYMBOL_TYPE_FROM_EXPRESSION, params);
    }

    async getTypeFromSymbol(params: TypeFromSymbolParams): Promise<TypesFromSymbol | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.SYMBOL_TYPE_FROM_SYMBOL);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest<TypesFromSymbol>(EXTENDED_APIS.SYMBOL_TYPE_FROM_SYMBOL, params);
    }

    async getTypesFromFnDefinition(params: TypesFromFnDefinitionParams): Promise<TypesFromSymbol | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.SYMBOL_TYPES_FROM_FN_SIGNATURE);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest<TypesFromSymbol>(EXTENDED_APIS.SYMBOL_TYPES_FROM_FN_SIGNATURE, params);
    }

    async getVisibleVariableTypes(params: VisibleVariableTypesParams): Promise<VisibleVariableTypes | NOT_SUPPORTED_TYPE> {
        return this.sendRequest<VisibleVariableTypes>(EXTENDED_APIS.VISIBLE_VARIABLE_TYPES, params);
    }

    async getDataMapperMappings(params: DataMapperModelRequest): Promise<DataMapperModelResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest<DataMapperModelResponse>(EXTENDED_APIS.DATA_MAPPER_MAPPINGS, params);
    }

    async getDataMapperSource(params: DataMapperSourceRequest): Promise<DataMapperSourceResponse> {
        return this.sendRequest<DataMapperSourceResponse>(EXTENDED_APIS.DATA_MAPPER_GET_SOURCE, params);
    }

    async getVisualizableFields(params: VisualizableFieldsRequest): Promise<VisualizableFieldsResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest<VisualizableFieldsResponse>(EXTENDED_APIS.DATA_MAPPER_VISUALIZABLE, params);
    }

    async addArrayElement(params: AddArrayElementRequest): Promise<DataMapperSourceResponse> {
        return this.sendRequest<DataMapperSourceResponse>(EXTENDED_APIS.DATA_MAPPER_ADD_ELEMENT, params);
    }

    async convertToQuery(params: ConvertToQueryRequest): Promise<DataMapperSourceResponse> {
        return this.sendRequest<DataMapperSourceResponse>(EXTENDED_APIS.DATA_MAPPER_CONVERT_TO_QUERY, params);
    }

    async addClauses(params: AddClausesRequest): Promise<DataMapperSourceResponse> {
        return this.sendRequest<DataMapperSourceResponse>(EXTENDED_APIS.DATA_MAPPER_ADD_CLAUSES, params);
    }

    async deleteClause(params: DeleteClauseRequest): Promise<DataMapperSourceResponse> {
        return this.sendRequest<DataMapperSourceResponse>(EXTENDED_APIS.DATA_MAPPER_DELETE_CLAUSE, params);
    }

    async addSubMapping(params: AddSubMappingRequest): Promise<DataMapperSourceResponse> {
        return this.sendRequest<DataMapperSourceResponse>(EXTENDED_APIS.DATA_MAPPER_ADD_SUB_MAPPING, params);
    }

    async deleteMapping(params: DeleteMappingRequest): Promise<DataMapperSourceResponse> {
        return this.sendRequest<DataMapperSourceResponse>(EXTENDED_APIS.DATA_MAPPER_DELETE_MAPPING, params);
    }

    async deleteSubMapping(params: DeleteSubMappingRequest): Promise<DataMapperSourceResponse> {
        return this.sendRequest<DataMapperSourceResponse>(EXTENDED_APIS.DATA_MAPPER_DELETE_SUB_MAPPING, params);
    }

    async mapWithCustomFn(params: MapWithFnRequest): Promise<DataMapperSourceResponse> {
        return this.sendRequest<DataMapperSourceResponse>(EXTENDED_APIS.DATA_MAPPER_MAP_WITH_CUSTOM_FN, params);
    }

    async mapWithTransformFn(params: MapWithFnRequest): Promise<DataMapperSourceResponse> {
        return this.sendRequest<DataMapperSourceResponse>(EXTENDED_APIS.DATA_MAPPER_MAP_WITH_TRANSFORM_FN, params);
    }

    async resolveOutput(params: ResolveOutputRequest): Promise<DataMapperSourceResponse> {
        return this.sendRequest<DataMapperSourceResponse>(EXTENDED_APIS.DATA_MAPPER_RESOLVE_OUTPUT, params);
    }

    async getDataMapperCodedata(params: GetDataMapperCodedataRequest): Promise<GetDataMapperCodedataResponse> {
        return this.sendRequest<GetDataMapperCodedataResponse>(EXTENDED_APIS.DATA_MAPPER_CODEDATA, params);
    }

    async getSubMappingCodedata(params: GetSubMappingCodedataRequest): Promise<GetDataMapperCodedataResponse> {
        return this.sendRequest<GetDataMapperCodedataResponse>(EXTENDED_APIS.DATA_MAPPER_SUB_MAPPING_CODEDATA, params);
    }

    async getProperty(params: PropertyRequest): Promise<PropertyResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest<PropertyResponse>(EXTENDED_APIS.DATA_MAPPER_PROPERTY, params);
    }

    async getFieldProperty(params: FieldPropertyRequest): Promise<PropertyResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest<PropertyResponse>(EXTENDED_APIS.DATA_MAPPER_FIELD_PROPERTY, params);
    }

    async getClausePosition(params: ClausePositionRequest): Promise<ClausePositionResponse> {
        return this.sendRequest<ClausePositionResponse>(EXTENDED_APIS.DATA_MAPPER_CLAUSE_POSITION, params);
    }

    async getConvertedExpression(params: ConvertExpressionRequest): Promise<ConvertExpressionResponse> {
        return this.sendRequest<ConvertExpressionResponse>(EXTENDED_APIS.DATA_MAPPER_CONVERT_EXPRESSION, params);
    }

    async createConvertedVariable(params: CreateConvertedVariableRequest): Promise<DataMapperSourceResponse> {
        return this.sendRequest<DataMapperSourceResponse>(EXTENDED_APIS.DATA_MAPPER_CREATE_CONVERTED_VARIABLE, params);
    }

    async clearTypeCache(): Promise<ClearTypeCacheResponse> {
        return this.sendRequest<ClearTypeCacheResponse>(EXTENDED_APIS.DATA_MAPPER_CLEAR_TYPE_CACHE);
    }

    async getGraphqlModel(params: GraphqlDesignServiceParams): Promise<GraphqlDesignService | NOT_SUPPORTED_TYPE> {
        return this.sendRequest<GraphqlDesignService>(EXTENDED_APIS.GRAPHQL_DESIGN_MODEL, params);
    }

    async getSyntaxTree(req: SyntaxTreeParams): Promise<SyntaxTree | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.DOCUMENT_ST);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest(EXTENDED_APIS.DOCUMENT_ST, req);
    }

    async fetchExamples(args: BallerinaExampleListParams = {}): Promise<BallerinaExampleList | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.EXAMPLE_LIST);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest(EXTENDED_APIS.EXAMPLE_LIST, args);
    }

    async getBallerinaProject(params: BallerinaProjectParams): Promise<BallerinaProject | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.PACKAGE_METADATA);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest(EXTENDED_APIS.PACKAGE_METADATA, params);
    }

    async getBallerinaProjectComponents(params: BallerinaPackagesParams): Promise<BallerinaProjectComponents | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.PACKAGE_COMPONENTS);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest(EXTENDED_APIS.PACKAGE_COMPONENTS, params);
    }

    async getBallerinaProjectConfigSchema(params: BallerinaProjectParams): Promise<PackageConfigSchema | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.PACKAGE_CONFIG_SCHEMA);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest(EXTENDED_APIS.PACKAGE_CONFIG_SCHEMA, params);
    }

    async getSyntaxTreeNode(params: SyntaxTreeNodeParams): Promise<SyntaxTreeNode | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.DOCUMENT_ST_NODE);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest(EXTENDED_APIS.DOCUMENT_ST_NODE, params);
    }

    async getExecutorPositions(params: BallerinaProjectParams): Promise<ExecutorPositions | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.DOCUMENT_EXECUTOR_POSITIONS);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest(EXTENDED_APIS.DOCUMENT_EXECUTOR_POSITIONS, params);
    }

    async getProjectTestFunctions(params: TestsDiscoveryRequest): Promise<TestsDiscoveryResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.BI_DISCOVER_TESTS_IN_PROJECT, params);
    }

    async getFileTestFunctions(params: TestsDiscoveryRequest): Promise<TestsDiscoveryResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.BI_DISCOVER_TESTS_IN_FILE, params);
    }

    async getTestFunction(params: GetTestFunctionRequest): Promise<GetTestFunctionResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.BI_GET_TEST_FUNCTION, params);
    }

    async addTestFunction(params: AddOrUpdateTestFunctionRequest):
        Promise<TestSourceEditResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.BI_ADD_TEST_FUNCTION, params);
    }

    async updateTestFunction(params: AddOrUpdateTestFunctionRequest):
        Promise<TestSourceEditResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.BI_UPDATE_TEST_FUNCTION, params);
    }

    async isIcpEnabled(params: ICPEnabledRequest): Promise<ICPEnabledResponse | NOT_SUPPORTED_TYPE> {
        // Check if ICP import exists in main.bal instead of querying the language server
        const mainBalPath = require('path').join(params.projectPath, 'main.bal');
        try {
            const content = require('fs').readFileSync(mainBalPath, 'utf-8');
            const enabled = content.includes('import wso2/icp.runtime.bridge as _;');
            return { enabled };
        } catch {
            return { enabled: false };
        }
        // Original LS-based implementation:
        // return this.sendRequest(EXTENDED_APIS.BI_IS_ICP_ENABLED, params);
    }

    async addICP(params: ICPEnabledRequest): Promise<TestSourceEditResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.BI_ADD_ICP, params);
    }

    async disableICP(params: ICPEnabledRequest): Promise<TestSourceEditResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.BI_DISABLE_ICP, params);
    }

    async isWorkflowManagementEnabled(params: WorkflowManagementRequest): Promise<WorkflowManagementResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.BI_IS_WORKFLOW_MGMT_ENABLED, params);
    }

    async addWorkflowManagement(params: WorkflowManagementRequest): Promise<TestSourceEditResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.BI_ADD_WORKFLOW_MGMT, params);
    }

    async disableWorkflowManagement(params: WorkflowManagementRequest): Promise<TestSourceEditResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.BI_DISABLE_WORKFLOW_MGMT, params);
    }

    async shouldEnableWorkflowManagementByDefault(params: WorkflowManagementRequest): Promise<WorkflowManagementResponse | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.BI_SHOULD_ENABLE_WORKFLOW_MGMT_DEFAULT, params);
    }

    async getProjectDiagnostics(params: ProjectDiagnosticsRequest): Promise<ProjectDiagnosticsResponse | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.RUNNER_DIAGNOSTICS);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest(EXTENDED_APIS.RUNNER_DIAGNOSTICS, params);
    }

    async getMainFunctionParams(params: MainFunctionParamsRequest): Promise<MainFunctionParamsResponse | NOT_SUPPORTED_TYPE> {
        const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.RUNNER_MAIN_FUNCTION_PARAMS);
        if (!isSupported) {
            return Promise.resolve(NOT_SUPPORTED);
        }
        return this.sendRequest(EXTENDED_APIS.RUNNER_MAIN_FUNCTION_PARAMS, params);
    }

    async convertJsonToRecord(params: JsonToRecordParams): Promise<JsonToRecord | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.JSON_TO_RECORD_CONVERT, params);
    }

    async convertXMLToRecord(params: XMLToRecordParams): Promise<XMLToRecord | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.XML_TO_RECORD_CONVERT, params);
    }

    async convertJsonToRecordType(params: JsonToRecordParams): Promise<TypeDataWithReferences> {
        return this.sendRequest(EXTENDED_APIS.JSON_TO_RECORD_TYPE_CONVERT, params);
    }

    async convertXmlToRecordType(params: XMLToRecordParams): Promise<TypeDataWithReferences> {
        return this.sendRequest(EXTENDED_APIS.XML_TO_RECORD_TYPE_CONVERT, params);
    }

    async getTypeFromJson(params: JsonToTypeRequest): Promise<JsonToTypeResponse> {
        return this.sendRequest(EXTENDED_APIS.JSON_TO_TYPE_CONVERT, params);
    }

    async getBalShellResult(params: NoteBookCellOutputParams): Promise<NoteBookCellOutput | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.NOTEBOOK_RESULT, params);
    }

    async getShellBufferFilePath(): Promise<NotebookFileSource | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.NOTEBOOK_FILE_SOURCE);
    }

    async restartNotebook(): Promise<boolean | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.NOTEBOOK_RESTART);
    }

    async getNotebookVariables(): Promise<NotebookVariable[] | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.NOTEBOOK_VARIABLES);
    }

    async deleteDeclarations(params: NotebookDeleteDclnParams): Promise<boolean | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.NOTEBOOK_DELETE_DCLNS, params);
    }

    async getSTForSingleStatement(params: PartialSTParams): Promise<PartialST | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.PARTIAL_PARSE_SINGLE_STATEMENT, params);
    }

    async getSTForExpression(params: PartialSTParams): Promise<PartialST | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.PARTIAL_PARSE_EXPRESSION, params);
    }

    async getSTForModulePart(params: PartialSTParams): Promise<PartialST | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.PARTIAL_PARSE_MODULE_PART, params);
    }

    async getSTForResource(params: PartialSTParams): Promise<PartialST | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.PARTIAL_PARSE_RESOURCE, params);
    }

    async getSTForModuleMembers(params: PartialSTParams): Promise<PartialST | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.PARTIAL_PARSE_MODULE_MEMBER, params);
    }

    async resolveMissingDependencies(req: SyntaxTreeParams): Promise<SyntaxTree | NOT_SUPPORTED_TYPE> {
        handlePullModuleProgress();
        const response = await this.sendRequest(EXTENDED_APIS.RESOLVE_MISSING_DEPENDENCIES, req);
        return response;
    }

    async resolveModuleDependencies(req: SyntaxTreeParams): Promise<SyntaxTree | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.RESOLVE_MODULE_DEPENDENCIES, req);
    }

    async convertToOpenAPI(params: OpenAPIConverterParams): Promise<OpenAPISpec | NOT_SUPPORTED_TYPE> {
        return this.sendRequest(EXTENDED_APIS.BALLERINA_TO_OPENAPI, params);
    }

    // <------------ EXTENDED APIS END --------------->

    // <------------ BI APIS START --------------->

    async getFlowModel(params: BIFlowModelRequest): Promise<BIFlowModelResponse> {
        return this.sendRequest<BIFlowModelResponse>(EXTENDED_APIS.BI_FLOW_MODEL, params);
    }

    async getSourceCode(params: BISourceCodeRequest): Promise<BISourceCodeResponse> {
        return this.sendRequest<BISourceCodeResponse>(EXTENDED_APIS.BI_SOURCE_CODE, params);
    }

    async getAvailableNodes(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this.sendRequest<BIAvailableNodesResponse>(EXTENDED_APIS.BI_AVAILABLE_NODES, params);
    }

    async getAvailableAgents(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this.sendRequest<BIAvailableNodesResponse>(EXTENDED_APIS.BI_AVAILABLE_AGENTS, params);
    }

    async getAvailableModelProviders(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this.sendRequest<BIAvailableNodesResponse>(EXTENDED_APIS.BI_AVAILABLE_MODEL_PROVIDERS, params);
    }

    async getAvailableVectorStores(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this.sendRequest<BIAvailableNodesResponse>(EXTENDED_APIS.BI_AVAILABLE_VECTOR_STORES, params);
    }

    async getAvailableEmbeddingProviders(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this.sendRequest<BIAvailableNodesResponse>(EXTENDED_APIS.BI_AVAILABLE_EMBEDDING_PROVIDERS, params);
    }

    async getAvailableVectorKnowledgeBases(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this.sendRequest<BIAvailableNodesResponse>(EXTENDED_APIS.BI_AVAILABLE_KNOWLEDGE_BASES, params);
    }

    async getAvailableDataLoaders(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this.sendRequest<BIAvailableNodesResponse>(EXTENDED_APIS.BI_AVAILABLE_DATA_LOADERS, params);
    }

    async getAvailableChunkers(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this.sendRequest<BIAvailableNodesResponse>(EXTENDED_APIS.BI_AVAILABLE_CHUNKS, params);
    }

    async getEnclosedFunctionDef(params: BIGetEnclosedFunctionRequest): Promise<BIGetEnclosedFunctionResponse> {
        return this.sendRequest<BIGetEnclosedFunctionResponse>(EXTENDED_APIS.BI_GET_ENCLOSED_FUNCTION, params);
    }

    async getNodeTemplate(params: BINodeTemplateRequest): Promise<BINodeTemplateResponse> {
        return this.sendRequest<BINodeTemplateResponse>(EXTENDED_APIS.BI_NODE_TEMPLATE, params);
    }

    async generateServiceFromOAS(params: ServiceFromOASRequest): Promise<ServiceFromOASResponse> {
        return this.sendRequest<ServiceFromOASResponse>(EXTENDED_APIS.BI_GEN_OPEN_API, params);
    }

    async getConfigVariablesV2(params: ConfigVariableRequest): Promise<ConfigVariableResponse> {
        return this.sendRequest<ConfigVariableResponse>(EXTENDED_APIS.VIEW_CONFIG_VARIABLES_V2, params);
    }

    async updateConfigVariablesV2(params: UpdateConfigVariableRequestV2): Promise<UpdateConfigVariableResponseV2> {
        return this.sendRequest<UpdateConfigVariableResponseV2>(EXTENDED_APIS.UPDATE_CONFIG_VARIABLES_V2, params);
    }

    async deleteConfigVariableV2(params: DeleteConfigVariableRequestV2): Promise<DeleteConfigVariableResponseV2> {
        return this.sendRequest<DeleteConfigVariableResponseV2>(EXTENDED_APIS.DELETE_CONFIG_VARIABLE_V2, params);
    }

    async getConfigVariableNodeTemplate(params: GetConfigVariableNodeTemplateRequest): Promise<BINodeTemplateResponse> {
        return this.sendRequest<BINodeTemplateResponse>(EXTENDED_APIS.GET_NODE_CONFIG_VARIABLES_V2, params);
    }

    async openConfigToml(params: OpenConfigTomlRequest): Promise<void> {
        return this.sendRequest<void>(EXTENDED_APIS.OPEN_CONFIG_TOML, params);
    }

    async getSuggestedFlowModel(params: BISuggestedFlowModelRequest): Promise<BIFlowModelResponse> {
        return this.sendRequest<BIFlowModelResponse>(EXTENDED_APIS.BI_SUGGESTED_FLOW_MODEL, params);
    }

    async getCopilotContext(params: BICopilotContextRequest): Promise<BICopilotContextResponse> {
        return this.sendRequest<BICopilotContextResponse>(EXTENDED_APIS.BI_COPILOT_CONTEXT, params);
    }

    async deleteFlowNode(params: BISourceCodeRequest): Promise<BISourceCodeResponse> {
        return this.sendRequest<BISourceCodeResponse>(EXTENDED_APIS.BI_DELETE_NODE, params);
    }

    async deleteByComponentInfo(params: BIDeleteByComponentInfoRequest): Promise<BISourceCodeResponse> {
        return this.sendRequest<BISourceCodeResponse>(EXTENDED_APIS.BI_DELETE_BY_COMPONENT_INFO, params);
    }

    async verifyTypeDelete(params: VerifyTypeDeleteRequest): Promise<VerifyTypeDeleteResponse> {
        return this.sendRequest<VerifyTypeDeleteResponse>(EXTENDED_APIS.BI_VERIFY_TYPE_DELETE, params);
    }

    async deleteType(params: DeleteTypeRequest): Promise<DeleteTypeResponse> {
        return this.sendRequest<DeleteTypeResponse>(EXTENDED_APIS.BI_DELETE_TYPE, params);
    }

    async getSequenceDiagramModel(params: SequenceModelRequest): Promise<SequenceModelResponse> {
        // const isSupported = await this.isExtendedServiceSupported(EXTENDED_APIS.SEQUENCE_DIAGRAM_MODEL);
        return this.sendRequest(EXTENDED_APIS.SEQUENCE_DIAGRAM_MODEL, params);
    }

    async getExpressionCompletions(params: ExpressionCompletionsRequest): Promise<ExpressionCompletionsResponse> {
        return this.sendRequest<ExpressionCompletionsResponse>(EXTENDED_APIS.BI_EXPRESSION_COMPLETIONS, params);
    }

    async getDataMapperCompletions(params: ExpressionCompletionsRequest): Promise<ExpressionCompletionsResponse> {
        return this.sendRequest<ExpressionCompletionsResponse>(EXTENDED_APIS.BI_DATA_MAPPER_COMPLETIONS, params);
    }

    async getModuleNodes(params: BIModuleNodesRequest): Promise<BIModuleNodesResponse> {
        return this.sendRequest<BIModuleNodesResponse>(EXTENDED_APIS.BI_MODULE_NODES, params);
    }

    async getComponentsFromContent(params: ComponentsFromContent): Promise<BallerinaProjectComponents> {
        return this.sendRequest<BallerinaProjectComponents>(EXTENDED_APIS.BI_GET_COMPONENTS_FROM_CONTENT, params);
    }

    async getSignatureHelp(params: SignatureHelpRequest): Promise<SignatureHelpResponse> {
        return this.sendRequest(EXTENDED_APIS.BI_SIGNATURE_HELP, params);
    }

    async getVisibleTypes(params: VisibleTypesRequest): Promise<VisibleTypesResponse> {
        return this.sendRequest(EXTENDED_APIS.BI_VISIBLE_TYPES, params);
    }

    async getReferences(params: ReferenceLSRequest): Promise<Reference[]> {
        return this.sendRequest(EXTENDED_APIS.REFERENCES, params);
    }

    async addErrorHandler(params: BIModuleNodesRequest): Promise<BISourceCodeResponse> {
        return this.sendRequest(EXTENDED_APIS.BI_GEN_ERROR_HANDLER, params);
    }

    async getFormDiagnostics(params: FormDiagnosticsRequest): Promise<FormDiagnosticsResponse> {
        return this.sendRequest<FormDiagnosticsResponse>(EXTENDED_APIS.BI_FORM_DIAGNOSTICS, params);
    }

    async getExpressionDiagnostics(params: ExpressionDiagnosticsRequest): Promise<ExpressionDiagnosticsResponse> {
        return this.sendRequest<ExpressionDiagnosticsResponse>(EXTENDED_APIS.BI_EXPRESSION_DIAGNOSTICS, params);
    }

    async getTriggerModels(params: TriggerModelsRequest): Promise<TriggerModelsResponse> {
        return this.sendRequest<TriggerModelsResponse>(EXTENDED_APIS.BI_SERVICE_GET_TRIGGER_MODELS, params);
    }

    async getListeners(params: ListenersRequest): Promise<ListenersResponse> {
        return this.sendRequest<ListenersResponse>(EXTENDED_APIS.BI_SERVICE_GET_LISTENERS, params);
    }

    async getFunctionNode(params: FunctionNodeRequest): Promise<FunctionNodeResponse> {
        return this.sendRequest<FunctionNodeResponse>(EXTENDED_APIS.BI_EDIT_FUNCTION_NODE, params);
    }

    async getExpressionTokens(params: ExpressionTokensRequest): Promise<ExpressionTokensResponse> {
        return this.sendRequest<ExpressionTokensResponse>(EXTENDED_APIS.BI_GET_EXPRESSION_TOKENS, params);
    }

    async getListenerModel(params: ListenerModelRequest): Promise<ListenerModelResponse> {
        return this.sendRequest<ListenerModelResponse>(EXTENDED_APIS.BI_SERVICE_GET_LISTENER, params);
    }

    async addListenerSourceCode(params: ListenerSourceCodeRequest): Promise<ListenerSourceCodeResponse> {
        return this.sendRequest<ListenerSourceCodeResponse>(EXTENDED_APIS.BI_SERVICE_ADD_LISTENER, params);
    }

    async updateListenerSourceCode(params: ListenerSourceCodeRequest): Promise<ListenerSourceCodeResponse> {
        return this.sendRequest<ListenerSourceCodeResponse>(EXTENDED_APIS.BI_SERVICE_UPDATE_LISTENER, params);
    }

    async getListenerFromSourceCode(params: ListenerModelFromCodeRequest): Promise<ListenerModelFromCodeResponse> {
        return this.sendRequest<ListenerModelFromCodeResponse>(EXTENDED_APIS.BI_SERVICE_GET_LISTENER_SOURCE, params);
    }

    async getServiceModel(params: ServiceModelRequest): Promise<ServiceModelResponse> {
        return this.sendRequest<ServiceModelResponse>(EXTENDED_APIS.BI_SERVICE_GET_SERVICE, params);
    }

    async getServiceInitModel(params: ServiceModelRequest): Promise<ServiceModelInitResponse> {
        return this.sendRequest<ServiceModelInitResponse>(EXTENDED_APIS.BI_SERVICE_GET_SERVICE_INIT, params);
    }

    async createServiceAndListener(params: ServiceInitSourceRequest): Promise<SourceEditResponse> {
        return this.sendRequest<SourceEditResponse>(EXTENDED_APIS.BI_SERVICE_CREATE_SERVICE_AND_LISTENER, params);
    }

    async getFunctionModel(params: FunctionModelRequest): Promise<FunctionModelResponse> {
        return this.sendRequest<FunctionModelResponse>(EXTENDED_APIS.BI_SERVICE_GET_FUNCTION, params);
    }

    async addServiceSourceCode(params: ServiceSourceCodeRequest): Promise<ListenerSourceCodeResponse> {
        return this.sendRequest<ListenerSourceCodeResponse>(EXTENDED_APIS.BI_SERVICE_ADD_SERVICE, params);
    }

    async updateServiceSourceCode(params: ServiceSourceCodeRequest): Promise<ListenerSourceCodeResponse> {
        return this.sendRequest<ListenerSourceCodeResponse>(EXTENDED_APIS.BI_SERVICE_UPDATE_SERVICE, params);
    }

    async getServiceModelFromCode(params: ServiceModelFromCodeRequest): Promise<ServiceModelFromCodeResponse> {
        return this.sendRequest<ServiceModelFromCodeResponse>(EXTENDED_APIS.BI_SERVICE_GET_SERVICE_SOURCE, params);
    }

    async updateServiceClass(params: ServiceClassSourceRequest): Promise<SourceEditResponse> {
        return this.sendRequest<SourceEditResponse>(EXTENDED_APIS.BI_SERVICE_UPDATE_SERVICE_CLASS, params);
    }

    async getServiceClassModel(params: ModelFromCodeRequest): Promise<ServiceClassModelResponse> {
        return this.sendRequest<ServiceClassModelResponse>(EXTENDED_APIS.BI_SERVICE_SERVICE_CLASS_MODEL, params);
    }

    async getFunctionFromSource(params: FunctionFromSourceRequest): Promise<FunctionFromSourceResponse> {
        return this.sendRequest<FunctionFromSourceResponse>(EXTENDED_APIS.BI_GET_FUNCTION_FROM_SOURCE, params);
    }

    async updateClassField(params: ClassFieldModifierRequest): Promise<SourceEditResponse> {
        return this.sendRequest<SourceEditResponse>(EXTENDED_APIS.BI_UPDATE_CLASS_FIELD, params);
    }

    async addClassField(params: AddFieldRequest): Promise<SourceEditResponse> {
        return this.sendRequest<SourceEditResponse>(EXTENDED_APIS.BI_ADD_CLASS_FIELD, params);
    }

    async getHttpResourceModel(params: HttpResourceModelRequest): Promise<HttpResourceModelResponse> {
        return this.sendRequest<HttpResourceModelResponse>(EXTENDED_APIS.BI_SERVICE_GET_RESOURCE, params);
    }

    async getResourceReturnTypes(params: ResourceReturnTypesRequest): Promise<VisibleTypesResponse> {
        return this.sendRequest<VisibleTypesResponse>(EXTENDED_APIS.BI_SERVICE_GET_RESOURCE_RETURN_TYPES, params);
    }

    async addResourceSourceCode(params: FunctionSourceCodeRequest): Promise<ResourceSourceCodeResponse> {
        return this.sendRequest<ResourceSourceCodeResponse>(EXTENDED_APIS.BI_SERVICE_ADD_RESOURCE, params);
    }

    async addFunctionSourceCode(params: FunctionSourceCodeRequest): Promise<ResourceSourceCodeResponse> {
        return this.sendRequest<ResourceSourceCodeResponse>(EXTENDED_APIS.BI_SERVICE_ADD_FUNCTION, params);
    }

    async updateResourceSourceCode(params: FunctionSourceCodeRequest): Promise<ResourceSourceCodeResponse> {
        return this.sendRequest<ResourceSourceCodeResponse>(EXTENDED_APIS.BI_SERVICE_UPDATE_RESOURCE, params);
    }

    async getDesignModel(params: BIDesignModelRequest): Promise<BIDesignModelResponse> {
        return this.sendRequest<BIDesignModelResponse>(EXTENDED_APIS.BI_DESIGN_MODEL, params);
    }

    async getTypes(params: GetTypesRequest): Promise<GetTypesResponse> {
        return this.sendRequest<GetTypesResponse>(EXTENDED_APIS.BI_GET_TYPES, params);
    }

    async getType(params: GetTypeRequest): Promise<GetTypeResponse> {
        return this.sendRequest<GetTypeResponse>(EXTENDED_APIS.BI_GET_TYPE, params);
    }

    async getSimpleTypeOfExpression(params: GetSimpleTypeOfExpressionRequest): Promise<GetSimpleTypeOfExpressionResponse> {
        return this.sendRequest<GetSimpleTypeOfExpressionResponse>(EXTENDED_APIS.BI_GET_SIMPLE_TYPE_OF_EXPRESSION, params);
    }

    async updateType(params: UpdateTypeRequest): Promise<UpdateTypeResponse> {
        return this.sendRequest<UpdateTypeResponse>(EXTENDED_APIS.BI_UPDATE_TYPE, params);
    }

    async updateTypes(params: UpdateTypesRequest): Promise<UpdateTypesResponse> {
        return this.sendRequest<UpdateTypesResponse>(EXTENDED_APIS.BI_UPDATE_TYPES, params);
    }

    async createGraphqlClassType(params: UpdateTypeRequest): Promise<UpdateTypeResponse> {
        return this.sendRequest<UpdateTypeResponse>(EXTENDED_APIS.BI_CREATE_GRAPHQL_CLASS_TYPE, params);
    }

    async getRecordConfig(params: GetRecordConfigRequest): Promise<GetRecordConfigResponse> {
        return this.sendRequest<GetRecordConfigResponse>(EXTENDED_APIS.BI_GET_RECORD_CONFIG, params);
    }

    async updateRecordConfig(params: UpdateRecordConfigRequest): Promise<GetRecordConfigResponse> {
        return this.sendRequest<GetRecordConfigResponse>(EXTENDED_APIS.BI_UPDATE_RECORD_CONFIG, params);
    }

    async getRecordSource(params: RecordSourceGenRequest): Promise<RecordSourceGenResponse> {
        return this.sendRequest<RecordSourceGenResponse>(EXTENDED_APIS.BI_GET_RECORD_SOURCE, params);
    }

    async getRecordModelFromSource(params: GetRecordModelFromSourceRequest): Promise<GetRecordModelFromSourceResponse> {
        return this.sendRequest<GetRecordModelFromSourceResponse>(EXTENDED_APIS.BI_GET_RECORD_MODEL_FROM_SOURCE, params);
    }

    async getGraphqlTypeModel(params: GetGraphqlTypeRequest): Promise<GetGraphqlTypeResponse> {
        return this.sendRequest<GetGraphqlTypeResponse>(EXTENDED_APIS.BI_GET_GRAPHQL_TYPE, params);
    }

    async updateImports(params: UpdateImportsRequest): Promise<ImportsInfoResponse> {
        return this.sendRequest<ImportsInfoResponse>(EXTENDED_APIS.BI_UPDATE_IMPORTS, params);
    }

    async addFunction(params: AddFunctionRequest): Promise<AddImportItemResponse> {
        return this.sendRequest<AddImportItemResponse>(EXTENDED_APIS.BI_ADD_FUNCTION, params);
    }

    async getAiModuleOrg(params: AiModuleOrgRequest): Promise<AiModuleOrgResponse> {
        return this.sendRequest<AiModuleOrgResponse>(EXTENDED_APIS.BI_AI_AGENT_ORG, params);
    }

    async getAllAgents(params: AINodesRequest): Promise<AINodesResponse> {
        return this.sendRequest<AINodesResponse>(EXTENDED_APIS.BI_AI_ALL_AGENTS, params);
    }

    async getAllModels(params: AIModelsRequest): Promise<AINodesResponse> {
        return this.sendRequest<AINodesResponse>(EXTENDED_APIS.BI_AI_ALL_MODELS, params);
    }

    async getAllMemoryManagers(params: MemoryManagersRequest): Promise<MemoryManagersResponse> {
        return this.sendRequest<MemoryManagersResponse>(EXTENDED_APIS.BI_AI_ALL_MEMORY_MANAGERS, params);
    }

    async getModels(params: AIModelsRequest): Promise<AIModelsResponse> {
        return this.sendRequest<AIModelsResponse>(EXTENDED_APIS.BI_AI_GET_MODELS, params);
    }

    async getTools(params: AIToolsRequest): Promise<AIToolsResponse> {
        return this.sendRequest<AIToolsResponse>(EXTENDED_APIS.BI_AI_GET_TOOLS, params);
    }

    async getTool(params: AIToolRequest): Promise<AIToolResponse> {
        return this.sendRequest<AIToolResponse>(EXTENDED_APIS.BI_AI_GET_TOOL, params);
    }

    async getMcpTools(params: McpToolsRequest): Promise<McpToolsResponse> {
        return this.sendRequest<McpToolsResponse>(EXTENDED_APIS.BI_AI_GET_MCP_TOOLS, params);
    }

    async genTool(params: AIGentToolsRequest): Promise<AIGentToolsResponse> {
        return this.sendRequest<AIGentToolsResponse>(EXTENDED_APIS.BI_AI_GEN_TOOLS, params);
    }

    async genAgentTool(params: GenAgentToolRequest): Promise<AIGentToolsResponse> {
        return this.sendRequest<AIGentToolsResponse>(EXTENDED_APIS.BI_AI_GEN_AGENT_TOOL, params);
    }

    async getPackageVersion(params: AIGetPackageVersionRequest): Promise<AIGetPackageVersionResponse> {
        return this.sendRequest<AIGetPackageVersionResponse>(EXTENDED_APIS.BI_AI_GET_PACKAGE_VERSION, params);
    }

    async search(params: BISearchRequest): Promise<BISearchResponse> {
        return this.sendRequest<BISearchResponse>(EXTENDED_APIS.BI_SEARCH, params);
    }

    async getAllData(params: WorkflowDataRequest): Promise<WorkflowDataResponse> {
        return this.sendRequest<WorkflowDataResponse>(EXTENDED_APIS.BI_WORKFLOW_ALL_DATA, params);
    }

    async searchNodes(params: BISearchNodesRequest): Promise<BISearchNodesResponse> {
        return this.sendRequest<BISearchNodesResponse>(EXTENDED_APIS.BI_SEARCH_NODES, params);
    }

    async openApiGenerateClient(params: OpenAPIClientGenerationRequest): Promise<OpenAPIClientGenerationResponse> {
        return this.sendRequest<OpenAPIClientGenerationResponse>(EXTENDED_APIS.OPEN_API_GENERATE_CLIENT, params);
    }

    async getOpenApiGeneratedModules(params: OpenAPIGeneratedModulesRequest): Promise<OpenAPIGeneratedModulesResponse> {
        return this.sendRequest<OpenAPIGeneratedModulesResponse>(EXTENDED_APIS.OPEN_API_GENERATED_MODULES, params);
    }

    async deleteOpenApiGeneratedModule(params: OpenAPIClientDeleteRequest): Promise<OpenAPIClientDeleteResponse> {
        return this.sendRequest<OpenAPIClientDeleteResponse>(EXTENDED_APIS.OPEN_API_CLIENT_DELETE, params);
    }

    async getCopilotCompactLibraries(params: CopilotAllLibrariesRequest): Promise<CopilotCompactLibrariesResponse> {
        return this.sendRequest<CopilotCompactLibrariesResponse>(EXTENDED_APIS.COPILOT_ALL_LIBRARIES, params);
    }

    async getCopilotFilteredLibraries(params: CopilotFilterLibrariesRequest): Promise<CopilotFilterLibrariesResponse> {
        return this.sendRequest<CopilotFilterLibrariesResponse>(EXTENDED_APIS.COPILOT_FILTER_LIBRARIES, params);
    }

    async getCopilotLibrariesBySearch(params: CopilotSearchLibrariesBySearchRequest): Promise<CopilotSearchLibrariesBySearchResponse> {
        return this.sendRequest<CopilotSearchLibrariesBySearchResponse>(EXTENDED_APIS.COPILOT_SEARCH_LIBRARIES, params);
    }

    async getMigrationTools(): Promise<GetMigrationToolsResponse> {
        return this.sendRequest<GetMigrationToolsResponse>(EXTENDED_APIS.GET_MIGRATION_TOOLS);
    }

    async importTibcoToBI(params: ImportIntegrationRequest): Promise<ImportIntegrationResponse> {
        debug(`Importing Tibco to Ballerina: ${JSON.stringify(params)}`);
        return this.sendRequest<ImportIntegrationResponse>(EXTENDED_APIS.TIBCO_TO_BI, params);
    }

    async importMuleToBI(params: ImportIntegrationRequest): Promise<ImportIntegrationResponse> {
        debug(`Importing Mule to Ballerina: ${JSON.stringify(params)}`);
        return this.sendRequest<ImportIntegrationResponse>(EXTENDED_APIS.MULE_TO_BI, params);
    }

    async getSemanticDiff(params: SemanticDiffRequest): Promise<SemanticDiffResponse> {
        return this.sendRequest<SemanticDiffResponse>(EXTENDED_APIS.BI_GET_SEMANTIC_DIFF, params);
    }

    // <------------ BI APIS END --------------->


    // <------------ OTHER UTILS START --------------->

    async registerExtendedAPICapabilities(): Promise<Set<String>> {

        if (this.ballerinaExtendedServices || this.initBalRequestSent) {
            return Promise.resolve(this.ballerinaExtendedServices || new Set());
        }

        this.initBalRequestSent = true;

        await this.initBalServices({
            ballerinaClientCapabilities: [
                {
                    name: EXTENDED_APIS_ORG.DOCUMENT, syntaxTreeNode: true, executorPositions: true,
                    syntaxTreeModify: true, diagnostics: true, syntaxTree: true, astModify: true, triggerModify: true,
                    resolveMissingDependencies: true
                },
                { name: EXTENDED_APIS_ORG.PACKAGE, components: true, metadata: true, configSchema: true },
                {
                    name: EXTENDED_APIS_ORG.SYMBOL, type: true, getSymbol: true,
                    getTypeFromExpression: true, getTypeFromSymbol: true, getTypesFromFnDefinition: true
                },
                {
                    name: EXTENDED_APIS_ORG.CONNECTOR, connectors: true, connector: true, record: true
                },
                {
                    name: EXTENDED_APIS_ORG.TRIGGER, triggers: true, trigger: true
                },
                {
                    name: EXTENDED_APIS_ORG.RUNNER, diagnostics: true, mainFunctionParams: true,
                },
                { name: EXTENDED_APIS_ORG.EXAMPLE, list: true },
                { name: EXTENDED_APIS_ORG.JSON_TO_RECORD, convert: true },
                { name: EXTENDED_APIS_ORG.XML_TO_RECORD, convert: true },
                { name: EXTENDED_APIS_ORG.PERF_ANALYZER, getResourcesWithEndpoints: true },
                { name: EXTENDED_APIS_ORG.PARTIAL_PARSER, getSTForSingleStatement: true, getSTForExpression: true, getSTForResource: true },
                { name: EXTENDED_APIS_ORG.BALLERINA_TO_OPENAPI, generateOpenAPI: true },
                { name: EXTENDED_APIS_ORG.GRAPHQL_DESIGN, getGraphqlModel: true },
                { name: EXTENDED_APIS_ORG.SEQUENCE_DIAGRAM, getSequenceDiagramModel: true },
                {
                    name: EXTENDED_APIS_ORG.NOTEBOOK_SUPPORT, getResult: true, getShellFileSource: true,
                    getVariableValues: true, deleteDeclarations: true, restartNotebook: true
                }
            ]
        }).then(response => {
            const capabilities: Set<String> = new Set();
            response.ballerinaServerCapabilities.forEach((capability: BallerinaServerCapability) => {
                const keys: string[] = Object.keys(capability);
                const org: string = capability['name'];
                keys.forEach(key => {
                    if (key != 'name') {
                        capabilities.add(`${org}/${key}`);
                    }
                });
            });
            this.ballerinaExtendedServices = capabilities;
            return Promise.resolve(this.ballerinaExtendedServices);
        }).catch(_error => {
            this.isDynamicRegistrationSupported = false;
        });

        return Promise.resolve(new Set());
    }

    async isExtendedServiceSupported(serviceName: string): Promise<boolean> {
        if (!this.isDynamicRegistrationSupported) {
            return Promise.resolve(true);
        }

        return Promise.resolve((await this.registerExtendedAPICapabilities()).has(serviceName));
    }

    public pushLSClientTelemetries() {
        if (this.timeConsumption.completion.length > 0) {
            const completionValues = calculateTelemetryValues(this.timeConsumption.completion, 'completion');
            sendTelemetryEvent(this.ballerinaExtInstance!, TM_EVENT_LANG_CLIENT, CMP_LS_CLIENT_COMPLETIONS,
                getMessageObject(process.env.HOSTNAME), completionValues);
            this.timeConsumption.completion = [];
        }

        if (this.timeConsumption.diagnostics.length > 0) {
            const diagnosticValues = calculateTelemetryValues(this.timeConsumption.diagnostics, 'diagnostic');
            this.timeConsumption.diagnostics = [];
            sendTelemetryEvent(this.ballerinaExtInstance!, TM_EVENT_LANG_CLIENT, CMP_LS_CLIENT_DIAGNOSTICS,
                getMessageObject(process.env.HOSTNAME), diagnosticValues);
        }
    }

    public close(): void {
    }

    public updateStatusBar() {
        if (!this.ballerinaExtInstance || !this.ballerinaExtInstance.getCodeServerContext().statusBarItem) {
            return;
        }
        this.ballerinaExtInstance.getCodeServerContext().statusBarItem?.updateGitStatus();
    }

    public getDidOpenParams(): DidOpenParams {
        return {
            textDocument: {
                uri: "file://",
                languageId: "ballerina",
                text: '',
                version: 1
            }
        };
    }

}

function calculateTelemetryValues(array: number[], name: string): any {
    let values = {};
    let total = 0;
    let min = 99999999999;
    let max = -1;
    for (let i = 0; i < array.length; i++) {
        total += array[i];
        if (max < array[i]) {
            max = array[i];
        }
        if (min > array[i]) {
            min = array[i];
        }
    }
    values[name + '-average'] = total / array.length;
    values[name + '-min'] = min;
    values[name + '-max'] = max;
    return values;
}
