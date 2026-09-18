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

import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { AIPanelView, ThreadSummary } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { openCopilotPanelAt, openCopilotThread } from "../AgentStatusOrb/copilotPanel";

const RECENT_THREAD_LIMIT = 5;
/** Roughly a full thread list; below this the menu would be clipped, so it flips up instead. */
const MENU_CLEARANCE = 220;

/** A surface the menu can jump to. Adding one here is the whole change. */
interface SurfaceEntry {
    id: AIPanelView;
    label: string;
    icon: string;
}

const SURFACES: SurfaceEntry[] = [{ id: "settings", label: "Settings", icon: "settings-gear" }];

type MenuLevel = "root" | "chats";

const Root = styled.div`
    position: relative;
    display: flex;
`;

const TriggerButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background-color: transparent;
    color: var(--vscode-icon-foreground);
    cursor: pointer;
    font-size: 16px;
    transition: background-color 0.2s;

    &:hover,
    &:focus-visible {
        background-color: var(--vscode-toolbar-hoverBackground);
    }
`;

const Surface = styled.div<{ $dropUp: boolean }>`
    position: absolute;
    ${(props: { $dropUp: boolean }) => (props.$dropUp ? "bottom: calc(100% + 6px);" : "top: calc(100% + 6px);")}
    left: 0;
    z-index: 10;
    // Hugs its items; the cap only bites on long thread names, which then ellipsize.
    width: max-content;
    min-width: 132px;
    max-width: 260px;
    padding: 4px;
    border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border));
    border-radius: 6px;
    background-color: var(--vscode-editorWidget-background);
    box-shadow: 0 4px 14px var(--vscode-widget-shadow, transparent);
`;

const Row = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: 12px;
    text-align: left;
    cursor: pointer;

    &:hover,
    &:focus-visible {
        background-color: var(--vscode-list-hoverBackground);
    }
`;

const RowLabel = styled.span`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const Note = styled.div`
    padding: 6px 8px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

/**
 * Entry points into the Copilot panel, kept out of the surfaces that host it so the overview,
 * the mini chat and anything later can share one menu.
 */
export function CopilotMenu({ icon = "ellipsis" }: { icon?: string } = {}) {
    const { rpcClient } = useRpcContext();
    const [open, setOpen] = useState(false);
    const [level, setLevel] = useState<MenuLevel>("root");
    const [threads, setThreads] = useState<ThreadSummary[] | undefined>(undefined);
    const [threadsFailed, setThreadsFailed] = useState(false);
    // Opening upward would cover the prompt box directly above; only do it with no room below.
    const [dropUp, setDropUp] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    // Re-read on every open: the composer outlives the menu, so a chat started elsewhere would
    // otherwise never appear, and one failed call would read as "no chats" for good.
    useEffect(() => {
        if (!open) {
            return;
        }
        if (!rpcClient) {
            setThreadsFailed(true);
            return;
        }
        let cancelled = false;
        setThreadsFailed(false);
        rpcClient
            .getAiPanelRpcClient()
            .listThreads()
            .then((list) => {
                if (!cancelled) {
                    setThreads(list);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setThreadsFailed(true);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [open, rpcClient]);

    const rows = () => Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);

    // role="menu" promises arrow-key navigation to assistive tech; Tab alone does not satisfy it.
    const onMenuKeyDown = (event: React.KeyboardEvent) => {
        const all = rows();
        if (all.length === 0) {
            return;
        }
        const current = all.indexOf(document.activeElement as HTMLButtonElement);
        const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
        if (step !== 0) {
            event.preventDefault();
            const next = (current + step + all.length) % all.length;
            all[next].focus();
            return;
        }
        if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            (event.key === "Home" ? all[0] : all[all.length - 1]).focus();
        }
    };

    const close = () => {
        setOpen(false);
        triggerRef.current?.focus();
    };

    /** The menu is clipped by the nearest scrolling ancestor, which need not reach the window edge. */
    const spaceBelow = () => {
        const root = rootRef.current;
        if (!root) {
            return window.innerHeight;
        }
        let node = root.parentElement;
        while (node) {
            const overflow = getComputedStyle(node).overflowY;
            if (overflow === "auto" || overflow === "scroll") {
                return node.getBoundingClientRect().bottom - root.getBoundingClientRect().bottom;
            }
            node = node.parentElement;
        }
        return window.innerHeight - root.getBoundingClientRect().bottom;
    };

    const toggle = () => {
        const below = spaceBelow();
        setDropUp(below < MENU_CLEARANCE);
        setLevel("root");
        setOpen((wasOpen) => !wasOpen);
    };

    useEffect(() => {
        if (open) {
            rows()[0]?.focus();
        }
    }, [open, level]);

    const recent = (threads ?? []).slice(0, RECENT_THREAD_LIMIT);

    return (
        <Root ref={rootRef}>
            <TriggerButton
                ref={triggerRef}
                type="button"
                data-testid={`copilot-menu-trigger-${icon}`}
                title="More actions"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={toggle}
            >
                <span className={`codicon codicon-${icon}`} />
            </TriggerButton>

            {open && (
                <Surface
                    role="menu"
                    aria-label="More actions"
                    data-testid="copilot-menu"
                    $dropUp={dropUp}
                    onKeyDown={onMenuKeyDown}
                >
                    {level === "root" ? (
                        <>
                            <Row type="button" role="menuitem" onClick={() => setLevel("chats")}>
                                <span className="codicon codicon-comment-discussion" />
                                <RowLabel>Chats</RowLabel>
                                <span className="codicon codicon-chevron-right" />
                            </Row>
                            {SURFACES.map((surface) => (
                                <Row
                                    key={surface.id}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        close();
                                        openCopilotPanelAt(rpcClient, surface.id);
                                    }}
                                >
                                    <span className={`codicon codicon-${surface.icon}`} />
                                    <RowLabel>{surface.label}</RowLabel>
                                </Row>
                            ))}
                        </>
                    ) : (
                        <>
                            <Row type="button" role="menuitem" aria-label="Back" onClick={() => setLevel("root")}>
                                <span className="codicon codicon-arrow-left" />
                                <RowLabel>Chats</RowLabel>
                            </Row>
                            {threadsFailed && <Note>Couldn't load chats</Note>}
                            {!threadsFailed && threads === undefined && <Note>Loading…</Note>}
                            {!threadsFailed && threads?.length === 0 && <Note>No chats yet</Note>}
                            {recent.map((thread) => (
                                <Row
                                    key={thread.id}
                                    type="button"
                                    role="menuitem"
                                    title={thread.name}
                                    onClick={() => {
                                        close();
                                        openCopilotThread(rpcClient, thread.id);
                                    }}
                                >
                                    <span className="codicon codicon-comment" />
                                    <RowLabel>{thread.name}</RowLabel>
                                </Row>
                            ))}
                        </>
                    )}
                </Surface>
            )}
        </Root>
    );
}
