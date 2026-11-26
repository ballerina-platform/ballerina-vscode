/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { DropdownType, ExpressionProperty, FormAssistGroup, FormAssistSlot, ParameterModel, PropertyModel } from "@wso2/ballerina-core";
import { cloneDeep } from "lodash";
import type { HandlerUnit } from "./handlerLayout";

// A handler's annotation, MCP context toggles and bound headers as the form Copilot reads and sets them; they are not form fields.

const typed = (type: object) => ({ types: [{ selected: true, ...type }] }) as unknown as ExpressionProperty;
const FLAG = typed({ fieldType: "FLAG" });

const isLeaf = (field: PropertyModel) => !field.properties || Object.keys(field.properties).length === 0;
const isIncluded = (field: PropertyModel) => isLeaf(field) ? field.enabled !== false : String(field.value) === "true";
const selectOptions = (field: PropertyModel) => {
    const type = field.types?.find((option) => option.selected) ?? field.types?.[0];
    return type?.fieldType === "SINGLE_SELECT" ? (type as DropdownType).options : undefined;
};

export const annotationPath = (annotationKey: string, fieldKey?: string) => fieldKey ? `${annotationKey}.${fieldKey}` : annotationKey;

/** Each shown field of an annotation: a select by its options, a value, or a group's on/off; empty leaves a field out. */
export function describeAnnotation(annotationKey: string, annotation: PropertyModel, shown: (fieldKey: string) => boolean): FormAssistSlot[] {
    const entries = Object.entries(annotation.properties ?? {}) as [string, PropertyModel][];
    if (entries.length === 0) {
        return [{ path: annotationPath(annotationKey), label: annotation.metadata?.label || annotationKey, description: annotation.metadata?.description,
            property: annotation as unknown as ExpressionProperty, value: String(annotation.value ?? ""), optional: annotation.optional }];
    }
    return entries.filter(([fieldKey]) => shown(fieldKey)).map(([fieldKey, field]) => {
        const options = isLeaf(field) ? selectOptions(field) : undefined;
        const unset = field.placeholder ? ` Empty means ${field.placeholder}.` : "";
        const base = { path: annotationPath(annotationKey, fieldKey), label: field.metadata?.label || fieldKey, optional: true };
        if (!isLeaf(field)) {
            return { ...base, description: field.metadata?.description, property: FLAG, value: String(isIncluded(field)) };
        }
        return {
            ...base,
            description: `${field.metadata?.description ?? ""}${unset}`.trim() || undefined,
            property: options ? typed({ fieldType: "SINGLE_SELECT", options: options.map(({ value, label }) => ({ value, label })) })
                : field as unknown as ExpressionProperty,
            value: isIncluded(field) ? String(field.value ?? "") : "",
        };
    });
}

/** The annotation with the Copilot's values set; a field it emptied is left out, as its form leaves it out. */
export function applyAnnotation(annotationKey: string, annotation: PropertyModel, values: Record<string, string>): PropertyModel | undefined {
    const whole = values[annotationPath(annotationKey)];
    if (whole !== undefined) {
        return { ...annotation, value: whole };
    }
    const changed = (Object.entries(annotation.properties ?? {}) as [string, PropertyModel][])
        .filter(([fieldKey]) => values[annotationPath(annotationKey, fieldKey)] !== undefined)
        .map(([fieldKey, field]): [string, PropertyModel] => {
            const value = values[annotationPath(annotationKey, fieldKey)].trim();
            if (!isLeaf(field)) {
                return [fieldKey, { ...field, enabled: true, value: String(value === "true") }];
            }
            return [fieldKey, value ? { ...field, enabled: true, value } : { ...field, enabled: false }];
        });
    return changed.length ? { ...annotation, properties: { ...annotation.properties, ...Object.fromEntries(changed) } } : undefined;
}

export const paramPath = (id: string) => `context.${id}`;

/** The MCP runtime values a tool can take, each on or off. */
export const describeParams = (params: [string, ParameterModel][]): FormAssistSlot[] => params.map(([id, param]) => ({
    path: paramPath(id), label: param.metadata?.label || id, description: param.metadata?.description,
    property: FLAG, value: String(!!param.enabled), optional: true,
}));

export const HEADERS_GROUP = "httpHeaders";

const headerOf = (param: ParameterModel) => String(param.headerName?.value ?? "").replace(/"/g, "");
// As the header editor names a new header's parameter: Content-Type -> contentType.
const parameterNameOf = (header: string) => {
    const name = header.replace(/[-.]([a-zA-Z])/g, (_, c: string) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
    return name.charAt(0).toLowerCase() + name.slice(1);
};

/** The individually bound headers, one row each, by header name and the type it is read as. */
export const describeHeaders = (template: ParameterModel, headers: ParameterModel[], types: string[]): FormAssistGroup => ({
    id: HEADERS_GROUP,
    label: template.metadata?.label || "HTTP Headers",
    rowLabel: "Header",
    description: template.metadata?.description,
    item: [
        { key: "header", label: "Header Name", property: typed({ fieldType: "STRING" }) },
        { key: "type", label: "Type", property: typed({ fieldType: "SINGLE_SELECT", options: types.map((type) => ({ value: type, label: type })) }) },
    ],
    rows: headers.map((param) => ({ header: headerOf(param), type: String(param.type?.value || "string") })),
    min: 0,
});

/** The header parameters for these rows: a header already bound keeps its parameter, a new one is made from the template. */
export function applyHeaders(template: ParameterModel, headers: ParameterModel[], rows: Record<string, string>[]): ParameterModel[] {
    return rows.filter((row) => row.header?.trim()).map((row) => {
        const header = row.header.trim();
        const param = headers.find((known) => headerOf(known).toLowerCase() === header.toLowerCase())
            ?? { ...cloneDeep(template), httpParamType: "HEADER", name: { ...template.name, value: parameterNameOf(header) },
                headerName: { ...template.headerName, value: `"${header}"` } };
        return row.type?.trim() ? { ...param, type: { ...param.type, value: row.type.trim() } } : param;
    });
}

/** The Copilot keys of what these units render, so their section opens when a Copilot change lands in it. */
export const unitKeys = (units: HandlerUnit[]): string[] => units.flatMap((unit) => {
    if (unit.kind === "ANNOTATION" && unit.propertyKey) {
        return [annotationPath(unit.propertyKey), ...Object.keys(unit.property?.properties ?? {}).map((field) => annotationPath(unit.propertyKey!, field))];
    }
    if (unit.kind === "ADVANCED_PARAM") {
        return [paramPath(unit.id)];
    }
    if (unit.kind === "HEADERS") {
        return [HEADERS_GROUP];
    }
    return unit.fieldKey ? [unit.fieldKey] : [];
});
