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

import { keywords } from "@wso2/ballerina-core";

const BALLERINA_KEYWORDS = new Set(keywords);

/**
 * A variable name for an MCP toolkit, taken from the name its server gives itself: "DeepWiki" → "deepWiki",
 * "GitHub MCP Server" → "gitHubMcpServer", "tavily-mcp" → "tavilyMcp". Parenthesised notes such as "(Beta)" are
 * dropped, and a numeric suffix keeps the name clear of `reserved`. Returns undefined when the server name
 * yields no identifier.
 */
export const mcpServerVariableName = (serverName: string | undefined, reserved: ReadonlySet<string>): string | undefined => {
    const words = (serverName ?? "")
        .replace(/\([^)]*\)/g, " ")
        .split(/[^A-Za-z0-9]+/)
        .filter((word) => word.length > 0)
        // An all-caps word is an acronym: "MCP" reads as "Mcp" inside an identifier.
        .map((word) => (word.length > 1 && word === word.toUpperCase() ? word.charAt(0) + word.slice(1).toLowerCase() : word));
    if (words.length === 0) {
        return undefined;
    }
    const [first, ...rest] = words;
    let name = (first === first.toUpperCase() ? first.toLowerCase() : first.charAt(0).toLowerCase() + first.slice(1))
        + rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
    if (/^\d/.test(name)) {
        name = `_${name}`;
    }
    if (BALLERINA_KEYWORDS.has(name)) {
        name = `${name}Mcp`;
    }
    if (!reserved.has(name)) {
        return name;
    }
    let index = 1;
    while (reserved.has(`${name}${index}`)) {
        index++;
    }
    return `${name}${index}`;
};
