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

import React, { CSSProperties } from "react";

interface ChoreoIconProps {
    size?: number;
    color?: string;
    className?: string;
    style?: CSSProperties;
}

/**
 * The Choreo mark, drawn in the surrounding text colour so it follows the theme. Each shape fills itself,
 * since a wrapper's `svg { fill }` rule would otherwise recolour or hide it.
 *
 * It stands in for the `bi-wso2` font glyph, which still draws the old logo, until the shared
 * font in `@wso2/font-wso2-vscode` carries the Choreo mark.
 */
export function ChoreoIcon({ size = 24, color, className, style }: ChoreoIconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="-21.23 0 887.42 887.42"
            className={className}
            role="img"
            aria-label="Choreo"
            style={{ display: "block", flexShrink: 0, color: color ?? "currentColor", ...style }}
        >
            <ellipse cx="710.09" cy="282.87" rx="134.88" ry="60.8" fill="currentColor" />
            <ellipse cx="629.81" cy="135.53" rx="129.85" ry="51.34" fill="currentColor" />
            <ellipse cx="470.02" cy="24.5" rx="141.63" ry="24.5" fill="currentColor" />
            <ellipse cx="710.09" cy="604.55" rx="134.88" ry="60.8" fill="currentColor" />
            <ellipse cx="629.81" cy="751.87" rx="129.85" ry="51.34" fill="currentColor" />
            <ellipse cx="470.02" cy="862.91" rx="141.63" ry="24.5" fill="currentColor" />
            <ellipse cx="134.88" cy="430.4" rx="134.88" ry="60.8" fill="currentColor" />
            <ellipse cx="181.78" cy="607.8" rx="110.13" ry="51.34" fill="currentColor" />
            <ellipse cx="181.78" cy="252.45" rx="110.13" ry="51.34" fill="currentColor" />
        </svg>
    );
}
