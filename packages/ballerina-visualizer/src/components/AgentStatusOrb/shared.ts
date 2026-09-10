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

import { useEffect, useLayoutEffect, useState } from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { AgentRunState, AgentRunStatus, ChatNotify, MACHINE_VIEW } from "@wso2/ballerina-core";
import { BallerinaRpcClient, useRpcContext } from "@wso2/ballerina-rpc-client";
import type { MiniChatPrompt } from "./promptHandoff";
import { ambientBorderColor } from "./orbTheme";

/** Floating orb geometry, shared with the mini chat for anchor-relative placement. */
export const ORB_SIZE = 56;
export const EDGE_MARGIN = 20;

export type Anchor = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

export const ANCHOR_STORAGE_KEY = "ballerina.copilot.orbAnchor";

const ANCHORS: readonly Anchor[] = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];

export function loadAnchor(): Anchor {
    // Storage may be unavailable/quota-restricted in the webview — fall back to
    // the default anchor rather than throwing during render.
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(ANCHOR_STORAGE_KEY);
    } catch {
        stored = null;
    }
    // bottom-center sits on top of whatever the active view docks at its own
    // bottom-center (form submit buttons, artifact-picker cards, …), so default
    // to bottom-right instead; users can still drag the orb to any anchor.
    return stored && (ANCHORS as readonly string[]).includes(stored) ? (stored as Anchor) : "bottom-right";
}

/** Flow speed / contrast of the shader per state (0 = still, 1 = lively). */
export const ORB_ENERGY: Record<AgentRunState, number> = {
    // Raised across the board so the single-hue orb visibly flows (the motion,
    // not the color, is what carries "alive"). Running stays at the ceiling.
    "idle": 0.6,
    "running": 1.0,
    "awaiting-input": 0.72,
    "completed": 0.6,
    "error": 0.65,
};

const ambientGradientShift = keyframes`
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
`;

export type AmbientFrameVariant = "hero" | "composer";

interface AmbientFrameProps {
    $state?: AgentRunState;
    $variant?: AmbientFrameVariant;
}

/** The frame's base color (accent floored to focusBorder for visibility); tinted in CSS. */
function ambientBase(props: AmbientFrameProps): string {
    return ambientBorderColor(props.$state ?? "idle");
}

/**
 * Shared ambient AI frame used by the landing-page hero and full chat input.
 * The transcript remains neutral; this frame identifies the active Copilot surface.
 */
export const AmbientFrame = styled.div<AmbientFrameProps>`
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: ${(props: AmbientFrameProps) => props.$variant === "hero" ? "1.5px" : "1px"};
    border-radius: ${(props: AmbientFrameProps) => props.$variant === "hero" ? "14px" : "10px"};
    background: ${(props: AmbientFrameProps) => {
        // Monochromatic gradient tinted from the state's accent so the frame
        // reads as one theme color (light stop → base → dark stop).
        const base = ambientBase(props);
        return `linear-gradient(120deg,`
            + ` color-mix(in srgb, ${base} 82%, #ffffff),`
            + ` ${base},`
            + ` color-mix(in srgb, ${base} 80%, #000000),`
            + ` color-mix(in srgb, ${base} 82%, #ffffff))`;
    }};
    background-size: 300% 300%;
    animation: ${ambientGradientShift} 9s ease infinite;
    box-shadow: ${(props: AmbientFrameProps) => {
        const base = ambientBase(props);
        const hero = props.$variant === "hero";
        const active = !!props.$state && props.$state !== "idle";
        // Idle composer used to be the faintest (12/7); bump it so the frame
        // stays legible where the accent is muted or near the panel background.
        const outerStrength = hero ? 25 : active ? 20 : 18;
        const innerStrength = hero ? 12 : active ? 13 : 11;
        const outerSize = hero ? 18 : active ? 16 : 14;
        const innerSize = hero ? 10 : active ? 10 : 9;
        return `0 0 ${outerSize}px color-mix(in srgb, ${base} ${outerStrength}%, transparent), 0 0 ${innerSize}px color-mix(in srgb, ${base} ${innerStrength}%, transparent)`;
    }};
    transition: box-shadow 0.25s ease;

    &:focus-within {
        box-shadow: ${(props: AmbientFrameProps) => {
            const base = ambientBase(props);
            return `0 0 22px color-mix(in srgb, ${base} 34%, transparent), 0 0 13px color-mix(in srgb, ${base} 20%, transparent)`;
        }};
    }

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }

    @media (forced-colors: active) {
        padding: 1px;
        background: CanvasText;
        box-shadow: none;
        animation: none;
    }
`;

export const AWAITING_INPUT_LABEL = "Needs your input";

/**
 * User-facing label for a non-idle run state. Never names the product: every surface
 * that shows one already does — the orb tooltip, and the status bar the extension
 * builds from the same vocabulary.
 */
export function activeStateLabel(status: AgentRunStatus): string {
    switch (status.state) {
        case "completed":
            return "Done — click to open the chat";
        case "running":
            return status.label ?? "Working on it…";
        case "awaiting-input":
            return status.label ?? AWAITING_INPUT_LABEL;
        case "error":
            return status.label ?? "Something went wrong";
        default:
            return "Ready to chat";
    }
}

const spherePulse = keyframes`
    0%, 100% { transform: scale(1); filter: brightness(1); }
    50% { transform: scale(1.05); filter: brightness(1.13); }
`;

/** Drifts the highlight across the sphere — needs background-size > 100%. */
const sphereDrift = keyframes`
    0% { background-position: 30% 30%; }
    50% { background-position: 70% 62%; }
    100% { background-position: 30% 30%; }
`;
const sphereSheen = keyframes`
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
`;

interface SphereProps {
    colors: [string, string, string];
    /**
     * Flow speed in 0..1, from ORB_ENERGY. Drives the animation period so the
     * CSS sphere reads at roughly the same tempo as the shader it stands in for.
     *
     * Required, mirroring ShaderOrb's own required `energy`: every call site
     * renders one or the other from the same AgentRunState, and making this
     * optional let two of them silently render a running orb at idle tempo.
     */
    energy: number;
}

/**
 * CSS gradient sphere — the fallback when a WebGL context can't be created,
 * and the primary rendering for small indicators where a live GL context per
 * orb isn't worth it (the chat footer's 16px "Generating" dot).
 *
 * It animates on its own rather than sitting still: a slow breathing pulse
 * plus a drifting highlight, both scaled by `energy`. That keeps the
 * WebGL-failure path from looking frozen wherever Sphere stands in for
 * ShaderOrb.
 */
export const Sphere = styled.div<SphereProps>`
    position: absolute;
    inset: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    // Base has to dominate the body or this reads near-black on a light theme.
    background:
        radial-gradient(
            circle at 30% 24%,
            rgba(255, 255, 255, 0.55),
            rgba(255, 255, 255, 0.1) 24%,
            transparent 44%
        ),
        radial-gradient(
            circle at 74% 80%,
            color-mix(in srgb, ${(props: SphereProps) => props.colors[2]} 65%, transparent),
            transparent 50%
        ),
        radial-gradient(
            circle at 62% 34%,
            color-mix(in srgb, ${(props: SphereProps) => props.colors[2]} 55%, transparent),
            transparent 46%
        ),
        radial-gradient(
            circle at 26% 70%,
            color-mix(in srgb, ${(props: SphereProps) => props.colors[0]} 65%, transparent),
            transparent 48%
        ),
        radial-gradient(
            circle at 32% 28%,
            ${(props: SphereProps) => props.colors[2]},
            ${(props: SphereProps) => props.colors[1]} 52%,
            ${(props: SphereProps) => props.colors[0]} 100%
        );
    /*
     * Highlights stay at 100% so they never slide; the three tinted layers are
     * oversized by different amounts so one shared drift moves them at different
     * apparent speeds, which is what fakes the shader's liquid depth.
     */
    background-size: 100% 100%, 100% 100%, 220% 220%, 170% 170%, 180% 180%;
    box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.22),
        inset 0 9px 16px rgba(255, 255, 255, 0.1),
        inset 0 -8px 14px rgba(0, 0, 0, 0.16),
        0 0 14px color-mix(in srgb, ${(props: SphereProps) => props.colors[1]} 45%, transparent);
    animation:
        ${spherePulse} ${(props: SphereProps) => (4.2 - props.energy * 2.4).toFixed(2)}s ease-in-out infinite,
        ${sphereDrift} ${(props: SphereProps) => (7.5 - props.energy * 3.5).toFixed(2)}s ease-in-out infinite;

    // Slow sheen sweep — the CSS stand-in for the shader's motion.
    &::before {
        content: "";
        position: absolute;
        inset: -28%;
        background: conic-gradient(
            from 0deg,
            transparent 0 54%,
            rgba(255, 255, 255, 0.26) 72%,
            transparent 86%
        );
        animation: ${sphereSheen} ${(props: SphereProps) => (9 - props.energy * 4).toFixed(2)}s linear infinite;
        pointer-events: none;
    }

    /*
     * Both fallbacks also undo background-size: the enlarged box only exists so
     * the drift has room to travel, and leaving it scaled would render a
     * differently-shaped gradient than the unanimated original.
     */
    @media (prefers-reduced-motion: reduce), (forced-colors: active) {
        animation: none;
        background-size: 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%;

        &::before {
            display: none;
        }
    }
`;

/** Glass reflection overlay — sits on top of both the shader and CSS spheres. */
export const Gloss = styled.div`
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.04) 30%, transparent 50%);
    pointer-events: none;
`;

/** Centers the copilot glyph over the sphere — shared by the orb and hero box. */
export const IconOverlay = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
`;

// ---------------------------------------------------------------------------
// Agent-run-status fan-out.
//
// vscode-messenger keeps ONE handler per notification method
// (handlerRegistry.set), so a second onAgentRunStatusChanged subscriber would
// silently replace the first. This store owns the single messenger
// subscription (plus the initial pull) and fans updates out to any number of
// components (floating orb, landing-page hero box, ...).
// ---------------------------------------------------------------------------

let currentStatus: AgentRunStatus | null = null;
let statusWired = false;
// A live status notification can arrive before the initial getAgentRunStatus()
// pull resolves; once one has, the (older) pull result must not clobber it.
let receivedStatusNotification = false;
const statusListeners = new Set<(status: AgentRunStatus | null) => void>();

function publishStatus(status: AgentRunStatus | null) {
    currentStatus = status;
    statusListeners.forEach((listener) => listener(status));
}

export function subscribeAgentRunStatus(
    rpcClient: BallerinaRpcClient,
    listener: (status: AgentRunStatus | null) => void
): () => void {
    statusListeners.add(listener);
    if (statusWired) {
        listener(currentStatus);
    } else {
        statusWired = true;
        rpcClient
            .getCommonRpcClient()
            .getAgentRunStatus()
            .then((status) => {
                // Skip if a live notification already delivered a fresher status.
                if (!receivedStatusNotification) {
                    publishStatus(status);
                }
            })
            .catch(() => {
                // Older extension host without the RPC — status stays null.
            });
        rpcClient.onAgentRunStatusChanged((status) => {
            receivedStatusNotification = true;
            publishStatus(status);
        });
    }
    return () => {
        statusListeners.delete(listener);
    };
}

/** Test-only: clears the module-level status cache and listeners between test cases. */
export function __resetAgentRunStatusStoreForTests(): void {
    currentStatus = null;
    statusWired = false;
    receivedStatusNotification = false;
    statusListeners.clear();
}

/**
 * True while the Copilot panel is open — inline copilot surfaces stand down so
 * the panel is the only chat entry point. Seeded from the cached status so a
 * remount does not flash the surface it is about to hide.
 */
export function useAiPanelOpen(): boolean {
    const { rpcClient } = useRpcContext();
    const [open, setOpen] = useState(() => currentStatus?.aiPanelOpen ?? false);

    useEffect(() => {
        if (!rpcClient) {
            return;
        }
        return subscribeAgentRunStatus(rpcClient, (status) => setOpen(status?.aiPanelOpen ?? false));
    }, [rpcClient]);

    return open;
}

/** The live run state — says nothing about what the turn will produce. */
export function useAgentRunState(): AgentRunState | undefined {
    const { rpcClient } = useRpcContext();
    const [state, setState] = useState(() => currentStatus?.state);

    useEffect(() => {
        if (!rpcClient) {
            return;
        }
        return subscribeAgentRunStatus(rpcClient, (status) => setState(status?.state));
    }, [rpcClient]);

    return state;
}

// ---------------------------------------------------------------------------
// Contextual mini-chat launch requests.
//
// Diagram actions and the orb are siblings in the visualizer tree. Keep their
// handoff in this small fan-out store so the diagram can pass the complete
// typed prompt (especially CodeContext) without opening the extension panel.
// ---------------------------------------------------------------------------

const miniChatOpenListeners = new Set<(prompt: MiniChatPrompt) => void>();

/**
 * Ask the ambient Copilot surface to open with a contextual prompt.
 * Returns false only when the orb has not mounted, allowing a full-panel fallback.
 */
export function requestMiniChatOpen(prompt: MiniChatPrompt): boolean {
    if (miniChatOpenListeners.size === 0) {
        return false;
    }
    miniChatOpenListeners.forEach((listener) => listener(prompt));
    return true;
}

export function subscribeMiniChatOpen(listener: (prompt: MiniChatPrompt) => void): () => void {
    miniChatOpenListeners.add(listener);
    return () => {
        miniChatOpenListeners.delete(listener);
    };
}

// ---------------------------------------------------------------------------
// Copilot chat stream (mini chat).
//
// The extension mirrors onChatNotify events to the visualizer webview on the
// dedicated onCopilotChatNotify method while the AI panel is closed. Same
// one-handler-per-method constraint as above, so the single messenger
// registration lives here and fans out.
// ---------------------------------------------------------------------------

let chatWired = false;
const chatListeners = new Set<(msg: ChatNotify) => void>();

export function subscribeCopilotChatNotify(
    rpcClient: BallerinaRpcClient,
    listener: (msg: ChatNotify) => void
): () => void {
    chatListeners.add(listener);
    if (!chatWired) {
        chatWired = true;
        rpcClient.onCopilotChatNotify((msg) => chatListeners.forEach((l) => l(msg)));
    }
    return () => {
        chatListeners.delete(listener);
    };
}

// ---------------------------------------------------------------------------
// Floating-orb suppression.
//
// A view opts out of the floating orb either because its own hero box is the
// copilot surface there, or because it deliberately offers no ambient copilot.
// ---------------------------------------------------------------------------

let orbSuppressCount = 0;
const orbSuppressListeners = new Set<(suppressed: boolean) => void>();

function notifyOrbSuppressed() {
    orbSuppressListeners.forEach((listener) => listener(orbSuppressCount > 0));
}

/**
 * Hides the floating orb while the caller is mounted and `suppressed` holds.
 * Layout effect, not passive: suppression has to land in the same frame as the
 * render that caused it, or the orb paints once over a view that opts out.
 */
export function useSuppressAgentStatusOrb(suppressed = true): void {
    useLayoutEffect(() => {
        if (!suppressed) {
            return;
        }
        orbSuppressCount++;
        notifyOrbSuppressed();
        return () => {
            orbSuppressCount--;
            notifyOrbSuppressed();
        };
    }, [suppressed]);
}

/**
 * The hubs and design canvases the ambient orb belongs on. Forms, wizards, list
 * and settings pages, setup/welcome pages, Copilot's own views and anything still
 * loading go without it, so a view added later has to opt in here rather than
 * inherit the overlay.
 */
const VIEWS_WITH_ORB: ReadonlySet<MACHINE_VIEW> = new Set([
    MACHINE_VIEW.PackageOverview,
    MACHINE_VIEW.BIComponentView,
    MACHINE_VIEW.BIDiagram,
    MACHINE_VIEW.ServiceDesigner,
    MACHINE_VIEW.BIServiceClassDesigner,
    MACHINE_VIEW.AIAgentDesigner,
    MACHINE_VIEW.ERDiagram,
    MACHINE_VIEW.TypeDiagram,
    MACHINE_VIEW.GraphQLDiagram,
    MACHINE_VIEW.DataMapper,
    MACHINE_VIEW.InlineDataMapper,
]);

export function viewHidesAgentStatusOrb(view: MACHINE_VIEW | null | undefined): boolean {
    return !view || !VIEWS_WITH_ORB.has(view);
}

export function subscribeOrbSuppressed(listener: (suppressed: boolean) => void): () => void {
    orbSuppressListeners.add(listener);
    listener(orbSuppressCount > 0);
    return () => {
        orbSuppressListeners.delete(listener);
    };
}

// ---------------------------------------------------------------------------
// Ambient Copilot presence.
//
// True while an in-context opener (the floating orb or the overview composer)
// is on screen. The extension mirrors this into `ballerina.copilotAmbientPresent`
// so the legacy editor-title icon only shows where no ambient surface exists.
// ---------------------------------------------------------------------------

let ambientPresenceCount = 0;
const ambientPresenceListeners = new Set<(present: boolean) => void>();

function notifyAmbientPresence() {
    ambientPresenceListeners.forEach((listener) => listener(ambientPresenceCount > 0));
}

/**
 * Registers an ambient Copilot surface while the caller is mounted and `present`
 * holds. Layout effect so presence lands in the same frame as the render, matching
 * orb suppression and avoiding a one-frame flash of the legacy icon.
 */
export function useAmbientCopilotPresence(present = true): void {
    useLayoutEffect(() => {
        if (!present) {
            return;
        }
        ambientPresenceCount++;
        notifyAmbientPresence();
        return () => {
            ambientPresenceCount--;
            notifyAmbientPresence();
        };
    }, [present]);
}

export function subscribeAmbientCopilotPresence(listener: (present: boolean) => void): () => void {
    ambientPresenceListeners.add(listener);
    listener(ambientPresenceCount > 0);
    return () => {
        ambientPresenceListeners.delete(listener);
    };
}

// animated: WebGL core + brand ring (default). simple: CSS sphere, no ring — also
// the fallback when animated can't render. Add a theme by appending it here and to
// the `ballerina.copilot.orbTheme` enum.
export const ORB_THEMES = ["animated", "simple"] as const;
export type OrbTheme = typeof ORB_THEMES[number];

export const DEFAULT_ORB_THEME: OrbTheme = "animated";
export const FALLBACK_ORB_THEME: OrbTheme = "simple";

export function orbThemeFromSetting(value: string): OrbTheme {
    return (ORB_THEMES as readonly string[]).includes(value) ? (value as OrbTheme) : FALLBACK_ORB_THEME;
}

let currentOrbTheme: OrbTheme = DEFAULT_ORB_THEME;
const orbThemeListeners = new Set<(theme: OrbTheme) => void>();

export function getOrbTheme(): OrbTheme {
    return currentOrbTheme;
}

export function setOrbTheme(theme: OrbTheme): void {
    if (theme === currentOrbTheme) {
        return;
    }
    currentOrbTheme = theme;
    orbThemeListeners.forEach((listener) => listener(theme));
}

export function subscribeOrbTheme(listener: (theme: OrbTheme) => void): () => void {
    orbThemeListeners.add(listener);
    return () => {
        orbThemeListeners.delete(listener);
    };
}

export function useOrbTheme(): OrbTheme {
    const [theme, setTheme] = useState<OrbTheme>(currentOrbTheme);
    useEffect(() => subscribeOrbTheme(setTheme), []);
    return theme;
}

let orbThemeSynced = false;

export function syncOrbThemeFromSetting(rpcClient: BallerinaRpcClient): void {
    if (orbThemeSynced) {
        return;
    }
    orbThemeSynced = true;
    rpcClient
        .getCommonRpcClient()
        .getCopilotOrbTheme()
        .then((value: string) => setOrbTheme(orbThemeFromSetting(value)))
        .catch((): void => { /* older host without the RPC — keep the default */ });
}
