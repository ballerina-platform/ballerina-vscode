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

import { ErrorBanner, TextField } from "@wso2/ui-toolkit";
import React, { useState, useCallback, useEffect } from "react";
import { debounce } from "lodash";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { useFormContext } from "../../context";
import { buildRequiredRule, capitalize, getFriendlyIdentifierMessage, getPropertyFromFormField, mapDiagnosticsServerityToFormSeverity } from "./utils";
import { FormField } from "../Form/types";
export interface IdentifierFieldProps {
    field: FormField;
    handleOnFieldFocus?: (key: string) => void;
    autoFocus?: boolean;
    onBlur?: () => void | Promise<void>;
}

export function IdentifierField(props: IdentifierFieldProps) {
    const { field, handleOnFieldFocus, autoFocus, onBlur } = props;
    const { rpcClient } = useRpcContext();
    const { form, targetLineRange, fileName } = useFormContext();
    const { watch, formState, register, setValue, setError, clearErrors } = form;
    const { errors } = formState;
    const [formDiagnostics, setFormDiagnostics] = useState(field.diagnostics);

    useEffect(() => {
        setFormDiagnostics(field.diagnostics?.map((diagnostic) => ({
            ...diagnostic,
            message: getFriendlyIdentifierMessage(diagnostic.message, field.label)
        })));
    }, [field.diagnostics, field.label]);

    // Sync external field value changes to the form (e.g., when a sibling field's onValueChange updates the value)
    useEffect(() => {
        setValue(field.key, field.value ?? '');
    }, [field.key, field.value, setValue]);

    const validateIdentifierName = useCallback(debounce(async (value: string) => {
        try {
            const response = await rpcClient.getBIDiagramRpcClient().getExpressionDiagnostics({
                filePath: fileName,
                context: {
                    expression: value,
                    startLine: targetLineRange?.startLine,
                    offset: 0,
                    lineOffset: 0,
                    codedata: field.codedata,
                    property: getPropertyFromFormField(field)
                }
            });
            if (response.diagnostics.length > 0) {
                const rawDiagnostic = response.diagnostics[0];
                setFormDiagnostics([{ message: getFriendlyIdentifierMessage(rawDiagnostic.message, field.label), severity: mapDiagnosticsServerityToFormSeverity(rawDiagnostic.severity) }]);
                const errorDiagnostic = response.diagnostics.find((d) => d.severity === 1);
                if (errorDiagnostic) {
                    setError(field.key, { type: "identifier_diagnostic", message: getFriendlyIdentifierMessage(errorDiagnostic.message, field.label) });
                } else {
                    clearErrors(field.key);
                }
            } else {
                setFormDiagnostics([]);
                clearErrors(field.key);
            }
        } catch (error) {
            console.error('Failed to fetch expression diagnostics:', error);
            setFormDiagnostics([]);
            clearErrors(field.key);
        }
    }, 250), [rpcClient, field.key, field.codedata, targetLineRange, fileName, setError, clearErrors]);

    // Validate on value change (covers initial load, paste, programmatic updates, typing)
    const fieldValue = watch(field.key);
    useEffect(() => {
        if (fieldValue !== undefined && fieldValue !== null) {
            validateIdentifierName(String(fieldValue));
        }
        return () => validateIdentifierName.cancel();
    }, [fieldValue, validateIdentifierName]);

    // Clear error on unmount so it doesn't persist and block save after the field is gone
    useEffect(() => {
        const key = field.key;
        return () => clearErrors(key);
    }, [field.key, clearErrors]);

    const registerField = register(field.key, {
        required: buildRequiredRule({ isRequired: !field.optional, label: field.label }),
        value: field.value
    })
    const { onChange } = registerField;


    const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormDiagnostics([]);
        onChange(e);
        field.onValueChange?.(e.target.value as string);
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <TextField
                id={field.key}
                label={capitalize(field.label)}
                {...registerField}
                onChange={(e) => handleOnChange(e)}
                required={!field.optional}
                description={field.documentation}
                placeholder={field.placeholder}
                readOnly={!field.editable}
                errorMsg={errors[field.key]?.message.toString()}
                onBlur={() => onBlur?.()}
                onFocus={() => handleOnFieldFocus?.(field.key)}
                autoFocus={autoFocus}
                sx={{ width: "100%" }}
            />
            {(!errors[field.key]?.message) && formDiagnostics && formDiagnostics.length > 0 && (
                <ErrorBanner errorMsg={formDiagnostics.map(d => d.message).join('\n')} />
            )}
        </div>
    );
}
