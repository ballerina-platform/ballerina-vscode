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

// A module-qualified TaskUpdater type, as in `a2a:TaskUpdater updater`. The webview only has the method's text, so a
// type from another module whose name is exactly TaskUpdater still matches; the language server does the module check
// for what it builds (the add-node panel and the design model).
const QUALIFIED_TASK_UPDATER = /(^|[\s(,])[A-Za-z_][\w.]*:TaskUpdater\s+\w+/;
const QUALIFIED_REQUEST_CONTEXT = /(^|[\s(,])[A-Za-z_][\w.]*:RequestContext\s+\w+/;

export function isA2aExecuteMethod(meta?: { label?: string; parameters?: string[]; sourceCode?: string }): boolean {
    if (meta?.label !== "execute") {
        return false;
    }
    const signature = meta.parameters?.length ? meta.parameters.join(", ") : meta.sourceCode ?? "";
    return QUALIFIED_TASK_UPDATER.test(signature) && QUALIFIED_REQUEST_CONTEXT.test(signature);
}

export const A2A_EXECUTE_CHANGED_WARNING =
    "You changed the execute method. The same method runs for every A2A operation that runs the agent, "
    + "send message and streaming, so the change applies to all of them.";
