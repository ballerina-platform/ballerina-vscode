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

import { REST_RESOURCE_PATH } from "../Connection/ConnectorBrowser/connectorActions";

export const TOOL_INPUT_GROUP = "toolInputs";
export const RESULT_TYPE_GROUP = "resultType";
export const OAUTH_GROUP = "oauthConfig";

export const INCLUDE_CONTEXT_KEY = "includeContext";

export function buildIncludeContextField(group?: string): Record<string, unknown> {
    return {
        key: INCLUDE_CONTEXT_KEY,
        label: "Pass agent context",
        type: "FLAG",
        documentation: "Adds ai:Context ctx as the first parameter so this tool can access the "
            + "invoking agent's context.",
        optional: true,
        editable: true,
        enabled: true,
        hidden: false,
        advanced: false,
        value: false,
        types: [{ fieldType: "FLAG", selected: true }],
        ...(group ? { group } : {}),
    };
}

interface GroupableField {
    group?: string;
    hidden?: boolean;
    optional?: boolean;
    value?: unknown;
}

export interface ToolFormGroup {
    id: string;
    label: string;
    defaultCollapsed: boolean;
}

export function buildToolFormGroups(fields: GroupableField[]): ToolFormGroup[] {
    const visibleIn = (group: string) =>
        fields.filter((field) => field.group === group && !field.hidden);

    const inputFields = visibleIn(TOOL_INPUT_GROUP);
    const hasUnfilledRequiredInput = inputFields.some(
        (field) => field.optional === false && (field.value === undefined || field.value === "")
    );

    const groups: ToolFormGroup[] = [];
    if (inputFields.length > 0) {
        groups.push({
            id: TOOL_INPUT_GROUP,
            label: "Inputs and Mapping",
            defaultCollapsed: !hasUnfilledRequiredInput,
        });
    }
    if (visibleIn(OAUTH_GROUP).length > 0) {
        groups.push({ id: OAUTH_GROUP, label: "OAuth Client Configuration", defaultCollapsed: true });
    }
    if (visibleIn(RESULT_TYPE_GROUP).length > 0) {
        groups.push({ id: RESULT_TYPE_GROUP, label: "Result Type", defaultCollapsed: true });
    }
    return groups;
}

export function resourceToolNameSeed(accessor: string, resourcePath: string): string {
    const path = (resourcePath || "").trim();
    if (!path || path === "/" || path === REST_RESOURCE_PATH) {
        return accessor || "";
    }

    const named = path
        .split("/")
        .filter((segment) => segment && !segment.startsWith("[") && /[a-zA-Z0-9]/.test(segment));

    const last = named.length > 0 ? named[named.length - 1] : "";
    if (!last) {
        return accessor || "";
    }
    return `${accessor}${last.charAt(0).toUpperCase()}${last.slice(1)}`;
}

export function suggestToolName(symbol: string, taken: Iterable<string>): string {
    const existing = new Set(taken);
    const words = (symbol || "").split(/[^a-zA-Z0-9]+/).filter(Boolean);
    const cleaned = words
        .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
        .join("");
    if (!cleaned) {
        return "newTool";
    }
    let base = `${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
    if (!/^[a-zA-Z_]/.test(base)) {
        base = `tool${base}`;
    }
    if (!base.toLowerCase().endsWith("tool")) {
        base = `${base}Tool`;
    }
    if (!existing.has(base)) {
        return base;
    }
    let suffix = 2;
    while (existing.has(`${base}${suffix}`)) {
        suffix++;
    }
    return `${base}${suffix}`;
}

export function getExistingToolNames(agentNode: { properties?: Record<string, any> } | undefined): string[] {
    const raw = agentNode?.properties?.tools?.value;
    if (Array.isArray(raw)) {
        return raw.map((entry) => String(entry).trim()).filter(Boolean);
    }
    if (typeof raw !== "string") {
        return [];
    }
    return raw
        .replace(/^\s*\[/, "")
        .replace(/\]\s*$/, "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}
