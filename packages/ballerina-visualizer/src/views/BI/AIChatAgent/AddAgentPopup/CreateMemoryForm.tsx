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
import { getAiModuleOrg, getEndOfFileLineRange, getNodeTemplate } from "../utils";
import { RelativeLoader } from "../../../../components/RelativeLoader";
import { LoaderWrapper } from "./styles";

// Memory declarations are written to the project's dedicated agents file (same as the agent declaration).
const MEMORY_FILE_NAME = "agents.bal";
// The default, non-deprecated memory implementation. Its store is optional (in-memory by default), so the user
// can just Save; a persistent store is created via the store field's "Create New" (a nested sub-modal).
const SHORT_TERM_MEMORY = "ShortTermMemory";

interface CreateMemoryFormProps {
    // Receives the created memory variable name so the caller can select it in the originating field.
    onCreated: (variableName: string) => void;
}

// Lean Short Term Memory creation form, rendered in a sub-modal from an ai:Memory field's "Create New Memory".
// Kept separate from the focus-diagram MemoryManagerConfig, which is wired to PanelContainer/usePanelOverlay/an
// existing agent node and so doesn't fit a centered popup.
export default function CreateMemoryForm({ onCreated }: CreateMemoryFormProps) {
    const { rpcClient } = useRpcContext();
    const [template, setTemplate] = useState<FlowNode>();
    const [targetLineRange, setTargetLineRange] = useState<LineRange>();
    const [filePath, setFilePath] = useState<string>("");
    const [submitting, setSubmitting] = useState<boolean>(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const endOfFile = await getEndOfFileLineRange(MEMORY_FILE_NAME, rpcClient);
                const orgName = await getAiModuleOrg(rpcClient);
                const searchResponse = await rpcClient.getBIDiagramRpcClient().search({
                    filePath: endOfFile.fileName,
                    queryMap: { orgName },
                    searchKind: "MEMORY",
                });
                const items = (searchResponse?.categories?.[0]?.items ?? []) as { codedata?: CodeData }[];
                const shortTerm = items.find((item) => item.codedata?.object === SHORT_TERM_MEMORY) ?? items[0];
                if (!shortTerm?.codedata) {
                    return;
                }
                const nodeTemplate = await getNodeTemplate(
                    rpcClient,
                    shortTerm.codedata,
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
                console.error("Error loading memory template:", error);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [rpcClient]);

    const handleSubmit = async (updatedNode?: FlowNode) => {
        if (!updatedNode) {
            return;
        }
        setSubmitting(true);
        try {
            const node = cloneDeep(updatedNode);
            // Re-resolve end-of-file: creating a store (if the user did) shifts the file.
            const endOfFile = await getEndOfFileLineRange(MEMORY_FILE_NAME, rpcClient);
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
            console.error("Error creating memory:", error);
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
            submitText={submitting ? "Creating..." : "Create Memory"}
            showProgressIndicator={submitting}
            disableSaveButton={submitting}
            footerActionButton
            fieldOverrides={{
                // Render the (optional) store as a connection select with its own "Create New" (nested sub-modal).
                store: {
                    type: "ACTION_EXPRESSION",
                    types: [
                        { fieldType: "ACTION_EXPRESSION", selected: true },
                        { fieldType: "EXPRESSION", selected: false },
                    ],
                    codedata: { searchNodesKind: "SHORT_TERM_MEMORY_STORE" },
                },
                type: { hidden: true },
            }}
        />
    );
}
