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
import {
    Category as PanelCategory,
    Node as PanelNode,
    Item as PanelItem,
    FormField,
    FormValues,
    ParameterValue,
    Parameter,
    FormImports,
} from "@wso2/ballerina-side-panel";
import { findCurrentIntegrationCategory, normalizeFunctionSearchCategories } from "./function-category";
import { AddNodeVisitor, RemoveNodeVisitor, NodeIcon, traverseFlow, ConnectorIcon, AIModelIcon } from "@wso2/bi-diagram";
import {
    Category,
    AvailableNode,
    NodeProperties,
    NodePropertyKey,
    FlowNode,
    Property,
    Flow,
    Branch,
    LineRange,
    ExpressionCompletionItem,
    Trigger,
    FunctionField,
    SignatureHelpResponse,
    VisibleType,
    VisibleTypeItem,
    Item,
    FunctionKind,
    functionKinds,
    FUNCTION_TYPE,
    FunctionNode,
    FocusFlowDiagramView,
    FOCUS_FLOW_DIAGRAM_VIEW,
    Imports,
    ColorThemeKind,
    CompletionInsertText,
    SubPanel,
    SubPanelView,
    NodeMetadata,
    Type,
    getPrimaryInputType,
    isTemplateType,
    DropdownType,
    isDropDownType,
    InputType,
    CodeData,
} from "@wso2/ballerina-core";
import {
    HelperPaneVariableInfo,
    HelperPaneFunctionInfo,
    HelperPaneFunctionCategory,
    HelperPaneCompletionItem,
} from "@wso2/ballerina-side-panel";
import { SidePanelView } from "../views/BI/FlowDiagram/PanelManager";
import { cloneDeep } from "lodash";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import hljs from "highlight.js";
import { COMPLETION_ITEM_KIND, CompletionItem, CompletionItemKind, convertCompletionItemKind, FnSignatureDocumentation, Icon } from "@wso2/ui-toolkit";
import { FunctionDefinition, STNode } from "@wso2/syntax-tree";
import { DocSection } from "../components/ExpressionEditor";

// @ts-ignore
import ballerina from "../languages/ballerina.js";
import { FUNCTION_REGEX } from "../resources/constants";
import { ConnectionKind, getConnectionKindConfig } from "../components/ConnectionSelector";
import { ConnectionListItem } from "@wso2/wso2-platform-core";
import { handleRepeatableProperty } from "./node-property-utils";
export { updateNodeProperties } from "./node-property-utils";
hljs.registerLanguage("ballerina", ballerina);

export const BALLERINA_INTEGRATOR_ISSUES_URL = "https://github.com/wso2/product-ballerina-integrator/issues";

function convertAvailableNodeToPanelNode(
    node: AvailableNode,
    functionType?: FUNCTION_TYPE,
    connectorType?: string
): PanelNode {
    // Check if node should be filtered based on function type
    if (functionType === FUNCTION_TYPE.REGULAR && (node.metadata.data as NodeMetadata)?.isDataMappedFunction) {
        return undefined;
    }
    if (functionType === FUNCTION_TYPE.EXPRESSION_BODIED && !(node.metadata.data as NodeMetadata)?.isDataMappedFunction) {
        return undefined;
    }

    const isDBConnection = connectorType === "persist" || connectorType === "Database";

    // Return common panel node structure
    return {
        id: node.codedata.node,
        label: node.metadata.label,
        description: node.metadata.description,
        enabled: node.enabled,
        metadata: node,
        icon: node.codedata.node === "NEW_CONNECTION" ? (
            <ConnectorIcon
                url={node.metadata.icon}
                style={{ width: "16px", height: "16px", fontSize: "16px" }}
                codedata={node.codedata}
                connectorType={(node.metadata.data as NodeMetadata)?.connectorType}
                fallbackIcon={
                    <NodeIcon
                        type={functionType === FUNCTION_TYPE.EXPRESSION_BODIED ? "DATA_MAPPER_CALL" : node.codedata.node}
                        size={16}
                    />
                }
            />
        ) : (
            <NodeIcon
                type={functionType === FUNCTION_TYPE.EXPRESSION_BODIED ? "DATA_MAPPER_CALL" : node.codedata.node}
                size={16}
                isDBConnection={isDBConnection}
            />
        ),
    };
}


function convertDiagramCategoryToSidePanelCategory(category: Category, functionType?: FUNCTION_TYPE): PanelCategory {
    const connectorType = (category?.metadata?.data as NodeMetadata)?.connectorType;

    const items: PanelItem[] = category.items
        ?.map((item) => {
            if ("codedata" in item) {
                return convertAvailableNodeToPanelNode(item as AvailableNode, functionType, connectorType);
            } else {
                return convertDiagramCategoryToSidePanelCategory(item as Category, functionType);
            }
        })
        .filter((item) => {
            if (item === undefined) {
                return false;
            }
            if ((item as PanelCategory).items !== undefined) {
                // Always keep subcategories that represent the current integration, even if empty
                const title = (item as PanelCategory).title;
                if (title?.toLowerCase().endsWith("(current integration)")) {
                    return true;
                }
                // For other categories, use recursive check to see if they have any functions
                return (item as PanelCategory).items.length > 0;
            }
            return true;
        });

    const icon = category.items.at(0)?.metadata.icon;
    const codedata = (category.items.at(0) as AvailableNode)?.codedata;

    return {
        title: category.metadata.label,
        description: category.metadata.description,
        icon: <ConnectorIcon url={icon} style={{ width: "20px", height: "20px", fontSize: "20px" }} codedata={codedata} connectorType={connectorType} />,
        items: items,
    };
}

/** Map devant connection details with BI connection and to figure out which Devant connection are not used */
export function enrichCategoryWithDevant(
    connections: ConnectionListItem[] = [],
    panelCategories: PanelCategory[] = [],
    importingConn?: ConnectionListItem
): PanelCategory[] {
    const updated = panelCategories?.map((category) => {
        if (category.title === "Connections") {
            const usedConnIds: string[] = [];
            const mappedCategoryItems = category.items?.map((categoryItem) => {
                const matchingDevantConn = connections.find((conn) => conn.name?.replaceAll("-", "_").replaceAll(" ", "_") === (categoryItem as PanelCategory)?.title)
                if(matchingDevantConn) {
                    usedConnIds.push(matchingDevantConn.groupUuid);
                    return { ...categoryItem, devant: matchingDevantConn, unusedDevantConn: false }
                }
                return categoryItem;
            });
            const unusedCategoryItems: PanelCategory[] = connections
                .filter((conn) => !usedConnIds.includes(conn.groupUuid))
                .map((conn) => ({
                    title: conn.name?.replaceAll("-","_").replaceAll(" ","_"),
                    items: [] as PanelItem[],
                    description: "Unused WSO2 Cloud Connection",
                    devant: conn,
                    unusedDevantConn: true,
                    isLoading: importingConn?.name === conn.name,
                }));
            return {
                ...category,
                items: [...mappedCategoryItems, ...unusedCategoryItems],
            };
        }
        return category;
    });
    return updated;
}

export function convertBICategoriesToSidePanelCategories(categories: Category[]): PanelCategory[] {
    const panelCategories = categories.map((category) => convertDiagramCategoryToSidePanelCategory(category));
    const connectorCategory = panelCategories.find((category) => category.title === "Connections");
    if (connectorCategory && !connectorCategory.items.length) {
        connectorCategory.description = "No connections available. Click below to add a new connector.";
    }
    return panelCategories;
}

export function convertFunctionCategoriesToSidePanelCategories(
    categories: Category[],
    functionType: FUNCTION_TYPE
): PanelCategory[] {
    const panelCategories = normalizeFunctionSearchCategories(categories)
        .filter((category) => category.metadata.label !== "Agent Tools")
        .map((category) => convertDiagramCategoryToSidePanelCategory(category, functionType))
        .filter((category) => category !== undefined);
    const functionCategory = findCurrentIntegrationCategory(panelCategories);
    if (functionCategory && !functionCategory.items.length) {
        functionCategory.description = "No functions defined. Click below to create a new function.";
    }
    return panelCategories;
}

export function convertAgentCategoriesToSidePanelCategories(categories: Category[]): PanelCategory[] {
    return convertCategoriesToSidePanelCategoriesWithIcon(categories, (codedata, iconUrl) => (
        <ConnectorIcon
            url={iconUrl}
            codedata={codedata}
            fallbackIcon={<Icon name="bi-ai-agent" sx={{ width: 20, height: 20, fontSize: 20 }} />}
            style={{ width: "20px", height: "20px", fontSize: "20px" }}
        />
    ));
}

export function convertModelProviderCategoriesToSidePanelCategories(categories: Category[]): PanelCategory[] {
    const panelCategories = categories.map((category) => convertDiagramCategoryToSidePanelCategory(category));
    panelCategories.forEach((category) => {
        category.items?.forEach((item) => {
            if ((item as PanelNode).metadata?.codedata) {
                const codedata = (item as PanelNode).metadata.codedata;
                const iconUrl = (item as PanelNode)?.metadata?.metadata?.icon;
                const iconType = codedata?.module == "ai" ? codedata.object : codedata?.module;
                item.icon = <AIModelIcon type={iconType} codedata={codedata} iconUrl={iconUrl} />;
            } else if (((item as PanelCategory).items.at(0) as PanelNode)?.metadata?.codedata) {
                const codedata = ((item as PanelCategory).items.at(0) as PanelNode)?.metadata.codedata;
                const iconUrl = ((item as PanelCategory).items.at(0) as PanelNode)?.metadata?.metadata?.icon;
                const iconType = codedata?.module == "ai" ? codedata.object : codedata?.module;
                item.icon = <AIModelIcon type={iconType} codedata={codedata} iconUrl={iconUrl} />;
            }
        });
    });
    return panelCategories;
}

export function convertVectorStoreCategoriesToSidePanelCategories(categories: Category[]): PanelCategory[] {
    return convertCategoriesToSidePanelCategoriesWithIcon(categories, (codedata, iconUrl) => {
        return <AIModelIcon type={codedata?.module} codedata={codedata} iconUrl={iconUrl} />;
    });
}

export function convertEmbeddingProviderCategoriesToSidePanelCategories(categories: Category[]): PanelCategory[] {
    return convertModelProviderCategoriesToSidePanelCategories(categories);
}

export function convertKnowledgeBaseCategoriesToSidePanelCategories(categories: Category[]): PanelCategory[] {
    return convertCategoriesToSidePanelCategoriesWithIcon(categories, (codedata, iconUrl) => {
        if ((codedata?.module as string)?.includes("azure")) {
            return <AIModelIcon type="ai.azure" iconUrl={iconUrl} />;
        }
        if (codedata?.module === "ai") {
            return <NodeIcon type="KNOWLEDGE_BASE" size={18} />;
        }
        return <AIModelIcon type={codedata?.module} codedata={codedata} iconUrl={iconUrl} />;
    });
}

export function convertCategoriesToSidePanelCategoriesWithIcon(
    categories: Category[],
    iconFactory: (codedata: any, iconUrl?: string) => React.ReactElement
): PanelCategory[] {
    const panelCategories = categories.map((category) => convertDiagramCategoryToSidePanelCategory(category));
    panelCategories.forEach((category) => {
        category.items?.forEach((item) => {
            if ((item as PanelNode).metadata?.codedata) {
                const codedata = (item as PanelNode).metadata.codedata;
                const iconUrl = (item as PanelNode)?.metadata?.metadata?.icon;
                item.icon = iconFactory(codedata, iconUrl);
            } else if (((item as PanelCategory).items.at(0) as PanelNode)?.metadata?.codedata) {
                const codedata = ((item as PanelCategory).items.at(0) as PanelNode)?.metadata.codedata;
                const iconUrl = ((item as PanelCategory).items.at(0) as PanelNode)?.metadata?.metadata?.icon;
                item.icon = iconFactory(codedata, iconUrl);
            }
        });
    });
    return panelCategories;
}

export function convertDataLoaderCategoriesToSidePanelCategories(categories: Category[]): PanelCategory[] {
    return convertCategoriesToSidePanelCategoriesWithIcon(categories, (codedata, iconUrl) => {
        if (iconUrl && codedata?.module !== "ai" && codedata?.module !== "ai.devant") return <img src={iconUrl} style={{ width: 24, height: 24 }} />;
        return <NodeIcon type={codedata?.node} size={24} />;
    });
}

export function convertChunkerCategoriesToSidePanelCategories(categories: Category[]): PanelCategory[] {
    return convertCategoriesToSidePanelCategoriesWithIcon(categories, (codedata, iconUrl) => {
        if (iconUrl && codedata?.module !== "ai" && codedata?.module !== "ai.devant") return <img src={iconUrl} style={{ width: 24, height: 24 }} />;
        return <NodeIcon type={codedata?.node} size={24} />;
    });
}

export function convertMemoryStoreCategoriesToSidePanelCategories(categories: Category[]): PanelCategory[] {
    return convertCategoriesToSidePanelCategoriesWithIcon(categories, (codedata, iconUrl) => {
        return <AIModelIcon type={codedata?.module} codedata={codedata} iconUrl={iconUrl} />;
    });
}

export {
    convertNodePropertiesToFormFields,
    convertNodePropertyToFormField,
    // convertConfig moved to node-property-utils (unit-tested there); re-exported so
    // existing `utils/bi` importers are unaffected.
    convertConfig,
    DEFAULT_MODEL_PROVIDER_ITEM,
} from "./node-property-utils";

export function getFormProperties(flowNode: FlowNode): NodeProperties {
    if (flowNode.properties) {
        return flowNode.properties;
    }

    if (flowNode.branches?.at(0)?.properties) {
        // TODO: Handle multiple branches
        return flowNode.branches.at(0).properties;
    }

    return {};
}

export function getRegularFunctions(functions: Category[]): Category[] {
    return functions;
}

export function getDataMappingFunctions(functions: Category[]): Category[] {
    return functions
        .filter((category) => category.metadata.label === "Current Integration")
        .filter((category) => category.items.length > 0);
}


function getConnectionDisplayName(connectionKind?: ConnectionKind): string {
    if (!connectionKind) return 'Connection';
    try {
        const config = getConnectionKindConfig(connectionKind);
        return config.displayName;
    } catch {
        return 'Connection';
    }
}

export function getContainerTitle(view: SidePanelView, activeNode: FlowNode, clientName?: string, connectionKind?: ConnectionKind): string {
    switch (view) {
        case SidePanelView.NODE_LIST:
            return ""; // Show switch instead of title
        case SidePanelView.CONNECTION_CONFIG:
            return `Configure ${getConnectionDisplayName(connectionKind)}`;
        case SidePanelView.CONNECTION_SELECT:
            return `Select ${getConnectionDisplayName(connectionKind)}`;
        case SidePanelView.CONNECTION_CREATE:
            return `Create ${getConnectionDisplayName(connectionKind)}`;
        case SidePanelView.ERROR:
            return "Error";
        case SidePanelView.LOADING:
            return "";
        case SidePanelView.FORM:
            if (!activeNode) {
                return "";
            }
            if (activeNode.codedata?.node === "AGENT_CALL" || activeNode.codedata?.node === "AGENT_RUN") {
                return `AI Agent`;
            }
            if (activeNode.codedata?.node === "KNOWLEDGE_BASE" && activeNode.codedata?.object === "VectorKnowledgeBase") {
                return `ai: Vector Knowledge Base`;
            }
            if (
                activeNode.codedata?.node === "REMOTE_ACTION_CALL" ||
                activeNode.codedata?.node === "RESOURCE_ACTION_CALL"
            ) {
                return `${clientName || activeNode.properties.connection.value} → ${activeNode.metadata.label}`;
            } else if (activeNode.codedata?.node === "DATA_MAPPER_CALL") {
                return `${activeNode.codedata?.module ? activeNode.codedata?.module + " :" : ""} ${activeNode.codedata.symbol
                    }`;
            }
            return `${activeNode.codedata?.module ? activeNode.codedata?.module + " :" : ""} ${activeNode.metadata.label
                }`;
        default:
            return "";
    }
}

export function addDraftNodeToDiagram(flowModel: Flow, parent: FlowNode | Branch, target: LineRange) {
    const newFlowModel = cloneDeep(flowModel);
    console.log(">>> addDraftNodeToDiagram", { newFlowModel, parent, target });

    const draftNode: FlowNode = {
        id: "draft",
        metadata: {
            label: "Draft",
            description: "Draft Node",
        },
        codedata: {
            node: "DRAFT",
            lineRange: {
                fileName: newFlowModel.fileName,
                ...target,
            },
        },
        branches: [],
        returning: false,
    };

    const addNodeVisitor = new AddNodeVisitor(newFlowModel, parent as FlowNode, draftNode);
    traverseFlow(newFlowModel, addNodeVisitor);
    const newFlow = addNodeVisitor.getUpdatedFlow();
    console.log(">>> new model with draft node", { newFlow });
    return newFlow;
}

export function removeDraftNodeFromDiagram(flowModel: Flow) {
    const newFlowModel = cloneDeep(flowModel);
    const draftNodeId = "draft";
    console.log(">>> removeDraftNodeFromDiagram", newFlowModel, draftNodeId);
    const removeNodeVisitor = new RemoveNodeVisitor(newFlowModel, draftNodeId);
    traverseFlow(newFlowModel, removeNodeVisitor);
    const newFlow = removeNodeVisitor.getUpdatedFlow();
    return newFlow;
}

export function enrichFormTemplatePropertiesWithValues(
    formProperties: NodeProperties,
    formTemplateProperties: NodeProperties
) {
    const enrichedFormTemplateProperties = cloneDeep(formTemplateProperties);

    const hasConfiguredDropdownOptions = (property?: Property) =>
        property?.types?.some((type) =>
            type &&
            "options" in type &&
            (type.fieldType === "SINGLE_SELECT" || type.fieldType === "MULTIPLE_SELECT") &&
            Array.isArray(type.options) &&
            type.options.length > 0
        ) ?? false;

    for (const key in formProperties) {
        if (formProperties.hasOwnProperty(key)) {
            const formProperty = formProperties[key as NodePropertyKey];
            if (
                formProperty &&
                enrichedFormTemplateProperties[key as NodePropertyKey] != null
            ) {
                // Copy the value from formProperties to formTemplateProperties
                enrichedFormTemplateProperties[key as NodePropertyKey].value = formProperty.value;

                if (formProperty.hasOwnProperty('editable')) {
                    enrichedFormTemplateProperties[key as NodePropertyKey].editable = formProperty.editable;
                    enrichedFormTemplateProperties[key as NodePropertyKey].codedata = formProperty?.codedata;
                }

                if (formProperty.diagnostics) {
                    enrichedFormTemplateProperties[key as NodePropertyKey].diagnostics = formProperty.diagnostics;
                }

                if (formProperty.types) {
                    const templateProperty = enrichedFormTemplateProperties[key as NodePropertyKey];
                    const preserveTemplateDropdown =
                        hasConfiguredDropdownOptions(templateProperty) &&
                        !hasConfiguredDropdownOptions(formProperty);

                    if (!preserveTemplateDropdown) {
                        enrichedFormTemplateProperties[key as NodePropertyKey].types = formProperty.types;
                    }
                }
            }
        }
    }

    // Map individual activity args from the `args` map expression to their matching template param fields.
    // The flow model stores all args as a single map string (e.g. `{str1: string `abc 123`}`),
    // while the nodeTemplate exposes each param as its own top-level field (e.g. `str1`).
    const argsProperty = formProperties["args" as NodePropertyKey];
    if (argsProperty && typeof argsProperty.value === "string") {
        const parsedArgs = parseBalMapExpression(argsProperty.value as string);
        for (const [key, value] of Object.entries(parsedArgs)) {
            if (enrichedFormTemplateProperties[key as NodePropertyKey] != null) {
                enrichedFormTemplateProperties[key as NodePropertyKey].value = value;
            }
        }
    }

    return enrichedFormTemplateProperties;
}

/**
 * Parses a Ballerina map literal expression (e.g. `{str1: string `abc 123`, count: 5}`)
 * and returns a plain key→value record. Handles template strings, quoted strings, and
 * simple nested records, but is not a full Ballerina parser.
 */
function parseBalMapExpression(mapStr: string): Record<string, string> {
    const result: Record<string, string> = {};
    const trimmed = mapStr.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
        return result;
    }
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return result;

    // Match: identifier : value
    // Values may contain: template strings (`...`), quoted strings ("..." | '...'),
    // nested records ({...}), or plain tokens — stopping at a top-level comma.
    const regex = /(\w+)\s*:\s*((?:`[^`]*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\{[^}]*\}|[^,])+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(inner)) !== null) {
        result[match[1].trim()] = match[2].trim();
    }
    return result;
}

function getEnrichedValue(kind: CompletionItemKind, value: string): CompletionInsertText {
    if (kind === COMPLETION_ITEM_KIND.Function) {
        const fnMatch = value.match(FUNCTION_REGEX);

        const enrichedValue = `${fnMatch?.groups?.label ?? value}()`;
        return {
            value: enrichedValue,
            ...(fnMatch?.groups?.args && { cursorOffset: enrichedValue.length - 1 })
        };
    }

    return { value };
}

export function convertBalCompletion(completion: ExpressionCompletionItem): CompletionItem {
    const labelArray = completion.label.split("/");
    const tag = labelArray.length > 1 ? labelArray.slice(0, -1).join("/") : undefined;
    const label = labelArray[labelArray.length - 1];
    const kind = convertCompletionItemKind(completion.kind);
    const { value, cursorOffset } = getEnrichedValue(kind, completion.insertText);
    const description = completion.detail;
    const sortText = completion.sortText;
    const additionalTextEdits = completion.additionalTextEdits;
    const labelDetails = completion.labelDetails;

    return {
        tag,
        label,
        value,
        description,
        kind,
        sortText,
        additionalTextEdits,
        cursorOffset,
        labelDetails
    };
}

// Pure range/offset math lives in ./range (unit-tested there); re-exported here
// so existing `utils/bi` importers are unaffected.
export { updateLineRange, calculateExpressionOffsets } from "./range";

// Pure diagnostic-mapping helpers live in ./diagnostics (unit-tested there);
// re-exported here so existing `utils/bi` importers are unaffected.
export {
    removeDuplicateDiagnostics,
    filterUnsupportedDiagnostics,
    filterToolInputSymbolDiagnostics,
} from "./diagnostics";

// TRIGGERS RELATED HELPERS
export function convertTriggerServiceTypes(trigger: Trigger): Record<string, FunctionField> {
    const response: Record<string, FunctionField> = {};
    for (const key in trigger.serviceTypes) {
        const serviceType = trigger.serviceTypes[key];
        response[serviceType.name] = { checked: trigger.serviceTypes.length === 1, required: false, serviceType };
    }
    return response;
}

/**
 * Custom rendering for <code> blocks with syntax highlighting
 */
const MarkdownCodeRenderer = {
    code({ inline, className, children }: { inline?: boolean; className?: string; children: React.ReactNode }) {
        const codeContent = (Array.isArray(children) ? children.join("") : children) ?? "";
        const match = /language-(\w+)/.exec(className || "");

        if (!inline && match) {
            const language = match[1];

            // Apply syntax highlighting if language is registered
            if (hljs.getLanguage(language)) {
                return (
                    <pre style={{ border: '1px solid var(--vscode-editorIndentGuide-background)' }}>
                        <code
                            className={`hljs ${language}`}
                            dangerouslySetInnerHTML={{
                                __html: hljs.highlight(codeContent.toString(), { language }).value,
                            }}
                        />
                    </pre>
                );
            }

            // Fallback: render as plain text
            return (
                <pre>
                    <code className="hljs">{codeContent}</code>
                </pre>
            );
        }

        // Inline code with word wrapping
        return (
            <code className={className}>
                {children}
            </code>
        );
    },
};

export function injectHighlightTheme(theme: ColorThemeKind) {
    let extractedTheme: string;
    switch (theme) {
        case ColorThemeKind.Light:
        case ColorThemeKind.HighContrastLight:
            extractedTheme = "light";
            break;
        default:
            extractedTheme = "dark";
            break;
    }

    const existingTheme = document.getElementById("hljs-theme");
    if (existingTheme) existingTheme.remove();

    const themeLink = document.createElement("link");
    themeLink.id = "hljs-theme";
    themeLink.rel = "stylesheet";
    themeLink.href =
        extractedTheme === "light"
            ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/stackoverflow-light.min.css"
            : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/stackoverflow-dark.min.css";
    document.head.appendChild(themeLink);

    // Add background override once
    if (!document.getElementById("hljs-override")) {
        const overrideStyle = document.createElement("style");
        overrideStyle.id = "hljs-override";
        overrideStyle.innerHTML = `.hljs { background: var(--vscode-editor-background) !important; }`;
        document.head.appendChild(overrideStyle);
    }
};

async function getDocumentation(fnDescription: string, argsDescription: string[]): Promise<FnSignatureDocumentation> {
    const extractArgDocumentation = (arg: string) => {
        const argMatch = arg.match(/^\*\*Parameter\*\*\s*(.*)/);
        if (argMatch) {
            return `- ${argMatch[1]}`;
        }
        return `- ${arg}`;
    };

    return {
        fn: (
            <DocSection>
                <ReactMarkdown rehypePlugins={[rehypeRaw]} components={MarkdownCodeRenderer}>
                    {fnDescription}
                </ReactMarkdown>
            </DocSection>
        ),
        args:
            <>
                {argsDescription.map((arg) => (
                    <DocSection key={arg}>
                        <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                            {extractArgDocumentation(arg)}
                        </ReactMarkdown>
                    </DocSection>
                ))}
            </>
        ,
    };
};

export async function convertToFnSignature(signatureHelp: SignatureHelpResponse) {
    if (!signatureHelp) {
        return undefined;
    }
    const currentSignature = signatureHelp.signatures[0];
    if (!currentSignature) {
        return undefined;
    }

    const fnText = currentSignature.label;
    const fnMatch = fnText.match(FUNCTION_REGEX);

    if (!fnMatch) {
        return undefined;
    }
    const label = fnMatch.groups?.label;

    let args: string[] = [];
    if (fnMatch.groups?.args !== '') {
        // For functions with arguments
        args = fnMatch.groups?.args.split(',').map((arg) => arg.trim());
    }

    let documentation: FnSignatureDocumentation;
    if (signatureHelp.signatures[0]?.documentation) {
        documentation = await getDocumentation(
            signatureHelp.signatures[0].documentation.value,
            signatureHelp.signatures[0].parameters?.map((param) => param.documentation?.value ?? "") ?? []
        );
    }

    return {
        label,
        args,
        currentArgIndex: signatureHelp.activeParameter,
        documentation,
    };
}

export function convertToVisibleTypes(types: VisibleTypeItem[], isFetchingTypesForDM?: boolean): CompletionItem[] {
    types = types.filter(type => type !== null);
    if (isFetchingTypesForDM) {
        types = types.filter(type => isDMSupportedType(type));
    }
    return types.map((type) => ({
        label: type.label,
        value: type.insertText,
        kind: convertCompletionItemKind(type.kind),
        insertText: type.insertText,
        labelDetails: type.labelDetails,
    }));
}

export function convertItemsToCompletionItems(items: Item[]): CompletionItem[] {
    items = items.filter(item => item !== null) as Item[];
    //TODO: Need labelDetails from the LS for proper conversion
    return items.map((item) => ({
        label: item.metadata.label,
        value: item.metadata.label,
        kind: COMPLETION_ITEM_KIND.TypeParameter,
        insertText: item.metadata.label,
        labelDetails: {
            description: (item as AvailableNode).codedata?.node
        }
    }));
}

export function convertRecordTypeToCompletionItem(type: Type): CompletionItem {
    const label = type?.name ?? "";
    const value = label;
    const kind = "struct";
    const description = type?.metadata?.description;
    const labelDetails = (() => {
        const descriptionText = "Record";
        return descriptionText ? { description: descriptionText } : undefined;
    })();

    return {
        label,
        value,
        kind,
        description,
        labelDetails,
        sortText: label?.toLowerCase?.() || label,
    };
}

export const convertToHelperPaneVariable = (variables: VisibleType[]): HelperPaneVariableInfo => {
    return {
        category: variables
            .filter((variable) => variable.name !== "Configurable Variables")
            .map((variable) => ({
                label: variable.name,
                items: variable.types.map((item) => ({
                    label: item.name,
                    type: item.type.typeName,
                    insertText: item.name,
                })),
            })),
    };
};

export const filterHelperPaneVariables = (
    variables: HelperPaneVariableInfo,
    filterText: string
): HelperPaneVariableInfo => {
    const filteredCategories = variables.category.map((category) => {
        const filteredItems = category.items.filter((item) =>
            item.label.toLowerCase().includes(filterText.toLowerCase())
        );
        return {
            ...category,
            items: filteredItems,
        };
    });

    return {
        category: filteredCategories,
    };
};

export const convertToHelperPaneConfigurableVariable = (variables: VisibleType[]): HelperPaneVariableInfo => {
    return {
        category: variables
            .filter((variable) => variable.name === "Configurable Variables")
            .map((variable) => ({
                label: variable.name,
                items: variable.types.map((item) => ({
                    label: item.name,
                    type: item.type.value,
                    insertText: item.name,
                })),
            })),
    };
};

const isCategoryType = (item: Item): item is Category => {
    return !(item as AvailableNode)?.codedata;
};

export const getFunctionItemKind = (category: string): FunctionKind => {
    if (category.toLocaleLowerCase().includes("current") || category.toLocaleLowerCase().includes("within project")) {
        return functionKinds.CURRENT;
    } else if (category.toLocaleLowerCase().includes("imported")) {
        return functionKinds.IMPORTED;
    } else {
        return functionKinds.AVAILABLE;
    }
};

export const convertToHelperPaneFunction = (functions: Category[]): HelperPaneFunctionInfo => {
    const response: HelperPaneFunctionInfo = {
        category: [],
    };
    for (const category of functions.filter((category) => category.metadata.label !== "Agent Tools")) {
        const categoryKind = getFunctionItemKind(category.metadata.label);
        const items: HelperPaneCompletionItem[] = [];
        const subCategory: HelperPaneFunctionCategory[] = [];
        for (const categoryItem of category?.items) {
            if (isCategoryType(categoryItem)) {
                if (categoryItem.metadata.label === "Agent Tools") {
                    continue;
                }
                subCategory.push({
                    label: categoryItem.metadata.label,
                    items: categoryItem.items.map((item) => ({
                        label: item.metadata.label,
                        insertText: item.metadata.label,
                        kind: categoryKind,
                        codedata: !isCategoryType(item) && item.codedata,
                    })),
                });
            } else {
                items.push({
                    label: categoryItem.metadata.label,
                    insertText: categoryItem.metadata.label,
                    kind: categoryKind,
                    codedata: categoryItem.codedata,
                });
            }
        }

        const categoryItem: HelperPaneFunctionCategory = {
            label: category.metadata.label,
            items: items.length ? items : undefined,
            subCategory: subCategory.length ? subCategory : undefined,
        };
        response.category.push(categoryItem);
    }
    return response;
};

export function extractFunctionInsertText(template: string): CompletionInsertText {
    const match = template.match(FUNCTION_REGEX);
    const label = match?.groups?.label;

    if (!label) {
        return { value: template };
    }

    return {
        value: `${label}()`,
        ...(match?.groups?.args && { cursorOffset: -1 })
    };
}


export function isNaturalFunction(node: STNode, view: FocusFlowDiagramView): node is FunctionDefinition {
    return view === FOCUS_FLOW_DIAGRAM_VIEW.NP_FUNCTION;
}

export function getFlowNodeForNaturalFunction(node: FunctionNode): FlowNode {
    const flowNode: FlowNode = {
        ...node,
        codedata: { ...node.codedata, node: "NP_FUNCTION" },
        branches: [],
    };
    return flowNode;
}

export const getImportsForProperty = (key: string, imports: FormImports): Imports | undefined => {
    if (!imports) {
        return undefined;
    }

    return imports[key];
};

export function getImportsForFormFields(formFields: FormField[]): FormImports {
    const imports: FormImports = {};
    for (const field of formFields) {
        if (field.imports) {
            imports[field.key] = field.imports;
        }
    }
    return imports;
}

/**
 * Check if the type is supported by the data mapper
 *
 * @param type - The type to check
 * @returns Whether the type is supported by the data mapper
 */
export const isDMSupportedType = (type: VisibleTypeItem) => {
    // HACK: This is a temporary solution to filter out types that are not supported by the data mapper which should be handled by the LS.
    if (
        type.labelDetails.description === "Nil" ||
        type.labelDetails.description === "Byte" ||
        type.labelDetails.description === "Map"
    ) {
        return false;
    }

    return true;
};

export function getSubPanelWidth(subPanel: SubPanel) {
    if (!subPanel?.view) {
        return undefined;
    }
    switch (subPanel.view) {
        case SubPanelView.ADD_NEW_FORM:
        case SubPanelView.HELPER_PANEL:
            return 400;
        default:
            return undefined;
    }
}
