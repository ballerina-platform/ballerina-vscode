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
import { BotIcon } from "./BotIcon";
import { ShaderOrb } from "./ShaderOrb";
import {
    AGENT_BUILDER_ORB_COLORS,
    FALLBACK_ORB_THEME,
    Gloss,
    IconOverlay,
    ORB_ENERGY,
    OrbTheme,
    orbStateHues,
    SpinArc as SolidSpinArc,
    Sphere,
    useOrbTheme,
} from "./shared";

const rotate = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
`;

// Idle only breathes: a turning conic glow reads as a radar sweep.
const idleBreath = keyframes`
    0%, 100% { opacity: var(--aura-low); }
    50% { opacity: var(--aura-high); }
`;

const haloPulse = keyframes`
    0%, 100% { opacity: 0.25; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.18); }
`;

const Holder = styled.div<{ $size: number }>`
    ${orbStateHues}
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
    --aura-low: 0.3;
    --aura-high: 0.5;
    opacity: ${(props: AuraProps) => (props.state === "idle" ? 0.45 : props.state === "running" ? 1 : 0.85)};
    // The same saturated glow that reads as a soft shadow on a light ground turns into a hot ring
    // against near-black.
    body.vscode-dark &,
    body.vscode-high-contrast & {
        --aura-low: 0.16;
        --aura-high: 0.3;
        opacity: ${(props: AuraProps) => (props.state === "idle" ? 0.26 : props.state === "running" ? 0.7 : 0.55)};
        filter: blur(11px);
    }
    ${(props: AuraProps) =>
        props.state === "running"
            ? css`animation: ${rotate} 2.8s linear infinite;`
            : props.state === "idle"
                ? css`animation: ${idleBreath} 6s ease-in-out infinite;`
                : css`animation: ${rotate} 9s linear infinite;`}
    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

const BrandRing = styled.div<{ ringColor?: string }>`
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1.5px solid ${(props: { ringColor?: string }) => props.ringColor ?? "color-mix(in srgb, var(--vscode-button-foreground) 35%, transparent)"};
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

// A glow can only tint a white ground, which reads as a smudge.
const darkThemeOnly = css`
    body.vscode-light &,
    body.vscode-high-contrast-light & {
        display: none;
    }
`;

const SolidHalo = styled(Halo)`${darkThemeOnly}`;
const SolidAura = styled(Aura)`${darkThemeOnly}`;

export interface CopilotOrbProps {
    state: AgentRunState;
    /** Ignored by the solid style, which always uses Agent Builder's palette. */
    colors: [string, string, string];
    size: number;
    iconSize?: number;
    /** Pins a theme instead of following the shared preference. */
    theme?: OrbTheme;
}

/** Agent Builder's own look: a flat sphere in its palette in a soft breathing glow, with a white icon. */
function SolidOrb({ state, size, iconSize }: { state: AgentRunState; size: number; iconSize: number }) {
    const colors = AGENT_BUILDER_ORB_COLORS[state];
    return (
        <Holder $size={size}>
            {(state === "running" || state === "awaiting-input") && <SolidHalo colors={colors} />}
            {state === "idle" ? (
                // One hue: the idle triple's dark shade would show as a dirty patch in a still glow.
                <Aura colors={[colors[0], colors[0], colors[0]]} state={state} />
            ) : (
                <SolidAura colors={colors} state={state} />
            )}
            <Sphere colors={colors} energy={ORB_ENERGY[state]} />
            {state !== "idle" && <BrandRing ringColor={`color-mix(in srgb, ${colors[0]} 55%, transparent)`} />}
            {state === "running" && <SolidSpinArc />}
            <IconOverlay>
                <BotIcon size={iconSize} color="#ffffff" />
            </IconOverlay>
        </Holder>
    );
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

    if (resolved === "solid") {
        return <SolidOrb state={state} size={size} iconSize={iconSize} />;
    }

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
                <BotIcon size={iconSize} color="var(--vscode-button-foreground)" />
            </IconOverlay>
        </Holder>
    );
}
