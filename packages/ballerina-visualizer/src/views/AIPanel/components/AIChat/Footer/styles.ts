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

/**
 * Outer container for approval/clarify footers.
 * Lives inside the same ambient frame as AIChatInput so switching between the
 * composer and an interactive prompt is visually seamless.
 */
export const FooterBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    border: none;
    border-radius: 9px;
    background-color: var(--vscode-editor-background);
`;

/**
 * Heading / prompt text inside FooterBox.
 */
export const FooterBoxPrompt = styled.div`
    font-size: 13px;
    font-weight: 500;
    font-family: var(--vscode-font-family);
    color: var(--vscode-editor-foreground);
`;

/**
 * 1px horizontal separator inside FooterBox.
 */
export const FooterDivider = styled.div`
    height: 1px;
    background: var(--vscode-panel-border);
    opacity: 0.7;
`;

/**
 * Inline text input row — lives inside FooterBox which provides the visible border.
 * This is just a flex row, no border/background of its own.
 */
export const FooterTextInputRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
`;

/**
 * Bare text input inside FooterTextInputRow.
 */
export const FooterInput = styled.input`
    flex: 1;
    background: transparent;
    border: none;
    color: var(--vscode-input-foreground);
    font-family: var(--vscode-font-family);
    font-size: 12px;
    outline: none;
    padding: 0;

    &::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }

    &:disabled {
        cursor: not-allowed;
    }
`;

/**
 * 24×24 icon button — matches ActionButton in AIChatInput/index.tsx exactly.
 */
export const FooterIconBtn = styled.button`
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
    flex-shrink: 0;

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
