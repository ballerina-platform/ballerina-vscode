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

export interface Described {
    group: string;
    title: string;
}

const OPERATIONS: Record<string, Described> = {
    "post message:send": { group: "Core", title: "Send message" },
    "get tasks/{}": { group: "Core", title: "Get task" },
    "post tasks/{}/cancel": { group: "Core", title: "Cancel task" },
    "get tasks": { group: "Core", title: "List tasks" },
    "post message:stream": { group: "Streaming", title: "Stream message" },
    "get tasks/{}/subscribe": { group: "Streaming", title: "Subscribe to task" },
    "post tasks/{}/pushNotificationConfigs": { group: "Push notifications", title: "Create push notification config" },
    "get tasks/{}/pushNotificationConfigs": { group: "Push notifications", title: "List push notification configs" },
    "get tasks/{}/pushNotificationConfigs/{}": { group: "Push notifications", title: "Get push notification config" },
    "delete tasks/{}/pushNotificationConfigs/{}": { group: "Push notifications", title: "Delete push notification config" },
    "get extendedAgentCard": { group: "Agent card", title: "Get extended agent card" },
};

export const CORE = "Core";

export const GROUP_ORDER = [CORE, "Streaming", "Push notifications", "Agent card"];
export const OTHER = "Other";

export function a2aPathOf(name: string): string {
    return (name ?? "").replace(/\\/g, "").replace(/\[\s*\w+\s+(\w+)\s*\]/g, "{$1}");
}

export function describeA2aOperation(
    accessor: string, name: string
): Described & { method: string; path: string; order: number; core: boolean } {
    const method = (accessor || "post").toLowerCase();
    const path = a2aPathOf(name);
    const key = `${method} ${path.replace(/\{[^}]*\}/g, "{}")}`;
    const known = OPERATIONS[key];
    const position = Object.keys(OPERATIONS).indexOf(key);
    return {
        group: known?.group ?? OTHER, title: known?.title ?? path, method: method.toUpperCase(), path,
        order: position < 0 ? Number.MAX_SAFE_INTEGER : position,
        core: known?.group === CORE,
    };
}
