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

import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AgentRunStatus, AgentRunState, SHARED_COMMANDS } from "@wso2/ballerina-core";
import { MiniChat } from "./MiniChat";
import { CopilotOrb } from "./CopilotOrb";
import { useOrbColors } from "./orbTheme";
import {
    Anchor,
    ANCHOR_STORAGE_KEY,
    EDGE_MARGIN,
    loadAnchor,
    ORB_SIZE,
    activeStateLabel,
    subscribeAgentRunStatus,
    subscribeOrbSuppressed,
    subscribeMiniChatOpen,
    syncOrbThemeFromSetting,
    useAmbientCopilotPresence,
} from "./shared";
import { createMiniChatPrompt, MiniChatPrompt } from "./promptHandoff";

/**
 * Floating ambient indicator for the Copilot agent's background run.
 *
 * Rendered as an overlay in the visualizer webview and always visible while
 * the AI panel is closed — a subdued idle presence, and animated color-coded
 * states while the agent works in the background. Hidden while the AI panel
 * is open (the panel itself shows richer progress). Clicking it toggles the
 * mini chat overlay (the full panel is one more click away via its maximize
 * button); typing into the idle invite starts the conversation in the mini.
 * Draggable: released anywhere, it snaps to the nearest corner and the
 * corner is remembered across reloads.
 */

const DRAG_THRESHOLD = 5;
const SNAP_ANIMATION_MS = 250;

const ANCHOR_CSS: Record<Anchor, React.CSSProperties> = {
    "top-left": { top: EDGE_MARGIN, left: EDGE_MARGIN },
    "top-center": { top: EDGE_MARGIN, left: "50%", transform: "translateX(-50%)" },
    "top-right": { top: EDGE_MARGIN, right: EDGE_MARGIN },
    "bottom-left": { bottom: EDGE_MARGIN, left: EDGE_MARGIN },
    "bottom-center": { bottom: EDGE_MARGIN, left: "50%", transform: "translateX(-50%)" },
    "bottom-right": { bottom: EDGE_MARGIN, right: EDGE_MARGIN },
};

// Where the label pill sits relative to the orb, per anchor: left edges push the
// pill inward (row-reverse), the horizontal centers stack it vertically, the rest
// trail it to the right. (Overridden to plain "row" mid-drag.)
const FLEX_DIRECTION_BY_ANCHOR: Record<Anchor, "row" | "row-reverse" | "column" | "column-reverse"> = {
    "top-left": "row-reverse",
    "bottom-left": "row-reverse",
    "top-center": "column-reverse",
    "bottom-center": "column",
    "top-right": "row",
    "bottom-right": "row",
};

/** Top-left px position of the orb when docked at an anchor. */
function anchorPosition(anchor: Anchor): { x: number; y: number } {
    const x = anchor.endsWith("left")
        ? EDGE_MARGIN
        : anchor.endsWith("center")
            ? (window.innerWidth - ORB_SIZE) / 2
            : window.innerWidth - ORB_SIZE - EDGE_MARGIN;
    const y = anchor.startsWith("top") ? EDGE_MARGIN : window.innerHeight - ORB_SIZE - EDGE_MARGIN;
    return { x, y };
}

/** Nearest of the six anchors: horizontal thirds × vertical halves. */
function nearestAnchor(x: number, y: number): Anchor {
    const vertical = y < window.innerHeight / 2 ? "top" : "bottom";
    const horizontal =
        x < window.innerWidth / 3 ? "left" : x > (window.innerWidth * 2) / 3 ? "right" : "center";
    return `${vertical}-${horizontal}` as Anchor;
}

const breathe = keyframes`
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.12); }
`;

const bloom = keyframes`
    0% { transform: scale(0.6); opacity: 0; }
    60% { transform: scale(1.15); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
`;

const fadeIn = keyframes`
    from { opacity: 0; transform: translateX(6px); }
    to { opacity: 1; transform: translateX(0); }
`;

const Wrapper = styled.div`
    position: fixed;
    /* Below side panels and modals (>=1900) so an open form keeps its controls reachable; above diagram content. */
    z-index: 1800;
    display: flex;
    align-items: center;
    gap: 10px;
    pointer-events: none;
`;

const LabelPill = styled.div`
    pointer-events: auto;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border, transparent);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: 12px;
    line-height: 1;
    padding: 7px 12px;
    border-radius: 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    animation: ${fadeIn} 0.2s ease-out;
    cursor: pointer;
`;

const InviteBox = styled.div`
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border, transparent);
    border-radius: 14px;
    padding: 5px 6px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    animation: ${fadeIn} 0.25s ease-out;
`;

const InviteInput = styled.input`
    width: 230px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 9px;
    padding: 6px 10px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    outline: none;
    &:focus {
        border-color: var(--vscode-focusBorder);
    }
    &::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }
`;

const InviteDismiss = styled.button`
    background: transparent;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 4px 5px;
    border-radius: 4px;
    &:hover {
        color: var(--vscode-foreground);
        background: var(--vscode-toolbar-hoverBackground);
    }
`;

interface OrbStyleProps {
    state: AgentRunState;
}

const OrbButton = styled.button<{ state: AgentRunState }>`
    pointer-events: auto;
    position: relative;
    width: ${ORB_SIZE}px;
    height: ${ORB_SIZE}px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: grab;
    outline-offset: 4px;
    touch-action: none;
    opacity: ${(props: Pick<OrbStyleProps, "state">) => (props.state === "idle" ? 0.85 : 1)};
    transition: opacity 0.3s ease, transform 0.2s ease;
    &:hover {
        opacity: 1;
        transform: scale(1.06);
    }
    &:active {
        cursor: grabbing;
    }
    animation: ${(props: Pick<OrbStyleProps, "state">) =>
        props.state === "awaiting-input" ? breathe : props.state === "completed" ? bloom : "none"}
        ${(props: Pick<OrbStyleProps, "state">) =>
        props.state === "awaiting-input" ? "1.6s ease-in-out infinite" : props.state === "completed" ? "0.6s ease-out" : ""};
    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

export function AgentStatusOrb() {
    const { rpcClient } = useRpcContext();
    const [status, setStatus] = useState<AgentRunStatus | null>(null);
    const statusRef = useRef<AgentRunStatus | null>(null);
    const [hovered, setHovered] = useState(false);
    const [anchor, setAnchor] = useState<Anchor>(loadAnchor);
    /** Orb top-left in px while dragging/snapping; null when docked at an anchor. */
    const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
    const [snapping, setSnapping] = useState(false);
    const dragStateRef = useRef<{ startX: number; startY: number; wasDrag: boolean } | null>(null);
    const snapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [inviteText, setInviteText] = useState("");
    const [inviteDismissed, setInviteDismissed] = useState(false);
    /** The current view opts out of the floating orb. */
    const [orbSuppressed, setOrbSuppressed] = useState(false);
    /** Mini chat overlay toggled by clicking the orb. */
    const [miniOpen, setMiniOpen] = useState(false);
    /** Contextual prompt handed to the mini chat once on open. */
    const miniPromptRef = useRef<MiniChatPrompt | undefined>(undefined);
    /** Forces a fresh mini instance when a diagram launches it while already open. */
    const [miniChatKey, setMiniChatKey] = useState(0);
    useEffect(() => {
        if (!rpcClient) {
            return;
        }
        syncOrbThemeFromSetting(rpcClient);
        return subscribeAgentRunStatus(rpcClient, setStatus);
    }, [rpcClient]);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        return subscribeMiniChatOpen((prompt) => {
            // If the full panel is already visible, update it in place. Otherwise
            // keep this interaction ambient and open the contextual mini chat.
            if (statusRef.current?.aiPanelOpen && rpcClient) {
                void rpcClient.getAiPanelRpcClient().openAIPanel(prompt);
                return;
            }
            miniPromptRef.current = prompt;
            setMiniChatKey((key) => key + 1);
            setMiniOpen(true);
        });
    }, [rpcClient]);

    useEffect(() => subscribeOrbSuppressed(setOrbSuppressed), []);

    useEffect(() => () => clearTimeout(snapTimerRef.current), []);

    // The orb hides without unmounting, so mini-chat state outlives it. Left alone,
    // `miniOpen` stays true and the mini resurfaces unprompted as soon as the orb
    // returns — the full panel closing, or navigating off a view that opts out.
    // A prompt queued by `subscribeMiniChatOpen` is discarded for the same reason:
    // MiniChat cannot mount while hidden, so it is never taken, only left to go stale.
    const orbHidden = !status || status.aiPanelOpen || orbSuppressed;
    useEffect(() => {
        if (orbHidden) {
            setMiniOpen(false);
            miniPromptRef.current = undefined;
        }
    }, [orbHidden]);

    // Resolve orb colors before any early return so the hook order stays stable
    // across renders (status is null while the orb is hidden).
    const colors = useOrbColors(status?.state ?? "idle");

    useAmbientCopilotPresence(!orbHidden);

    if (orbHidden) {
        return null;
    }

    const state = status.state;
    // Idle has nothing to report, so the tooltip falls back to the bare product name.
    const label = state === "idle" ? undefined : activeStateLabel(status);
    const dragging = dragPos !== null && !snapping;
    // Active states keep the pill visible the whole time. Idle shows the
    // invitation input; dismissing only collapses it into the orb — hovering
    // the orb expands it again, so it is never more than one hover away.
    // While the mini chat is open it replaces both.
    // Also gate on `snapping`: during the snap-to-anchor animation `dragging` is
    // intentionally false (so the CSS transition runs), but `anchor` isn't committed
    // until the snap timer fires — showing the invite/label meanwhile would open the
    // mini chat at the stale anchor. Keep them hidden until the orb settles.
    const showInvite = state === "idle" && !dragging && !snapping && !miniOpen && (!inviteDismissed || hovered);
    const showLabel = !dragging && !snapping && !showInvite && state !== "idle" && !miniOpen;

    // Typing into the invite starts the conversation in the mini chat — every
    // orb interaction stays in the ambient surface; the full panel is reached
    // via the mini's maximize button.
    const submitInvite = () => {
        const text = inviteText.trim();
        if (text) {
            miniPromptRef.current = createMiniChatPrompt(text, { autoSubmit: true });
        }
        setInviteText("");
        setMiniChatKey((key) => key + 1);
        setMiniOpen(true);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) {
            return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStateRef.current = { startX: event.clientX, startY: event.clientY, wasDrag: false };
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        const drag = dragStateRef.current;
        if (!drag) {
            return;
        }
        if (!drag.wasDrag) {
            const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
            if (moved < DRAG_THRESHOLD) {
                return;
            }
            drag.wasDrag = true;
            clearTimeout(snapTimerRef.current);
            setSnapping(false);
            // The mini chat is anchored to the orb's docked position — close it
            // while the orb is in motion.
            setMiniOpen(false);
        }
        setDragPos({ x: event.clientX - ORB_SIZE / 2, y: event.clientY - ORB_SIZE / 2 });
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
        const drag = dragStateRef.current;
        dragStateRef.current = null;
        if (!drag?.wasDrag) {
            return;
        }
        const target = nearestAnchor(event.clientX, event.clientY);
        // Animate to the anchor's px position, then hand over to anchor
        // positioning (offsets/percentages) so window resizes keep it pinned.
        setSnapping(true);
        setDragPos(anchorPosition(target));
        snapTimerRef.current = setTimeout(() => {
            setAnchor(target);
            try {
                localStorage.setItem(ANCHOR_STORAGE_KEY, target);
            } catch {
                // Storage may be unavailable/quota-restricted in the webview — the
                // anchor still updates; only cross-reload persistence is lost.
            }
            setDragPos(null);
            setSnapping(false);
        }, SNAP_ANIMATION_MS);
    };

    const handleClick = (event: React.MouseEvent) => {
        // Suppress the click that follows a drag; dragStateRef is already
        // cleared on pointerup, so only a stale wasDrag matters here.
        // Single click toggles the mini chat; double click opens the full panel,
        // so let the second click of a double fall through to onDoubleClick.
        if (dragPos !== null || event.detail >= 2) {
            return;
        }
        setMiniOpen((open) => !open);
    };

    const handleDoubleClick = () => {
        if (dragPos !== null || !rpcClient) {
            return;
        }
        setMiniOpen(false);
        rpcClient.getCommonRpcClient().executeCommand({ commands: [SHARED_COMMANDS.OPEN_AI_PANEL] });
    };

    // Keep the label pill on-screen and horizontally centered orbs balanced:
    // left edge → pill to the right; centers → pill stacked toward the middle.
    const flexDirection: "row" | "row-reverse" | "column" | "column-reverse" =
        dragPos !== null
            ? "row"
            : anchor.endsWith("left")
                ? "row-reverse"
                : anchor === "bottom-center"
                    ? "column"
                    : anchor === "top-center"
                        ? "column-reverse"
                        : "row";
    const wrapperStyle: React.CSSProperties = dragPos
        ? {
            left: dragPos.x,
            top: dragPos.y,
            transition: snapping ? `left ${SNAP_ANIMATION_MS}ms ease, top ${SNAP_ANIMATION_MS}ms ease` : "none",
        }
        : ANCHOR_CSS[anchor];

    return (
        <>
        {miniOpen && (
            <MiniChat
                key={miniChatKey}
                anchor={anchor}
                onClose={() => setMiniOpen(false)}
                takeInitialPrompt={() => {
                    const prompt = miniPromptRef.current;
                    miniPromptRef.current = undefined;
                    return prompt;
                }}
            />
        )}
        <Wrapper
            style={{ ...wrapperStyle, flexDirection }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {showInvite && (
                <InviteBox>
                    <InviteInput
                        value={inviteText}
                        onChange={(event) => setInviteText(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                submitInvite();
                            }
                        }}
                        placeholder="How can I help?"
                        aria-label="Message WSO2 Integration Intelligence"
                    />
                    <InviteDismiss title="Hide" aria-label="Hide the WSO2 Integration Intelligence prompt" onClick={() => setInviteDismissed(true)}>
                        ✕
                    </InviteDismiss>
                </InviteBox>
            )}
            {showLabel && label && <LabelPill onClick={() => setMiniOpen(true)}>{label}</LabelPill>}
            <OrbButton
                state={state}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                title={label ? `WSO2 Integration Intelligence — ${label}` : "WSO2 Integration Intelligence"}
                aria-label={label ? `WSO2 Integration Intelligence: ${label}. Click to open the mini chat, double-click for the chat panel.` : "Click to open the WSO2 Integration Intelligence mini chat, double-click for the chat panel"}
            >
                <CopilotOrb state={state} colors={colors} size={ORB_SIZE} />
            </OrbButton>
        </Wrapper>
        </>
    );
}
