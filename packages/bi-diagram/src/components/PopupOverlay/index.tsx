/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { Overlay } from "@wso2/ui-toolkit";

interface PopupOverlayProps {
    visible?: boolean;
    onClose: () => void;
    zIndex?: number;
}

/**
 * Popup overlay component that blocks all mouse events from propagating to the canvas below.
 * This prevents diagram panning, zooming, and node selection when a popup is open.
 */
export function PopupOverlay(props: PopupOverlayProps) {
    const { visible = true, onClose, zIndex = 1000 } = props;

    const handleMouseDown = (e: React.MouseEvent) => {
        // Prevent all mouse events on overlay from reaching the canvas
        e.stopPropagation();
        e.preventDefault();
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        e.preventDefault();
    };

    return (
        <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            style={{
                position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex,
                // Stays mounted and fades with the side panel; once it starts closing, clicks pass through.
                opacity: visible ? 1 : 0,
                visibility: visible ? "visible" : "hidden",
                pointerEvents: visible ? "auto" : "none",
                transition: visible
                    ? "opacity 200ms cubic-bezier(0.23, 1, 0.32, 1)"
                    : "opacity 150ms cubic-bezier(0.23, 1, 0.32, 1), visibility 0s linear 150ms",
            }}
        >
            <Overlay onClose={onClose} sx={{ background: "rgba(0, 0, 0, 0.2)" }} />
        </div>
    );
}

export default PopupOverlay;

