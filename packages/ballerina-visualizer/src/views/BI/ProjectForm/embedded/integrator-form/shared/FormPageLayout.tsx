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

import { Typography } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";

/** Full-page background with subtle radial gradients. */
export const PageBackdrop = styled.div`
    min-height: 100vh;
    padding: 28px 30px 24px;
    background:
        radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--wso2-brand-accent) 10%, transparent) 0%, transparent 34%),
        radial-gradient(circle at 10% 100%, color-mix(in srgb, var(--wso2-brand-primary) 8%, transparent) 0%, transparent 40%),
        var(--vscode-editor-background);
`;

/** Centered content column. */
export const PageContainer = styled.div`
    max-width: 900px;
    margin: 0 auto;
    min-height: calc(100vh - 52px);
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

/** Row containing back button + title block. */
export const HeaderRow = styled.header`
    display: flex;
    align-items: flex-start;
    gap: 8px;
`;

/** Icon-only back button. */
export const BackButton = styled.button`
    cursor: pointer;
    border-radius: 6px;
    width: 28px;
    height: 28px;
    font-size: 20px;
    border: 1px solid transparent;
    background: transparent;
    appearance: none;
    padding: 0;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 2px;

    & > * {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
    }

    &:hover {
        background-color: color-mix(in srgb, var(--wso2-brand-accent) 16%, transparent);
        border-color: color-mix(in srgb, var(--wso2-brand-accent) 45%, transparent);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

export const HeaderText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

export const HeaderTitle = styled(Typography)`
    margin: 0;
    font-weight: 600;
`;

export const HeaderSubtitle = styled.p`
    margin: 0;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

/** The bordered card that wraps the form. */
export const FormPanel = styled.section<{ variant?: "default" | "compact" }>`
    flex: ${({ variant }: { variant?: "default" | "compact" }) => (variant === "compact" ? "none" : 1)};
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 16%, var(--vscode-panel-border));
    background: var(--vscode-editor-background);
    box-shadow: 0 10px 24px color-mix(in srgb, var(--wso2-brand-neutral-900) 16%, transparent);
    overflow: hidden;
`;

export const FormPanelHeader = styled.div`
    border-bottom: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 10%, var(--vscode-panel-border));
    padding: 25px 18px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--wso2-brand-accent) 4%, var(--vscode-editor-background)) 0%,
        var(--vscode-editor-background) 100%
    );
`;

export const FormPanelTitle = styled.h3`
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

export const FormPanelSubtitle = styled.p`
    margin: 3px 0 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

/** Scrollable body inside FormPanel. */
export const FormBody = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px;
`;

/** Constrains form content width and centers it within FormBody. */
export const FormContent = styled.div`
    max-width: 800px;
    margin: 0 auto;
`;

/** Right-aligned button row pinned to the bottom of FormBody. */
export const FormFooter = styled.div`
    display: flex;
    justify-content: flex-end;
    padding-top: 20px;
`;


// ── Runtime selector (shared between CreationView and SamplesView) ────────────

export const RuntimePanel = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 14%, var(--vscode-panel-border));
    background: var(--vscode-editor-background);
    width: fit-content;
`;

export const RuntimeLabel = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.08em;
`;

export const RuntimeOptions = styled.div`
    display: inline-flex;
    flex-wrap: wrap;
    gap: 8px;
`;

export const RuntimeOptionButton = styled.button<{ active: boolean }>`
    border: 1px solid
        ${(props: { active: boolean }) =>
            props.active
                ? "var(--wso2-brand-primary)"
                : "var(--vscode-input-border)"};
    background:
        ${(props: { active: boolean }) =>
            props.active
                ? "var(--wso2-brand-primary)"
                : "var(--vscode-input-background)"};
    color:
        ${(props: { active: boolean }) =>
            props.active ? "var(--vscode-button-foreground)" : "var(--vscode-foreground)"};
    border-radius: 999px;
    height: 28px;
    padding: 0 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;

    &:hover {
        border-color: ${({ active }: { active: boolean }) =>
            active ? "var(--wso2-brand-primary-alt)" : "var(--vscode-focusBorder)"};
        background: ${({ active }: { active: boolean }) =>
            active ? "var(--wso2-brand-primary-alt)" : "var(--vscode-list-hoverBackground)"};
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;
