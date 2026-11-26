/* eslint-disable react-hooks/exhaustive-deps */
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

import { useEffect, useState } from "react";
import { FlowNode } from '@wso2/ballerina-core';
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { PanelContainer } from '@wso2/ballerina-side-panel';
import FlowNodeForm from '../../Forms/FlowNodeForm';
import { useEndOfFile } from "../../../../hooks/useEndOfFile";

export interface ConfigFormProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    filename: string;
    packageName: string;
    moduleName: string;
    onSubmit: () => void;
}

export function AddForm(props: ConfigFormProps) {
    const { isOpen, onClose, onSubmit, title, filename } = props;
    const { rpcClient } = useRpcContext();
    const [configVarNode, setCofigVarNode] = useState<FlowNode>();
    const [isSaving, setIsSaving] = useState(false);
    const configFileEnd = useEndOfFile(filename);

    useEffect(() => {
        const fetchNode = async () => {
            const node = await rpcClient.getBIDiagramRpcClient().getConfigVariableNodeTemplate({
                isNew: true
            });
            setCofigVarNode(node.flowNode);
        };

        fetchNode();
    }, []);

    const handleSave = async (node: FlowNode) => {
        setIsSaving(true);
        node.properties.defaultValue.modified = true;
        await rpcClient.getBIDiagramRpcClient().updateConfigVariablesV2({
            configFilePath: props.filename,
            configVariable: node,
            packageName: props.packageName,
            moduleName: props.moduleName,
        }).finally(() => {
            onSubmit();
        });
        setIsSaving(false);
        onClose();
    
    };

    return (
        <>
            <PanelContainer
                title={title}
                show={isOpen}
                onClose={onClose}
            >
                {configVarNode && (
                    <FlowNodeForm
                        fileName={filename}
                        node={configVarNode}
                        targetLineRange={configVarNode.codedata?.lineRange ?? configFileEnd}
                        onSubmit={handleSave}
                        showProgressIndicator={isSaving}
                    />
                )}
            </PanelContainer>
        </>
    );
}

export default AddForm;
