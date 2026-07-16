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
import { ProjectStructureResponse, UpdatedArtifactsResponse } from "../../interfaces/bi";
import { LinePosition } from "../../interfaces/common";
import {
    BIAvailableNodesRequest,
    BIAvailableNodesResponse,
    BIFlowModelResponse,
    BINodeTemplateRequest,
    BINodeTemplateResponse,
    BISourceCodeRequest,
    BIModuleNodesResponse,
    ExpressionCompletionsRequest,
    ExpressionCompletionsResponse,
    ConfigVariableResponse,
    SignatureHelpRequest,
    SignatureHelpResponse,
    BIGetVisibleVariableTypesRequest,
    BIGetVisibleVariableTypesResponse,
    VisibleTypesRequest,
    VisibleTypesResponse,
    BIDeleteByComponentInfoRequest,
    BIDeleteByComponentInfoResponse,
    ExpressionDiagnosticsRequest,
    ExpressionDiagnosticsResponse,
    BIGetEnclosedFunctionRequest,
    BIGetEnclosedFunctionResponse,
    BIDesignModelResponse,
    GetTypesResponse,
    UpdateTypeResponse,
    GetTypesRequest,
    UpdateTypeRequest,
    GetTypeRequest,
    GetTypeResponse,
    UpdateImportsRequest,
    UpdateImportsResponse,
    AddFunctionRequest,
    AddImportItemResponse,
    FunctionNodeRequest,
    FunctionNodeResponse,
    ServiceClassModelResponse,
    ModelFromCodeRequest,
    ClassFieldModifierRequest,
    SourceEditResponse,
    ServiceClassSourceRequest,
    AddFieldRequest,
    AddInitParameterRequest,
    ClassOwnedNodeDeleteRequest,
    ClassOwnedNodeRequest,
    ClassOwnedNodeSourceRequest,
    ClassInitParameterModifierRequest,
    RenameIdentifierRequest,
    BISearchRequest,
    BISearchResponse,
    GetRecordConfigRequest,
    GetRecordConfigResponse,
    UpdateRecordConfigRequest,
    RecordSourceGenRequest,
    RecordSourceGenResponse,
    GetRecordModelFromSourceResponse,
    GetRecordModelFromSourceRequest,
    UpdateTypesRequest,
    UpdateTypesResponse,
    DeploymentRequest,
    WorkspaceDeploymentRequest,
    DeploymentResponse,
    OpenAPIClientGenerationRequest,
    OpenAPIGeneratedModulesRequest,
    OpenAPIGeneratedModulesResponse,
    OpenAPIClientDeleteRequest,
    OpenAPIClientDeleteResponse,
    OpenConfigTomlRequest,
    UpdateConfigVariableRequestV2,
    GetConfigVariableNodeTemplateRequest,
    UpdateConfigVariableResponseV2,
    DeleteConfigVariableResponseV2,
    DeleteConfigVariableRequestV2,
    JsonToTypeRequest,
    JsonToTypeResponse,
    ConfigVariableRequest,
    DeleteTypeRequest,
    DeleteTypeResponse,
    VerifyTypeDeleteRequest,
    VerifyTypeDeleteResponse,
    FormDiagnosticsRequest,
    FormDiagnosticsResponse,
    BISearchNodesRequest,
    BISearchNodesResponse,
    BIDesignModelRequest,
    BIFlowModelRequest,
    ExpressionTokensRequest,
    GetSimpleTypeOfExpressionRequest,
    GetSimpleTypeOfExpressionResponse,
    WorkflowDataRequest,
    WorkflowDataResponse
} from "../../interfaces/extended-lang-client";
import {
    ProjectRequest,
    WorkspacesResponse,
    ProjectComponentsResponse,
    ComponentRequest,
    CreateComponentResponse,
    ReadmeContentRequest,
    ReadmeContentResponse,
    BIAiSuggestionsRequest,
    BIAiSuggestionsResponse,
    AIChatRequest,
    InlineAgentChatRequest,
    BreakpointRequest,
    CurrentBreakpointsResponse,
    FormDidOpenParams,
    FormDidCloseParams,
    FormDirtyDidChangeParams,
    EndOfFileRequest,
    RecordsInWorkspaceMentions,
    BuildMode,
    DevantMetadata,
    WorkspaceDevantMetadata,
    GeneratedClientSaveResponse,
    AddProjectToWorkspaceRequest,
    DeleteProjectRequest,
    OpenReadmeRequest,
    ValidateProjectFormRequest,
    ValidateProjectFormResponse,
    SuggestedProjectDefaultsResponse,
    UpdateProjectTitleRequest,
    UpdatePackageTitleRequest
} from "./interfaces";
import { RequestType, NotificationType } from "vscode-messenger-common";

const _preFix = "bi-diagram";
export const getFlowModel: RequestType<BIFlowModelRequest, BIFlowModelResponse> = { method: `${_preFix}/getFlowModel` };
export const getSourceCode: RequestType<BISourceCodeRequest, UpdatedArtifactsResponse> = { method: `${_preFix}/getSourceCode` };
export const deleteFlowNode: RequestType<BISourceCodeRequest, UpdatedArtifactsResponse> = { method: `${_preFix}/deleteFlowNode` };
export const deleteByComponentInfo: RequestType<BIDeleteByComponentInfoRequest, BIDeleteByComponentInfoResponse> = { method: `${_preFix}/deleteByComponentInfo` };
export const getAvailableNodes: RequestType<BIAvailableNodesRequest, BIAvailableNodesResponse> = { method: `${_preFix}/getAvailableNodes` };
export const getAvailableAgents: RequestType<BIAvailableNodesRequest, BIAvailableNodesResponse> = { method: `${_preFix}/getAvailableAgents` };
export const getAvailableModelProviders: RequestType<BIAvailableNodesRequest, BIAvailableNodesResponse> = { method: `${_preFix}/getAvailableModelProviders` };
export const getAvailableVectorStores: RequestType<BIAvailableNodesRequest, BIAvailableNodesResponse> = { method: `${_preFix}/getAvailableVectorStores` };
export const getAvailableEmbeddingProviders: RequestType<BIAvailableNodesRequest, BIAvailableNodesResponse> = { method: `${_preFix}/getAvailableEmbeddingProviders` };
export const getAvailableVectorKnowledgeBases: RequestType<BIAvailableNodesRequest, BIAvailableNodesResponse> = { method: `${_preFix}/getAvailableVectorKnowledgeBases` };
export const getAvailableDataLoaders: RequestType<BIAvailableNodesRequest, BIAvailableNodesResponse> = { method: `${_preFix}/getAvailableDataLoaders` };
export const getAvailableChunkers: RequestType<BIAvailableNodesRequest, BIAvailableNodesResponse> = { method: `${_preFix}/getAvailableChunkers` };
export const getEnclosedFunction: RequestType<BIGetEnclosedFunctionRequest, BIGetEnclosedFunctionResponse> = { method: `${_preFix}/getEnclosedFunction` };
export const getNodeTemplate: RequestType<BINodeTemplateRequest, BINodeTemplateResponse> = { method: `${_preFix}/getNodeTemplate` };
export const getAiSuggestions: RequestType<BIAiSuggestionsRequest, BIAiSuggestionsResponse> = { method: `${_preFix}/getAiSuggestions` };
export const createProject: NotificationType<ProjectRequest> = { method: `${_preFix}/createProject` };
export const validateProjectPath: RequestType<ValidateProjectFormRequest, ValidateProjectFormResponse> = { method: `${_preFix}/validateProjectPath` };
export const getSuggestedProjectDefaults: RequestType<{ isInProject: boolean }, SuggestedProjectDefaultsResponse> = { method: `${_preFix}/getSuggestedProjectDefaults` };
export const deleteProject: NotificationType<DeleteProjectRequest> = { method: `${_preFix}/deleteProject` };
export const addProjectToWorkspace: NotificationType<AddProjectToWorkspaceRequest> = { method: `${_preFix}/addProjectToWorkspace` };
export const getWorkspaces: RequestType<void, WorkspacesResponse> = { method: `${_preFix}/getWorkspaces` };
export const getProjectStructure: RequestType<void, ProjectStructureResponse> = { method: `${_preFix}/getProjectStructure` };
export const getProjectComponents: RequestType<void, ProjectComponentsResponse> = { method: `${_preFix}/getProjectComponents` };
export const createComponent: RequestType<ComponentRequest, CreateComponentResponse> = { method: `${_preFix}/createComponent` };
export const handleReadmeContent: RequestType<ReadmeContentRequest, ReadmeContentResponse> = { method: `${_preFix}/handleReadmeContent` };
export const getVisibleVariableTypes: RequestType<BIGetVisibleVariableTypesRequest, BIGetVisibleVariableTypesResponse> = { method: `${_preFix}/getVisibleVariableTypes` };
export const getExpressionCompletions: RequestType<ExpressionCompletionsRequest, ExpressionCompletionsResponse> = { method: `${_preFix}/getExpressionCompletions` };
export const getDataMapperCompletions: RequestType<ExpressionCompletionsRequest, ExpressionCompletionsResponse> = { method: `${_preFix}/getDataMapperCompletions` };
export const getConfigVariablesV2: RequestType<ConfigVariableRequest, ConfigVariableResponse> = { method: `${_preFix}/getConfigVariablesV2` };
export const updateConfigVariablesV2: RequestType<UpdateConfigVariableRequestV2, UpdateConfigVariableResponseV2> = { method: `${_preFix}/updateConfigVariablesV2` };
export const deleteConfigVariableV2: RequestType<DeleteConfigVariableRequestV2, DeleteConfigVariableResponseV2> = { method: `${_preFix}/deleteConfigVariableV2` };
export const getConfigVariableNodeTemplate: RequestType<GetConfigVariableNodeTemplateRequest, BINodeTemplateResponse> = { method: `${_preFix}/getConfigVariableNodeTemplate` };
export const getModuleNodes: RequestType<void, BIModuleNodesResponse> = { method: `${_preFix}/getModuleNodes` };
export const getReadmeContent: RequestType<ReadmeContentRequest, ReadmeContentResponse> = { method: `${_preFix}/getReadmeContent` };
export const openReadme: NotificationType<OpenReadmeRequest> = { method: `${_preFix}/openReadme` };
export const renameIdentifier: NotificationType<RenameIdentifierRequest> = { method: `${_preFix}/renameIdentifier` };
export const deployProject: RequestType<DeploymentRequest, DeploymentResponse> = { method: `${_preFix}/deployProject` };
export const deployWorkspace: RequestType<WorkspaceDeploymentRequest, DeploymentResponse> = { method: `${_preFix}/deployWorkspace` };
export const openAIChat: NotificationType<AIChatRequest> = { method: `${_preFix}/openAIChat` };
export const startInlineAgentChat: NotificationType<InlineAgentChatRequest> = { method: `${_preFix}/startInlineAgentChat` };
export const cleanupAgentChatServices: RequestType<void, boolean> = { method: `${_preFix}/cleanupAgentChatServices` };
export const getSignatureHelp: RequestType<SignatureHelpRequest, SignatureHelpResponse> = { method: `${_preFix}/getSignatureHelp` };
export const buildProject: NotificationType<BuildMode> = { method: `${_preFix}/buildProject` };
export const runProject: NotificationType<void> = { method: `${_preFix}/runProject` };
export const getVisibleTypes: RequestType<VisibleTypesRequest, VisibleTypesResponse> = { method: `${_preFix}/getVisibleTypes` };
export const addBreakpointToSource: NotificationType<BreakpointRequest> = { method: `${_preFix}/addBreakpointToSource` };
export const removeBreakpointFromSource: NotificationType<BreakpointRequest> = { method: `${_preFix}/removeBreakpointFromSource` };
export const getBreakpointInfo: RequestType<void, CurrentBreakpointsResponse> = { method: `${_preFix}/getBreakpointInfo` };
export const getFormDiagnostics: RequestType<FormDiagnosticsRequest, FormDiagnosticsResponse> = { method: `${_preFix}/getFormDiagnostics` };
export const getExpressionDiagnostics: RequestType<ExpressionDiagnosticsRequest, ExpressionDiagnosticsResponse> = { method: `${_preFix}/getExpressionDiagnostics` };
export const formDidOpen: RequestType<FormDidOpenParams, void> = { method: `${_preFix}/formDidOpen` };
export const formDidClose: RequestType<FormDidCloseParams, void> = { method: `${_preFix}/formDidClose` };
export const formDirtyDidChange: NotificationType<FormDirtyDidChangeParams> = { method: `${_preFix}/formDirtyDidChange` };
export const getDesignModel: RequestType<BIDesignModelRequest, BIDesignModelResponse> = { method: `${_preFix}/getDesignModel` };
export const getTypes: RequestType<GetTypesRequest, GetTypesResponse> = { method: `${_preFix}/getTypes` };
export const getType: RequestType<GetTypeRequest, GetTypeResponse> = { method: `${_preFix}/getType` };
export const getSimpleTypeOfExpression: RequestType<GetSimpleTypeOfExpressionRequest, GetSimpleTypeOfExpressionResponse> = { method: `${_preFix}/getSimpleTypeOfExpression` };
export const updateType: RequestType<UpdateTypeRequest, UpdateTypeResponse> = { method: `${_preFix}/updateType` };
export const updateTypes: RequestType<UpdateTypesRequest, UpdateTypesResponse> = { method: `${_preFix}/updateTypes` };
export const deleteType: RequestType<DeleteTypeRequest, DeleteTypeResponse> = { method: `${_preFix}/deleteType` };
export const verifyTypeDelete: RequestType<VerifyTypeDeleteRequest, VerifyTypeDeleteResponse> = { method: `${_preFix}/verifyTypeDelete` };
export const getTypeFromJson: RequestType<JsonToTypeRequest, JsonToTypeResponse> = { method: `${_preFix}/getTypeFromJson` };
export const getServiceClassModel: RequestType<ModelFromCodeRequest, ServiceClassModelResponse> = { method: `${_preFix}/getServiceClassModel` };
export const updateClassField: RequestType<ClassFieldModifierRequest, SourceEditResponse> = { method: `${_preFix}/updateClassField` };
export const addClassField: RequestType<AddFieldRequest, SourceEditResponse> = { method: `${_preFix}/addClassField` };
export const addClassInitParameter: RequestType<AddInitParameterRequest, SourceEditResponse> = { method: `${_preFix}/addClassInitParameter` };
export const getClassOwnedNodes: RequestType<ClassOwnedNodeRequest, BIModuleNodesResponse> = { method: `${_preFix}/getClassOwnedNodes` };
export const upsertClassOwnedNode: RequestType<ClassOwnedNodeSourceRequest, SourceEditResponse> = { method: `${_preFix}/upsertClassOwnedNode` };
export const removeClassOwnedNode: RequestType<ClassOwnedNodeDeleteRequest, SourceEditResponse> = { method: `${_preFix}/removeClassOwnedNode` };
export const updateClassInitParameter: RequestType<ClassInitParameterModifierRequest, SourceEditResponse> = { method: `${_preFix}/updateClassInitParameter` };
export const removeClassInitParameter: RequestType<ClassInitParameterModifierRequest, SourceEditResponse> = { method: `${_preFix}/removeClassInitParameter` };
export const updateServiceClass: RequestType<ServiceClassSourceRequest, UpdatedArtifactsResponse> = { method: `${_preFix}/updateServiceClass` };
export const createGraphqlClassType: RequestType<UpdateTypeRequest, UpdateTypeResponse> = { method: `${_preFix}/createGraphqlClassType` };
export const getRecordConfig: RequestType<GetRecordConfigRequest, GetRecordConfigResponse> = { method: `${_preFix}/getRecordConfig` };
export const updateRecordConfig: RequestType<UpdateRecordConfigRequest, GetRecordConfigResponse> = { method: `${_preFix}/updateRecordConfig` };
export const getRecordModelFromSource: RequestType<GetRecordModelFromSourceRequest, GetRecordModelFromSourceResponse> = { method: `${_preFix}/getRecordModelFromSource` };
export const getRecordSource: RequestType<RecordSourceGenRequest, RecordSourceGenResponse> = { method: `${_preFix}/getRecordSource` };
export const updateImports: RequestType<UpdateImportsRequest, UpdateImportsResponse> = { method: `${_preFix}/updateImports` };
export const addFunction: RequestType<AddFunctionRequest, AddImportItemResponse> = { method: `${_preFix}/addFunction` };
export const getFunctionNode: RequestType<FunctionNodeRequest, FunctionNodeResponse> = { method: `${_preFix}/getFunctionNode` };
export const getEndOfFile: RequestType<EndOfFileRequest, LinePosition> = { method: `${_preFix}/getEndOfFile` };
export const search: RequestType<BISearchRequest, BISearchResponse> = { method: `${_preFix}/search` };
export const getAllData: RequestType<WorkflowDataRequest, WorkflowDataResponse> = { method: `${_preFix}/getAllData` };
export const searchNodes: RequestType<BISearchNodesRequest, BISearchNodesResponse> = { method: `${_preFix}/searchNodes` };
export const getRecordNames: RequestType<void, RecordsInWorkspaceMentions> = { method: `${_preFix}/getRecordNames` };
export const getFunctionNames: RequestType<void, RecordsInWorkspaceMentions> = { method: `${_preFix}/getFunctionNames` };
export const getDevantMetadata: RequestType<void, DevantMetadata> = { method: `${_preFix}/getDevantMetadata` };
export const getWorkspaceDevantMetadata: RequestType<void, WorkspaceDevantMetadata> = { method: `${_preFix}/getWorkspaceDevantMetadata` };
export const generateOpenApiClient: RequestType<OpenAPIClientGenerationRequest, GeneratedClientSaveResponse> = { method: `${_preFix}/generateOpenApiClient` };
export const getOpenApiGeneratedModules: RequestType<OpenAPIGeneratedModulesRequest, OpenAPIGeneratedModulesResponse> = { method: `${_preFix}/getOpenApiGeneratedModules` };
export const deleteOpenApiGeneratedModules: RequestType<OpenAPIClientDeleteRequest, OpenAPIClientDeleteResponse> = { method: `${_preFix}/deleteOpenApiGeneratedModules` };
export const openConfigToml: RequestType<OpenConfigTomlRequest, void> = { method: `${_preFix}/openConfigToml` };
export const getExpressionTokens: RequestType<ExpressionTokensRequest, number[]> = { method: `${_preFix}/getExpressionTokens` };
export const updateProjectTitle: RequestType<UpdateProjectTitleRequest, void> = { method: `${_preFix}/updateProjectTitle` };
export const updatePackageTitle: RequestType<UpdatePackageTitleRequest, void> = { method: `${_preFix}/updatePackageTitle` };
