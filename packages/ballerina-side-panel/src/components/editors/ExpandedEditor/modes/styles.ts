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
import { FIELD_RADIUS } from "../../MultiModeExpressionEditor/ChipExpressionEditor/constants";

export const ExpressionContainer = styled.div`
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
`;

export const FlexExpressionContainer = styled.div`
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    overflow: hidden;
    position: relative;
`;

export const AIEnhancedEditorContainer = styled.div`
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    overflow: hidden;
    position: relative;
    padding: 1px;
    background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--vscode-button-background) 90%, transparent) 0%,
        color-mix(in srgb, var(--vscode-button-background) 80%, transparent) 25%,
        color-mix(in srgb, var(--vscode-button-background) 60%, transparent) 50%,
        color-mix(in srgb, var(--vscode-button-background) 40%, transparent) 75%,
        color-mix(in srgb, var(--vscode-button-background) 30%, transparent) 100%
    );
    background-size: 300% 300%;
    border-radius: ${FIELD_RADIUS};

    &::before {
        content: '';
        position: absolute;
        inset: 1px;
        z-index: 0;
    }

    .ProseMirror, .cm-editor {
        background: color-mix(in srgb, var(--vscode-button-background) 3%, var(--vscode-editor-background));
    }

    > * {
        position: relative;
        z-index: 1;
    }
`;

export const ConditionalEditorContainer = styled.div<{ isEnhanced?: boolean }>`
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    overflow: hidden;
    position: relative;

    ${props => props.isEnhanced && `
        padding: 2px;
        background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--vscode-button-background) 90%, var(--vscode-button-background) 10%) 0%,
            color-mix(in srgb, var(--vscode-button-background) 80%, var(--vscode-button-background) 30%) 25%,
            color-mix(in srgb, var(--vscode-button-background) 60%, var(--vscode-button-background) 20%) 50%,
            color-mix(in srgb, var(--vscode-button-background) 40%, var(--vscode-button-background) 15%) 75%,
            color-mix(in srgb, var(--vscode-button-background) 30%, var(--vscode-button-background) 10%) 100%
        );
        background-size: 300% 300%;
        border-radius: ${FIELD_RADIUS};

        &::before {
            content: '';
            position: absolute;
            inset: 1px;
            z-index: 0;
        }

        .ProseMirror, .cm-editor {
            background: color-mix(in srgb, var(--vscode-button-background) 3%, var(--vscode-editor-background));
        }

        > * {
            position: relative;
            z-index: 1;
        }
    `}
`;
