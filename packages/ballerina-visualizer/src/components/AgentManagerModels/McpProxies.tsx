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

import { ReactNode, useCallback, useEffect, useState } from "react";
import styled from "@emotion/styled";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AgentManagerMcpBinding, AgentManagerMcpProxy, FlowNode } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Node } from "@wso2/ballerina-side-panel";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import { useAgentManagerSession } from "../../hooks/useAgentManagerSession";
import { AgentManagerEntryCard, AgentManagerList, camelId, count, OptionCard, setExpression } from ".";

const QUERY_KEY = ["agentManagerMcpProxies"];

function useMcpProxies(enabled = true) {
    const { rpcClient } = useRpcContext();
    return useQuery({
        queryKey: QUERY_KEY,
        queryFn: async () => rpcClient.getAgentManagerRpcClient()
            .getAgentManagerMcpProxies({ projectPath: (await rpcClient.getVisualizerLocation()).projectPath }),
        enabled,
    });
}

type Step = "choose" | "servers" | "form";

export function AgentManagerMcpGate({ onBind, onSetBackOverride, children }: {
    onBind: (binding: AgentManagerMcpBinding, proxyId: string) => void;
    onSetBackOverride?: (handler: (() => void) | null) => void;
    children: ReactNode;
}) {
    const session = useAgentManagerSession();
    const { data } = useMcpProxies(!!session?.signedIn);
    const [step, setStep] = useState<Step>("choose");
    const toChoice = useCallback(() => setStep("choose"), []);

    // The header's back button returns to this choice before leaving the panel.
    useEffect(() => {
        onSetBackOverride?.(step !== "choose" ? toChoice : null);
    }, [step, toChoice, onSetBackOverride]);

    if (!session) {
        return null;
    }
    if (step === "form") {
        return <>{children}</>;
    }
    if (step === "servers") {
        return <McpProxyPicker onBound={(binding, proxyId) => { onBind(binding, proxyId); setStep("form"); }} />;
    }
    return (
        <Choices>
            <AgentManagerEntryCard
                description="MCP servers your organization added to Agent Manager, served through its AI Gateway."
                connected={data && `${session.org} · ${count(data.proxies.length, "MCP server")}`}
                onOpen={() => setStep("servers")}
            />
            <OptionCard
                icon={<Codicon name="edit" sx={{ fontSize: 20 }} />}
                title="Connect Manually"
                description="Enter the server URL and authentication for any MCP server."
                onClick={() => setStep("form")}
            />
        </Choices>
    );
}

export function applyMcpBinding(flowNode: FlowNode, binding: AgentManagerMcpBinding, proxyId: string) {
    const props: any = flowNode.properties;
    const variable = `${camelId(proxyId)}Mcp`;
    if (props?.variable) {
        props.variable.value = variable;
    }
    if (props?.toolKitName) {
        props.toolKitName.value = `${variable[0].toUpperCase()}${variable.slice(1)}Toolkit`;
    }
    setExpression(flowNode, "serverUrl", binding.serverUrl);
    if (binding.auth) {
        setExpression(flowNode, "auth", binding.auth);
    }
}

function McpProxyPicker({ onBound }: { onBound: (binding: AgentManagerMcpBinding, proxyId: string) => void }) {
    const { rpcClient } = useRpcContext();
    const queryClient = useQueryClient();
    const [binding, setBinding] = useState(false);
    const { data, isLoading } = useMcpProxies();

    const pick = async (_id: string, metadata?: { node: { proxy: AgentManagerMcpProxy } }) => {
        setBinding(true);
        const { projectPath } = await rpcClient.getVisualizerLocation();
        const result = await rpcClient.getAgentManagerRpcClient()
            .bindAgentManagerMcpProxy({ projectPath, proxyId: metadata.node.proxy.id });
        setBinding(false);
        if (result.success) {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
            onBound(result, metadata.node.proxy.id);
        }
    };

    const items = (data?.proxies ?? []).map((proxy): Node => ({
        id: proxy.id,
        label: proxy.name,
        description: proxy.unsupportedReason ?? proxy.description ?? (proxy.toolCount !== undefined ? count(proxy.toolCount, "Tool") : ""),
        icon: <Icon name="bi-mcp" sx={{ width: 24, height: 24 }} iconSx={{ fontSize: "24px" }} />,
        enabled: !proxy.unsupportedReason,
        metadata: { proxy },
    }));
    return (
        <AgentManagerList
            loading={isLoading || binding}
            intro="Pick an MCP server your organization added to Agent Manager. Requests go through its AI Gateway, and OAuth servers sign in with an AgentID."
            title="MCP Servers"
            description={data?.error}
            items={items}
            onSelect={pick}
            consoleLabel="Add MCP Server"
            consoleUrl={data?.consoleUrl}
        />
    );
}

const Choices = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
`;
