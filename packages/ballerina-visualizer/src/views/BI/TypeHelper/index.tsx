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
import { useCallback, useEffect, useState } from 'react';
import { Category, CodeData, InputType, LineRange, functionKinds, getPrimaryInputType } from '@wso2/ballerina-core';
import {
    TypeHelperCategory,
    TypeHelperComponent,
    TypeHelperItem,
    TypeHelperOperator
} from '@wso2/type-editor';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { filterOperators, filterTypes, getFilteredTypesByKind, getTypeBrowserTypes, getTypes } from '../TypeEditor/utils';
import { TYPE_HELPER_OPERATORS } from '../TypeEditor/constants';
import { getTypedescConstraint, getUserDefinedTypeNames, restrictCurrentModuleTypes } from "../../../utils/type-constraint";
import { createRequestGate } from "../../../utils/request-gate";
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
    onTypeCreate?: (typeName: string) => void;
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

    const primaryBallerinaType = getPrimaryInputType(types)?.ballerinaType;
    const typedescConstraint = getTypedescConstraint(types);
    // What the initial types were fetched for. A field whose constraint changes, or drops it, fetches them again.
    const initialTypesKey = `${primaryBallerinaType ?? ""}|${typedescConstraint ?? ""}`;
    const fetchedInitialTypesKey = useRef<string | undefined>(undefined);
    // The current module's types that belong to a typedesc field's constraint, with the key they were fetched for, so
    // a search never narrows with another constraint's names. Undefined names leave the search as it is.
    const allowedTypeNames = useRef<{ key: string; names?: Set<string> } | undefined>(undefined);
    // Only the latest search of each kind publishes, so a slow one cannot replace a later one's types.
    const helperRequestGate = useRef(createRequestGate()).current;
    const browserRequestGate = useRef(createRequestGate()).current;
    const isGraphQLContext = typeHelperContext === TypeHelperContext.GRAPHQL_FIELD_TYPE
        || typeHelperContext === TypeHelperContext.GRAPHQL_INPUT_TYPE;
    const narrowsToConstraint = !!typedescConstraint && !isGraphQLContext;

    const getVisibleTypes = () => rpcClient.getBIDiagramRpcClient().getVisibleTypes({
        filePath: filePath,
        position: {
            line: targetLineRange.startLine.line,
            offset: targetLineRange.startLine.offset
        },
        ...(primaryBallerinaType && { typeConstraint: primaryBallerinaType })
    });

    // The allowed names for the current constraint, fetched when no search has fetched them for it yet.
    const resolveAllowedTypeNames = async (): Promise<Set<string> | undefined> => {
        if (!narrowsToConstraint) {
            return undefined;
        }
        if (allowedTypeNames.current?.key !== initialTypesKey) {
            const key = initialTypesKey;
            const names = getUserDefinedTypeNames(await getVisibleTypes());
            allowedTypeNames.current = { key, names };
        }
        return allowedTypeNames.current.names;
    };

    const narrowToConstraint = (categories: Category[], names?: Set<string>): Category[] => names
        ? restrictCurrentModuleTypes(categories, names)
        : categories;

    const debouncedSearchTypeHelper = useCallback(
        debounce(async (searchText: string, isType: boolean) => {
            if (!rpcClient) return;

            if (!isType) {
                // The operator list is local: it takes no token, so it never cuts off a type search in flight.
                setFilteredOperators(filterOperators(TYPE_HELPER_OPERATORS, searchText));
                setLoading(false);
                return;
            }

            const requestToken = helperRequestGate.begin();
            if (fetchedInitialTypesKey.current !== initialTypesKey) {
                try {
                    const isFetchingTypesForDM = primaryBallerinaType === "json";
                    const types = isGraphQLContext
                        ? await rpcClient.getServiceDesignerRpcClient().getResourceReturnTypes({
                            filePath: filePath,
                            context: typeHelperContext,
                        })
                        : await getVisibleTypes();

                    // The names are kept even when a later request has taken over: they hold for this key regardless.
                    const allowedNames = narrowsToConstraint ? getUserDefinedTypeNames(types) : undefined;
                    allowedTypeNames.current = { key: initialTypesKey, names: allowedNames };
                    if (!helperRequestGate.isCurrent(requestToken)) {
                        return;
                    }
                    const basicTypes = getTypes(types, isFetchingTypesForDM);
                    setBasicTypes(basicTypes);
                    setFilteredBasicTypes(basicTypes);

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
                    if (!helperRequestGate.isCurrent(requestToken)) {
                        return;
                    }

                    const categories = narrowToConstraint(searchResponse.categories, allowedNames);
                    const workspaceTypes = getFilteredTypesByKind(categories, [functionKinds.CURRENT]);
                    setWorkspaceTypes(workspaceTypes);
                    // Additionally fetch imported types 
                    if (!isGraphQLContext) {
                        const importedTypes = getFilteredTypesByKind(categories, [functionKinds.IMPORTED]);
                        setImportedTypes(importedTypes);
                    }
                    // Recorded only once every list is published, so a fetch cut off part-way is made again by the
                    // next type search instead of leaving the module's types empty.
                    fetchedInitialTypesKey.current = initialTypesKey;

                } catch (error) {
                    console.error(error);
                } finally {
                    if (helperRequestGate.isCurrent(requestToken)) {
                        setLoading(false);
                    }
                }
            } else {
                setFilteredBasicTypes(filterTypes(basicTypes, searchText));

                try {
                    const [response, allowedNames] = await Promise.all([rpcClient.getBIDiagramRpcClient().search({
                        filePath: filePath,
                        position: targetLineRange,
                        queryMap: {
                            q: searchText,
                            offset: 0,
                            limit: 1000
                        },
                        searchKind: 'TYPE'
                    }), resolveAllowedTypeNames()]);
                    if (!helperRequestGate.isCurrent(requestToken)) {
                        return;
                    }

                    const categories = narrowToConstraint(response.categories, allowedNames);
                    const importedTypes = getFilteredTypesByKind(categories, [functionKinds.IMPORTED]);
                    const workspaceTypes = getFilteredTypesByKind(categories, [functionKinds.CURRENT]);
                    setImportedTypes(importedTypes);
                    setWorkspaceTypes(workspaceTypes);
                } catch (error) {
                    console.error(error);
                } finally {
                    if (helperRequestGate.isCurrent(requestToken)) {
                        setLoading(false);
                    }
                }
            }
        }, 150),
        [basicTypes, filePath, targetLineRange, primaryBallerinaType, initialTypesKey, narrowsToConstraint,
            isGraphQLContext, typeHelperContext, rpcClient]
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
                const requestToken = browserRequestGate.begin();
                // The browser can open before the helper's first fetch, so it resolves the names it narrows with.
                Promise.all([
                    rpcClient.getBIDiagramRpcClient().search({
                        filePath: filePath,
                        position: targetLineRange,
                        queryMap: {
                            q: searchText,
                            offset: 0,
                            limit: 1000
                        },
                        searchKind: 'TYPE'
                    }),
                    resolveAllowedTypeNames()
                ])
                    .then(([response, allowedNames]) => {
                        if (!browserRequestGate.isCurrent(requestToken)) {
                            return;
                        }
                        setFilteredTypeBrowserTypes(
                            getTypeBrowserTypes(narrowToConstraint(response.categories, allowedNames))
                        );
                    })
                    .catch((error) => console.error(error))
                    .finally(() => {
                        if (browserRequestGate.isCurrent(requestToken)) {
                            setLoadingTypeBrowser(false);
                        }
                    });
            }
        }, 150),
        [filePath, targetLineRange, primaryBallerinaType, initialTypesKey, narrowsToConstraint, rpcClient]
    );

    // The searches pending or in flight when the constraint changes (or the helper closes) were made for the old
    // constraint: they are dropped, and the next search fetches for the new one.
    const pendingSearchesRef = useRef({ helper: debouncedSearchTypeHelper, browser: debouncedSearchTypeBrowser });
    useEffect(() => {
        pendingSearchesRef.current = { helper: debouncedSearchTypeHelper, browser: debouncedSearchTypeBrowser };
    }, [debouncedSearchTypeHelper, debouncedSearchTypeBrowser]);
    useEffect(() => () => {
        // Cleanups run before the effect above updates the ref, so it still holds the instances that may be pending.
        pendingSearchesRef.current.helper.cancel();
        pendingSearchesRef.current.browser.cancel();
        helperRequestGate.invalidate();
        browserRequestGate.invalidate();
        setLoading(false);
        setLoadingTypeBrowser(false);
    }, [initialTypesKey]);

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
        onTypeCreate?.(typeName || 'MyType');
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
                onTypeCreate={recordsOnly || !onTypeCreate ? undefined : handleTypeCreate}
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
