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

// The agent tool form: its collapsible sections, the agent-context flag and tool-name seeding.
// Connector browsing itself is shared — see Connection/ConnectorBrowser/connectorActions.

import { REST_RESOURCE_PATH } from "../Connection/ConnectorBrowser/connectorActions";

/** Collapsible sections of the tool form. */
export const TOOL_INPUT_GROUP = "toolInputs";
export const RESULT_TYPE_GROUP = "resultType";
export const OAUTH_GROUP = "oauthConfig";

export const INCLUDE_CONTEXT_KEY = "includeContext";

/**
 * `ai:Context ctx` becomes the tool's first parameter, so this belongs with the inputs — pass no
 * group for a form with no inputs card. A real FLAG field rather than an injected checkbox, so the
 * value arrives through the form and can sit inside a card.
 */
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

/**
 * Collapsible sections for the fields present. Inputs collapse since mappings default to
 * identity — except SQL queries, which are blanked, so hiding them would break Save.
 */
export function buildToolFormGroups(fields: GroupableField[]): ToolFormGroup[] {
    const visibleIn = (group: string) =>
        fields.filter((field) => field.group === group && !field.hidden);

    const inputFields = visibleIn(TOOL_INPUT_GROUP);
    const hasUnfilledRequiredInput = inputFields.some(
        (field) => field.optional === false && (field.value === undefined || field.value === "")
    );

    // Ordered by how often each is opened, most first.
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

/**
 * A resource action's symbol is only its accessor, so seed from the last named segment too.
 *
 *   `post` + `/users/[userId]/labels`      -> `postLabels`
 *   `get`  + `/users/[userId]/labels/[id]` -> `getLabels`
 */
export function resourceToolNameSeed(accessor: string, resourcePath: string): string {
    const path = (resourcePath || "").trim();
    // The rest-path placeholder is not a real endpoint.
    if (!path || path === "/" || path === REST_RESOURCE_PATH) {
        return accessor || "";
    }

    // Skip parameters and segments `suggestToolName` would strip to nothing.
    const named = path
        .split("/")
        .filter((segment) => segment && !segment.startsWith("[") && /[a-zA-Z0-9]/.test(segment));

    const last = named.length > 0 ? named[named.length - 1] : "";
    if (!last) {
        return accessor || "";
    }
    return `${accessor}${last.charAt(0).toUpperCase()}${last.slice(1)}`;
}

const BALLERINA_RESERVED_TOOL_NAMES = new Set(["function", "type", "class", "service", "resource", "remote", "client"]);

/** `append` -> `appendTool`, with a numeric suffix when taken. */
export function suggestToolName(symbol: string, taken: Iterable<string>): string {
    const existing = new Set(taken);
    // Camel-case across separators: `get-range` -> `getRange`, not `getrange`.
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
    if (BALLERINA_RESERVED_TOOL_NAMES.has(base)) {
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

/** Names already used by the agent's tools, so a suggestion never collides. */
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
