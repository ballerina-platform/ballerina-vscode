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
import { FlowNode, LineRange, ProjectStructureArtifactResponse } from "@wso2/ballerina-core";
import { ConnectionKind } from "./types";
import { ConnectionSelectionList } from "./ConnectionSelectionList";
import { ConnectionCreator } from "./ConnectionCreator";
import { getConnectionKindConfig } from "./config";
import { getNodeTemplateForConnection } from "../../views/BI/FlowDiagram/utils";
import { RelativeLoader } from "../RelativeLoader";
import { LoaderContainer } from "../RelativeLoader/styles";

interface ConnectionCreateWizardProps {
    connectionKind: ConnectionKind;
    fileName?: string;
    targetLineRange?: LineRange;
    onCreated: (variableName: string) => void;
}

// Pick a connection type, then configure it; surfaces the created variable name via onCreated.
export function ConnectionCreateWizard(props: ConnectionCreateWizardProps): JSX.Element {
    const { connectionKind, fileName, targetLineRange, onCreated } = props;
    const { rpcClient } = useRpcContext();

    const [view, setView] = useState<"SELECT" | "CREATE">("SELECT");
    const [nodeTemplate, setNodeTemplate] = useState<FlowNode | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(false);

    const handleSelect = async (nodeId: string, metadata?: any) => {
        setLoading(true);
        try {
            const { flowNode } = await getNodeTemplateForConnection(
                nodeId,
                metadata,
                { startLine: targetLineRange?.startLine },
                fileName,
                rpcClient
            );
            setNodeTemplate(flowNode);
            setView("CREATE");
        } finally {
            setLoading(false);
        }
    };

    // ConnectionCreator sets the new variable name on the throwaway node's model property; read it back.
    // Kinds whose variable isn't model/modelProvider (e.g. a memory store, under `store`) fall back to the
    // newly created artifact's name.
    const handleSave = (selectedNode: FlowNode, artifacts?: ProjectStructureArtifactResponse[]) => {
        const properties = selectedNode?.properties as Record<string, { value?: string }> | undefined;
        // Use || (not ??): the throwaway node seeds model.value = "" (empty string), which ?? wouldn't skip,
        // so a store (whose var isn't under model/modelProvider) would never reach the artifact fallback.
        const varName =
            properties?.model?.value ||
            properties?.modelProvider?.value ||
            artifacts?.find((artifact) => artifact.isNew)?.name;
        if (typeof varName === "string" && varName) {
            onCreated(varName);
        }
    };

    if (loading) {
        return (
            <LoaderContainer>
                <RelativeLoader />
            </LoaderContainer>
        );
    }

    if (view === "CREATE" && nodeTemplate) {
        const throwawayNode = { properties: { model: { value: "" } } } as unknown as FlowNode;
        return (
            <ConnectionCreator
                connectionKind={connectionKind}
                nodeFormTemplate={nodeTemplate}
                selectedNode={throwawayNode}
                onSave={handleSave}
            />
        );
    }

    return <ConnectionSelectionList connectionKind={connectionKind} onSelect={handleSelect} />;
}

export const getConnectionKindDisplayName = (connectionKind: ConnectionKind): string =>
    getConnectionKindConfig(connectionKind)?.displayName ?? "Connection";
