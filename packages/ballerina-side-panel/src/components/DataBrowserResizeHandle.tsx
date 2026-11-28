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
import { DATA_BROWSER_WIDTH, setDataBrowserWidth, useDataBrowserWidth } from "../context/insertTarget";

const KEY_STEP = 16;

// Doubled class so hosts that stretch every child over the browser do not stretch the handle.
const Handle = styled.div`
    && {
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
    }
    z-index: 10;
    cursor: ew-resize;
    touch-action: none;
    transition: background-color 150ms ease;
    &:hover,
    &:focus-visible,
    &[data-active] {
        outline: none;
        background-color: var(--vscode-sash-hoverBorder, var(--vscode-focusBorder));
    }
`;

/** Sits on the browser's left edge; every host keeps the browser right of its form, so dragging left widens it. */
export function DataBrowserResizeHandle() {
    const width = useDataBrowserWidth();

    const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        const handle = event.currentTarget;
        const startX = event.clientX;
        handle.setPointerCapture(event.pointerId);
        handle.dataset.active = "";
        const move = (moveEvent: PointerEvent) => setDataBrowserWidth(width + startX - moveEvent.clientX);
        const end = () => {
            handle.removeEventListener("pointermove", move);
            delete handle.dataset.active;
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("lostpointercapture", end, { once: true });
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        const step = { ArrowLeft: KEY_STEP, ArrowRight: -KEY_STEP }[event.key];
        if (step) {
            event.preventDefault();
            setDataBrowserWidth((current) => current + step);
        }
    };

    return (
        <Handle
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize Data Browser"
            aria-valuenow={width}
            title="Drag to Resize, Double-Click to Reset"
            tabIndex={0}
            onPointerDown={startDrag}
            onDoubleClick={() => setDataBrowserWidth(DATA_BROWSER_WIDTH)}
            onKeyDown={onKeyDown}
        />
    );
}
