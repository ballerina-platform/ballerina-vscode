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
import { Button, Icon, ThemeColors, Tooltip } from '@wso2/ui-toolkit';
import { RequestContextSummary } from '../../../common/DiagramContext/DiagramContext';

// The same icon button as the node's ⋮ menu, so the two read as one group of header controls: same size, same
// hover, same focus ring. It carries no text or count; the tooltip says what it is.
const ContextButton = styled(Button)`
    border-radius: 5px;
`;

const TooltipList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px 0;
    font-size: 12px;
    white-space: nowrap;
`;

const TooltipTitle = styled.span`
    font-weight: 600;
`;

const TooltipDetail = styled.span`
    font-family: var(--vscode-editor-font-family);
`;

const TooltipHint = styled.span`
    margin-top: 4px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

interface RequestContextBadgeProps {
    context: RequestContextSummary;
    onOpen: () => void;
}

/**
 * The root node's request context indicator: an icon button beside the ⋮ menu, shown when the service has a
 * request context. Hovering names the function and the values it sets; clicking opens the Request Context editor.
 */
export function RequestContextBadge({ context, onOpen }: RequestContextBadgeProps) {
    const content = (
        <TooltipList>
            <TooltipTitle>Request context</TooltipTitle>
            {context.functionName && <TooltipDetail>{context.functionName}</TooltipDetail>}
            {context.keys.length > 0
                ? <TooltipDetail>{context.keys.join(', ')}</TooltipDetail>
                : <span>No values set yet</span>}
            <TooltipHint>Click to edit</TooltipHint>
        </TooltipList>
    );
    return (
        <Tooltip content={content} position="top">
            <ContextButton
                appearance="icon"
                aria-label="Request context. Open Request Context"
                data-testid="request-context-badge"
                onClick={(event: React.MouseEvent) => {
                    event.stopPropagation();
                    onOpen();
                }}
            >
                <Icon name="bi-variable" sx={{ width: 16, height: 16, fontSize: 16 }} iconSx={{ fontSize: 16 }} />
            </ContextButton>
        </Tooltip>
    );
}
