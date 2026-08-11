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
import { ProjectStructureArtifactResponse } from "@wso2/ballerina-core";
import { Icon, ThemeColors } from "@wso2/ui-toolkit";

/** Matches `getAIColor()` in bi-diagram. */
const AGENT_ACCENT = "var(--vscode-terminal-ansiBrightCyan)";
const ICON_SIZE = 18;

const Strip = styled.div`
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    gap: 2px;
    padding: 0 8px;
    background-color: var(--vscode-editorWidget-background);
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    overflow-x: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar {
        display: none;
    }
`;

const Tab = styled.button<{ active: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 40px;
    max-width: 220px;
    border: none;
    background: none;
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
    font-size: 13px;
    color: ${(props: { active: boolean }) =>
        props.active ? "var(--vscode-foreground)" : "var(--vscode-descriptionForeground)"};
    box-shadow: ${(props: { active: boolean }) =>
        props.active ? `inset 0 -2px 0 0 ${AGENT_ACCENT}` : "none"};
    transition: color 120ms ease, background-color 120ms ease;

    &:hover {
        color: var(--vscode-foreground);
        background-color: var(--vscode-toolbar-hoverBackground);
    }
`;

const TabLabel = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
`;

const AddTab = styled(Tab)`
    color: var(--vscode-descriptionForeground);
    gap: 6px;
`;

export function agentKey(agent: ProjectStructureArtifactResponse): string {
    return `${agent.path}::${agent.position?.startLine ?? 0}`;
}

interface AgentTabsProps {
    agents: ProjectStructureArtifactResponse[];
    selectedKey: string;
    onSelect: (agent: ProjectStructureArtifactResponse) => void;
    onAdd: () => void;
}

export function AgentTabs({ agents, selectedKey, onSelect, onAdd }: AgentTabsProps) {
    return (
        <Strip>
            {agents.map((agent) => {
                const key = agentKey(agent);
                const active = key === selectedKey;
                return (
                    <Tab key={key} active={active} onClick={() => onSelect(agent)} title={agent.name}>
                        <Icon
                            name="bi-ai-agent"
                            sx={{ fontSize: ICON_SIZE, width: ICON_SIZE, height: ICON_SIZE }}
                            iconSx={{ fontSize: ICON_SIZE, color: active ? AGENT_ACCENT : "inherit" }}
                        />
                        <TabLabel>{agent.name}</TabLabel>
                    </Tab>
                );
            })}
            <AddTab active={false} onClick={onAdd} title="Add an agent to this project">
                <Icon
                    name="bi-plus"
                    sx={{ fontSize: ICON_SIZE, width: ICON_SIZE, height: ICON_SIZE }}
                    iconSx={{ fontSize: ICON_SIZE }}
                />
                <TabLabel>Add Agent</TabLabel>
            </AddTab>
        </Strip>
    );
}
