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

import { FormExpressionEditorRef, HelperPaneHeight, Overlay, ThemeColors } from "@wso2/ui-toolkit";

import { RefObject, useRef } from 'react';

import { debounce } from 'lodash';
import { useCallback, useState } from 'react';
import { CodeData, InputType, LineRange, functionKinds, getPrimaryInputType } from '@wso2/ballerina-core';
import {
    TypeHelperCategory,
    TypeHelperComponent,
    TypeHelperItem,
    TypeHelperOperator
} from '@wso2/type-editor';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { filterOperators, filterTypes, getFilteredTypesByKind, getTypeBrowserTypes, getTypes } from '../TypeEditor/utils';
import { TYPE_HELPER_OPERATORS } from '../TypeEditor/constants';
import { useMutation } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { LoadingRing } from "../../../components/Loader";
import { TypeHelperContext } from "../../../constants";
import styled from "@emotion/styled";

const LoadingContainer = styled.div`
    position: absolute;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    z-index: 5000;
`;

type TypeHelperProps = {
    fieldKey: string;
    types: InputType[]
    typeBrowserRef: RefObject<HTMLDivElement>;
    filePath: string;
    exprRef: RefObject<FormExpressionEditorRef>;
    targetLineRange: LineRange;
    currentType: string;
    currentCursorPosition: number;
    helperPaneHeight: HelperPaneHeight;
    typeHelperState: boolean;
    onChange: (newType: string, newCursorPosition: number) => void;
    changeTypeHelperState: (isOpen: boolean) => void;
    updateImports: (key: string, imports: { [key: string]: string }, codedata?: CodeData) => void;
    onTypeCreate: (typeName: string) => void;
    onCloseCompletions?: () => void;
    typeHelperContext?: TypeHelperContext;
    recordsOnly?: boolean;
};

const TypeHelperEl = (props: TypeHelperProps) => {
    const {
        fieldKey,
        types,
        typeHelperState,
        filePath,
        targetLineRange,
        currentType,
        currentCursorPosition,
        helperPaneHeight,
        onChange,
        changeTypeHelperState,
        typeBrowserRef,
        updateImports,
        onTypeCreate,
        onCloseCompletions,
        exprRef,
        typeHelperContext,
        recordsOnly
    } = props;

    const { rpcClient } = useRpcContext();

    const [loading, setLoading] = useState<boolean>(false);
    const [loadingTypeBrowser, setLoadingTypeBrowser] = useState<boolean>(false);

    const [basicTypes, setBasicTypes] = useState<TypeHelperCategory[]>([]);
    const [importedTypes, setImportedTypes] = useState<TypeHelperCategory[]>([]);
    const [workspaceTypes, setWorkspaceTypes] = useState<TypeHelperCategory[]>([]);
    const [filteredBasicTypes, setFilteredBasicTypes] = useState<TypeHelperCategory[]>([]);
    const [filteredOperators, setFilteredOperators] = useState<TypeHelperOperator[]>([]);
    const [filteredTypeBrowserTypes, setFilteredTypeBrowserTypes] = useState<TypeHelperCategory[]>([]);

    const fetchedInitialTypes = useRef<boolean>(false);

    const primaryBallerinaType = getPrimaryInputType(types)?.ballerinaType;

    const debouncedSearchTypeHelper = useCallback(
        debounce(async (searchText: string, isType: boolean) => {
            if (!rpcClient) return;

            if (isType && !fetchedInitialTypes.current) {
                try {
                    const isFetchingTypesForDM = primaryBallerinaType === "json";
                    const isGraphQLContext = typeHelperContext === TypeHelperContext.GRAPHQL_FIELD_TYPE || typeHelperContext === TypeHelperContext.GRAPHQL_INPUT_TYPE;
                    const types = isGraphQLContext
                        ? await rpcClient.getServiceDesignerRpcClient().getResourceReturnTypes({
                            filePath: filePath,
                            context: typeHelperContext,
                        })
                        : await rpcClient.getBIDiagramRpcClient().getVisibleTypes({
                            filePath: filePath,
                            position: {
                                line: targetLineRange.startLine.line,
                                offset: targetLineRange.startLine.offset
                            },
                            ...(primaryBallerinaType && { typeConstraint: primaryBallerinaType })
                        });

                    const basicTypes = getTypes(types, isFetchingTypesForDM);
                    setBasicTypes(basicTypes);
                    setFilteredBasicTypes(basicTypes);
                    fetchedInitialTypes.current = true;

                    const searchResponse = await rpcClient.getBIDiagramRpcClient().search({
                        filePath: filePath,
                        position: targetLineRange,
                        queryMap: {
                            q: '',
                            offset: 0,
                            limit: 1000
                        },
                        searchKind: 'TYPE'
                    });

                    const workspaceTypes = getFilteredTypesByKind(searchResponse.categories, [functionKinds.CURRENT]);
                    setWorkspaceTypes(workspaceTypes);
                    // Additionally fetch imported types 
                    if (!isGraphQLContext) {
                        const importedTypes = getFilteredTypesByKind(searchResponse.categories, [functionKinds.IMPORTED]);
                        setImportedTypes(importedTypes);
                    }

                } catch (error) {
                    console.error(error);
                } finally {
                    setLoading(false);
                }
            } else if (isType) {
                setFilteredBasicTypes(filterTypes(basicTypes, searchText));

                try {
                    const response = await rpcClient.getBIDiagramRpcClient().search({
                        filePath: filePath,
                        position: targetLineRange,
                        queryMap: {
                            q: searchText,
                            offset: 0,
                            limit: 1000
                        },
                        searchKind: 'TYPE'
                    });

                    const importedTypes = getFilteredTypesByKind(response.categories, [functionKinds.IMPORTED]);
                    const workspaceTypes = getFilteredTypesByKind(response.categories, [functionKinds.CURRENT]);
                    setImportedTypes(importedTypes);
                    setWorkspaceTypes(workspaceTypes);
                } catch (error) {
                    console.error(error);
                } finally {
                    setLoading(false);
                }
            } else {
                setFilteredOperators(filterOperators(TYPE_HELPER_OPERATORS, searchText));
                setLoading(false);
            }
        }, 150),
        [basicTypes, filePath, targetLineRange, primaryBallerinaType, typeHelperContext, rpcClient]
    );

    const handleSearchTypeHelper = useCallback(
        (searchText: string, isType: boolean) => {
            setLoading(true);
            debouncedSearchTypeHelper(searchText, isType);
        },
        [debouncedSearchTypeHelper, basicTypes]
    );

    const debouncedSearchTypeBrowser = useCallback(
        debounce((searchText: string) => {
            if (rpcClient) {
                rpcClient
                    .getBIDiagramRpcClient()
                    .search({
                        filePath: filePath,
                        position: targetLineRange,
                        queryMap: {
                            q: searchText,
                            offset: 0,
                            limit: 1000
                        },
                        searchKind: 'TYPE'
                    })
                    .then((response) => {
                        setFilteredTypeBrowserTypes(getTypeBrowserTypes(response.categories));
                    })
                    .finally(() => {
                        setLoadingTypeBrowser(false);
                    });
            }
        }, 150),
        [filePath, targetLineRange]
    );

    const handleSearchTypeBrowser = useCallback(
        (searchText: string) => {
            setLoadingTypeBrowser(true);
            debouncedSearchTypeBrowser(searchText);
        },
        [debouncedSearchTypeBrowser]
    );

    const { mutateAsync: addFunction, isPending: isAddingType } = useMutation({
        mutationFn: (item: TypeHelperItem) =>
            rpcClient.getBIDiagramRpcClient().addFunction({
                filePath: filePath,
                codedata: item.codedata,
                kind: item.kind,
                searchKind: 'TYPE'
            })
    });

    const handleTypeItemClick = async (item: TypeHelperItem) => {
        const response = await addFunction(item);

        if (response) {
            if (response.prefix && response.moduleId) {
                const importStatement = {
                    [response.prefix]: response.moduleId
                };
                updateImports(fieldKey, importStatement, item.codedata);
            }
            return response.template;
        }

        return '';
    };

    const handleTypeHelperClose = () => {
        changeTypeHelperState(false);
    };

    const handleTypeCreate = (typeName?: string) => {
        changeTypeHelperState(false);
        onTypeCreate(typeName || 'MyType');
    };

    return (
        <>
            <TypeHelperComponent
                open={typeHelperState}
                currentType={currentType}
                currentCursorPosition={currentCursorPosition}
                loading={loading}
                loadingTypeBrowser={loadingTypeBrowser}
                referenceTypes={recordsOnly ? [] : basicTypes}
                basicTypes={recordsOnly ? [] : filteredBasicTypes}
                importedTypes={importedTypes}
                workspaceTypes={workspaceTypes}
                operators={recordsOnly ? [] : filteredOperators}
                typeBrowserTypes={filteredTypeBrowserTypes}
                typeBrowserRef={typeBrowserRef}
                typeHelperHeight={helperPaneHeight}
                onChange={onChange}
                onSearchTypeHelper={handleSearchTypeHelper}
                onSearchTypeBrowser={handleSearchTypeBrowser}
                onTypeItemClick={handleTypeItemClick}
                onClose={handleTypeHelperClose}
                onTypeCreate={recordsOnly ? undefined : handleTypeCreate}
                onCloseCompletions={onCloseCompletions}
                exprRef={exprRef}
            />
            {isAddingType && createPortal(
                <>
                    <Overlay sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.3`, zIndex: 5000 }} />
                    <LoadingContainer> <LoadingRing /> </LoadingContainer>
                </>
                , document.body
            )}
        </>
    );
};

export const getTypeHelper = (props: TypeHelperProps) => {
    return (
        <TypeHelperEl {...props} />
    );
};
