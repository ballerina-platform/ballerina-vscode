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
import * as React from "react";

export const BETA_SVG_WIDTH = 26;
export const BETA_SVG_HEIGHT = 12;

export function BetaSVG({ width = 40, height = 16 }) {
    return (
        <svg width={width} height={height} viewBox="0 0 40 16" xmlns="http://www.w3.org/2000/svg">
            <rect
                width="40"
                height="16"
                rx="8"
                fill="var(--wso2-brand-accent)"
                opacity={0.5}
            />
            <text
                x="50%"
                y="55%"
                dominantBaseline="middle"
                textAnchor="middle"
                fill="var(--vscode-keybindingLabel-foreground)"
                fontSize="12"
                fontFamily="'Roboto', sans-serif"
                fontWeight="500"
            >
                Beta
            </text>
        </svg>
    );
}
