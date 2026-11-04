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

import { CompletionInsertText, ConfigVariable, ExpressionProperty, FlowNode, LineRange, TomlPackage } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import ExpandableList from "../Components/ExpandableList";
import { Codicon, CompletionItem, Divider, SearchBox, Typography } from "@wso2/ui-toolkit";
import { ScrollableContainer } from "../Components/ScrollableContainer";
import FooterButtons from "../Components/FooterButtons";
import FlowNodeForm from "../../Forms/FlowNodeForm";
import { URI, Utils } from "vscode-uri";
import { POPUP_IDS, useModalStack } from "../../../../Context";
import { HelperPaneIconType, getHelperPaneIcon } from "../utils/iconUtils";
import { HelperPaneListItem } from "../Components/HelperPaneListItem";
import { TypeIndicator } from "../Components/TypeIndicator";
import { EmptyItemsPlaceHolder } from "../Components/EmptyItemsPlaceHolder";
import { HelperPaneCustom } from "@wso2/ui-toolkit";
import { useHelperPaneNavigation } from "../hooks/useHelperPaneNavigation";
import { BreadcrumbNavigation } from "../Components/BreadcrumbNavigation";
import { getPropertyFromFormField, InputMode, useOptionalFieldContext } from "@wso2/ballerina-side-panel";
import { isArrayOfObjectsType, isPrimitiveType, shouldShowNavigationArrow } from "../utils/types";
import { ArrayIndexBadge, ArrayIndexControls, ArrayIndexLabel, ArrayIndexRow, ArrayIndexStepButton } from "../styles/ArrayIndexStepper";

type ConfigVariablesState = {
    [category: string]: {
        [module: string]: ConfigVariable[];
    };
};

type ListItem = {
    name: string;
    items: any[]
}

export type ConfigurablesPageProps = {
    onChange: (insertText: string | CompletionInsertText, isRecordConfigureChange?: boolean) => void;
    isInModal?: boolean;
    anchorRef: React.RefObject<HTMLDivElement>;
    fileName: string;
    targetLineRange: LineRange;
    onClose?: () => void;
    inputMode?: InputMode;
    excludedConfigs?: string[];
    onAddNewConfigurable?: (refreshConfigVariables: () => Promise<void>) => void;
    showAddNew?: boolean;
    // Field access below a record-typed configurable is driven by expression completions,
    // the same way the Variables and Inputs panes do it. Without these, the list stays flat.
    filteredCompletions?: CompletionItem[];
    handleRetrieveCompletions?: (value: string, property: ExpressionProperty, offset: number, triggerCharacter?: string) => Promise<void>;
}

type ConfigurableItemProps = {
    name: string;
    type: string;
    onSelect: () => void;
    onNavigate?: () => void;
}

const ConfigurableItem = ({ name, type, onSelect, onNavigate }: ConfigurableItemProps) => (
    <HelperPaneListItem
        testId={`helper-pane-item-${name}`}
        endActionTestId={`helper-pane-nav-${name}`}
        onClick={onSelect}
        endAction={onNavigate ? <Codicon name="chevron-right" /> : undefined}
        onClickEndAction={onNavigate}
    >
        {getHelperPaneIcon(HelperPaneIconType.CONFIGURABLE)}
        <Typography variant="body3" sx={{ flex: 1, mr: 1 }}>
            {name as ReactNode}
        </Typography>
        <TypeIndicator>
            {type as ReactNode}
        </TypeIndicator>
    </HelperPaneListItem>
);


export const Configurables = (props: ConfigurablesPageProps) => {
    const { onChange, onClose, fileName, targetLineRange, excludedConfigs = [], onAddNewConfigurable, showAddNew = true,
        filteredCompletions = [], handleRetrieveCompletions } = props;

    const { rpcClient } = useRpcContext();
    const { breadCrumbSteps, navigateToNext, navigateToNextArray, updateLastStepArrayIndex, navigateToBreadcrumb, isAtRoot, getCurrentNavigationPath, getLeafSeparator } = useHelperPaneNavigation("Configurables");
    const fieldContext = useOptionalFieldContext();
    // Both halves of the completion round-trip are needed to list fields; otherwise stay flat.
    const canNavigate = !!handleRetrieveCompletions && !!props.filteredCompletions && !!fieldContext?.field;
    const [configVariables, setConfigVariables] = useState<ListItem[]>([]);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [configVarNode, setCofigVarNode] = useState<FlowNode>();
    const [isSaving, setIsSaving] = useState(false);
    const [packageInfo, setPackageInfo] = useState<TomlPackage>();
    const [isImportEnv, setIsImportEnv] = useState<boolean>(false);
    const [projectPathUri, setProjectPathUri] = useState<string>();
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [showContent, setShowContent] = useState<boolean>(false);
    const [searchValue, setSearchValue] = useState<string>("");

    const { addModal, closeModal } = useModalStack();

    useEffect(() => {
        const fetchNode = async () => {
            const node = await rpcClient.getBIDiagramRpcClient().getConfigVariableNodeTemplate({
                isNew: true,
                isEnvVariable: isImportEnv
            });
            if (fileName.includes("/tests/")) {
                if (!node.flowNode.codedata.data) {
                    node.flowNode.codedata.data = {};
                }
                node.flowNode.codedata.data["filePath"] = fileName;
            }
            setCofigVarNode(node.flowNode);
        };

        fetchNode();
    }, [isImportEnv]);

    useEffect(() => {
        setConfigVariables([]);
        getConfigVariables()
        getProjectInfo()
        const fetchTomlValues = async () => {
            try {
                const tomValues = await rpcClient.getCommonRpcClient().getCurrentProjectTomlValues();
                setPackageInfo(tomValues?.package);
            } catch (error) {
                console.error("Failed to fetch TOML values:", error);
                setPackageInfo({
                    org: "",
                    name: "",
                    version: "",
                    title: ""
                });
            }
        };

        fetchTomlValues();
    }, [excludedConfigs])

    const getProjectInfo = async () => {
        const visualizerContext = await rpcClient.getVisualizerLocation();
        setProjectPathUri(URI.file(visualizerContext.projectPath).fsPath);
    }

    const getConfigVariables = async () => {
        let data: ConfigVariablesState = {};
        let errorMsg: string = '';

        setIsLoading(true);

        // Only apply minimum loading time if we don't have any config variables yet
        const shouldShowMinLoader = Object.keys(configVariables).length === 0 && !showContent;
        const minLoadingTime = shouldShowMinLoader ? new Promise(resolve => setTimeout(resolve, 500)) : Promise.resolve();

        await Promise.all([
            rpcClient
                .getBIDiagramRpcClient()
                .getConfigVariablesV2({
                    includeLibraries: false,
                    projectPath: projectPathUri
                })
                .then((variables) => {
                    data = (variables as any).configVariables;
                    errorMsg = (variables as any).errorMsg;
                }),
            minLoadingTime
        ]).finally(() => {
            setIsLoading(false);
            setShowContent(true);
        });

        let configVariablesArr = translateToArrayFormat(data).filter(data =>
            Array.isArray(data.items) &&
            data.items.some(sub => Array.isArray(sub.items) && sub.items.length > 0)
        );

        configVariablesArr =  configVariablesArr.map(category => ({
            ...category,
            items: category.items.map(subCategory => ({
                ...subCategory,
                items: subCategory.items.filter((item: ConfigVariable) => {
                    const value = item?.properties?.variable?.value as string;
                    return !excludedConfigs.includes(value);
                })
            })).filter(subCategory => subCategory.items.length > 0)
        })).filter(category => category.items.length > 0);


        setConfigVariables(configVariablesArr);
        setErrorMessage(errorMsg);
    };

    const handleSave = async (node: FlowNode) => {
        closeModal(POPUP_IDS.CONFIGURABLES);
        //TODO: Need to disable the form before saving and move form close to finally block
        setIsSaving(true);
        node.properties.defaultValue.modified = true;
        await rpcClient.getBIDiagramRpcClient().updateConfigVariablesV2({
            configFilePath: Utils.joinPath(URI.file(projectPathUri), 'config.bal').fsPath,
            configVariable: node,
            packageName: `${packageInfo.org}/${packageInfo.name}`,
            moduleName: "",
        }).finally(() => {
            setIsSaving(false);
            getConfigVariables();
            onChange(node.properties.variable.value as string, false);
        });
    };

    const translateToArrayFormat = (object: object): ListItem[] => {
        if (Array.isArray(object)) return object;
        const keys = Object.keys(object);
        return keys.map((key): { name: string; items: object[] } => {
            return {
                name: key,
                items: translateToArrayFormat((object as Record<string, object>)[key])
            }
        });
    }

    const handleItemClicked = (name: string) => {
        onChange(name, false)
        onClose && onClose();
    }

    const handleSearch = (searchText: string) => {
        setSearchValue(searchText);
    };

    // ---- Field access below a configurable (completion-driven, mirrors Inputs/Variables) ----
    const [isFieldsLoading, setIsFieldsLoading] = useState<boolean>(false);
    const [hasFieldLoadError, setHasFieldLoadError] = useState<boolean>(false);
    // Only the latest request may settle the loader; an earlier path's request can finish after it.
    const fieldRequestIdRef = useRef(0);
    const navigationPath = useMemo(() => getCurrentNavigationPath(), [breadCrumbSteps]);

    const currentStep = breadCrumbSteps[breadCrumbSteps.length - 1];
    const isInArrayContext = !isAtRoot() && currentStep?.isArrayAccess === true;
    const currentArrayIndex = currentStep?.arrayIndex ?? 0;

    // Local index state for immediate UI feedback; synced to navigation after debounce (as in Inputs).
    const [localArrayIndex, setLocalArrayIndex] = useState(0);
    const localIndexRef = useRef(0);
    const indexDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        localIndexRef.current = currentArrayIndex;
        setLocalArrayIndex(currentArrayIndex);
    }, [currentStep?.replaceText]);

    useEffect(() => {
        return () => { if (indexDebounceRef.current) clearTimeout(indexDebounceRef.current); };
    }, []);

    const handleArrayIndexStep = (delta: number) => {
        const newIndex = Math.max(0, localIndexRef.current + delta);
        localIndexRef.current = newIndex;
        setLocalArrayIndex(newIndex);

        if (indexDebounceRef.current) clearTimeout(indexDebounceRef.current);
        indexDebounceRef.current = setTimeout(() => {
            updateLastStepArrayIndex(newIndex);
        }, 400);
    };

    useEffect(() => {
        if (isAtRoot() || !canNavigate) {
            return;
        }
        const completionContext = navigationPath + getLeafSeparator();
        const triggerCharacter = fieldContext.triggerCharacters?.find(
            (char) => completionContext[completionContext.length - 1] === char
        );
        const requestId = ++fieldRequestIdRef.current;
        const isCurrent = () => requestId === fieldRequestIdRef.current;
        setIsFieldsLoading(true);
        setHasFieldLoadError(false);
        handleRetrieveCompletions(
            completionContext,
            getPropertyFromFormField(fieldContext.field),
            completionContext.length,
            triggerCharacter
        )
            .catch((error) => {
                console.error("Failed to load configurable fields:", error);
                if (isCurrent()) {
                    setHasFieldLoadError(true);
                }
            })
            .finally(() => {
                if (isCurrent()) {
                    setIsFieldsLoading(false);
                }
            });
    }, [breadCrumbSteps, targetLineRange]);

    const fieldItems = useMemo(() => {
        if (isAtRoot()) {
            return [];
        }
        const fields = filteredCompletions.filter(
            (completion) => (completion.kind === "field" || completion.kind === "variable") && completion.label !== "self"
        );
        // A primitive leaf has no fields; fall back to toString() like the other panes.
        if (fields.length === 0) {
            const toStringItem = filteredCompletions.find((c) => c.label === "toString()");
            return toStringItem ? [toStringItem] : [];
        }
        return fields;
    }, [filteredCompletions, breadCrumbSteps]);

    const filteredFieldItems = useMemo(() => {
        if (!searchValue) return fieldItems;
        return fieldItems.filter((item) => item.label.toLowerCase().includes(searchValue.toLowerCase()));
    }, [fieldItems, searchValue]);

    const navigateInto = (name: string, typeDetail?: string, selectedItemValue?: string) => {
        setSearchValue("");
        // Completions are shared with the other panes; hide them until this path's fields arrive.
        setIsFieldsLoading(true);
        if (isArrayOfObjectsType(typeDetail)) {
            navigateToNextArray(name, navigationPath, 0, typeDetail, selectedItemValue);
        } else {
            navigateToNext(name, navigationPath, typeDetail, selectedItemValue);
        }
    };

    const handleFieldSelect = (item: CompletionItem) => {
        onChange(`${navigationPath}${getLeafSeparator(item.value)}${item.label}`, false);
        onClose && onClose();
    };

    // Only configurables of the default module are reachable by their bare name at the cursor.
    const canNavigateInto = (moduleName: string, type?: string) =>
        canNavigate && moduleName === "" && !!type && !isPrimitiveType(type);

    const renderConfigurable = (item: ConfigVariable, moduleName: string) => {
        const name = item?.properties?.variable?.value as string;
        const type = item?.properties?.type?.value as string;
        return (
            <ConfigurableItem
                key={item.id}
                name={name}
                type={type}
                onSelect={() => handleItemClicked(name)}
                onNavigate={canNavigateInto(moduleName, type) ? () => navigateInto(name, type) : undefined}
            />
        );
    };

    const handleAddNewConfigurable = () => {
        // Use override if provided
        if (onAddNewConfigurable) {
            onAddNewConfigurable(getConfigVariables);
            return;
        }

        addModal(
            <FlowNodeForm
                fileName={fileName}
                node={configVarNode}
                connections={[]}
                targetLineRange={targetLineRange}
                projectPath={projectPathUri}
                editForm={false}
                onSubmit={handleSave}
                showProgressIndicator={false}
                resetUpdatedExpressionField={() => { }}
                isInModal={true}
            />, POPUP_IDS.CONFIGURABLES, "New Configurable", 650)

        onClose && onClose();
    }

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "hidden"
        }}>
            <BreadcrumbNavigation
                breadCrumbSteps={breadCrumbSteps}
                onNavigateToBreadcrumb={(step) => {
                    setSearchValue("");
                    setIsFieldsLoading(step !== breadCrumbSteps[0]);
                    navigateToBreadcrumb(step);
                }}
            />
            {isInArrayContext && (
                <ArrayIndexRow>
                    <ArrayIndexLabel>Index</ArrayIndexLabel>
                    <ArrayIndexControls>
                        <ArrayIndexStepButton onClick={() => handleArrayIndexStep(-1)} disabled={localArrayIndex === 0}>
                            -
                        </ArrayIndexStepButton>
                        <ArrayIndexBadge>{localArrayIndex}</ArrayIndexBadge>
                        <ArrayIndexStepButton onClick={() => handleArrayIndexStep(1)}>
                            +
                        </ArrayIndexStepButton>
                    </ArrayIndexControls>
                </ArrayIndexRow>
            )}
            {!isAtRoot() ? (
                <>
                    {fieldItems.length >= 6 && (
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", margin: "3px 8px", gap: '5px' }}>
                            <SearchBox sx={{ width: "100%" }} placeholder='Search' value={searchValue} onChange={handleSearch} />
                        </div>
                    )}
                    <ScrollableContainer style={{ margin: '8px 0px' }}>
                        {isFieldsLoading ? (
                            <HelperPaneCustom.Loader />
                        ) : hasFieldLoadError ? (
                            <EmptyItemsPlaceHolder message="Failed to load fields" />
                        ) : filteredFieldItems.length === 0 ? (
                            <EmptyItemsPlaceHolder message={searchValue ? "No fields found for your search" : "No fields found"} />
                        ) : (
                            <ExpandableList>
                                {filteredFieldItems.map((item) => {
                                    const typeDetail = item?.labelDetails?.detail || item?.description;
                                    return (
                                        <ConfigurableItem
                                            key={item.label}
                                            name={item.label}
                                            type={item.description}
                                            onSelect={() => handleFieldSelect(item)}
                                            onNavigate={shouldShowNavigationArrow(item)
                                                ? () => navigateInto(item.label, typeDetail, item.value)
                                                : undefined}
                                        />
                                    );
                                })}
                            </ExpandableList>
                        )}
                    </ScrollableContainer>
                </>
            ) : (
            <>
            {(() => {
                const filteredCategories = translateToArrayFormat(configVariables)
                    .filter(category =>
                        Array.isArray(category.items) &&
                        category.items.some(sub => Array.isArray(sub.items) && sub.items.length > 0)
                    );

                // Count total items across all categories
                const totalItemsCount = filteredCategories.reduce((total, category) => {
                    return total + category.items.reduce((subTotal, subCategory) => {
                        return subTotal + (subCategory.items?.length || 0);
                    }, 0);
                }, 0);

                return (
                    <>
                        {totalItemsCount >= 6 && (
                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", margin: "3px 8px", gap: '5px' }}>
                                <SearchBox sx={{ width: "100%" }} placeholder='Search' value={searchValue} onChange={handleSearch} />
                            </div>
                        )}
                    </>
                );
            })()}

            <ScrollableContainer style={{ margin: '8px 0px' }}>
                {isLoading || !showContent ? (
                    <HelperPaneCustom.Loader />
                ) : (
                    <>
                        {(() => {
                            let filteredCategories = configVariables;
                            // Apply search filter if search value exists
                            if (searchValue && searchValue.trim()) {
                                filteredCategories = filteredCategories.map(category => ({
                                    ...category,
                                    items: category.items.map(subCategory => ({
                                        ...subCategory,
                                        items: subCategory.items.filter((item: ConfigVariable) =>
                                            (item?.properties?.variable?.value as string)?.toLowerCase().includes(searchValue.toLowerCase())
                                        )
                                    })).filter(subCategory => subCategory.items.length > 0)
                                })).filter(category => category.items.length > 0);
                            }

                            if (filteredCategories.length === 0) {
                                return <EmptyItemsPlaceHolder message={searchValue ? "No configurables found for your search" : "No configurables found"} />;
                            }

                            return (
                                <>
                                    {filteredCategories.map(category => (
                                        <div >
                                            {category.items
                                                .filter(subCategory => subCategory.items && subCategory.items.length > 0)
                                                .map(subCategory => (
                                                    <div key={subCategory.name}>
                                                        {subCategory.name !== '' ? (
                                                            <ExpandableList.Section
                                                                key={subCategory.name}
                                                                title={subCategory.name}
                                                                level={0}
                                                            >
                                                                <div style={{ marginTop: '10px' }}>
                                                                    {subCategory.items.map((item: ConfigVariable) => renderConfigurable(item, subCategory.name))}
                                                                </div>
                                                            </ExpandableList.Section>
                                                        ) : (
                                                            <div>
                                                                {subCategory.items.map((item: ConfigVariable) => renderConfigurable(item, subCategory.name))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                        </div>
                                    ))}
                                </>
                            );
                        })()}
                    </>
                )}
            </ScrollableContainer>
            </>
            )}

            {showAddNew && isAtRoot() && (
                <>
                    <Divider sx={{ margin: "0px" }} />
                    <div style={{ margin: '4px 0' }}>
                        <FooterButtons onClick={handleAddNewConfigurable} title="New Configurable" />
                    </div>
                </>
            )}
        </div>
    )
}
