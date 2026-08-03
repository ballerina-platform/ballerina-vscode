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

import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { AgentRunState, AgentRunStatus, ChatNotify } from "@wso2/ballerina-core";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import type { MiniChatPrompt } from "./promptHandoff";

/** WSO2 brand orange — the pulse-icon color from wso2.com/about/brand. */
export const BRAND_ORANGE = "#F14E23";

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
    // Default to bottom-center so the copilot invitation is front and center
    // when BI opens; users can drag the orb to any of the six anchors.
    return stored && (ANCHORS as readonly string[]).includes(stored) ? (stored as Anchor) : "bottom-center";
}

export const ORB_COLORS: Record<AgentRunState, [string, string, string]> = {
    "idle": ["#6b5ce8", BRAND_ORANGE, "#ffb199"],
    "running": ["#4facfe", "#a78bfa", "#f472b6"],
    "awaiting-input": ["#fbbf24", "#f59e0b", "#fb923c"],
    "completed": ["#34d399", "#10b981", "#6ee7b7"],
    "error": ["#f87171", "#ef4444", "#fb7185"],
};

/** Flow speed / contrast of the shader per state (0 = still, 1 = lively). */
export const ORB_ENERGY: Record<AgentRunState, number> = {
    "idle": 0.35,
    "running": 1.0,
    "awaiting-input": 0.55,
    "completed": 0.45,
    "error": 0.5,
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

function ambientColors(props: AmbientFrameProps): [string, string, string] {
    return ORB_COLORS[props.$state ?? "idle"];
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
        const [first, second, third] = ambientColors(props);
        return `linear-gradient(120deg, ${first}, ${second}, ${third}, ${first})`;
    }};
    background-size: 300% 300%;
    animation: ${ambientGradientShift} 9s ease infinite;
    box-shadow: ${(props: AmbientFrameProps) => {
        const [first, second] = ambientColors(props);
        const hero = props.$variant === "hero";
        const active = !!props.$state && props.$state !== "idle";
        const outerStrength = hero ? 25 : active ? 20 : 12;
        const innerStrength = hero ? 12 : active ? 13 : 7;
        const outerSize = hero ? 18 : active ? 16 : 12;
        const innerSize = hero ? 10 : active ? 10 : 8;
        return `0 0 ${outerSize}px color-mix(in srgb, ${first} ${outerStrength}%, transparent), 0 0 ${innerSize}px color-mix(in srgb, ${second} ${innerStrength}%, transparent)`;
    }};
    transition: box-shadow 0.25s ease;

    &:focus-within {
        box-shadow: ${(props: AmbientFrameProps) => {
            const [first, second] = ambientColors(props);
            return `0 0 22px color-mix(in srgb, ${first} 34%, transparent), 0 0 13px color-mix(in srgb, ${second} 20%, transparent)`;
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

/** User-facing label for a non-idle run state, shared by the orb and the hero box. */
export function activeStateLabel(status: AgentRunStatus): string {
    switch (status.state) {
        case "completed":
            return "Done — click to open Copilot";
        case "running":
            return status.label ?? "Working on it…";
        case "awaiting-input":
            return status.label ?? "Copilot needs your input";
        case "error":
            return status.label ?? "Copilot hit an error";
        default:
            return "Chat with WSO2 Integrator Copilot";
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
    background: radial-gradient(
        circle at 32% 28%,
        rgba(255, 255, 255, 0.55),
        ${(props: SphereProps) => props.colors[0]} 45%,
        ${(props: SphereProps) => props.colors[1]} 100%
    );
    background-size: 180% 180%;
    box-shadow: inset 0 -5px 10px rgba(0, 0, 0, 0.18);
    animation:
        ${spherePulse} ${(props: SphereProps) => (4.2 - props.energy * 2.4).toFixed(2)}s ease-in-out infinite,
        ${sphereDrift} ${(props: SphereProps) => (7.5 - props.energy * 3.5).toFixed(2)}s ease-in-out infinite;

    /*
     * Both fallbacks also undo background-size: the enlarged box only exists so
     * the drift has room to travel, and leaving it scaled would render a
     * differently-shaped gradient than the unanimated original.
     */
    @media (prefers-reduced-motion: reduce), (forced-colors: active) {
        animation: none;
        background-size: 100% 100%;
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
// Hero-box presence.
//
// While a landing-page hero box is on screen it IS the copilot surface for
// that view, so the floating orb hides itself to avoid showing two orbs.
// ---------------------------------------------------------------------------

let heroCount = 0;
const heroListeners = new Set<(present: boolean) => void>();

function notifyHeroPresence() {
    heroListeners.forEach((listener) => listener(heroCount > 0));
}

/** Called by a hero box on mount; returns the matching unmount cleanup. */
export function registerHeroPresence(): () => void {
    heroCount++;
    notifyHeroPresence();
    return () => {
        heroCount--;
        notifyHeroPresence();
    };
}

export function subscribeHeroPresence(listener: (present: boolean) => void): () => void {
    heroListeners.add(listener);
    listener(heroCount > 0);
    return () => {
        heroListeners.delete(listener);
    };
}
