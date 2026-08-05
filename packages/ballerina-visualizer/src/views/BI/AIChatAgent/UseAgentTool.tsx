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
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { Category as DiagramCategory, FlowNode } from "@wso2/ballerina-core";
import { Icon } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Category as PanelCategory, Node as PanelNode, NodeList } from "@wso2/ballerina-side-panel";
import { RelativeLoader } from "../../../components/RelativeLoader";
import AddAgentPopup from "./AddAgentPopup";

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const PopupLayer = styled.div`
    position: relative;
    z-index: 2100;
`;

interface UseAgentToolProps {
    agentNode: FlowNode;
    onSelectAgent: (agentVarName: string) => void;
    onAgentCreated?: () => void;
    onBack?: () => void;
    onClose?: () => void;
}

// Flatten the nested "Agent" group → agent variable names (each carried as a Category metadata.label).
function extractAgentVarNames(categories: DiagramCategory[]): string[] {
    const names: string[] = [];
    for (const category of categories ?? []) {
        const items = (category as any).items ?? [];
        const childCategories = items.filter((item: any) => Array.isArray(item?.items));
        if (childCategories.length > 0) {
            childCategories.forEach((child: any) => {
                if (child?.metadata?.label) {
                    names.push(child.metadata.label);
                }
            });
        } else if ((category as any)?.metadata?.label) {
            names.push((category as any).metadata.label);
        }
    }
    return names;
}

export function UseAgentTool(props: UseAgentToolProps): JSX.Element {
    const { agentNode, onSelectAgent, onAgentCreated, onBack, onClose } = props;
    const { rpcClient } = useRpcContext();

    const [loading, setLoading] = useState<boolean>(true);
    const [agentNames, setAgentNames] = useState<string[]>([]);
    const [projectPath, setProjectPath] = useState<string>("");
    const [showAddAgentPopup, setShowAddAgentPopup] = useState<boolean>(false);

    // Exclude the host agent so it can't be a tool of itself.
    const hostAgentVar = String(agentNode?.properties?.variable?.value ?? "");

    useEffect(() => {
        loadAgents();
    }, [agentNode]);

    const loadAgents = async () => {
        setLoading(true);
        try {
            const visualizerContext = await rpcClient.getVisualizerLocation();
            setProjectPath(visualizerContext.projectPath);
            const lineRange = agentNode?.codedata?.lineRange;
            const fileName = lineRange?.fileName ?? "agents.bal";
            const { filePath } = await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] });
            const response = await rpcClient.getBIDiagramRpcClient().getAvailableAgents({
                position: lineRange?.startLine,
                filePath,
            });
            const names = extractAgentVarNames(response.categories as DiagramCategory[]).filter(
                (name) => name !== hostAgentVar
            );
            setAgentNames(names);
        } catch (error) {
            console.error("Failed to load available agents", error);
        } finally {
            setLoading(false);
        }
    };

    // Single-child subcategory per agent → single-column, click-to-select (no run/trace expansion).
    const categories: PanelCategory[] = [
        {
            title: "Agent",
            description: "",
            items: agentNames.map((name) => ({
                title: name,
                description: "",
                icon: <Icon name="bi-ai-agent" sx={{ width: 20, height: 20, fontSize: 20 }} />,
                items: [{ id: name, label: name, description: "", enabled: true } as PanelNode],
            })),
        },
    ];

    if (loading) {
        return (
            <LoaderContainer>
                <RelativeLoader />
            </LoaderContainer>
        );
    }

    return (
        <>
            <NodeList
                categories={categories}
                onSelect={(id: string) => onSelectAgent(id)}
                onAdd={() => setShowAddAgentPopup(true)}
                addButtonLabel={"Add Agent"}
                title={"Agents"}
                searchPlaceholder={"Search agents"}
                onBack={onBack}
                onClose={onClose}
            />
            {showAddAgentPopup && createPortal(
                <PopupLayer>
                    <AddAgentPopup
                        isPopup
                        inFlow
                        projectPath={projectPath}
                        onClose={() => setShowAddAgentPopup(false)}
                        onNavigateToOverview={() => setShowAddAgentPopup(false)}
                        onAgentCreated={(agentVarName?: string) => {
                            setShowAddAgentPopup(false);
                            onAgentCreated?.();
                            // A freshly created agent can be used immediately; otherwise refresh the list.
                            if (agentVarName && agentVarName !== hostAgentVar) {
                                onSelectAgent(agentVarName);
                            } else {
                                loadAgents();
                            }
                        }}
                    />
                </PopupLayer>,
                document.body
            )}
        </>
    );
}
