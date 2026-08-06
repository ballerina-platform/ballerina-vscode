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

/**
 * The amber counterpart of the toolkit's (red) ErrorBanner, for WARNING-severity findings that do
 * not block submit. It lives here rather than in the toolkit because ErrorBanner hardcodes the
 * error colour on its icon; the colour is VS Code's own editor-warning amber so it tracks the theme.
 */
const Container = styled.div`
    align-items: center;
    display: flex;
    flex-direction: row;
    background-color: var(--vscode-toolbar-activeBackground);
    padding: 6px;
    color: var(--vscode-editorWarning-foreground, #cca700);
`;

// The codicon glyph inherits the container's colour, so both icon and text render amber together.
const Icon = styled.i`
    margin-right: 6px;
    vertical-align: middle;
`;

const Message = styled.div`
    white-space: break-spaces;
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
