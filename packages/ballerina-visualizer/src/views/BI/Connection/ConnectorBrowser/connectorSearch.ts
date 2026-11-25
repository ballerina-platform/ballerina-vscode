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

import { AvailableNode } from "@wso2/ballerina-core";
import { Node as PanelNode, matchesEveryWord } from "@wso2/ballerina-side-panel";
import { actionDisplayLabel } from "./connectorActions";

// Ranks a connector for a search, lower being better, or -1 when it is not found. The whole query as one
// phrase ranks first. Failing that, each word is looked for on its own, in any order and in any of the
// texts, so "sheets google" and "google database" still find what they describe.
export const scoreNode = (node: PanelNode, category: string, query: string): number => {
    const label = (node.label ?? "").toLowerCase();
    if (label === query) return 0;
    if (label.startsWith(query)) return 1;
    if (label.includes(` ${query}`)) return 2;
    if (label.includes(query)) return 3;
    const module = (node.metadata?.codedata?.module ?? "").toLowerCase();
    if (module.includes(query)) return 4;
    if (category.toLowerCase().includes(query)) return 5;
    if ((node.description ?? "").toLowerCase().includes(query)) return 6;
    if (matchesEveryWord(query, label)) return 7;
    if (matchesEveryWord(query, label, module, category, node.description)) return 8;
    return -1;
};

// Tells whether a search finds an action of a connector. Each word is looked for on its own, in any of the
// texts the action is known by: its name as written and as shown, its description, symbol and resource path.
export const actionMatchesSearch = (action: AvailableNode, searchText: string): boolean =>
    matchesEveryWord(
        searchText,
        action.metadata?.label,
        actionDisplayLabel(action.metadata?.label),
        action.metadata?.description,
        action.codedata?.symbol,
        action.codedata?.resourcePath
    );
