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
import { Button, Item, Menu, MenuItem, Popover } from "@wso2/ui-toolkit";
import { MoreVertIcon } from "../../resources/icons/nodes/MoreVertIcon";

const MenuButton = styled(Button)`
    flex: none;
`;

export function useCardMenu(items: Item[]) {
    const [anchor, setAnchor] = useState<HTMLElement | SVGSVGElement>(null);
    return { enabled: items.length > 0, anchor, setAnchor, items };
}

export type CardMenuState = ReturnType<typeof useCardMenu>;

export function CardMenuButton({ menu, className }: { menu: CardMenuState; className?: string }) {
    if (!menu.enabled) {
        return null;
    }
    const stop = (event: React.MouseEvent) => event.stopPropagation();

    return (
        <MenuButton
            className={className}
            appearance="icon"
            tooltip="More options"
            onMouseDown={stop}
            onMouseUp={stop}
            onClick={(event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
                event.stopPropagation();
                menu.setAnchor(event.currentTarget);
            }}
        >
            <MoreVertIcon />
        </MenuButton>
    );
}

// Render outside any clickable card: the popover is portaled, but its React events still bubble to the card.
export function CardMenuPopover({ menu }: { menu: CardMenuState }) {
    if (!menu.enabled) {
        return null;
    }
    return (
        <Popover
            open={Boolean(menu.anchor)}
            anchorEl={menu.anchor}
            handleClose={() => menu.setAnchor(null)}
            sx={{ padding: 0, borderRadius: 4 }}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
            <Menu>
                {menu.items.map((item) => (
                    <MenuItem key={item.id} item={item} onClick={() => menu.setAnchor(null)} />
                ))}
            </Menu>
        </Popover>
    );
}
