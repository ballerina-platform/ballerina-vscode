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

import React from "react";
import styled from "@emotion/styled";

const Pill = styled.span`
    display: inline-block;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
    padding: 1px 6px;
    border: 1px solid color-mix(in srgb, var(--vscode-descriptionForeground) 35%, transparent);
    border-radius: var(--vscode-cornerRadius-medium, 6px);
    background-color: color-mix(in srgb, var(--vscode-descriptionForeground) 12%, transparent);
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    line-height: 16px;
    user-select: none;
`;

export interface TypePillProps {
    type: string;
    title?: string;
    className?: string;
    style?: React.CSSProperties;
}

export function TypePill({ type, title = type, className, style }: TypePillProps) {
    return (
        <Pill className={className} style={style} title={title}>
            {type}
        </Pill>
    );
}
