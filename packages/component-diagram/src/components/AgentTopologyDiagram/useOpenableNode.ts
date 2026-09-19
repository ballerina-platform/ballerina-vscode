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

import { KeyboardEvent, useState } from "react";
import { useClickWithDragTolerance } from "../../hooks/useClickWithDragTolerance";

interface OpenableNodeOptions {
    readonly?: boolean;
    onHoverChange?: (hovered: boolean) => void;
}

export function useOpenableNode(open: () => void, { readonly, onHoverChange }: OpenableNodeOptions = {}) {
    const [hovered, setHovered] = useState(false);
    const { handleMouseDown, handleMouseUp } = useClickWithDragTolerance(open);

    const setHoveredState = (next: boolean) => {
        onHoverChange?.(next);
        if (!readonly) {
            setHovered(next);
        }
    };

    return {
        hovered: !readonly && hovered,
        handlers: {
            tabIndex: 0,
            onMouseEnter: () => setHoveredState(true),
            onMouseLeave: () => setHoveredState(false),
            onMouseDown: readonly ? undefined : handleMouseDown,
            onMouseUp: readonly ? undefined : handleMouseUp,
            onKeyDown: (event: KeyboardEvent) => {
                if (!readonly && (event.key === "Enter" || event.key === " ")) {
                    open();
                }
            },
        },
    };
}
