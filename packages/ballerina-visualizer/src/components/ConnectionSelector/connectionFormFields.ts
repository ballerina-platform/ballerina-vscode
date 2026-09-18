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

import { NodeProperties } from "@wso2/ballerina-core";
import { FormField } from "@wso2/ballerina-side-panel";
import { convertConfig } from "../../utils/node-property-utils";
import { ConnectionKind } from "./types";

const DEFAULT_CHUNKER_VALUE = "ai:AUTO";

// Knowledge base connectors (e.g. ai:VectorKnowledgeBase) take other connections as
// constructor args; these must offer the same pick-or-create UX as any other connection field.
const KNOWLEDGE_BASE_FIELD_KIND: Record<string, ConnectionKind> = {
    vectorStore: "VECTOR_STORE",
    embeddingModel: "EMBEDDING_PROVIDER",
    chunker: "CHUNKER",
};

export function convertConnectionConfig(properties: NodeProperties): FormField[] {
    const fields = convertConfig(properties, [], false);
    fields.forEach((field) => {
        const searchNodesKind = KNOWLEDGE_BASE_FIELD_KIND[field.codedata?.originalName];
        if (!searchNodesKind) {
            return;
        }
        field.type = "ACTION_EXPRESSION";
        field.types = [
            { fieldType: "ACTION_EXPRESSION", selected: true },
            { fieldType: "EXPRESSION", selected: false },
        ];
        field.advanced = false;
        field.codedata = { ...field.codedata, searchNodesKind };
        if (searchNodesKind === "CHUNKER") {
            field.defaultValue = DEFAULT_CHUNKER_VALUE;
            field.value = field.value || DEFAULT_CHUNKER_VALUE;
            field.codedata.staticItems = [
                { id: "auto", label: "AUTO", value: "ai:AUTO" },
                { id: "disable", label: "DISABLE", value: "ai:DISABLE" },
            ];
        }
    });
    return fields;
}
