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

import { keyframes } from "@emotion/css";
import styled from "@emotion/styled";

// ── Animations ────────────────────────────────────────────────────────────────

// Node: sonar ripple — ring expands and fades outward
export const sonarRing = keyframes`
    0%   { transform: scale(1);   opacity: 0.7; }
    100% { transform: scale(2.4); opacity: 0;   }
`;

// Tool icon: opacity pulse for loading state
export const breathe = keyframes`
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 1; }
`;


// ── Pipeline container ────────────────────────────────────────────────────────

export const PipelineContainer = styled.div`
    display: flex;
    flex-direction: column;
    margin: 8px 0 4px 0;
    font-family: var(--vscode-font-family);
`;

// ── Entry block: two-column layout — left rail (dot + line) + right content ──

export const EntryBlock = styled.div`
    display: flex;
    flex-direction: row;
    padding: 0 10px 0 0;
`;

// Left rail: fixed-width column that holds the dot and the vertical line.
// showLine: true when expanded (line fills items area) or when there is a next entry (stub connecting to next dot)
export const EntryRail = styled.div<{ showLine: boolean }>`
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 20px;
    flex-shrink: 0;

    /* Vertical connector line — runs from the dot center to the bottom of the rail */
    &::before {
        content: ${(props: { showLine: boolean }) => props.showLine ? "''" : "none"};
        position: absolute;
        top: 12px;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 1.5px;
        background-color: var(--vscode-panel-border);
        opacity: 0.9;
    }
`;

// Wrapper that sits at the top of the rail and holds the dot, on top of the line
export const DotWrapper = styled.div`
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 24px;
    flex-shrink: 0;
    background-color: var(--vscode-editor-background);
`;

// Right content column: task label on top, items below
export const EntryContent = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    padding-left: 6px;
`;

// Entry header row: clickable to toggle items
export const EntryHeader = styled.div`
    display: flex;
    align-items: center;
    min-height: 24px;
    cursor: pointer;
    user-select: none;
`;

export const ExpandIcon = styled.span<{ expanded: boolean }>`
    font-size: 10px;
    flex-shrink: 0;
    margin-left: 4px;
    opacity: ${(props: { expanded: boolean }) => props.expanded ? 0 : 0.5};
    transition: opacity 0.2s ease;
`;

// Smooth collapse wrapper using grid-template-rows trick
export const ItemsArea = styled.div<{ expanded: boolean }>`
    display: grid;
    grid-template-rows: ${(props: { expanded: boolean }) => props.expanded ? '1fr' : '0fr'};
    opacity: ${(props: { expanded: boolean }) => props.expanded ? 1 : 0};
    transition: grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
`;

export const ItemsInner = styled.div`
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding-bottom: 4px;
`;

export const ItemRow = styled.div`
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 2px 0;
    min-height: 18px;
`;

export const ItemMarkdownWrapper = styled.div`
    width: 100%;
    padding: 2px 0;
    p:first-child { margin-top: 0; }
    p:last-child { margin-bottom: 0; }
`;

// ── Task node indicators ──────────────────────────────────────────────────────

export const SonarWrapper = styled.span`
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
`;

export const SonarCenter = styled.span`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--vscode-charts-blue);
    position: relative;
    z-index: 1;
`;

export const SonarRing = styled.span`
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid var(--vscode-charts-blue);
    animation: ${sonarRing} 1.6s ease-out infinite;
`;

export const DoneCircle = styled.span`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background-color: var(--vscode-charts-green, #388a34);
`;

export const NodeLabel = styled.span<{ nodeStatus: "active" | "done" }>`
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-editor-foreground);
    opacity: ${(props: { nodeStatus: string }) => props.nodeStatus === "done" ? 0.75 : 1};
`;

// ── Item indicators ───────────────────────────────────────────────────────────

export const ToolIcon = styled.span<{ loading?: boolean; failed?: boolean }>`
    font-size: 10px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    color: ${(props: { loading?: boolean; failed?: boolean }) =>
        props.failed
            ? "var(--vscode-errorForeground)"
            : props.loading
            ? "var(--vscode-charts-blue)"
            : "var(--vscode-descriptionForeground)"};
    opacity: ${(props: { loading?: boolean; failed?: boolean }) => props.loading ? 1 : 0.75};
    ${(props: { loading?: boolean; failed?: boolean }) => props.loading ? `animation: ${breathe} 1.4s ease-in-out infinite;` : ""}
`;



export const ItemLabel = styled.span<{ loading: boolean; failed?: boolean }>`
    font-size: 13px;
    color: ${(props: { loading: boolean; failed?: boolean }) =>
        props.failed
            ? "var(--vscode-errorForeground)"
            : props.loading
            ? "var(--vscode-editor-foreground)"
            : "var(--vscode-descriptionForeground)"};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

export const ItemDetail = styled.span`
    margin-left: 3px;
    font-size: 12px;
`;

export const ItemMeta = styled.span`
    flex-shrink: 0;
    margin-left: -3px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
`;

// ── Inline card (config / connector) ─────────────────────────────────────────

export const InlineCard = styled.div<{ status?: "active" | "done" | "error" }>`
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 3px 6px;
    margin: 0 0 4px 0;
    font-family: var(--vscode-font-family);
`;

export const InlineCardHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
`;

export const InlineCardIcon = styled.span`
    display: flex;
    align-items: center;
    font-size: 12px;
    flex-shrink: 0;
    color: var(--vscode-descriptionForeground);
`;

export const InlineCardTitle = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-editor-foreground);
    flex: 1;
`;

export const InlineCardSubtitle = styled.span`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

export const InlineCardActions = styled.div`
    display: flex;
    gap: 6px;
    margin: 4px 0 2px 0;
`;

export const InlineButton = styled.button<{ variant?: "primary" | "secondary" | "danger" }>`
    padding: 3px 10px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
    background-color: ${(props: { variant?: string }) =>
        props.variant === "primary"
            ? "var(--vscode-button-background)"
            : props.variant === "danger"
            ? "var(--vscode-inputValidation-errorBackground, transparent)"
            : "var(--vscode-button-secondaryBackground, transparent)"};
    color: ${(props: { variant?: string }) =>
        props.variant === "primary"
            ? "var(--vscode-button-foreground)"
            : props.variant === "danger"
            ? "var(--vscode-errorForeground)"
            : "var(--vscode-button-secondaryForeground, var(--vscode-foreground))"};
    border: 1px solid ${(props: { variant?: string }) =>
        props.variant === "primary"
            ? "transparent"
            : props.variant === "danger"
            ? "var(--vscode-errorForeground)"
            : "var(--vscode-button-border, var(--vscode-panel-border))"};
    &:hover:not(:disabled) {
        opacity: 0.85;
    }
    &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
`;

export const ActionButton = styled.button<{ variant?: "primary" | "secondary" }>`
    display: flex;
    align-items: center;
    width: 100%;
    height: 36px;
    box-sizing: border-box;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--vscode-font-family);
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid ${(props: { variant?: string }) =>
        props.variant === "secondary" ? "var(--vscode-input-border)" : "transparent"};
    background-color: ${(props: { variant?: string }) =>
        props.variant === "secondary" ? "transparent" : "var(--vscode-button-background)"};
    color: ${(props: { variant?: string }) =>
        props.variant === "secondary" ? "var(--vscode-foreground)" : "var(--vscode-button-foreground)"};
    &:hover:not(:disabled) {
        background-color: ${(props: { variant?: string }) =>
            props.variant === "secondary"
                ? "var(--vscode-toolbar-hoverBackground)"
                : "var(--vscode-button-hoverBackground)"};
    }
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

export const InlineInput = styled.textarea`
    width: 100%;
    box-sizing: border-box;
    padding: 4px 6px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    resize: vertical;
    min-height: 72px;
    &:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
    }
`;

export const InlineUrlRow = styled.div`
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 4px 0 2px 0;
`;

export const InlineUrlInput = styled.input`
    flex: 1;
    padding: 3px 6px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    &:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
    }
`;

export const InlineTabRow = styled.div`
    display: flex;
    gap: 2px;
    margin: 2px 0 6px 0;
    border-bottom: 1px solid var(--vscode-panel-border);
`;

export const InlineTab = styled.button<{ active: boolean }>`
    padding: 3px 8px;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    background: transparent;
    border: none;
    border-bottom: 2px solid ${(props: { active: boolean }) => props.active ? "var(--vscode-focusBorder)" : "transparent"};
    color: ${(props: { active: boolean }) => props.active ? "var(--vscode-focusBorder)" : "var(--vscode-descriptionForeground)"};
    cursor: pointer;
    font-weight: ${(props: { active: boolean }) => props.active ? "600" : "400"};
`;

export const InlineErrorText = styled.span`
    font-size: 11px;
    color: var(--vscode-inputValidation-errorForeground);
    margin-top: 2px;
    display: block;
`;

export const InlineStatusRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    padding: 1px 0 2px 0;
`;

export const InlineDetailRow = styled.div`
    display: flex;
    gap: 6px;
    font-size: 11px;
    padding: 1px 0;
`;

export const InlineDetailLabel = styled.span`
    color: var(--vscode-descriptionForeground);
    min-width: 56px;
    flex-shrink: 0;
`;

export const InlineDetailValue = styled.span`
    color: var(--vscode-editor-foreground);
    word-break: break-all;
`;

export const InlineDetailsBlock = styled.div`
    display: flex;
    flex-direction: column;
    padding: 1px 0 2px 0;
`;

export const InlineDivider = styled.div`
    height: 1px;
    background-color: var(--vscode-panel-border);
    margin: 4px 0 2px 0;
    opacity: 0.7;
`;

export const InlineHint = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.7;
    align-self: center;
`;
