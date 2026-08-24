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
import { AgentRunStatus, ChatNotify, GetRunStatusResponse, UIChatMessage } from "@wso2/ballerina-core";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import MarkdownRenderer from "../../views/AIPanel/components/MarkdownRenderer";
import CodeContextCard from "../../views/AIPanel/components/CodeContextCard";
import { StreamItem } from "../../views/AIPanel/components/AgentStreamView/types";
import {
    serializeStream,
    parseStream,
    appendToLastEntry,
    upsertComponent,
    upsertRequestCard,
    buildRequestCardData,
    buildPlanItem,
    applyPlanApprovalResolution,
    appendAbortMarker,
    applyTaskWriteResult,
    COMPACTION_DISABLED_NOTICE,
} from "../../views/AIPanel/components/AIChat/utils/streamSerialization";
import {
    Anchor,
    EDGE_MARGIN,
    ORB_SIZE,
    subscribeAgentRunStatus,
    subscribeCopilotChatNotify,
} from "./shared";
import {
    buildFullChatHandoffPrompt,
    buildMiniChatGenerationRequest,
    createMiniChatPrompt,
    MiniChatPrompt,
} from "./promptHandoff";

/**
 * Minimized Copilot chat — a compact overlay opened by clicking the floating
 * orb, so a quick question or a glance at a background run doesn't require
 * the full AI panel. Handles the happy path only (streaming text, tool-call
 * rows, follow-up input); anything interactive (clarify, plan approval,
 * config, web tools) escalates to the full panel via the amber banner.
 *
 * The persisted chat store is the ground truth, shared with the full panel:
 * on open the mini loads the active thread via `getChatMessages()` (same RPC,
 * same thread the panel shows) and renders its `<agentstream>` transcript, so
 * the two surfaces are always in sync. The in-flight turn streams live on top
 * via `onCopilotChatNotify` (mirrored by the extension while the AI panel is
 * closed), and the mini persists it back on `save_chat` — using the same
 * serialized format — so a run witnessed only by the mini still lands in the
 * store authoritatively. It therefore replays the run buffer only when a turn
 * is either still running or finished-but-not-yet-persisted; a turn already in
 * the store is taken from history, never re-replayed.
 */

const PANEL_WIDTH = 390;

/**
 * A chat turn in the same shape the store round-trips: user prompts, and
 * assistant turns whose `content` embeds the `<agentstream>` timeline. This is
 * exactly the store's own `getChatMessages()` return type, so both surfaces
 * render/persist identically.
 */
type MiniMsg = Pick<UIChatMessage, "role" | "content" | "messageId">;

/** Transient, non-persisted status appended after the transcript (stop/error/review). */
type MiniTail =
    | { kind: "notice" | "error"; text: string }
    | { kind: "review"; text: string };

/**
 * `ChatNotify` types that carry no persisted transcript content, so `applyEvent`
 * is correct to ignore them (they drive panel-local UI state — metrics widgets,
 * diagnostics refs, banners — none of which the mini owns).
 *
 * Enumerated rather than swallowed by a bare `default` so that adding a variant to
 * `ChatNotify` breaks the build here, forcing a decision. That guard matters
 * because this component AUTHORS the persisted transcript: an event the panel
 * folds into `content` but the mini ignores is data the store silently loses —
 * which is exactly how the review chip went missing.
 *
 * The panel has the mirror-image guard (`PanelUnmodelledNotifyType` in
 * `AIPanel/components/AIChat/index.tsx`). The two lists are NOT meant to match — the
 * panel models strictly more events, so its residual is smaller — hence the distinct
 * names. Same coverage boundary applies to both: see the ⚠️ on `migration_progress`.
 *
 * Most of these have an explicit branch in the panel's `handleChatNotify` that only
 * touches local UI state (`usage_metrics`, `diagnostics`, `messages`,
 * `intermediary_state`, `generated_sources`, `compaction_start`/`compaction_end`,
 * `config_change`, and `web_tool_approval_request`, which is banner-only there too).
 * Three are safe for a different reason, worth knowing before relying on this list:
 *  - `evals_tool_result` never reaches any webview — `features/ai/utils/events.ts`
 *    drops it before dispatch.
 *  - `plan_updated` is declared but never emitted anywhere.
 *  - `migration_progress` belongs to the migration wizard's own webview, not this
 *    chat stream. ⚠️ If migration is ever folded into the main chat, this one could
 *    start mutating persisted content in the panel — and the tripwire will NOT catch
 *    that, since it only fires on newly added `ChatNotify` variants.
 *  - `generation_status` reports a generation's review status, which the mini chat
 *    never renders — it has no revert affordance. The panel reads it off the message
 *    rather than the transcript, so ignoring it here loses nothing.
 */
/**
 * The events whose content `applyContentEvent` folds into the transcript. Naming the
 * set explicitly (rather than accepting any `ChatNotify`) is what lets that function
 * end in a `never` check — see the tripwire at its tail.
 */
type FoldableNotify = Extract<ChatNotify, {
    type:
    | "content_block" | "content_replace" | "tool_call" | "tool_result" | "chat_component"
    | "task_approval_request" | "plan_approval_resolved" | "connector_generation_notification"
    | "configuration_collection_event" | "clarify_event" | "skill_enable_event"
    | "abort" | "compaction_disabled";
}>;

type UnmodelledNotifyType =
    | "intermediary_state"
    | "diagnostics"
    | "messages"
    | "evals_tool_result"
    | "usage_metrics"
    | "generated_sources"
    | "plan_updated"
    | "web_tool_approval_request"
    | "compaction_start"
    | "compaction_end"
    | "config_change"
    | "migration_progress"
    | "followup_suggestions"
    | "generation_status";

/** Friendly one-line label for a tool call (mirrors the status-bar phrasing). */
function describeTool(toolName: string, toolInput: any): string {
    // The file tools emit `toolInput: { fileName }` (emitFileToolCall, host-side
    // agent/tools/text-editor.ts). `file_path` is the raw-Zod-input spelling carried by
    // pass-through tools; `filePath` matches neither emitter and is kept only as a
    // belt-and-braces fallback. Miss `fileName` and every file row reads "Editing files".
    const rawPath = toolInput?.fileName ?? toolInput?.file_path ?? toolInput?.filePath;
    const file = typeof rawPath === "string" ? rawPath.split(/[\\/]/).pop() : undefined;
    switch (toolName) {
        case "file_write":
        case "file_edit":
        case "file_batch_edit":
            return file ? `Editing ${file}` : "Editing files";
        case "file_read":
            return file ? `Reading ${file}` : "Reading files";
        case "getCompilationErrors":
            return "Checking for compilation errors";
        case "runTests":
            return "Running tests";
        case "runBallerinaPackage":
            return "Running the integration";
        case "TaskWrite":
            return "Updating the plan";
        case "Clarify":
            return "Asking a question";
        case "ConfigCollector":
            return "Managing configuration";
        case "LibrarySearchTool":
        case "LibraryGetTool":
            return "Looking up libraries";
        case "web_search":
            return "Searching the web";
        case "web_fetch":
            return "Fetching a web page";
        default:
            if (toolName.startsWith("mcp__")) {
                const parts = toolName.split("__");
                return `Calling ${parts[2] ?? toolName}`;
            }
            return toolName;
    }
}

/**
 * Locate (or create) the assistant bubble for the current turn. Reuses the
 * trailing assistant message only when it belongs to this turn — after the
 * last user message and matching `genId` (or not yet id'd) — otherwise starts
 * a fresh bubble, so a new/replayed turn's events never merge into a previous
 * turn. Mirrors the full panel's `ensureAssistantMessage`. Mutates `list`.
 */
function ensureAssistantIdx(list: MiniMsg[], genId?: string): number {
    let assistantIdx = -1;
    let userIdx = -1;
    for (let i = list.length - 1; i >= 0; i--) {
        if (assistantIdx === -1 && list[i].role === "assistant") { assistantIdx = i; }
        if (userIdx === -1 && list[i].role === "user") { userIdx = i; }
    }
    if (assistantIdx !== -1 && assistantIdx > userIdx &&
        (list[assistantIdx].messageId === genId || list[assistantIdx].messageId === undefined)) {
        if (!list[assistantIdx].messageId && genId) {
            list[assistantIdx] = { ...list[assistantIdx], messageId: genId };
        }
        return assistantIdx;
    }
    list.push({ role: "assistant", content: "", messageId: genId });
    return list.length - 1;
}

/**
 * Fold a stream event into an assistant turn's serialized content, byte-compatible
 * with the full panel: text merges into the trailing text item, `tool_result`
 * replaces its matching `tool_call`, and components / request-driven cards go
 * through the shared upserts in `streamSerialization`.
 *
 * This models **everything the panel persists**, not just what the mini renders —
 * `renderTranscript` shows nothing for cards, yet they are recorded anyway. The
 * mini's `save_chat` write is authoritative for the store, and once the *final*
 * write for a finished run lands the run-event buffer that could rebuild the turn is
 * dropped, so an item missing from it is gone for good. (Mid-run per-step saves do
 * not clear the buffer — it survives until the execution is no longer active.) The
 * review chip is the sharpest case: the full panel renders it (and thus the entire
 * diff view) *only* from a persisted `componentType: "review"` item.
 */
function applyContentEvent(prevContent: string, evt: FoldableNotify): string {
    const entries = parseStream(prevContent);
    if (evt.type === "content_block" || evt.type === "content_replace") {
        const text = (evt as any).content as string;
        if (entries.length > 0) {
            const lastEntry = entries[entries.length - 1];
            const lastItem = lastEntry.items[lastEntry.items.length - 1];
            if (lastItem?.kind === "text") {
                const mergedText = evt.type === "content_block" ? lastItem.text + text : text;
                const items = [...lastEntry.items.slice(0, -1), { ...lastItem, text: mergedText }];
                return serializeStream([...entries.slice(0, -1), { ...lastEntry, items }], prevContent);
            }
        }
        return serializeStream(appendToLastEntry(entries, { kind: "text", text }), prevContent);
    }
    if (evt.type === "tool_call") {
        const item: StreamItem = {
            kind: "tool_call", toolCallId: evt.toolCallId, toolName: evt.toolName, toolInput: evt.toolInput,
        };
        return serializeStream(appendToLastEntry(entries, item), prevContent);
    }
    if (evt.type === "tool_result") {
        if (evt.toolName === "TaskWrite") {
            // TaskWrite segments the transcript into named task entries instead of
            // resolving its tool_call — running it through the generic path below
            // would both lose the task rail and wrongly resolve the item.
            return serializeStream(applyTaskWriteResult(entries, evt.toolOutput?.tasks ?? []), prevContent);
        }
        const resultItem: StreamItem = {
            kind: "tool_result", toolCallId: evt.toolCallId, toolName: evt.toolName,
            toolOutput: evt.toolOutput, failed: evt.failed,
        };
        let matched = false;
        const updated = entries.map((entry) => {
            if (matched) { return entry; }
            const idx = entry.items.findIndex((i) => i.kind === "tool_call" && i.toolCallId === evt.toolCallId);
            if (idx === -1) { return entry; }
            matched = true;
            return { ...entry, items: entry.items.map((item, i) => (i === idx ? resultItem : item)) };
        });
        return serializeStream(matched ? updated : appendToLastEntry(entries, resultItem), prevContent);
    }
    if (evt.type === "chat_component") {
        return serializeStream(upsertComponent(entries, evt.componentType, evt.id, evt.data), prevContent);
    }
    if (evt.type === "task_approval_request") {
        // Only the "plan" flavour has a transcript item; "completion" is banner-only.
        if (evt.approvalType !== "plan") { return prevContent; }
        const item = buildPlanItem(evt.requestId, evt.tasks, evt.message, evt.autoApproved);
        return serializeStream(appendToLastEntry(entries, item), prevContent);
    }
    if (evt.type === "plan_approval_resolved") {
        return serializeStream(
            applyPlanApprovalResolution(entries, evt.requestId, evt.approved, evt.comment),
            prevContent
        );
    }
    if (evt.type === "connector_generation_notification") {
        return serializeStream(upsertRequestCard(entries, "connector", buildRequestCardData("connector", evt)), prevContent);
    }
    if (evt.type === "configuration_collection_event") {
        return serializeStream(upsertRequestCard(entries, "config", buildRequestCardData("config", evt)), prevContent);
    }
    if (evt.type === "clarify_event") {
        return serializeStream(upsertRequestCard(entries, "ask", buildRequestCardData("ask", evt)), prevContent);
    }
    if (evt.type === "skill_enable_event") {
        return serializeStream(upsertRequestCard(entries, "skill_enable", buildRequestCardData("skill_enable", evt)), prevContent);
    }
    if (evt.type === "abort") {
        return serializeStream(appendAbortMarker(entries), prevContent);
    }
    if (evt.type === "compaction_disabled") {
        // Raw-content append (outside the blob), matching the panel.
        return prevContent + COMPACTION_DISABLED_NOTICE;
    }
    // Second tripwire, guarding the OTHER direction from the one in `applyEvent`.
    // Routing and folding live in two separate dispatch tables, so adding a case to
    // `applyEvent` without a branch here would compile cleanly and silently drop the
    // event — the very bug this file exists to prevent, reintroduced one table over.
    // `evt` is typed to exactly the foldable set and every branch above returns, so
    // anything unhandled shows up here.
    //
    // The expected residual is `ChatContent`, not `never`: it declares BOTH content
    // literals on one interface, so discriminant narrowing can't eliminate it even
    // though both are handled. Asserting that exact residual still fails the build if
    // a new type joins `FoldableNotify` without a branch, which is the point.
    const unfolded: Extract<FoldableNotify, { type: "content_block" | "content_replace" }> = evt;
    void unfolded;
    return prevContent;
}

/** Apply a content-bearing event to the message list, targeting the current turn. */
function reduceEvent(msgs: MiniMsg[], evt: FoldableNotify, genId?: string): MiniMsg[] {
    const list = [...msgs];
    const idx = ensureAssistantIdx(list, genId);
    list[idx] = { ...list[idx], content: applyContentEvent(list[idx].content, evt) };
    return list;
}

function panelPosition(anchor: Anchor): React.CSSProperties {
    // Clear the orb (which sits at EDGE_MARGIN) plus a small gap. Built from
    // literals — property assignment on CSSProperties trips ts-loader here.
    const clearance = EDGE_MARGIN + ORB_SIZE + 14;
    const vertical = anchor.startsWith("bottom") ? { bottom: clearance } : { top: clearance };
    const horizontal = anchor.endsWith("left")
        ? { left: EDGE_MARGIN }
        : anchor.endsWith("right")
            ? { right: EDGE_MARGIN }
            : { left: "50%", transform: "translateX(-50%)" };
    return { ...vertical, ...horizontal };
}

const slideIn = keyframes`
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
`;

const Panel = styled.div`
    position: fixed;
    /* One above the orb, still below panels/modals so an open panel takes priority. */
    z-index: 1801;
    width: ${PANEL_WIDTH}px;
    max-width: calc(100vw - ${EDGE_MARGIN * 2}px);
    height: min(520px, calc(100vh - 150px));
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border, var(--vscode-dropdown-border));
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
    overflow: hidden;
    animation: ${slideIn} 0.18s ease-out;
    font-family: var(--vscode-font-family);
    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--vscode-editorWidget-border, var(--vscode-dropdown-border));
    flex: none;
`;

const HeaderTitle = styled.div`
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const HeaderButton = styled.button`
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    &:hover {
        color: var(--vscode-foreground);
        background: var(--vscode-toolbar-hoverBackground);
    }
`;

const Body = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
`;

const EmptyState = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--vscode-descriptionForeground);
    text-align: center;
    padding: 0 24px;
`;

const UserBubble = styled.div`
    align-self: flex-end;
    max-width: 85%;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 10px;
    padding: 6px 10px;
    color: var(--vscode-input-foreground);
    white-space: pre-wrap;
    overflow-wrap: break-word;
`;

const TextItem = styled.div`
    max-width: 100%;
    overflow-wrap: break-word;
    /* Keep the reused panel renderer compact inside the mini. */
    font-size: 13px;
    p:first-of-type {
        margin-top: 0;
    }
    p:last-of-type {
        margin-bottom: 0;
    }
    pre {
        overflow-x: auto;
    }
`;

const ToolRow = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

const SpinIcon = styled.span`
    display: inline-flex;
    animation: ${spin} 1.2s linear infinite;
    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

const Notice = styled.div`
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    font-style: italic;
`;

const ReviewNotice = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    color: var(--vscode-foreground);
    background: color-mix(in srgb, var(--vscode-charts-green) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--vscode-charts-green) 35%, var(--vscode-panel-border));
    border-radius: 8px;
    font-size: 12px;
`;

const ReviewNoticeText = styled.span`
    flex: 1;
    min-width: 0;
`;

const ReviewButton = styled.button`
    flex: none;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 6px;
    padding: 4px 10px;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    cursor: pointer;
    white-space: nowrap;

    &:hover {
        background: var(--vscode-button-hoverBackground);
    }
`;

const ErrorItem = styled.div`
    color: var(--vscode-errorForeground);
    font-size: 12px;
    white-space: pre-wrap;
    overflow-wrap: break-word;
`;

const EscalationBanner = styled.div`
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--vscode-foreground);
    background: color-mix(in srgb, #f59e0b 18%, var(--vscode-editorWidget-background));
    border-top: 1px solid var(--vscode-editorWidget-border, transparent);
`;

const BannerButton = styled.button`
    flex: none;
    border: none;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    color: #ffffff;
    background: #b45309;
    cursor: pointer;
    white-space: nowrap;
    &:hover {
        background: #92400e;
    }
`;

const Footer = styled.div`
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--vscode-editorWidget-border, var(--vscode-dropdown-border));
`;

const ContextArea = styled.div`
    flex: none;
    padding: 0 12px;
    border-top: 1px solid var(--vscode-editorWidget-border, var(--vscode-dropdown-border));
`;

const FooterInput = styled.input`
    flex: 1;
    min-width: 0;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    outline: none;
    &:focus {
        border-color: var(--vscode-focusBorder);
    }
    &::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }
    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;

const SendButton = styled.button`
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    &:hover:not(:disabled) {
        color: var(--vscode-foreground);
        background: var(--vscode-toolbar-hoverBackground);
    }
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

function toolRowNode(key: string, label: string, state: "running" | "pending" | "done" | "failed"): React.ReactNode {
    return (
        <ToolRow key={key}>
            {state === "running" ? (
                <SpinIcon>
                    <Codicon name="loading" />
                </SpinIcon>
            ) : state === "pending" ? (
                // Unresolved call with no run in flight (an aborted turn, or TaskWrite,
                // whose call never resolves by design) — static glyph, never a spinner.
                <Codicon name="loading" />
            ) : state === "failed" ? (
                <Codicon name="error" sx={{ color: "var(--vscode-errorForeground)" }} />
            ) : (
                <Codicon name="check" />
            )}
            {label}
        </ToolRow>
    );
}

/**
 * Render the persisted transcript: user bubbles, and assistant turns unpacked
 * from their `<agentstream>` timeline into markdown text + tool rows. Content
 * with no `<agentstream>` blob (plain text) renders as a single markdown block.
 * Non-happy-path items (plan/config/…) are skipped — they escalate to the panel.
 */
function renderTranscript(msgs: MiniMsg[], streaming: boolean): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    msgs.forEach((m, mi) => {
        if (m.role === "user") {
            nodes.push(<UserBubble key={`u-${mi}`}>{m.content}</UserBubble>);
            return;
        }
        const entries = parseStream(m.content);
        if (entries.length === 0) {
            const text = m.content.trim();
            if (text) {
                nodes.push(
                    <TextItem key={`a-${mi}`}>
                        <MarkdownRenderer markdownContent={text} />
                    </TextItem>
                );
            }
            return;
        }
        entries.forEach((entry, ei) => {
            entry.items.forEach((item, ii) => {
                const key = `a-${mi}-${ei}-${ii}`;
                if (item.kind === "text") {
                    if (item.text.trim()) {
                        nodes.push(
                            <TextItem key={key}>
                                <MarkdownRenderer markdownContent={item.text} />
                            </TextItem>
                        );
                    }
                } else if (item.kind === "tool_call") {
                    nodes.push(toolRowNode(key, describeTool(item.toolName ?? "", item.toolInput), streaming ? "running" : "pending"));
                } else if (item.kind === "tool_result") {
                    nodes.push(toolRowNode(key, describeTool(item.toolName ?? "", undefined), item.failed ? "failed" : "done"));
                }
            });
        });
    });
    return nodes;
}

interface MiniChatProps {
    anchor: Anchor;
    onClose: () => void;
    /**
     * One-shot accessor for an orb or diagram launch prompt. The source clears
     * it after this read so a remount cannot re-apply or re-send the prompt.
     */
    takeInitialPrompt?: () => MiniChatPrompt | undefined;
}

export function MiniChat({ anchor, onClose, takeInitialPrompt }: MiniChatProps) {
    const { rpcClient } = useRpcContext();
    // The transcript, in the persisted store's own shape (ground truth).
    const [msgs, setMsgs] = useState<MiniMsg[]>([]);
    // Transient run signals (stop/error/review) that aren't part of the store.
    const [tail, setTail] = useState<MiniTail[]>([]);
    const [input, setInput] = useState("");
    const [draftPrompt, setDraftPrompt] = useState<MiniChatPrompt>(() => createMiniChatPrompt());
    const [streaming, setStreaming] = useState(false);
    const [status, setStatus] = useState<AgentRunStatus | null>(null);
    const bodyRef = useRef<HTMLDivElement | null>(null);
    /**
     * Replay/live high-water mark, scoped per generation: the run-event store
     * resets `seq` to 0 on every new run, so a cross-run mark would silently
     * drop every event of a run started after a replayed turn.
     */
    const seqRef = useRef(0);
    const generationRef = useRef<string | undefined>(undefined);
    const replayDoneRef = useRef(false);
    const pendingRef = useRef<ChatNotify[]>([]);

    /** Persist the current turn's transcript into the store (same format the panel writes). */
    const persistTurn = (messageId?: string) => {
        if (!messageId) {
            return;
        }
        setMsgs((prev) => {
            let target: MiniMsg | undefined;
            for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].role !== "assistant") { continue; }
                // Prefer the bubble for this exact turn; fall back to the latest assistant.
                if (prev[i].messageId === messageId) { target = prev[i]; break; }
                if (!target) { target = prev[i]; }
            }
            if (target?.content) {
                rpcClient
                    ?.getAiPanelRpcClient()
                    .updateChatMessage({ messageId, content: target.content })
                    .catch((e: unknown) => console.error("[MiniChat] Failed to persist chat message:", e));
            }
            return prev;
        });
    };

    const applyEvent = (evt: ChatNotify) => {
        if (typeof evt.seq === "number") {
            if (evt.generationId !== generationRef.current) {
                generationRef.current = evt.generationId;
                seqRef.current = 0;
            }
            if (evt.seq <= seqRef.current) {
                return;
            }
            seqRef.current = evt.seq;
        } else if (evt.generationId && evt.generationId !== generationRef.current) {
            generationRef.current = evt.generationId;
        }
        const gen = evt.generationId ?? generationRef.current;
        switch (evt.type) {
            case "start":
                setStreaming(true);
                setTail([]);
                break;
            case "content_block":
                if (evt.content === "") {
                    break;
                }
                setMsgs((prev) => reduceEvent(prev, evt, gen));
                break;
            case "content_replace":
            case "tool_call":
            case "tool_result":
                setMsgs((prev) => reduceEvent(prev, evt, gen));
                break;
            case "save_chat":
                persistTurn(evt.messageId ?? gen);
                break;
            case "stop":
                setStreaming(false);
                break;
            case "abort":
                setStreaming(false);
                // Persist the interruption marker (the panel does), then show the
                // transient notice — the marker is for history, the notice for here.
                setMsgs((prev) => reduceEvent(prev, evt, gen));
                setTail((prev) => [...prev, { kind: "notice", text: "Generation stopped." }]);
                break;
            case "error":
                setStreaming(false);
                setTail((prev) => [...prev, { kind: "error", text: evt.content }]);
                break;
            case "chat_component":
                // Fold into the transcript BEFORE the trailing save_chat persists it
                // (both updaters are queued, so ordering holds) — the mini renders
                // nothing for components, but it still authors the stored turn.
                setMsgs((prev) => reduceEvent(prev, evt, gen));
                if (evt.componentType === "review") {
                    setTail((prev) => [
                        ...prev.filter((item) => item.kind !== "review"),
                        { kind: "review", text: "Your changes are ready to review." },
                    ]);
                }
                break;
            // Interactive-prompt cards. The mini renders none of them (the escalation
            // banner sends the user to the panel to answer) but it MUST still record
            // them, or a turn it witnessed loses the plan / Q&A / config card for good.
            case "task_approval_request":
                // Only the "plan" flavour has a transcript item. Guard here rather than
                // inside the fold: reduceEvent would otherwise open an empty assistant
                // bubble for a "completion" approval, which the panel never does.
                if (evt.approvalType === "plan") {
                    setMsgs((prev) => reduceEvent(prev, evt, gen));
                }
                break;
            case "plan_approval_resolved":
                setMsgs((prev) => reduceEvent(prev, evt, gen));
                break;
            case "connector_generation_notification":
            case "configuration_collection_event":
            case "clarify_event":
            case "skill_enable_event":
            case "compaction_disabled":
                setMsgs((prev) => reduceEvent(prev, evt, gen));
                break;
            default: {
                // Metrics, diagnostics, presentational state — nothing persisted.
                //
                // Tripwire: this assignment fails to compile when a new `ChatNotify`
                // variant is added, forcing an explicit decision instead of a silent
                // drop. That matters because this component AUTHORS the persisted
                // transcript (see `persistTurn`) — an event the panel folds into
                // `content` but the mini ignores is data the store loses for good.
                // If the new variant mutates persisted content, model it above; if it
                // is genuinely presentational, add it to `UnmodelledNotifyType`.
                const _unmodelled: UnmodelledNotifyType = evt.type;
                void _unmodelled;
                break;
            }
        }
    };

    const sendPrompt = (prompt: string, promptContext: MiniChatPrompt = draftPrompt) => {
        setTail([]);
        setMsgs((prev) => [...prev, { role: "user", content: prompt }]);
        setStreaming(true);
        rpcClient
            ?.getAiPanelRpcClient()
            .generateAgent(buildMiniChatGenerationRequest(promptContext, prompt));
    };

    useEffect(() => {
        if (!rpcClient) {
            return;
        }
        return subscribeAgentRunStatus(rpcClient, setStatus);
    }, [rpcClient]);

    useEffect(() => {
        if (!rpcClient) {
            return;
        }
        let disposed = false;
        // Subscribe before loading so no live event is lost; queue until the
        // history load / replay establishes the seq high-water mark, then drain.
        const unsubscribe = subscribeCopilotChatNotify(rpcClient, (msg) => {
            if (disposed) {
                return;
            }
            if (!replayDoneRef.current) {
                pendingRef.current.push(msg);
                return;
            }
            applyEvent(msg);
        });

        const finishReplay = () => {
            replayDoneRef.current = true;
            pendingRef.current.forEach(applyEvent);
            pendingRef.current = [];
        };

        const initialPrompt = takeInitialPrompt?.();

        // Both reads are independent — fire them together so open latency is one
        // round trip, not two. Each carries its own fallback (older host). The
        // buffer read is skipped entirely on the initial-prompt path (fresh turn).
        const historyPromise: Promise<MiniMsg[]> = rpcClient
            .getAiPanelRpcClient()
            .getChatMessages()
            .then((loaded: UIChatMessage[]): MiniMsg[] => loaded ?? [])
            .catch((): MiniMsg[] => []);
        const runPromise: Promise<GetRunStatusResponse | null> = initialPrompt
            ? Promise.resolve(null)
            : rpcClient.getAiPanelRpcClient().getRunStatus({}).catch((): GetRunStatusResponse | null => null);

        (async () => {
            // 1) Load the active thread from the store — the same source the full
            //    panel renders, keyed to the same thread, so the two stay in sync.
            const history = await historyPromise;
            if (disposed) {
                return;
            }

            // 2) Opened by typing into the orb invite: show history, then send the
            //    new prompt beneath it. No buffer replay (that's a different turn).
            if (initialPrompt) {
                setMsgs(history);
                setDraftPrompt(initialPrompt);
                setInput(initialPrompt.autoSubmit ? "" : initialPrompt.text);
                finishReplay();
                if (initialPrompt.autoSubmit && initialPrompt.text.trim()) {
                    sendPrompt(initialPrompt.text.trim(), initialPrompt);
                }
                return;
            }

            // 3) Reconcile with any buffered run. The store is authoritative for
            //    turns already persisted; the buffer only matters for a turn that
            //    is still running or finished-but-not-yet-persisted. `applyEvent`
            //    resets the seq/generation watermark itself on the first event of
            //    a new generation, so no manual reset is needed before replaying.
            const run = await runPromise;
            if (disposed) {
                return;
            }

            const genId = run?.generationId ?? run?.events.find((e) => !!e.generationId)?.generationId;
            const historyHasGen = !!genId && history.some((m) => m.role === "assistant" && m.messageId === genId);

            if (run?.isRunning) {
                // In-flight turn: drop its partial persisted assistant bubble and
                // rebuild it live from the buffer (per-step saves are incomplete).
                setMsgs(history.filter((m) => !(m.role === "assistant" && m.messageId === genId)));
                setStreaming(true);
                run.events.forEach(applyEvent);
            } else if ((run?.events.length ?? 0) > 0 && genId && !historyHasGen) {
                // Finished while unwatched and never persisted (both surfaces were
                // closed): replay once to show it — the buffered save_chat lands it
                // in the store, so a later open serves it from history, not here.
                setMsgs(history);
                run.events.forEach(applyEvent);
            } else {
                // The store already holds the full transcript — it IS the ground
                // truth; never re-replay a persisted turn (avoids duplicates).
                setMsgs(history);
            }

            finishReplay();
        })();

        return () => {
            disposed = true;
            unsubscribe();
        };
    }, [rpcClient]);

    useEffect(() => {
        const body = bodyRef.current;
        if (body) {
            body.scrollTop = body.scrollHeight;
        }
    }, [msgs, tail, streaming]);

    const awaitingInput = status?.state === "awaiting-input";
    const runActive = streaming || status?.state === "running" || awaitingInput;

    const openFullChat = () => {
        const handoffPrompt = buildFullChatHandoffPrompt(draftPrompt, input);
        void rpcClient?.getAiPanelRpcClient().openAIPanel(handoffPrompt);
        // The full panel takes over (and the extension stops mirroring events
        // to the visualizer while it is open) — close the mini immediately.
        onClose();
    };

    const send = () => {
        const prompt = input.trim();
        if (!prompt || runActive) {
            return;
        }
        setInput("");
        sendPrompt(prompt);
    };

    const transcript = renderTranscript(msgs, streaming);

    return (
        <Panel style={panelPosition(anchor)} role="dialog" aria-label="WSO2 Integration Intelligence mini chat">
            <Header>
                <Icon name="bi-ai-chat" sx={{ width: 16, height: 16, flex: "none" }} iconSx={{ fontSize: "16px" }} />
                <HeaderTitle>WSO2 Integration Intelligence</HeaderTitle>
                <HeaderButton title="Open full chat" aria-label="Open the full Copilot chat" onClick={openFullChat}>
                    <Codicon name="screen-full" />
                </HeaderButton>
                <HeaderButton title="Close" aria-label="Close the mini chat" onClick={onClose}>
                    <Codicon name="close" />
                </HeaderButton>
            </Header>
            <Body ref={bodyRef}>
                {transcript.length === 0 && tail.length === 0 && !streaming && (
                    <EmptyState>
                        <Icon name="bi-ai-chat" sx={{ width: 28, height: 28 }} iconSx={{ fontSize: "28px" }} />
                        <div>
                            {draftPrompt.codeContext?.type === "addition"
                                ? "What would you like to add here?"
                                : "How can I help with your integration?"}
                        </div>
                        <div style={{ fontSize: 11 }}>You can continue this conversation in the full chat.</div>
                    </EmptyState>
                )}
                {transcript}
                {tail.map((item, index) => {
                    if (item.kind === "review") {
                        return (
                            <ReviewNotice key={`tail-${index}`}>
                                <Codicon name="diff" />
                                <ReviewNoticeText>{item.text}</ReviewNoticeText>
                                <ReviewButton onClick={openFullChat}>Review changes</ReviewButton>
                            </ReviewNotice>
                        );
                    }
                    return item.kind === "notice" ? (
                        <Notice key={`tail-${index}`}>{item.text}</Notice>
                    ) : (
                        <ErrorItem key={`tail-${index}`}>{item.text}</ErrorItem>
                    );
                })}
            </Body>
            {awaitingInput && (
                <EscalationBanner>
                    <Codicon name="warning" />
                    <span style={{ flex: 1 }}>Copilot needs your input</span>
                    <BannerButton onClick={openFullChat}>Open full chat</BannerButton>
                </EscalationBanner>
            )}
            {draftPrompt.codeContext && (
                <ContextArea>
                    <CodeContextCard
                        codeContext={draftPrompt.codeContext}
                        onRemove={() => setDraftPrompt((prompt) => ({ ...prompt, codeContext: undefined }))}
                    />
                </ContextArea>
            )}
            <Footer>
                <FooterInput
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            send();
                        }
                    }}
                    placeholder={
                        runActive
                            ? "I’m working on it…"
                            : draftPrompt.codeContext?.type === "addition"
                                ? "What should I add here?"
                                : "What should we work on?"
                    }
                    aria-label="Message WSO2 Integration Intelligence"
                    disabled={runActive}
                />
                <SendButton title="Send" aria-label="Send message" onClick={send} disabled={runActive || !input.trim()}>
                    <Codicon name="send" />
                </SendButton>
            </Footer>
        </Panel>
    );
}
