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

import { useCallback, useEffect, useRef, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { NodeList, Category as PanelCategory, FormField, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import {
    BIAvailableNodesRequest,
    Category,
    AvailableNode,
    LineRange,
    EVENT_TYPE,
    MACHINE_VIEW,
    FUNCTION_TYPE,
    ParentPopupData,
    BISearchRequest,
    CodeData,
    AgentToolRequest,
    NodeMetadata,
    FunctionNode,
    FlowNode,
    ToolParameters,
    ToolParametersValue,
    DIRECTORY_MAP,
    Property,
    ToolParameterItem,
    NodeProperties,
    Diagnostic,
    RecordTypeField,
    getPrimaryInputType,
} from "@wso2/ballerina-core";

import {
    convertBICategoriesToSidePanelCategories,
    convertConfig,
    convertFunctionCategoriesToSidePanelCategories,
    convertNodePropertyToFormField,
    filterToolInputSymbolDiagnostics,
    getImportsForProperty
} from "../../../utils/bi";
import ArtifactForm from "../Forms/ArtifactForm";
import { RelativeLoader } from "../../../components/RelativeLoader";
import styled from "@emotion/styled";
import { URI, Utils } from "vscode-uri";
import { cloneDeep } from "lodash";
import { createDefaultParameterValue, createToolInputFields, createToolParameters, prepareToolInputFields } from "./formUtils";
import { FUNCTION_CALL, METHOD_CALL, REMOTE_ACTION_CALL, RESOURCE_ACTION_CALL } from "../../../constants";
import { NewToolSelectionMode } from "./NewTool";
import { fetchOAuthConfigProperties } from "./utils";
import { updateResourcePathProperty } from "./agentTools";

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const ImplementationBadge = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--vscode-foreground);
    margin-bottom: 4px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const ImplementationInfoContainer = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 20px;
    margin-top: -4px;
    border-top: 1px solid var(--vscode-editorWidget-border);
`;

const ImplementationInfo = styled.div`
    display: flex;
    align-items: center;
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-editorWidget-border);
    padding: 10px 10px;
    border-radius: 4px;
    margin-top: 4px;
    overflow: hidden;
    p {
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const ImplementationDescription = styled.span`
    color: var(--vscode-list-deemphasizedForeground)
`;

export enum SidePanelView {
    NODE_LIST = "NODE_LIST",
    TOOL_FORM = "TOOL_FORM",
}

export interface BIFlowDiagramProps {
    agentNode: FlowNode;
    projectPath: string;
    onSubmit: (data: ExtendedAgentToolRequest) => void;
    mode?: NewToolSelectionMode;
    onViewChange?: (view: SidePanelView, navigateBack?: () => void) => void;
    onAgentToolCreated?: (functionName: string) => void;
    onCancel?: () => void;
}

export interface ExtendedAgentToolRequest extends AgentToolRequest {
    functionNode?: FunctionNode;
    flowNode?: FlowNode;
    parameterImports?: { [prefix: string]: string };
}

// Ensure "io", "log", and "time" module functions always appear under "Standard Library",
// even if they've been imported (which moves them to "Imported Functions" from the LS)
const STANDARD_LIB_MODULES = ["io", "log", "time"];
function ensureStandardLibModules(categories: PanelCategory[]): PanelCategory[] {
    const stdLib = categories.find((cat) => cat.title === "Standard Library");
    const imported = categories.find((cat) => cat.title?.includes("Imported"));
    if (!stdLib || !imported) return categories;

    const isCategoryItem = (item: unknown): item is PanelCategory => typeof item === "object" && item !== null && "title" in item;
    const existingModules = new Set(stdLib.items.filter(isCategoryItem).map((item) => item.title));

    for (const name of STANDARD_LIB_MODULES) {
        if (existingModules.has(name)) continue;
        const match = imported.items.find((item) => isCategoryItem(item) && item.title === name);
        if (match) stdLib.items.push({ ...match });
    }

    return categories;
}

// Reorder function categories: move "Imported Functions" to the end
function reorderFunctionCategories(categories: PanelCategory[]): PanelCategory[] {
    const importedIndex = categories.findIndex((cat) => cat.title?.includes("Imported"));
    if (importedIndex !== -1) {
        const [importedCategory] = categories.splice(importedIndex, 1);
        categories.push(importedCategory);
    }
    return categories;
}

const INITIAL_FIELDS: FormField[] = [
    {
        key: `name`,
        label: "Tool Name",
        type: "IDENTIFIER",
        optional: false,
        editable: true,
        documentation: "Enter a unique name for the tool.",
        value: "",
        types: [{ fieldType: "IDENTIFIER", scope: "Global", selected: false }],
        enabled: true,
    },
    {
        key: `description`,
        label: "Description",
        type: "TEXTAREA",
        optional: true,
        editable: true,
        documentation: "Describe what this tool does. The agent uses this to decide when to invoke the tool.",
        value: "",
        types: [{ fieldType: "STRING", selected: false }],
        enabled: true,
    },
];

export function AIAgentSidePanel(props: BIFlowDiagramProps) {
    const { agentNode, projectPath, onSubmit, mode = NewToolSelectionMode.ALL, onViewChange, onAgentToolCreated, onCancel } = props;
    const { rpcClient } = useRpcContext();

    const [sidePanelView, setSidePanelView] = useState<SidePanelView>(SidePanelView.NODE_LIST);
    const [categories, setCategories] = useState<PanelCategory[]>([]);
    const [selectedNodeCodeData, setSelectedNodeCodeData] = useState<CodeData>(undefined);
    const [toolNodeId, setToolNodeId] = useState<string>(undefined);

    const functionNode = useRef<FunctionNode>(null);
    const flowNode = useRef<FlowNode>(null);

    const [loading, setLoading] = useState<boolean>(false);
    const [fields, setFields] = useState<FormField[]>(INITIAL_FIELDS);
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const [showOAuthConfig, setShowOAuthConfig] = useState<boolean>(false);

    const targetRef = useRef<LineRange>({ startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } });
    const initialCategoriesRef = useRef<PanelCategory[]>([]);
    const selectedNodeRef = useRef<AvailableNode>(undefined);
    const agentFilePath = useRef<string>(Utils.joinPath(URI.file(projectPath), agentNode?.codedata?.lineRange?.fileName || "agents.bal").fsPath);
    const functionFilePath = useRef<string>(Utils.joinPath(URI.file(projectPath), "functions.bal").fsPath);
    const parameterFieldsRef = useRef<ToolParameterItem[]>([]);
    const oauthConfigPropertiesRef = useRef<{ key: string; property: Property }[]>([]);
    const isSelectingNodeRef = useRef<boolean>(false);

    // Create custom diagnostic filter for Tool Input parameters
    const customDiagnosticFilter = useCallback((diagnostics: Diagnostic[]) => {
        if (!parameterFieldsRef.current || parameterFieldsRef.current.length === 0) {
            return diagnostics;
        }
        const toolInputs = parameterFieldsRef.current.map(param => ({ type: param.formValues.type, variable: param.formValues.variable }));
        return filterToolInputSymbolDiagnostics(diagnostics, toolInputs);
    }, []);

    useEffect(() => {
        fetchNodes();
    }, []);

    const hasAutoTriggered = useRef(false);
    useEffect(() => {
        if (mode === NewToolSelectionMode.CUSTOM_TOOL && !loading && !hasAutoTriggered.current) {
            hasAutoTriggered.current = true;
            handleOnAddFunction(MACHINE_VIEW.BIAgentToolForm, DIRECTORY_MAP.AGENT_TOOL);
        }
    }, [loading]);

    useEffect(() => {
        if (sidePanelView === SidePanelView.TOOL_FORM) {
            onViewChange?.(SidePanelView.TOOL_FORM, () => {
                setSidePanelView(SidePanelView.NODE_LIST);
                setFields(INITIAL_FIELDS);
                onViewChange?.(SidePanelView.NODE_LIST);
            });
        } else {
            onViewChange?.(SidePanelView.NODE_LIST);
        }
    }, [sidePanelView]);

    const getImplementationString = (codeData: CodeData | undefined): string => {
        if (!codeData) {
            return "";
        }
        switch (codeData.node) {
            case RESOURCE_ACTION_CALL:
                return `${codeData.parentSymbol} -> ${codeData.symbol} ${codeData.resourcePath}`;
            case REMOTE_ACTION_CALL:
                return `${codeData.parentSymbol} -> ${codeData.symbol}`;
            case FUNCTION_CALL:
                return `${codeData.symbol}`;
            case METHOD_CALL:
                return `${codeData.parentSymbol} -> ${codeData.symbol}`;
            default:
                return "";
        }
    };

    // Use effects to refresh the panel
    useEffect(() => {
        rpcClient.onParentPopupSubmitted((parent: ParentPopupData) => {
            console.log(">>> on parent popup submitted", parent);
            if (parent.artifactType === DIRECTORY_MAP.AGENT_TOOL && parent.recentIdentifier) {
                onAgentToolCreated?.(parent.recentIdentifier);
                return;
            }
            if (mode === NewToolSelectionMode.CUSTOM_TOOL && parent.artifactType === DIRECTORY_MAP.AGENT_TOOL) {
                // User dismissed the popup without submitting — navigate back
                onCancel?.();
                return;
            }
            setLoading(true);
            fetchNodes();
        });
    }, [rpcClient]);

    const fetchNodes = async () => {
        setLoading(true);

        // CUSTOM_TOOL mode: skip loading entirely — popup is auto-triggered
        if (mode === NewToolSelectionMode.CUSTOM_TOOL) {
            setLoading(false);
            return;
        }

        // FUNCTION mode: skip getAvailableNodes entirely — connections are not needed
        if (mode === NewToolSelectionMode.FUNCTION) {
            try {
                const filteredFunctions = await handleSearchFunction("", FUNCTION_TYPE.REGULAR, false);
                const categories = reorderFunctionCategories(filteredFunctions || []);
                setCategories(categories);
                initialCategoriesRef.current = categories;
            } catch (error) {
                console.error("Failed to load functions for agent tool", error);
            } finally {
                setLoading(false);
            }
            return;
        }

        try {
            const getNodeRequest: BIAvailableNodesRequest = {
                position: targetRef.current.startLine,
                filePath: agentFilePath.current,
                // TODO: This is currently disabled because it hides nodes that are actually tool compatible
                // due to some inconsistencies in how the compatibility is determined.
                // Need to revisit the logic and ensure it's consistent before enabling this filter
                // queryMap: {
                //     "checkAgentToolCompatibility": "true"
                // }
            };
            const response = await rpcClient.getBIDiagramRpcClient().getAvailableNodes(getNodeRequest);
            if (!response.categories) {
                console.error(">>> Error getting available nodes", response);
                return;
            }
            const connectionsCategory = response.categories.filter(
                (item) => item.metadata.label === "Connections"
            ) as Category[];
            // remove connections which names start with _ underscore or are not tool compatible
            if (connectionsCategory.at(0)?.items) {
                const filteredConnectionsCategory = connectionsCategory
                    .at(0)
                    ?.items.filter((item) => !item.metadata.label.startsWith("_"));
                // filter out tool-incompatible nodes within each sub-category
                filteredConnectionsCategory?.forEach((subCategory) => {
                    if ("items" in subCategory && subCategory.items) {
                        subCategory.items = subCategory.items.filter((node) =>
                            String((node as AvailableNode).codedata?.data?.agentToolCompatible) !== "false"
                        );
                    }
                });
                connectionsCategory.at(0).items = filteredConnectionsCategory;
            }
            const convertedCategories = convertBICategoriesToSidePanelCategories(connectionsCategory);
            console.log("convertedCategories", convertedCategories);

            let filteredCategories: PanelCategory[] = convertedCategories;

            // ALL mode: also fetch functions — CONNECTION mode only needs connections
            if (mode !== NewToolSelectionMode.CONNECTION) {
                const filteredFunctions = await handleSearchFunction("", FUNCTION_TYPE.REGULAR, false);
                filteredCategories = convertedCategories.concat(reorderFunctionCategories(filteredFunctions));
            }

            setCategories(filteredCategories);
            initialCategoriesRef.current = filteredCategories;
        } finally {
            setLoading(false);
        }
    };

    const handleSearchFunction = async (
        searchText: string,
        functionType: FUNCTION_TYPE,
        isSearching: boolean = true
    ) => {
        if (isSearching && !searchText) {
            setCategories(initialCategoriesRef.current); // Reset the categories list when the search input is empty
            return;
        }
        const request: BISearchRequest = {
            position: {
                startLine: targetRef.current.startLine,
                endLine: targetRef.current.endLine,
            },
            filePath: agentFilePath.current,
            queryMap: searchText.trim()
                ? {
                    q: searchText,
                    limit: 12,
                    offset: 0,
                    includeAvailableFunctions: "true",
                }
                : undefined,
            searchKind: "FUNCTION",
        };
        const response = await rpcClient.getBIDiagramRpcClient().search(request);

        const filteredResponse = response.categories.filter((category) => {
            return category.metadata.label !== "Agent Tools";
        });

        // Remove agent tool functions from integration category
        const currentIntegrationCategory = filteredResponse[0];
        if (currentIntegrationCategory && Array.isArray(currentIntegrationCategory.items)) {
            currentIntegrationCategory.items = currentIntegrationCategory.items.filter((item) => {
                return !(item.metadata?.data as NodeMetadata)?.isAgentTool;
            });
        }

        if (isSearching && searchText) {
            setCategories(ensureStandardLibModules(reorderFunctionCategories(convertFunctionCategoriesToSidePanelCategories(filteredResponse, functionType))));
            return;
        }
        if (!response || !filteredResponse) {
            return [];
        }
        return ensureStandardLibModules(convertFunctionCategoriesToSidePanelCategories(filteredResponse, functionType));
    };

    const extractRecordTypeFieldsFromEntries = (entries: { key: string; property: Property }[]): RecordTypeField[] => {
        return entries
            .filter(({ property }) => {
                const primaryInputType = getPrimaryInputType(property?.types);
                return primaryInputType?.typeMembers &&
                    primaryInputType?.typeMembers.some(member => member.kind === "RECORD_TYPE");
            })
            .map(({ key, property }) => ({
                key,
                property,
                recordTypeMembers: getPrimaryInputType(property?.types)?.typeMembers.filter(member => member.kind === "RECORD_TYPE")
            }));
    };

    const extractRecordTypeFields = (properties: NodeProperties): RecordTypeField[] => {
        const entries = Object.entries(properties).map(([key, property]) => ({ key, property }));
        return extractRecordTypeFieldsFromEntries(entries);
    };

    const loadFunctionCallFields = async (node: AvailableNode): Promise<void> => {
        try {
            const functionNodeResponse = await rpcClient.getBIDiagramRpcClient().getFunctionNode({
                functionName: node.codedata.symbol,
                fileName: functionFilePath.current,
                projectPath: projectPath,
            });

            const funcDef = functionNodeResponse.functionDefinition;
            functionNode.current = funcDef;

            let toolInputFields: FormField[] = [];
            if (funcDef?.properties !== undefined) {
                funcDef.properties.parameters.metadata.label = "Tool Inputs";
                funcDef.properties.parameters.metadata.description = "Define the inputs the agent must provide when invoking this tool.";
                toolInputFields = convertConfig(funcDef.properties, ["functionName", "functionNameDescription", "isIsolated", "type", "typeDescription", "isPublic"]);
            }

            const functionNodeTemplate = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                position: funcDef?.codedata.lineRange.startLine || { line: 0, offset: 0 },
                filePath: functionFilePath.current,
                id: node.codedata,
            });

            // Remove imports from optional+advanced properties to avoid unnecessary imports in genTool
            if (functionNodeTemplate.flowNode?.properties) {
                for (const key of Object.keys(functionNodeTemplate.flowNode.properties)) {
                    const prop = (functionNodeTemplate.flowNode.properties as Record<string, any>)[key];
                    if (prop.optional && prop.advanced && prop.imports) {
                        delete prop.imports;
                    }
                }
            }

            let functionParameterFields: FormField[] = [];
            if (toolInputFields.length === 0 && functionNodeTemplate.flowNode?.properties) {
                functionParameterFields = convertConfig(functionNodeTemplate.flowNode.properties, ["variable"], false);
                toolInputFields = createToolInputFields(prepareToolInputFields(functionParameterFields));
                functionNode.current = functionNodeTemplate.flowNode as FunctionNode;
            } else if (functionNodeTemplate.flowNode?.properties) {
                functionParameterFields = convertConfig(functionNodeTemplate.flowNode.properties, ["variable"], false);
                functionParameterFields.forEach((field, idx) => {
                    if (getPrimaryInputType(field.types)?.fieldType === "TYPE") {
                        functionParameterFields[idx].documentation = "The data type this tool will return to the agent.";
                        return;
                    }
                    field.label = `${field.label} Mapping`;
                    if (field.optional == false) {
                        field.value = getPrimaryInputType(field.types)?.fieldType === "REPEATABLE_LIST"
                            ? `[${field.key}]` : field.key;
                    }
                });
            }

            const templateDescription = (functionNodeTemplate.flowNode?.metadata?.description || "")
                .replace(/```[\s\S]*?```/g, "").trim();

            let oauthFields: FormField[] = [];
            const position = funcDef?.codedata.lineRange.startLine || { line: 0, offset: 0 };
            const oauthProperties = await fetchOAuthConfigProperties(rpcClient, functionFilePath.current, position);
            oauthConfigPropertiesRef.current = oauthProperties;
            oauthFields = oauthProperties.map(({ key, property }) =>
                convertNodePropertyToFormField(key, property)
            );
            setShowOAuthConfig(oauthFields.length > 0);

            const nodeRecordTypeFields = functionNodeTemplate.flowNode?.properties
                ? extractRecordTypeFields(functionNodeTemplate.flowNode.properties)
                : [];
            const oauthRecordTypeFields = extractRecordTypeFieldsFromEntries(oauthProperties);
            setRecordTypeFields([...nodeRecordTypeFields, ...oauthRecordTypeFields]);

            setFields((prevFields) => [
                ...prevFields.map((field) =>
                    field.key === "description" ? { ...field, value: templateDescription } : field
                ),
                ...toolInputFields,
                ...functionParameterFields.map(field => ({
                    ...field,
                    value: typeof field.value === 'string' ? field.value.replace(/^\$/, '') : field.value
                })),
                ...oauthFields,
            ]);
        } catch (error) {
            console.error(">>> Error fetching function node or template", error);
        }
    };

    const loadConnectionCallFields = async (node: AvailableNode): Promise<void> => {
        try {
            const nodeTemplate = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                position: { line: 0, offset: 0 },
                filePath: agentFilePath.current,
                id: node.codedata,
            });

            if (nodeTemplate.flowNode) {
                // Remove imports from optional+advanced properties to avoid unnecessary imports in genTool
                if (nodeTemplate.flowNode.properties) {
                    for (const key of Object.keys(nodeTemplate.flowNode.properties)) {
                        const prop = (nodeTemplate.flowNode.properties as Record<string, any>)[key];
                        if (prop.optional && prop.advanced && prop.imports) {
                            delete prop.imports;
                        }
                    }
                }
                flowNode.current = nodeTemplate.flowNode;
            } else {
                console.error("Node template flowNode not found");
            }

            const nodeParameterFields = nodeTemplate.flowNode?.properties
                ? convertConfig(nodeTemplate.flowNode.properties)
                : [];

            const toolInputFields = createToolInputFields(prepareToolInputFields(nodeParameterFields));
            const templateDescription = (nodeTemplate.flowNode?.metadata?.description || "")
                .replace(/```[\s\S]*?```/g, "").trim();
            let oauthFields: FormField[] = [];
            const oauthProperties = await fetchOAuthConfigProperties(rpcClient, agentFilePath.current);
            oauthConfigPropertiesRef.current = oauthProperties;
            oauthFields = oauthProperties.map(({ key, property }) =>
                convertNodePropertyToFormField(key, property)
            );
            setShowOAuthConfig(oauthFields.length > 0);

            const nodeRecordTypeFields = nodeTemplate.flowNode?.properties
                ? extractRecordTypeFields(nodeTemplate.flowNode.properties)
                : [];
            const oauthRecordTypeFields = extractRecordTypeFieldsFromEntries(oauthProperties);
            setRecordTypeFields([...nodeRecordTypeFields, ...oauthRecordTypeFields]);

            setFields((prevFields) => [
                ...prevFields.map((field) =>
                    field.key === "description" ? { ...field, value: templateDescription } : field
                ),
                ...toolInputFields,
                ...nodeParameterFields.map(field => ({
                    ...field,
                    value: typeof field.value === 'string' ? field.value.replace(/^\$/, '') : field.value
                })),
                ...oauthFields,
            ]);
        } catch (error) {
            console.error(">>> Error fetching node template", error);
        }
    };

    const handleOnSelectNode = async (nodeId: string, metadata?: any) => {
        if (isSelectingNodeRef.current) return;
        isSelectingNodeRef.current = true;
        setLoading(true);

        try {
            const { node } = metadata as { node: AvailableNode };
            setToolNodeId(nodeId);
            selectedNodeRef.current = node;
            setSelectedNodeCodeData(node.codedata);

            if (nodeId === FUNCTION_CALL) {
                await loadFunctionCallFields(node);
            } else if (nodeId === REMOTE_ACTION_CALL || nodeId === RESOURCE_ACTION_CALL || nodeId === METHOD_CALL) {
                await loadConnectionCallFields(node);
            }

            setSidePanelView(SidePanelView.TOOL_FORM);
        } finally {
            setLoading(false);
            isSelectingNodeRef.current = false;
        }
    };

    const handleOnAddConnection = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.AddConnectionWizard,
                documentUri: agentFilePath.current,
            },
            isPopup: true,
        });
    };

    const handleOnAddFunction = (view: MACHINE_VIEW, artifactType: DIRECTORY_MAP) => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: view,
                artifactType: artifactType,
            },
            isPopup: true,
        });
    };

    const updateToolParameters = (params: ToolParameterItem[], baseParams?: ToolParameters): ToolParameters => {
        const newToolParameters = baseParams ? cloneDeep(baseParams) : createToolParameters();
        const paramKeys = params.map((param: ToolParameterItem) => param.formValues.variable);

        if (newToolParameters.value && typeof newToolParameters.value === "object" && !Array.isArray(newToolParameters.value)) {
            // Remove keys that are no longer present
            Object.keys(newToolParameters.value).forEach((key) => {
                if (!paramKeys.includes(key)) {
                    delete (newToolParameters.value as ToolParametersValue)[key];
                }
            });

            // Add or update parameters
            paramKeys.forEach((key: string) => {
                const paramData = params.find((param: ToolParameterItem) => param.formValues.variable === key)?.formValues;
                const existingParam = (newToolParameters.value as ToolParametersValue)[key];

                if (existingParam?.value?.variable) {
                    existingParam.value.variable.value = paramData?.variable || key;
                    existingParam.value.parameterDescription.value = paramData?.parameterDescription || "";
                    existingParam.value.type.value = paramData?.type || "";
                } else {
                    (newToolParameters.value as ToolParametersValue)[key] = createDefaultParameterValue({
                        value: paramData?.variable || key,
                        parameterDescription: paramData?.parameterDescription,
                        type: paramData?.type,
                    });
                }
            });
        }
        return newToolParameters;
    };

    const handleToolSubmit = (data: FormValues, formImports?: FormImports) => {
        // Safely convert name to camelCase, handling any input
        const name = data["name"] || "";
        const cleanName = name.trim().replace(/[^a-zA-Z0-9]/g, "") || "newTool";

        // HACK: Remove code blocks and new lines from description fields
        if (data.description) {
            data.description = data.description.replace(/```[\s\S]*?```/g, "").replace(/\n/g, " ").trim();
        }

        console.log(">>> handleToolSubmit", { data });
        console.log(">>> toolNodeId", { toolNodeId });
        console.log(">>> functionNode", { functionNode });
        console.log(">>> flowNode", { flowNode });

        let toolParameters: ToolParameters | null = null;
        let clonedFunctionNode: FunctionNode | null = null;
        let clonedFlowNode: FlowNode | null = null;

        if (toolNodeId === FUNCTION_CALL && Array.isArray(data["parameters"])) {
            clonedFunctionNode = functionNode.current ? cloneDeep(functionNode.current) : null;
            const existingParameters = clonedFunctionNode?.properties?.parameters;
            toolParameters = updateToolParameters(data["parameters"], existingParameters as unknown as ToolParameters | undefined);

            if (existingParameters) {
                // User-defined function: update parameter values in the cloned function node
                const parametersValue = existingParameters.value;
                if (parametersValue && typeof parametersValue === "object" && !Array.isArray(parametersValue)) {
                    Object.keys(parametersValue).forEach((key) => {
                        const paramValue = data[key];
                        if ((parametersValue as ToolParametersValue)[key]?.value?.variable) {
                            (parametersValue as ToolParametersValue)[key].value.variable.value = paramValue;
                        }
                    });
                }
            } else if (clonedFunctionNode?.properties) {
                // Library function: the template flowNode has no parameters property,
                // so inject the constructed toolParameters so genTool can read it
                (clonedFunctionNode.properties as any).parameters = toolParameters;
            }

            // Update mapping field values from form data into the function node properties
            if (clonedFunctionNode?.properties) {
                const props = clonedFunctionNode.properties as Record<string, Property>;
                Object.keys(props).forEach((key) => {
                    if (key === "parameters") return; // already handled above
                    const formValue = data[key];
                    if (formValue !== undefined && props[key]) {
                        props[key] = { ...props[key], value: formValue };
                    }
                });
            }
        } else if ((toolNodeId === REMOTE_ACTION_CALL || toolNodeId === RESOURCE_ACTION_CALL || toolNodeId === METHOD_CALL) && Array.isArray(data["parameters"])) {
            clonedFlowNode = flowNode.current ? cloneDeep(flowNode.current) : null;
            toolParameters = updateToolParameters(data["parameters"]);

            // Update flowNode parameter values from data["parameters"]
            if (clonedFlowNode?.properties && typeof clonedFlowNode?.properties === "object" && !Array.isArray(clonedFlowNode?.properties)) {
                const newProperties = { ...clonedFlowNode.properties } as Record<string, Property>;
                Object.keys(newProperties).forEach((key) => {
                    const paramValue = data[key];
                    if (paramValue !== undefined && newProperties[key]) {
                        newProperties[key] = {
                            ...newProperties[key],
                            value: paramValue
                        };
                    }
                    // Update resourcePath for RESOURCE_ACTION_CALL nodes
                    if (toolNodeId === RESOURCE_ACTION_CALL) {
                        const resourcePathProperty = newProperties["resourcePath"];
                        if (resourcePathProperty) {
                            newProperties["resourcePath"] = updateResourcePathProperty(
                                resourcePathProperty,
                                key,
                                paramValue
                            );
                        }
                    }
                });
                clonedFlowNode.properties = newProperties as NodeProperties;
            }
        }

        if (clonedFlowNode?.properties?.variable?.value == "") {
            clonedFlowNode.properties.variable.value = flowNode.current?.properties?.variable?.value || cleanName + "Result";
        }

        // Inject OAuth client config into codedata.data.auth
        const targetNode = clonedFunctionNode || clonedFlowNode;
        if (targetNode && showOAuthConfig) {
            const config: Record<string, string> = {};
            for (const { key } of oauthConfigPropertiesRef.current) {
                const formValue = data[key];
                if (formValue !== undefined && formValue !== "") {
                    config[key] = String(formValue);
                }
            }
            if (Object.keys(config).length > 0) {
                targetNode.codedata.data = {
                    ...targetNode.codedata.data,
                    auth: JSON.stringify(config),
                };
            }
        }

        console.log(">>> toolParameters", { toolParameters });
        console.log(">>> clonedFunctionNode", { clonedFunctionNode });
        console.log(">>> clonedFlowNode", { clonedFlowNode });

        // Extract parameter type imports so they can be added after genTool
        const paramImports = formImports ? getImportsForProperty("parameters", formImports) : undefined;

        const toolModel: ExtendedAgentToolRequest = {
            toolName: cleanName,
            description: data["description"],
            selectedCodeData: selectedNodeCodeData,
            toolParameters: toolParameters,
            functionNode: clonedFunctionNode,
            flowNode: clonedFlowNode,
            parameterImports: paramImports,
        };
        console.log("New Agent Tool:", toolModel);
        onSubmit(toolModel);
    };

    let searchPlaceholder = "Search";
    if (mode === NewToolSelectionMode.CONNECTION) {
        searchPlaceholder = "Search connections";
    } else if (mode === NewToolSelectionMode.FUNCTION) {
        searchPlaceholder = "Search functions";
    }

    return (
        <>
            {loading && (
                <LoaderContainer>
                    <RelativeLoader />
                </LoaderContainer>
            )}
            {!loading && sidePanelView === SidePanelView.NODE_LIST && categories?.length > 0 && (
                <NodeList
                    categories={categories}
                    onSelect={handleOnSelectNode}
                    onAddConnection={handleOnAddConnection}
                    onAddFunction={() => handleOnAddFunction(MACHINE_VIEW.BIFunctionForm, DIRECTORY_MAP.FUNCTION)}
                    onSearchTextChange={mode !== NewToolSelectionMode.CONNECTION ? (searchText) => handleSearchFunction(searchText, FUNCTION_TYPE.REGULAR, true) : undefined}
                    title={"Functions"}
                    searchPlaceholder={searchPlaceholder}
                    panelBodySx={{ height: "calc(100vh - 140px)" }}
                    alwaysCollapsedCategories={["Imported Functions"]}
                />
            )}
            {sidePanelView === SidePanelView.TOOL_FORM && (
                <ArtifactForm
                    preserveFieldOrder={false}
                    fileName={agentFilePath.current}
                    targetLineRange={{ startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } }}
                    fields={fields}
                    recordTypeFields={recordTypeFields}
                    onSubmit={handleToolSubmit}
                    submitText={"Save Tool"}
                    helperPaneSide="left"
                    customDiagnosticFilter={customDiagnosticFilter}
                    onChange={(fieldKey, value) => {
                        if (fieldKey === "parameters") {
                            parameterFieldsRef.current = value as ToolParameterItem[];
                            return;
                        }
                    }}
                    injectedComponents={[
                        {
                            component: (
                                <ImplementationBadge title={getImplementationString(selectedNodeRef.current.codedata)}>
                                    {selectedNodeRef.current.metadata?.icon && (
                                        <img
                                            src={selectedNodeRef.current.metadata.icon}
                                            style={{ width: 14, height: 14 }}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                        />
                                    )}
                                    {getImplementationString(selectedNodeRef.current.codedata)}
                                </ImplementationBadge>
                            ),
                            index: 0,
                        },
                        {
                            component: (
                                <ImplementationInfoContainer>
                                    <p style={{ margin: "0px", fontWeight: "bold" }}>Implementation</p>
                                    <ImplementationDescription>Configure how tool inputs map to the {mode === NewToolSelectionMode.CONNECTION ? "connection" : "function"}.</ImplementationDescription>
                                    <ImplementationInfo title={getImplementationString(selectedNodeRef.current.codedata)}>
                                        <p>{getImplementationString(selectedNodeRef.current.codedata)}</p>
                                    </ImplementationInfo>
                                </ImplementationInfoContainer>
                            ),
                            index: 3,
                        },
                        ...(showOAuthConfig ? [{
                            component: (
                                <ImplementationInfoContainer>
                                    <p style={{ margin: "0px", fontWeight: "bold" }}>OAuth Client Configuration</p>
                                    <ImplementationDescription>Represents the OAuth 2.0 client configuration required to interact with an external Authorization Server and validate issued access tokens.</ImplementationDescription>
                                </ImplementationInfoContainer>
                            ),
                            index: fields.filter((f) => f.advanced && !f.hidden).length - oauthConfigPropertiesRef.current.length,
                            advanced: true,
                        }] : []),
                    ]}
                />
            )}
        </>
    );
}
