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

import React, { forwardRef, useRef, useState, useEffect, useCallback } from 'react';
import { TextField, Position } from '@wso2/ui-toolkit';
import { AddImportItemResponse, Imports, Type } from '@wso2/ballerina-core';
import { typeToSource } from './TypeUtil';
import { TypeHelper, TypeHelperItem } from '../TypeHelper';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { URI, Utils } from 'vscode-uri';
import { debounce } from 'lodash';
import { useTypeHelperContext } from '../Context';

interface TypeFieldProps {
    type: string | Type;
    memberName: string;
    onChange: (value: string) => void;
    onUpdateImports: (imports: Imports) => void;
    placeholder?: string;
    sx?: React.CSSProperties;
    onValidationError?: (isError: boolean) => void;
    rootType: Type;
    isAnonymousRecord?: boolean;
    label?: string;
    required?: boolean;
    autoFocus?: boolean;
    fieldIndex?: number;
}

export const TypeField = forwardRef<HTMLInputElement, TypeFieldProps>((props, ref) => {
    const {
        type,
        onChange,
        fieldIndex,
        onUpdateImports,
        placeholder,
        sx,
        memberName,
        rootType,
        onValidationError,
        isAnonymousRecord,
        label,
        required,
        autoFocus
    } = props;
    const { onTypeItemClick, onTypeCreate, ...rest } = useTypeHelperContext();

    const typeFieldRef = useRef<HTMLInputElement>(null);
    const typeHelperRef = useRef<HTMLDivElement>(null);
    const typeBrowserRef = useRef<HTMLDivElement>(null);
    const [typeFieldCursorPosition, setTypeFieldCursorPosition] = useState<number>(0);
    const [helperPaneOffset, setHelperPaneOffset] = useState<Position>({ top: 0, left: 0 });
    const [helperPaneOpened, setHelperPaneOpened] = useState<boolean>(false);
    const [typeError, setTypeError] = useState<string>("");
    const { rpcClient } = useRpcContext();


    const handleTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
        validateType(e.target.value);
    };

    const handleTypeHelperChange = (newType: string, newCursorPosition: number) => {
        onChange(newType);
        validateType(newType);

        setTypeFieldCursorPosition(newCursorPosition);

        // Focus the type field
        typeFieldRef.current?.focus();
        // Set cursor position
        typeFieldRef.current?.shadowRoot
            ?.querySelector('input')
            ?.setSelectionRange(newCursorPosition, newCursorPosition);
    };

    const handleTypeFieldFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        const rect = typeFieldRef.current.getBoundingClientRect();
        const sidePanelLeft = window.innerWidth - 400; // Side panel width
        const helperPaneLeftOffset = sidePanelLeft - rect.left;
        setHelperPaneOffset({ top: 0, left: helperPaneLeftOffset });
        setHelperPaneOpened(true);
        validateType(e.target.value);
    };

    const handleTypeFieldBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
        /* Prevent blur event when clicked on the type helper */
        const searchElements = Array.from(document.querySelectorAll('#helper-pane-search'));
        if (
            (typeHelperRef.current?.contains(e.relatedTarget as Node) ||
                typeBrowserRef.current?.contains(e.relatedTarget as Node)) &&
            !searchElements.some(element => element.contains(e.relatedTarget as Node))
        ) {
            e.preventDefault();
            e.stopPropagation();
            typeFieldRef.current?.shadowRoot?.querySelector('input')?.focus();
        }

        validateType(e.target.value);
    };

    const validateType = useCallback(debounce(async (value: string) => {
        if (isAnonymousRecord) {
            return;
        }

        // Skip validation for imported module types (module:Type format) till imported validation are sorted
        if (value.includes(':')) {
            const [moduleName, typeName] = value.split(':');
            if (moduleName && typeName) {
                // Valid module:Type format, skip validation
                setTypeError("");
                onValidationError?.(false);
                return;
            }
        }
        const projectPath = await rpcClient.getVisualizerLocation().then((res) => res.projectPath);

        const endPosition = await rpcClient.getBIDiagramRpcClient().getEndOfFile({
            filePath: Utils.joinPath(URI.file(projectPath), 'types.bal').fsPath
        });

        const response = await rpcClient.getBIDiagramRpcClient().getExpressionDiagnostics({
            filePath: Utils.joinPath(URI.file(projectPath), rootType?.codedata?.lineRange?.fileName || "types.bal").fsPath,
            context: {
                expression: value,
                startLine: {
                    line: rootType?.codedata?.lineRange?.startLine?.line ?? endPosition.line,
                    offset: rootType?.codedata?.lineRange?.startLine?.offset ?? endPosition.offset
                },
                offset: 0,
                lineOffset: 0,
                codedata: {
                    node: "VARIABLE",
                    lineRange: {
                        startLine: {
                            line: rootType?.codedata?.lineRange?.startLine?.line ?? endPosition.line,
                            offset: rootType?.codedata?.lineRange?.startLine?.offset ?? endPosition.offset
                        },
                        endLine: {
                            line: rootType?.codedata?.lineRange?.endLine?.line ?? endPosition.line,
                            offset: rootType?.codedata?.lineRange?.endLine?.offset ?? endPosition.offset
                        },
                        fileName: rootType?.codedata?.lineRange?.fileName
                    },
                },
                property: {
                    metadata: {
                        label: "",
                        description: "",
                    },
                    types: [{ fieldType: "TYPE", selected: false }],
                    value: "",
                    optional: false,
                    editable: true
                }
            }
        });
        if (response.diagnostics.length > 0) {
            setTypeError(response.diagnostics[0].message);
            onValidationError?.(true);
        } else {
            setTypeError("");
            onValidationError?.(false);
        }
    }, 250), [rpcClient, rootType]);

    const handleSelectionChange = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return;
        }

        const range = selection.getRangeAt(0);

        if (typeFieldRef.current?.parentElement?.contains(range.startContainer)) {
            setTypeFieldCursorPosition(
                typeFieldRef.current.shadowRoot.querySelector('input').selectionStart ?? 0
            );
        }
    };

    const handleTypeItemClick = async (item: TypeHelperItem): Promise<string> => {
        const response = await onTypeItemClick(item) as AddImportItemResponse;
        if (response) {
            if (response.prefix && response.moduleId) {
                const importStatement = {
                    [response.prefix]: response.moduleId
                };
                onUpdateImports(importStatement);
            }
            return response.template;
        }
        return "";
    };

    const handleTypeCreate = (typeName?: string) => {
        setHelperPaneOpened(false);
        onTypeCreate?.(fieldIndex, typeName);
    };

    /* Track cursor position */
    useEffect(() => {
        const typeField = typeFieldRef.current;
        if (!typeField) {
            return;
        }

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
        };
    }, [typeFieldRef.current]);

    /* Validate on initial mount to catch empty fields and existing errors */
    useEffect(() => {
        validateType(memberName);
    }, []);

    return (
        <>
            <TextField
                ref={typeFieldRef}
                data-testid="type-field"
                placeholder={placeholder}
                sx={sx}
                value={memberName}
                errorMsg={typeError}
                onChange={handleTypeChange}
                onFocus={handleTypeFieldFocus}
                onBlur={handleTypeFieldBlur}
                label={label}
                required={required}
                autoFocus={autoFocus}
            />
            <TypeHelper
                ref={typeHelperRef}
                typeFieldRef={typeFieldRef}
                typeBrowserRef={typeBrowserRef}
                currentType={typeToSource(type)}
                currentCursorPosition={typeFieldCursorPosition}
                onChange={handleTypeHelperChange}
                positionOffset={helperPaneOffset}
                open={helperPaneOpened}
                onClose={() => setHelperPaneOpened(false)}
                onTypeItemClick={handleTypeItemClick}
                {...onTypeCreate && { onTypeCreate: handleTypeCreate }}
                {...rest}
            />
        </>
    );
});
