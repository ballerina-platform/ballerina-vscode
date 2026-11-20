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

import { getGraphqlNameError, toDisplayName, Type } from "@wso2/ballerina-core";
import { TextField } from "@wso2/ui-toolkit/lib/components/TextField/TextField";
import React, { ChangeEvent, forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { URI, Utils } from "vscode-uri";
import { debounce } from "lodash";

interface IdentifierFieldProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rootType: Type;
    label?: string;
    onValidationError?: (isError: boolean) => void;
    autoFocus?: boolean;
    /** GraphQL names allow only letters, digits and underscores, so a name that needs escaping is rejected. */
    isGraphql?: boolean;
    /** Shown at the end of the field, e.g. toggles for the syntax written after the name. */
    endAdornment?: React.ReactNode;
}

export const IdentifierField = forwardRef<HTMLInputElement, IdentifierFieldProps>((props, ref) => {
    const {
        value,
        onChange,
        placeholder,
        rootType,
        label,
        onValidationError,
        autoFocus,
        isGraphql,
        endAdornment
    } = props;

    const [internalErrorMsg, setInternalErrorMsg] = useState<string>("");
    const { rpcClient } = useRpcContext();

    // A name read from the source (issue\-number, 'type) is shown and edited plain (issue-number, type); the
    // language server escapes it when it writes the type. Only a value set from outside is converted, so what the
    // user types is kept as typed.
    const [text, setText] = useState<string>(() => toDisplayName(value ?? ""));
    const lastEmitted = useRef<string>(value);
    useEffect(() => {
        if (value !== lastEmitted.current) {
            lastEmitted.current = value;
            setText(toDisplayName(value ?? ""));
        }
    }, [value]);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        lastEmitted.current = event.target.value;
        setText(event.target.value);
        onChange(event.target.value);
        validateIdentifierName(event.target.value);
    };

    const validateIdentifierName = useCallback(debounce(async (value: string) => {
        const graphqlError = isGraphql ? getGraphqlNameError(value) : undefined;
        if (graphqlError) {
            setInternalErrorMsg(graphqlError);
            onValidationError?.(true);
            return;
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
                    value: "",
                    types: [{fieldType: "IDENTIFIER", scope: "Object", selected: false}],
                    optional: false,
                    editable: true
                }
            }
        });


        if (response.diagnostics.length > 0) {
            setInternalErrorMsg(response.diagnostics[0].message);
            onValidationError?.(true);
        } else {
            setInternalErrorMsg("");
            onValidationError?.(false);
        }
    }, 250), [rpcClient, rootType, isGraphql]);

    const handleOnBlur = async (e: React.ChangeEvent<HTMLInputElement>) => {
        validateIdentifierName(e.target.value);
    };

    const handleOnFocus = (e: React.ChangeEvent<HTMLInputElement>) => {
        validateIdentifierName(e.target.value);
    }

    return (
        <TextField
            ref={ref}
            data-testid="identifier-field"
            value={text}
            onChange={handleChange}
            onBlur={handleOnBlur}
            onFocus={handleOnFocus}
            placeholder={placeholder}
            errorMsg={internalErrorMsg}
            label={label}
            autoFocus={autoFocus}
            inputProps={endAdornment ? { endAdornment } : undefined}
        />
    );
});
