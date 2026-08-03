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
import { Button, Codicon, Typography } from "@wso2/ui-toolkit";

// ── Page layout (ported locally; native has no shared FormPageLayout) ─────────

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
    gap: 14px;
`;

/** Row containing back button + title block. */
export const HeaderRow = styled.header`
    display: flex;
    align-items: flex-start;
    gap: 8px;
`;

/** Alias used by index.tsx title block. */
export const TitleContainer = HeaderRow;

export const HeaderText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

export const HeaderSubtitle = styled.p`
    margin: 0;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

/** Icon-only back button. */
export const IconButton = styled.button`
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

/** The bordered card that wraps the form (alias: ContentPanel). */
export const ContentPanel = styled.section`
    flex: 1;
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

export const StepperWrapper = styled.div`
    padding: 14px 18px 12px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--wso2-brand-accent) 4%, var(--vscode-editor-background)) 0%,
        var(--vscode-editor-background) 100%
    );
`;

export const FormContainer = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 20px 20px;
    display: flex;
    flex-direction: column;
    position: relative;
`;

export const ButtonWrapper = styled.div`
    margin-top: 20px;
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 12%, var(--vscode-panel-border));
    display: flex;
    justify-content: flex-end;
    width: 100%;
`;

// Form-specific styles
export const IntegrationCardGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin: 20px 0;
`;

export const ParametersSection = styled.div`
    margin: 20px 0 0;
    padding-top: 16px;
    border-top: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 12%, var(--vscode-panel-border));
`;

export const PathText = styled.div`
    font-family: var(--vscode-editor-font-family);
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px dashed color-mix(in srgb, var(--wso2-brand-accent) 22%, var(--vscode-input-border));
    background: color-mix(in srgb, var(--wso2-brand-accent) 6%, transparent);
`;

export const ParameterItem = styled.div`
    margin-bottom: 12px;
    &:last-child {
        margin-bottom: 0;
    }
`;

// Configure Project Form styles
export const InputPreviewWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 20px 0 16px;
`;

export const PreviewText = styled(Typography)`
    color: var(--vscode-sideBarTitle-foreground);
    opacity: 0.5;
    font-family: var(--vscode-editor-font-family, "Monaco", "Menlo", "Ubuntu Mono", monospace);
    word-break: break-all;
    min-width: 100px;
    display: flex;
    align-items: center;
    line-height: 1;
`;

export const PreviewIcon = styled(Codicon)`
    display: flex;
    align-items: center;
`;

export const PreviewContainer = styled.div`
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 14%, var(--vscode-input-border));
    border-radius: 8px;
    padding: 8px 12px;
    display: inline-flex;
    align-items: center;
    width: fit-content;
    height: 28px;
    gap: 8px;
    background-color: var(--vscode-editor-background);
    * {
        cursor: default !important;
    }
`;

export const LocationSelectorWrapper = styled.div`
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

// Migration Progress styles
export const ProgressContainer = styled.div`
    max-width: 100%;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

export const StepWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
    margin-top: 16px;
    width: 100%;
`;

export const LogsContainer = styled.div`
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 14%, var(--vscode-widget-border));
    border-radius: 10px;
    padding: 14px 16px;
    background: color-mix(in srgb, var(--wso2-brand-primary) 4%, var(--vscode-editor-background));
    max-height: 320px;
    overflow-y: auto;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
`;

export const LogEntry = styled.div`
    color: var(--vscode-foreground);
    margin-bottom: 4px;
    white-space: pre-wrap;
    word-break: break-word;
`;

export const CollapsibleHeader = styled.div`
    display: flex;
    cursor: pointer;
    gap: 8px;
    align-items: center;
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 14%, var(--vscode-widget-border));
    background: color-mix(in srgb, var(--wso2-brand-accent) 6%, transparent);
    &:hover {
        background: color-mix(in srgb, var(--wso2-brand-accent) 10%, transparent);
    }
`;

export const CardAction = styled.div`
    margin-left: auto;
`;

// Coverage Summary styles
export const CoverageContainer = styled.div`
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 14%, var(--vscode-widget-border));
    border-radius: 10px;
    padding: 24px;
    background: color-mix(in srgb, var(--wso2-brand-primary) 4%, var(--vscode-editor-background));
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
`;

export const CoverageHeader = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 16px;
    justify-content: space-between;
    flex-wrap: wrap;
`;

export const CoveragePercentage = styled.div<{ coverageColor: string }>`
    font-size: 48px;
    font-weight: bold;
    color: ${(props: { coverageColor: string }) => props.coverageColor};
`;

export const CoverageLabel = styled.div`
    font-size: 14px;
    color: var(--vscode-descriptionForeground);
`;

export const CoverageProgressBar = styled.div`
    width: 100%;
    height: 8px;
    background-color: var(--vscode-editorWidget-border);
    border-radius: 4px;
    overflow: hidden;
`;

export const CoverageProgressFill = styled.div<{ percentage: number; coverageColor: string }>`
    height: 100%;
    width: ${(props: { percentage: number; coverageColor: string }) => props.percentage}%;
    background-color: ${(props: { percentage: number; coverageColor: string }) => props.coverageColor};
    transition: width 0.3s ease;
`;

export const CoverageStats = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

export const CoverageStat = styled.div`
    display: flex;
    justify-content: space-between;
    font-size: 14px;
`;

export const CoverageBadge = styled.div`
    background-color: color-mix(in srgb, var(--wso2-brand-accent) 16%, transparent);
    color: var(--vscode-foreground);
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    align-self: flex-start;
`;

// Estimation Table styles
export const EstimationTableContainer = styled.div`
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 14%, var(--vscode-widget-border));
    border-radius: 10px;
    padding: 24px;
    background: color-mix(in srgb, var(--wso2-brand-primary) 4%, var(--vscode-editor-background));
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
`;

export const ReportButtonsContainer = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-self: flex-start;
    margin-top: 8px;
`;

export const ViewReportButton = styled(Button)`
    && {
        border-color: color-mix(in srgb, var(--wso2-brand-accent) 30%, var(--vscode-button-border));
        background: color-mix(in srgb, var(--wso2-brand-accent) 10%, transparent);
    }
`;

export const SaveReportButton = styled(Button)`
    && {
        border-color: color-mix(in srgb, var(--wso2-brand-primary) 30%, var(--vscode-button-border));
        background: color-mix(in srgb, var(--wso2-brand-primary) 10%, transparent);
    }
`;

export const NextButtonWrapper = styled.div`
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 12%, var(--vscode-panel-border));
    width: 100%;
`;

// ImportIntegrationForm specific styles
export const FolderSelectionContainer = styled.div`
    display: flex;
    justify-content: flex-start;
    margin: 16px 0;
`;

export const SelectedFolderContainer = styled.div`
    margin: 16px 0;
`;

export const SelectedFolderDisplay = styled.div`
    padding: 12px 16px;
    background-color: var(--vscode-editor-background);
    border: 1px solid color-mix(in srgb, var(--wso2-brand-primary) 14%, var(--vscode-input-border));
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

export const FolderPathText = styled.span`
    font-family: var(--vscode-editor-font-family);
`;

export const StepContainer = styled.div`
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 12%, var(--vscode-panel-border));
`;

export const ViewWrapper = styled.div`
    padding: 16px;
`;

export const Text = styled.p`
    font-size: 14px;
    color: var(--vscode-descriptionForeground);
`;

export const BodyText = styled(Text)`
    color: var(--vscode-descriptionForeground);
    margin: 0 0 8px;
    opacity: 1;
    line-height: 1.45;
`;

export const BodyTinyInfo = styled(Text)`
    color: var(--vscode-descriptionForeground);
    margin: 0 0 8px;
    font-weight: normal;
    font-size: 14px;
    letter-spacing: 0.39px;
`;

export const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 80vh;
    flex-direction: column;
`;

export const LoadingOverlayContainer = styled.div`
    display: flex;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: color-mix(in srgb, var(--vscode-editor-background) 78%, transparent);
    backdrop-filter: blur(1px);
    justify-content: center;
    align-items: center;
    flex-direction: column;
`;

export const TopBar = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
`;

// ── AI Enhancement styled components ────────────────────────────────────────
export const AIEnhancementSection = styled.div`
    margin-top: 24px;
    padding: 16px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 22%, var(--vscode-widget-border));
    border-radius: 10px;
    background: color-mix(in srgb, var(--wso2-brand-accent) 4%, var(--vscode-editor-background));
`;

export const AIEnhancementTitle = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--vscode-foreground);
`;

export const RadioGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

export const RadioOption = styled.label<{ selected: boolean }>`
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid ${(props: { selected: boolean }) =>
        props.selected
            ? "var(--vscode-focusBorder)"
            : "color-mix(in srgb, var(--wso2-brand-accent) 14%, var(--vscode-widget-border))"};
    background: ${(props: { selected: boolean }) =>
        props.selected
            ? "color-mix(in srgb, var(--wso2-brand-accent) 8%, transparent)"
            : "transparent"};
    transition: border-color 0.15s, background 0.15s;
    &:hover {
        background: color-mix(in srgb, var(--wso2-brand-accent) 6%, transparent);
    }
`;

export const RadioInput = styled.input`
    margin-top: 2px;
    accent-color: var(--vscode-focusBorder);
    flex-shrink: 0;
    outline: none;
    /* Restore a visible focus ring for keyboard users (outline: none removes it). */
    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

export const RadioContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

export const RadioTitle = styled.div`
    font-weight: 500;
    font-size: 13px;
    color: var(--vscode-foreground);
`;

export const RadioDescription = styled.div`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;
