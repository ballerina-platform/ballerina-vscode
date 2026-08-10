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
import { Tooltip } from "@wso2/ui-toolkit";
import { FlowNode } from "../../utils/types";
import { getDiffDisplaySource } from "../../utils/diff";
import { getDiffColors, getDiffStatePresentation } from "../../utils/node";
import { DIFF_ADDED_COLOR, DIFF_REMOVED_COLOR } from "../../resources/constants";

const DiffNodeContainer = styled.div`
    position: relative;
    display: inline-block;
`;

const DiffStateBadge = styled.span<{ accent: string }>`
    position: absolute;
    top: -8px;
    right: 4px;
    z-index: 10;
    display: inline-flex;
    align-items: center;
    min-height: 16px;
    padding: 1px 5px;
    border: 1px solid ${(props) => props.accent};
    border-radius: 8px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    color: var(--vscode-editorWidget-foreground, var(--vscode-editor-foreground));
    box-shadow: 0 0 0 1px var(--vscode-contrastBorder, transparent);
    font-family: var(--vscode-font-family);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    pointer-events: none;
`;

const Content = styled.div`
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 4px;
    max-width: 360px;
    font-family: monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-word;
`;

const VersionLabel = styled.span<{ accent: string }>`
    color: ${(props) => props.accent};
    font-family: var(--vscode-font-family);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
`;

const OldText = styled.span`
    color: ${DIFF_REMOVED_COLOR};
    text-decoration: line-through;
`;

const NewText = styled.span`
    color: ${DIFF_ADDED_COLOR};
`;

interface DiffTooltipProps {
    node: FlowNode;
    children: React.ReactNode;
}

/**
 * Adds a visible, accessible state marker to review-diff nodes. Modified nodes
 * also show their labeled old and new source on hover when both are available.
 */
export function DiffTooltip({ node, children }: DiffTooltipProps) {
    const presentation = getDiffStatePresentation(node?.diffState);
    const colors = getDiffColors(node);
    if (!presentation || !colors) {
        return <>{children}</>;
    }

    const markedNode = (
        <DiffNodeContainer role="group" aria-label={`${presentation.label} diagram node`}>
            {children}
            <DiffStateBadge accent={colors.border} aria-hidden="true">
                {presentation.symbol} {presentation.label}
            </DiffStateBadge>
        </DiffNodeContainer>
    );

    if (node.diffState !== "modified" || !node.diffPreviousText) {
        return markedNode;
    }

    const newText = getDiffDisplaySource(node);
    return (
        <Tooltip
            content={
                <Content>
                    <VersionLabel accent={DIFF_REMOVED_COLOR}>Old</VersionLabel>
                    <OldText>{node.diffPreviousText}</OldText>
                    {newText && (
                        <>
                            <VersionLabel accent={DIFF_ADDED_COLOR}>New</VersionLabel>
                            <NewText>{newText}</NewText>
                        </>
                    )}
                </Content>
            }
            containerSx={{ cursor: "inherit" }}
        >
            {markedNode}
        </Tooltip>
    );
}
