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

import { useEffect, useRef, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { CodeData, FlowNode, LineRange } from "@wso2/ballerina-core";
import { MarketplaceItem } from "@wso2/wso2-platform-core";
import { CloudKnowledgeBasePage } from "../../views/BI/Connection/DevantConnections/CloudKnowledgeBasePage";
import { prepareDevantKnowledgeBase } from "../../views/BI/Connection/DevantConnections/devant-kb-utils";
import { errorMessageOf } from "../../views/BI/Connection/DevantConnections/utils";
import { usePlatformExtContext } from "../../providers/platform-ext-ctx-provider";
import { RelativeLoader } from "../RelativeLoader";
import { LoaderContainer } from "../RelativeLoader/styles";

interface CloudKnowledgeBaseCreatorProps {
    connectorCodeData: CodeData;
    fileName?: string;
    targetLineRange?: LineRange;
    onNodeReady: (node: FlowNode) => void;
}

/**
 * Same "manually config" step the flow diagram's own "Add
 * Knowledge Base" panel shows for the WSO2 Cloud Knowledge Base type, adapted for the generic
 * modal/overlay creation path (`useCreateNode`'s `createGenericConnection`).
 */
export function CloudKnowledgeBaseCreator(props: CloudKnowledgeBaseCreatorProps) {
    const { connectorCodeData, fileName, targetLineRange, onNodeReady } = props;
    const { rpcClient } = useRpcContext();
    const { platformExtState, platformRpcClient } = usePlatformExtContext();
    const [loading, setLoading] = useState(false);
    // As in the flow diagram's panel: Close or Back while a step runs wins over its form or error.
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

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
            if (mountedRef.current) {
                onNodeReady(response.flowNode);
            }
        } catch (error) {
            console.error(">>> Error opening WSO2 Cloud knowledge base form", error);
            if (mountedRef.current) {
                await showError("Could not load the connector. Please try again.");
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    };

    const handleSelectExisting = async (item: MarketplaceItem) => {
        setLoading(true);
        try {
            if (!platformExtState || !platformRpcClient) {
                throw new Error("Choreo Cloud is not available in this window.");
            }
            const location = await rpcClient.getVisualizerLocation();
            const projectPath = location?.projectPath;
            const targetFile = fileName || projectPath;
            if (!projectPath || !targetFile) {
                throw new Error("Could not resolve the Ballerina project for this knowledge base.");
            }
            const flowNode = await prepareDevantKnowledgeBase({
                rpcClient,
                platformRpcClient,
                platformExtState,
                item,
                node: { codedata: connectorCodeData },
                projectPath,
                target: startPosition,
                fileName: targetFile,
            });
            // The connection exists in Choreo Cloud either way, so the list is refreshed even when closed.
            platformRpcClient.refreshConnectionList();
            if (mountedRef.current) {
                onNodeReady(flowNode);
            }
        } catch (error) {
            console.error(">>> Error setting up Choreo Cloud knowledge base", error);
            if (mountedRef.current) {
                await showError(errorMessageOf(error));
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    };

    if (loading) {
        return (
            <LoaderContainer>
                <RelativeLoader />
            </LoaderContainer>
        );
    }

    return (
        <CloudKnowledgeBasePage
            inset
            onCreateNew={handleCreateNew}
            onSelectExisting={handleSelectExisting}
        />
    );
}
