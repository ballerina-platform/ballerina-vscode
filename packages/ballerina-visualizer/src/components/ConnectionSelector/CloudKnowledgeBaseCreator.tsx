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

import { useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AvailableNode, CodeData, FlowNode, LineRange } from "@wso2/ballerina-core";
import { MarketplaceItem } from "@wso2/wso2-platform-core";
import { usePlatformExtContext } from "../../providers/platform-ext-ctx-provider";
import { CloudKnowledgeBasePage } from "../../views/BI/Connection/DevantConnections/CloudKnowledgeBasePage";
import { prepareDevantKnowledgeBase } from "../../views/BI/Connection/DevantConnections/devant-kb-utils";
import { RelativeLoader } from "../RelativeLoader";
import { LoaderContainer } from "../RelativeLoader/styles";

interface CloudKnowledgeBaseCreatorProps {
    connectorCodeData: CodeData;
    fileName?: string;
    targetLineRange?: LineRange;
    onNodeReady: (node: FlowNode) => void;
}

/**
 * Same "manually config or pick an existing Devant service" step the flow diagram's own "Add
 * Knowledge Base" panel shows for the WSO2 Cloud Knowledge Base type, adapted for the generic
 * modal/overlay creation path (`useCreateNode`'s `createGenericConnection`).
 */
export function CloudKnowledgeBaseCreator(props: CloudKnowledgeBaseCreatorProps) {
    const { connectorCodeData, fileName, targetLineRange, onNodeReady } = props;
    const { rpcClient } = useRpcContext();
    const { platformRpcClient, platformExtState } = usePlatformExtContext();
    const [loading, setLoading] = useState(false);

    const startPosition = targetLineRange?.startLine || { line: 0, offset: 0 };

    const showError = async (message: string) => {
        await rpcClient.getCommonRpcClient().showErrorMessage({ message });
    };

    const handleCreateNew = async () => {
        setLoading(true);
        try {
            const response = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                position: startPosition,
                filePath: fileName,
                id: connectorCodeData,
            });
            onNodeReady(response.flowNode);
        } catch (error) {
            console.error(">>> Error opening WSO2 Cloud knowledge base form", error);
            await showError("Could not load the connector. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectExisting = async (item: MarketplaceItem) => {
        setLoading(true);
        try {
            const { projectPath } = await rpcClient.getVisualizerLocation();
            const node = await prepareDevantKnowledgeBase({
                rpcClient,
                platformRpcClient,
                platformExtState,
                item,
                node: { codedata: connectorCodeData, metadata: { label: item.name, description: "" }, enabled: true } as AvailableNode,
                projectPath,
                target: startPosition,
                fileName,
            });
            if (!node) {
                await showError("Could not connect to that knowledge base. Please try again.");
                return;
            }
            onNodeReady(node);
        } catch (error) {
            console.error(">>> Error setting up WSO2 Cloud knowledge base", error);
            await showError("Could not connect to that knowledge base. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <LoaderContainer>
                <RelativeLoader />
            </LoaderContainer>
        );
    }

    return <CloudKnowledgeBasePage onCreateNew={handleCreateNew} onSelectExisting={handleSelectExisting} />;
}
