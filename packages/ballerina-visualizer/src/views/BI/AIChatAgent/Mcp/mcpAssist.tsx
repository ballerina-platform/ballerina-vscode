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

import { ExpressionProperty, FormAssistGroup, FormAssistResponse, FormAssistSlot } from "@wso2/ballerina-core";
import { useAssistSource } from "@wso2/ballerina-side-panel";

export const REQUIRES_AUTH_SLOT = "requiresAuth";
export const TOOLS_INCLUDE_SLOT = "toolsInclude";
export const TOOLS_GROUP = "selectedTools";
export const INCLUDE_CONTEXT_SLOT = "includeContext";

const typed = (type: object) => ({ types: [{ selected: true, ...type }] }) as unknown as ExpressionProperty;
const FLAG = typed({ fieldType: "FLAG" });
const TOOLS_INCLUDE = typed({ fieldType: "SINGLE_SELECT", options: [{ value: "all", label: "All" }, { value: "selected", label: "Selected" }] });

// The MCP form's own parts, which are not form fields, as the form Copilot reads and sets them.
export interface McpAssistState {
    requiresAuth: boolean;
    setRequiresAuth: (on: boolean) => void;
    includeContext: boolean;
    setIncludeContext: (on: boolean) => void;
    toolsInclude: string;
    setToolsInclude: (value: string) => void;
    // The server's tools, once Selected has loaded them.
    tools: string[];
    selected: Set<string>;
    setSelected: (tools: Set<string>) => void;
    // Tools named before the list loads, picked when it arrives.
    pickLater: (tools: string[]) => void;
}

export function McpAssistSource(state: McpAssistState): null {
    useAssistSource({ describe: () => describeMcp(state), apply: (change) => applyMcp(state, change) });
    return null;
}

export function describeMcp(state: McpAssistState): { slots: FormAssistSlot[]; groups: FormAssistGroup[] } {
    const slots: FormAssistSlot[] = [
        { path: REQUIRES_AUTH_SLOT, label: "Requires Authentication", value: String(state.requiresAuth), property: FLAG, description: "Turn it on whenever Auth is set: Auth is not saved while it is off, and turning it off clears Auth." },
        { path: TOOLS_INCLUDE_SLOT, label: "Tools to Include", value: state.toolsInclude, property: TOOLS_INCLUDE, description: "All gives the agent every tool the server has; Selected gives only the tools picked." },
        { path: INCLUDE_CONTEXT_SLOT, label: "Pass Agent Context", value: String(state.includeContext), property: FLAG, description: "Adds the invoking agent's context as the first parameter of the generated tools." },
    ];
    return { slots, groups: [toolsGroup(state)] };
}

// Until Selected loads the server's tools, a pick is a name from the request, matched when the list arrives.
const toolsGroup = ({ tools, selected }: McpAssistState): FormAssistGroup => ({
    id: TOOLS_GROUP,
    label: "Selected Tools",
    rowLabel: "Tool",
    description: tools.length ? "The tools the agent may call, one per row."
        : "The tools the agent may call, one per row, named as the request names them; the server's tool list loads once Selected is on, and every tool stays picked when none of these names match.",
    item: [{
        key: "tool", label: "Tool",
        property: typed(tools.length ? { fieldType: "SINGLE_SELECT", options: tools.map((name) => ({ value: name, label: name })) } : { fieldType: "STRING" }),
    }],
    rows: tools.filter((name) => selected.has(name)).map((tool) => ({ tool })),
    min: tools.length ? 1 : 0,
    max: tools.length || undefined,
    when: [{ path: TOOLS_INCLUDE_SLOT, values: ["selected"] }],
});

const flag = (value?: string) => (value === undefined ? undefined : value.trim() === "true");

export function applyMcp(state: McpAssistState, { values = {}, groups = {} }: Pick<FormAssistResponse, "values" | "groups">) {
    const requiresAuth = flag(values[REQUIRES_AUTH_SLOT]);
    if (requiresAuth !== undefined) {
        state.setRequiresAuth(requiresAuth);
    }
    const context = flag(values[INCLUDE_CONTEXT_SLOT]);
    if (context !== undefined) {
        state.setIncludeContext(context);
    }
    if (values[TOOLS_INCLUDE_SLOT]) {
        state.setToolsInclude(values[TOOLS_INCLUDE_SLOT]);
    }
    const picked = groups[TOOLS_GROUP]?.map((row) => row.tool?.trim()).filter(Boolean);
    if (picked && state.tools.length) {
        state.setSelected(new Set(picked.filter((name) => state.tools.includes(name))));
    } else if (picked?.length) {
        state.pickLater(picked);
    }
}
