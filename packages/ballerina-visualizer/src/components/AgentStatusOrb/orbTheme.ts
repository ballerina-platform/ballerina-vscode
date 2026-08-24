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

/**
 * Theme-driven colors for the ambient Copilot surfaces.
 *
 * The orb takes its identity from the VS Code primary accent
 * (`--vscode-button-background`) so it matches the BI extension's own look and
 * changes with the editor theme, instead of a fixed standalone palette. The
 * transient run states keep a color-coded meaning, but sourced from VS Code
 * semantic tokens so they too follow light/dark and custom themes.
 *
 * CSS surfaces can consume `stateColorVar()` (a `var(--vscode-*)` string) and
 * theme-react for free. The WebGL shader (`ShaderOrb`) cannot read CSS vars, so
 * it needs concrete hex; `useOrbColors()` resolves the token to a hex triad and
 * re-resolves whenever the theme changes.
 */

import { useEffect, useRef, useState } from "react";
import { AgentRunState } from "@wso2/ballerina-core";

/** BI's `DefaultColors.PRIMARY` (@wso2/ui-toolkit) — used only if resolution fails. */
const FALLBACK_ACCENT = "#5567D5";

type Rgb = [number, number, number];
type Hsl = [number, number, number];

/**
 * The base VS Code color token for each run state. All resolve per theme:
 * idle follows the primary accent; running uses the progress-bar token so it
 * reads as distinct from idle even when motion is disabled; the transient
 * states stay color-coded via semantic tokens.
 */
export function stateColorVar(state: AgentRunState): string {
    switch (state) {
        case "awaiting-input":
            return "var(--vscode-charts-yellow, var(--vscode-editorWarning-foreground))";
        case "completed":
            return "var(--vscode-charts-green)";
        case "error":
            return "var(--vscode-errorForeground, var(--vscode-charts-red))";
        case "running":
            return "var(--vscode-progressBar-background, var(--vscode-button-background))";
        case "idle":
        default:
            return "var(--vscode-button-background)";
    }
}

/**
 * Border/glow color for the ambient frame around the composer & hero input.
 *
 * The primary accent (idle/running) can sit close to the panel background in
 * some themes, making a thin accent border nearly invisible. Blend it toward
 * `--vscode-focusBorder` — the theme's designed-visible ring color — so the
 * frame keeps its accent identity but never disappears. The transient states
 * are already vivid (yellow/green/red), so they stay pure.
 */
export function ambientBorderColor(state: AgentRunState): string {
    if (state === "idle" || state === "running") {
        return "color-mix(in srgb, var(--vscode-button-background) 70%, var(--vscode-focusBorder))";
    }
    return stateColorVar(state);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Parse `#rgb` / `#rrggbb`. */
export function hexToRgb(hex: string): Rgb {
    let value = hex.trim().replace(/^#/, "");
    if (value.length === 3) {
        value = value.split("").map((ch) => ch + ch).join("");
    }
    const int = parseInt(value, 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
    const hex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function rgbToHsl([r, g, b]: Rgb): Hsl {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    const l = (max + min) / 2;
    if (delta === 0) {
        return [0, 0, l];
    }
    const s = delta / (1 - Math.abs(2 * l - 1));
    let h: number;
    if (max === rn) {
        h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
        h = (bn - rn) / delta + 2;
    } else {
        h = (rn - gn) / delta + 4;
    }
    h = (h * 60 + 360) % 360;
    return [h, s, l];
}

export function hslToRgb([h, s, l]: Hsl): Rgb {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rp = 0;
    let gp = 0;
    let bp = 0;
    if (h < 60) { [rp, gp, bp] = [c, x, 0]; }
    else if (h < 120) { [rp, gp, bp] = [x, c, 0]; }
    else if (h < 180) { [rp, gp, bp] = [0, c, x]; }
    else if (h < 240) { [rp, gp, bp] = [0, x, c]; }
    else if (h < 300) { [rp, gp, bp] = [x, 0, c]; }
    else { [rp, gp, bp] = [c, 0, x]; }
    return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}

/** Shift a color's HSL lightness by `delta` (−1..1), keeping hue and saturation. */
export function shiftLightness(hex: string, delta: number): string {
    const [h, s, l] = rgbToHsl(hexToRgb(hex));
    return rgbToHex(hslToRgb([h, s, clamp(l + delta, 0.06, 0.96)]));
}

/** Parse legacy comma-separated and modern space-separated CSS rgb() values. */
function parseRgbFunc(value: string): Rgb | null {
    const match = value.trim().match(/^rgba?\((.*)\)$/i);
    if (!match) {
        return null;
    }
    const content = match[1].trim();
    const components = content.includes(",")
        ? content.split(",")
        : content.split(/\s*\/\s*/)[0].trim().split(/\s+/);
    const channels = components.slice(0, 3).map((component) => {
        const channel = component.trim().match(/^(\d+(?:\.\d+)?|\.\d+)(%)?$/);
        if (!channel) {
            return null;
        }
        const value = Number(channel[1]);
        return channel[2] ? value * 2.55 : value;
    });
    if (components.length < 3 || channels.some((channel) => channel === null)) {
        return null;
    }
    return channels as Rgb;
}

/**
 * Resolve any CSS color expression (a `var(...)` chain, a token, or a literal)
 * to a concrete `#rrggbb`. A throwaway probe lets the browser resolve the full
 * `var()` fallback chain and any named color to a computed `rgb(...)`.
 */
export function resolveCssColorToHex(cssExpr: string): string {
    if (typeof document === "undefined" || !document.body) {
        return FALLBACK_ACCENT;
    }
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none;";
    probe.style.color = cssExpr;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const rgb = parseRgbFunc(resolved);
    return rgb ? rgbToHex(rgb) : FALLBACK_ACCENT;
}

/**
 * The three shader stops for a run state: a monochromatic triad
 * `[darker, base, lighter]` around the state's resolved base color, so the
 * liquid shader keeps depth while reading as a single hue.
 */
export function deriveOrbColors(state: AgentRunState): [string, string, string] {
    const base = resolveCssColorToHex(stateColorVar(state));
    return [shiftLightness(base, -0.15), base, shiftLightness(base, 0.12)];
}

/**
 * The shader-ready hex triad for a run state, re-resolved when the VS Code
 * theme changes. VS Code stamps theme metadata on `<body>`, while some webview
 * hosts update root styles; one shared observer watches both roots. `ShaderOrb`
 * lerps toward the new `colors` each frame, so the change crossfades.
 */
const THEME_ATTRIBUTE_FILTER = ["class", "data-vscode-theme-kind", "data-vscode-theme-id", "style"];
const themeChangeListeners = new Set<() => void>();
let themeObserver: MutationObserver | undefined;

export function subscribeToThemeChanges(listener: () => void): () => void {
    if (typeof document === "undefined" || !document.body || typeof MutationObserver === "undefined") {
        return () => undefined;
    }
    themeChangeListeners.add(listener);
    if (!themeObserver) {
        themeObserver = new MutationObserver(() => {
            for (const listener of themeChangeListeners) {
                listener();
            }
        });
        const options = { attributes: true, attributeFilter: THEME_ATTRIBUTE_FILTER };
        themeObserver.observe(document.documentElement, options);
        themeObserver.observe(document.body, options);
    }
    return () => {
        themeChangeListeners.delete(listener);
        if (themeChangeListeners.size === 0) {
            themeObserver?.disconnect();
            themeObserver = undefined;
        }
    };
}

export function useOrbColors(state: AgentRunState): [string, string, string] {
    const [colors, setColors] = useState<[string, string, string]>(() => deriveOrbColors(state));
    const isFirstRun = useRef(true);

    useEffect(() => {
        const updateColors = () => setColors(deriveOrbColors(state));
        // The lazy useState initializer already resolved the initial state's
        // colors, so skip the redundant mount-time probe; only recompute here
        // when `state` actually changes. Theme changes still recompute via the
        // subscription below.
        if (isFirstRun.current) {
            isFirstRun.current = false;
        } else {
            updateColors();
        }
        return subscribeToThemeChanges(updateColors);
    }, [state]);

    return colors;
}
