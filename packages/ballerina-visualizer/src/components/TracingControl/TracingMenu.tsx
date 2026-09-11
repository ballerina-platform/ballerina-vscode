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
import { Codicon, Menu, MenuItem, Popover } from "@wso2/ui-toolkit";
import { TracingSelection } from "../../hooks/useProductMode";

const MenuItemLabel = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px;
    min-width: 200px;
`;

const TRACING_OPTIONS: { id: TracingSelection; icon: string; label: string }[] = [
    { id: "off", icon: "circle-slash", label: "Off" },
    { id: "idetraceprovider", icon: "telescope", label: "Local" },
    { id: "amp", icon: "cloud", label: "Agent Manager" },
];

export function tracingSelectionLabel(selection: TracingSelection): string {
    return TRACING_OPTIONS.find((option) => option.id === selection)?.label ?? "Off";
}

export interface TracingMenuProps {
    tracingSelection: TracingSelection;
    anchorEl: HTMLElement | null;
    onClose: () => void;
    onSelect: (selection: TracingSelection) => void;
}

export function TracingMenu({ tracingSelection, anchorEl, onClose, onSelect }: TracingMenuProps) {
    const menuItems = TRACING_OPTIONS.map((option) => ({
        id: option.id,
        label: (
            <MenuItemLabel>
                <Codicon name={option.icon} />
                {option.label}
                {option.id === tracingSelection && <Codicon name="check" sx={{ marginLeft: "auto" }} />}
            </MenuItemLabel>
        ),
        onClick: () => onSelect(option.id),
    }));

    return (
        <Popover
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            handleClose={onClose}
            sx={{ padding: 0, borderRadius: 4 }}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
            <Menu>
                {menuItems.map((item) => (
                    <MenuItem key={item.id} item={item} onClick={onClose} />
                ))}
            </Menu>
        </Popover>
    );
}
