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
import { FollowupSuggestion } from "@wso2/ballerina-core";

const Container = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    /* Deliberately asymmetric: the chips belong to the input below, not the message above. */
    margin: 20px 0 -22px;
`;

const AiHint = styled.span`
    display: inline-flex;
    color: var(--vscode-descriptionForeground);
    opacity: 0.8;
`;

const Chip = styled.button`
    display: flex;
    align-items: center;
    padding: 4px 10px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    background: var(--vscode-editor-background);
    color: var(--vscode-descriptionForeground);
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 8px;
    cursor: pointer !important;
    transition: all 0.15s ease;
    text-align: left;

    &:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-focusBorder, var(--vscode-widget-border));
        color: var(--vscode-foreground);
    }
`;

interface FollowupSuggestionsProps {
    suggestions: FollowupSuggestion[];
    onPick: (suggestion: FollowupSuggestion) => void;
}

const FollowupSuggestions: React.FC<FollowupSuggestionsProps> = ({ suggestions, onPick }) => {
    if (!suggestions?.length) {
        return null;
    }
    return (
        <Container role="list" aria-label="Follow-up suggestions">
            <AiHint className="codicon codicon-sparkle" aria-hidden="true" />
            {suggestions.map((suggestion, index) => (
                <Chip
                    key={`followup-${index}`}
                    role="listitem"
                    type="button"
                    title={suggestion.prompt}
                    onClick={() => onPick(suggestion)}
                >
                    {suggestion.label}
                </Chip>
            ))}
        </Container>
    );
};

export default FollowupSuggestions;
