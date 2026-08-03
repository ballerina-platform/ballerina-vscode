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

import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import AIChatInput, { AIChatInputRef, TagOptions } from "../../AIChatInput";
import { RunningServicesPanel } from "../../AIChatInput/RunningServicesChip";
import { Input } from "../../AIChatInput/utils/inputUtils";
import { AgentRunState, AIPanelPrompt, Attachment, SkillEntry, TemplateId, CodeContext } from "@wso2/ballerina-core";
import { commandTemplates, suggestedCommandTemplates as defaultSuggestedCommandTemplates } from "../../../commandTemplates/data/commandTemplates.const";
import { AttachmentOptions } from "../../AIChatInput/hooks/useAttachments";
import { getTemplateTextById } from "../../../commandTemplates/utils/utils";
import CodeContextCard from "../../CodeContextCard";
import { AgentMode } from "../../AIChatInput/ModeToggle";
import { Gloss, ORB_COLORS, ORB_ENERGY, Sphere } from "../../../../../components/AgentStatusOrb/shared";

export const FooterContainer = styled.footer({
    padding: "20px 20px 12px",
});

const SuggestedCommandsWrapper = styled.div`
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    margin-bottom: 12px;
`;

const SuggestionChip = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    background: var(--vscode-editor-background);
    color: var(--vscode-descriptionForeground);
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 8px;
    cursor: pointer !important;
    transition: all 0.15s ease;
    text-align: left;

    &:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-focusBorder, var(--vscode-widget-border));
        color: var(--vscode-foreground);
    }
`;

const LoadingIndicatorContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-bottom: 8px;
    background-color: var(--vscode-editor-background);
    border-radius: 4px;
    color: var(--vscode-input-placeholderForeground);
    font-size: 13px;
`;

const LoadingOrb = styled.div`
    position: relative;
    width: 16px;
    height: 16px;
    flex: none;
`;

/** Sweeps a brighter band across the label so the wait reads as active. */
const labelShimmer = keyframes`
    0% { background-position: 150% 0; }
    100% { background-position: -50% 0; }
`;

/** Replayed on every label change, so a new step visually reads as fresh. */
const labelEnter = keyframes`
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: translateY(0); }
`;

/**
 * The label is kept to one line: it sits directly above the composer, so
 * letting a long tool detail wrap would shift the input as the agent works.
 */
const LoadingLabel = styled.span`
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: linear-gradient(
        90deg,
        currentColor 0%,
        currentColor 35%,
        var(--vscode-foreground) 50%,
        currentColor 65%,
        currentColor 100%
    );
    background-size: 250% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: ${labelEnter} 0.18s ease-out, ${labelShimmer} 2.4s linear infinite;

    @media (prefers-reduced-motion: reduce), (forced-colors: active) {
        animation: none;
        background: none;
        -webkit-text-fill-color: currentColor;
    }
`;

/**
 * Holds each label on screen for a minimum time before showing the next one.
 * Some tool calls (a small file read, a cached lookup) resolve fast enough that
 * without this the indicator strobes through a burst of steps faster than
 * anyone can read. Intermediate labels are dropped rather than queued, so the
 * shown label never lags reality by more than one window.
 */
const MIN_LABEL_VISIBLE_MS = 700;

function useStickyLabel(value: string, minVisibleMs = MIN_LABEL_VISIBLE_MS): string {
    const [shown, setShown] = useState(value);
    const shownSinceRef = useRef(Date.now());

    useEffect(() => {
        if (value === shown) {
            return;
        }
        const remaining = minVisibleMs - (Date.now() - shownSinceRef.current);
        if (remaining <= 0) {
            shownSinceRef.current = Date.now();
            setShown(value);
            return;
        }
        const timer = setTimeout(() => {
            shownSinceRef.current = Date.now();
            setShown(value);
        }, remaining);
        return () => clearTimeout(timer);
    }, [value, shown, minVisibleMs]);

    return shown;
}

/*
 * Memoized: the panel re-renders on every streamed token, but the label only
 * changes when a tool starts or finishes (and at most once per sticky window).
 * A plain string prop makes this a clean bail-out boundary — the enclosing
 * Footer can't be memoized, since its callers rebuild its object props inline.
 */
const LoadingIndicator: React.FC<{ label: string }> = React.memo(({ label }) => {
    const shownLabel = useStickyLabel(label);
    return (
        // aria-live sits on the stable container: the label itself remounts on
        // every change, and a replaced node is not announced.
        <LoadingIndicatorContainer aria-live="polite">
            <LoadingOrb aria-hidden="true">
                <Sphere colors={ORB_COLORS.running} energy={ORB_ENERGY.running} />
                <Gloss />
            </LoadingOrb>
            {/* Keyed so a changed label remounts and replays the enter animation. */}
            <LoadingLabel key={shownLabel}>{shownLabel}</LoadingLabel>
        </LoadingIndicatorContainer>
    );
});
LoadingIndicator.displayName = "LoadingIndicator";

const renderPrompt = (item: AIPanelPrompt, index: number, aiChatInputRef: React.RefObject<AIChatInputRef>) => {
    if (!item) return null;
    let text = "";

    switch (item.type) {
        case "command-template":
            text = `${item.command} ${
                item.templateId === TemplateId.Wildcard
                    ? item.text
                    : getTemplateTextById(commandTemplates, item.command, item.templateId)
            }`;
            break;
        case "text":
            text = item.text;
            break;
    }

    return (
        <SuggestionChip key={index} onClick={() => aiChatInputRef.current?.setInputContent(item)}>
            <span className="codicon codicon-arrow-right" style={{ fontSize: "11px", opacity: 0.6 }} />
            {text}
        </SuggestionChip>
    );
};

const DisclaimerText = styled.p<{ visible: boolean }>`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-align: center;
    margin: 6px 0 0;
    opacity: ${(props: { visible: boolean }) => props.visible ? 0.7 : 0};
    max-height: ${(props: { visible: boolean }) => props.visible ? '20px' : '0'};
    overflow: hidden;
    transition: opacity 0.2s ease, max-height 0.2s ease;
`;

type FooterProps = {
    aiChatInputRef: React.RefObject<AIChatInputRef>;
    tagOptions: TagOptions;
    attachmentOptions: AttachmentOptions;
    suggestedCommandTemplates?: AIPanelPrompt[];
    inputPlaceholder: string;
    onSend: (content: { input: Input[]; attachments: Attachment[]; metadata?: Record<string, any> }) => Promise<void>;
    onStop: () => void;
    isLoading: boolean;
    loadingLabel?: string;
    showSuggestedCommands: boolean;
    codeContext?: CodeContext;
    onRemoveCodeContext?: () => void;
    agentMode?: AgentMode;
    onChangeAgentMode?: (mode: AgentMode) => void;
    isAutoApproveEnabled?: boolean;
    onDisableAutoApprove?: () => void;
    isWebToolsEnabled?: boolean;
    onToggleWebSearch?: () => void;
    disabled?: boolean;
    contextUsage?: { inputTokens: number; percentage: number; breakdown?: { systemInstructions: number; toolDefinitions: number; reservedOutput: number; files: number; messages: number; toolResults: number } } | null;
    mcpToolsEnabled?: boolean;
    onOpenMcpManager?: () => void;
    runningServicesPanel?: RunningServicesPanel;
    skills?: SkillEntry[];
    ambientState?: AgentRunState;
};

const Footer: React.FC<FooterProps> = ({
    aiChatInputRef,
    tagOptions,
    attachmentOptions,
    suggestedCommandTemplates,
    inputPlaceholder,
    onSend,
    onStop,
    isLoading,
    loadingLabel,
    showSuggestedCommands,
    codeContext,
    onRemoveCodeContext,
    agentMode,
    onChangeAgentMode,
    isAutoApproveEnabled,
    onDisableAutoApprove,
    isWebToolsEnabled,
    onToggleWebSearch,
    disabled,
    contextUsage,
    mcpToolsEnabled,
    onOpenMcpManager,
    runningServicesPanel,
    skills,
    ambientState,
}) => {
    const footerSuggestedCommandTemplates = suggestedCommandTemplates ?? defaultSuggestedCommandTemplates;

    return (
        <FooterContainer>
            {showSuggestedCommands && (
                <SuggestedCommandsWrapper>
                    {footerSuggestedCommandTemplates.map((item, index) => renderPrompt(item, index, aiChatInputRef))}
                </SuggestedCommandsWrapper>
            )}
            {codeContext && onRemoveCodeContext && (
                <CodeContextCard codeContext={codeContext} onRemove={onRemoveCodeContext} />
            )}
            {isLoading && <LoadingIndicator label={loadingLabel || "Generating"} />}
            <AIChatInput
                ref={aiChatInputRef}
                initialCommandTemplate={commandTemplates}
                tagOptions={tagOptions}
                attachmentOptions={attachmentOptions}
                placeholder={inputPlaceholder}
                onSend={onSend}
                onStop={onStop}
                isLoading={isLoading}
                agentMode={agentMode}
                onChangeAgentMode={onChangeAgentMode}
                isAutoApproveEnabled={isAutoApproveEnabled}
                onDisableAutoApprove={onDisableAutoApprove}
                isWebToolsEnabled={isWebToolsEnabled}
                onToggleWebSearch={onToggleWebSearch}
                disabled={disabled}
                contextUsage={contextUsage}
                mcpToolsEnabled={mcpToolsEnabled}
                onOpenMcpManager={onOpenMcpManager}
                runningServicesPanel={runningServicesPanel}
                skills={skills}
                ambientState={ambientState ?? (isLoading ? "running" : "idle")}
            />
            <DisclaimerText visible={!showSuggestedCommands}>
                AI-generated content may contain mistakes. Always review changes.
            </DisclaimerText>
        </FooterContainer>
    );
};

export default Footer;
