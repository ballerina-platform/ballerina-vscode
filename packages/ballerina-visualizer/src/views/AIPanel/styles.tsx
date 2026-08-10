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
 * 
 * THIS FILE INCLUDES AUTO GENERATED CODE
 */

import styled from "@emotion/styled";

export const FlexRow = styled.div({
    display: "flex",
    flexDirection: "row",
});

export const AIChatView = styled.div({
    display: "flex",
    flexDirection: "column",
    height: "100%",
});

export const Header = styled.header({
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 10px",
    gap: "10px",
    borderBottom: "1px solid var(--vscode-panel-border)",
});

export const HeaderButtons = styled.div({
    display: "flex",
    justifyContent: "flex-end",
    gap: "4px",
    marginRight: "10px",
});

export const TodoPanel = styled.div`
    border-bottom: 1px solid rgba(128, 128, 128, 0.3);
    background-color: var(--vscode-editor-background);
    padding: 8px 12px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
`;

export const Main = styled.main({
    flex: 1,
    flexDirection: "column",
    overflowY: "auto",
});

export const ChatMessage = styled.div({
    padding: "8px 20px",
});

export const TurnGroup = styled.div``;

export const AuthProviderChip = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-font-family);
`;

export const UsageBadge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
    white-space: nowrap;
`;

/** Sized to match UsageBadge so the glyph centres against it instead of riding high. */
export const UsageRefreshButton = styled.button`
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--vscode-icon-foreground);
    cursor: pointer;

    &:hover:not(:disabled) {
        background: var(--vscode-toolbar-hoverBackground);
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }

    .codicon-modifier-spin {
        animation: codicon-spin 1.2s steps(30) infinite;
    }
`;

export const ApprovalOverlay = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    pointer-events: all;
`;

export const OverlayMessage = styled.div`
    color: var(--vscode-foreground);
    font-size: 14px;
    padding: 16px 24px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 12px;
`;

export const OverlayCloseButton = styled.button`
    background: transparent;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    &:hover {
        color: var(--vscode-foreground);
        background: var(--vscode-toolbar-hoverBackground);
    }
`;

// ── AI Panel action buttons ───────────────────────────────────────────────────
// Shared compact action-button system used across the AI panel surfaces
// (SettingsPanel, McpManagerPanel, etc). All variants share the same
// padding/radius/typography so action rows line up. Pick the variant by intent:
//   PrimaryActionButton   — main CTA (Sign in, Add, Save)
//   SecondaryActionButton — neutral action (Edit, Cancel, View)
//   DangerActionButton    — destructive (Sign out, Delete, Disconnect)
//   SuccessActionButton   — locked/confirmed indicator (Authorized, Connected)

const actionButtonBase = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--vscode-font-family);
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

export const PrimaryActionButton = styled.button`
    ${actionButtonBase}
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border: 1px solid transparent;
    &:hover:not(:disabled) {
        background: var(--vscode-button-hoverBackground);
    }
`;

export const SecondaryActionButton = styled.button`
    ${actionButtonBase}
    color: var(--vscode-descriptionForeground);
    background: transparent;
    border: 1px solid var(--vscode-panel-border, var(--vscode-input-border));
    &:hover:not(:disabled) {
        color: var(--vscode-foreground);
        border-color: var(--vscode-foreground);
    }
`;

export const DangerActionButton = styled.button`
    ${actionButtonBase}
    color: var(--vscode-descriptionForeground);
    background: transparent;
    border: 1px solid var(--vscode-panel-border, var(--vscode-input-border));
    &:hover:not(:disabled) {
        color: var(--vscode-errorForeground);
        border-color: var(--vscode-errorForeground);
    }
`;

export const SuccessActionButton = styled.button`
    ${actionButtonBase}
    color: var(--vscode-charts-green, #388a34);
    background: transparent;
    border: 1px solid var(--vscode-charts-green, #388a34);
    cursor: default;
    opacity: 0.85;
`;
