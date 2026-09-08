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

import { useCallback, useState } from "react";
import styled from "@emotion/styled";
import { css, keyframes } from "@emotion/react";
import { AgentRunState } from "@wso2/ballerina-core";
import { Icon } from "@wso2/ui-toolkit";
import { ShaderOrb } from "./ShaderOrb";
import { FALLBACK_ORB_THEME, Gloss, IconOverlay, ORB_ENERGY, OrbTheme, Sphere, useOrbTheme } from "./shared";

const rotate = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
`;

const haloPulse = keyframes`
    0%, 100% { opacity: 0.25; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.18); }
`;

const Holder = styled.div<{ $size: number }>`
    position: relative;
    width: ${(props: { $size: number }) => props.$size}px;
    height: ${(props: { $size: number }) => props.$size}px;
    flex: none;
`;

interface ColorsProps {
    colors: [string, string, string];
}

const Halo = styled.div<ColorsProps>`
    position: absolute;
    inset: -16px;
    border-radius: 50%;
    background: radial-gradient(circle, ${(props: ColorsProps) => props.colors[1]} 0%, transparent 70%);
    animation: ${haloPulse} 1.8s ease-in-out infinite;
    pointer-events: none;
    @media (prefers-reduced-motion: reduce) {
        animation: none;
        opacity: 0.4;
    }
`;

interface AuraProps extends ColorsProps {
    state: AgentRunState;
}

const Aura = styled.div<AuraProps>`
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    background: conic-gradient(
        from 0deg,
        ${(props: AuraProps) => `${props.colors[0]}, ${props.colors[1]}, ${props.colors[2]}, ${props.colors[0]}`}
    );
    filter: blur(8px);
    opacity: ${(props: AuraProps) => (props.state === "idle" ? 0.45 : props.state === "running" ? 1 : 0.85)};
    ${(props: AuraProps) =>
        props.state === "running"
            ? css`animation: ${rotate} 2.8s linear infinite;`
            : props.state === "idle"
                ? css`animation: ${rotate} 14s linear infinite;`
                : css`animation: ${rotate} 9s linear infinite;`}
    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

const BrandRing = styled.div`
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--vscode-button-foreground) 35%, transparent);
    pointer-events: none;
`;

const SpinArc = styled.div`
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    border: 2px solid transparent;
    border-top-color: var(--vscode-button-foreground);
    animation: ${rotate} 1.1s linear infinite;
    pointer-events: none;
    @media (prefers-reduced-motion: reduce) {
        display: none;
    }
`;

export interface CopilotOrbProps {
    state: AgentRunState;
    colors: [string, string, string];
    size: number;
    iconSize?: number;
    /** Pins a theme instead of following the shared preference. */
    theme?: OrbTheme;
}

export function CopilotOrb({ state, colors, size, iconSize = 26, theme }: CopilotOrbProps) {
    const preferred = useOrbTheme();
    const [webglFailed, setWebglFailed] = useState(false);
    // Must be referentially stable: ShaderOrb re-creates (and loses) its GL context whenever this changes.
    const handleWebglFailed = useCallback(() => setWebglFailed(true), []);

    const requested = theme ?? preferred;
    // The animated orb needs WebGL; fall back to the simple one when it can't render.
    const resolved: OrbTheme = requested === "animated" && webglFailed ? FALLBACK_ORB_THEME : requested;
    const energy = ORB_ENERGY[state];

    return (
        <Holder $size={size}>
            {(state === "running" || state === "awaiting-input") && <Halo colors={colors} />}
            <Aura colors={colors} state={state} />
            {resolved === "animated" ? (
                <ShaderOrb colors={colors} energy={energy} size={size} onContextFailed={handleWebglFailed} />
            ) : (
                <Sphere colors={colors} energy={energy} />
            )}
            <Gloss />
            {resolved === "animated" && <BrandRing />}
            {state === "running" && <SpinArc />}
            <IconOverlay>
                <Icon
                    name="bi-ai-chat"
                    sx={{ width: iconSize, height: iconSize }}
                    iconSx={{ fontSize: `${iconSize}px`, color: "var(--vscode-button-foreground)", cursor: "inherit" }}
                />
            </IconOverlay>
        </Holder>
    );
}
