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

// The markdown description shown under a form field's label. Kept apart from ExpressionEditor so
// editors that only need the description, such as ReadonlyField, don't import the expression editor.

import React from "react";
import styled from "@emotion/styled";
import ReactMarkdown from "react-markdown";
import { ThemeColors } from "@wso2/ui-toolkit";

export const EditorMdContainer = styled.div`
    width: 100%;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-list-deemphasizedForeground);
    border-radius: 4px;
    margin-bottom: 0;
    overflow-wrap: anywhere;

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
        margin: 16px 0 8px 0;
        font-family: var(--vscode-font-family);
        font-weight: normal;
        font-size: 13px;
        color: var(--vscode-list-deemphasizedForeground);
    }

    p {
        font-size: 13px;
        margin: 0;
        line-height: 1.5;
        font-family: var(--vscode-font-family);
        color: var(--vscode-list-deemphasizedForeground);
    }

    code {
        background-color: var(--vscode-textPreformat-background);
        border-radius: 3px;
        padding: 2px 4px;
        color: var(--vscode-textPreformat-foreground);
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
    }

    pre {
        background-color: var(--vscode-textPreformat-background);
        color: var(--vscode-textPreformat-foreground);
        border-radius: 4px;
        padding: 12px;
        margin: 8px 0;
        overflow-x: auto;
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
        line-height: 1.4;
    }

    ul,
    ol {
        margin: 8px 0;
        padding-left: 24px;
        font-size: 13px;
        font-family: var(--vscode-font-family);
    }

    li {
        margin: 4px 0;
        font-size: 13px;
        font-family: var(--vscode-font-family);
    }

    blockquote {
        margin: 8px 0;
        padding-left: 8px;
        border-left: 4px solid ${ThemeColors.PRIMARY};
        font-size: 13px;
        font-family: var(--vscode-font-family);
    }

    table {
        border-collapse: collapse;
        width: 100%;
        margin: 8px 0;
        font-size: 13px;
        font-family: var(--vscode-font-family);
    }

    th,
    td {
        border: 1px solid var(--vscode-editor-inactiveSelectionBackground);
        padding: 8px;
        text-align: left;
        font-size: 13px;
        font-family: var(--vscode-font-family);
    }

    th {
        background-color: var(--vscode-editor-inactiveSelectionBackground);
    }
`;

/**
 * Returns a field's documentation as it is displayed: with a trailing period added when missing.
 */
export function formatFieldDocumentation(documentation?: string): string {
    if (!documentation) {
        return "";
    }
    return documentation.endsWith(".") ? documentation : `${documentation}.`;
}

interface FieldDescriptionProps {
    documentation?: string;
    testId?: string;
}

/**
 * Renders a field's documentation as markdown, the same way the editable editors do.
 */
export function FieldDescription({ documentation, testId }: FieldDescriptionProps) {
    const text = formatFieldDocumentation(documentation);
    if (!text) {
        return null;
    }
    return (
        <EditorMdContainer data-testid={testId}>
            <ReactMarkdown>{text}</ReactMarkdown>
        </EditorMdContainer>
    );
}
