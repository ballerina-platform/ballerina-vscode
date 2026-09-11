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
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { ThemeColors } from "@wso2/ui-toolkit";

// Rendered on document.body: the link layer sits above the nodes, so a popover inside the card would be crossed by lines.
const Popover = styled.div`
    position: fixed;
    z-index: 10000;
    display: grid;
    gap: 6px;
    min-width: 180px;
    max-width: 320px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    background-color: ${ThemeColors.SURFACE};
    color: ${ThemeColors.ON_SURFACE};
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    font-family: "GilmerRegular";
    font-size: 12px;
    pointer-events: none;
`;

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
`;

const Text = styled.span`
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
`;

const Name = styled.span`
    min-width: 0;
    font-family: var(--vscode-editor-font-family, monospace);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Muted = styled.span`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

export interface PopoverRow {
    key: string;
    glyph?: React.ReactNode;
    // Plain words before the label, which stays in the editor font ("Runs after" orderAgent).
    prefix?: string;
    label: string;
    muted?: boolean;
}

// Drawn outside the canvas, so it takes the canvas zoom itself to stay the card's size.
export function CardPopover({ rows, anchor, zoom }: { rows: PopoverRow[]; anchor: DOMRect; zoom: number }) {
    return createPortal(
        <Popover style={{ left: anchor.left, top: anchor.bottom + 8 * zoom, transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            {rows.map((row) => (
                <Row key={row.key}>
                    {row.glyph}
                    <Text>
                        {row.prefix && <span>{row.prefix}</span>}
                        {row.muted ? <Muted>{row.label}</Muted> : <Name>{row.label}</Name>}
                    </Text>
                </Row>
            ))}
        </Popover>,
        document.body
    );
}
