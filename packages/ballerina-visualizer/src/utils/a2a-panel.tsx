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

import * as React from "react";
import { AvailableNode, Category } from "@wso2/ballerina-core";
import { Category as PanelCategory, Node as PanelNode } from "@wso2/ballerina-side-panel";
import { NodeIcon } from "@wso2/bi-diagram";

export const A2A_OBJECT_NODE = "A2A_OBJECT";

export function isA2aCategory(category: Category): boolean {
    return (
        category.metadata.label === "A2A" &&
        category.items.length > 0 &&
        category.items.every((item) => !("codedata" in item))
    );
}

export function convertA2aCategoryToSidePanelCategory(
    category: Category,
    convertRow: (item: AvailableNode) => PanelNode | undefined
): PanelCategory {
    const nodes: PanelNode[] = (category.items as Category[]).map((object) => {
        const rows = object.items
            .map((item) => convertRow(item as AvailableNode))
            .filter((row) => row !== undefined)
            .map((row) => ({ ...row, icon: <NodeIcon type="REMOTE_ACTION_CALL" size={16} /> }));
        const first = object.items.at(0) as AvailableNode | undefined;
        const glyph = first?.codedata?.node === "A2A_TASK_STORE" ? "A2A_TASK_STORE" : "A2A_TASK_UPDATE";
        const title = object.metadata.label;
        const page: PanelCategory = {
            title,
            description: object.metadata.description,
            items: [
                {
                    title: first?.codedata?.parentSymbol ?? title,
                    description: "",
                    icon: <NodeIcon type={glyph} size={20} />,
                    items: rows,
                },
            ],
        };
        return {
            id: A2A_OBJECT_NODE,
            label: title,
            description: object.metadata.description,
            enabled: true,
            icon: <NodeIcon type={glyph} size={16} />,
            metadata: {
                codedata: { node: A2A_OBJECT_NODE },
                metadata: { label: title, description: object.metadata.description },
                enabled: true,
                a2aPage: page,
            },
        } as PanelNode;
    });
    return {
        title: category.metadata.label,
        description: category.metadata.description,
        items: nodes,
    };
}
