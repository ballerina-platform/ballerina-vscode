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
import React, { useState, useCallback, useEffect, useRef } from "react";
import { debounce } from "lodash";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { useFormContext } from "../../context";
import { buildRequiredRule, capitalize, fetchIdentifierDiagnostics, getFriendlyIdentifierMessage, getPropertyFromFormField } from "./utils";
import { buildValidate } from "../Form/validationRules";
import { FormField } from "../Form/types";
import { FieldTypeChip } from "./FieldTypeChip";
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
    const { watch, formState, register, setValue, setError, clearErrors, trigger } = form;
    const { errors } = formState;
    const [formDiagnostics, setFormDiagnostics] = useState(field.diagnostics);
    // Defer validation of a pristine empty field until touched.
    const [isTouched, setIsTouched] = useState(Boolean(field.value));

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

    // The field's client rules (e.g. a name already in use) would otherwise only show their message on
    // Save, while the form's background validity check already keeps Save disabled without saying why.
    // Re-running the registered rules (required and validate) shows the failing one's message.
    const showClientRuleError = useCallback(() => {
        clearErrors(field.key);
        trigger?.(field.key);
    }, [field.key, clearErrors, trigger]);

    // A slower response for an older value must not overwrite the result for the latest one.
    const latestRequestRef = useRef(0);
    const validateIdentifierName = useCallback(debounce(async (value: string) => {
        const requestId = ++latestRequestRef.current;
        const isStale = () => requestId !== latestRequestRef.current;
        try {
            const { first, firstError } = await fetchIdentifierDiagnostics(rpcClient, {
                filePath: fileName,
                startLine: targetLineRange?.startLine,
                value,
                property: getPropertyFromFormField(field),
                codedata: field.codedata,
                label: field.label,
            });
            if (isStale()) {
                return;
            }
            if (first) {
                setFormDiagnostics([first]);
                if (firstError) {
                    setError(field.key, { type: "identifier_diagnostic", message: firstError.message });
                } else {
                    showClientRuleError();
                }
            } else {
                setFormDiagnostics([]);
                showClientRuleError();
            }
        } catch (error) {
            if (isStale()) {
                return;
            }
            console.error('Failed to fetch expression diagnostics:', error);
            setFormDiagnostics([]);
            showClientRuleError();
        }
    }, 250), [rpcClient, field.key, field.codedata, targetLineRange, fileName, setError, showClientRuleError]);

    // Validate on value change, but skip a pristine empty value so a freshly opened field
    // doesn't show an error upfront (Save still triggers the required rule).
    const fieldValue = watch(field.key);
    useEffect(() => {
        if (fieldValue !== undefined && fieldValue !== null) {
            const isPristineEmpty = String(fieldValue).trim() === '' && !isTouched;
            if (!isPristineEmpty) {
                validateIdentifierName(String(fieldValue));
            }
        }
        return () => validateIdentifierName.cancel();
    }, [fieldValue, isTouched, validateIdentifierName]);

    // Clear error on unmount so it doesn't persist and block save after the field is gone.
    // Bump the request id first so an in-flight diagnostics response is treated as stale
    // and can't set the error again after this cleanup.
    useEffect(() => {
        const key = field.key;
        return () => {
            latestRequestRef.current++;
            clearErrors(key);
        };
    }, [field.key, clearErrors]);

    const registerField = register(field.key, {
        required: buildRequiredRule({ isRequired: !field.optional, label: field.label }),
        value: field.value,
        validate: buildValidate(field)
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
                labelAdornment={<FieldTypeChip types={field.types} />}
                {...registerField}
                onChange={(e) => handleOnChange(e)}
                required={!field.optional}
                description={field.documentation}
                placeholder={field.placeholder}
                readOnly={!field.editable}
                errorMsg={errors[field.key]?.message.toString()}
                onBlur={() => { setIsTouched(true); onBlur?.(); }}
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
