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

import { startCase } from "lodash";
import { FormField } from "../Form/types";
import { ExpressionProperty, getPrimaryInputType, InputType, RecordTypeField } from "@wso2/ballerina-core";
import { InputMode } from "../..";
import { EditorMode } from "./ExpandedEditor";
import { EXPANDABLE_MODES } from "./ExpandedEditor/modes/types";

export function isDropdownField(field: FormField) {
    return field.type === "MULTIPLE_SELECT" || field.type === "SINGLE_SELECT" || field.type?.toUpperCase() === "ENUM";
}

export function getValueForDropdown(field: FormField, multiSelectIndex: number = 0) {
    if (field.type === "MULTIPLE_SELECT") {
        // For multiple select, check if field.value is an array with values
        if (Array.isArray(field.value) && field.value.length > 0 && field.value[multiSelectIndex]) {
            return field.value[multiSelectIndex];
        }
        // Return first item as default if available
        return field.items && field.items.length > 0 ? field.items[0] : undefined;
    }
    // For single select, return the value if it exists and is not empty, otherwise return first item
    if (field.value && field.value !== "") {
        return field.value;
    }
    return field.items && field.items.length > 0 ? field.items[0] : undefined;
}

export function getValueFromArrayField(field: FormField, valueIndex: number = 0) {
    if (field.type !== "EXPRESSION_SET" && field.type !== "TEXT_SET") {
        return undefined;
    }
    return Array.isArray(field.value) && field.value.length > 0 ? field.value[valueIndex] : field.items?.[0];
}

export function capitalize(str: string) {
    if (!str) {
        return '';
    }
    return startCase(str);
}

type RequiredRuleOptions = {
    isRequired: boolean;
    label?: string;
    message?: string;
};

export const buildRequiredRule = ({ isRequired, label, message }: RequiredRuleOptions) => {
    if (!isRequired) {
        return false;
    }

    return {
        value: true,
        message: message ?? `${label ?? "This field"} is required`,
    };
};

/**
 * Translates a raw Ballerina compiler diagnostic for an identifier/name field into a
 * clearer, user-facing message. Validity is still decided entirely by the language server;
 * this only rewords the common cryptic diagnostics and falls back to the original message
 * when no friendly mapping is known.
 */
export function getFriendlyIdentifierMessage(rawMessage: string, label?: string): string {
    if (!rawMessage) {
        return rawMessage;
    }
    const name = (label ?? "name").toLowerCase();
    const msg = rawMessage.toLowerCase();
    if (msg.includes("redeclared") || msg.includes("already exists") || msg.includes("already defined")) {
        return `This ${name} is already used. Please choose a different name.`;
    }
    if (msg.includes("reserved keyword") || msg.includes("reserved-keyword")) {
        return `'${name}' cannot be a reserved keyword. Please choose a different name.`;
    }
    if (
        msg.includes("missing identifier") ||
        msg.includes("invalid token") ||
        msg.includes("invalid identifier") ||
        msg.includes("expected an identifier") ||
        msg.includes("identifier expected")
    ) {
        return `Invalid ${name}. Use letters, digits or underscores, and start with a letter or underscore.`;
    }
    return rawMessage;
}

export function sanitizeType(type: string) {
    if (type.includes('{') || type.includes('}') || (type.match(/:/g) || []).length > 1) {
        return type;
    }
    return type.includes(':') ? type.split(':').pop() : type;
}

export function getPropertyFromFormField(field: FormField): ExpressionProperty {
    return {
        metadata: field.metadata,
        value: field.value as string,
        optional: field.optional,
        editable: field.editable,
        advanced: field.advanced,
        placeholder: field.placeholder,
        types: field.types,
        codedata: field.codedata,
        imports: field.imports,
        diagnostics: {
            hasDiagnostics: field.diagnostics?.length > 0 ? true : false,
            diagnostics: field.diagnostics
        }
    }
}

export const getFieldKeyForAdvanceProp = (fieldKey: string, advancePropKey: string) => {
    // Get the parent key for the advance prop
    let parentKeyForAdvanceProp = advancePropKey;
    const splitedAdvanceProp = advancePropKey.split('.advanceProperties.');
    if (splitedAdvanceProp.length > 1) {
        parentKeyForAdvanceProp = splitedAdvanceProp.slice(0, -1).join('.advanceProperties.');
    }

    if (parentKeyForAdvanceProp === fieldKey) {
        return advancePropKey;
    }

    return `${fieldKey}.advanceProperties.${advancePropKey}`;
}


export const isRecord = (value: unknown): value is Record<string, unknown> => {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
};

export const getValueForTextModeEditor = (value: string | any[] | Record<string, unknown>) => {
    if (isRecord(value)) return null;
    if (Array.isArray(value)) return value.at(0);
    if (value) {
        // Only remove starting and ending double quotes, preserve quotes within the string
        if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
            return value.slice(1, -1);
        }
        return value;
    }
    return value ?? "";
}

export function isExpandableMode(mode: InputMode): mode is EditorMode {
    return EXPANDABLE_MODES.includes(mode as EditorMode);
}

export function toEditorMode(mode: InputMode): EditorMode | undefined {
    return isExpandableMode(mode) ? mode : undefined;
}

export const getArraySubFormFieldFromTypes = (formId: string, types: InputType[]): FormField => {
    return {
        key: `ar-elm-${formId}`,
        label: "",
        type: getPrimaryInputType(types)?.fieldType || "",
        optional: false,
        editable: true,
        documentation: "",
        value: "",
        types: types.map(type => ({ ...type })),
        enabled: true
    }
}

export const getMapSubFormFieldFromTypes = (formId: string, types: InputType[]): FormField[] => {
    return [
        {
            key: `mp-key-${formId}`,
            label: "Key",
            type: "IDENTIFIER",
            optional: false,
            editable: true,
            documentation: "",
            value: "",
            types: [{ fieldType: "IDENTIFIER", selected: true }],
            enabled: true
        },
        {
            key: `mp-val-${formId}`,
            label: "Value",
            type: getPrimaryInputType(types)?.fieldType || "",
            optional: false,
            editable: true,
            documentation: "",
            value: "",
            types: types.map(type => ({ ...type })),
            enabled: true
        }
    ]
}

export function stringToRawArrayElements(input: string): string[] {
    // remove outer [ ]
    const s = input.trim().slice(1, -1);

    if (s === "") {
        return [];
    }

    const result: string[] = [];
    let current = "";
    let depth = 0;
    let inString = false;

    for (let i = 0; i < s.length; i++) {
        const char = s[i];
        const prev = s[i - 1];

        // handle string boundaries
        if (char === '"' && prev !== "\\") {
            inString = !inString;
            current += char;
            continue;
        }

        if (!inString) {
            if (char === "[" || char === "{") depth++;
            if (char === "]" || char === "}") depth--;

            if (char === "," && depth === 0) {
                result.push(current);
                current = "";
                continue;
            }
        }

        current += char;
    }

    // Always push the final element (even if empty) to preserve trailing empty values
    result.push(current);

    return result;
}

export function stringToRawObjectEntries(
    input: string
): { key: string; value: string }[] {

    // remove outer { }
    const s = input.trim().slice(1, -1);

    const result: { key: string; value: string }[] = [];

    let current = "";
    let depth = 0;
    let inString = false;

    for (let i = 0; i < s.length; i++) {
        const char = s[i];
        const prev = s[i - 1];

        // toggle string state
        if (char === '"' && prev !== "\\") {
            inString = !inString;
            current += char;
            continue;
        }

        if (!inString) {
            if (char === "{" || char === "[") depth++;
            if (char === "}" || char === "]") depth--;

            // top-level comma → end of one pair
            if (char === "," && depth === 0) {
                pushPair(current, result);
                current = "";
                continue;
            }
        }

        current += char;
    }

    if (current.trim()) {
        pushPair(current, result);
    }

    return result;
}

function pushPair(
    text: string,
    result: { key: string; value: string }[]
) {
    let depth = 0;
    let inString = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const prev = text[i - 1];

        if (char === '"' && prev !== "\\") {
            inString = !inString;
        }

        if (!inString) {
            if (char === "{" || char === "[") depth++;
            if (char === "}" || char === "]") depth--;

            // first top-level colon
            if (char === ":" && depth === 0) {
                const key = text.slice(0, i).trim();
                const value = text.slice(i + 1).trim();

                result.push({
                    key: key,
                    value: value
                });
                return;
            }
        }
    }
}

export function buildStringArray(elements: FormField[]): string {
    if (typeof elements === "string") return elements;
    const parts = elements.map(el => {
        return ((el.value as string) ?? "").trim();
    });
    return `[${parts.join(", ")}]`;
}

export function buildStringMap(elements: FormField[][] | string): string {
    if (typeof elements === "string") return elements;
    let finalString = "{";
    elements.forEach((el, index) => {
        let processedValue = ((el[1].value as string) ?? "").trim();
        const keyValue = ((el[0].value as string) ?? "").trim();
        
        if (index !== 0) {
            finalString += `, ${keyValue}: ${processedValue}`;
        }
        else {
            finalString += ` ${keyValue}: ${processedValue}`;
        }
    });

    return finalString + "}";
}

export function getRecordTypeFields(fields: FormField[]): RecordTypeField[] {
    return fields.filter(field => {
        const types = field.types;
        if (!types) return false;
        return types.some(
            type =>
            (
                type.typeMembers &&
                type.typeMembers.some(member => member.kind === "RECORD_TYPE")
            )
        );
    })
        .map((field) => ({
            key: field.key,
            property: getPropertyFromFormField(field),
            recordTypeMembers: field.types
                .flatMap(type => type.typeMembers || [])
                .filter(member => member.kind === "RECORD_TYPE")
        }));
}

export const mapDiagnosticsServerityToFormSeverity = (severity: 1 | 2 | 3 | 4) => {
    switch (severity) {
        case 1:
            return "ERROR";
        case 2:
            return "WARNING";
        default:
            return "INFO";
    }       
}    
