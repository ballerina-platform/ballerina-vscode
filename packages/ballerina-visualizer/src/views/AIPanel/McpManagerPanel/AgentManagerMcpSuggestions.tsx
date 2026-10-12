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

import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { AgentManagerMcpOffer, AgentManagerMcpServerOption, McpServerStatusDTO, ProductMode } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon, Icon } from "@wso2/ui-toolkit";

import { SecondaryActionButton } from "../styles";
import { useProductMode } from "../../../hooks/useProductMode";

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const Heading = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

const Divider = styled.div`
    flex: 1;
    height: 1px;
    background: var(--vscode-widget-border, var(--vscode-panel-border));
    opacity: 0.5;
`;

const Helper = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin: -2px 0 4px;
`;

const Rows = styled.div`
    display: flex;
    flex-direction: column;
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 6px;
    overflow: hidden;
    background: var(--vscode-editor-background);
`;

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--vscode-panel-border);

    &:last-child { border-bottom: none; }
`;

const RowText = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const RowName = styled.span`
    font-size: 13px;
    font-weight: 500;
`;

const RowDescription = styled.span`
    font-size: 11.5px;
    color: var(--vscode-descriptionForeground);
`;

const RowIcon = styled.span`
    display: inline-flex;
    width: 16px;
    justify-content: center;
    color: var(--vscode-descriptionForeground);
`;

export function AgentManagerMcpSuggestions({ servers }: { servers: McpServerStatusDTO[] }) {
    const { rpcClient } = useRpcContext();
    const [offer, setOffer] = useState<AgentManagerMcpOffer | undefined>();
    const [adding, setAdding] = useState<string | undefined>();
    const agentBuilder = useProductMode() === ProductMode.AGENT_BUILDER;

    const load = () => rpcClient.getAgentManagerRpcClient().getAgentManagerMcpOffer()
        .then(setOffer)
        .catch(() => setOffer(undefined));

    useEffect(() => {
        load();
    }, [servers]);

    const available = offer?.servers.filter((server) => !server.added) ?? [];
    if (!agentBuilder || available.length === 0) {
        return null;
    }

    const add = async (server: AgentManagerMcpServerOption) => {
        setAdding(server.id);
        try {
            await rpcClient.getAgentManagerRpcClient().addAgentManagerMcpServers({ ids: [server.id] });
            await load();
        } finally {
            setAdding(undefined);
        }
    };

    return (
        <Section>
            <Heading>Agent Manager<Divider /></Heading>
            <Helper>
                {offer?.signedIn
                    ? `Give Copilot access to your agents on ${offer.instance}. Adding one opens your browser to sign in.`
                    : "Give Copilot access to your agents in Agent Manager. Adding one asks for your console URL, then opens your browser to sign in."}
            </Helper>
            <Rows>
                {available.map((server) => (
                    <Row key={server.id}>
                        <RowIcon>
                            {server.id === "agent-manager"
                                ? <Icon name="bi-ai-agent" sx={{ fontSize: 16, width: 16, height: 16 }} iconSx={{ fontSize: 16 }} />
                                : <Codicon name="telescope" />}
                        </RowIcon>
                        <RowText>
                            <RowName>{server.label}</RowName>
                            <RowDescription>{server.description}</RowDescription>
                        </RowText>
                        <SecondaryActionButton type="button" disabled={!!adding} onClick={() => add(server)}>
                            {adding === server.id ? "Adding…" : "Add"}
                        </SecondaryActionButton>
                    </Row>
                ))}
            </Rows>
        </Section>
    );
}
