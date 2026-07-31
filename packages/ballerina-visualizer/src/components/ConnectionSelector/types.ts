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

import { FlowNode, InputType, ProjectStructureArtifactResponse, SearchKind } from "@wso2/ballerina-core";

export type ConnectionKind = 'MODEL_PROVIDER' | 'VECTOR_STORE' | 'EMBEDDING_PROVIDER' | 'CHUNKER' | 'SHORT_TERM_MEMORY_STORE';

export interface ConnectionKindConfig {
    displayName: string;
    types: InputType[];
    nodePropertyKey: string | string[];
    categoryConverter: (categories: any[]) => any[];
    searchConfig?: (aiModuleOrg?: string) => ConnectionSearchConfig;
}

export interface ConnectionInfo {
    text: string;
    description?: string;
    codeCommand?: string;
}

export interface ConnectionSpecialConfig {
    infoMessage?: ConnectionInfo;
    shouldShowInfo?: (symbol: string) => boolean;
}

export interface ConnectionConfigProps {
    fileName: string;
    connectionKind: ConnectionKind;
    selectedNode: FlowNode;
    onSave?: (selectedCallNode: FlowNode) => void;
    onNavigateToSelectionList?: () => void;
}

export interface ConnectionSearchConfig {
    query: string;
    searchKind: SearchKind;
}

export interface ConnectionSelectionListProps {
    connectionKind: ConnectionKind;
    selectedNode?: FlowNode;
    onSelect?: (id: string, metadata?: any) => void;
    expandedGroupId?: string | null;
    onExpandedGroupChange?: (groupId: string | null) => void;
}

export interface ConnectionCreatorProps {
    connectionKind: ConnectionKind;
    selectedNode?: FlowNode;
    nodeFormTemplate?: FlowNode;
    onSave?: (connectionNode: FlowNode, artifacts?: ProjectStructureArtifactResponse[]) => void;
}
