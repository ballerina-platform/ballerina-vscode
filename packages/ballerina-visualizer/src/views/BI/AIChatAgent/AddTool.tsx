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

import styled from "@emotion/styled";
import { FlowNode } from "@wso2/ballerina-core";
import { Icon, ThemeColors } from "@wso2/ui-toolkit";

const Container = styled.div`
    padding: 20px;
    box-sizing: border-box;
    height: calc(100vh - 56px);
    overflow-y: auto;
`;

const Description = styled.div`
    font-size: var(--vscode-font-size);
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin-bottom: 24px;
    line-height: 1.5;
`;

const Column = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const OptionCard = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    
    &:hover {
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
        border: 1px solid ${ThemeColors.PRIMARY};
    }
`;

const OptionHeader = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
`;

const OptionIcon = styled.div`
    color: ${ThemeColors.PRIMARY};
    font-size: 18px;
    display: flex;
    align-items: center;
`;

const OptionTitle = styled.div`
    font-size: 14px;
    font-family: GilmerBold;
    color: ${ThemeColors.ON_SURFACE};
`;

const OptionDescription = styled.div`
    font-size: var(--vscode-font-size);
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin-left: 24px;
    line-height: 1.4;
`;

export const TOOL_OPTION_LABELS = {
    CONNECTION: "Use Connection",
    FUNCTION: "Use Function",
    AGENT: "Use Agent",
    MCP: "Use MCP Server",
    CUSTOM: "Create Custom Tool",
} as const;

export const ADD_TOOL_TITLE = "Add Tool";

export const addToolTitle = (option: keyof typeof TOOL_OPTION_LABELS): string =>
    `${ADD_TOOL_TITLE} - ${TOOL_OPTION_LABELS[option]}`;

interface AddToolProps {
    agentNode: FlowNode;
    onCreateCustomTool?: () => void;
    onUseConnection?: () => void;
    onUseFunction?: () => void;
    onUseMcpServer?: () => void;
    onUseAgent?: () => void;
    onSave?: () => void;
    onBack?: () => void;
}

export function AddTool(props: AddToolProps): JSX.Element {
    const { onCreateCustomTool, onUseConnection, onUseFunction, onUseMcpServer, onUseAgent } = props;

    const handleCreateCustomTool = () => {
        onCreateCustomTool?.();
    };

    const handleUseConnection = () => {
        onUseConnection?.();
    };

    const handleUseFunction = () => {
        onUseFunction?.();
    };

    const handleUseMcpServer = () => {
        onUseMcpServer?.();
    };

    const handleUseAgent = () => {
        onUseAgent?.();
    };

    return (
        <Container>
            <Description>
                Create and add tools to extend your agent's capabilities. Choose the method you'd like to use:
            </Description>

            <Column>
                <OptionCard onClick={handleUseConnection}>
                    <OptionHeader>
                        <OptionIcon>
                            <Icon name="bi-connection" />
                        </OptionIcon>
                        <OptionTitle>{TOOL_OPTION_LABELS.CONNECTION}</OptionTitle>
                    </OptionHeader>
                    <OptionDescription>
                        Call an action on an HTTP client, database, or message broker. Pick a connector,
                        choose the action you want, then point it at a connection.
                    </OptionDescription>
                </OptionCard>

                <OptionCard onClick={handleUseFunction}>
                    <OptionHeader>
                        <OptionIcon>
                            <Icon name="bi-function" />
                        </OptionIcon>
                        <OptionTitle>{TOOL_OPTION_LABELS.FUNCTION}</OptionTitle>
                    </OptionHeader>
                    <OptionDescription>
                        Turn a function from your integration, or one from a library, into a tool the
                        agent can call for specific business logic.
                    </OptionDescription>
                </OptionCard>

                <OptionCard onClick={handleUseAgent}>
                    <OptionHeader>
                        <OptionIcon>
                            <Icon name="bi-ai-agent" />
                        </OptionIcon>
                        <OptionTitle>{TOOL_OPTION_LABELS.AGENT}</OptionTitle>
                    </OptionHeader>
                    <OptionDescription>
                        Delegate to another agent in your integration. It is wrapped as a tool, so this
                        agent can hand off requests and use the response.
                    </OptionDescription>
                </OptionCard>

                <OptionCard onClick={handleUseMcpServer}>
                    <OptionHeader>
                        <OptionIcon>
                            <Icon name="bi-mcp" />
                        </OptionIcon>
                        <OptionTitle>{TOOL_OPTION_LABELS.MCP}</OptionTitle>
                    </OptionHeader>
                    <OptionDescription>
                        Connect to a Model Context Protocol (MCP) server for pre-built tools and
                        standardized access to external systems.
                    </OptionDescription>
                </OptionCard>

                <OptionCard onClick={handleCreateCustomTool}>
                    <OptionHeader>
                        <OptionIcon>
                            <Icon name="bi-flowchart" />
                        </OptionIcon>
                        <OptionTitle>{TOOL_OPTION_LABELS.CUSTOM}</OptionTitle>
                    </OptionHeader>
                    <OptionDescription>
                        Build a tool from scratch in the visual flow editor, defining its logic, inputs,
                        and outputs to match your exact needs.
                    </OptionDescription>
                </OptionCard>
            </Column>
        </Container>
    );
}
