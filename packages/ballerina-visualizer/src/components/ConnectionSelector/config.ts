/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { ConnectionKind, ConnectionKindConfig, ConnectionSpecialConfig, ConnectionSearchConfig } from "./types";
import { GET_DEFAULT_MODEL_PROVIDER } from "@wso2/ballerina-core";
import { BALLERINAX } from "../../constants";
import {
    convertChunkerCategoriesToSidePanelCategories,
    convertEmbeddingProviderCategoriesToSidePanelCategories,
    convertMemoryStoreCategoriesToSidePanelCategories,
    convertModelProviderCategoriesToSidePanelCategories,
    convertVectorStoreCategoriesToSidePanelCategories
} from "../../utils/bi";

export const CONNECTION_TYPE_CONFIGS: Record<ConnectionKind, ConnectionKindConfig> = {
    MODEL_PROVIDER: {
        displayName: "Model Provider",
        types: [{ fieldType: "ACTION_EXPRESSION", ballerinaType: "ai:ModelProvider", selected: true }, { fieldType: "EXPRESSION", selected: false }],
        nodePropertyKey: ["model", "modelProvider", "judgeModel"],
        categoryConverter: convertModelProviderCategoriesToSidePanelCategories,
        searchConfig: (aiModuleOrg?: string): ConnectionSearchConfig => ({
            query: "",
            searchKind: aiModuleOrg && aiModuleOrg === BALLERINAX ? "CLASS_INIT" : "MODEL_PROVIDER"
        })
    },
    VECTOR_STORE: {
        displayName: "Vector Store",
        types: [{ fieldType: "ACTION_EXPRESSION", ballerinaType: "ai:VectorStore", selected: true }, { fieldType: "EXPRESSION", selected: false }],
        nodePropertyKey: "vectorStore",
        categoryConverter: convertVectorStoreCategoriesToSidePanelCategories,
    },
    EMBEDDING_PROVIDER: {
        displayName: "Embedding Provider",
        types: [{ fieldType: "ACTION_EXPRESSION", ballerinaType: "ai:EmbeddingProvider", selected: true }, { fieldType: "EXPRESSION", selected: false }],
        nodePropertyKey: "embeddingModel",
        categoryConverter: convertEmbeddingProviderCategoriesToSidePanelCategories,
    },
    CHUNKER: {
        displayName: "Chunker",
        types: [{ fieldType: "ACTION_EXPRESSION", ballerinaType: "ai:Chunker", selected: true }, { fieldType: "EXPRESSION", selected: false }],
        nodePropertyKey: "chunker",
        categoryConverter: convertChunkerCategoriesToSidePanelCategories,
    },
    SHORT_TERM_MEMORY_STORE: {
        displayName: "Memory Store",
        types: [{ fieldType: "ACTION_EXPRESSION", ballerinaType: "ai:MemoryStore", selected: true }, { fieldType: "EXPRESSION", selected: false }],
        nodePropertyKey: "store",
        categoryConverter: convertMemoryStoreCategoriesToSidePanelCategories,
        searchConfig: (): ConnectionSearchConfig => ({
            query: "",
            searchKind: "SHORT_TERM_MEMORY_STORE"
        })
    }
};

export const CONNECTION_SPECIAL_CONFIGS: Record<string, ConnectionSpecialConfig> = {
    [GET_DEFAULT_MODEL_PROVIDER]: {
        infoMessage: {
            text: "Using the default WSO2 Model Provider will automatically add the necessary configuration values to Config.toml.",
            description: "This can also be done using the VSCode command palette command:",
            codeCommand: "> Ballerina: Configure default WSO2 model provider"
        },
        shouldShowInfo: (symbol: string) => symbol === GET_DEFAULT_MODEL_PROVIDER
    }
};

export const getConnectionKindConfig = (connectionType: ConnectionKind): ConnectionKindConfig => {
    return CONNECTION_TYPE_CONFIGS[connectionType];
};

export const getConnectionSpecialConfig = (symbol: string): ConnectionSpecialConfig | undefined => {
    return CONNECTION_SPECIAL_CONFIGS[symbol];
};

export const getConnectionKindDisplayName = (connectionKind?: ConnectionKind): string =>
    (connectionKind ? getConnectionKindConfig(connectionKind)?.displayName : undefined) ?? "Connection";
