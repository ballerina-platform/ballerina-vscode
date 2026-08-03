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

import { NodeKind, getPrimaryInputType } from "@wso2/ballerina-core";
import { FormField, FormImports } from "../..";

// This function allows us to format strings by adding indentation as tabs to the lines
export function formatJSONLikeString(input: string): string {
    const lines = input.split('\n');
    let indentLevel = 0;
    const formattedLines = lines.map((line) => {
        line = line.trim();
        if (line.endsWith('{')) {
            const formatted = '\t'.repeat(indentLevel) + line;
            indentLevel++;
            return formatted;
        } else if (line.startsWith('}')) {
            indentLevel = Math.max(0, indentLevel - 1);
            return '\t'.repeat(indentLevel) + line;
        } else {
            return '\t'.repeat(indentLevel) + line;
        }
    });
    return formattedLines.join('\n');
}

export function stripHtmlTags(content: string): string {
    return content?.replace(/<[^>]*>/g, "") || "";
}

export function updateFormFieldWithImports(formField: FormField, fieldImports: FormImports) {
    if (fieldImports?.[formField.key]) {
        formField.imports = fieldImports[formField.key];
    }
    return formField;
}

// A connection selector seeds its value with this sentinel (the LS "new connection" marker). It is a
// placeholder for the "add a new connection" affordance, not a real selection, so a required
// connection field must still count as incomplete until the user picks or creates a connection.
const NEW_CONNECTION_SENTINEL = "NEW_CONNECTION";

export function hasIncompleteRequiredFormFields(
    formFields: FormField[] = [],
    values: Record<string, unknown> = {}
): boolean {
    const checkField = (field: FormField): boolean => {
        if (field.hidden || field.enabled === false) {
            return false;
        }

        const value = values[field.key];
        const isEmptyString = typeof value === "string" && value.trim() === "";
        const isEmptyArray = Array.isArray(value) && value.length === 0;
        // An unselected connection selector still holds the sentinel; treat it as no value.
        const isUnselectedConnection =
            getPrimaryInputType(field.types)?.fieldType === "CONNECTION" && value === NEW_CONNECTION_SENTINEL;
        const hasValue =
            value !== undefined && value !== null && !isEmptyString && !isEmptyArray && !isUnselectedConnection;

        if (field.optional && !hasValue) {
            return false;
        }

        if (!hasValue) {
            return true;
        }
        if (typeof value === "string") {
            if (field.dynamicFormFields?.[value]) {
                if (field.dynamicFormFields[value].some(checkField)) {
                    return true;
                }
            }
        }
        return false;
    };

    return formFields.some(checkField);
}

export function shouldRunExternalFormValidation({
    formStateIsValid,
    errors,
    hasIncompleteRequiredFields = false,
}: {
    formStateIsValid: boolean;
    errors?: Record<string, unknown>;
    hasIncompleteRequiredFields?: boolean;
}): boolean {
    return formStateIsValid && Object.keys(errors ?? {}).length === 0 && !hasIncompleteRequiredFields;
}

export function isPrioritizedField(field: FormField): boolean {
    return field.key === "variable" || getPrimaryInputType(field.types)?.fieldType === "TYPE" || field.codedata?.kind === "PARAM_FOR_TYPE_INFER";
}

export function hasRequiredParameters(formFields: FormField[], selectedNode?: NodeKind): boolean {
    const parameterFields = formFields.filter(field => 
        !isPrioritizedField(field) && 
        field.type !== "VIEW" && 
        !field.hidden
    );

    return parameterFields.some((field) => !field.optional);
}

export function hasOptionalParameters(formFields: FormField[]): boolean {
    const parameterFields = formFields.filter(field => 
        !isPrioritizedField(field) && 
        field.type !== "VIEW" && 
        !field.hidden
    );

    return parameterFields.some(field => field.optional);
}

export function hasReturnType(formFields: FormField[]): boolean {
    return formFields.some(field => 
        field.key === "variable" || getPrimaryInputType(field.types)?.fieldType === "TYPE" || field.codedata?.kind === "PARAM_FOR_TYPE_INFER"
    );
}

export function isDefaultModelProvider(formFields: FormField[]): boolean {
    return formFields.some(field => 
        field.type === "TYPE" && 
        field.value && 
        field.value === "ai:Wso2ModelProvider" &&
        field.enabled === false
    );
}
