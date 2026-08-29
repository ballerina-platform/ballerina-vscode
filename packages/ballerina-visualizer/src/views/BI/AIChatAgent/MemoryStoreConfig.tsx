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

import { FlowNode, NodePosition } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { useEffect, useRef, useState } from "react";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { LoaderContainer } from "../../../components/RelativeLoader/styles";
import { FlowNodeForm } from "../Forms/FlowNodeForm";
import { getNodeTemplate, resolveAgentNodePosition } from "./utils";

interface MemoryStoreConfigProps {
    storeNode: FlowNode;
    agentNode: FlowNode;
    onSave?: (agentPosition?: NodePosition) => void;
}

export function MemoryStoreConfig(props: MemoryStoreConfigProps): JSX.Element {
    const { storeNode, agentNode, onSave } = props;
    const { rpcClient } = useRpcContext();

    const [template, setTemplate] = useState<FlowNode>();
    const [isSaving, setIsSaving] = useState(false);
    const filePath = useRef<string>("");

    useEffect(() => {
        void (async () => {
            const lineRange = storeNode.codedata.lineRange;
            filePath.current = (await rpcClient.getVisualizerRpcClient()
                .joinProjectPath({ segments: [lineRange.fileName] })).filePath;
            const storeTemplate = await getNodeTemplate(rpcClient, storeNode.codedata, filePath.current);
            if (storeTemplate) {
                storeTemplate.codedata.lineRange = lineRange;
                storeTemplate.codedata.isNew = false;
                setTemplate(storeTemplate);
            }
        })();
    }, [storeNode]);

    const handleOnSave = async (updatedNode?: FlowNode): Promise<void> => {
        setIsSaving(true);
        try {
            await rpcClient.getBIDiagramRpcClient()
                .getSourceCode({ filePath: filePath.current, flowNode: updatedNode });
            onSave?.(await resolveAgentNodePosition(agentNode, rpcClient));
        } catch (error) {
            console.error("Error saving memory store configuration", error);
        } finally {
            setIsSaving(false);
        }
    };

    if (!template) {
        return <LoaderContainer><RelativeLoader /></LoaderContainer>;
    }

    return (
        <FlowNodeForm
            fileName={filePath.current}
            node={storeNode}
            nodeFormTemplate={template}
            targetLineRange={storeNode.codedata.lineRange}
            onSubmit={handleOnSave}
            disableSaveButton={isSaving}
            submitText={isSaving ? "Saving..." : "Save"}
            showProgressIndicator={isSaving}
            fieldOverrides={{ variable: { hidden: true }, type: { hidden: true } }}
        />
    );
}
