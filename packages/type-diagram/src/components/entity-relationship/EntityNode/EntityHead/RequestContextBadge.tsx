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

// A status tag, not a type chip. In this node a filled, square-cornered grey chip means a field's type, so the
// indicator deliberately differs on every axis: a rounded pill, an outline instead of a fill, and a leading check in
// the accent colour, which says "configured". It is vertically centred with the ⋮ menu.
const ContextTag = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    height: 20px;
    margin-right: 2px;
    padding: 0 8px 0 6px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 10px;
    background: transparent;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-family: GilmerRegular;
    font-size: 11px;
    line-height: 18px;
    white-space: nowrap;
    cursor: pointer;

    &:hover {
        border-color: ${ThemeColors.PRIMARY};
        color: ${ThemeColors.ON_SURFACE};
    }

    &:focus-visible {
        outline: 1px solid ${ThemeColors.PRIMARY};
        outline-offset: 1px;
    }
`;

interface RequestContextBadgeProps {
    onOpen: () => void;
}

/**
 * The root node's request context indicator: a "Context" status tag beside the ⋮ menu, shown when the service
 * has a request context. Clicking opens the Request Context editor.
 */
export function RequestContextBadge({ onOpen }: RequestContextBadgeProps) {
    return (
        <Tooltip content="Context is configured" position="top">
            <ContextTag
                type="button"
                aria-label="Request context. Open Request Context"
                data-testid="request-context-badge"
                onClick={(event: React.MouseEvent) => {
                    event.stopPropagation();
                    onOpen();
                }}
            >
                <Codicon
                    name="check"
                    sx={{ fontSize: 12, width: 12, height: 12 }}
                    iconSx={{ fontSize: 12, color: ThemeColors.PRIMARY }}
                />
                Context
            </ContextTag>
        </Tooltip>
    );
}
