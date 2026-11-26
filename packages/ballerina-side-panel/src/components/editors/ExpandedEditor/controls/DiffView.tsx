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

import React, { useMemo } from "react";
import styled from "@emotion/styled";

interface DiffViewProps {
    original: string;
    modified: string;
}

enum DiffType {
    Equal = 0,
    Insert = 1,
    Delete = -1,
}

interface DiffToken {
    type: DiffType;
    text: string;
}

/**
 * Simple word-level diff using the Longest Common Subsequence (LCS) approach.
 * Splits text into words (preserving whitespace), finds the LCS, and marks
 * insertions/deletions around unchanged words.
 */
function computeWordDiff(original: string, modified: string): DiffToken[] {
    // Split into tokens preserving whitespace and newlines
    const tokenize = (text: string): string[] => {
        const tokens: string[] = [];
        const regex = /(\S+|\n| +|\t+)/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            tokens.push(match[0]);
        }
        return tokens;
    };

    const oldTokens = tokenize(original);
    const newTokens = tokenize(modified);

    // Build LCS table
    const m = oldTokens.length;
    const n = newTokens.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldTokens[i - 1] === newTokens[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to build diff
    const result: DiffToken[] = [];
    let i = m;
    let j = n;

    const pending: DiffToken[] = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
            pending.push({ type: DiffType.Equal, text: oldTokens[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            pending.push({ type: DiffType.Insert, text: newTokens[j - 1] });
            j--;
        } else {
            pending.push({ type: DiffType.Delete, text: oldTokens[i - 1] });
            i--;
        }
    }

    pending.reverse();

    // Merge adjacent tokens of the same type
    for (const token of pending) {
        if (result.length > 0 && result[result.length - 1].type === token.type) {
            result[result.length - 1].text += token.text;
        } else {
            result.push({ ...token });
        }
    }

    return result;
}

const DiffContainer = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
`;

const InsertedText = styled.span`
    background-color: color-mix(in srgb, var(--vscode-diffEditor-insertedTextBackground, rgba(156, 204, 44, 0.2)) 80%, transparent);
    text-decoration: none;
`;

const DeletedText = styled.span`
    background-color: color-mix(in srgb, var(--vscode-diffEditor-removedTextBackground, rgba(255, 0, 0, 0.2)) 80%, transparent);
    text-decoration: line-through;
    opacity: 0.8;
`;

export const DiffView: React.FC<DiffViewProps> = ({ original, modified }) => {
    const diffTokens = useMemo(() => computeWordDiff(original, modified), [original, modified]);

    return (
        <DiffContainer>
            {diffTokens.map((token, index) => {
                switch (token.type) {
                    case DiffType.Insert:
                        return <InsertedText key={index}>{token.text}</InsertedText>;
                    case DiffType.Delete:
                        return <DeletedText key={index}>{token.text}</DeletedText>;
                    default:
                        return <span key={index}>{token.text}</span>;
                }
            })}
        </DiffContainer>
    );
};
