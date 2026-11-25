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

export const Stack = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

export const Muted = styled.div`
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    margin-top: 2px;
`;

export const Mono = styled.span`
    font-family: var(--vscode-editor-font-family, monospace);
`;

export const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
`;

const Banner = styled.div<{ tone: "warn" | "info" }>`
    padding: 8px 10px;
    font-size: 12px;
    border-radius: 3px;
    border-left: 3px solid ${(p: { tone: "warn" | "info" }) => (p.tone === "warn" ? "var(--vscode-editorWarning-foreground)" : "var(--vscode-focusBorder)")};
    background: var(--vscode-editorWidget-background);
`;

export const WarnBanner = ({ message }: { message: string }) => <Banner tone="warn" role="alert">{message}</Banner>;
export const InfoBanner = ({ message }: { message: string }) => <Banner tone="info">{message}</Banner>;

const CardBox = styled.div`
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const CardTop = styled.div`
    display: flex;
    justify-content: space-between;
    gap: 8px;
`;

const CardName = styled.div`
    font-weight: 600;
    font-size: 14px;
`;

const Chip = styled.span`
    display: inline-block;
    padding: 1px 6px;
    margin: 0 4px 2px 0;
    border-radius: 8px;
    font-size: 11px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
`;

const Row = styled.div`
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 8px;
    font-size: 12px;
`;

const RowLabel = styled.div`
    color: var(--vscode-descriptionForeground);
`;

const SkillBox = styled.div`
    padding: 6px 0;
    border-top: 1px solid var(--vscode-panel-border);
    &:first-of-type {
        border-top: none;
        padding-top: 0;
    }
`;

/** An Agent Card laid out for reading: endpoint, capabilities, authentication, modes and skills. */
export function AgentCardView({ card, agentUrl }: { card: A2aAgentCardInfo; agentUrl?: string }) {
    const requiresAuth = card.securitySchemes.length > 0;
    return (
        <CardBox>
            <CardTop>
                <div style={{ minWidth: 0 }}>
                    <CardName>{card.name}</CardName>
                    <Muted>{card.description}</Muted>
                </div>
                <Chip>v{card.version || "?"}</Chip>
            </CardTop>
            {card.provider && <Row><RowLabel>Provider</RowLabel><div>{card.provider}</div></Row>}
            <Row>
                <RowLabel>Endpoint</RowLabel>
                <div>
                    <Mono>{card.endpointUrl ?? agentUrl}</Mono>
                    <Muted>{[card.protocolBinding, card.protocolVersion && `A2A ${card.protocolVersion}`].filter(Boolean).join(" · ")}</Muted>
                </div>
            </Row>
            <Row>
                <RowLabel>Capabilities</RowLabel>
                <div>
                    {card.streaming ? "✓" : "✗"} Streaming &nbsp; {card.pushNotifications ? "✓" : "✗"} Push &nbsp;{" "}
                    {card.extendedAgentCard ? "✓" : "✗"} Extended card
                </div>
            </Row>
            <Row>
                <RowLabel>Auth</RowLabel>
                <div>
                    {requiresAuth ? card.securitySchemes.map((s) => <Chip key={s.name}>{s.kind}</Chip>) : "None declared"}
                </div>
            </Row>
            <Row>
                <RowLabel>Modes</RowLabel>
                <div>
                    {card.inputModes.map((m) => <Chip key={`in-${m}`}>{m} in</Chip>)}
                    {card.outputModes.map((m) => <Chip key={`out-${m}`}>{m} out</Chip>)}
                </div>
            </Row>
            <Row>
                <RowLabel>Skills ({card.skills.length})</RowLabel>
                <div>
                    {card.skills.map((s) => (
                        <SkillBox key={s.id || s.name}>
                            <b>{s.name}</b>
                            <Muted>{s.description}</Muted>
                            {s.tags.length > 0 && <div>{s.tags.map((t) => <Chip key={t}>{t}</Chip>)}</div>}
                            {s.examples.length > 0 && <Muted>e.g. "{s.examples[0]}"</Muted>}
                        </SkillBox>
                    ))}
                </div>
            </Row>
        </CardBox>
    );
}
