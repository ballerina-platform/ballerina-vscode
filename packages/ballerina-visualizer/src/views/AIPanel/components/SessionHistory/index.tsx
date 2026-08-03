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
import { ThreadSummary } from "@wso2/ballerina-core";
import { Codicon } from "@wso2/ui-toolkit";
import { DangerActionButton, SecondaryActionButton } from "../../styles";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 7;
const GROUP_ORDER = ["TODAY", "YESTERDAY", "PAST WEEK", "OLDER"] as const;

type GroupLabelText = typeof GROUP_ORDER[number];

function startOfDay(ts: number): number {
    const date = new Date(ts);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

/**
 * Whole calendar days between two instants. Both the row label and the group heading derive from
 * this, so they can never disagree the way elapsed-time and calendar-day views of "yesterday" did.
 * Rounded because a DST boundary makes a local day 23 or 25 hours long.
 */
function calendarDaysAgo(ts: number, now: number): number {
    return Math.round((startOfDay(now) - startOfDay(ts)) / MS_PER_DAY);
}

function formatRelativeTime(ts: number, now: number): string {
    const daysAgo = calendarDaysAgo(ts, now);
    if (daysAgo <= 0) {
        const diffMin = Math.floor((now - ts) / 60_000);
        if (diffMin < 1) { return "Just now"; }
        if (diffMin < 60) { return `${diffMin}m`; }
        return `${Math.floor(diffMin / 60)}h`;
    }
    if (daysAgo < RECENT_WINDOW_DAYS) { return `${daysAgo}d`; }
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupLabelFor(ts: number, now: number): GroupLabelText {
    const daysAgo = calendarDaysAgo(ts, now);
    if (daysAgo <= 0) { return "TODAY"; }
    if (daysAgo === 1) { return "YESTERDAY"; }
    return daysAgo < RECENT_WINDOW_DAYS ? "PAST WEEK" : "OLDER";
}

function promptCountLabel(turnCount: number): string | undefined {
    if (turnCount === 0) { return undefined; }
    return `${turnCount} prompt${turnCount === 1 ? "" : "s"}`;
}

function formatMeta(thread: ThreadSummary, now: number): string {
    const time = formatRelativeTime(thread.updatedAt, now);
    return thread.turnCount > 0 ? `${thread.turnCount} · ${time}` : time;
}

function groupByDate(threads: ThreadSummary[], now: number): { label: string; items: ThreadSummary[] }[] {
    const groups: Record<GroupLabelText, ThreadSummary[]> = {
        TODAY: [], YESTERDAY: [], "PAST WEEK": [], OLDER: [],
    };
    for (const thread of threads) {
        groups[groupLabelFor(thread.updatedAt, now)].push(thread);
    }
    return GROUP_ORDER
        .filter(label => groups[label].length > 0)
        .map(label => ({ label, items: groups[label] }));
}

// ── Styled components ─────────────────────────────────────────────────────────

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 999;
`;

const DropdownContainer = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: 300px;
    max-height: 420px;
    background: var(--vscode-editorHoverWidget-background);
    border: 1px solid var(--vscode-editorHoverWidget-border);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    color: var(--vscode-editorHoverWidget-foreground);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 1000;
    font-size: 12px;
    font-family: var(--vscode-font-family);
`;

const SearchRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    flex-shrink: 0;
`;

const SearchInput = styled.input`
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--vscode-foreground);
    font-size: 12px;
    font-family: var(--vscode-font-family);
    &::placeholder { color: var(--vscode-descriptionForeground); }
`;

const SessionList = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 4px;
`;

const GroupLabel = styled.div`
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    padding: 6px 4px 2px;
`;

const EmptyState = styled.div`
    padding: 16px 8px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
`;

const LoadingState = styled(EmptyState)`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;

    .codicon-modifier-spin {
        animation: codicon-spin 1.2s steps(30) infinite;
    }
    @keyframes codicon-spin {
        100% { transform: rotate(360deg); }
    }
`;

const ErrorState = styled(EmptyState)`
    color: var(--vscode-errorForeground);
`;

const SessionItem = styled.div<{ isActive: boolean; isReadOnly: boolean }>(
    ({ isActive, isReadOnly }: { isActive: boolean; isReadOnly: boolean }) => ({
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px",
        borderRadius: "3px",
        cursor: isReadOnly ? "default" : "pointer",
        position: "relative" as const,
        background: isActive ? "var(--vscode-list-activeSelectionBackground)" : "transparent",
        color: isActive ? "var(--vscode-list-activeSelectionForeground)" : "inherit",
        outline: "none",
        "&:hover": {
            background: isActive
                ? "var(--vscode-list-activeSelectionBackground)"
                : isReadOnly ? "transparent" : "var(--vscode-list-hoverBackground)",
        },
        "&:hover .row-actions, &:focus-within .row-actions": { opacity: 1 },
        "&:focus-visible": { outline: "1px solid var(--vscode-focusBorder)" },
    })
);

const ActionButton = SecondaryActionButton;
const DeleteButton = DangerActionButton;

const ConfirmRow = styled.div`
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
`;

const ConfirmText = styled.span`
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    strong { font-weight: 600; }
`;

const Spacer = styled.div`
    flex: 1;
`;

const ReadOnlyHint = styled.div`
    padding: 6px 8px;
    border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    text-align: center;
    flex-shrink: 0;
`;

// Selected rows sit on list-activeSelectionBackground, which is a saturated accent in many themes.
// Anything on that row has to follow the row's own resolved foreground, or it disappears into it.
const ActiveDot = styled.div<{ isActive: boolean }>(({ isActive }: { isActive: boolean }) => ({
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: isActive ? "currentColor" : "var(--vscode-descriptionForeground)",
    flexShrink: 0,
    opacity: isActive ? 1 : 0.5,
}));

const SessionName = styled.span`
    flex: 1;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const SessionMeta = styled.span<{ isActive: boolean }>(({ isActive }: { isActive: boolean }) => ({
    fontSize: "10px",
    color: isActive ? "inherit" : "var(--vscode-descriptionForeground)",
    opacity: isActive ? 0.85 : 1,
    flexShrink: 0,
}));

const RenameInput = styled.input`
    flex: 1;
    min-width: 0;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-focusBorder);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    outline: none;
`;

const RowActions = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.1s;
`;

const RowIconButton = styled.button<{ isDanger?: boolean }>(({ isDanger }: { isDanger?: boolean }) => ({
    width: "20px",
    height: "20px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 0,
    color: "inherit",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "3px",
    flexShrink: 0,
    "&:hover, &:focus-visible": {
        color: isDanger ? "var(--vscode-errorForeground)" : "inherit",
        background: "var(--vscode-toolbar-hoverBackground)",
    },
}));

const NewChatRow = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: none;
    border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    background: transparent;
    color: inherit;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    width: 100%;
    text-align: left;
    flex-shrink: 0;
    &:hover { background: var(--vscode-list-hoverBackground); }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export interface SessionHistoryDropdownProps {
    threads: ThreadSummary[];
    loading?: boolean;
    error?: string | null;
    readOnly?: boolean;
    onNewChat: () => void;
    onSwitch: (threadId: string) => void;
    onDelete: (threadId: string) => void;
    onRename: (threadId: string, name: string) => void;
    onClose: () => void;
}

export function SessionHistoryDropdown({
    threads,
    loading = false,
    error = null,
    readOnly = false,
    onNewChat,
    onSwitch,
    onDelete,
    onRename,
    onClose,
}: SessionHistoryDropdownProps): JSX.Element {
    const [search, setSearch] = useState("");
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [renaming, setRenaming] = useState<{ threadId: string; name: string } | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const inputRef = useRef<HTMLInputElement>(null);
    // Enter, Escape and blur can all reach the rename handlers for the same edit.
    const renameSettledRef = useRef(false);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') { return; }
            if (confirmDelete) { setConfirmDelete(null); } else if (renaming) { cancelRename(); } else { onClose(); }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose, confirmDelete, renaming]);

    const filtered = search.trim()
        ? threads.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
        : threads;

    const groups = groupByDate(filtered, now);

    const handleSwitch = (threadId: string) => {
        if (readOnly) { return; }
        onSwitch(threadId);
        onClose();
    };

    const handleDelete = (threadId: string) => {
        try {
            onDelete(threadId);
        } finally {
            setConfirmDelete(null);
        }
    };

    const handleNewChat = () => {
        if (readOnly) { return; }
        onNewChat();
        onClose();
    };

    const startRename = (threadId: string, name: string) => {
        renameSettledRef.current = false;
        setRenaming({ threadId, name });
    };

    const cancelRename = () => {
        renameSettledRef.current = true;
        setRenaming(null);
    };

    const commitRename = () => {
        if (!renaming || renameSettledRef.current) { return; }
        renameSettledRef.current = true;
        const { threadId, name } = renaming;
        setRenaming(null);
        const current = threads.find(t => t.id === threadId)?.name;
        if (name.trim() && name.trim() === current?.trim()) { return; }
        onRename(threadId, name);
    };

    return (
        <>
            <Overlay onClick={onClose} />
            <DropdownContainer onClick={e => e.stopPropagation()}>
                <SearchRow>
                    <Codicon name="search" sx={{ fontSize: "13px", color: "var(--vscode-descriptionForeground)", flexShrink: 0 }} />
                    <SearchInput
                        ref={inputRef}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search sessions..."
                    />
                </SearchRow>

                <SessionList>
                    {error && <ErrorState>{error}</ErrorState>}
                    {/* Only when there is nothing to show yet — a refresh must not blank the list. */}
                    {loading && threads.length === 0 && !error && (
                        <LoadingState>
                            <span className="codicon codicon-loading codicon-modifier-spin" />
                            Loading sessions...
                        </LoadingState>
                    )}
                    {!loading && !error && groups.length === 0 && (
                        <EmptyState>{search.trim() ? "No matching sessions" : "No sessions yet"}</EmptyState>
                    )}
                    {groups.map(group => (
                        <div key={group.label}>
                            <GroupLabel>{group.label}</GroupLabel>
                            {group.items.map(thread => {
                                const isConfirming = confirmDelete === thread.id;
                                const isRenaming = renaming?.threadId === thread.id;
                                const isBusy = isConfirming || isRenaming;
                                return (
                                    <SessionItem
                                        key={thread.id}
                                        // Selection background would wreck the action buttons' contrast.
                                        isActive={thread.isActive && !isConfirming}
                                        isReadOnly={readOnly || isBusy}
                                        role="button"
                                        tabIndex={readOnly || isBusy ? -1 : 0}
                                        aria-disabled={readOnly}
                                        onClick={() => { if (!isBusy) { handleSwitch(thread.id); } }}
                                        onKeyDown={(e) => {
                                            if (isBusy) { return; }
                                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSwitch(thread.id); }
                                        }}
                                    >
                                        {isConfirming ? (
                                            <ConfirmRow>
                                                <ConfirmText>Delete <strong>{thread.name}</strong>?</ConfirmText>
                                                <Spacer />
                                                <DeleteButton type="button" onClick={() => handleDelete(thread.id)}>Yes, delete</DeleteButton>
                                                <ActionButton type="button" onClick={() => setConfirmDelete(null)}>Cancel</ActionButton>
                                            </ConfirmRow>
                                        ) : (
                                            <>
                                                <ActiveDot isActive={thread.isActive} />
                                                {isRenaming ? (
                                                    <RenameInput
                                                        autoFocus
                                                        value={renaming.name}
                                                        onChange={e => setRenaming({ threadId: thread.id, name: e.target.value })}
                                                        onBlur={commitRename}
                                                        onClick={e => e.stopPropagation()}
                                                        onKeyDown={e => {
                                                            e.stopPropagation();
                                                            if (e.key === 'Enter') { commitRename(); }
                                                            if (e.key === 'Escape') { cancelRename(); }
                                                        }}
                                                    />
                                                ) : (
                                                    <SessionName title={thread.name}>{thread.name}</SessionName>
                                                )}
                                                <SessionMeta
                                                    isActive={thread.isActive}
                                                    title={promptCountLabel(thread.turnCount)}
                                                >
                                                    {formatMeta(thread, now)}
                                                </SessionMeta>
                                                {!readOnly && !isRenaming && (
                                                    <RowActions className="row-actions">
                                                        <RowIconButton
                                                            onClick={e => { e.stopPropagation(); startRename(thread.id, thread.name); }}
                                                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); } }}
                                                            title="Rename session"
                                                        >
                                                            <Codicon name="edit" sx={{ fontSize: "12px" }} />
                                                        </RowIconButton>
                                                        <RowIconButton
                                                            isDanger
                                                            onClick={e => { e.stopPropagation(); setConfirmDelete(thread.id); }}
                                                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); } }}
                                                            title="Delete session"
                                                        >
                                                            <Codicon name="trash" sx={{ fontSize: "12px" }} />
                                                        </RowIconButton>
                                                    </RowActions>
                                                )}
                                            </>
                                        )}
                                    </SessionItem>
                                );
                            })}
                        </div>
                    ))}
                </SessionList>

                {readOnly ? (
                    <ReadOnlyHint>Finish or stop the current response to switch sessions.</ReadOnlyHint>
                ) : (
                    <NewChatRow onClick={handleNewChat}>
                        <Codicon name="add" sx={{ fontSize: "13px" }} />
                        New Chat
                    </NewChatRow>
                )}
            </DropdownContainer>
        </>
    );
}
