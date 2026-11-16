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
import { CodeData, FlowNode, LineRange } from "@wso2/ballerina-core";
import { CloudKnowledgeBasePage } from "../../views/BI/Connection/DevantConnections/CloudKnowledgeBasePage";
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

    if (loading) {
        return (
            <LoaderContainer>
                <RelativeLoader />
            </LoaderContainer>
        );
    }

    return <CloudKnowledgeBasePage inset onCreateNew={handleCreateNew} />;
}
