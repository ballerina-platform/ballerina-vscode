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
import { Icon, ThemeColors, Tooltip } from '@wso2/ui-toolkit';
import { ServiceSettingsSummary } from '../../../common/DiagramContext/DiagramContext';

// Deliberately quiet: it reads like the node's other header controls, not like a call to action. The schema is
// what the diagram is about; the settings indicator only says that some are set.
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

interface ServiceSettingsBadgeProps {
    summary: ServiceSettingsSummary;
    onOpen: () => void;
}

/**
 * The root node's settings badge: a gear and the number of settings set on the service. Hovering lists them;
 * clicking opens the Service Settings panel. Renders nothing when no setting is set, so a service without
 * configuration keeps a clean header.
 */
export function ServiceSettingsBadge({ summary, onOpen }: ServiceSettingsBadgeProps) {
    const count = summary.items.length;
    if (count === 0) {
        return null;
    }
    const label = `${count} service setting${count === 1 ? '' : 's'} set. Open Service Settings`;
    const content = (
        <TooltipList>
            {summary.items.map((item) => (
                <span key={item.label}>
                    <TooltipLabel>{item.label}</TooltipLabel>
                    {item.summary ? `: ${item.summary}` : ''}
                </span>
            ))}
            <TooltipHint>Click to open Service Settings</TooltipHint>
        </TooltipList>
    );
    return (
        <Tooltip content={content} position="top">
            <BadgeButton
                type="button"
                aria-label={label}
                data-testid="service-settings-badge"
                onClick={(event) => {
                    event.stopPropagation();
                    onOpen();
                }}
            >
                <Icon name="bi-settings" sx={{ width: 12, height: 12, fontSize: 12 }} iconSx={{ fontSize: 12, color: "inherit" }} />
                {count}
            </BadgeButton>
        </Tooltip>
    );
}
