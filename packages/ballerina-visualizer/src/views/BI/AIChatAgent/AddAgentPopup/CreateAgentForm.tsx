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

import { useEffect, useState } from "react";
import { CodeData, FlowNode, LineRange } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { cloneDeep } from "lodash";
import { FlowNodeForm } from "../../Forms/FlowNodeForm";
import { getEndOfFileLineRange, getNodeTemplate } from "../utils";
import { RelativeLoader } from "../../../../components/RelativeLoader";
import { LoaderWrapper } from "./styles";

// Agent declarations are written to the project's dedicated agents file (same as other agent declarations).
const AGENT_FILE_NAME = "agents.bal";

interface CreateAgentFormProps {
    // The specific agent type to instantiate (LS-stamped node kind + type coordinates from the requesting field).
    agentCodeData: CodeData;
    // Receives the created agent variable name so the caller can select it in the originating field.
    onCreated: (variableName: string) => void;
}

// Lean agent-instantiation form, rendered in a sub-modal from an agent-typed field's "Create New <Agent>". Uses the
// same AGENT / AGENT_TYPE configure template the Add Agent popup click-to-init uses, so nested model/memory params
// render their own selects.
export default function CreateAgentForm({ agentCodeData, onCreated }: CreateAgentFormProps) {
    const { rpcClient } = useRpcContext();
    const [template, setTemplate] = useState<FlowNode>();
    const [targetLineRange, setTargetLineRange] = useState<LineRange>();
    const [filePath, setFilePath] = useState<string>("");
    const [submitting, setSubmitting] = useState<boolean>(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const endOfFile = await getEndOfFileLineRange(AGENT_FILE_NAME, rpcClient);
                const nodeTemplate = await getNodeTemplate(
                    rpcClient,
                    agentCodeData,
                    endOfFile.fileName,
                    endOfFile.startLine
                );
                if (!nodeTemplate || cancelled) {
                    return;
                }
                nodeTemplate.codedata.lineRange = endOfFile as any;
                setFilePath(endOfFile.fileName);
                setTargetLineRange(endOfFile);
                setTemplate(nodeTemplate);
            } catch (error) {
                console.error("Error loading agent template:", error);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [rpcClient, agentCodeData]);

    const handleSubmit = async (updatedNode?: FlowNode) => {
        if (!updatedNode) {
            return;
        }
        setSubmitting(true);
        try {
            const node = cloneDeep(updatedNode);
            // Re-resolve end-of-file: creating a nested connection/memory (if the user did) shifts the file.
            const endOfFile = await getEndOfFileLineRange(AGENT_FILE_NAME, rpcClient);
            node.codedata.lineRange = endOfFile as any;
            const response = await rpcClient
                .getBIDiagramRpcClient()
                .getSourceCode({ filePath: endOfFile.fileName, flowNode: node });
            // Prefer the user-entered variable name; fall back to the newly created artifact.
            const createdName =
                (node.properties?.variable?.value as string) ||
                response?.artifacts?.find((artifact) => artifact.isNew)?.name;
            if (createdName) {
                onCreated(createdName);
            }
        } catch (error) {
            console.error("Error creating agent:", error);
        } finally {
            setSubmitting(false);
        }
    };

    if (!template || !targetLineRange) {
        return (
            <LoaderWrapper>
                <RelativeLoader />
            </LoaderWrapper>
        );
    }

    return (
        <FlowNodeForm
            fileName={filePath}
            node={template}
            nodeFormTemplate={template}
            targetLineRange={targetLineRange}
            onSubmit={handleSubmit}
            submitText={submitting ? "Creating..." : "Create Agent"}
            showProgressIndicator={submitting}
            disableSaveButton={submitting}
            footerActionButton
            fieldOverrides={{ type: { hidden: true } }}
        />
    );
}
