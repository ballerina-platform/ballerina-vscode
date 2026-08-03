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
    AIChatRequest,
    AddFieldRequest,
    InlineAgentChatRequest,
    AddFunctionRequest,
    AddImportItemResponse,
    AddProjectToWorkspaceRequest,
    BIAiSuggestionsRequest,
    BIAiSuggestionsResponse,
    BIAvailableNodesRequest,
    BIAvailableNodesResponse,
    BIDeleteByComponentInfoRequest,
    BIDeleteByComponentInfoResponse,
    BIDesignModelRequest,
    BIDesignModelResponse,
    BIDiagramAPI,
    BIFlowModelRequest,
    BIFlowModelResponse,
    BIGetEnclosedFunctionRequest,
    BIGetEnclosedFunctionResponse,
    BIGetVisibleVariableTypesRequest,
    BIGetVisibleVariableTypesResponse,
    BIModuleNodesResponse,
    BINodeTemplateRequest,
    BINodeTemplateResponse,
    BISearchNodesRequest,
    BISearchNodesResponse,
    BISearchRequest,
    BISearchResponse,
    GenActivityRequest,
    GenActivityResponse,
    AnalyzeActivityActionRequest,
    AnalyzeActivityActionResponse,
    WorkflowDataRequest,
    WorkflowDataResponse,
    BISourceCodeRequest,
    BreakpointRequest,
    BuildMode,
    ClassFieldModifierRequest,
    ComponentRequest,
    ConfigVariableRequest,
    ConfigVariableResponse,
    CreateComponentResponse,
    CurrentBreakpointsResponse,
    DeleteConfigVariableRequestV2,
    DeleteConfigVariableResponseV2,
    DeleteProjectRequest,
    DeleteTypeRequest,
    DeleteTypeResponse,
    DeploymentRequest,
    WorkspaceDeploymentRequest,
    DeploymentResponse,
    DevantMetadata,
    EndOfFileRequest,
    ExpressionCompletionsRequest,
    ExpressionCompletionsResponse,
    ExpressionDiagnosticsRequest,
    ExpressionDiagnosticsResponse,
    ExpressionTokensRequest,
    FormDiagnosticsRequest,
    FormDiagnosticsResponse,
    FormDidCloseParams,
    FormDidOpenParams,
    FormDirtyDidChangeParams,
    FunctionNodeRequest,
    FunctionNodeResponse,
    GeneratedClientSaveResponse,
    GetConfigVariableNodeTemplateRequest,
    GetRecordConfigRequest,
    GetRecordConfigResponse,
    GetRecordModelFromSourceRequest,
    GetRecordModelFromSourceResponse,
    GetSimpleTypeOfExpressionRequest,
    GetSimpleTypeOfExpressionResponse,
    GetTypeRequest,
    GetTypeResponse,
    GetTypesRequest,
    GetTypesResponse,
    JsonToTypeRequest,
    JsonToTypeResponse,
    LinePosition,
    ModelFromCodeRequest,
    OpenAPIClientDeleteRequest,
    OpenAPIClientDeleteResponse,
    OpenAPIClientGenerationRequest,
    OpenAPIGeneratedModulesRequest,
    OpenAPIGeneratedModulesResponse,
    OpenConfigTomlRequest,
    OpenReadmeRequest,
    ProjectComponentsResponse,
    ProjectRequest,
    ProjectStructureResponse,
    ReadmeContentRequest,
    ReadmeContentResponse,
    RecordSourceGenRequest,
    RecordSourceGenResponse,
    RecordsInWorkspaceMentions,
    RenameIdentifierRequest,
    ServiceClassModelResponse,
    ServiceClassSourceRequest,
    SignatureHelpRequest,
    SuggestedProjectDefaultsResponse,
    SignatureHelpResponse,
    SourceEditResponse,
    UpdateConfigVariableRequestV2,
    UpdateConfigVariableResponseV2,
    UpdateImportsRequest,
    UpdateImportsResponse,
    UpdateRecordConfigRequest,
    UpdateTypeRequest,
    UpdateTypeResponse,
    UpdateTypesRequest,
    UpdateTypesResponse,
    UpdatedArtifactsResponse,
    ValidateProjectFormRequest,
    ValidateProjectFormResponse,
    UpdateProjectTitleRequest,
    UpdatePackageTitleRequest,
    updateProjectTitle,
    updatePackageTitle,
    VerifyTypeDeleteRequest,
    VerifyTypeDeleteResponse,
    VisibleTypesRequest,
    VisibleTypesResponse,
    WorkspacesResponse,
    addBreakpointToSource,
    addClassField,
    addFunction,
    addProjectToWorkspace,
    buildProject,
    createComponent,
    createGraphqlClassType,
    createProject,
    deleteByComponentInfo,
    deleteConfigVariableV2,
    deleteFlowNode,
    deleteOpenApiGeneratedModules,
    deleteProject,
    deleteType,
    deployProject,
    deployWorkspace,
    formDidClose,
    formDidOpen,
    formDirtyDidChange,
    generateOpenApiClient,
    getAiSuggestions,
    getAvailableAgents,
    getAvailableChunkers,
    getAvailableDataLoaders,
    getAvailableEmbeddingProviders,
    getAvailableModelProviders,
    getAvailableNodes,
    getAvailableVectorKnowledgeBases,
    getAvailableVectorStores,
    getBreakpointInfo,
    getConfigVariableNodeTemplate,
    getConfigVariablesV2,
    getDataMapperCompletions,
    getDesignModel,
    getDevantMetadata,
    getWorkspaceDevantMetadata,
    getEnclosedFunction,
    getEndOfFile,
    getExpressionCompletions,
    getExpressionDiagnostics,
    getExpressionTokens,
    getFlowModel,
    getFormDiagnostics,
    getFunctionNames,
    getFunctionNode,
    getSuggestedProjectDefaults,
    getModuleNodes,
    getNodeTemplate,
    getOpenApiGeneratedModules,
    getProjectComponents,
    getProjectStructure,
    getReadmeContent,
    getRecordConfig,
    getRecordModelFromSource,
    getRecordNames,
    getRecordSource,
    getServiceClassModel,
    getSignatureHelp,
    getSimpleTypeOfExpression,
    getSourceCode,
    getType,
    getTypeFromJson,
    getTypes,
    getVisibleTypes,
    getVisibleVariableTypes,
    getWorkspaces,
    handleReadmeContent,
    openAIChat,
    openConfigToml,
    startInlineAgentChat,
    cleanupAgentChatServices,
    openReadme,
    removeBreakpointFromSource,
    renameIdentifier,
    runProject,
    search,
    genActivity,
    analyzeActivityAction,
    getAllData,
    searchNodes,
    updateClassField,
    updateConfigVariablesV2,
    updateImports,
    updateRecordConfig,
    updateServiceClass,
    updateType,
    updateTypes,
    validateProjectPath,
    verifyTypeDelete,
    WorkspaceDevantMetadata
} from "@wso2/ballerina-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class BiDiagramRpcClient implements BIDiagramAPI {
    private _messenger: Messenger;

    constructor(messenger: Messenger) {
        this._messenger = messenger;
    }

    getFlowModel(params: BIFlowModelRequest): Promise<BIFlowModelResponse> {
        return this._messenger.sendRequest(getFlowModel, HOST_EXTENSION, params);
    }

    getSourceCode(params: BISourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return this._messenger.sendRequest(getSourceCode, HOST_EXTENSION, params);
    }

    deleteFlowNode(params: BISourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        return this._messenger.sendRequest(deleteFlowNode, HOST_EXTENSION, params);
    }

    deleteByComponentInfo(params: BIDeleteByComponentInfoRequest): Promise<BIDeleteByComponentInfoResponse> {
        return this._messenger.sendRequest(deleteByComponentInfo, HOST_EXTENSION, params);
    }

    getAvailableNodes(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this._messenger.sendRequest(getAvailableNodes, HOST_EXTENSION, params);
    }

    getAvailableAgents(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this._messenger.sendRequest(getAvailableAgents, HOST_EXTENSION, params);
    }

    getAvailableModelProviders(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this._messenger.sendRequest(getAvailableModelProviders, HOST_EXTENSION, params);
    }

    getAvailableVectorStores(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this._messenger.sendRequest(getAvailableVectorStores, HOST_EXTENSION, params);
    }

    getAvailableEmbeddingProviders(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this._messenger.sendRequest(getAvailableEmbeddingProviders, HOST_EXTENSION, params);
    }

    getAvailableVectorKnowledgeBases(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this._messenger.sendRequest(getAvailableVectorKnowledgeBases, HOST_EXTENSION, params);
    }

    getAvailableDataLoaders(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this._messenger.sendRequest(getAvailableDataLoaders, HOST_EXTENSION, params);
    }

    getAvailableChunkers(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        return this._messenger.sendRequest(getAvailableChunkers, HOST_EXTENSION, params);
    }

    getEnclosedFunction(params: BIGetEnclosedFunctionRequest): Promise<BIGetEnclosedFunctionResponse> {
        return this._messenger.sendRequest(getEnclosedFunction, HOST_EXTENSION, params);
    }

    getNodeTemplate(params: BINodeTemplateRequest): Promise<BINodeTemplateResponse> {
        return this._messenger.sendRequest(getNodeTemplate, HOST_EXTENSION, params);
    }

    getAiSuggestions(params: BIAiSuggestionsRequest): Promise<BIAiSuggestionsResponse> {
        return this._messenger.sendRequest(getAiSuggestions, HOST_EXTENSION, params);
    }

    createProject(params: ProjectRequest): void {
        return this._messenger.sendNotification(createProject, HOST_EXTENSION, params);
    }

    validateProjectPath(params: ValidateProjectFormRequest): Promise<ValidateProjectFormResponse> {
        return this._messenger.sendRequest(validateProjectPath, HOST_EXTENSION, params);
    }

    getSuggestedProjectDefaults(params: { isInProject: boolean }): Promise<SuggestedProjectDefaultsResponse> {
        return this._messenger.sendRequest(getSuggestedProjectDefaults, HOST_EXTENSION, params);
    }

    deleteProject(params: DeleteProjectRequest): void {
        return this._messenger.sendNotification(deleteProject, HOST_EXTENSION, params);
    }

    addProjectToWorkspace(params: AddProjectToWorkspaceRequest): void {
        return this._messenger.sendNotification(addProjectToWorkspace, HOST_EXTENSION, params);
    }

    getWorkspaces(): Promise<WorkspacesResponse> {
        return this._messenger.sendRequest(getWorkspaces, HOST_EXTENSION);
    }

    getProjectStructure(): Promise<ProjectStructureResponse> {
        return this._messenger.sendRequest(getProjectStructure, HOST_EXTENSION);
    }

    getProjectComponents(): Promise<ProjectComponentsResponse> {
        return this._messenger.sendRequest(getProjectComponents, HOST_EXTENSION);
    }

    createComponent(params: ComponentRequest): Promise<CreateComponentResponse> {
        return this._messenger.sendRequest(createComponent, HOST_EXTENSION, params);
    }

    handleReadmeContent(params: ReadmeContentRequest): Promise<ReadmeContentResponse> {
        return this._messenger.sendRequest(handleReadmeContent, HOST_EXTENSION, params);
    }

    getVisibleVariableTypes(params: BIGetVisibleVariableTypesRequest): Promise<BIGetVisibleVariableTypesResponse> {
        return this._messenger.sendRequest(getVisibleVariableTypes, HOST_EXTENSION, params);
    }

    getExpressionCompletions(params: ExpressionCompletionsRequest): Promise<ExpressionCompletionsResponse> {
        return this._messenger.sendRequest(getExpressionCompletions, HOST_EXTENSION, params);
    }

    getDataMapperCompletions(params: ExpressionCompletionsRequest): Promise<ExpressionCompletionsResponse> {
        return this._messenger.sendRequest(getDataMapperCompletions, HOST_EXTENSION, params);
    }

    getConfigVariablesV2(params: ConfigVariableRequest): Promise<ConfigVariableResponse> {
        return this._messenger.sendRequest(getConfigVariablesV2, HOST_EXTENSION, params);
    }

    updateConfigVariablesV2(params: UpdateConfigVariableRequestV2): Promise<UpdateConfigVariableResponseV2> {
        return this._messenger.sendRequest(updateConfigVariablesV2, HOST_EXTENSION, params);
    }

    deleteConfigVariableV2(params: DeleteConfigVariableRequestV2): Promise<DeleteConfigVariableResponseV2> {
        return this._messenger.sendRequest(deleteConfigVariableV2, HOST_EXTENSION, params);
    }

    getConfigVariableNodeTemplate(params: GetConfigVariableNodeTemplateRequest): Promise<BINodeTemplateResponse> {
        return this._messenger.sendRequest(getConfigVariableNodeTemplate, HOST_EXTENSION, params);
    }

    OpenConfigTomlRequest(params: OpenConfigTomlRequest): Promise<void> {
        return this._messenger.sendRequest(openConfigToml, HOST_EXTENSION, params);
    }

    getModuleNodes(): Promise<BIModuleNodesResponse> {
        return this._messenger.sendRequest(getModuleNodes, HOST_EXTENSION);
    }

    getReadmeContent(params: ReadmeContentRequest): Promise<ReadmeContentResponse> {
        return this._messenger.sendRequest(getReadmeContent, HOST_EXTENSION, params);
    }

    openReadme(params: OpenReadmeRequest): void {
        return this._messenger.sendNotification(openReadme, HOST_EXTENSION, params);
    }

    renameIdentifier(params: RenameIdentifierRequest): Promise<void> {
        return this._messenger.sendRequest(renameIdentifier, HOST_EXTENSION, params);
    }

    deployProject(params: DeploymentRequest): Promise<DeploymentResponse> {
        return this._messenger.sendRequest(deployProject, HOST_EXTENSION, params);
    }

    deployWorkspace(params: WorkspaceDeploymentRequest): Promise<DeploymentResponse> {
        return this._messenger.sendRequest(deployWorkspace, HOST_EXTENSION, params);
    }

    openAIChat(params: AIChatRequest): void {
        return this._messenger.sendNotification(openAIChat, HOST_EXTENSION, params);
    }

    startInlineAgentChat(params: InlineAgentChatRequest): void {
        return this._messenger.sendNotification(startInlineAgentChat, HOST_EXTENSION, params);
    }

    cleanupAgentChatServices(): Promise<boolean> {
        return this._messenger.sendRequest(cleanupAgentChatServices, HOST_EXTENSION);
    }

    getSignatureHelp(params: SignatureHelpRequest): Promise<SignatureHelpResponse> {
        return this._messenger.sendRequest(getSignatureHelp, HOST_EXTENSION, params);
    }

    buildProject(params: BuildMode): void {
        return this._messenger.sendNotification(buildProject, HOST_EXTENSION, params);
    }

    runProject(): void {
        return this._messenger.sendNotification(runProject, HOST_EXTENSION);
    }

    getVisibleTypes(params: VisibleTypesRequest): Promise<VisibleTypesResponse> {
        return this._messenger.sendRequest(getVisibleTypes, HOST_EXTENSION, params);
    }

    addBreakpointToSource(params: BreakpointRequest): void {
        return this._messenger.sendNotification(addBreakpointToSource, HOST_EXTENSION, params);
    }

    removeBreakpointFromSource(params: BreakpointRequest): void {
        return this._messenger.sendNotification(removeBreakpointFromSource, HOST_EXTENSION, params);
    }

    getBreakpointInfo(): Promise<CurrentBreakpointsResponse> {
        return this._messenger.sendRequest(getBreakpointInfo, HOST_EXTENSION);
    }

    getFormDiagnostics(params: FormDiagnosticsRequest): Promise<FormDiagnosticsResponse> {
        return this._messenger.sendRequest(getFormDiagnostics, HOST_EXTENSION, params);
    }

    getExpressionDiagnostics(params: ExpressionDiagnosticsRequest): Promise<ExpressionDiagnosticsResponse> {
        return this._messenger.sendRequest(getExpressionDiagnostics, HOST_EXTENSION, params);
    }

    formDidOpen(params: FormDidOpenParams): Promise<void> {
        return this._messenger.sendRequest(formDidOpen, HOST_EXTENSION, params);
    }

    formDidClose(params: FormDidCloseParams): Promise<void> {
        return this._messenger.sendRequest(formDidClose, HOST_EXTENSION, params);
    }

    formDirtyDidChange(params: FormDirtyDidChangeParams): void {
        this._messenger.sendNotification(formDirtyDidChange, HOST_EXTENSION, params);
    }

    getDesignModel(params: BIDesignModelRequest): Promise<BIDesignModelResponse> {
        return this._messenger.sendRequest(getDesignModel, HOST_EXTENSION, params);
    }

    getTypes(params: GetTypesRequest): Promise<GetTypesResponse> {
        return this._messenger.sendRequest(getTypes, HOST_EXTENSION, params);
    }

    getType(params: GetTypeRequest): Promise<GetTypeResponse> {
        return this._messenger.sendRequest(getType, HOST_EXTENSION, params);
    }

    getSimpleTypeOfExpression(params: GetSimpleTypeOfExpressionRequest): Promise<GetSimpleTypeOfExpressionResponse> {
        return this._messenger.sendRequest(getSimpleTypeOfExpression, HOST_EXTENSION, params);
    }

    updateType(params: UpdateTypeRequest): Promise<UpdateTypeResponse> {
        return this._messenger.sendRequest(updateType, HOST_EXTENSION, params);
    }

    updateTypes(params: UpdateTypesRequest): Promise<UpdateTypesResponse> {
        return this._messenger.sendRequest(updateTypes, HOST_EXTENSION, params);
    }

    deleteType(params: DeleteTypeRequest): Promise<DeleteTypeResponse> {
        return this._messenger.sendRequest(deleteType, HOST_EXTENSION, params);
    }

    getTypeFromJson(params: JsonToTypeRequest): Promise<JsonToTypeResponse> {
        return this._messenger.sendRequest(getTypeFromJson, HOST_EXTENSION, params);
    }

    getServiceClassModel(params: ModelFromCodeRequest): Promise<ServiceClassModelResponse> {
        return this._messenger.sendRequest(getServiceClassModel, HOST_EXTENSION, params);
    }

    updateClassField(params: ClassFieldModifierRequest): Promise<SourceEditResponse> {
        return this._messenger.sendRequest(updateClassField, HOST_EXTENSION, params);
    }

    addClassField(params: AddFieldRequest): Promise<SourceEditResponse> {
        return this._messenger.sendRequest(addClassField, HOST_EXTENSION, params);
    }

    updateServiceClass(params: ServiceClassSourceRequest): Promise<UpdatedArtifactsResponse> {
        return this._messenger.sendRequest(updateServiceClass, HOST_EXTENSION, params);
    }

    createGraphqlClassType(params: UpdateTypeRequest): Promise<UpdateTypeResponse> {
        return this._messenger.sendRequest(createGraphqlClassType, HOST_EXTENSION, params);
    }

    getRecordConfig(params: GetRecordConfigRequest): Promise<GetRecordConfigResponse> {
        return this._messenger.sendRequest(getRecordConfig, HOST_EXTENSION, params);
    }

    updateRecordConfig(params: UpdateRecordConfigRequest): Promise<GetRecordConfigResponse> {
        return this._messenger.sendRequest(updateRecordConfig, HOST_EXTENSION, params);
    }

    getRecordModelFromSource(params: GetRecordModelFromSourceRequest): Promise<GetRecordModelFromSourceResponse> {
        return this._messenger.sendRequest(getRecordModelFromSource, HOST_EXTENSION, params);
    }

    getRecordSource(params: RecordSourceGenRequest): Promise<RecordSourceGenResponse> {
        return this._messenger.sendRequest(getRecordSource, HOST_EXTENSION, params);
    }

    updateImports(params: UpdateImportsRequest): Promise<UpdateImportsResponse> {
        return this._messenger.sendRequest(updateImports, HOST_EXTENSION, params);
    }

    addFunction(params: AddFunctionRequest): Promise<AddImportItemResponse> {
        return this._messenger.sendRequest(addFunction, HOST_EXTENSION, params);
    }

    getFunctionNode(params: FunctionNodeRequest): Promise<FunctionNodeResponse> {
        return this._messenger.sendRequest(getFunctionNode, HOST_EXTENSION, params);
    }

    getEndOfFile(params: EndOfFileRequest): Promise<LinePosition> {
        return this._messenger.sendRequest(getEndOfFile, HOST_EXTENSION, params);
    }

    search(params: BISearchRequest): Promise<BISearchResponse> {
        return this._messenger.sendRequest(search, HOST_EXTENSION, params);
    }

    getAllData(params: WorkflowDataRequest): Promise<WorkflowDataResponse> {
        return this._messenger.sendRequest(getAllData, HOST_EXTENSION, params);
    }

    genActivity(params: GenActivityRequest): Promise<GenActivityResponse> {
        return this._messenger.sendRequest(genActivity, HOST_EXTENSION, params);
    }

    analyzeActivityAction(params: AnalyzeActivityActionRequest): Promise<AnalyzeActivityActionResponse> {
        return this._messenger.sendRequest(analyzeActivityAction, HOST_EXTENSION, params);
    }

    searchNodes(params: BISearchNodesRequest): Promise<BISearchNodesResponse> {
        return this._messenger.sendRequest(searchNodes, HOST_EXTENSION, params);
    }

    getRecordNames(): Promise<RecordsInWorkspaceMentions> {
        return this._messenger.sendRequest(getRecordNames, HOST_EXTENSION);
    }

    getFunctionNames(): Promise<RecordsInWorkspaceMentions> {
        return this._messenger.sendRequest(getFunctionNames, HOST_EXTENSION);
    }

    getDevantMetadata(): Promise<DevantMetadata | undefined> {
        return this._messenger.sendRequest(getDevantMetadata, HOST_EXTENSION);
    }

    getWorkspaceDevantMetadata(): Promise<WorkspaceDevantMetadata | undefined> {
        return this._messenger.sendRequest(getWorkspaceDevantMetadata, HOST_EXTENSION);
    }

    generateOpenApiClient(params: OpenAPIClientGenerationRequest): Promise<GeneratedClientSaveResponse> {
        return this._messenger.sendRequest(generateOpenApiClient, HOST_EXTENSION, params);
    }

    getOpenApiGeneratedModules(params: OpenAPIGeneratedModulesRequest): Promise<OpenAPIGeneratedModulesResponse> {
        return this._messenger.sendRequest(getOpenApiGeneratedModules, HOST_EXTENSION, params);
    }

    deleteOpenApiGeneratedModules(params: OpenAPIClientDeleteRequest): Promise<OpenAPIClientDeleteResponse> {
        return this._messenger.sendRequest(deleteOpenApiGeneratedModules, HOST_EXTENSION, params);
    }

    verifyTypeDelete(params: VerifyTypeDeleteRequest): Promise<VerifyTypeDeleteResponse> {
        return this._messenger.sendRequest(verifyTypeDelete, HOST_EXTENSION, params);
    }

    getExpressionTokens(params: ExpressionTokensRequest): Promise<number[]> {
        return this._messenger.sendRequest(getExpressionTokens, HOST_EXTENSION, params);
    }

    updateProjectTitle(params: UpdateProjectTitleRequest): Promise<void> {
        return this._messenger.sendRequest(updateProjectTitle, HOST_EXTENSION, params);
    }

    updatePackageTitle(params: UpdatePackageTitleRequest): Promise<void> {
        return this._messenger.sendRequest(updatePackageTitle, HOST_EXTENSION, params);
    }
}
