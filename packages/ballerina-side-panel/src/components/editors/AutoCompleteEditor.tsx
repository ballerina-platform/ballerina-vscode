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

import React, { useEffect } from "react";

import { AutoComplete } from "@wso2/ui-toolkit";

import { FormField } from "../Form/types";
import { buildRequiredRule, capitalize, getValueForDropdown } from "./utils";
import { useFormContext } from "../../context";
import { SubPanel, SubPanelView } from "@wso2/ballerina-core";
import { buildValidate } from "../Form/validationRules";
import { useFieldDiagnostics } from "../Form/useFieldDiagnostics";
import { dedupeMessages } from "../Form/DiagnosticsStore";
import { WarningBanner } from "../Form/WarningBanner";

interface AutoCompleteEditorProps {
    field: FormField;
    openSubPanel?: (subPanel: SubPanel) => void;
}

export function AutoCompleteEditor(props: AutoCompleteEditorProps) {
    const { field, openSubPanel } = props;
    const { form, fileName } = useFormContext();
    const { register, setValue, watch, formState: { errors } } = form;

    const value = watch(field.key);

    // Live diagnostics: client rules (e.g. the identifier check on a free-typed value) run on
    // every change, same as TextEditor — react-hook-form's default `onSubmit` mode otherwise
    // leaves `errors` empty until submit is attempted, so a `validations[]` failure would go
    // unseen until save.
    const liveDiagnostics = useFieldDiagnostics(field, {
        filePath: fileName,
        moduleName: field.codedata?.moduleName,
    });

    const validationError = errors[field.key]?.message;
    const errorMsg = dedupeMessages([
        validationError ? String(validationError) : undefined,
        ...liveDiagnostics.errors.map((diagnostic) => diagnostic.message),
        ...(field.diagnostics ?? []).map((diagnostic) => diagnostic.message),
    ]).join("\n");
    const warningMsg = dedupeMessages(
        liveDiagnostics.warnings.map((diagnostic) => diagnostic.message)
    ).join("\n");

    return (
        <div style={{ width: "100%" }}>
            <AutoComplete
                id={field.key}
                description={field.documentation}
                value={value as string}
                errorMsg={errorMsg || undefined}
                {...register(field.key, {
                    required: buildRequiredRule({ isRequired: !field.optional, label: field.label }),
                    value: getValueForDropdown(field),
                    validate: buildValidate(field)
                })}
                label={capitalize(field.label)}
                items={field.items}
                allowItemCreate={field.allowItemCreate ?? true}
                required={!field.optional}
                disabled={!field.editable}
                onValueChange={(val: string) => {
                    // Preserve existing value when Combobox fires with empty on blur (e.g., click away without selecting)
                    const currentValue = value ?? getValueForDropdown(field) ?? field.value;
                    const newVal = (val === "" || val === undefined || val === null) && currentValue
                        ? currentValue
                        : val;
                    setValue(field.key, newVal);
                    field.onValueChange?.(newVal);
                    liveDiagnostics.onValueChange(newVal);
                }}
                sx={{
                    marginRight: "-4px",
                    "& [id='dropdown-container']": {
                        width: "292px",
                    }
                }}
            />
            {warningMsg && <WarningBanner warningMsg={warningMsg} />}
        </div>
    );
}
