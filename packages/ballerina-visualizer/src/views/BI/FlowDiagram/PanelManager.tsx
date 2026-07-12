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

import { PanelContainer, NodeList, CardList, ExpressionFormField } from "@wso2/ballerina-side-panel";
import {
    FlowNode,
    LineRange,
    SubPanel,
    SubPanelView,
    FUNCTION_TYPE,
    EditorConfig,
    ToolData,
} from "@wso2/ballerina-core";
import { HelperView } from "../HelperView";
import FlowNodeForm from "../Forms/FlowNodeForm";
import { getContainerTitle, getSubPanelWidth } from "../../../utils/bi";
import styled from "@emotion/styled";
import { FormSubmitOptions } from ".";
import { ConnectionConfig, ConnectionCreator, ConnectionSelectionList, ConnectionKind } from "../../../components/ConnectionSelector";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { LoaderContainer } from "../../../components/RelativeLoader/styles";
import { ConnectionListItem } from "@wso2/wso2-platform-core";
import { ConnectorErrorView } from "./components/ErrorContainer";
import { AgentEditorPanelContent } from "../AIChatAgent/AgentEditorPanelContent";
import { AgentEditorController } from "../AIChatAgent/useAgentEditorController";

const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
`;

export enum SidePanelView {
    NODE_LIST = "NODE_LIST",
    FORM = "FORM",
    FUNCTION_LIST = "FUNCTION_LIST",
    WORKFLOW_LIST = "WORKFLOW_LIST",
    ACTIVITY_LIST = "ACTIVITY_LIST",
    DATA_MAPPER_LIST = "DATA_MAPPER_LIST",
    NP_FUNCTION_LIST = "NP_FUNCTION_LIST",
    MODEL_PROVIDERS = "MODEL_PROVIDERS",
    MODEL_PROVIDER_LIST = "MODEL_PROVIDER_LIST",
    VECTOR_STORES = "VECTOR_STORES",
    VECTOR_STORE_LIST = "VECTOR_STORE_LIST",
    EMBEDDING_PROVIDERS = "EMBEDDING_PROVIDERS",
    EMBEDDING_PROVIDER_LIST = "EMBEDDING_PROVIDER_LIST",
    DATA_LOADERS = "DATA_LOADERS",
    DATA_LOADER_LIST = "DATA_LOADER_LIST",
    CHUNKERS = "CHUNKERS",
    CHUNKER_LIST = "CHUNKER_LIST",
    KNOWLEDGE_BASES = "KNOWLEDGE_BASES",
    KNOWLEDGE_BASE_LIST = "KNOWLEDGE_BASE_LIST",
    NEW_AGENT = "NEW_AGENT",
    ADD_TOOL = "ADD_TOOL",
    NEW_TOOL = "NEW_TOOL",
    NEW_TOOL_CUSTOM = "NEW_TOOL_CUSTOM",
    NEW_TOOL_FROM_CONNECTION = "NEW_TOOL_FROM_CONNECTION",
    NEW_TOOL_FROM_FUNCTION = "NEW_TOOL_FROM_FUNCTION",
    NEW_TOOL_FROM_AGENT = "NEW_TOOL_FROM_AGENT",
    NEW_TOOL_FROM_AGENT_FORM = "NEW_TOOL_FROM_AGENT_FORM",
    ADD_MCP_SERVER = "ADD_MCP_SERVER",
    EDIT_MCP_SERVER = "EDIT_MCP_SERVER",
    AGENT_TOOL = "AGENT_TOOL",
    CONNECTION_CONFIG = "CONNECTION_CONFIG",
    CONNECTION_SELECT = "CONNECTION_SELECT",
    CONNECTION_CREATE = "CONNECTION_CREATE",
    AGENT_MEMORY_MANAGER = "AGENT_MEMORY_MANAGER",
    AGENT_CONFIG = "AGENT_CONFIG",
    AGENT_LIST = "AGENT_LIST",
    ERROR = "ERROR",
    LOADING = "LOADING",
    ALL = "ALL"
}

interface PanelManagerProps {
    showSidePanel: boolean;
    sidePanelView: SidePanelView;
    subPanel: SubPanel;
    categories: any[];
    selectedNode?: FlowNode;
    nodeFormTemplate?: FlowNode;
    selectedClientName?: string;
    showEditForm?: boolean;
    targetLineRange?: LineRange;
    connections?: any[];
    fileName?: string;
    projectPath?: string;
    editForm?: boolean;
    updatedExpressionField?: ExpressionFormField;
    showProgressIndicator?: boolean;
    canGoBack?: boolean;
    selectedConnectionKind?: ConnectionKind;
    showProgressSpinner?: boolean;
    progressMessage?: string;
    progressTitle?: string;
    errorMessage?: string;
    agentEditor?: AgentEditorController;

    // Action handlers
    onClose: () => void;
    onSaveAndRefresh?: () => void;
    onBack?: () => void;
    onSelectNode: (nodeId: string, metadata?: any) => void;
    onAddConnection?: () => void;
    onAddFunction?: () => void;
    onAddWorkflow?: () => void;
    onAddActivity?: () => void;
    onAddNPFunction?: () => void;
    onAddDataMapper?: () => void;
    onAddModelProvider?: () => void;
    onAddVectorStore?: () => void;
    onAddEmbeddingProvider?: () => void;
    onAddVectorKnowledgeBase?: () => void;
    onAddDataLoader?: () => void;
    onAddChunker?: () => void;
    onSubmitForm: (updatedNode?: FlowNode, editorConfig?: EditorConfig, options?: FormSubmitOptions) => void;
    onDiscardSuggestions: () => void;
    onSubPanel: (subPanel: SubPanel) => void;
    onUpdateExpressionField: (updatedExpressionField: ExpressionFormField) => void;
    onResetUpdatedExpressionField: () => void;
    onSearchFunction?: (searchText: string, functionType: FUNCTION_TYPE) => void;
    onSearchWorkflow?: (searchText: string, functionType: FUNCTION_TYPE) => void;
    onSearchActivity?: (searchText: string, functionType: FUNCTION_TYPE) => void;
    onSearchNpFunction?: (searchText: string, functionType: FUNCTION_TYPE) => void;
    onSearchAll?: (searchText: string, functionType: FUNCTION_TYPE) => void;
    onSearchModelProvider?: (searchText: string, functionType: FUNCTION_TYPE) => void;
    onSearchVectorStore?: (searchText: string, functionType: FUNCTION_TYPE) => void;
    onSearchEmbeddingProvider?: (searchText: string, functionType: FUNCTION_TYPE) => void;
    onSearchVectorKnowledgeBase?: (searchText: string, functionType: FUNCTION_TYPE) => void;
    onSearchDataLoader?: (searchText: string, functionType: FUNCTION_TYPE) => void;
    onSearchChunker?: (searchText: string, functionType: FUNCTION_TYPE) => void;
    onSearchTextChange?: (searchText: string) => void;
    searchText?: string;
    onAddAgent?: () => void;
    onNavigateToPanel?: (targetPanel: SidePanelView, connectionKind?: ConnectionKind) => void;
    setSidePanelView: (view: SidePanelView) => void;
    onChangeSelectedNode?: (node: FlowNode) => void;

    // AI Agent handlers
    onSelectNewConnection?: (nodeId: string, metadata?: any) => void;
    onSelectConnectorPopup?: (nodeId: string, metadata?: any) => void;
    onUpdateNodeWithConnection?: (selectedNode: FlowNode) => void;

    // Devant handlers
    onImportDevantConn?: (devantConn: ConnectionListItem) => void
    onLinkDevantProject?: () => void;
    onRefreshDevantConnections?: () => void;
}

export function PanelManager(props: PanelManagerProps) {
    const {
        showSidePanel,
        sidePanelView,
        subPanel,
        categories,
        selectedNode,
        nodeFormTemplate,
        selectedClientName,
        showEditForm,
        targetLineRange,
        connections,
        fileName,
        projectPath,
        editForm,
        updatedExpressionField,
        showProgressIndicator,
        canGoBack,
        selectedConnectionKind,
        showProgressSpinner = false,
        progressMessage = "Loading...",
        progressTitle,
        setSidePanelView,
        onClose,
        onSaveAndRefresh,
        onBack,
        onSelectNode,
        onAddConnection,
        onAddFunction,
        onAddWorkflow,
        onAddActivity,
        onAddNPFunction,
        onAddDataMapper,
        onAddAgent,
        onAddModelProvider,
        onAddVectorStore,
        onAddEmbeddingProvider,
        onAddVectorKnowledgeBase,
        onAddDataLoader,
        onAddChunker,
        onSubmitForm,
        onDiscardSuggestions,
        onSubPanel,
        onUpdateExpressionField,
        onResetUpdatedExpressionField,
        onSearchFunction,
        onSearchWorkflow,
        onSearchActivity,
        onSearchNpFunction,
        onSearchTextChange,
        searchText,
        onSearchAll,
        onSearchVectorStore,
        onSearchEmbeddingProvider,
        onSearchVectorKnowledgeBase,
        onSearchDataLoader,
        onSearchChunker,
        onSelectNewConnection,
        onSelectConnectorPopup,
        onUpdateNodeWithConnection,
        agentEditor,
        onNavigateToPanel,
        errorMessage,
        onImportDevantConn,
        onLinkDevantProject,
        onRefreshDevantConnections,
    } = props;

    const findSubPanelComponent = (subPanel: SubPanel) => {
        switch (subPanel.view) {
            case SubPanelView.HELPER_PANEL:
                return (
                    <HelperView
                        filePath={subPanel.props.sidePanelData.filePath}
                        position={subPanel.props.sidePanelData.range}
                        updateFormField={onUpdateExpressionField}
                        editorKey={subPanel.props.sidePanelData.editorKey}
                        onClosePanel={onSubPanel}
                        configurePanelData={subPanel.props.sidePanelData?.configurePanelData}
                    />
                );
            default:
                return null;
        }
    };

    const renderPanelContent = () => {
        switch (sidePanelView) {
            case SidePanelView.NODE_LIST:
                return (
                    <NodeList
                        onSearchTextChange={onSearchTextChange}
                        searchText={searchText}
                        categories={categories}
                        onSelect={onSelectNode}
                        onAddConnection={onAddConnection}
                        onClose={onClose}
                        onImportDevantConn={onImportDevantConn}
                        onLinkDevantProject={onLinkDevantProject}
                        onRefreshDevantConnections={onRefreshDevantConnections}
                    />
                );

            case SidePanelView.FUNCTION_LIST:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onSearchTextChange={(searchText) => onSearchFunction?.(searchText, FUNCTION_TYPE.REGULAR)}
                        onAddFunction={onAddFunction}
                        onClose={onClose}
                        title={"Functions"}
                        searchPlaceholder={"Search library functions"}
                        searchText={searchText}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.WORKFLOW_LIST:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onSearchTextChange={(searchText) => onSearchWorkflow?.(searchText, FUNCTION_TYPE.REGULAR)}
                        onAddFunction={onAddWorkflow}
                        onClose={onClose}
                        title={"Durable Workflows"}
                        searchPlaceholder={"Search durable workflows"}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.ACTIVITY_LIST:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onSearchTextChange={(searchText) => onSearchActivity?.(searchText, FUNCTION_TYPE.REGULAR)}
                        onAddFunction={onAddActivity}
                        onClose={onClose}
                        title={"Activities"}
                        searchPlaceholder={"Search activities"}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.NP_FUNCTION_LIST:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onSearchTextChange={(searchText) => onSearchAll?.(searchText, FUNCTION_TYPE.REGULAR)}
                        onAddFunction={onAddNPFunction}
                        onClose={onClose}
                        title={"Natural Functions"}
                        searchText={searchText}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.DATA_MAPPER_LIST:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onSearchTextChange={(searchText) =>
                            onSearchFunction(searchText, FUNCTION_TYPE.EXPRESSION_BODIED)
                        }
                        onAddFunction={onAddDataMapper}
                        onClose={onClose}
                        title={"Data Mappers"}
                        searchText={searchText}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.AGENT_LIST:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onAdd={onAddAgent}
                        addButtonLabel={"Add Agent"}
                        onClose={onClose}
                        title={"Agents"}
                        searchPlaceholder={"Search agents"}
                        searchText={searchText}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.MODEL_PROVIDER_LIST:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onAdd={onAddModelProvider}
                        addButtonLabel={"Add Model Provider"}
                        onClose={onClose}
                        title={"Model Providers"}
                        searchPlaceholder={"Search model providers"}
                        searchText={searchText}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.MODEL_PROVIDERS:
                return (
                    <CardList
                        categories={categories}
                        onSelect={onSelectNode}
                        onClose={onClose}
                        title={"Model Providers"}
                        searchPlaceholder={"Search model providers"}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.VECTOR_STORE_LIST:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onAdd={onAddVectorStore}
                        addButtonLabel={"Add Vector Store"}
                        onClose={onClose}
                        title={"Vector Stores"}
                        searchPlaceholder={"Search vector stores"}
                        onSearchTextChange={(searchText) => onSearchVectorStore?.(searchText, FUNCTION_TYPE.REGULAR)}
                        searchText={searchText}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.VECTOR_STORES:
                return (
                    <CardList
                        categories={categories}
                        onSelect={onSelectNode}
                        onClose={onClose}
                        title={"Vector Stores"}
                        searchPlaceholder={"Search vector stores"}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.EMBEDDING_PROVIDER_LIST:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onAdd={onAddEmbeddingProvider}
                        addButtonLabel={"Add Embedding Provider"}
                        onClose={onClose}
                        title={"Embedding Providers"}
                        searchPlaceholder={"Search embedding providers"}
                        onSearchTextChange={(searchText) =>
                            onSearchEmbeddingProvider?.(searchText, FUNCTION_TYPE.REGULAR)
                        }
                        searchText={searchText}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.EMBEDDING_PROVIDERS:
                return (
                    <CardList
                        categories={categories}
                        onSelect={onSelectNode}
                        onClose={onClose}
                        title={"Embedding Providers"}
                        searchPlaceholder={"Search embedding providers"}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.KNOWLEDGE_BASE_LIST:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onAdd={onAddVectorKnowledgeBase}
                        addButtonLabel={"Add Knowledge Base"}
                        onClose={onClose}
                        title={"Knowledge Bases"}
                        searchPlaceholder={"Search knowledge bases"}
                        onSearchTextChange={(searchText) =>
                            onSearchVectorKnowledgeBase?.(searchText, FUNCTION_TYPE.REGULAR)
                        }
                        searchText={searchText}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.KNOWLEDGE_BASES:
                return (
                    <CardList
                        categories={categories}
                        onSelect={onSelectNode}
                        onClose={onClose}
                        title={"Knowledge Bases"}
                        searchPlaceholder={"Search knowledge bases"}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.DATA_LOADER_LIST:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onAdd={onAddDataLoader}
                        addButtonLabel={"Add Data Loader"}
                        onClose={onClose}
                        title={"Data Loaders"}
                        searchPlaceholder={"Search data loaders"}
                        onSearchTextChange={(searchText) =>
                            onSearchDataLoader?.(searchText, FUNCTION_TYPE.REGULAR)
                        }
                        searchText={searchText}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.DATA_LOADERS:
                return (
                    <CardList
                        categories={categories}
                        onSelect={onSelectNode}
                        onClose={onClose}
                        title={"Data Loaders"}
                        searchPlaceholder={"Search data loaders"}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.CHUNKER_LIST:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onAdd={onAddChunker}
                        addButtonLabel={"Add Chunker"}
                        onClose={onClose}
                        title={"Chunkers"}
                        searchPlaceholder={"Search chunkers"}
                        onSearchTextChange={(searchText) =>
                            onSearchChunker?.(searchText, FUNCTION_TYPE.REGULAR)
                        }
                        searchText={searchText}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.CHUNKERS:
                return (
                    <CardList
                        categories={categories}
                        onSelect={onSelectNode}
                        onClose={onClose}
                        title={"Chunkers"}
                        searchPlaceholder={"Search chunkers"}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.AGENT_MEMORY_MANAGER:
            case SidePanelView.ADD_TOOL:
            case SidePanelView.NEW_TOOL_CUSTOM:
            case SidePanelView.NEW_TOOL_FROM_CONNECTION:
            case SidePanelView.NEW_TOOL_FROM_FUNCTION:
            case SidePanelView.NEW_TOOL_FROM_AGENT:
            case SidePanelView.NEW_TOOL_FROM_AGENT_FORM:
            case SidePanelView.ADD_MCP_SERVER:
            case SidePanelView.EDIT_MCP_SERVER:
                return agentEditor ? <AgentEditorPanelContent controller={agentEditor} /> : null;

            case SidePanelView.CONNECTION_CONFIG:
                return (
                    <ConnectionConfig
                        fileName={fileName}
                        connectionKind={selectedConnectionKind}
                        selectedNode={selectedNode}
                        onSave={onUpdateNodeWithConnection}
                        onNavigateToSelectionList={() => onNavigateToPanel?.(SidePanelView.CONNECTION_SELECT)}
                    />
                );

            case SidePanelView.CONNECTION_SELECT:
                return <ConnectionSelectionList connectionKind={selectedConnectionKind} onSelect={onSelectNewConnection} />;

            case SidePanelView.CONNECTION_CREATE:
                return (
                    <ConnectionCreator
                        connectionKind={selectedConnectionKind}
                        nodeFormTemplate={nodeFormTemplate}
                        selectedNode={selectedNode}
                        onSave={onUpdateNodeWithConnection}
                    />
                );

            case SidePanelView.ERROR:
                return (
                    <ConnectorErrorView
                        errorMessage={errorMessage}
                        onRetry={onBack}
                    />
                );

            case SidePanelView.LOADING:
                return (
                    <NodeList
                        loading
                        categories={categories}
                        onSelect={onSelectNode}
                        onSelectConnector={onSelectConnectorPopup}
                        onSearchTextChange={onSearchTextChange}
                        searchText={searchText}
                        onClose={onClose}
                        title={"All Components"}
                        searchPlaceholder={"Search all components"}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            case SidePanelView.FORM:
                return (
                    <FlowNodeForm
                        key={selectedNode?.id ?? 'no-node'}
                        fileName={fileName}
                        node={selectedNode}
                        nodeFormTemplate={nodeFormTemplate}
                        connections={connections}
                        clientName={selectedClientName}
                        targetLineRange={targetLineRange}
                        projectPath={projectPath}
                        editForm={editForm}
                        onSubmit={onSubmitForm}
                        showProgressIndicator={showProgressIndicator}
                        subPanelView={subPanel.view}
                        openSubPanel={onSubPanel}
                        updatedExpressionField={updatedExpressionField}
                        resetUpdatedExpressionField={onResetUpdatedExpressionField}
                        //TODO: this should be merged with onSubmit prop
                        handleOnFormSubmit={onSubmitForm}
                        navigateToPanel={onNavigateToPanel}
                    />
                );

            case SidePanelView.ALL:
                return (
                    <NodeList
                        categories={categories}
                        onSelect={onSelectNode}
                        onSelectConnector={onSelectConnectorPopup}
                        onSearchTextChange={onSearchTextChange}
                        searchText={searchText}
                        onClose={onClose}
                        title={"All Components"}
                        searchPlaceholder={"Search all components"}
                        onBack={canGoBack ? onBack : undefined}
                    />
                );

            default:
                return null;
        }
    };

    const onBackCallback = (() => {
        switch (sidePanelView) {
            case SidePanelView.NEW_TOOL_CUSTOM:
            case SidePanelView.NEW_TOOL_FROM_CONNECTION:
            case SidePanelView.NEW_TOOL_FROM_FUNCTION:
            case SidePanelView.NEW_TOOL_FROM_AGENT:
            case SidePanelView.ADD_MCP_SERVER:
                return () => setSidePanelView(SidePanelView.ADD_TOOL);
            case SidePanelView.NEW_TOOL_FROM_AGENT_FORM:
                return () => setSidePanelView(SidePanelView.NEW_TOOL_FROM_AGENT);
            case SidePanelView.CONNECTION_SELECT:
            case SidePanelView.CONNECTION_CREATE:
                return onBack;
            case SidePanelView.FORM:
                return !showEditForm ? onBack : undefined;
            default:
                return undefined;
        }
    })();

    const agentPanelTitle = (() => {
        switch (sidePanelView) {
            case SidePanelView.AGENT_MEMORY_MANAGER:
                return "Configure Memory";
            case SidePanelView.NEW_TOOL_FROM_AGENT_FORM:
                return "Use Agent";
            case SidePanelView.ADD_MCP_SERVER:
                return "Add MCP Server";
            case SidePanelView.EDIT_MCP_SERVER:
                return "Edit MCP Server";
            case SidePanelView.ADD_TOOL:
            case SidePanelView.NEW_TOOL_CUSTOM:
            case SidePanelView.NEW_TOOL_FROM_CONNECTION:
            case SidePanelView.NEW_TOOL_FROM_FUNCTION:
            case SidePanelView.NEW_TOOL_FROM_AGENT:
                return "Add Tool";
            default:
                return undefined;
        }
    })();

    return (
        <PanelContainer
            title={showProgressSpinner && progressTitle
                ? progressTitle
                : agentPanelTitle ?? getContainerTitle(sidePanelView, selectedNode, selectedClientName,
                    selectedConnectionKind)}
            show={showSidePanel}
            onClose={onClose}
            onBack={onBackCallback}
            subPanelWidth={getSubPanelWidth(subPanel)}
            subPanel={findSubPanelComponent(subPanel)}
        >
            <Container onClick={onDiscardSuggestions}>
                {showProgressSpinner ? (
                    <LoaderContainer>
                        <RelativeLoader message={progressMessage} />
                    </LoaderContainer>
                ) : (
                    renderPanelContent()
                )}
            </Container>
        </PanelContainer>
    );
}
