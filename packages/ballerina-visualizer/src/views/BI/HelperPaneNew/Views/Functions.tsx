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

import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { HelperPaneCompletionItem, InputMode } from "@wso2/ballerina-side-panel";
import { debounce } from "lodash";
import { useRef, useState, useCallback, RefObject, useEffect } from "react";
import { extractFunctionInsertText } from "../../../../utils/bi";
import { useFunctionPagination } from "../../../../utils/useFunctionPagination";
import { CompletionInsertText, FunctionKind, LineRange } from "@wso2/ballerina-core";
import { useMutation } from "@tanstack/react-query";
import { ExpandableList } from "../Components/ExpandableList";
import { CompletionItem, HelperPaneCustom } from "@wso2/ui-toolkit/lib/components/ExpressionEditor";
import { EmptyItemsPlaceHolder } from "../Components/EmptyItemsPlaceHolder";
import styled from "@emotion/styled";
import { Divider, ProgressRing, SearchBox } from "@wso2/ui-toolkit";
import { LibraryBrowser } from "../../HelperPane/LibraryBrowser";
import { ScrollableContainer } from "../Components/ScrollableContainer";
import FooterButtons from "../Components/FooterButtons";
import { URI, Utils } from "vscode-uri";
import { FunctionFormStatic } from "../../FunctionFormStatic";
import { POPUP_IDS, useModalStack } from "../../../../Context";
import { HelperPaneIconType, getHelperPaneIcon } from "../utils/iconUtils";
import { HelperPaneListItem } from "../Components/HelperPaneListItem";
import { ResolvedType } from "../../Forms/FlowNodeForm";

type FunctionsPageProps = {
    fieldKey: string;
    anchorRef: RefObject<HTMLDivElement>;
    fileName: string;
    targetLineRange: LineRange;
    onClose: () => void;
    onChange: (insertText: CompletionInsertText | string) => void;
    updateImports: (key: string, imports: { [key: string]: string }) => void;
    selectedType?: ResolvedType;
    inputMode?: InputMode;
};

export const FunctionsPage = ({
    fieldKey,
    anchorRef,
    fileName,
    targetLineRange,
    onClose,
    onChange,
    updateImports,
    selectedType,
    inputMode
}: FunctionsPageProps) => {

    const { rpcClient } = useRpcContext();
    const firstRender = useRef<boolean>(true);
    const [searchValue, setSearchValue] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [showContent, setShowContent] = useState<boolean>(false);
    const [projectPath, setProjectPath] = useState<string>('');

    const {
        info: functionInfo,
        isFetchingMore,
        loadFirstPage,
        handleScroll
    } = useFunctionPagination({ fileName, targetLineRange });

    const { addModal, closeModal } = useModalStack();

    //TODO: get the correct filepath
    let defaultFunctionsFile = Utils.joinPath(URI.file(projectPath), 'functions.bal').fsPath;

    const debounceFetchFunctionInfo = useCallback(
        debounce((searchText: string) => {
            setIsLoading(true);

            // Only apply minimum loading time if we don't have any function info yet
            const shouldShowMinLoader = !functionInfo && !showContent;
            const minLoadingTime = shouldShowMinLoader ? new Promise(resolve => setTimeout(resolve, 500)) : Promise.resolve();

            Promise.all([
                loadFirstPage(searchText),
                minLoadingTime
            ]).finally(() => {
                setIsLoading(false);
                setShowContent(true);
            });
        }, 150),
        [loadFirstPage, functionInfo, showContent]
    );

    const fetchFunctionInfo = useCallback(
        (searchText: string) => {
            debounceFetchFunctionInfo(searchText);
        },
        [debounceFetchFunctionInfo]
    );

    const { mutateAsync: addFunction } = useMutation({
        mutationFn: (item: HelperPaneCompletionItem) =>
            rpcClient.getBIDiagramRpcClient().addFunction({
                filePath: fileName,
                codedata: item.codedata,
                kind: item.kind as FunctionKind,
                searchKind: 'FUNCTION'
            })
    });

    const onFunctionItemSelect = async (item: HelperPaneCompletionItem) => {
        setIsLoading(true);
        const response = await addFunction(item);

        setIsLoading(false)
        if (response) {
            if (response.prefix && response.moduleId) {
                const importStatement = {
                    [response.prefix]: response.moduleId
                };
                updateImports(fieldKey, importStatement);
            }
            return extractFunctionInsertText(response.template);
        }

        return { value: '' };
    };

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            fetchFunctionInfo('');
        }

        setDefaultFunctionsPath()
    }, []);

    const setDefaultFunctionsPath = () => {
        rpcClient.getVisualizerLocation().then((location) => {
            setProjectPath(location?.projectPath || '')
        })
    }

    const handleFunctionSearch = (searchText: string) => {
        setSearchValue(searchText);
        fetchFunctionInfo(searchText);
    };

    const handleFunctionSave = (value: string) => {
        onChange(value);
        closeModal(POPUP_IDS.FUNCTION);
        onClose();
    }

    const handleFunctionItemSelect = async (item: HelperPaneCompletionItem) => {
        const { value, cursorOffset } = await onFunctionItemSelect(item);
        onChange({ value, cursorOffset });
        onClose();
    };

    const handleNewFunctionClick = () => {
        addModal(
            <FunctionFormStatic
                projectPath={projectPath}
                filePath={defaultFunctionsFile}
                handleSubmit={handleFunctionSave}
                functionName={undefined}
                isDataMapper={false}
                defaultType={selectedType?.value}
            />, POPUP_IDS.FUNCTION, "New Function", 500, 400);
        onClose();
    }

    const handleOpenLibraryBrowser = () => {
        addModal(
            <LibraryBrowser
                fileName={fileName}
                targetLineRange={targetLineRange}
                onClose={() => closeModal(POPUP_IDS.LIBRARY_BROWSER)}
                onChange={(insertText) => {
                    onChange(insertText);
                    onClose();
                }}
                onFunctionItemSelect={onFunctionItemSelect}
            />, POPUP_IDS.LIBRARY_BROWSER, "Function Browser", 600, 550);
    }

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "hidden"
        }}>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", margin: "3px 5px", height: "20px" }}>
                <SearchBox sx={{ width: "100%" }} placeholder='Search' value={searchValue} onChange={handleFunctionSearch} />
            </div>

            <ScrollableContainer style={{ margin: '8px 0px' }} onScroll={handleScroll}>
                {

                    isLoading || !showContent ? (
                        <HelperPaneCustom.Loader />
                    ) : (
                        <>
                            {(() => {
                                // Check if we have any functions to display
                                const hasAnyFunctions = functionInfo?.category?.some(category => {
                                    if (category.items && category.items.length > 0) {
                                        return true;
                                    }
                                    if (category.subCategory && category.subCategory.some(sub => sub.items && sub.items.length > 0)) {
                                        return true;
                                    }
                                    return false;
                                });

                                if (!functionInfo || !functionInfo.category || functionInfo.category.length === 0 || !hasAnyFunctions) {
                                    return <EmptyItemsPlaceHolder message={searchValue ? "No functions found for your search" : "No functions found"} />;
                                }

                                return (
                                    <>
                                        {functionInfo.category.map((category) => {
                                            if (!category.subCategory) {
                                                if (!category.items || category.items.length === 0) {
                                                    return null;
                                                }

                                                return (
                                                    <ExpandableList>
                                                        <ExpandableList.Section key={category.label} title={category.label} level={0}>
                                                            <div style={{ marginTop: '10px' }}>
                                                                {category.items.map((item) => (
                                                                    <HelperPaneListItem
                                                                        key={item.label}
                                                                        onClick={async () => await handleFunctionItemSelect(item)}
                                                                    >
                                                                        {getHelperPaneIcon(HelperPaneIconType.FUNCTION)}
                                                                        <FunctionItemLabel>{`${item.label}()`}</FunctionItemLabel>
                                                                    </HelperPaneListItem>
                                                                ))}
                                                            </div>
                                                        </ExpandableList.Section>
                                                    </ExpandableList>
                                                )
                                            }

                                            //if sub category is empty
                                            const nonEmptySubCategories = category.subCategory.filter(
                                                sub => sub.items && sub.items.length > 0
                                            );
                                            if (nonEmptySubCategories.length === 0) {
                                                return null;
                                            }

                                            return (
                                                <ExpandableList key={category.label}>
                                                    <ExpandableList.Section title={category.label} level={0}>
                                                        {nonEmptySubCategories.map((subCategory) => (
                                                            <ExpandableList.Section key={subCategory.label} title={subCategory.label} level={1}>
                                                                <div style={{ marginTop: '10px' }}>
                                                                    {subCategory.items.map((item) => (
                                                                        <HelperPaneListItem
                                                                            key={item.label}
                                                                            onClick={async () => await handleFunctionItemSelect(item)}
                                                                        >
                                                                            {getHelperPaneIcon(HelperPaneIconType.FUNCTION)}
                                                                            <FunctionItemLabel>{`${item.label}()`}</FunctionItemLabel>
                                                                        </HelperPaneListItem>
                                                                    ))}
                                                                </div>
                                                            </ExpandableList.Section>
                                                        ))}
                                                    </ExpandableList.Section>
                                                </ExpandableList>
                                            )
                                        })}
                                    </>
                                );
                            })()}
                        </>
                    )
                }
                {isFetchingMore && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "8px" }}>
                        <ProgressRing sx={{ height: "16px", width: "16px" }} />
                    </div>
                )}
            </ScrollableContainer>
            <Divider sx={{ margin: '0px' }} />
            <div style={{ margin: '4px 0' }}>
                <FooterButtons onClick={handleNewFunctionClick} title="New Function" />
                <FooterButtons
                    sx={{ display: "flex", justifyContent: "space-between" }}
                    title="Open Function Browser"
                    onClick={handleOpenLibraryBrowser}
                    startIcon="bi-arrow-outward"
                />
            </div>
        </div>
    )
}

const FunctionItemLabel = styled.span`
    font-size: 13px;
`;
