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

import { ExpandableList } from "../Components/ExpandableList"
import { TypeIndicator } from "../Components/TypeIndicator"
import { useRpcContext } from "@wso2/ballerina-rpc-client"
import { EditorConfig, EditorDisplayMode, ExpressionProperty, FlowNode, LineRange, RecordTypeField } from "@wso2/ballerina-core"
import { Codicon, CompletionItem, Divider, HelperPaneCustom, SearchBox, ThemeColors, Tooltip, Typography } from "@wso2/ui-toolkit"
import { useEffect, useMemo, useRef, useState } from "react"
import { getPropertyFromFormField, useFieldContext, InputMode } from "@wso2/ballerina-side-panel"
import FooterButtons from "../Components/FooterButtons"
import { FlowNodeForm, ResolvedType } from "../../Forms/FlowNodeForm"
import { ScrollableContainer } from "../Components/ScrollableContainer"
import { FormSubmitOptions } from "../../FlowDiagram"
import { URI } from "vscode-uri"
import { POPUP_IDS, useModalStack } from "../../../../Context"
import { HelperPaneIconType, getHelperPaneIcon } from "../utils/iconUtils"
import { TEMPLATE_TIMEOUT_MS, localVariableTemplate, newVariableNode } from "../utils/newVariable"
import { EmptyItemsPlaceHolder } from "../Components/EmptyItemsPlaceHolder"
import { shouldShowNavigationArrow } from "../utils/types"
import { HelperPaneListItem } from "../Components/HelperPaneListItem"
import { useHelperPaneNavigation, BreadCrumbStep } from "../hooks/useHelperPaneNavigation"
import { BreadcrumbNavigation } from "../Components/BreadcrumbNavigation"

type VariablesPageProps = {
    fileName: string;
    debouncedRetrieveCompletions?: (value: string, property: ExpressionProperty, offset: number, triggerCharacter?: string) => Promise<void>;
    onChange: (value: string, isRecordConfigureChange: boolean, shouldKeepHelper?: boolean) => void;
    targetLineRange: LineRange;
    anchorRef: React.RefObject<HTMLDivElement>;
    onSaveNewVariable?: (updatedNode?: FlowNode, editorConfig?: EditorConfig, options?: FormSubmitOptions, openDMInPopup?: boolean) => void;
    // The variables the form this pane belongs to declares itself, as they are when asked. That form
    // has to say: the form nearest the pane is another one in the record editor and in nested forms.
    getOwnNames?: () => string[];
    selectedType?: ResolvedType;
    filteredCompletions: CompletionItem[];
    currentValue: string;
    recordTypeField?: RecordTypeField;
    isInModal?: boolean;
    handleRetrieveCompletions: (value: string, property: ExpressionProperty, offset: number, triggerCharacter?: string) => Promise<void>;
    onClose?: () => void;
    inputMode?: InputMode;
}

export type VariableItemProps = {
    item: CompletionItem;
    onItemSelect: (value: string, item: CompletionItem) => void;
    onMoreIconClick: (item: CompletionItem) => void;
    hideArrow?: boolean;
}

export const VariableItem = ({ item, onItemSelect, onMoreIconClick, hideArrow }: VariableItemProps) => {
    const showArrow = shouldShowNavigationArrow(item) && !hideArrow;
    const mainContent = (
        <>
            {getHelperPaneIcon(HelperPaneIconType.VARIABLE)}
            <Typography variant="body3" sx={{ flex: 1, mr: 1 }}>
                {item.label}
            </Typography>
            <Tooltip content={item.description} position="top">
                <TypeIndicator>
                    {item.description}
                </TypeIndicator>
            </Tooltip>
        </>
    );

    const endAction = showArrow ? (
        <Codicon
            name="chevron-right"
        />
    ) : undefined;

    return (
        <HelperPaneListItem
            testId={`helper-pane-item-${item.label}`}
            endActionTestId={`helper-pane-nav-${item.label}`}
            onClick={() => onItemSelect(item.label, item)}
            endAction={endAction}
            onClickEndAction={() => onMoreIconClick(item)}
        >
            {mainContent}
        </HelperPaneListItem>
    );
};

export const Variables = (props: VariablesPageProps) => {
    const { fileName, targetLineRange, onChange, onClose, onSaveNewVariable, getOwnNames, selectedType, filteredCompletions, currentValue, isInModal, handleRetrieveCompletions, inputMode } = props;
    // A form with nowhere to save a new variable (a connection, AI agent, MCP or function form) offers
    // no "+ New Variable".
    const offerNewVariable = Boolean(onSaveNewVariable);
    const [searchValue, setSearchValue] = useState<string>("");
    const { rpcClient } = useRpcContext();
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [showContent, setShowContent] = useState<boolean>(false);
    const newNodeNameRef = useRef<string>("");
    const fetchingTemplateRef = useRef(false);
    const [isFetchingTemplate, setIsFetchingTemplate] = useState<boolean>(false);
    const isMountedRef = useRef(true);
    const [projectPathUri, setProjectPathUri] = useState<string>();
    const { breadCrumbSteps, navigateToNext, navigateToBreadcrumb, isAtRoot, getCurrentNavigationPath, getLeafSeparator } = useHelperPaneNavigation("Variables");
    const { addModal, closeModal } = useModalStack()

    const { field, triggerCharacters } = useFieldContext();

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Use navigation path for completions instead of currentValue
    const navigationPath = useMemo(() => {
        const path = getCurrentNavigationPath();
        return path;
    }, [breadCrumbSteps]);
    const completionContext = useMemo(() => {
        const context = navigationPath ? navigationPath + getLeafSeparator() : (currentValue ?? '');
        return context;
    }, [navigationPath, currentValue, breadCrumbSteps]);

    useEffect(() => {
        getProjectInfo()
    }, []);

    useEffect(() => {
        setIsLoading(true);
        const triggerCharacter =
            completionContext.length > 0
                ? triggerCharacters.find((char) => completionContext[completionContext.length - 1] === char)
                : undefined;

        // Only apply minimum loading time if we don't have any completions yet
        const shouldShowMinLoader = filteredCompletions.length === 0 && !showContent;
        const minLoadingTime = shouldShowMinLoader ? new Promise(resolve => setTimeout(resolve, 500)) : Promise.resolve();

        // When navigating, use length as offset to position cursor after the dot
        // When at root, use 0 to get all completions
        const offset = navigationPath ? completionContext.length : 0;

        Promise.all([
            handleRetrieveCompletions(completionContext, getPropertyFromFormField(field), offset, triggerCharacter),
            minLoadingTime
        ]).finally(() => {
            setIsLoading(false);
            setShowContent(true);
        });

    }, [targetLineRange, breadCrumbSteps, completionContext])

    const getProjectInfo = async () => {
        const visualizerContext = await rpcClient.getVisualizerLocation();
        setProjectPathUri(URI.file(visualizerContext.projectPath).fsPath);
    }

    const handleSubmit = (updatedNode?: FlowNode, editorConfig?: EditorConfig) => {
        newNodeNameRef.current = "";
        // Safely extract the variable name as a string, fallback to empty string if not available
        const varName = typeof updatedNode?.properties?.variable?.value === "string"
            ? updatedNode.properties.variable.value
            : "";
        newNodeNameRef.current = varName;
        onSaveNewVariable?.(
            updatedNode,
            {
                view: editorConfig?.view,
                displayMode: editorConfig?.displayMode === EditorDisplayMode.VIEW ? EditorDisplayMode.POPUP : EditorDisplayMode.NONE
            },
            {
                closeSidePanel: false, isChangeFromHelperPane: true, postUpdateCallBack: () => {
                    onClose()
                    closeModal(POPUP_IDS.VARIABLE);
                    onChange(newNodeNameRef.current, false, true);
                }
            },
        );
    };

    const dropdownItems = useMemo(() => {
        const excludedDescriptions = ["Configurable", "Parameter", "Listener", "Client"];

        const isClassField = (completion: CompletionItem) =>
            completion.label.startsWith("self.") && completion.label !== "self.agent";

        const fieldItems = filteredCompletions.filter((completion) => {
            if (completion.kind !== "field" && completion.kind !== "variable") {
                return false;
            }
            if (completion.label === "self" || completion.label === "self.agent") {
                return false;
            }
            if (isClassField(completion)) {
                return true;
            }
            return !excludedDescriptions.some(desc =>
                completion.labelDetails?.description?.includes(desc)
            );
        });

        // If there are no fields/variables (e.g. a primitive type), fall back to toString()
        if (fieldItems.length === 0) {
            const toStringItem = filteredCompletions.find(c => c.label === "toString()");
            return toStringItem ? [toStringItem] : [];
        }

        return fieldItems;
    }, [filteredCompletions]);

    const filteredDropDownItems = useMemo(() => {
        if (!searchValue || searchValue.length === 0) return dropdownItems;
        return dropdownItems.filter((item) =>
            item.label.toLowerCase().includes(searchValue.toLowerCase())
        );
    }, [searchValue, dropdownItems]);

    const handleSearch = (searchText: string) => {
        setSearchValue(searchText);
    };

    const handleItemSelect = (value: string, item?: CompletionItem) => {
        // Use ?. when the parent step is optional OR the field itself is optional/nilable.
        const fullPath = navigationPath ? `${navigationPath}${getLeafSeparator(item?.value)}${value}` : value;
        onChange(fullPath, false);
    }

    // The language server's Declare Variable template at the field, or none when asking for it fails,
    // gets none, or is not answered in time.
    const fetchVariableTemplate = async (): Promise<FlowNode | undefined> => {
        let timer: number | undefined;
        const noAnswer = new Promise<undefined>((resolve) => {
            timer = window.setTimeout(resolve, TEMPLATE_TIMEOUT_MS);
        });
        try {
            const response = await Promise.race([
                rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                    position: targetLineRange?.startLine,
                    filePath: fileName,
                    id: { node: "VARIABLE" },
                }),
                noAnswer,
            ]);
            return response?.flowNode;
        } catch (error) {
            console.error(">>> Error fetching the Declare Variable template", error);
            return undefined;
        } finally {
            window.clearTimeout(timer);
        }
    };

    const handleAddNewVariable = async () => {
        // A click while the template is on its way would open a second form.
        if (fetchingTemplateRef.current) {
            return;
        }
        fetchingTemplateRef.current = true;
        setIsFetchingTemplate(true);
        const template = await fetchVariableTemplate();
        fetchingTemplateRef.current = false;
        // The pane closed while the template was on its way: the user has moved on, and the form this
        // one would save through may be gone.
        if (!isMountedRef.current) {
            return;
        }
        setIsFetchingTemplate(false);
        addModal(
            <FlowNodeForm
                fileName={fileName}
                node={newVariableNode(
                    template ?? localVariableTemplate(),
                    selectedType?.value,
                    // The variables the form this is opened from declares itself, which the language
                    // server cannot see. Asked for only now: one may have been renamed since the pane opened.
                    getOwnNames?.() ?? []
                )}
                connections={[]}
                targetLineRange={targetLineRange}
                projectPath={projectPathUri}
                editForm={false}
                onSubmit={handleSubmit}
                showProgressIndicator={false}
                resetUpdatedExpressionField={() => { }}
                isInModal={true}
            />, POPUP_IDS.VARIABLE, "New Variable", 600);
        onClose && onClose();
    }
    const handleVariablesMoreIconClick = (item: CompletionItem) => {
        const typeDetail = item?.labelDetails?.detail || item?.description;
        navigateToNext(item.label, navigationPath, typeDetail, item.value);
    }

    const handleBreadCrumbItemClicked = (step: BreadCrumbStep) => {
        navigateToBreadcrumb(step);
    }

    const ExpandableListItems = () => {
        return (
            <>
                {
                    filteredDropDownItems.map((item) => (
                        <VariableItem
                            key={item.label}
                            item={item}
                            onItemSelect={handleItemSelect}
                            onMoreIconClick={handleVariablesMoreIconClick}
                        />
                    ))
                }
            </>
        )
    }


    const findNodeWithName = (node: FlowNode, name: string) => {
        return node?.properties?.variable?.value === name;
    }

    const searchNodes = (nodes: FlowNode[], name: string): FlowNode | undefined => {
        for (const node of nodes) {
            if (findNodeWithName(node, name)) {
                return node;
            }
            if (node.branches && node.branches.length > 0) {
                for (const branch of node.branches) {
                    if (branch.children && branch.children.length > 0) {
                        const foundNode = searchNodes(branch.children, name);
                        if (foundNode) {
                            return foundNode;
                        }
                    }
                }
            }
        }
        return undefined;
    };

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "hidden"
        }}>

            <BreadcrumbNavigation
                breadCrumbSteps={breadCrumbSteps}
                onNavigateToBreadcrumb={handleBreadCrumbItemClicked}
            />
            {dropdownItems.length >= 6 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", margin: "3px 5px", height: "20px", gap: '5px' }}>
                    <SearchBox sx={{ width: "100%" }} placeholder='Search' value={searchValue} onChange={handleSearch} />
                </div>
            )}

            <ScrollableContainer style={{ margin: '8px 0px' }}>
                {isLoading || !showContent ? (
                    <HelperPaneCustom.Loader />
                ) : (
                    <>
                        {filteredDropDownItems.length === 0 ? (
                            <EmptyItemsPlaceHolder message={searchValue ? "No variables found for your search" : "No variables found"} />
                        ) : (
                            <ExpandableList>
                                <ExpandableListItems />
                            </ExpandableList>
                        )}
                    </>
                )}
            </ScrollableContainer>

            <Divider sx={{ margin: "0px" }} />
            {!isInModal && offerNewVariable && (
                <div style={{ margin: '4px 0' }}>
                    <FooterButtons
                        onClick={handleAddNewVariable}
                        title="New Variable"
                        disabled={isFetchingTemplate}
                        sx={{ opacity: isFetchingTemplate ? 0.6 : 1 }}
                    />
                </div>
            )}
        </div>
    )
}
