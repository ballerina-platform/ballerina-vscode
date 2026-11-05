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
import { keyframes } from "@emotion/react";

// The bi-ai-chat glyph without its eyes, which are drawn separately so they can blink.
const BODY_PATH =
    "M7.695 1.057a1.04 1.04 0 0 0-.567.459c-.091.156-.108.23-.108.484 0 .256.016.328.111.489.061.103.173.236.25.294.273.208.319.213 2.029.215L11 3v1.996l-2.77.013-2.77.013-.321.1A3.107 3.107 0 0 0 3.116 7.14c-.09.273-.093.327-.107 2.07L2.995 11h-.551c-.796 0-1.078.111-1.316.516-.091.156-.108.23-.108.484 0 .256.016.328.111.489.125.213.318.375.539.454.098.035.353.054.74.055L3 13v4.575c0 4.982-.011 4.739.225 5.048.059.077.19.19.291.249.156.092.229.108.484.107.212 0 .341-.022.44-.074.077-.04 1.004-.935 2.06-1.988l1.92-1.915 5.08-.011 5.08-.011.28-.094a3.136 3.136 0 0 0 2.024-2.026c.09-.273.093-.327.107-2.07l.014-1.79.588-.002c.385-.001.639-.02.737-.055.221-.079.414-.241.539-.454.095-.161.111-.233.111-.489 0-.254-.017-.328-.108-.484-.238-.405-.52-.516-1.316-.516h-.551l-.014-1.79c-.014-1.743-.017-1.797-.107-2.07a3.107 3.107 0 0 0-2.023-2.018l-.321-.1-2.768-.013-2.769-.013-.011-1.648L12.98 1.7l-.108-.184a1.02 1.02 0 0 0-.582-.461c-.257-.077-4.347-.076-4.595.002M18.31 7.061c.279.083.546.35.629.629.053.177.061.751.061 4.311 0 4.457.007 4.318-.221 4.617-.061.08-.194.195-.295.254l-.184.108-5.28.02c-5.102.019-5.285.023-5.44.097-.1.048-.617.53-1.37 1.278L5 19.577v-5.841c0-6.58-.022-6.107.304-6.433.319-.32-.184-.297 6.679-.3 5.37-.003 6.148.004 6.327.058";

const blink = keyframes`
    0%, 93%, 100% { transform: scaleY(1); }
    95% { transform: scaleY(0.1); }
`;

const Eye = styled.rect`
    transform-box: fill-box;
    transform-origin: center;
    animation: ${blink} 6s ease-in-out infinite;
    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

interface BotIconProps {
    size: number;
    color: string;
}

export function BotIcon({ size, color }: BotIconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
            <path d={BODY_PATH} fillRule="evenodd" />
            <Eye x={8} y={10} width={2} height={4} rx={1} />
            <Eye x={14} y={10} width={2} height={4} rx={1} />
        </svg>
    );
}
