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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { Button, Codicon, Item, Menu, MenuItem, Popover } from "@wso2/ui-toolkit";

const OptionTitle = styled.div`
    font-weight: 500;
`;

const OptionDescription = styled.div`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

export interface AddHandlerOption {
    name: string;
    description?: string;
}

export interface AddHandlerMenuProps {
    options: AddHandlerOption[];
    disabled?: boolean;
    onSelect: (name: string) => void;
}

/**
 * A "+ Handler" button that lists the handlers that can still be added, each with what it is for. It looks like the
 * service designer's other "+ Handler" buttons; the list opens from it as the class designer's "+ Method" does.
 */
export function AddHandlerMenu(props: AddHandlerMenuProps) {
    const { options, disabled, onSelect } = props;
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const items: Item[] = options.map((option) => ({
        id: option.name,
        label: (
            <div>
                <OptionTitle>{option.name}</OptionTitle>
                {option.description && <OptionDescription>{option.description}</OptionDescription>}
            </div>
        ),
        onClick: () => {
            setAnchorEl(null);
            onSelect(option.name);
        },
    }));

    return (
        <div style={{ position: "relative" }}>
            <Button
                id="add-connection-handler"
                appearance="primary"
                tooltip="Add a connection handler"
                disabled={disabled}
                onClick={(event: React.MouseEvent<HTMLElement | SVGSVGElement>) =>
                    setAnchorEl(event.currentTarget instanceof HTMLElement ? event.currentTarget : null)
                }
            >
                <Codicon name="add" sx={{ marginRight: 8 }} />
                Handler
            </Button>
            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                handleClose={() => setAnchorEl(null)}
                sx={{ padding: 0, borderRadius: 0, zIndex: 3000 }}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
                <Menu>
                    {items.map((item) => (
                        <MenuItem key={item.id} item={item} />
                    ))}
                </Menu>
            </Popover>
        </div>
    );
}
