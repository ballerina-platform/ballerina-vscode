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

import React, { useState, useEffect, useCallback, useContext } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { ThemeColors, Typography, CompletionItem, FnSignatureDocumentation, HelperPaneHeight, Icon } from "@wso2/ui-toolkit";
import { FormField, HelperpaneOnChangeOptions } from "../../Form/types";
import { EditorMode, AIStatusLabel } from "./modes/types";
import { TextMode } from "./modes/TextMode";
import { PromptMode } from "./modes/PromptMode";
import { ExpressionMode } from "./modes/ExpressionMode";
import { TemplateMode } from "./modes/TemplateMode";
import { MinimizeIcon } from "../MultiModeExpressionEditor/ChipExpressionEditor/components/FloatingButtonIcons";
import { LineRange } from "@wso2/ballerina-core/lib/interfaces/common";
import { DiagnosticMessage } from "@wso2/ballerina-core";
import { InputMode } from "../MultiModeExpressionEditor/ChipExpressionEditor/types";
import { FieldError } from "react-hook-form";
import { SimpleStringMode } from "./modes/SimpleStringMode";
import { FieldAssistContext } from "../FieldAssist/FieldAssist";
import { useAssistHost } from "../FieldAssist/AssistHost";
import { AssistMark } from "../FieldAssist/AssistMark";

interface ExpandedPromptEditorProps {
    isOpen: boolean;
    field: FormField;
    value: string;
    onClose: () => void;
    onSave: (value: string) => void;
    onChange: (updatedValue: string, updatedCursorPosition: number) => void;
    // Optional mode override (if not provided, will be auto-detected)
    mode?: EditorMode;
    // Expression mode specific props
    completions?: CompletionItem[];
    fileName?: string;
    targetLineRange?: LineRange;
    sanitizedExpression?: (value: string) => string;
    rawExpression?: (value: string) => string;
    extractArgsFromFunction?: (value: string, cursorPosition: number) => Promise<{
        label: string;
        args: string[];
        currentArgIndex: number;
        documentation?: FnSignatureDocumentation;
    }>;
    getHelperPane?: (
        value: string,
        onChange: (value: string, options?: HelperpaneOnChangeOptions) => void,
        helperPaneHeight: HelperPaneHeight
    ) => React.ReactNode;
    // Error diagnostics props
    error?: FieldError;
    formDiagnostics?: DiagnosticMessage[];
    inputMode?: InputMode;
    readOnly?: boolean;
    zIndex?: number;
    // The field's AI helper, shown under the editor while the expanded editor covers the field.
    assistPanel?: React.ReactNode;
    // Offers a fix for the errors under the editor, as the field's own banner does.
    errorAction?: (errorMessages: string[]) => React.ReactNode;
    // A new revision remounts the editor on the current value, for editors that read it only once.
    revision?: number;
    // The field's key in the Copilot host: its review card and changed styling move here while the editor is open.
    assistKey?: string;
}

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const fadeIn = keyframes`from { opacity: 0; }`;
const fadeOut = keyframes`to { opacity: 0; }`;
const boxIn = keyframes`from { opacity: 0; transform: scale(0.97); }`;
const boxOut = keyframes`to { opacity: 0; transform: scale(0.98); }`;

const ModalContainer = styled.div<{ closing: boolean }>`
    animation: ${({ closing }) => closing ? fadeOut : fadeIn} ${({ closing }) => closing ? 120 : 160}ms ${EASE_OUT} forwards;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2100;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: color-mix(in srgb, ${ThemeColors.SECONDARY_CONTAINER} 70%, transparent);
    font-family: GilmerRegular;
`;

const ModalBox = styled.div<{ closing: boolean }>`
    animation: ${({ closing }) => closing ? boxOut : boxIn} ${({ closing }) => closing ? 120 : 180}ms ${EASE_OUT} forwards;
    @media (prefers-reduced-motion: reduce) {
        animation-name: ${({ closing }) => closing ? fadeOut : fadeIn};
    }
    width: 1000px;
    max-width: 95vw;
    min-width: 800px;
    height: 80vh;
    max-height: 95vh;
    min-height: 600px;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: auto;
    padding: 8px 8px;
    border-radius: var(--vscode-cornerRadius-xLarge, 12px);
    background-color: ${ThemeColors.SURFACE_DIM};
    box-shadow: 0 3px 8px rgb(0 0 0 / 0.2);
    z-index: 2001;
    resize: both;
`;

const ModalHeaderSection = styled.header`
    display: flex;
    align-items: center;
    justify-content: space-between;
    /* The minimize glyph is inset 7px in its box; 9px puts its edge on the editor's edge. */
    padding: 0 9px 0 16px;
    margin-bottom: 4px;
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
`;

const ModalContent = styled.div`
    --field-radius: var(--vscode-cornerRadius-large, 8px);
    flex: 1;
    overflow-y: hidden;
    /* Same inset as the header, so the editor lines up with the title. */
    padding: 8px 16px 16px;
    display: flex;
    flex-direction: column;
`;

// The editor and its review card; the changed-field styling reaches the editor through this box.
const ReviewedField = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
`;

const EditorSlot = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
`;

// A step below the toolbar's 32px buttons: secondary actions, but a comparable glyph size.
const HeaderButton = styled.button<{ active?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: var(--vscode-cornerRadius-small, 4px);
    color: ${ThemeColors.ON_SURFACE};
    background-color: ${({ active }) => (active ? "var(--vscode-toolbar-activeBackground, var(--vscode-toolbar-hoverBackground))" : "transparent")};
    cursor: pointer;
    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
    }
    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
    }
    svg {
        width: 18px;
        height: 18px;
    }
`;

const TitleWrapper = styled.div`
    margin: 12px 0;
    display: flex;
    align-items: center;
    gap: 10px;

    h3 {
        margin: 0;
    }
`;

const AIPill = styled.span`
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    font-size: 12px;
    font-weight: 700;
    border-radius: 4px;
    border: 1px solid color-mix(in srgb, var(--vscode-button-background) 40%, transparent);
    background-color: color-mix(in srgb, var(--vscode-button-background) 10%, transparent);
    color: var(--vscode-button-background);
    white-space: nowrap;
`;

/**
 * Map of mode components - add new modes here
 */
const MODE_COMPONENTS: Record<EditorMode, React.ComponentType<any>> = {
    [InputMode.TEXT]: TextMode,
    [InputMode.PROMPT]: PromptMode,
    [InputMode.EXP]: ExpressionMode,
    [InputMode.TEMPLATE]: TemplateMode,
    [InputMode.SIMPLE_TEXT]: SimpleStringMode
};

export const ExpandedEditor: React.FC<ExpandedPromptEditorProps> = ({
    isOpen,
    field,
    value,
    onClose,
    onChange,
    onSave,
    mode: propMode,
    completions,
    fileName,
    targetLineRange,
    sanitizedExpression,
    rawExpression,
    extractArgsFromFunction,
    getHelperPane,
    error,
    formDiagnostics,
    inputMode,
    readOnly,
    zIndex = 2100,
    assistPanel,
    errorAction,
    revision,
    assistKey
}) => {
    const promptFields = ["instructions", "role"];

    // Determine mode - use prop if provided, otherwise auto-detect
    let defaultMode: EditorMode = propMode ?? (
        promptFields.includes(field.key) ? InputMode.PROMPT : InputMode.TEXT
    );

    if (field.key === "query" && propMode === InputMode.TEXT) {
        defaultMode = InputMode.PROMPT;
    }

    const [mode, setMode] = useState<EditorMode>(defaultMode);
    const [mouseDownTarget, setMouseDownTarget] = useState<EventTarget | null>(null);
    const [aiStatus, setAIStatus] = useState<AIStatusLabel>(null);
    const handleAIStatusChange = useCallback((status: AIStatusLabel) => setAIStatus(status), []);

    useEffect(() => {
        setMode(defaultMode);
    }, [defaultMode]);

    const assist = useContext(FieldAssistContext);
    const host = useAssistHost();
    const setExpandedKey = host?.setExpandedKey;
    useEffect(() => {
        if (!isOpen || !assistKey || !setExpandedKey) {
            return;
        }
        setExpandedKey(assistKey);
        return () => setExpandedKey((current) => (current === assistKey ? undefined : current));
    }, [isOpen, assistKey, setExpandedKey]);
    const [closing, setClosing] = useState(false);
    // The exit animation plays first; the modal unmounts when it ends.
    const handleMinimize = () => setClosing(true);
    const handleAnimationEnd = (e: React.AnimationEvent) => {
        if (closing && e.target === e.currentTarget) {
            setClosing(false);
            onClose();
        }
    };

    const handleBackdropMouseDown = (e: React.MouseEvent) => {
        setMouseDownTarget(e.target);
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        // Only close if both mousedown and click happened on the backdrop
        if (e.target === e.currentTarget && mouseDownTarget === e.currentTarget) {
            handleMinimize();
        }
        setMouseDownTarget(null);
    };

    if (!isOpen) return null;

    // Get the current mode component
    const ModeComponent = MODE_COMPONENTS[mode];

    // Prepare props for the mode component
    const modeProps = {
        value: value,
        onChange: onChange,
        field,
        readOnly,
        errorAction,
        // Props for prompt mode
        ...(mode === InputMode.PROMPT && {
            completions,
            fileName,
            targetLineRange,
            sanitizedExpression,
            rawExpression,
            extractArgsFromFunction,
            getHelperPane,
            error,
            formDiagnostics,
            inputMode,
            onAIStatusChange: handleAIStatusChange
        }),
        // Props for expression mode
        ...(mode === InputMode.EXP && {
            completions,
            fileName,
            targetLineRange,
            sanitizedExpression,
            rawExpression,
            extractArgsFromFunction,
            getHelperPane,
            error,
            formDiagnostics
        }),
        // Props for template and Text modes
        ...((
            mode === InputMode.TEMPLATE ||
            mode === InputMode.TEXT
        ) && {
            completions,
            fileName,
            targetLineRange,
            sanitizedExpression,
            rawExpression,
            extractArgsFromFunction,
            getHelperPane,
            error,
            formDiagnostics,
            inputMode
        })
    };
    // HACK: Must find a proper central way to manager popups
    const targetEl = document.getElementById("visualizer-container");

    return targetEl ? createPortal(
        <ModalContainer closing={closing} style={{ zIndex }} onMouseDown={handleBackdropMouseDown} onClick={handleBackdropClick} onAnimationEnd={handleAnimationEnd}>
            <ModalBox data-expanded-editor closing={closing} style={{ zIndex }} onClick={(e) => e.stopPropagation()}>
                <ModalHeaderSection>
                    <TitleWrapper>
                        <Typography variant="h3">{field.label}</Typography>
                        {aiStatus && (
                            <AIPill>{aiStatus}</AIPill>
                        )}
                    </TitleWrapper>
                    <HeaderActions>
                        {assist && (
                            <HeaderButton
                                type="button"
                                active={assist.isOpen}
                                aria-pressed={assist.isOpen}
                                title="Fill this field with Copilot"
                                aria-label="Fill this field with Copilot"
                                onClick={(event) => assist.open(event.currentTarget)}
                            >
                                <Icon name="bi-ai-chat" sx={{ width: "18px", height: "18px" }} iconSx={{ fontSize: "18px" }} />
                            </HeaderButton>
                        )}
                        <HeaderButton type="button" onClick={handleMinimize} title="Minimize" aria-label="Minimize">
                            <MinimizeIcon />
                        </HeaderButton>
                    </HeaderActions>
                </ModalHeaderSection>
                <ModalContent>
                    <ReviewedField>
                        <EditorSlot>
                            <ModeComponent key={revision} {...modeProps} />
                        </EditorSlot>
                        {assistKey && <AssistMark fieldKey={assistKey} expanded />}
                    </ReviewedField>
                    {assistPanel}
                </ModalContent>
            </ModalBox>
        </ModalContainer>,
        targetEl
    ) : null;
};
