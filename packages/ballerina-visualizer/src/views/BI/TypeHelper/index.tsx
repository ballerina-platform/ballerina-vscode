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

import React, { RefObject, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { useMutation } from "@tanstack/react-query";
import { CodeData, InputType, LineRange, functionKinds, getPrimaryInputType } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { TypeHelperItem } from "@wso2/type-editor";
import { FormExpressionEditorRef, HelperPaneHeight, Overlay, ThemeColors } from "@wso2/ui-toolkit";
import { LoadingRing } from "../../../components/Loader";
import { TypeHelperContext } from "../../../constants";
import { getFilteredTypesByKind, getTypeBrowserTypes, getTypes } from "../TypeEditor/utils";
import {
    getTypedescConstraint, getUserDefinedTypeNames, isTypedescField, restrictCurrentModuleTypes
} from "../../../utils/type-constraint";
import { TypePicker, TypeSection } from "./TypePicker";
import { canCreateType, rankTypes, replaceTypeAt, splitTypeQuery, toTypeOptions, typeQueryAt, TypeOption } from "./typeSearch";

const LoadingContainer = styled.div`
    position: absolute;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    z-index: 5000;
`;

// Libraries the project does not import yet are searched on the server, once a query narrows them down.
const LIBRARY_QUERY_MIN = 2;
const LIBRARY_SEARCH_DELAY_MS = 200;
// With nothing typed, imported modules can hold hundreds of types; a few show what is there.
const IMPORTED_PREVIEW = 30;

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

const optionKey = (option: TypeOption) => `${option.module ?? ""}:${option.item.name}`;

// While typing: one ranked list, then libraries not imported yet. Otherwise: what is in reach, by where it comes from.
function buildSections(local: TypeOption[], query: string, libraryOptions: TypeOption[], searching: boolean): TypeSection[] {
    if (query) {
        return [
            { title: "Matches", options: rankTypes(local, query) },
            { title: "From Libraries", options: rankTypes(libraryOptions, query, 20), note: searching ? "Searching…" : undefined },
        ];
    }
    const imported = local.filter((option) => option.source === "imported");
    return [
        { title: "This Integration", options: local.filter((option) => option.source === "project") },
        { title: "Built-in", options: local.filter((option) => option.source === "builtin") },
        {
            title: "Imported",
            options: imported.slice(0, IMPORTED_PREVIEW),
            note: imported.length > IMPORTED_PREVIEW ? "Type to narrow" : undefined
        },
    ];
}

const TypeHelperEl = (props: TypeHelperProps) => {
    const {
        fieldKey,
        types,
        typeHelperState,
        filePath,
        targetLineRange,
        currentType,
        currentCursorPosition,
        onChange,
        changeTypeHelperState,
        updateImports,
        onTypeCreate,
        onCloseCompletions,
        exprRef,
        typeHelperContext,
        recordsOnly
    } = props;

    const { rpcClient } = useRpcContext();
    const [visible, setVisible] = useState<TypeOption[]>();
    const [libraries, setLibraries] = useState<{ query: string; options: TypeOption[] }>();
    const [searchingLibraries, setSearchingLibraries] = useState(false);

    const primaryBallerinaType = getPrimaryInputType(types)?.ballerinaType;
    const typedescConstraint = getTypedescConstraint(types);
    // A typedesc's value has to name its type, so it lists only the types it can name.
    const typedescValue = isTypedescField(types);
    const isGraphQLContext = typeHelperContext === TypeHelperContext.GRAPHQL_FIELD_TYPE
        || typeHelperContext === TypeHelperContext.GRAPHQL_INPUT_TYPE;
    const narrowsToConstraint = !!typedescConstraint && !isGraphQLContext;
    // A field whose constraint changes, or drops it, fetches its types again.
    const typesKey = `${primaryBallerinaType ?? ""}|${typedescConstraint ?? ""}|${typedescValue ? "typedesc" : ""}`;
    const input = exprRef.current?.inputElement;
    // The field tracks its cursor without re-rendering, so the panel follows the live cursor itself.
    const [caret, setCaret] = useState(currentCursorPosition);
    useEffect(() => setCaret(currentCursorPosition), [currentCursorPosition, currentType]);
    useEffect(() => {
        if (!input) {
            return;
        }
        const follow = () => setCaret(input.selectionStart ?? input.value.length);
        input.addEventListener("keyup", follow);
        input.addEventListener("click", follow);
        return () => {
            input.removeEventListener("keyup", follow);
            input.removeEventListener("click", follow);
        };
    }, [input]);
    const cursor = Math.min(caret ?? currentType.length, currentType.length);
    const query = typeQueryAt(currentType, cursor);

    // Everything visible from the field, once per open; filtering after that is local, so it keeps up with typing.
    useEffect(() => {
        if (!typeHelperState || !rpcClient) {
            return;
        }
        let cancelled = false;
        const position = { line: targetLineRange.startLine.line, offset: targetLineRange.startLine.offset };
        Promise.all([
            isGraphQLContext
                ? rpcClient.getServiceDesignerRpcClient().getResourceReturnTypes({ filePath, context: typeHelperContext })
                : rpcClient.getBIDiagramRpcClient().getVisibleTypes({
                    filePath,
                    position,
                    ...(primaryBallerinaType && { typeConstraint: primaryBallerinaType }),
                    ...(typedescValue && { typedescValue: true })
                }),
            rpcClient.getBIDiagramRpcClient().search({
                filePath,
                position: targetLineRange,
                queryMap: { q: "", offset: 0, limit: 1000 },
                searchKind: "TYPE"
            }),
        ]).then(([basicTypes, search]) => {
            if (cancelled) {
                return;
            }
            // Only a typedesc field narrows the module's own types, to those its constraint allows.
            const categories = narrowsToConstraint
                ? restrictCurrentModuleTypes(search.categories, getUserDefinedTypeNames(basicTypes))
                : search.categories;
            setVisible([
                ...(recordsOnly ? [] : toTypeOptions(getTypes(basicTypes, primaryBallerinaType === "json"), "builtin")),
                ...toTypeOptions(getFilteredTypesByKind(categories, [functionKinds.CURRENT]), "project"),
                ...(isGraphQLContext ? [] : toTypeOptions(getFilteredTypesByKind(categories, [functionKinds.IMPORTED]), "imported")),
            ]);
        }).catch((error) => {
            console.error(error);
            setVisible((current) => current ?? []);
        });
        return () => {
            cancelled = true;
        };
    }, [typeHelperState, rpcClient, filePath, targetLineRange.startLine.line, targetLineRange.startLine.offset, typesKey]);

    useEffect(() => {
        const typedName = splitTypeQuery(query).name;
        if (!typeHelperState || isGraphQLContext || typedName.length < LIBRARY_QUERY_MIN || !visible) {
            setSearchingLibraries(false);
            return;
        }
        let cancelled = false;
        setSearchingLibraries(true);
        const timer = setTimeout(async () => {
            try {
                const response = await rpcClient.getBIDiagramRpcClient().search({
                    filePath,
                    position: targetLineRange,
                    queryMap: { q: typedName, offset: 0, limit: 50 },
                    searchKind: "TYPE"
                });
                const known = new Set(visible.map(optionKey));
                const options = toTypeOptions(getTypeBrowserTypes(response.categories), "library").filter((option) =>
                    option.item.kind !== functionKinds.CURRENT
                    && option.item.kind !== functionKinds.IMPORTED
                    && !known.has(optionKey(option)));
                if (!cancelled) {
                    setLibraries({ query, options });
                }
            } catch (error) {
                console.error(error);
            } finally {
                if (!cancelled) {
                    setSearchingLibraries(false);
                }
            }
        }, LIBRARY_SEARCH_DELAY_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, typeHelperState, visible]);

    // Adds the type's import when it comes from a module, and returns the text to insert.
    const { mutateAsync: addType, isPending: isAddingType } = useMutation({
        mutationFn: async (item: TypeHelperItem) => {
            const response = await rpcClient.getBIDiagramRpcClient().addFunction({
                filePath,
                codedata: item.codedata,
                kind: item.kind,
                searchKind: "TYPE"
            });
            if (response?.prefix && response.moduleId) {
                updateImports(fieldKey, { [response.prefix]: response.moduleId }, item.codedata);
            }
            return response?.template ?? "";
        }
    });

    const close = () => {
        onCloseCompletions?.();
        changeTypeHelperState(false);
    };

    const pick = async (option: TypeOption) => {
        try {
            const insert = option.source === "builtin" ? option.item.insertText : await addType(option.item);
            if (insert) {
                const next = replaceTypeAt(currentType, cursor, insert);
                onChange(next.text, next.cursor);
            }
        } catch (error) {
            console.error(error);
        }
        close();
    };

    const create = (name: string) => {
        changeTypeHelperState(false);
        onTypeCreate?.(name);
    };

    const local = visible ?? [];
    const sections = buildSections(local, query, libraries?.query === query ? libraries.options : [], searchingLibraries);

    return (
        <>
            <TypePicker
                query={query}
                sections={sections}
                loading={!visible}
                createName={!recordsOnly && onTypeCreate && canCreateType(query, local) ? query : undefined}
                input={input}
                width={input?.getBoundingClientRect().width}
                onPick={pick}
                onCreate={onTypeCreate ? create : undefined}
                onClose={close}
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
