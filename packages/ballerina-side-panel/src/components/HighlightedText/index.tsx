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

const Matched = styled.span`
    font-weight: 600;
    color: var(--vscode-editorSuggestWidget-highlightForeground, var(--vscode-textLink-foreground));
`;

// Marks where a search query appears in a result, so it is clear why the result is listed.
export function HighlightedText({ text, query }: { text: string; query?: string }) {
    const typed = query?.trim() ?? "";
    const start = typed ? text.toLowerCase().indexOf(typed.toLowerCase()) : -1;
    if (start < 0) {
        return <>{text}</>;
    }
    const end = start + typed.length;
    return <>{text.slice(0, start)}<Matched>{text.slice(start, end)}</Matched>{text.slice(end)}</>;
}
