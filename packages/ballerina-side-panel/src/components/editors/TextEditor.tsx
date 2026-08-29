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

import React from "react";
import { FormField } from "../Form/types";
import { TextField } from "@wso2/ui-toolkit";
import { useFormContext } from "../../context";
import { buildRequiredRule, capitalize } from "./utils";
import { buildValidate } from "../Form/validationRules";
import { useFieldDiagnostics } from "../Form/useFieldDiagnostics";
import { WarningBanner } from "../Form/WarningBanner";
import { dedupeMessages } from "../Form/DiagnosticsStore";

interface TextEditorProps {
    field: FormField;
    handleOnFieldFocus?: (key: string) => void;
    autoFocus?: boolean;
}

export function TextEditor(props: TextEditorProps) {
    const { field, handleOnFieldFocus, autoFocus } = props;
    const { form, fileName } = useFormContext();
    const { register, formState: { errors } } = form;

    // Live diagnostics: client rules run per keystroke, `ls.*` rules on a debounce. Fields with no
    // `ls.*` rules never reach the server, so this stays inert for the vast majority of them.
    const liveDiagnostics = useFieldDiagnostics(field, {
        filePath: fileName,
        moduleName: field.codedata?.moduleName,
    });

    // Merge every producer, deduped by message. The live rules (client on every keystroke, ls.*
    // debounced) are rendered directly rather than read back from react-hook-form: its default
    // `onSubmit` mode does not commit per-field errors until submit (only `isValid`, which gates
    // the button), so a `validations[]` failure would otherwise disable the button with nothing
    // shown. ERRORs go in the field's red slot (and mark it invalid); WARNINGs render amber below
    // and never block. The RHF error still covers the built-in required/pattern rules.
    const validationError = errors[field.key]?.message;
    const errorMsg = dedupeMessages([
        validationError ? String(validationError) : undefined,
        ...liveDiagnostics.errors.map((diagnostic) => diagnostic.message),
        ...(field.diagnostics ?? []).map((diagnostic) => diagnostic.message),
    ]).join("\n");
    const warningMsg = dedupeMessages(
        liveDiagnostics.warnings.map((diagnostic) => diagnostic.message)
    ).join("\n");

    // Build validation rules
    const validationRules: any = {
        required: buildRequiredRule({ isRequired: !field.optional, label: field.label }),
        value: field.value,
        validate: buildValidate(field)
    };

    // Add pattern validation if it exists in field types
    const patternType = field.types?.find(t => t.pattern);
    if (patternType?.pattern) {
        try {
            validationRules.pattern = {
                value: new RegExp(patternType.pattern),
                message: patternType.patternErrorMessage || "Invalid format"
            };
        } catch (error) {
            console.error(`Invalid regex pattern for field '${field.key}': ${patternType.pattern}`, error);
            // Skip adding pattern validation rule when regex is invalid
        }
    }

    // react-hook-form owns the change handler; chain onto it rather than replacing it, so the
    // debounced server check sees every edit without disturbing form state.
    const registration = register(field.key, validationRules);
    const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        await registration.onChange(event);
        liveDiagnostics.onValueChange(event.target.value);
    };

    return (
        <div style={{ width: "100%" }}>
            <TextField
                id={field.key}
                name={field.key}
                {...registration}
                onChange={handleChange}
                label={capitalize(field.label)}
                required={!field.optional}
                description={field.documentation}
                placeholder={field.placeholder}
                readOnly={!field.editable}
                sx={{ width: "100%" }}
                errorMsg={errorMsg}
                onFocus={() => handleOnFieldFocus?.(field.key)}
                autoFocus={autoFocus}
            />
            {/* WARNINGs render amber below, independent of whether an ERROR is also showing above —
                matches ExpressionEditor, whose ErrorBanner/WarningBanner render independently. */}
            {warningMsg && <WarningBanner warningMsg={warningMsg} />}
        </div>
    );
}
