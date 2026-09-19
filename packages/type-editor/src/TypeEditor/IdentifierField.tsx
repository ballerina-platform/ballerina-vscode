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

import { Type } from "@wso2/ballerina-core";
import { TextField } from "@wso2/ui-toolkit/lib/components/TextField/TextField";
import React, { ChangeEvent, forwardRef, useCallback, useState } from "react";
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
}

export const IdentifierField = forwardRef<HTMLInputElement, IdentifierFieldProps>((props, ref) => {
    const {
        value,
        onChange,
        placeholder,
        rootType,
        label,
        onValidationError,
        autoFocus
    } = props;

    const [internalErrorMsg, setInternalErrorMsg] = useState<string>("");
    const { rpcClient } = useRpcContext();

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.value);
        validateIdentifierName(event.target.value);
    };

    const validateIdentifierName = useCallback(debounce(async (value: string) => {
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
    }, 250), [rpcClient, rootType]);

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
            value={value}
            onChange={handleChange}
            onBlur={handleOnBlur}
            onFocus={handleOnFocus}
            placeholder={placeholder}
            errorMsg={internalErrorMsg}
            label={label}
            autoFocus={autoFocus}
        />
    );
});
