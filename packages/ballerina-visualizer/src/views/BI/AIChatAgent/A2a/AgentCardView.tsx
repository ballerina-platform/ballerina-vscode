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

import styled from "@emotion/styled";
import { A2aAgentCardInfo } from "@wso2/ballerina-core";
import { Button, Codicon, Icon, ThemeColors } from "@wso2/ui-toolkit";
import {
    ErrorMessage, InfoMessage, InlineSpinner, LoadingMessage, ToolsContainer, ToolsHeader, ToolsTitle,
} from "../Mcp/McpToolsSelection";

/**
 * The remote agent's Agent Card, shown under the Agent URL field the way the MCP form shows a server's tools: the
 * same panel, header, messages and spinner.
 */

const Rows = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 12px 12px 12px;
`;

const Row = styled.div`
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 8px;
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE};
`;

const Label = styled.div`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const Value = styled.div`
    min-width: 0;
    overflow-wrap: anywhere;
`;

const Mark = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-right: 10px;
`;

const Skill = styled.div`
    padding: 4px 0;
    border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    &:first-of-type {
        border-top: none;
        padding-top: 0;
    }
`;

const Muted = styled.div`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

function Capability({ label, on }: { label: string; on: boolean }) {
    return (
        <Mark>
            <Codicon name={on ? "check" : "close"} sx={{ fontSize: 12, color: on ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE_VARIANT }} />
            {label}
        </Mark>
    );
}

export interface AgentCardViewProps {
    card?: A2aAgentCardInfo;
    loading: boolean;
    /** Why the card couldn't be read. */
    error?: string;
    /** Why the toolkit can't call this agent, though the card was read. */
    unsupported?: string;
    /** What the form still needs for this card, such as the credential it requires. */
    problem?: string;
    /** Something to know that doesn't stop the save, such as where an OAuth2 credential goes. */
    notice?: string;
    /** Whether the Agent URL has a value to read the card from. */
    canFetch: boolean;
    onFetch: () => void;
}

export function AgentCardView({ card, loading, error, unsupported, problem, notice, canFetch, onFetch }: AgentCardViewProps) {
    return (
        <ToolsContainer>
            <ToolsHeader>
                <ToolsTitle>
                    {card ? card.name : "Agent Card"}
                    {card?.version && <Muted style={{ fontSize: 12, display: "inline", marginLeft: 6 }}>v{card.version}</Muted>}
                </ToolsTitle>
                <Button onClick={onFetch} appearance="secondary" disabled={!canFetch || loading}>
                    <Icon name="bi-retry" sx={{ marginRight: "6px", width: 16, height: 16, fontSize: 16 }} />
                    {loading ? "Fetching..." : card || error ? "Fetch Again" : "Fetch Card"}
                </Button>
            </ToolsHeader>
            {!loading && !card && !error && !notice && (
                <InfoMessage style={{ paddingBottom: 12 }}>
                    Enter the Agent URL and fetch its card to see what the agent does and the credential it needs.
                </InfoMessage>
            )}
            {loading && (
                <LoadingMessage>
                    <InlineSpinner />
                    Reading the Agent Card...
                </LoadingMessage>
            )}
            {!loading && !card && !error && notice && <InfoMessage style={{ paddingBottom: 12 }}>{notice}</InfoMessage>}
            {!loading && error && (
                <>
                    <InfoMessage>Unable to read the Agent Card.</InfoMessage>
                    <ErrorMessage maxHeight="100px">{error}</ErrorMessage>
                </>
            )}
            {!loading && card && (
                <>
                    {card.description && <InfoMessage>{card.description}</InfoMessage>}
                    {unsupported && <ErrorMessage>{unsupported}</ErrorMessage>}
                    {!unsupported && problem && <ErrorMessage>{problem}</ErrorMessage>}
                    {!unsupported && !problem && notice && <InfoMessage>{notice}</InfoMessage>}
                    <Rows>
                        {card.provider && <Row><Label>Provider</Label><Value>{card.provider}</Value></Row>}
                        <Row>
                            <Label>Endpoint</Label>
                            <Value>
                                {card.endpointUrl}
                                <Muted>
                                    {[card.protocolBinding, card.protocolVersion && `A2A ${card.protocolVersion}`]
                                        .filter(Boolean).join(" · ")}
                                </Muted>
                            </Value>
                        </Row>
                        <Row>
                            <Label>Capabilities</Label>
                            <Value>
                                <Capability label="Streaming" on={card.streaming} />
                                <Capability label="Push notifications" on={card.pushNotifications} />
                                <Capability label="Extended card" on={card.extendedAgentCard} />
                            </Value>
                        </Row>
                        <Row>
                            <Label>Credential</Label>
                            <Value>
                                {card.requiredSchemes.length === 0 ? "None required" : card.requiredSchemes
                                    .map((name) => card.securitySchemes.find((s) => s.name === name)?.kind ?? name)
                                    .join(", ")}
                            </Value>
                        </Row>
                        {(card.inputModes.length > 0 || card.outputModes.length > 0) && (
                            <Row>
                                <Label>Modes</Label>
                                <Value>
                                    {card.inputModes.join(", ") || "-"} in · {card.outputModes.join(", ") || "-"} out
                                </Value>
                            </Row>
                        )}
                        <Row>
                            <Label>Skills ({card.skills.length})</Label>
                            <Value>
                                {card.skills.length === 0 && <Muted>None listed</Muted>}
                                {card.skills.map((skill) => (
                                    <Skill key={skill.id || skill.name}>
                                        <div style={{ fontWeight: 600 }}>{skill.name}</div>
                                        {skill.description && <Muted>{skill.description}</Muted>}
                                        {skill.examples.length > 0 && <Muted>e.g. "{skill.examples[0]}"</Muted>}
                                    </Skill>
                                ))}
                            </Value>
                        </Row>
                    </Rows>
                </>
            )}
        </ToolsContainer>
    );
}

export default AgentCardView;
