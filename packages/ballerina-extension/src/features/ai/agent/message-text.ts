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

/** Concatenates the assistant's text output from a set of model messages. */
export function extractAssistantText(messages: any[]): string {
    const parts: string[] = [];
    for (const message of messages ?? []) {
        if (message?.role !== "assistant") {
            continue;
        }
        if (typeof message.content === "string") {
            parts.push(message.content);
        } else if (Array.isArray(message.content)) {
            for (const item of message.content) {
                if (item?.type === "text" && typeof item.text === "string") {
                    parts.push(item.text);
                }
            }
        }
    }
    return parts.join("\n").trim();
}
