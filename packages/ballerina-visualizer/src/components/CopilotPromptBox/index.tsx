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

import React, { forwardRef, ReactNode, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { AgentRunState, AttachmentStatus, ProductMode } from "@wso2/ballerina-core";
import { Icon } from "@wso2/ui-toolkit";
import ModeToggle, { AgentMode } from "../../views/AIPanel/components/AIChatInput/ModeToggle";
import { useAttachments } from "../../views/AIPanel/components/AIChatInput/hooks/useAttachments";
import { acceptResolver, handleAttachmentSelection } from "../../views/AIPanel/utils/attachment/attachmentManager";
import AttachmentBox from "../../views/AIPanel/components/AttachmentBox";
import { ACCENT_FRAME, AmbientFrame } from "../AgentStatusOrb/shared";
import { CopilotPromptOptions } from "../AgentStatusOrb/copilotPanel";
import { CopilotMenu } from "../CopilotMenu";
import { useAssistantName, useProductMode } from "../../hooks/useProductMode";

const INPUT_MIN_HEIGHT = 46;
const INPUT_MAX_HEIGHT = 200;

const Composer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 12px 12px 8px;
    border-radius: 12.5px;
    background: var(--vscode-editorWidget-background);
    cursor: text;
`;

const PromptTextArea = styled.textarea`
    border: none;
    outline: none;
    resize: none;
    background: transparent;
    color: var(--vscode-input-foreground);
    font-family: var(--vscode-font-family);
    font-size: 14px;
    line-height: 1.5;
    min-height: ${INPUT_MIN_HEIGHT}px;
    max-height: ${INPUT_MAX_HEIGHT}px;
    overflow-y: auto;
    scrollbar-width: none;

    /* Outranks the webview default focus outline. */
    &:focus,
    &:focus-visible {
        outline: none;
    }

    @media (forced-colors: active) {
        &:focus-visible {
            outline: 1px solid Highlight;
            outline-offset: 1px;
        }
    }

    &::-webkit-scrollbar {
        display: none;
    }

    &::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }
`;

const ActionRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
`;

const LeftControls = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

// The menu is unrelated to the mode toggle beside it.
const ControlDivider = styled.span`
    width: 1px;
    height: 16px;
    background-color: var(--vscode-panel-border, var(--vscode-editorWidget-border));
    opacity: 0.6;
`;

const RightControls = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
`;

const AttachmentsWrap = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 8px 0;
    min-width: 0;
    max-width: 100%;
`;

// Caps each chip and ellipsizes its filename (the shared AttachmentBox has no width limit).
const AttachmentChip = styled.div`
    display: inline-flex;
    min-width: 0;
    max-width: 240px;

    & > div {
        max-width: 100%;
        overflow: hidden;
    }
    & > div > span:first-of-type {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

// Matches the AI panel's ActionButton (AIChatInput/index.tsx).
const ComposerActionButton = styled.button`
    width: 24px;
    height: 24px;
    background-color: transparent;
    color: var(--vscode-icon-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s;
    box-sizing: border-box;

    &:hover:not(:disabled) {
        background-color: var(--vscode-toolbar-hoverBackground);
    }

    &:active:not(:disabled) {
        background-color: var(--vscode-toolbar-activeBackground);
    }

    &:disabled {
        color: var(--vscode-disabledForeground);
        cursor: default;
    }
`;

export const SendButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    cursor: pointer;

    & > div {
        width: 14px;
        height: 14px;
        line-height: 14px;
    }

    &:hover:not(:disabled) {
        background: var(--vscode-button-hoverBackground);
    }

    &:disabled {
        opacity: 0.4;
        cursor: default;
    }
`;

export const SEND_ICON = <Icon name="arrow-up" isCodicon iconSx={{ fontSize: "14px" }} />;

export type PromptSubmitOptions = Pick<CopilotPromptOptions, "planMode" | "attachments">;

export interface CopilotPromptBoxHandle {
    /** Replaces the text and puts the caret at its end. */
    fill: (prompt: string) => void;
    /** Passes a non-empty draft to `send` and clears the attachments once it is taken. */
    handOff: (send: (prompt: string, options: PromptSubmitOptions) => Promise<boolean>) => Promise<void>;
}

interface CopilotPromptBoxProps {
    value: string;
    onChange: (value: string) => void;
    /** Resolves true once Copilot took the prompt, which clears the attachments. */
    onSubmit: (prompt: string, options: PromptSubmitOptions) => Promise<boolean>;
    placeholder: string;
    ariaLabel: string;
    state: AgentRunState;
    /** Shown in place of the mode toggle and menu while AI is not set up. */
    setupPrompt?: ReactNode;
}

export const CopilotPromptBox = forwardRef<CopilotPromptBoxHandle, CopilotPromptBoxProps>(function CopilotPromptBox(
    { value, onChange, onSubmit, placeholder, ariaLabel, state, setupPrompt },
    ref
) {
    const assistantName = useAssistantName();
    const agentBuilder = useProductMode() === ProductMode.AGENT_BUILDER;
    const [agentMode, setAgentMode] = useState<AgentMode>(AgentMode.Edit);
    const { attachments, fileInputRef, handleAttachClick, onAttachmentSelection, removeAttachment, removeAllAttachments } =
        useAttachments({
            attachmentOptions: { multiple: true, acceptResolver, handleAttachmentSelection },
            activeCommand: null,
        });
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const focusPendingRef = useRef(false);
    const sendingRef = useRef(false);

    useImperativeHandle(ref, () => ({
        fill: (prompt: string) => {
            focusPendingRef.current = true;
            onChange(prompt);
        },
        handOff: async (send) => {
            if (!value.trim() && attachments.length === 0) {
                return;
            }
            if (await send(value.trim(), { planMode: agentMode === AgentMode.Plan, attachments })) {
                removeAllAttachments();
            }
        },
    }), [onChange, value, attachments, agentMode]);

    useLayoutEffect(() => {
        const input = inputRef.current;
        // A hidden box measures 0 and would pin the textarea shut.
        if (!input || input.offsetParent === null) {
            return;
        }
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, INPUT_MAX_HEIGHT)}px`;
        if (focusPendingRef.current) {
            focusPendingRef.current = false;
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }, [value]);

    // A failed chip stays visible until removed instead of being silently dropped on send.
    const attachmentsReady = attachments.every((a) => a.status === AttachmentStatus.Success);
    const canSend = value.trim().length > 0 && attachmentsReady;

    const submit = async () => {
        if (!canSend || sendingRef.current) {
            return;
        }
        sendingRef.current = true;
        try {
            if (await onSubmit(value.trim(), { planMode: agentMode === AgentMode.Plan, attachments })) {
                removeAllAttachments();
            }
        } finally {
            sendingRef.current = false;
        }
    };

    return (
        <AmbientFrame
            $variant="hero"
            $state={state}
            $agentBuilder={agentBuilder}
            $colors={agentBuilder ? ACCENT_FRAME : undefined}
        >
            <Composer>
                <PromptTextArea
                    ref={inputRef}
                    rows={2}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void submit();
                        }
                    }}
                    placeholder={placeholder}
                    aria-label={ariaLabel}
                />
                {attachments.length > 0 && (
                    <AttachmentsWrap>
                        {attachments.map((file, index) => (
                            <AttachmentChip key={index} title={file.name}>
                                <AttachmentBox
                                    status={file.status}
                                    fileName={file.name}
                                    index={index}
                                    removeAttachment={removeAttachment}
                                />
                            </AttachmentChip>
                        ))}
                    </AttachmentsWrap>
                )}
                <ActionRow>
                    <LeftControls>
                        {setupPrompt ?? (
                            <>
                                <ModeToggle mode={agentMode} onChange={setAgentMode} />
                                <ControlDivider aria-hidden="true" />
                                <CopilotMenu />
                            </>
                        )}
                    </LeftControls>
                    <RightControls>
                        <input
                            type="file"
                            multiple
                            accept={acceptResolver(null)}
                            style={{ display: "none" }}
                            ref={fileInputRef}
                            onChange={onAttachmentSelection}
                        />
                        <ComposerActionButton type="button" title="Attach context" onClick={handleAttachClick}>
                            <Icon name="Paperclip" sx={{ fontSize: "16px" }} />
                        </ComposerActionButton>
                        <SendButton
                            type="button"
                            title={attachmentsReady ? `Send to ${assistantName}` : "Remove failed attachments to send"}
                            aria-label={`Send to ${assistantName}`}
                            disabled={!canSend}
                            onClick={() => void submit()}
                        >
                            {SEND_ICON}
                        </SendButton>
                    </RightControls>
                </ActionRow>
            </Composer>
        </AmbientFrame>
    );
});
