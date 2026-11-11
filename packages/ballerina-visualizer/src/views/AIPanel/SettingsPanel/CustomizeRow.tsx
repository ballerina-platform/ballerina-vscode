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
import React from "react";
import styled from "@emotion/styled";

/**
 * A single "Customize Copilot" entry. Each extension point (MCP, Skills,
 * Agent instructions, …) declares only the affordances it needs:
 *  - `toggle`       → enable/disable switch
 *  - `onOpenPanel`  → makes the row navigable; renders the › chevron
 * Rows render the same way regardless of which affordances are present.
 */
export interface CustomizeEntry {
    id: string;
    icon: React.ReactNode;
    label: string;
    subtitle?: string;
    disabled?: boolean;
    tooltip?: string;
    toggle?: {
        on: boolean;
        pending?: boolean;
        onToggle: () => void;
        title?: string;
    };
    onOpenPanel?: () => void;
}

const Row = styled.div<{ clickable: boolean; disabled?: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    background: var(--vscode-editor-background);
    opacity: ${(p: { disabled?: boolean }) => (p.disabled ? 0.6 : 1)};
    cursor: ${(p: { clickable: boolean; disabled?: boolean }) => (p.clickable && !p.disabled ? "pointer" : "default")};
    transition: background 0.12s ease, border-color 0.12s ease;

    &:hover {
        background: ${(p: { clickable: boolean; disabled?: boolean }) =>
            p.clickable && !p.disabled ? "var(--vscode-list-hoverBackground)" : "var(--vscode-editor-background)"};
    }
`;

const IconWrap = styled.span`
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: var(--vscode-descriptionForeground);
`;

const Info = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const Label = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
`;

const Subtitle = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-font-family);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const Actions = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
`;

const ToggleSwitch = styled.button<{ on: boolean }>`
    width: 30px;
    height: 16px;
    border-radius: 8px;
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
    background: ${(p: { on: boolean }) => (p.on
        ? "var(--vscode-inputOption-activeBackground, var(--vscode-focusBorder))"
        : "var(--vscode-input-background)")};
    border: 1px solid ${(p: { on: boolean }) => (p.on
        ? "var(--vscode-inputOption-activeBorder, var(--vscode-checkbox-border, transparent))"
        : "var(--vscode-checkbox-border, var(--vscode-input-border, transparent))")};
    transition: background 0.15s, border-color 0.15s;

    &::after {
        content: "";
        position: absolute;
        top: 1px;
        left: ${(p: { on: boolean }) => (p.on ? "15px" : "1px")};
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--vscode-foreground);
        transition: left 0.15s;
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
`;

const PendingSlot = styled.span`
    width: 30px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
`;

const stop = (e: React.MouseEvent) => e.stopPropagation();

export const CustomizeRow: React.FC<{ entry: CustomizeEntry }> = ({ entry }) => {
    const clickable = !!entry.onOpenPanel && !entry.disabled;
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (clickable && !e.repeat && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            entry.onOpenPanel?.();
        }
    };
    return (
        <Row
            clickable={!!entry.onOpenPanel}
            disabled={entry.disabled}
            onClick={clickable ? entry.onOpenPanel : undefined}
            onKeyDown={clickable ? handleKeyDown : undefined}
            role={entry.onOpenPanel ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-disabled={entry.disabled || undefined}
            title={entry.disabled ? "Coming soon" : entry.tooltip}
        >
            <IconWrap>{entry.icon}</IconWrap>
            <Info>
                <Label>{entry.label}</Label>
                {entry.subtitle && <Subtitle title={entry.subtitle}>{entry.subtitle}</Subtitle>}
            </Info>
            <Actions onClick={stop}>
                {entry.toggle && (
                    entry.toggle.pending ? (
                        <PendingSlot>
                            <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 12 }} />
                        </PendingSlot>
                    ) : (
                        <ToggleSwitch
                            type="button"
                            role="switch"
                            aria-checked={entry.toggle.on}
                            on={entry.toggle.on}
                            disabled={entry.disabled}
                            title={entry.toggle.title}
                            onClick={entry.toggle.onToggle}
                        />
                    )
                )}
            </Actions>
            {entry.onOpenPanel && (
                <span className="codicon codicon-chevron-right" style={{ fontSize: 14, color: "var(--vscode-descriptionForeground)", flexShrink: 0 }} />
            )}
        </Row>
    );
};

export default CustomizeRow;
