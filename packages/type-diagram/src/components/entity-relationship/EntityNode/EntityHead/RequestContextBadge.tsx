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

import React from 'react';
import styled from '@emotion/styled';
import { Codicon, ThemeColors, Tooltip } from '@wso2/ui-toolkit';
import { RequestContextSummary } from '../../../common/DiagramContext/DiagramContext';

// Deliberately quiet: it reads like the node's other header controls, not like a call to action. The schema is
// what the diagram is about; the context indicator only says that the service has a request context.
const BadgeButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 20px;
    padding: 0 5px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-family: GilmerRegular;
    font-size: 11px;
    line-height: 1;
    opacity: 0.85;
    cursor: pointer;

    &:hover {
        opacity: 1;
        color: ${ThemeColors.ON_SURFACE};
        background-color: ${ThemeColors.SURFACE_CONTAINER};
    }

    &:focus-visible {
        opacity: 1;
        outline: 1px solid ${ThemeColors.PRIMARY};
        outline-offset: 1px;
    }
`;

const TooltipList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px 0;
    font-size: 12px;
    white-space: nowrap;
`;

const TooltipLabel = styled.span`
    font-weight: 600;
`;

const TooltipHint = styled.span`
    margin-top: 4px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const TooltipKeys = styled.span`
    font-family: var(--vscode-editor-font-family);
`;

interface RequestContextBadgeProps {
    context: RequestContextSummary;
    onOpen: () => void;
}

/**
 * The root node's request context indicator: shown when the service sets `contextInit`, with the number of values
 * the context carries. Hovering names the function and its keys; clicking opens the Request Context editor.
 */
export function RequestContextBadge({ context, onOpen }: RequestContextBadgeProps) {
    const count = context.keys.length;
    const label = `Request context${count > 0 ? ` with ${count} value${count === 1 ? '' : 's'}` : ''}. `
        + 'Open Request Context';
    const content = (
        <TooltipList>
            <span>
                <TooltipLabel>Request context</TooltipLabel>
                {context.functionName ? `: ${context.functionName}` : ''}
            </span>
            {count > 0
                ? <TooltipKeys>{context.keys.join(', ')}</TooltipKeys>
                : <span>No values set yet</span>}
            <TooltipHint>Click to edit</TooltipHint>
        </TooltipList>
    );
    return (
        <Tooltip content={content} position="top">
            <BadgeButton
                type="button"
                aria-label={label}
                data-testid="request-context-badge"
                onClick={(event) => {
                    event.stopPropagation();
                    onOpen();
                }}
            >
                <Codicon name="symbol-namespace" sx={{ fontSize: 12, width: 12, height: 12 }} iconSx={{ fontSize: 12 }} />
                Context{count > 0 ? ` ${count}` : ''}
            </BadgeButton>
        </Tooltip>
    );
}
