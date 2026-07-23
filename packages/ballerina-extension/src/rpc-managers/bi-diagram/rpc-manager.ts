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
    ClassMembersResponse,
    CreateClassDependencyRequest,
    DeleteClassMemberRequest,
    ClassMemberRequest,
    SaveClassMemberRequest,
    ModifyClassDependencyRequest,
    InlineAgentChatRequest,
    AddFunctionRequest,
    AddImportItemResponse,
    AddProjectToWorkspaceRequest,
    ArtifactData,
    BIAiSuggestionsRequest,
    BIAiSuggestionsResponse,
    BIAvailableNodesRequest,
    BIAvailableNodesResponse,
    BICopilotContextRequest,
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
    BIModuleNodesRequest,
    BIModuleNodesResponse,
    BINodeTemplateRequest,
    BINodeTemplateResponse,
    BISearchNodesRequest,
    BISearchNodesResponse,
    BISearchRequest,
    BISearchResponse,
    WorkflowDataRequest,
    WorkflowDataResponse,
    BISourceCodeRequest,
    BISourceCodeResponse,
    BISuggestedFlowModelRequest,
    BI_COMMANDS,
    BallerinaProject,
    BreakpointRequest,
    BuildMode,
    ClassFieldModifierRequest,
    ComponentRequest,
    ConfigVariableRequest,
    ConfigVariableResponse,
    CreateComponentResponse,
    CurrentBreakpointsResponse,
    DIRECTORY_MAP,
    DeleteConfigVariableRequestV2,
    DeleteConfigVariableResponseV2,
    DeleteProjectRequest,
    DeleteTypeRequest,
    DeleteTypeResponse,
    ValidateProjectFormRequest,
    ValidateProjectFormResponse,
    DeploymentRequest,
    WorkspaceDeploymentRequest,
    DeploymentResponse,
    DevantMetadata,
    WorkspaceDevantMetadata,
    ProjectDevantMetadata,
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
    LoginMethod,
    ModelFromCodeRequest,
    NodeKind,
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
    RenameRequest,
    SCOPE,
    ServiceClassModelResponse,
    ServiceClassSourceRequest,
    SignatureHelpRequest,
    SignatureHelpResponse,
    SourceEditResponse,
    TextEdit,
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
    VerifyTypeDeleteRequest,
    VerifyTypeDeleteResponse,
    VisibleTypesRequest,
    VisibleTypesResponse,
    WorkspaceFolder,
    WorkspacesResponse,
    BIIntelSecrets,
    AvailableNode,
    Item,
    Category,
    NodePosition,
    PackageTomlValues,
    EVENT_TYPE,
    UpdateProjectTitleRequest,
    UpdatePackageTitleRequest,
    SuggestedProjectDefaultsResponse,
    ProjectInfo,
    PROJECT_KIND,
    MACHINE_VIEW,
    isSamePath,
    isPathInside
} from "@wso2/ballerina-core";
import * as fs from "fs";
import * as path from 'path';
import * as vscode from "vscode";
import {
    WICommandIds,
    IWso2PlatformExtensionAPI,
    ICreateNewIntegrationCmdParams,
    ICreateNewIntegrationCmdIntegrations,
    resolveIntegrationType,
    AUTOMATION_WITH_LISTENER_WARNING,
} from "@wso2/wso2-platform-core";
import {
    ShellExecution,
    Task,
    TaskDefinition,
    Uri, ViewColumn, commands,
    extensions,
    tasks,
    window, workspace
} from "vscode";
import { DebugProtocol } from "vscode-debugprotocol";
import { extension } from "../../BalExtensionContext";
import { OLD_BACKEND_URL } from "../../features/ai/utils";
import { fetchWithAuth } from "../../features/ai/utils/ai-client";
import { getCurrentBIProject } from "../../features/config-generator/configGenerator";
import { BreakpointManager } from "../../features/debugger/breakpoint-manager";
import { StateMachine, updateView } from "../../stateMachine";
import { getAccessToken, getLoginMethod } from "../../utils/ai/auth";
import { getCompleteSuggestions } from '../../utils/ai/completions';
import {
    addProjectToExistingWorkspace,
    convertProjectToWorkspace,
    createBIAutomation,
    createBIFunction,
    createBIProjectPure,
    createBIWorkspaceWithProject,
    createEmptyBIWorkspace,
    deleteProjectFromWorkspace,
    openInVSCode,
    validateProjectPath,
    getSuggestedProjectDefaults
} from "../../utils/bi";
import { writeBallerinaFileDidOpen, writeBallerinaFileDidOpenTemp } from "../../utils/modification";
import { updateSourceCode } from "../../utils/source-utils";
import { getView } from "../../utils/state-machine-utils";
import { isLibraryProject } from "../../utils/config";
import { PlatformExtRpcManager } from "../platform-ext/rpc-manager";
import { openAIPanelWithPrompt } from "../../views/ai-panel/aiMachine";
import { getCurrentBallerinaProject, getCurrentProjectRoot } from "../../utils/project-utils";
import { CommonRpcManager } from "../common/rpc-manager";
import * as toml from "@iarna/toml";
import { readOrWriteReadmeContent } from "./utils";
import { registerFormOpen, registerFormClose, setFormDirtyState } from "./form-state";
import { chatStateStorage } from "../../views/ai-panel/chatStateStorage";
import { getRepoRoot } from "../platform-ext/platform-utils";
import { WI_EXTENSION_ID } from "../../utils";
import { notifyOnIdentifierUpdated } from "../../RPCLayer";
import { openView } from "../../stateMachine";

function ensureGitignoreEntry(projectRoot: string): void {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const entry = '_agent_chat.bal';

    try {
        let content = '';
        if (fs.existsSync(gitignorePath)) {
            content = fs.readFileSync(gitignorePath, 'utf8');
        }
        if (!content.split('\n').some(line => line.trim() === entry)) {
            const newline = content.endsWith('\n') || content === '' ? '' : '\n';
            fs.appendFileSync(gitignorePath, `${newline}${entry}\n`);
        }
    } catch (e) {
        console.warn('[agent-chat] Failed to update .gitignore:', e);
    }
}

/**
 * Reads a Ballerina.toml file, sets `doc[section][field] = value`, and writes it back.
 * Throws if the file is missing or unparseable.
 */
function setTomlSectionField(filePath: string, section: string, field: string, value: string): void {
    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    } catch {
        throw new Error(`Ballerina.toml not found at ${filePath}`);
    }
    let doc: ReturnType<typeof toml.parse>;
    try {
        doc = toml.parse(content);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`Invalid TOML in ${filePath}: ${message}`);
    }
    const sectionObj = doc[section];
    if (sectionObj !== null && typeof sectionObj === "object" && !Array.isArray(sectionObj)) {
        (sectionObj as Record<string, unknown>)[field] = value;
    } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (doc as any)[section] = { [field]: value };
    }
    fs.writeFileSync(filePath, toml.stringify(doc), "utf-8");
}

export class BiDiagramRpcManager implements BIDiagramAPI {
    OpenConfigTomlRequest: (params: OpenConfigTomlRequest) => Promise<void>;

    private convertAiToFileScheme(uri: string): string {
        if (uri.startsWith('ai://')) {
            const fileUri = Uri.parse(uri).with({ scheme: 'file' }).toString();
            return fileUri;
        }
        return uri;
    }


    async getFlowModel(params: BIFlowModelRequest): Promise<BIFlowModelResponse> {
        console.log(">>> requesting bi flow model from ls", params);
        return new Promise((resolve) => {
            let request: BIFlowModelRequest;

            // If params has all required fields, use them directly
            if (params?.filePath && params?.startLine && params?.endLine) {
                console.log(">>> using params to create request");
                let filePath = params.filePath;
                // When useFileSchema is set, use file:// scheme to show original content
                if (params.useFileSchema) {
                    filePath = this.convertAiToFileScheme(filePath);
                }
                request = {
                    filePath,
                    startLine: params.startLine,
                    endLine: params.endLine,
                    forceAssign: params.forceAssign ?? true,
                };
            } else {
                // Fall back to context if params are not complete
                console.log(">>> params incomplete, falling back to context");
                const context = StateMachine.context();

                if (!context.position) {
                    // TODO: check why this hits when we are in review mode
                    console.log(">>> position not found in context, cannot create request");
                    resolve(undefined);
                    return;
                }

                request = {
                    filePath: params?.filePath || context.documentUri,
                    startLine: params?.startLine || {
                        line: context.position.startLine ?? 0,
                        offset: context.position.startColumn ?? 0,
                    },
                    endLine: params?.endLine || {
                        line: context.position.endLine ?? 0,
                        offset: context.position.endColumn ?? 0,
                    },
                    forceAssign: params?.forceAssign ?? true,
                };
            }

            console.log(">>> final request:", request);

            StateMachine.langClient()
                .getFlowModel(request)
                .then((model) => {
                    console.log(">>> bi flow model received from ls");
                    resolve(model);
                })
                .catch((error) => {
                    console.log(">>> error fetching bi flow model from ls", error);
                    resolve(undefined);
                });
        });
    }

    async getSourceCode(params: BISourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        console.log(">>> requesting bi source code from ls", params);
        try {
            this.ensureTargetFileExists(params.filePath);
            const model = await StateMachine.langClient().getSourceCode(params) as BISourceCodeResponse;
            console.log(">>> bi source code from ls", model);

            if (model?.errorMsg) {
                const errorMessage = model.errorMsg;
                console.error(">>> error generating source code from ls", { errorMessage, stacktrace: model.stacktrace });
                window.showErrorMessage(`Failed to save changes: ${errorMessage}`);
                return { artifacts: [], error: errorMessage };
            }

            if (!model?.textEdits) {
                const errorMessage = "Failed to save changes: language server returned an empty source update.";
                console.error(">>> invalid source code response from ls", model);
                window.showErrorMessage(errorMessage);
                return { artifacts: [], error: errorMessage };
            }

            if (params?.isConnector) {
                const artifacts = await updateSourceCode({ textEdits: model.textEdits, description: this.getSourceDescription(params) });
                return { artifacts };
            }

            const nodeKind = params.flowNode.codedata.node;
            const artifactData = params.artifactData || this.getArtifactDataFromNodeKind(nodeKind);
            const artifacts = await updateSourceCode(
                { textEdits: model.textEdits, artifactData, description: this.getSourceDescription(params) },
                params.isHelperPaneChange
            );
            return { artifacts };
        } catch (error) {
            console.log(">>> error fetching source code from ls", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            window.showErrorMessage(`Failed to save changes: ${errorMessage}`);
            return { artifacts: [], error: errorMessage };
        }
    }

    private ensureTargetFileExists(filePath: string) {
        if (!filePath || !filePath.endsWith(".bal") || fs.existsSync(filePath)) {
            return;
        }
        if (!fs.existsSync(path.dirname(filePath))) {
            return;
        }
        writeBallerinaFileDidOpenTemp(filePath, "");
    }

    private capitalizeFirstLetter(name: string): string {
        return name
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/^\w/, c => c.toUpperCase());
    }

    private getSourceDescription(params: BISourceCodeRequest): string {
        let artifactType = this.capitalizeFirstLetter(params.flowNode.codedata.node);
        if (params.isConnector) {
            artifactType = `${this.capitalizeFirstLetter(params.flowNode.codedata.module)} Connection`;
        }
        const action = params.flowNode.codedata.isNew ? 'Creation' : 'Update';
        const identifier = params.flowNode?.properties?.variable?.value;
        return `${artifactType} ${action}${identifier ? ` - ${identifier}` : ''}`;
    }

    private getArtifactDataFromNodeKind(nodeKind: NodeKind): ArtifactData {
        switch (nodeKind) {
            case 'FUNCTION':
                return { artifactType: DIRECTORY_MAP.FUNCTION };
            case 'FUNCTION_DEFINITION':
                return { artifactType: DIRECTORY_MAP.FUNCTION };
            case 'AUTOMATION':
                return { artifactType: DIRECTORY_MAP.AUTOMATION };
            case 'DATA_MAPPER_DEFINITION':
                return { artifactType: DIRECTORY_MAP.DATA_MAPPER };
            case 'NP_FUNCTION_DEFINITION':
                return { artifactType: DIRECTORY_MAP.NP_FUNCTION };
            case 'WORKFLOW':
                return { artifactType: DIRECTORY_MAP.WORKFLOW };
            case 'ACTIVITY':
                return { artifactType: DIRECTORY_MAP.ACTIVITY };
            // Add other cases as needed
            default:
                return undefined;
        }
    }

    async applyTextEdits(filePath: string, textEdits: TextEdit[]): Promise<void> {
        const workspaceEdit = new vscode.WorkspaceEdit();
        const fileUri = Uri.file(filePath);

        const dirPath = path.dirname(filePath);
        const dirUri = vscode.Uri.file(dirPath);

        try {
            await vscode.workspace.fs.createDirectory(dirUri);
            workspaceEdit.createFile(fileUri, { ignoreIfExists: true });
        } catch (error) {
            console.error("Error creating file or directory:", error);
        }

        for (const edit of textEdits) {
            const range = new vscode.Range(
                edit.range.start.line,
                edit.range.start.character,
                edit.range.end.line,
                edit.range.end.character
            );
            workspaceEdit.replace(fileUri, range, edit.newText);
            console.log(">>> edit");
            console.log(edit.newText);
            console.log(">>> end edit");
        }

        try {
            await workspace.applyEdit(workspaceEdit);

            // Notify language server about the changes
            const document = await workspace.openTextDocument(fileUri);

            console.log(">>> document");
            console.log(document.getText());
            console.log(">>> end document");

            await document.save();

            await StateMachine.langClient().didChange({
                textDocument: {
                    uri: fileUri.toString(),
                    version: document.version
                },
                contentChanges: [{
                    text: document.getText()
                }]
            });
        } catch (error) {
            console.error("Error applying text edits:", error);
            throw error;
        }
    }

    private filterAdvancedAiNodes(response: BIAvailableNodesResponse): BIAvailableNodesResponse {
        const showAdvancedAiNodes = extension.ballerinaExtInstance.getShowAdvancedAiNodes();
        if (showAdvancedAiNodes || !response) {
            return response;
        }

        // List of node types/labels to hide when advanced AI nodes are disabled
        const hiddenNodeTypes = [
            'CHUNKERS',
            'VECTOR_STORES',
            'EMBEDDING_PROVIDERS'
        ];

        const hiddenNodeLabels = [
            'Recursive Document Chunker',
            'Chunker',
            'Vector Store',
            'Embedding Provider'
        ];

        const filterItems = (items: Item[]): Item[] => {
            if (!items) { return items; }

            return items.filter(item => {
                if ((item as AvailableNode).codedata?.node && hiddenNodeTypes.includes((item as AvailableNode).codedata.node)) {
                    return false;
                }

                if (item.metadata?.label && hiddenNodeLabels.includes(item.metadata.label)) {
                    return false;
                }

                if ((item as Category).items) {
                    (item as Category).items = filterItems((item as Category).items);
                }

                return true;
            });
        };

        if (response.categories) {
            response.categories = response.categories.map(category => {
                if (category.items) {
                    category.items = filterItems(category.items);
                }
                return category;
            });
        }

        return response;
    }

    private updateNodeDescriptions(availableNodes: BIAvailableNodesResponse): BIAvailableNodesResponse {
        if (!availableNodes) {
            return availableNodes;
        }
        // Adding descriptions for AI nodes
        const updateItems = (items: Item[], isInAICategory: boolean): Item[] => {
            if (!items) { return items; }

            return items.map(item => {
                if ((item as AvailableNode).enabled === false && isInAICategory) {
                    item.metadata = {
                        ...item.metadata,
                        description: "Please update AI package version to latest version to use this feature"
                    };
                }

                // Recursively handle nested items
                if ((item as Category).items) {
                    (item as Category).items = updateItems((item as Category).items, isInAICategory);
                }

                return item;
            });
        };

        if (availableNodes.categories) {
            availableNodes.categories = availableNodes.categories.map(category => {
                const isAICategory = category.metadata?.label === "AI";
                if (category.items) {
                    category.items = updateItems(category.items, isAICategory);
                }
                return category;
            });
        }

        return availableNodes;
    }

    async getAvailableNodes(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        console.log(">>> requesting bi available nodes from ls", params);
        return new Promise((resolve) => {
            const fileNameOrPath = params.filePath;
            let filePath = fileNameOrPath;
            if (!path.isAbsolute(fileNameOrPath)) {
                filePath = path.join(StateMachine.context().projectPath, fileNameOrPath);
            }
            StateMachine.langClient()
                .getAvailableNodes({
                    position: params.position,
                    filePath,
                    queryMap: params.queryMap
                })
                .then((model) => {
                    console.log(">>> bi available nodes from ls", model);
                    const filteredModel = this.filterAdvancedAiNodes(model);
                    const updatedModel = this.updateNodeDescriptions(filteredModel);
                    resolve(updatedModel);
                })
                .catch((error) => {
                    console.log(">>> error fetching available nodes from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                });
        });
    }


    async getAvailableModelProviders(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        console.log(">>> requesting bi available model providers from ls", params);
        return new Promise((resolve) => {
            StateMachine.langClient()
                .getAvailableModelProviders(params)
                .then((model) => {
                    console.log(">>> bi available model providers from ls", model);
                    resolve(model);
                })
                .catch((error) => {
                    console.log(">>> error fetching available model providers from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                });
        });
    }

    async getAvailableVectorStores(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        console.log(">>> requesting bi available vector stores from ls", params);
        return new Promise((resolve) => {
            StateMachine.langClient()
                .getAvailableVectorStores(params)
                .then((model) => {
                    console.log(">>> bi available vector stores from ls", model);
                    resolve(model);
                })
                .catch((error) => {
                    console.log(">>> error fetching available vector stores from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                });
        });
    }

    async getAvailableEmbeddingProviders(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        console.log(">>> requesting bi available embedding providers from ls", params);
        return new Promise((resolve) => {
            StateMachine.langClient()
                .getAvailableEmbeddingProviders(params)
                .then((model) => {
                    console.log(">>> bi available embedding providers from ls", model);
                    resolve(model);
                })
                .catch((error) => {
                    console.log(">>> error fetching available embedding providers from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                });
        });
    }

    async getAvailableVectorKnowledgeBases(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        console.log(">>> requesting bi available knowledge bases from ls", params);
        return new Promise((resolve) => {
            StateMachine.langClient()
                .getAvailableVectorKnowledgeBases(params)
                .then((model) => {
                    console.log(">>> bi available knowledge bases from ls", model);
                    resolve(model);
                })
                .catch((error) => {
                    console.log(">>> error fetching available knowledge bases from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                });
        });
    }


    async getAvailableDataLoaders(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        console.log(">>> requesting bi available data loaders from ls", params);
        return new Promise((resolve) => {
            StateMachine.langClient()
                .getAvailableDataLoaders(params)
                .then((model) => {
                    console.log(">>> bi available data loaders from ls", model);
                    resolve(model);
                })
                .catch((error) => {
                    console.log(">>> error fetching available data loaders from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                });
        });
    }

    async getAvailableChunkers(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        console.log(">>> requesting bi available chunkers from ls", params);
        return new Promise((resolve) => {
            StateMachine.langClient()
                .getAvailableChunkers(params)
                .then((model) => {
                    console.log(">>> bi available chunkers from ls", model);
                    resolve(model);
                })
                .catch((error) => {
                    console.log(">>> error fetching available chunkers from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                });
        });
    }

    async getNodeTemplate(params: BINodeTemplateRequest): Promise<BINodeTemplateResponse> {
        console.log(">>> requesting bi node template from ls", params);
        params.forceAssign = true; // TODO: remove this
        const projectPath = StateMachine.context().projectPath;
        params.isLibrary = projectPath ? await isLibraryProject(projectPath) : false;

        // Check if the file exists
        if (!fs.existsSync(params.filePath)) {
            // Create the file if it does not exist
            fs.writeFileSync(params.filePath, "");
            console.log(`>>> Created file at ${params.filePath}`);
        }

        return new Promise((resolve) => {
            StateMachine.langClient()
                .getNodeTemplate(params)
                .then((model) => {
                    console.log(">>> bi node template from ls", model);
                    resolve(model);
                })
                .catch((error) => {
                    console.log(">>> error fetching node template from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                });
        });
    }

    async createProject(params: ProjectRequest): Promise<void> {
        if (params.createAsWorkspace) {
            if (params.projectName) {
                const workspaceRoot = await createBIWorkspaceWithProject(params);
                openInVSCode(workspaceRoot);
            } else {
                const workspaceRoot = await createEmptyBIWorkspace(params);
                openInVSCode(workspaceRoot);
            }
        } else {
            const projectRoot = await createBIProjectPure(params);
            openInVSCode(projectRoot);
        }
    }

    async validateProjectPath(params: ValidateProjectFormRequest): Promise<ValidateProjectFormResponse> {
        // When converting an integtatino/library to a project, the new directory is created as a sibling of the
        // current integration/library (i.e. under path.dirname(projectPath)), not inside the project itself.
        const basePath = params.createAsWorkspace
            ? path.dirname(StateMachine.context().projectPath)
            : params.projectPath;
        return validateProjectPath(basePath, params.projectName, params.createDirectory, params.createAsWorkspace);
    }

    async deleteProject(params: DeleteProjectRequest): Promise<void> {
        const projectInfo = StateMachine.context().projectInfo;
        const targetProject = projectInfo?.children.find((child) => isSamePath(child.projectPath, params.projectPath));
        const projectName = targetProject?.title || targetProject?.name;
        if (!projectName) {
            return;
        }
        // Confirm destructive action with user
        const response = await window.showWarningMessage(
            `Delete Integration '${projectName}'?`,
            {
                modal: true,
                detail: "This action cannot be undone. The integration will be permanently removed from the workspace."
            },
            { title: "Delete", isCloseAffordance: false },
            { title: "Cancel", isCloseAffordance: true }
        );

        if (response?.title !== "Delete") {
            return;
        }

        const projectPath = params.projectPath;
        const workspacePath = projectInfo?.projectPath;
        await deleteProjectFromWorkspace(workspacePath, projectPath);

        // Refresh project info to update UI with newly added project
        StateMachine.refreshProjectInfo();
    }

    async addProjectToWorkspace(params: AddProjectToWorkspaceRequest): Promise<void> {
        if (params.convertToWorkspace) {
            try {
                await convertProjectToWorkspace(params);
                // Refresh project info to update UI with newly added project
                StateMachine.refreshProjectInfo();
            } catch (error) {
                window.showErrorMessage("Error converting integration to project");
                console.error("Error converting integration to project:", error);
                return;
            }
        } else {
            try {
                await addProjectToExistingWorkspace(params);
                // Refresh project info to update UI with newly added project
                StateMachine.refreshProjectInfo();
            } catch (error) {
                window.showErrorMessage("Error adding integration to existing project");
                console.error("Error adding integration to existing project:", error);
            }
        }
    }

    async getWorkspaces(): Promise<WorkspacesResponse> {
        return new Promise(async (resolve) => {
            const workspaces = workspace.workspaceFolders;
            const response: WorkspaceFolder[] = (workspaces ?? []).map((space) => ({
                index: space.index,
                fsPath: space.uri.fsPath,
                name: space.name,
            }));
            resolve({ workspaces: response });
        });
    }

    async createComponent(params: ComponentRequest): Promise<CreateComponentResponse> {
        return new Promise(async (resolve) => {
            let res: CreateComponentResponse;
            switch (params.type) {
                case DIRECTORY_MAP.AUTOMATION:
                    res = await createBIAutomation(params);
                    break;
                case DIRECTORY_MAP.FUNCTION || DIRECTORY_MAP.DATA_MAPPER:
                    res = await createBIFunction(params);
                    break;
                default:
                    break;
            }
            resolve(res);
        });
    }

    async getProjectStructure(): Promise<ProjectStructureResponse> {
        return new Promise(async (resolve) => {
            const stateContext = StateMachine.context();
            resolve(stateContext.projectStructure);
        });
    }

    async getProjectComponents(): Promise<ProjectComponentsResponse> {
        return new Promise(async (resolve) => {
            const projectPath = StateMachine.context().projectPath;
            if (!projectPath) {
                resolve({ components: { packages: [] } });
                return;
            }
            const components = await StateMachine.langClient().getBallerinaProjectComponents({
                documentIdentifiers: [{ uri: Uri.file(projectPath).toString() }],
            });
            resolve({ components });
        });
    }

    async getAiSuggestions(params: BIAiSuggestionsRequest): Promise<BIAiSuggestionsResponse> {
        return new Promise(async (resolve) => {
            const { filePath, position, prompt } = params;

            const enableAiSuggestions = extension.ballerinaExtInstance.enableAiSuggestions();
            if (!enableAiSuggestions) {
                resolve(undefined);
                return;
            }
            // get copilot context form ls
            const copilotContextRequest: BICopilotContextRequest = {
                filePath: filePath,
                position: position.startLine,
            };
            console.log(">>> request get copilot context from ls", { request: copilotContextRequest });
            const copilotContext = await StateMachine.langClient().getCopilotContext(copilotContextRequest);
            console.log(">>> copilot context from ls", { response: copilotContext });

            //TODO: Refactor this logic
            let suggestedContent;
            try {
                if (prompt) {
                    let token: string;
                    const loginMethod = await getLoginMethod();
                    if (loginMethod === LoginMethod.BI_INTEL) {
                        const credentials = await getAccessToken();
                        const secrets = credentials.secrets as BIIntelSecrets;
                        token = secrets.accessToken;
                    }

                    if (!token) {
                        resolve(undefined);
                        return;
                    }
                    // get suggestions from ai
                    const requestBody = {
                        ...copilotContext,
                        prompt,
                        singleCompletion: false, // Remove setting and assign constant value since this is handled by the AI BE
                    };
                    const requestOptions = {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify(requestBody),
                    };
                    console.log(">>> request ai suggestion", { request: requestBody });
                    // generate new nodes
                    const response = await fetchWithAuth(OLD_BACKEND_URL + "/inline/generation", requestOptions);
                    if (!response.ok) {
                        console.log(">>> ai completion api call failed ", response.status);
                        console.log(">>> ai completion api call failed ", response);
                        return new Promise((resolve) => {
                            resolve(undefined);
                        });
                    }
                    const data = await response.json();
                    console.log(">>> ai suggestion", { response: data });
                    suggestedContent = (data as any).code;
                } else {
                    // get next suggestion
                    const copilot_token = await extension.context.secrets.get("GITHUB_COPILOT_TOKEN");
                    if (!copilot_token) {
                        resolve(undefined);
                        return;
                    } else {
                        const resp = await getCompleteSuggestions({
                            prefix: copilotContext.prefix,
                            suffix: copilotContext.suffix,
                        });
                        console.log(">>> ai suggestion from local", { response: resp });
                        suggestedContent = resp.completion;
                    }

                }
            } catch (error) {
                console.log(">>> error fetching ai suggestion", error);
                return new Promise((resolve) => {
                    resolve(undefined);
                });
            }
            if (!suggestedContent || suggestedContent.trim() === "") {
                console.log(">>> ai suggested content not found");
                return new Promise((resolve) => {
                    resolve(undefined);
                });
            }

            // get flow model from ls
            const context = StateMachine.context();
            if (!context.position) {
                console.log(">>> position not found in the context");
                return new Promise((resolve) => {
                    resolve(undefined);
                });
            }

            const request: BISuggestedFlowModelRequest = {
                filePath: context.documentUri,
                startLine: {
                    line: context.position.startLine ?? 0,
                    offset: context.position.startColumn ?? 0,
                },
                endLine: {
                    line: context.position.endLine ?? 0,
                    offset: context.position.endColumn ?? 0,
                },
                text: suggestedContent,
                position: position.startLine,
            };
            console.log(">>> request bi suggested flow model", request);

            StateMachine.langClient()
                .getSuggestedFlowModel(request)
                .then((model) => {
                    console.log(">>> bi suggested flow model from ls", model);
                    resolve({ flowModel: model.flowModel, suggestion: suggestedContent });
                })
                .catch((error) => {
                    console.log(">>> error fetching bi suggested flow model from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                });
        });
    }

    async deleteFlowNode(params: BISourceCodeRequest): Promise<UpdatedArtifactsResponse> {
        console.log(">>> requesting bi delete node from ls", params);

        return new Promise((resolve) => {
            StateMachine.langClient()
                .deleteFlowNode(params)
                .then(async (model) => {
                    console.log(">>> bi delete node from ls", model);
                    const artifacts = await updateSourceCode({ textEdits: model.textEdits, description: 'Flow Node Deletion - ' + params.flowNode.metadata.label, skipPayloadCheck: true });
                    resolve({ artifacts });
                })
                .catch((error) => {
                    console.log(">>> error fetching delete node from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                });
        });
    }

    async handleReadmeContent(params: ReadmeContentRequest): Promise<ReadmeContentResponse> {
        return readOrWriteReadmeContent(params);
    }

    async getExpressionCompletions(params: ExpressionCompletionsRequest): Promise<ExpressionCompletionsResponse> {
        return new Promise((resolve, reject) => {
            if (!params.filePath) {
                params.filePath = StateMachine.context().documentUri;
            }
            StateMachine.langClient()
                .getExpressionCompletions(params)
                .then((completions) => {
                    resolve(completions);
                })
                .catch((error) => {
                    reject("Error fetching expression completions from ls");
                });
        });
    }

    async getDataMapperCompletions(params: ExpressionCompletionsRequest): Promise<ExpressionCompletionsResponse> {
        return new Promise((resolve, reject) => {
            StateMachine.langClient()
                .getDataMapperCompletions(params)
                .then((completions) => {
                    resolve(completions);
                })
                .catch((error) => {
                    reject("Error fetching data mapper completions from ls");
                });
        });
    }

    async getConfigVariablesV2(params: ConfigVariableRequest): Promise<ConfigVariableResponse> {
        return new Promise(async (resolve) => {
            const projectPath = StateMachine.context().projectPath;
            const showLibraryConfigVariables = extension.ballerinaExtInstance.showLibraryConfigVariables();

            // if params includeLibraries is not set, then use settings
            const includeLibraries = params?.includeLibraries !== undefined
                ? params.includeLibraries
                : showLibraryConfigVariables !== false;

            const variables = await StateMachine.langClient().getConfigVariablesV2({
                projectPath: projectPath,
                includeLibraries
            }) as ConfigVariableResponse;
            resolve(variables);
        });
    }

    async updateConfigVariablesV2(params: UpdateConfigVariableRequestV2): Promise<UpdateConfigVariableResponseV2> {
        return new Promise(async (resolve) => {
            const req: UpdateConfigVariableRequestV2 = params;
            if (!fs.existsSync(params.configFilePath)) {
                // Create config.bal if it doesn't exist
                writeBallerinaFileDidOpen(params.configFilePath, "\n");
            }
            const response = await StateMachine.langClient().updateConfigVariablesV2(req) as UpdateConfigVariableResponseV2;
            await updateSourceCode({ textEdits: response.textEdits, artifactData: { artifactType: DIRECTORY_MAP.CONFIGURABLE }, description: 'Config Variable Update' });
            resolve(response);
        });
    }

    async deleteConfigVariableV2(params: DeleteConfigVariableRequestV2): Promise<DeleteConfigVariableResponseV2> {
        return new Promise(async (resolve) => {
            const req: DeleteConfigVariableRequestV2 = params;
            if (!fs.existsSync(params.configFilePath)) {
                // Create config.bal if it doesn't exist
                writeBallerinaFileDidOpen(params.configFilePath, "\n");
            }
            const response = await StateMachine.langClient().deleteConfigVariableV2(req) as DeleteConfigVariableResponseV2;
            await updateSourceCode({ textEdits: response.textEdits, artifactData: { artifactType: DIRECTORY_MAP.CONFIGURABLE }, description: 'Config Variable Deletion' });
            resolve(response);
        });
    }

    async getConfigVariableNodeTemplate(params: GetConfigVariableNodeTemplateRequest): Promise<BINodeTemplateResponse> {
        return new Promise((resolve) => {
            StateMachine.langClient()
                .getConfigVariableNodeTemplate(params)
                .then((model) => {
                    console.log(">>> bi node template from ls", model);
                    resolve(model);
                })
                .catch((error) => {
                    console.log(">>> error fetching node template from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                });
        });
    }


    // Function to open Config.toml
    async openConfigToml(params: OpenConfigTomlRequest): Promise<void> {
        return new Promise(async (resolve) => {
            console.log(">>> opening Config.toml at", params.filePath);
            const currentProject: BallerinaProject | undefined = await getCurrentBallerinaProject(params.filePath);

            const configFilePath = path.join(params.filePath, "Config.toml");
            const ignoreFile = path.join(params.filePath, ".gitignore");
            const docLink = "https://ballerina.io/learn/provide-values-to-configurable-variables/#provide-via-toml-syntax";
            const uri = Uri.file(configFilePath);

            if (!fs.existsSync(configFilePath)) {
                const updatedContent = `
# Configuration file for "${currentProject.packageName}"
# 
# This file contains configuration values for configurable variables in your Ballerina code.
# Both package-specific and imported module configurations are included below.
# 
# Learn more about configurable variables:
# ${docLink}
#
# Note: This file is automatically added to .gitignore to protect sensitive information.
`;
                // Create and write content to the config file
                fs.writeFile(configFilePath, updatedContent, (error) => {
                    if (error) {
                        window.showErrorMessage('Unable to create the Config.toml file: ' + error);
                        return;
                    }
                });

                if (fs.existsSync(ignoreFile)) {
                    const ignoreUri = Uri.file(ignoreFile);
                    let ignoreContent: string = fs.readFileSync(ignoreUri.fsPath, 'utf8');
                    if (!ignoreContent.includes("Config.toml")) {
                        ignoreContent += `\n${"Config.toml"}\n`;
                        fs.writeFile(ignoreUri.fsPath, ignoreContent, function (error) {
                            if (error) {
                                return window.showErrorMessage('Unable to update the .gitIgnore file: ' + error);
                            }
                            window.showInformationMessage('Successfully updated the .gitIgnore file.');
                        });
                    }
                }
            }

            await workspace.openTextDocument(uri).then(async document => {
                window.showTextDocument(document, { preview: false });
            });
            resolve();
        });

    }

    async getReadmeContent(params: ReadmeContentRequest): Promise<ReadmeContentResponse> {
        return new Promise((resolve) => {
            const projectPath = params.projectPath;
            const readmePath = path.join(projectPath, "README.md");

            if (!fs.existsSync(readmePath)) {
                resolve({ content: "" });
                return;
            }

            fs.readFile(readmePath, "utf8", (err, data) => {
                if (err) {
                    console.error("Error reading README.md:", err);
                    resolve({ content: "" });
                } else {
                    resolve({ content: data });
                }
            });
        });
    }

    openReadme(params: OpenReadmeRequest): void {
        const projectRoot = params.projectPath;
        const readmePath = path.join(projectRoot, "README.md");

        if (!fs.existsSync(readmePath)) {
            // Create README.md if it doesn't exist

            const projectInfo = StateMachine.context().projectInfo;
            let content = "";

            if (params.isWorkspaceReadme) {
                const workspaceName = projectInfo?.title || projectInfo?.name;
                content = `# ${workspaceName} Project\n\nAdd your project description here.`;
            } else {
                const project = projectInfo?.children && projectInfo?.children.length > 0
                    ? projectInfo?.children.find((child) => isSamePath(child.projectPath, params.projectPath))
                    : projectInfo;
                const projectName = project?.title || project?.name;
                const isLibrary = StateMachine.context().projectStructure?.projects?.find(
                    p => isSamePath(p.projectPath, params.projectPath)
                )?.isLibrary ?? false;
                const kind = isLibrary ? "Library" : "Integration";
                content = `# ${projectName} ${kind}\n\nAdd your ${kind.toLowerCase()} description here.`;
            }

            fs.writeFileSync(readmePath, content);
        }

        // Open README.md in the editor
        workspace.openTextDocument(readmePath).then((doc) => {
            window.showTextDocument(doc, ViewColumn.Beside);
        });
    }

    async deployProject(params: DeploymentRequest): Promise<DeploymentResponse> {
        const scopes = params.integrationTypes;

        const componentPath = StateMachine.context().projectPath;
        const projectInfo = StateMachine.context().projectInfo;

        let componentInfo: ProjectInfo;
        if (isSamePath(projectInfo?.projectPath, componentPath)) {
            componentInfo = projectInfo;
        } else {
            componentInfo = projectInfo?.children?.find(child => isSamePath(child.projectPath, componentPath));
        }

        const integrationType = await this.selectIntegrationType(scopes);

        if (!integrationType) {
            return { isCompleted: true };
        }

        const deploymentParams: ICreateNewIntegrationCmdParams = {
            buildPackLang: "ballerina",
            integrations: [{
                fsPath: StateMachine.context().projectPath,
                supportedIntegrationTypes: [integrationType],
                name: componentInfo?.title || componentInfo?.name
            }],
            workspaceDir: StateMachine.context().workspacePath || StateMachine.context().projectPath,
        };
        await commands.executeCommand(WICommandIds.CreateNewComponent, deploymentParams);

        return { isCompleted: true };
    }

    async deployWorkspace(params: WorkspaceDeploymentRequest): Promise<DeploymentResponse> {
        const projectScopes = params.projectScopes;
        if (!projectScopes?.length) {
            window.showWarningMessage("No deployable integrations found in the project.");
            return { isCompleted: true };
        }
        const integrations: ICreateNewIntegrationCmdIntegrations[] = [];

        // If there is only one project in the workspace and it has multiple integration types,
        // ask the user to pick the type similar to the single project deploy flow.
        if (projectScopes.length === 1) {
            const { projectPath, integrationTypes, projectTitle } = projectScopes[0];

            const integrationType = await this.selectIntegrationType(integrationTypes);

            if (!integrationType) {
                return { isCompleted: true };
            }

            integrations.push({
                fsPath: projectPath,
                supportedIntegrationTypes: [integrationType],
                name: projectTitle
            });
        } else {
            for (const projectScope of projectScopes) {
                const { projectPath, integrationTypes, projectTitle } = projectScope;
                if (!integrationTypes?.length) {
                    window.showWarningMessage(`No integration types found for ${path.basename(projectPath)}.`);
                    continue;
                }

                integrations.push({
                    fsPath: projectPath,
                    supportedIntegrationTypes: integrationTypes,
                    name: projectTitle
                });
            }
        }

        if (integrations.length === 0) {
            return { isCompleted: true };
        }

        await commands.executeCommand(
            WICommandIds.CreateNewComponent,
            {
                buildPackLang: 'ballerina',
                integrations,
                workspaceDir: StateMachine.context().workspacePath
            } as ICreateNewIntegrationCmdParams,
            params.rootDirectory
        );
        return { isCompleted: true };
    }

    private async selectIntegrationType(integrationTypes: SCOPE[]): Promise<SCOPE | undefined> {
        if (!integrationTypes || integrationTypes.length === 0) {
            return undefined;
        }

        const resolution = resolveIntegrationType(integrationTypes);

        if (resolution.kind === "autoPick") {
            return resolution.scope as SCOPE;
        }

        if (resolution.kind === "autoPickWithWarning") {
            const choice = await window.showWarningMessage(
                AUTOMATION_WITH_LISTENER_WARNING,
                { modal: true },
                "Continue",
            );
            if (choice !== "Continue") {
                return undefined;
            }
            return resolution.scope as SCOPE;
        }

        const selectedScope = await window.showQuickPick(resolution.choices, {
            placeHolder: 'You have different types of artifacts within this integration. Select the artifact type to be deployed'
        });

        return selectedScope as SCOPE;
    }

    openAIChat(params: AIChatRequest): void {
        if (params.readme) {
            openAIPanelWithPrompt({
                type: 'text',
                text: 'generate an integration according to the given Readme file',
                planMode: true,
            });
        } else if (params.planMode) {
            openAIPanelWithPrompt({
                type: 'text',
                text: '',
                planMode: true,
            });
        } else {
            openAIPanelWithPrompt(undefined);
        }
    }

    async startInlineAgentChat(params: InlineAgentChatRequest): Promise<void> {
        try {
            const confirm = await window.showInformationMessage(
                'This will generate a chat service for this agent in your project.',
                'Continue',
                'Cancel'
            );
            if (confirm !== 'Continue') { return; }

            const agentChatFile = path.join(path.dirname(params.filePath), '_agent_chat.bal');
            const fileExisted = fs.existsSync(agentChatFile);

            const result: any = await StateMachine.langClient().sendRequest(
                "agentManager/addAgentChatService",
                { filePath: params.filePath, agentVariableName: params.agentVarName }
            );

            if (result.errorMsg) {
                window.showErrorMessage(`Failed to add agent chat service: ${result.errorMsg}`);
                return;
            }

            const generatedFilePath = result.filePath as string;
            const servicePosition = {
                startLine: result.startLine as number,
                startColumn: result.startColumn as number,
                endLine: result.endLine as number,
                endColumn: result.endColumn as number,
            };

            ensureGitignoreEntry(path.dirname(generatedFilePath));

            // Notify LS about the file change so it reloads before navigation
            const fileUri = vscode.Uri.file(generatedFilePath);
            await StateMachine.langClient().sendNotification(
                'workspace/didChangeWatchedFiles',
                { changes: [{ uri: fileUri.toString(), type: fileExisted ? 2 : 1 }] }
            );

            // Navigate to the chat resource function flow diagram
            openView(EVENT_TYPE.OPEN_VIEW, {
                documentUri: generatedFilePath,
                position: servicePosition,
            });

            // Auto-trigger the chat panel
            vscode.commands.executeCommand('ballerina.tryIt',
                false, undefined,
                { basePath: `/agent-chat/${params.agentVarName}`, listener: 'agentChatListener' },
                generatedFilePath, true,
            );
        } catch (error) {
            window.showErrorMessage(`Failed to set up agent chat: ${error}`);
        }
    }

    async cleanupAgentChatServices(): Promise<boolean> {
        try {
            const projectRoot = StateMachine.context().projectPath;
            if (!projectRoot) { return false; }
            const chatFile = path.join(projectRoot, '_agent_chat.bal');
            if (fs.existsSync(chatFile)) {
                const confirm = await window.showWarningMessage(
                    'Remove all test chat services from your project?',
                    { modal: true },
                    'Remove'
                );
                if (confirm !== 'Remove') { return false; }

                fs.unlinkSync(chatFile);
                console.log(`[agent-chat] Deleted ${chatFile}`);

                // Notify the LS that the file was deleted so it re-indexes
                const fileUri = vscode.Uri.file(chatFile);
                await StateMachine.langClient().sendNotification(
                    'workspace/didChangeWatchedFiles',
                    { changes: [{ uri: fileUri.toString(), type: 3 /* Deleted */ }] }
                );
                // Wait for LS to process the deletion
                await new Promise(resolve => setTimeout(resolve, 500));

                return true;
            }
            return false;
        } catch (error) {
            console.error('[agent-chat] Failed to delete _agent_chat.bal:', error);
            return false;
        }
    }

    async getModuleNodes(): Promise<BIModuleNodesResponse> {
        console.log(">>> requesting bi module nodes from ls");
        return new Promise((resolve) => {
            const context = StateMachine.context();
            if (!context.projectPath) {
                console.log(">>> projectPath not found in the context");
                return new Promise((resolve) => {
                    resolve(undefined);
                });
            }

            const params: BIModuleNodesRequest = {
                filePath: context.projectPath,
            };

            StateMachine.langClient()
                .getModuleNodes(params)
                .then((model) => {
                    console.log(">>> bi module nodes from ls", model);
                    resolve(model);
                })
                .catch((error) => {
                    console.log(">>> error fetching bi module nodes from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                });
        });
    }

    async getSignatureHelp(params: SignatureHelpRequest): Promise<SignatureHelpResponse> {
        return new Promise((resolve, reject) => {
            StateMachine.langClient()
                .getSignatureHelp(params)
                .then((signatureHelp) => {
                    resolve(signatureHelp);
                })
                .catch((error) => {
                    reject("Error fetching signature help from ls");
                });
        });
    }

    async getVisibleVariableTypes(params: BIGetVisibleVariableTypesRequest): Promise<BIGetVisibleVariableTypesResponse> {
        return new Promise((resolve, reject) => {
            StateMachine.langClient()
                .getVisibleVariableTypes(params)
                .then((types) => {
                    resolve(types as BIGetVisibleVariableTypesResponse);
                })
                .catch((error) => {
                    reject("Error fetching visible variable types from ls");
                });
        });
    }

    async checkDockerAvailability(): Promise<boolean> {
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            exec('docker --version', (error: any) => {
                resolve(!error);
            });
        });
    }

    async runBallerinaBuildTask(docker: boolean): Promise<void> {
        const taskDefinition: TaskDefinition = {
            type: 'shell',
            task: 'run'
        };

        // If docker is true check if docker command is available
        if (docker) {
            const dockerAvailable = await this.checkDockerAvailability();
            if (!dockerAvailable) {
                window.showErrorMessage('Docker is not available. Please install Docker to build Docker images.');
                return;
            }
        }

        const context = StateMachine.context();
        const { workspacePath, view: webviewType, projectPath } = context;

        let targetPath = projectPath ?? "";
        if (workspacePath && webviewType === MACHINE_VIEW.WorkspaceOverview) {
            // The workspace overview is active — build the whole workspace.
            targetPath = workspacePath;
        } else if (workspacePath && !projectPath) {
            // A workspace is open but no specific project is selected; fall back
            // to whichever project the active editor belongs to, or the workspace
            // root if there is no active editor.
            try {
                targetPath = await getCurrentProjectRoot();
            } catch (error) {
                targetPath = workspacePath;
            }
        } else {
            // A specific project is already selected in the state machine; use it.
            // Wrap getCurrentProjectRoot in try/catch because there may not be an
            // active text editor when this is invoked from the RPC manager.
            try {
                targetPath = await getCurrentProjectRoot();
            } catch (error) {
                targetPath = projectPath ?? workspacePath ?? "";
            }
        }

        if (!targetPath) {
            window.showErrorMessage('No Ballerina project found.');
            return;
        }

        // Get Ballerina home path from settings
        const config = workspace.getConfiguration('ballerina');
        const ballerinaHome = config.get<string>('home');
        const balCmd = ballerinaHome ? path.join(ballerinaHome, 'bin', 'bal') : 'bal';
        const buildCommand = docker ? `${balCmd} build --cloud="docker"` : `${balCmd} build`;

        // Run the build command scoped to the resolved project directory so that
        // only that project is compiled (not every project in the workspace).
        const execution = new ShellExecution(buildCommand, {
            cwd: targetPath,
            env: process.env as { [key: string]: string }
        });

        const task = new Task(
            taskDefinition,
            workspace.workspaceFolders![0],
            'Ballerina Build',
            'ballerina',
            execution
        );

        try {
            await tasks.executeTask(task);
        } catch (error) {
            window.showErrorMessage(`Failed to build Ballerina package: ${error}`);
        }
    }

    buildProject(mode: BuildMode): void {

        switch (mode) {
            case BuildMode.JAR:
                this.runBallerinaBuildTask(false);
                break;
            case BuildMode.DOCKER:
                this.runBallerinaBuildTask(true);
                break;
        }

    }

    runProject(): void {
        commands.executeCommand(BI_COMMANDS.BI_RUN_PROJECT);
    }

    async getVisibleTypes(params: VisibleTypesRequest): Promise<VisibleTypesResponse> {
        return new Promise((resolve, reject) => {
            StateMachine.langClient()
                .getVisibleTypes(params)
                .then((visibleTypes) => {
                    resolve(visibleTypes?.filter((item) => item.label !== "record"));
                })
                .catch((error) => {
                    reject("Error fetching visible types from ls");
                });
        });
    }

    async deleteByComponentInfo(params: BIDeleteByComponentInfoRequest): Promise<BIDeleteByComponentInfoResponse> {
        console.log(">>> requesting bi delete node from ls by componentInfo", params);

        const position: NodePosition = {
            startLine: params.component?.startLine,
            startColumn: params.component?.startColumn,
            endColumn: params.component?.endColumn,
            endLine: params.component?.endLine
        };
        // Check if the filepath is only the filename or the full path if not concatenate the project uri
        let filePath = params.component?.filePath;
        if (!filePath.includes(StateMachine.context().projectPath)) {
            filePath = path.join(StateMachine.context().projectPath, filePath);
        }
        const componentView = await getView(filePath, position, StateMachine.context().projectPath);
        // Helper function to perform the actual delete operation
        const performDelete = async (): Promise<any> => {
            return new Promise((resolve, reject) => {
                StateMachine.langClient()
                    .deleteByComponentInfo(params)
                    .then(async (model) => {
                        console.log(">>> bi delete node from ls by componentInfo", model);
                        let description = 'Component Deletion';
                        if (componentView?.location?.artifactType && componentView?.location?.identifier) {
                            description = `${this.capitalizeFirstLetter(componentView.location.artifactType)} Deletion - ${componentView.location.identifier}`;
                        }
                        await updateSourceCode({ textEdits: model.textEdits, description: description, skipPayloadCheck: true }); // Skip payload check because the component is deleted
                        resolve(model);
                    })
                    .catch((error) => {
                        console.log(">>> error fetching delete node from ls by componentInfo", error);
                        reject("Error fetching delete node from ls by componentInfo");
                    });
            });
        };

        if (params.nodeType === "connection-node") {
            // If its a Devant connection, need to delete it from Devant backend as well
            await new PlatformExtRpcManager().deleteBiDevantConnection({
                filePath: params.filePath,
                ...params.component
            });
        }


        return performDelete();
    }

    async getFormDiagnostics(params: FormDiagnosticsRequest): Promise<FormDiagnosticsResponse> {
        return new Promise((resolve, reject) => {
            console.log(">>> requesting form diagnostics from ls", params);
            StateMachine.langClient()
                .getFormDiagnostics(params)
                .then((diagnostics) => {
                    console.log(">>> form diagnostics response from ls", diagnostics);
                    resolve(diagnostics);
                })
                .catch((error) => {
                    reject("Error fetching form diagnostics from ls");
                });
        });
    }

    async getExpressionDiagnostics(params: ExpressionDiagnosticsRequest): Promise<ExpressionDiagnosticsResponse> {
        return new Promise((resolve, reject) => {
            console.log(">>> requesting expression diagnostics from ls", params);
            StateMachine.langClient()
                .getExpressionDiagnostics(params)
                .then((diagnostics) => {
                    console.log(">>> expression diagnostics response from ls", diagnostics);
                    resolve(diagnostics);
                })
                .catch((error) => {
                    reject("Error fetching expression diagnostics from ls");
                });
        });
    }

    async addBreakpointToSource(params: BreakpointRequest): Promise<void> {
        return new Promise(async (resolve) => {
            console.log(">>> adding breakpoint to source", params);
            const breakpoint = new vscode.SourceBreakpoint(
                new vscode.Location(vscode.Uri.file(params.filePath), new vscode.Position(params.breakpoint.line, params.breakpoint?.column)));
            vscode.debug.addBreakpoints([breakpoint]);

        });
    }

    async removeBreakpointFromSource(params: BreakpointRequest): Promise<void> {
        return new Promise(async (resolve) => {
            console.log(">>> removing breakpoint from source", params);
            const breakpointsForFile: vscode.SourceBreakpoint[] = vscode.debug.breakpoints.filter((breakpoint) => {
                const sourceBreakpoint = breakpoint as vscode.SourceBreakpoint;
                return sourceBreakpoint.location.uri.fsPath === params.filePath;
            }) as vscode.SourceBreakpoint[];

            const breakpoints = breakpointsForFile.filter((breakpoint) => {
                return breakpoint.location.range.start.line === params.breakpoint.line &&
                    breakpoint.location.range.start?.character === params.breakpoint?.column;
            });

            // If there are no breakpoints found,
            // then it could be due the breakpoint has been added from the sourceCode, where the column is not provided
            // so we need to check for breakpoint with the same line and remove
            if (breakpoints.length === 0) {
                const breakpointsToRemove = breakpointsForFile.filter((breakpoint) => {
                    return breakpoint.location.range.start.line === params.breakpoint.line;
                });
                vscode.debug.removeBreakpoints(breakpointsToRemove);
            } else {
                vscode.debug.removeBreakpoints(breakpoints);
            }

        });
    }

    async getBreakpointInfo(): Promise<CurrentBreakpointsResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();

            const breakpointsForFile: vscode.SourceBreakpoint[] = vscode.debug.breakpoints.filter((breakpoint) => {
                const sourceBreakpoint = breakpoint as vscode.SourceBreakpoint;
                return sourceBreakpoint.location.uri.fsPath === context?.documentUri;
            }) as vscode.SourceBreakpoint[];

            const breakpoints: DebugProtocol.Breakpoint[] = breakpointsForFile.map((breakpoint) => {
                return {
                    verified: true,
                    line: breakpoint.location.range.start.line,
                    column: breakpoint.location.range.start?.character
                };
            });
            // TODO: Check the need of using breakpoints with verified status
            // const breakppoints = BreakpointManager.getInstance().getBreakpoints();
            // if there is an instance then call get ActiveBreakpoint

            const activeBreakpoint = BreakpointManager.getInstance()?.getActiveBreakpoint();
            resolve({ breakpoints: breakpoints, activeBreakpoint: activeBreakpoint });
        });
    }

    async getEnclosedFunction(params: BIGetEnclosedFunctionRequest): Promise<BIGetEnclosedFunctionResponse> {
        console.log(">>> requesting parent functin definition", params);
        // When useFileSchema is set, use file:// scheme to show original content
        let filePath = params.filePath;
        if (params.useFileSchema) {
            filePath = this.convertAiToFileScheme(filePath);
        }
        const request = { filePath, position: params.position, findClass: params.findClass };
        return new Promise((resolve) => {
            StateMachine.langClient()
                .getEnclosedFunctionDef(request)
                .then((response) => {
                    if (response?.filePath && response?.startLine && response?.endLine) {
                        console.log(">>> parent function position ", response);
                        resolve(response);
                    } else {
                        console.log(">>> parent function position not found");
                        resolve(undefined);
                    }

                })
                .catch((error) => {
                    console.log(">>> error fetching parent function position", error);
                    resolve(undefined);
                });
        });
    }

    async formDidOpen(params: FormDidOpenParams): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const { filePath } = params;
            registerFormOpen(filePath);
            const fileUri = Uri.file(filePath);
            const exprFileSchema = fileUri.with({ scheme: 'expr' });

            let languageId: string;
            let version: number;
            let text: string;

            try {
                const textDocument = await workspace.openTextDocument(fileUri);
                languageId = textDocument.languageId;
                version = textDocument.version;
                text = textDocument.getText();
            } catch (error) {
                languageId = "ballerina";
                version = 1;
                text = "";
            }

            StateMachine.langClient().didOpen({
                textDocument: {
                    uri: exprFileSchema.toString(),
                    languageId,
                    version,
                    text
                }
            });
        });
    }

    formDirtyDidChange(params: FormDirtyDidChangeParams): void {
        setFormDirtyState(params.filePath, params.isDirty);
    }

    async formDidClose(params: FormDidCloseParams): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const { filePath } = params;
                registerFormClose(filePath);
                const fileUri = Uri.file(filePath);
                const exprFileSchema = fileUri.with({ scheme: 'expr' });
                StateMachine.langClient().didClose({
                    textDocument: {
                        uri: exprFileSchema.toString()
                    }
                });
                resolve();
            } catch (error) {
                console.error("Error closing file in didClose", error);
                reject(error);
            }
        });
    }

    async getDesignModel(params: BIDesignModelRequest): Promise<BIDesignModelResponse> {
        console.log(">>> requesting design model from ls");
        return new Promise((resolve) => {
            let projectPath: string;
            if (params?.projectPath) {
                if (params.useFileSchema) {
                    // Use file:// scheme to show original content
                    projectPath = Uri.file(params.projectPath).toString();
                } else {
                    const uri = Uri.file(params.projectPath);
                    projectPath = uri.with({ scheme: 'ai' }).toString();
                }
            } else {
                projectPath = StateMachine.context().projectPath;
            }

            StateMachine.langClient()
                .getDesignModel({ projectPath })
                .then((model) => {
                    console.log(">>> design model from ls", model);
                    resolve(model);
                })
                .catch((error) => {
                    console.log(">>> error fetching design model from ls", error);
                    return new Promise((resolve) => {
                        resolve(undefined);
                    });
                }
                );
        });
    }


    async getTypes(params: GetTypesRequest): Promise<GetTypesResponse> {
        let filePath = params.filePath;

        if (!filePath && StateMachine.context()?.projectPath) {
            const projectPath = StateMachine.context().projectPath;
            const ballerinaFiles = await getBallerinaFiles(Uri.file(projectPath).fsPath);
            filePath = ballerinaFiles.at(0);
        }

        if (!filePath) {
            return new Promise((resolve, reject) => {
                reject(new Error("No file path provided"));
            });
        }

        // When useFileSchema is set, use file:// scheme to show original content
        if (params.useFileSchema) {
            filePath = this.convertAiToFileScheme(filePath);
        }

        return new Promise((resolve, reject) => {
            StateMachine.langClient()
                .getTypes({ filePath })
                .then((types) => {
                    resolve(types);
                }).catch((error) => {
                    console.log(">>> error fetching types from ls", error);
                    reject(error);
                });
        });
    }

    async updateType(params: UpdateTypeRequest): Promise<UpdateTypeResponse> {
        const projectPath = StateMachine.context().projectPath;
        const filePath = path.join(projectPath, params.filePath);
        return new Promise((resolve, reject) => {
            console.log(">>> updating type request", params.type);
            StateMachine.langClient()
                .updateType({ filePath, type: params.type, description: "" })
                .then(async (updateTypeResponse: UpdateTypeResponse) => {
                    console.log(">>> update type response", updateTypeResponse);
                    await updateSourceCode({ textEdits: updateTypeResponse.textEdits, description: 'Type Update', identifier: params.type.name });
                    resolve(updateTypeResponse);
                }).catch((error) => {
                    console.log(">>> error fetching types from ls", error);
                    reject(error);
                });
        });
    }

    async getType(params: GetTypeRequest): Promise<GetTypeResponse> {
        return new Promise((resolve, reject) => {
            StateMachine.langClient()
                .getType(params)
                .then((type) => {
                    console.log(">>> type from ls", type);
                    resolve(type);
                })
                .catch((error) => {
                    console.log(">>> error fetching type from ls", error);
                    reject(error);
                });
        });
    }

    async getSimpleTypeOfExpression(params: GetSimpleTypeOfExpressionRequest): Promise<GetSimpleTypeOfExpressionResponse> {
        return new Promise((resolve, reject) => {
            StateMachine.langClient()
                .getSimpleTypeOfExpression(params)
                .then((type) => {
                    console.log(">>> simple type from ls", type);
                    resolve(type);
                })
                .catch((error) => {
                    console.log(">>> error fetching simple type from ls", error);
                    reject(error);
                });
        });
    }

    async updateImports(params: UpdateImportsRequest): Promise<UpdateImportsResponse> {
        return new Promise((resolve, reject) => {
            StateMachine.langClient()
                .updateImports({
                    ...params,
                    importStatement: params.importStatement.trim()
                })
                .then((response) => {
                    resolve({ ...response, importStatementOffset: params.importStatement.length });
                })
                .catch((error) => {
                    console.error('Error updating imports', error);
                    reject(error);
                });
        });
    }

    async addFunction(params: AddFunctionRequest): Promise<AddImportItemResponse> {
        return new Promise((resolve) => {
            StateMachine.langClient().addFunction(params)
                .then((response) => {
                    resolve(response);
                })
                .catch((error) => {
                    console.log(">>> Error adding function", error);
                    resolve(undefined);
                });
        });
    }

    async promptGithubCopilotAuthNotificaiton(): Promise<void> {
        //TODO: Prevent multiple notifications
        vscode.window.showInformationMessage(
            'WSO2 Integrator supports visual completions with GitHub Copilot.',
            'Authorize using GitHub Copilot'
        ).then(selection => {
            if (selection === 'Authorize using GitHub Copilot') {
                commands.executeCommand('ballerina.login.copilot');
            }
        });
    }

    async getCompletionsWithHostedAI(token, copilotContext): Promise<string> {
        // get suggestions from ai
        const requestBody = {
            ...copilotContext,
        };
        const requestOptions = {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(requestBody),
        };
        console.log(">>> request ai suggestion", { request: requestBody });
        // generate new nodes
        const response = await fetchWithAuth(OLD_BACKEND_URL + "/completion", requestOptions);
        if (!response.ok) {
            console.log(">>> ai completion api call failed ", response);
            return new Promise((resolve) => {
                resolve(undefined);
            });
        }
        const data = await response.json();
        console.log(">>> ai suggestion from remote", { response: data });
        const suggestedContent = (data as any).completion;
        return suggestedContent;
    }

    async getFunctionNode(params: FunctionNodeRequest): Promise<FunctionNodeResponse> {
        return new Promise((resolve) => {
            StateMachine.langClient().getFunctionNode(params)
                .then((response) => {
                    resolve(response);
                })
                .catch((error) => {
                    console.log(">>> Error getting function node", error);
                    resolve(undefined);
                });
        });
    }

    async getExpressionTokens(params: ExpressionTokensRequest): Promise<number[]> {
        return new Promise((resolve) => {
            StateMachine.langClient().getExpressionTokens(params)
                .then((response) => {
                    resolve(response?.data || []);
                })
                .catch((error) => {
                    console.log(">>> Error getting expression tokens", error);
                    resolve(undefined);
                });
        });
    }

    async createGraphqlClassType(params: UpdateTypeRequest): Promise<UpdateTypeResponse> {
        const projectPath = StateMachine.context().projectPath;
        const filePath = path.join(projectPath, params.filePath);
        return new Promise((resolve, reject) => {
            StateMachine.langClient()
                .createGraphqlClassType({ filePath, type: params.type, description: "" })
                .then(async (updateTypeResponse: UpdateTypeResponse) => {
                    console.log(">>> create graphql class type response", updateTypeResponse);
                    await updateSourceCode({ textEdits: updateTypeResponse.textEdits, description: 'Graphql Class Type Creation' });
                    resolve(updateTypeResponse);
                }).catch((error) => {
                    console.log(">>> error fetching class type from ls", error);
                    reject(error);
                });
        });
    }

    async getServiceClassModel(params: ModelFromCodeRequest): Promise<ServiceClassModelResponse> {
        return new Promise(async (resolve) => {
            try {
                const res: ServiceClassModelResponse = await StateMachine.langClient().getServiceClassModel(params);
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async updateClassField(params: ClassFieldModifierRequest): Promise<SourceEditResponse> {
        return new Promise(async (resolve) => {
            try {
                const res: SourceEditResponse = await StateMachine.langClient().updateClassField(params);
                await updateSourceCode({ textEdits: res.textEdits, description: 'Class Field Update' });
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async updateServiceClass(params: ServiceClassSourceRequest): Promise<UpdatedArtifactsResponse> {
        return new Promise(async (resolve) => {
            try {
                const res: SourceEditResponse = await StateMachine.langClient().updateServiceClass(params);
                const artifacts = await updateSourceCode({ textEdits: res.textEdits, description: 'Service Class Update' });
                resolve({ artifacts });
            } catch (error) {
                console.log(error);
            }
        });
    }

    async addClassField(params: AddFieldRequest): Promise<SourceEditResponse> {
        return new Promise(async (resolve) => {
            try {
                const res: SourceEditResponse = await StateMachine.langClient().addClassField(params);
                await updateSourceCode({ textEdits: res.textEdits, description: 'Class Field Creation' });
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async createClassDependency(params: CreateClassDependencyRequest): Promise<SourceEditResponse> {
        return new Promise(async (resolve) => {
            try {
                const res: SourceEditResponse = await StateMachine.langClient().createClassDependency(params);
                await updateSourceCode({ textEdits: res.textEdits, description: 'Create Class Dependency' });
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async listClassMembers(params: ClassMemberRequest): Promise<ClassMembersResponse> {
        return new Promise(async (resolve) => {
            try {
                const res: ClassMembersResponse = await StateMachine.langClient().listClassMembers(params);
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async saveClassMember(params: SaveClassMemberRequest): Promise<SourceEditResponse> {
        return new Promise(async (resolve) => {
            try {
                const res: SourceEditResponse = await StateMachine.langClient().saveClassMember(params);
                await updateSourceCode({ textEdits: res.textEdits, description: 'Save Class Member' });
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async deleteClassMember(params: DeleteClassMemberRequest): Promise<SourceEditResponse> {
        return new Promise(async (resolve) => {
            try {
                const res: SourceEditResponse = await StateMachine.langClient().deleteClassMember(params);
                await updateSourceCode({ textEdits: res.textEdits, description: 'Delete Class Member' });
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async updateClassDependency(params: ModifyClassDependencyRequest): Promise<SourceEditResponse> {
        return new Promise(async (resolve) => {
            try {
                const res: SourceEditResponse = await StateMachine.langClient().updateClassDependency(params);
                await updateSourceCode({ textEdits: res.textEdits, description: 'Update Class Dependency' });
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async removeClassDependency(params: ModifyClassDependencyRequest): Promise<SourceEditResponse> {
        return new Promise(async (resolve) => {
            try {
                const res: SourceEditResponse = await StateMachine.langClient().removeClassDependency(params);
                await updateSourceCode({ textEdits: res.textEdits, description: 'Remove Class Dependency' });
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async renameIdentifier(params: RenameIdentifierRequest): Promise<void> {
        const projectPath = StateMachine.context().projectPath;
        const filePath = path.join(projectPath, params.fileName);
        const fileUri = Uri.file(filePath).toString();
        const request: RenameRequest = {
            textDocument: {
                uri: fileUri
            },
            position: params.position,
            newName: params.newName
        };
        try {
            const workspaceEdit = await StateMachine.langClient().rename(request);
            if (workspaceEdit && 'changes' in workspaceEdit && workspaceEdit.changes) {
                const response = await updateSourceCode({ textEdits: workspaceEdit.changes, description: 'Rename for ' + params.newName, isRenameOperation: true });
                if (response && response.length > 0) {
                    // Find the artifact that is renamed or send all
                    const artifact = response.find(res => res.name === params.newName || res.context === params.newName);
                    if (artifact) {
                        notifyOnIdentifierUpdated([artifact]);
                    } else {
                        notifyOnIdentifierUpdated(response);
                    }
                }
            }
        } catch (error) {
            console.error('Error in renameIdentifier:', error);
            throw error;
        }
    }

    async getEndOfFile(params: EndOfFileRequest): Promise<LinePosition> {
        return new Promise((resolve, reject) => {
            const { filePath } = params;
            try {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const lines = fileContent.split('\n');
                const lastLine = lines[lines.length - 1];
                const lastLineLength = lastLine.length;
                resolve({ line: lines.length - 1, offset: lastLineLength });
            } catch (error) {
                console.log(error);
                resolve({ line: 0, offset: 0 });
            }
        });
    }

    async search(params: BISearchRequest): Promise<BISearchResponse> {
        return new Promise((resolve, reject) => {
            StateMachine.langClient().search(params).then((res) => {
                resolve(res);
            }).catch((error) => {
                console.log(">>> error searching", error);
                reject(error);
            });
        });
    }

    async getAllData(params: WorkflowDataRequest): Promise<WorkflowDataResponse> {
        return new Promise((resolve, reject) => {
            console.log(">>> requesting workflowManager/getAllData from ls", params);
            StateMachine.langClient().getAllData(params).then((res) => {
                console.log(">>> workflowManager/getAllData response from ls", res);
                resolve(res);
            }).catch((error) => {
                console.log(">>> error fetching workflow data", error);
                reject(error);
            });
        });
    }

    async getRecordNames(): Promise<RecordsInWorkspaceMentions> {
        const projectComponents = await this.getProjectComponents();

        // Extracting all record names and type names
        const recordNames: string[] = [];

        if (projectComponents?.components?.packages) {
            for (const pkg of projectComponents.components.packages) {
                for (const module of pkg.modules) {
                    if (module.records) {
                        for (const record of module.records) {
                            recordNames.push(record.name);
                        }
                    }
                    if (module.types) {
                        for (const type of module.types) {
                            recordNames.push(type.name);
                        }
                    }
                }
            }
        }

        return { mentions: recordNames };
    }

    async getDevantMetadata(): Promise<DevantMetadata | undefined> {
        let hasContextYaml = false;
        let isLoggedIn = false;
        let hasComponent = false;
        let hasLocalChanges = false;
        try {
            const projectPath = StateMachine.context().projectPath;
            const repoRoot = getRepoRoot(projectPath);
            if (repoRoot) {
                const contextYamlPath = path.join(repoRoot, ".wso2", "context.yaml");
                // leaving .choreo/context.yaml check for backward compatibility, can remove after some time
                const choreoContextYamlPath = path.join(repoRoot, ".choreo", "context.yaml");
                if (fs.existsSync(contextYamlPath) || fs.existsSync(choreoContextYamlPath)) {
                    hasContextYaml = true;
                }
            }

            const platformExt = extensions.getExtension(WI_EXTENSION_ID);
            if (!platformExt) {
                return { hasComponent: hasContextYaml, isLoggedIn: false };
            }
            if (!platformExt.isActive) {
                await platformExt.activate();
            }
            const platformExtAPI: IWso2PlatformExtensionAPI = platformExt.exports?.cloudAPIs;
            hasLocalChanges = await platformExtAPI.localRepoHasChanges(projectPath);
            isLoggedIn = platformExtAPI.isLoggedIn();
            if (isLoggedIn) {
                const components = platformExtAPI.getDirectoryComponents(projectPath);
                hasComponent = components.length > 0;
                return { isLoggedIn, hasComponent, hasLocalChanges };
            }
            return { isLoggedIn, hasComponent: hasContextYaml, hasLocalChanges };
        } catch (err) {
            console.error("failed to call getDevantMetadata: ", err);
            return { hasComponent: hasComponent || hasContextYaml, isLoggedIn, hasLocalChanges };
        }
    }

    async getWorkspaceDevantMetadata(): Promise<WorkspaceDevantMetadata | undefined> {
        let isLoggedIn = false;
        let hasAnyComponent = false;
        let hasLocalChanges = false;
        const projectsMetadata: ProjectDevantMetadata[] = [];

        try {
            // Get workspace structure
            const workspaceStructure = await this.getProjectStructure();
            if (!workspaceStructure) {
                return { isLoggedIn: false, hasAnyComponent: false, hasLocalChanges: false };
            }

            // For standalone integrations workspacePath is undefined; fall back to the single project's path
            const pathForRepoRoot = workspaceStructure.workspacePath ?? workspaceStructure.projects?.[0]?.projectPath;
            if (!pathForRepoRoot) {
                return { isLoggedIn: false, hasAnyComponent: false, hasLocalChanges: false };
            }

            const repoRoot = getRepoRoot(pathForRepoRoot);
            if (!repoRoot) {
                return { isLoggedIn: false, hasAnyComponent: false, hasLocalChanges: false };
            }

            const platformExt = extensions.getExtension(WI_EXTENSION_ID);
            if (!platformExt) {
                // Check for context.yaml as fallback
                const contextYamlPath = path.join(repoRoot, ".wso2", "context.yaml");
                // leaving .choreo/context.yaml check for backward compatibility, can remove after some time
                const choreoContextYamlPath = path.join(repoRoot, ".choreo", "context.yaml");
                const hasContextYaml = fs.existsSync(contextYamlPath) || fs.existsSync(choreoContextYamlPath);
                return {
                    isLoggedIn: false,
                    hasAnyComponent: hasContextYaml,
                    hasLocalChanges: false
                };
            }

            if (!platformExt.isActive) {
                await platformExt.activate();
            }
            const platformExtAPI: IWso2PlatformExtensionAPI = platformExt.exports?.cloudAPIs;
            isLoggedIn = platformExtAPI.isLoggedIn();
            hasLocalChanges = await platformExtAPI.localRepoHasChanges(repoRoot);

            // Check each project in the workspace
            for (const project of workspaceStructure.projects) {
                const projectPath = project.projectPath;
                const projectName = project.projectTitle || project.projectName;

                let projectHasComponent = false;
                let projectHasLocalChanges = false;

                if (isLoggedIn) {
                    const components = platformExtAPI.getDirectoryComponents(projectPath);
                    projectHasComponent = components.length > 0;
                    if (projectHasComponent) {
                        hasAnyComponent = true;
                        // Only check local changes for deployed projects
                        projectHasLocalChanges = await platformExtAPI.localRepoHasChanges(projectPath);
                    }
                }

                projectsMetadata.push({
                    projectPath,
                    projectName,
                    hasComponent: projectHasComponent,
                    hasLocalChanges: projectHasLocalChanges
                });
            }

            // If not logged in, check for context.yaml as fallback
            if (!isLoggedIn) {
                const contextYamlPath = path.join(repoRoot, ".wso2", "context.yaml");
                // leaving .choreo/context.yaml check for backward compatibility, can remove after some time
                const choreoContextYamlPath = path.join(repoRoot, ".choreo", "context.yaml");
                if (fs.existsSync(contextYamlPath) || fs.existsSync(choreoContextYamlPath)) {
                    hasAnyComponent = true;
                }
            }

            return {
                isLoggedIn,
                hasAnyComponent,
                hasLocalChanges,
                projectsMetadata
            };
        } catch (err) {
            console.error("failed to call getWorkspaceDevantMetadata: ", err);
            return { isLoggedIn, hasAnyComponent, hasLocalChanges };
        }
    }

    async getRecordConfig(params: GetRecordConfigRequest): Promise<GetRecordConfigResponse> {
        return new Promise((resolve, reject) => {
            StateMachine.langClient().getRecordConfig(params).then((res) => {
                resolve(res);
            }).catch((error) => {
                console.log(">>> error getting record config", error);
                reject(error);
            });
        });
    }

    async updateRecordConfig(params: UpdateRecordConfigRequest): Promise<GetRecordConfigResponse> {
        return new Promise((resolve, reject) => {
            StateMachine.langClient().updateRecordConfig(params).then((res) => {
                resolve(res);
            }).catch((error) => {
                console.log(">>> error updating record config", error);
                reject(error);
            });
        });
    }

    async getRecordSource(params: RecordSourceGenRequest): Promise<RecordSourceGenResponse> {
        console.log(">>> requesting record source", params);
        return new Promise((resolve, reject) => {
            StateMachine.langClient().getRecordSource(params).then((res) => {
                resolve(res);
            }).catch((error) => {
                console.log(">>> error getting record source", error);
                reject(error);
            });
        });
    }

    async getRecordModelFromSource(params: GetRecordModelFromSourceRequest): Promise<GetRecordModelFromSourceResponse> {
        return new Promise((resolve, reject) => {
            StateMachine.langClient().getRecordModelFromSource(params).then((res) => {
                resolve(res);
            }).catch((error) => {
                console.log(">>> error getting record model from source", error);
                reject(error);
            });
        });
    }

    async updateTypes(params: UpdateTypesRequest): Promise<UpdateTypesResponse> {
        return new Promise((resolve, reject) => {
            const projectPath = StateMachine.context().projectPath;
            const completeFilePath = path.join(projectPath, params.filePath);

            StateMachine.langClient().updateTypes(
                { filePath: completeFilePath, types: params.types }
            ).then(async (updateTypesresponse: UpdateTypesResponse) => {
                console.log(">>> update type response", updateTypesresponse);
                if (updateTypesresponse.textEdits) {
                    await updateSourceCode({ textEdits: updateTypesresponse.textEdits, description: 'Type Update' });
                    resolve(updateTypesresponse);
                } else {
                    console.log(">>> error updating types", updateTypesresponse?.errorMsg);
                    resolve(undefined);
                }
            }).catch((error) => {
                console.log(">>> error updating types", error);
                reject(error);
            });
        });
    }

    async getFunctionNames(): Promise<RecordsInWorkspaceMentions> {
        const projectComponents = await this.getProjectComponents();

        // Extracting all function names
        const functionNames: string[] = [];

        if (projectComponents?.components?.packages) {
            for (const pkg of projectComponents.components.packages) {
                for (const module of pkg.modules || []) {
                    if (module.functions) {
                        for (const func of module.functions) {
                            functionNames.push(func.name);
                        }
                    }
                }
            }
        }

        return { mentions: functionNames };
    }

    async generateOpenApiClient(params: OpenAPIClientGenerationRequest): Promise<GeneratedClientSaveResponse> {
        return new Promise(async (resolve, reject) => {
            try {
                const res = await StateMachine.langClient().openApiGenerateClient(params);

                if (!res.source || !res.source.textEditsMap) {
                    console.error("textEditsMap is undefined or null");
                    reject(new Error("textEditsMap is undefined or null"));
                    return;
                }

                if (res.source.isModuleExists) {
                    console.error("Module already exists");
                    resolve({ errorMessage: "Module already exists" });
                    return;
                }


                if (res?.source?.textEditsMap) {
                    await updateSourceCode({
                        textEdits: res.source.textEditsMap,
                        description: `OpenAPI Client Generation`,
                        skipUpdateViewOnTomlUpdate: true,
                        skipPayloadCheck: true
                    });
                    console.log(">>> Applied text edits for openapi client");

                    // check if params.openApiContractPath is within the project path
                    if (isPathInside(params.projectPath, params.openApiContractPath)) {
                        const relativeSpecPath = path
                            .relative(path.normalize(params.projectPath), path.normalize(params.openApiContractPath))
                            .replace(/\\/g, "/");
                        const updatedSpecPath = relativeSpecPath.startsWith(".") ? relativeSpecPath : `./${relativeSpecPath}`;
                        // Replace the file path of the openapi spec to be relative path in the toml
                        const tomlValues = await new CommonRpcManager().getCurrentProjectTomlValues();
                        const updatedToml: Partial<PackageTomlValues> = {
                            ...tomlValues,
                            tool: {
                                ...tomlValues?.tool,
                                openapi: tomlValues.tool?.openapi?.map((item) => {
                                    if (item.id === params.module) {
                                        return { ...item, filePath: updatedSpecPath };
                                    }
                                    return item;
                                }),
                            },
                        };
                        const balTomlPath = path.join(params.projectPath, "Ballerina.toml");
                        const updatedTomlContent = toml.stringify(JSON.parse(JSON.stringify(updatedToml)));
                        fs.writeFileSync(balTomlPath, updatedTomlContent, "utf-8");
                    }
                }

                resolve({});
            } catch (error) {
                console.log(">>> error generating openapi client", error);
                reject(error);
            }
        });
    }

    async getOpenApiGeneratedModules(params: OpenAPIGeneratedModulesRequest): Promise<OpenAPIGeneratedModulesResponse> {
        return new Promise((resolve, reject) => {
            const projectPath = StateMachine.context().projectPath;
            const request: OpenAPIGeneratedModulesRequest = {
                projectPath: projectPath
            };
            StateMachine.langClient().getOpenApiGeneratedModules(request).then((res) => {
                resolve(res);
            }).catch((error) => {
                console.log(">>> error getting openapi generated modules", error);
                reject(error);
            });
        });
    }

    async deleteOpenApiGeneratedModules(params: OpenAPIClientDeleteRequest): Promise<OpenAPIClientDeleteResponse> {
        return new Promise((resolve, reject) => {
            const projectPath = StateMachine.context().projectPath;
            const request: OpenAPIClientDeleteRequest = {
                projectPath: projectPath,
                module: params.module
            };
            StateMachine.langClient().deleteOpenApiGeneratedModule(request).then(async (res) => {
                for (const [key, value] of Object.entries(res.deleteData.textEditsMap)) {
                    await this.applyTextEdits(key, value);
                }
                for (const file of res.deleteData.filesToDelete) {
                    await this.applyTextEdits(file, [{
                        newText: "",
                        range: {
                            start: {
                                character: 0,
                                line: 0,
                            },
                            end: {
                                character: Number.MAX_VALUE,
                                line: Number.MAX_VALUE,
                            }
                        }
                    }]);
                }
                updateView();
                resolve(res);
            }).catch((error) => {
                console.log(">>> error getting openapi generated modules", error);
                reject(error);
            });
        });
    }

    async getTypeFromJson(params: JsonToTypeRequest): Promise<JsonToTypeResponse> {
        return new Promise((resolve, reject) => {
            const projectPath = StateMachine.context().projectPath;
            const filePath = path.join(projectPath, 'types.bal');
            StateMachine.langClient().getTypeFromJson({ ...params, filePath })
                .then((response) => {
                    console.log(">>> type from json response", response);
                    resolve(response);
                })
                .catch((error) => {
                    console.log(">>> error getting type from json", error);
                    reject(error);
                });
        });
    }

    async deleteType(params: DeleteTypeRequest): Promise<DeleteTypeResponse> {
        return new Promise((resolve, reject) => {
            const projectPath = StateMachine.context().projectPath;
            const filePath = path.join(projectPath, params.filePath);
            StateMachine.langClient().deleteType({ filePath: filePath, lineRange: params.lineRange })
                .then(async (deleteTypeResponse: DeleteTypeResponse) => {
                    if (deleteTypeResponse.textEdits) {
                        await updateSourceCode({ textEdits: deleteTypeResponse.textEdits, description: 'Type Deletion' });
                        resolve(deleteTypeResponse);
                    } else {
                        reject(deleteTypeResponse.errorMsg);
                    }
                }).catch((error) => {
                    reject(error);
                });
        });
    }

    async verifyTypeDelete(params: VerifyTypeDeleteRequest): Promise<VerifyTypeDeleteResponse> {
        const projectPath = StateMachine.context().projectPath;
        const filePath = path.join(projectPath, params.filePath);

        const request: VerifyTypeDeleteRequest = {
            filePath: filePath,
            startPosition: params.startPosition,
        };
        return new Promise((resolve, reject) => {
            StateMachine.langClient().verifyTypeDelete(request)
                .then((response) => {
                    resolve(response);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    async searchNodes(params: BISearchNodesRequest): Promise<BISearchNodesResponse> {
        return new Promise((resolve, reject) => {
            StateMachine.langClient().searchNodes(params).then((res) => {
                resolve(res);
            }).catch((error) => {
                console.log(">>> error searching", error);
                reject(error);
            });
        });
    }

    async getAvailableAgents(params: BIAvailableNodesRequest): Promise<BIAvailableNodesResponse> {
        console.log(">>> requesting bi available agents from ls", params);
        return new Promise((resolve) => {
            StateMachine.langClient()
                .getAvailableAgents(params)
                .then((model) => {
                    console.log(">>> bi available agents from ls", model);
                    resolve(model);
                })
                .catch((error) => {
                    console.log(">>> error fetching available agents from ls", error);
                    resolve(undefined);
                });
        });
    }

    async updateProjectTitle(params: UpdateProjectTitleRequest): Promise<void> {
        setTomlSectionField(path.join(params.projectPath, 'Ballerina.toml'), 'workspace', 'title', params.title);
        const currentProjectInfo = StateMachine.context().projectInfo;
        if (isSamePath(currentProjectInfo.projectPath, params.projectPath)) {
            StateMachine.updateProjectInfo({ ...currentProjectInfo, title: params.title });
        } else {
            StateMachine.refreshProjectInfo();
        }
    }

    async updatePackageTitle(params: UpdatePackageTitleRequest): Promise<void> {
        setTomlSectionField(path.join(params.packagePath, 'Ballerina.toml'), 'package', 'title', params.title);
        // Update projectInfo so any subsequent buildProjectsStructure call uses the new title.
        const currentProjectInfo = StateMachine.context().projectInfo;
        let updatedProjectInfo: ProjectInfo;
        if (
            currentProjectInfo.projectKind === PROJECT_KIND.WORKSPACE_PROJECT &&
            currentProjectInfo.children?.length > 0
        ) {
            updatedProjectInfo = {
                ...currentProjectInfo,
                children: currentProjectInfo.children.map((child) =>
                    isSamePath(child.projectPath, params.packagePath)
                        ? { ...child, title: params.title }
                        : child
                ),
            };
        } else {
            updatedProjectInfo = { ...currentProjectInfo, title: params.title };
        }
        StateMachine.updateProjectInfo(updatedProjectInfo, { silent: true });
    }

    async getSuggestedProjectDefaults(params: { isInProject: boolean }): Promise<SuggestedProjectDefaultsResponse> {
        return getSuggestedProjectDefaults(params.isInProject);
    }
}

export async function getBallerinaFiles(dir: string): Promise<string[]> {
    let files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(await getBallerinaFiles(entryPath));
        } else if (entry.isFile() && entry.name.endsWith(".bal")) {
            files.push(entryPath);
        }
    }
    return files;
}
