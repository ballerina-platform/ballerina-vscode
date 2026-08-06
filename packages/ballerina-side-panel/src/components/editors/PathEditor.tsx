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

import React, { useCallback, useEffect, useState } from "react";
import { FormField } from "../Form/types";
import { TextField } from "@wso2/ui-toolkit";
import { useFormContext } from "../../context";
import { parseBasePath, parseResourceActionPath } from "../../utils/path-validations";
import { buildRequiredRule, capitalize } from "./utils";
import { buildValidate } from "../Form/validationRules";
import { dedupeMessages } from "../Form/DiagnosticsStore";
import { debounce } from "lodash";

interface PathEditorProps {
    field: FormField;
    handleOnFieldFocus?: (key: string) => void;
    autoFocus?: boolean;
}

export function PathEditor(props: PathEditorProps) {
    const { field, handleOnFieldFocus, autoFocus } = props;
    const { form } = useFormContext();
    const { register, setError, clearErrors, watch, formState: { errors } } = form;

    const [pathErrorMsg, setPathErrorMsg] = useState<string>(field.diagnostics?.map((diagnostic) => diagnostic.message).join("\n"));

    const validatePath = useCallback(debounce((value: string) => {
        const response = field.type === "SERVICE_PATH" ? parseBasePath(value) : parseResourceActionPath(value);
        if (response.errors.length > 0) {
            setPathErrorMsg(response.errors[0].message);
            setError(field.key, {
                type: "validate",
                message: response.errors[0].message
            });
        } else {
            setPathErrorMsg("");
            clearErrors(field.key);
        }
    }, 250), [field.key, field.type, setError, clearErrors]);

    // Validate on mount and when value changes (covers initial load, paste, programmatic updates)
    const fieldValue = watch(field.key);
    useEffect(() => {
        if (fieldValue !== undefined && fieldValue !== null) {
            validatePath(String(fieldValue));
        }
        return () => validatePath.cancel();
    }, [fieldValue, field.key, validatePath]);

    // `pathErrorMsg` (the legacy sync path-syntax check) and `errors[field.key]` (react-hook-form's
    // own state, which now also carries buildValidate's connector-shipped rule failures) are merged
    // here rather than shown from `pathErrorMsg` alone — previously a buildValidate failure marked
    // the field invalid (blocking Save) without ever appearing in this field's own error slot.
    const validationError = errors[field.key]?.message;
    const errorMsg = dedupeMessages([
        validationError ? String(validationError) : undefined,
        pathErrorMsg,
    ]).join("\n");

    return (
        <TextField
            id={field.key}
            name={field.key}
            {...register(field.key, {
                required: buildRequiredRule({ isRequired: !field.optional, label: field.label }),
                value: field.value,
                validate: buildValidate(field)
            })}
            label={capitalize(field.label)}
            required={!field.optional}
            description={field.documentation}
            placeholder={field.placeholder}
            readOnly={!field.editable}
            sx={{ width: "100%" }}
            errorMsg={errorMsg}
            onKeyUp={(e) => validatePath(e.currentTarget.value)}
            onFocus={() => handleOnFieldFocus?.(field.key)}
            autoFocus={autoFocus}
        />
    );
}
