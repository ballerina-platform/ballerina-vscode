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

import { cloneDeep } from "lodash";
import { alignRows, ConfigProperties, ExpressionProperty, FormAssistGroup, ParameterModel, PropertyModel } from "@wso2/ballerina-core";
import { HTTP_ENUM_TYPES } from "../../../utils";

type Row = Record<string, string>;
type HttpParamType = "QUERY" | "HEADER" | "PAYLOAD";

/** Each kind's group id, which also marks its section when Copilot changes it. */
export const PARAMETER_GROUP: Record<HttpParamType, string> = { QUERY: "queryParameters", HEADER: "headers", PAYLOAD: "payload" };

interface ParamGroup {
    id: string;
    paramType: HttpParamType;
    template: string;
    label: string;
    rowLabel: string;
    description: string;
    max?: number;
    // The row value that names a parameter, so a row that keeps it keeps its parameter.
    key: string;
    item: (template: ParameterModel) => FormAssistGroup["item"];
    row: (param: ParameterModel) => Row;
    write: (param: ParameterModel, row: Row, isNew: boolean) => ParameterModel;
}

const as = (property: PropertyModel | undefined, fieldType: string, extra: object = {}): ExpressionProperty =>
    ({ ...property, optional: false, types: [{ fieldType, selected: true, ...extra }] }) as unknown as ExpressionProperty;

const httpType = (property: PropertyModel | undefined) =>
    as(property, "SINGLE_SELECT", { options: HTTP_ENUM_TYPES.map((value) => ({ value, label: value })) });

const unquote = (value = "") => value.replace(/^"|"$/g, "");

const withValue = (property: PropertyModel | undefined, value: string): PropertyModel => ({ ...property, value });

// The variable the header editor derives from a header name, e.g. X-Api-Key → xApiKey.
export const headerVariable = (header: string) => {
    const camel = header.replace(/[-.]([a-zA-Z])/g, (_, c: string) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
    return camel.charAt(0).toLowerCase() + camel.slice(1);
};

const defaultValueOf = (param: ParameterModel) => (param.defaultValue as PropertyModel | undefined);

// Query parameters and headers take an optional default of their own type.
const defaultItem = (template: ParameterModel): FormAssistGroup["item"] => defaultValueOf(template)
    ? [{ key: "defaultValue", label: "Default Value", typeFrom: "type", property: { ...as(defaultValueOf(template), "EXPRESSION"), optional: true } }]
    : [];

const defaultRow = (param: ParameterModel): Row => defaultValueOf(param)
    ? { defaultValue: defaultValueOf(param)?.enabled === false ? "" : defaultValueOf(param)?.value ?? "" }
    : {};

const withDefault = (param: ParameterModel, row: Row): Partial<ParameterModel> => defaultValueOf(param)
    ? { defaultValue: { ...withValue(defaultValueOf(param), row.defaultValue ?? ""), enabled: !!row.defaultValue } }
    : {};

const GROUPS: ParamGroup[] = [
    {
        id: PARAMETER_GROUP.QUERY, paramType: "QUERY", template: "query", label: "Query Parameters", rowLabel: "Query Parameter",
        description: "Values read from the request URL's query string.",
        key: "name",
        item: (template) => [
            { key: "name", label: "Name", property: as(template.name, "IDENTIFIER") },
            { key: "type", label: "Type", property: httpType(template.type) },
            ...defaultItem(template),
        ],
        row: (param) => ({ name: param.name?.value ?? "", type: param.type?.value ?? "", ...defaultRow(param) }),
        write: (param, row) => ({
            ...param,
            name: withValue(param.name, row.name ?? ""),
            type: withValue(param.type, row.type || "string"),
            ...withDefault(param, row),
        }),
    },
    {
        id: PARAMETER_GROUP.HEADER, paramType: "HEADER", template: "header", label: "Headers", rowLabel: "Header",
        description: "Values read from the request headers, by header name.",
        key: "headerName",
        item: (template) => [
            { key: "headerName", label: "Header Name", property: as(template.headerName, "STRING") },
            { key: "type", label: "Type", property: httpType(template.type) },
            ...defaultItem(template),
        ],
        row: (param) => ({ headerName: unquote(param.headerName?.value), type: param.type?.value ?? "", ...defaultRow(param) }),
        write: (param, row, isNew) => ({
            ...param,
            headerName: withValue(param.headerName, `"${row.headerName ?? ""}"`),
            name: isNew ? withValue(param.name, headerVariable(row.headerName ?? "")) : param.name,
            type: withValue(param.type, row.type || "string"),
            ...withDefault(param, row),
        }),
    },
    {
        id: PARAMETER_GROUP.PAYLOAD, paramType: "PAYLOAD", template: "payload", label: "Payload", rowLabel: "Payload", max: 1,
        description: "The request body, bound to this type. A GET request has none.",
        key: "type",
        item: (template) => [{ key: "type", label: "Type", property: as(template.type, "TYPE") }],
        row: (param) => ({ type: param.type?.value ?? "" }),
        write: (param, row) => ({
            ...param,
            name: withValue(param.name, param.name?.value || "payload"),
            type: withValue(param.type, row.type || "json"),
        }),
    },
];

const ofType = (parameters: ParameterModel[], paramType: HttpParamType) =>
    parameters.filter((param) => param.httpParamType === paramType);

/**
 * The resource's query parameters, headers and payload as Copilot row groups. A method without a body still lists the
 * payload, with no row allowed, so the form keeps its parts while the method changes.
 */
export function describeParameters(parameters: ParameterModel[], schemas: ConfigProperties, showPayload: boolean): FormAssistGroup[] {
    return GROUPS.filter((group) => schemas?.[group.template]).map((group) => ({
        id: group.id,
        label: group.label,
        rowLabel: group.rowLabel,
        description: group.description,
        item: group.item(schemas[group.template] as ParameterModel),
        rows: ofType(parameters, group.paramType).map(group.row),
        min: 0,
        max: group.paramType === "PAYLOAD" && !showPayload ? 0 : group.max,
    }));
}

/** Rewrites the parameters of each group given, in place; a row that keeps a parameter's name keeps that parameter. */
export function applyParameters(parameters: ParameterModel[], schemas: ConfigProperties, groups: Record<string, Row[]>): ParameterModel[] {
    return GROUPS.filter((group) => groups[group.id] && schemas?.[group.template]).reduce((current, group) => {
        const existing = ofType(current, group.paramType);
        const rows = groups[group.id];
        const created = (): ParameterModel => ({ ...cloneDeep(schemas[group.template] as ParameterModel), httpParamType: group.paramType, enabled: true });
        const written = alignRows(existing.map((param) => group.row(param)[group.key]), rows.map((row) => row[group.key] ?? ""))
            .filter((step) => step.after !== undefined)
            .map((step) => step.before !== undefined
                ? group.write(existing[step.before], rows[step.after!], false)
                : group.write(created(), rows[step.after!], true));
        const at = existing.length ? current.indexOf(existing[0]) : current.length;
        const others = current.filter((param) => !existing.includes(param));
        others.splice(at, 0, ...written);
        return others;
    }, parameters);
}
