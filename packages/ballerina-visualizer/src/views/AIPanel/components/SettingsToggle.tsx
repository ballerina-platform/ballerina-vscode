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

/** Compact on/off switch for Copilot settings. Render with `role="switch"` and `aria-checked`. */
export const SettingsToggle = styled.button<{ $on: boolean }>`
    width: 30px;
    height: 16px;
    border-radius: 8px;
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
    background: ${(p: { $on: boolean }) => (p.$on
        ? "var(--vscode-button-background)"
        : "var(--vscode-input-background)")};
    border: 1px solid ${(p: { $on: boolean }) => (p.$on
        ? "var(--vscode-contrastBorder, var(--vscode-button-background))"
        : "var(--vscode-contrastBorder, var(--vscode-checkbox-border, var(--vscode-descriptionForeground)))")};
    transition: background 0.15s, border-color 0.15s;

    &::after {
        content: "";
        position: absolute;
        box-sizing: border-box;
        top: 1px;
        left: ${(p: { $on: boolean }) => (p.$on ? "15px" : "1px")};
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: ${(p: { $on: boolean }) => (p.$on
            ? "var(--vscode-button-foreground)"
            : "var(--vscode-descriptionForeground)")};
        border: 1px solid var(--vscode-contrastBorder, transparent);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        transition: left 0.15s, background 0.15s;
    }
`;
