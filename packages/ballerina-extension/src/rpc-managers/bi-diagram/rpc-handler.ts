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
    addBreakpointToSource,
    addClassField,
    addClassInitParameter,
    getClassOwnedNodes,
    upsertClassOwnedNode,
    removeClassOwnedNode,
    updateClassInitParameter,
    removeClassInitParameter,
    AddFieldRequest,
    AddInitParameterRequest,
    ClassOwnedNodeDeleteRequest,
    ClassOwnedNodeRequest,
    ClassOwnedNodeSourceRequest,
    ClassInitParameterModifierRequest,
    addFunction,
    AddFunctionRequest,
    addProjectToWorkspace,
    AddProjectToWorkspaceRequest,
    AIChatRequest,
    InlineAgentChatRequest,
    BIAiSuggestionsRequest,
    BIAvailableNodesRequest,
    BIDeleteByComponentInfoRequest,
    BIDesignModelRequest,
    BIFlowModelRequest,
    BIGetEnclosedFunctionRequest,
    BIGetVisibleVariableTypesRequest,
    BINodeTemplateRequest,
    BISearchNodesRequest,
    BISearchRequest,
    WorkflowDataRequest,
    BISourceCodeRequest,
    BreakpointRequest,
    BuildMode,
    buildProject,
    ClassFieldModifierRequest,
    ComponentRequest,
    ConfigVariableRequest,
    createComponent,
    createGraphqlClassType,
    createProject,
    deleteByComponentInfo,
    DeleteConfigVariableRequestV2,
    deleteConfigVariableV2,
    deleteFlowNode,
    deleteOpenApiGeneratedModules,
    deleteProject,
    DeleteProjectRequest,
    deleteType,
    DeleteTypeRequest,
    DeploymentRequest,
    WorkspaceDeploymentRequest,
    deployProject,
    deployWorkspace,
    EndOfFileRequest,
    ExpressionCompletionsRequest,
    ExpressionDiagnosticsRequest,
    ExpressionTokensRequest,
    FormDiagnosticsRequest,
    formDidClose,
    FormDidCloseParams,
    formDidOpen,
    FormDidOpenParams,
    formDirtyDidChange,
    FormDirtyDidChangeParams,
    FunctionNodeRequest,
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
    GetConfigVariableNodeTemplateRequest,
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
    getAllData,
    getFunctionNames,
    getFunctionNode,
    getModuleNodes,
    getNodeTemplate,
    getOpenApiGeneratedModules,
    getProjectComponents,
    getProjectStructure,
    getReadmeContent,
    getRecordConfig,
    GetRecordConfigRequest,
    getRecordModelFromSource,
    GetRecordModelFromSourceRequest,
    getRecordNames,
    getRecordSource,
    getServiceClassModel,
    getSignatureHelp,
    getSimpleTypeOfExpression,
    GetSimpleTypeOfExpressionRequest,
    getSourceCode,
    getType,
    getTypeFromJson,
    GetTypeRequest,
    getTypes,
    GetTypesRequest,
    getVisibleTypes,
    getVisibleVariableTypes,
    getWorkspaces,
    handleReadmeContent,
    JsonToTypeRequest,
    ModelFromCodeRequest,
    openAIChat,
    OpenAPIClientDeleteRequest,
    startInlineAgentChat,
    cleanupAgentChatServices,
    OpenAPIClientGenerationRequest,
    OpenAPIGeneratedModulesRequest,
    openConfigToml,
    OpenConfigTomlRequest,
    openReadme,
    OpenReadmeRequest,
    ProjectRequest,
    ReadmeContentRequest,
    RecordSourceGenRequest,
    removeBreakpointFromSource,
    renameIdentifier,
    RenameIdentifierRequest,
    runProject,
    search,
    searchNodes,
    ServiceClassSourceRequest,
    SignatureHelpRequest,
    updateClassField,
    UpdateConfigVariableRequestV2,
    updateConfigVariablesV2,
    updateImports,
    UpdateImportsRequest,
    updateRecordConfig,
    UpdateRecordConfigRequest,
    updateServiceClass,
    updateType,
    UpdateTypeRequest,
    updateTypes,
    UpdateTypesRequest,
    verifyTypeDelete,
    VerifyTypeDeleteRequest,
    VisibleTypesRequest,
    ValidateProjectFormRequest,
    validateProjectPath,
    getSuggestedProjectDefaults,
    UpdateProjectTitleRequest,
    UpdatePackageTitleRequest,
    updateProjectTitle,
    updatePackageTitle
} from "@wso2/ballerina-core";
import { Messenger } from "vscode-messenger";
import { BiDiagramRpcManager } from "./rpc-manager";

export function registerBiDiagramRpcHandlers(messenger: Messenger) {
    const rpcManger = new BiDiagramRpcManager();
    messenger.onRequest(getFlowModel, (args: BIFlowModelRequest) => rpcManger.getFlowModel(args));
    messenger.onRequest(getSourceCode, (args: BISourceCodeRequest) => rpcManger.getSourceCode(args));
    messenger.onRequest(deleteFlowNode, (args: BISourceCodeRequest) => rpcManger.deleteFlowNode(args));
    messenger.onRequest(deleteByComponentInfo, (args: BIDeleteByComponentInfoRequest) => rpcManger.deleteByComponentInfo(args));
    messenger.onRequest(getAvailableNodes, (args: BIAvailableNodesRequest) => rpcManger.getAvailableNodes(args));
    messenger.onRequest(getAvailableAgents, (args: BIAvailableNodesRequest) => rpcManger.getAvailableAgents(args));
    messenger.onRequest(getAvailableModelProviders, (args: BIAvailableNodesRequest) => rpcManger.getAvailableModelProviders(args));
    messenger.onRequest(getAvailableVectorStores, (args: BIAvailableNodesRequest) => rpcManger.getAvailableVectorStores(args));
    messenger.onRequest(getAvailableEmbeddingProviders, (args: BIAvailableNodesRequest) => rpcManger.getAvailableEmbeddingProviders(args));
    messenger.onRequest(getAvailableVectorKnowledgeBases, (args: BIAvailableNodesRequest) => rpcManger.getAvailableVectorKnowledgeBases(args));
    messenger.onRequest(getAvailableDataLoaders, (args: BIAvailableNodesRequest) => rpcManger.getAvailableDataLoaders(args));
    messenger.onRequest(getAvailableChunkers, (args: BIAvailableNodesRequest) => rpcManger.getAvailableChunkers(args));
    messenger.onRequest(getEnclosedFunction, (args: BIGetEnclosedFunctionRequest) => rpcManger.getEnclosedFunction(args));
    messenger.onRequest(getNodeTemplate, (args: BINodeTemplateRequest) => rpcManger.getNodeTemplate(args));
    messenger.onRequest(getAiSuggestions, (args: BIAiSuggestionsRequest) => rpcManger.getAiSuggestions(args));
    messenger.onNotification(createProject, (args: ProjectRequest) => rpcManger.createProject(args));
    messenger.onRequest(validateProjectPath, (args: ValidateProjectFormRequest) => rpcManger.validateProjectPath(args));
    messenger.onNotification(deleteProject, (args: DeleteProjectRequest) => rpcManger.deleteProject(args));
    messenger.onNotification(addProjectToWorkspace, (args: AddProjectToWorkspaceRequest) => rpcManger.addProjectToWorkspace(args));
    messenger.onRequest(getWorkspaces, () => rpcManger.getWorkspaces());
    messenger.onRequest(getProjectStructure, () => rpcManger.getProjectStructure());
    messenger.onRequest(getProjectComponents, () => rpcManger.getProjectComponents());
    messenger.onRequest(createComponent, (args: ComponentRequest) => rpcManger.createComponent(args));
    messenger.onRequest(handleReadmeContent, (args: ReadmeContentRequest) => rpcManger.handleReadmeContent(args));
    messenger.onRequest(getVisibleVariableTypes, (args: BIGetVisibleVariableTypesRequest) => rpcManger.getVisibleVariableTypes(args));
    messenger.onRequest(getExpressionCompletions, (args: ExpressionCompletionsRequest) => rpcManger.getExpressionCompletions(args));
    messenger.onRequest(getDataMapperCompletions, (args: ExpressionCompletionsRequest) => rpcManger.getDataMapperCompletions(args));
    messenger.onRequest(getConfigVariablesV2, (args: ConfigVariableRequest) => rpcManger.getConfigVariablesV2(args));
    messenger.onRequest(updateConfigVariablesV2, (args: UpdateConfigVariableRequestV2) => rpcManger.updateConfigVariablesV2(args));
    messenger.onRequest(deleteConfigVariableV2, (args: DeleteConfigVariableRequestV2) => rpcManger.deleteConfigVariableV2(args));
    messenger.onRequest(getConfigVariableNodeTemplate, (args: GetConfigVariableNodeTemplateRequest) => rpcManger.getConfigVariableNodeTemplate(args));
    messenger.onRequest(openConfigToml, (args: OpenConfigTomlRequest) => rpcManger.openConfigToml(args));
    messenger.onRequest(getModuleNodes, () => rpcManger.getModuleNodes());
    messenger.onRequest(getReadmeContent, (args: ReadmeContentRequest) => rpcManger.getReadmeContent(args));
    messenger.onNotification(openReadme, (args: OpenReadmeRequest) => rpcManger.openReadme(args));
    messenger.onRequest(renameIdentifier, (args: RenameIdentifierRequest) => rpcManger.renameIdentifier(args));
    messenger.onRequest(deployProject, (args: DeploymentRequest) => rpcManger.deployProject(args));
    messenger.onRequest(deployWorkspace, (args: WorkspaceDeploymentRequest) => rpcManger.deployWorkspace(args));
    messenger.onNotification(openAIChat, (args: AIChatRequest) => rpcManger.openAIChat(args));
    messenger.onNotification(startInlineAgentChat, (args: InlineAgentChatRequest) => rpcManger.startInlineAgentChat(args));
    messenger.onRequest(cleanupAgentChatServices, () => rpcManger.cleanupAgentChatServices());
    messenger.onRequest(getSignatureHelp, (args: SignatureHelpRequest) => rpcManger.getSignatureHelp(args));
    messenger.onNotification(buildProject, (args: BuildMode) => rpcManger.buildProject(args));
    messenger.onNotification(runProject, () => rpcManger.runProject());
    messenger.onRequest(getVisibleTypes, (args: VisibleTypesRequest) => rpcManger.getVisibleTypes(args));
    messenger.onNotification(addBreakpointToSource, (args: BreakpointRequest) => rpcManger.addBreakpointToSource(args));
    messenger.onNotification(removeBreakpointFromSource, (args: BreakpointRequest) => rpcManger.removeBreakpointFromSource(args));
    messenger.onRequest(getBreakpointInfo, () => rpcManger.getBreakpointInfo());
    messenger.onRequest(getFormDiagnostics, (args: FormDiagnosticsRequest) => rpcManger.getFormDiagnostics(args));
    messenger.onRequest(getExpressionDiagnostics, (args: ExpressionDiagnosticsRequest) => rpcManger.getExpressionDiagnostics(args));
    messenger.onRequest(getExpressionTokens, (args: ExpressionTokensRequest) => rpcManger.getExpressionTokens(args));
    messenger.onNotification(formDidOpen, (args: FormDidOpenParams) => rpcManger.formDidOpen(args));
    messenger.onNotification(formDidClose, (args: FormDidCloseParams) => rpcManger.formDidClose(args));
    messenger.onNotification(formDirtyDidChange, (args: FormDirtyDidChangeParams) => rpcManger.formDirtyDidChange(args));
    messenger.onRequest(getDesignModel, (args: BIDesignModelRequest) => rpcManger.getDesignModel(args));
    messenger.onRequest(getTypes, (args: GetTypesRequest) => rpcManger.getTypes(args));
    messenger.onRequest(getType, (args: GetTypeRequest) => rpcManger.getType(args));
    messenger.onRequest(getSimpleTypeOfExpression, (args: GetSimpleTypeOfExpressionRequest) => rpcManger.getSimpleTypeOfExpression(args));
    messenger.onRequest(updateType, (args: UpdateTypeRequest) => rpcManger.updateType(args));
    messenger.onRequest(updateTypes, (args: UpdateTypesRequest) => rpcManger.updateTypes(args));
    messenger.onRequest(deleteType, (args: DeleteTypeRequest) => rpcManger.deleteType(args));
    messenger.onRequest(verifyTypeDelete, (args: VerifyTypeDeleteRequest) => rpcManger.verifyTypeDelete(args));
    messenger.onRequest(getTypeFromJson, (args: JsonToTypeRequest) => rpcManger.getTypeFromJson(args));
    messenger.onRequest(getServiceClassModel, (args: ModelFromCodeRequest) => rpcManger.getServiceClassModel(args));
    messenger.onRequest(updateClassField, (args: ClassFieldModifierRequest) => rpcManger.updateClassField(args));
    messenger.onRequest(addClassField, (args: AddFieldRequest) => rpcManger.addClassField(args));
    messenger.onRequest(addClassInitParameter, (args: AddInitParameterRequest) => rpcManger.addClassInitParameter(args));
    messenger.onRequest(getClassOwnedNodes, (args: ClassOwnedNodeRequest) => rpcManger.getClassOwnedNodes(args));
    messenger.onRequest(upsertClassOwnedNode, (args: ClassOwnedNodeSourceRequest) => rpcManger.upsertClassOwnedNode(args));
    messenger.onRequest(removeClassOwnedNode, (args: ClassOwnedNodeDeleteRequest) => rpcManger.removeClassOwnedNode(args));
    messenger.onRequest(updateClassInitParameter, (args: ClassInitParameterModifierRequest) => rpcManger.updateClassInitParameter(args));
    messenger.onRequest(removeClassInitParameter, (args: ClassInitParameterModifierRequest) => rpcManger.removeClassInitParameter(args));
    messenger.onRequest(updateServiceClass, (args: ServiceClassSourceRequest) => rpcManger.updateServiceClass(args));
    messenger.onRequest(createGraphqlClassType, (args: UpdateTypeRequest) => rpcManger.createGraphqlClassType(args));
    messenger.onRequest(getRecordConfig, (args: GetRecordConfigRequest) => rpcManger.getRecordConfig(args));
    messenger.onRequest(updateRecordConfig, (args: UpdateRecordConfigRequest) => rpcManger.updateRecordConfig(args));
    messenger.onRequest(getRecordModelFromSource, (args: GetRecordModelFromSourceRequest) => rpcManger.getRecordModelFromSource(args));
    messenger.onRequest(getRecordSource, (args: RecordSourceGenRequest) => rpcManger.getRecordSource(args));
    messenger.onRequest(updateImports, (args: UpdateImportsRequest) => rpcManger.updateImports(args));
    messenger.onRequest(addFunction, (args: AddFunctionRequest) => rpcManger.addFunction(args));
    messenger.onRequest(getFunctionNode, (args: FunctionNodeRequest) => rpcManger.getFunctionNode(args));
    messenger.onRequest(getEndOfFile, (args: EndOfFileRequest) => rpcManger.getEndOfFile(args));
    messenger.onRequest(search, (args: BISearchRequest) => rpcManger.search(args));
    messenger.onRequest(getAllData, (args: WorkflowDataRequest) => rpcManger.getAllData(args));
    messenger.onRequest(searchNodes, (args: BISearchNodesRequest) => rpcManger.searchNodes(args));
    messenger.onRequest(getRecordNames, () => rpcManger.getRecordNames());
    messenger.onRequest(getFunctionNames, () => rpcManger.getFunctionNames());
    messenger.onRequest(getDevantMetadata, () => rpcManger.getDevantMetadata());
    messenger.onRequest(getWorkspaceDevantMetadata, () => rpcManger.getWorkspaceDevantMetadata());
    messenger.onRequest(generateOpenApiClient, (args: OpenAPIClientGenerationRequest) => rpcManger.generateOpenApiClient(args));
    messenger.onRequest(getOpenApiGeneratedModules, (args: OpenAPIGeneratedModulesRequest) => rpcManger.getOpenApiGeneratedModules(args));
    messenger.onRequest(deleteOpenApiGeneratedModules, (args: OpenAPIClientDeleteRequest) => rpcManger.deleteOpenApiGeneratedModules(args));
    messenger.onRequest(updateProjectTitle, (args: UpdateProjectTitleRequest) => rpcManger.updateProjectTitle(args));
    messenger.onRequest(updatePackageTitle, (args: UpdatePackageTitleRequest) => rpcManger.updatePackageTitle(args));
    messenger.onRequest(getSuggestedProjectDefaults, (args: { isInProject: boolean }) => rpcManger.getSuggestedProjectDefaults(args));
}
