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
import React from "react";

// The amber counterpart of the toolkit's ErrorBanner, drawn the same way in VS Code's editor-warning colour.
const Container = styled.div`
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 6px;
    margin-top: 4px;
    padding: 6px 10px;
    border: 1px solid color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 30%, transparent);
    border-radius: var(--vscode-cornerRadius-small, 4px);
    background-color: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 8%, transparent);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: 12px;
    line-height: 18px;
`;

const Icon = styled.i`
    flex-shrink: 0;
    color: var(--vscode-editorWarning-foreground, #cca700);
    font-size: 14px;
    line-height: 18px;
`;

const Message = styled.div`
    flex: 1;
    min-width: 0;
    white-space: break-spaces;
    overflow-wrap: anywhere;
    word-break: break-word;
`;

export function WarningBanner(props: { id?: string; warningMsg: string }) {
    const { id, warningMsg } = props;
    return (
        <Container id={id}>
            <Icon className="codicon codicon-warning" />
            <Message>{warningMsg}</Message>
        </Container>
    );
}
