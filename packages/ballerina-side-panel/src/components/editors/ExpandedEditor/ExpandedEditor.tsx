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

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { ThemeColors, Divider, Typography, CompletionItem, FnSignatureDocumentation, HelperPaneHeight } from "@wso2/ui-toolkit";
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
}

const ModalContainer = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2001;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: color-mix(in srgb, ${ThemeColors.SECONDARY_CONTAINER} 70%, transparent);
    font-family: GilmerRegular;
`;

const ModalBox = styled.div`
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
    border-radius: 3px;
    background-color: ${ThemeColors.SURFACE_DIM};
    box-shadow: 0 3px 8px rgb(0 0 0 / 0.2);
    z-index: 2001;
    resize: both;
`;

const ModalHeaderSection = styled.header`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-inline: 16px;
    margin-bottom: 4px;
`;

const ModalContent = styled.div`
    flex: 1;
    overflow-y: hidden;
    padding: 8px 18px 16px;
    display: flex;
    flex-direction: column;
`;

const MinimizeButton = styled.div`
    cursor: pointer;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
    transition: opacity 0.2s ease, background-color 0.2s ease;
    border-radius: 2px;

    &:hover {
        opacity: 1;
        background-color: var(--vscode-editor-inactiveSelectionBackground);
    }

    svg {
        width: 16px;
        height: auto;
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
    readOnly
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

    const handleMinimize = () => {
        onClose();
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
        <ModalContainer onMouseDown={handleBackdropMouseDown} onClick={handleBackdropClick}>
            <ModalBox onClick={(e) => e.stopPropagation()}>
                <ModalHeaderSection>
                    <TitleWrapper>
                        <Typography variant="h3">{field.label}</Typography>
                        {aiStatus && (
                            <AIPill>{aiStatus}</AIPill>
                        )}
                    </TitleWrapper>
                    <MinimizeButton onClick={handleMinimize} title="Minimize">
                        <MinimizeIcon />
                    </MinimizeButton>
                </ModalHeaderSection>
                <div style={{ padding: "0 16px" }}>
                    <Divider sx={{ margin: 0 }} />
                </div>
                <ModalContent>
                    <ModeComponent {...modeProps} />
                </ModalContent>
            </ModalBox>
        </ModalContainer>,
        targetEl
    ) : null;
};
