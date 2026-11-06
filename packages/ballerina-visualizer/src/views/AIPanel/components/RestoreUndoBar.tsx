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
import { Spinner } from "./ProgressTextSegment";
import { describeRestore } from "./AIChat/utils/restoreUndo";

interface RestoreUndoBarProps {
    removedTurns: number;
    isUndoing: boolean;
    isDisabled: boolean;
    onUndo: () => void;
}

const Bar = styled.div`
    display: flex;
    align-items: center;
    margin: 0 -20px 16px -20px;
    padding: 8px 20px;
`;

const GradientLine = styled.div<{ direction: "left" | "right" }>`
    flex: 1;
    height: 1px;
    background: linear-gradient(
        to ${(props: { direction: "left" | "right" }) => (props.direction === "left" ? "right" : "left")},
        transparent 0%,
        var(--vscode-editorWidget-border) 30%
    );
`;

const Content = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    font-family: var(--vscode-font-family);
    white-space: nowrap;
`;

const UndoButton = styled.button`
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;

    &:hover:not(:disabled) {
        color: var(--vscode-textLink-activeForeground);
        text-decoration: underline;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

/**
 * Sits where the turns a checkpoint restore dropped used to be, and takes the restore back:
 * the workspace returns to how it was just before the restore and the turns reappear.
 * Shown until the next prompt, a new chat, or a session switch.
 */
const RestoreUndoBar: React.FC<RestoreUndoBarProps> = ({ removedTurns, isUndoing, isDisabled, onUndo }) => (
    <Bar role="status">
        <GradientLine direction="left" />
        {isUndoing ? (
            <Content>
                <Spinner className="codicon codicon-loading spin" role="img" />
                Undoing restore...
            </Content>
        ) : (
            <Content>
                {describeRestore(removedTurns)}
                <span aria-hidden="true">·</span>
                <UndoButton
                    type="button"
                    disabled={isDisabled}
                    onClick={onUndo}
                    title="Bring back the removed turns and the workspace as it was before the restore"
                >
                    <span className="codicon codicon-discard" aria-hidden="true" />
                    Undo
                </UndoButton>
            </Content>
        )}
        <GradientLine direction="right" />
    </Bar>
);

export default RestoreUndoBar;
