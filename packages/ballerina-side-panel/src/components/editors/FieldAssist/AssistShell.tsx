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
import { Codicon, Icon, ThemeColors } from "@wso2/ui-toolkit";
import { S } from "./styles";
import { useAssistHost } from "./AssistHost";

interface AssistShellProps {
    history: string[];
    replies?: string[];
    loadingLabel?: string;
    error?: string;
    // The current value stayed on this machine because it looked like a secret.
    withheld?: boolean;
    placeholder: string;
    // Returns false when the prompt was held back, so the draft stays for editing.
    onSubmit: (instruction: string) => boolean;
    onClose: () => void;
    // The current proposal, shown as children; Tab accepts it.
    proposal?: object;
    onAccept?: () => void;
    // The card has no header, so the prompt carries Copilot's glyph.
    headless?: boolean;
    hint?: string;
    // A click puts one in the prompt to edit.
    starters?: string[];
    // Runs a starter at once instead of putting it in the prompt; returns true when it did.
    onStarter?: (starter: string) => boolean;
    // While a request runs, Send becomes Stop and Esc stops it.
    onStop?: () => void;
    // Copilot's answer when a request changes nothing, e.g. an explanation.
    reply?: string;
    // Off where the thread is pinned in view already, so it never pulls the form away from what changed.
    keepInView?: boolean;
    onClear?: () => void;
    children?: React.ReactNode;
}

// The popover keeps the draft, so it survives a switch between a field and the whole form.
function useDraft(): [string, (draft: string) => void] {
    const host = useAssistHost();
    const local = useState("");
    return host ? [host.draft, host.setDraft] : local;
}

// The helper's frame: what was asked, progress, messages, the proposal passed as children, and the prompt.
export function AssistShell({ history, replies, loadingLabel, error, withheld, placeholder, onSubmit, onClose, proposal, onAccept, headless, hint, starters, onStarter, onStop, reply, keepInView = true, onClear, children }: AssistShellProps) {
    const [draft, setDraft] = useDraft();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const loading = !!loadingLabel;

    useEffect(() => {
        const input = inputRef.current;
        // A proposal that focused its own control, e.g. a confirmation, keeps the focus.
        const active = input?.ownerDocument.activeElement;
        if (active && active !== input && panelRef.current?.contains(active)) {
            return;
        }
        input?.focus({ preventScroll: true });
        input?.setSelectionRange(input.value.length, input.value.length);
    }, [proposal]);
    // The panel often opens below the fold of a long form; keep what changed in view.
    useEffect(() => {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (keepInView) {
            panelRef.current?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
        }
    }, [loading, proposal, error]);

    const send = () => {
        const text = draft.trim();
        if (text && !loading && onSubmit(text)) {
            setDraft("");
        }
    };

    const empty = !history.length && !loading && !error && !proposal;
    return (
        <S.EmbeddedPanel ref={panelRef} className="copilot-panel">
            <ThreadView history={history} replies={replies} loadingLabel={loadingLabel} error={error} reply={reply} withheld={withheld} onClear={onClear} inputRef={inputRef} />
            {!loading && children}
            {empty && hint && (
                <S.Note>{hint}</S.Note>
            )}
            {empty && <Starters starters={starters} afterHint={!!hint} onPick={(starter) => {
                if (onStarter?.(starter)) {
                    return;
                }
                setDraft(starter);
                inputRef.current?.focus();
            }} />}
            {/* The popover's header already carries Copilot's glyph. */}
            <PromptInput className="copilot-prompt" inputRef={inputRef} glyph={headless} draft={draft} setDraft={setDraft} placeholder={placeholder}
                loading={loading} onSend={send} onStop={onStop} onClose={onClose} onTab={proposal ? onAccept : undefined} />
        </S.EmbeddedPanel>
    );
}

interface ThreadViewProps {
    history: string[];
    replies?: string[];
    loadingLabel?: string;
    error?: string;
    reply?: string;
    withheld?: boolean;
    onClear?: () => void;
    inputRef: React.RefObject<HTMLTextAreaElement>;
}

// Earlier turns, the latest request and Copilot's answer scroll together under the bar, so a long thread never pushes the field away.
function ThreadView({ history, replies, loadingLabel, error, reply, withheld, onClear, inputRef }: ThreadViewProps) {
    const loading = !!loadingLabel;
    const scrollRef = useRef<HTMLDivElement>(null);
    const latestRef = useRef<HTMLDivElement>(null);
    const [more, setMore] = useState({ above: false, below: false });
    const measure = () => {
        const thread = scrollRef.current;
        // A few pixels of padding at either end are not more to read.
        const next = thread ? { above: thread.scrollTop > 4, below: thread.scrollTop + thread.clientHeight < thread.scrollHeight - 4 } : { above: false, below: false };
        setMore((current) => (current.above === next.above && current.below === next.below ? current : next));
    };
    // Earlier turns stay open only until the next request, which folds them again.
    const [openAt, setOpenAt] = useState<number>();
    const earlierOpen = openAt === history.length;
    const earlier = history.slice(0, -1);
    const shown = { error: loading ? undefined : error, reply: loading ? undefined : reply };
    // A long answer reads from its request down; opened earlier turns read from the oldest.
    useEffect(() => {
        const thread = scrollRef.current;
        if (thread) {
            thread.scrollTop = earlierOpen ? 0 : (latestRef.current?.offsetTop ?? 0) - thread.offsetTop;
        }
        measure();
    }, [history.length, loading, shown.reply, shown.error, earlierOpen]);
    if (!history.length && !loading && !shown.error && !shown.reply && !withheld) {
        return null;
    }
    return (
        <>
            {history.length > 0 && (
                <ThreadBar earlier={earlier} replies={replies} open={earlierOpen} onToggle={() => setOpenAt(earlierOpen ? undefined : history.length)}
                    onClear={onClear} loading={loading} inputRef={inputRef} />
            )}
            <S.Thread ref={scrollRef} className="copilot-thread" onScroll={measure} data-more-above={more.above} data-more-below={more.below}>
                {history.length > 0 && (
                    <S.History>
                        {earlierOpen && earlier.map((text, index) => (
                            <React.Fragment key={index}>
                                <S.Bubble>{text}</S.Bubble>
                                {replies?.[index] && <S.EarlierReply>{replies[index]}</S.EarlierReply>}
                            </React.Fragment>
                        ))}
                        <S.Bubble key={history.length} ref={latestRef}>{history[history.length - 1]}</S.Bubble>
                    </S.History>
                )}
                {loading && <S.Status role="status">{loadingLabel}</S.Status>}
                <Messages withheld={withheld} {...shown} />
            </S.Thread>
        </>
    );
}

interface ThreadBarProps {
    earlier: string[];
    replies?: string[];
    open: boolean;
    onToggle: () => void;
    onClear?: () => void;
    loading: boolean;
    inputRef: React.RefObject<HTMLTextAreaElement>;
}

// The thread's top row: the toggle for earlier turns, and Clear Chat where the card has no header to hold it.
function ThreadBar({ earlier, replies = [], open, onToggle, onClear, loading, inputRef }: ThreadBarProps) {
    const clearable = !!onClear && !loading;
    if (!earlier.length && !clearable) {
        return null;
    }
    const count = earlier.length + earlier.filter((_, index) => replies[index]).length;
    // The prompt takes the focus, as the button goes away.
    const clear = () => {
        onClear?.();
        inputRef.current?.focus();
    };
    return (
        <S.ThreadBar>
            {earlier.length > 0 && (
                <S.EarlierToggle type="button" aria-expanded={open} onClick={onToggle}>
                    <Codicon name={open ? "chevron-down" : "chevron-right"} sx={{ display: "flex", alignItems: "center", fontSize: "12px" }} iconSx={{ fontSize: "12px" }} />
                    {open ? "Hide Earlier Messages" : `Show ${count} Earlier ${count === 1 ? "Message" : "Messages"}`}
                </S.EarlierToggle>
            )}
            {clearable && (
                <S.ClearThread type="button" title="Clear Chat" aria-label="Clear chat" onClick={clear}>
                    <Codicon name="clear-all" sx={{ display: "flex", alignItems: "center", fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
                </S.ClearThread>
            )}
        </S.ThreadBar>
    );
}

function Starters({ starters, afterHint, onPick }: { starters?: string[]; afterHint: boolean; onPick: (starter: string) => void }) {
    if (!starters?.length) {
        return null;
    }
    return (
        <S.StarterChips afterHint={afterHint}>
            {starters.map((starter) => (
                <S.Pill key={starter} type="button" onClick={() => onPick(starter)}>{starter}</S.Pill>
            ))}
        </S.StarterChips>
    );
}

interface PromptInputProps extends Pick<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "placeholder" | "autoFocus" | "readOnly"> {
    draft: string;
    setDraft: (draft: string) => void;
    loading: boolean;
    onSend: () => void;
    onStop?: () => void;
    onClose: () => void;
    // Runs on Tab while the draft is empty, e.g. to accept a proposal.
    onTab?: () => void;
    inputRef?: React.Ref<HTMLTextAreaElement>;
    className?: string;
    bordered?: boolean;
    glyph?: boolean;
}

export function PromptInput({ draft, setDraft, loading, onSend, onStop, onClose, onTab, inputRef, className, bordered, glyph, ...input }: PromptInputProps) {
    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
            // Cmd/Ctrl+Enter sends here too, and doesn't also save the form.
            event.preventDefault();
            event.stopPropagation();
            onSend();
        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            (loading && onStop ? onStop : onClose)();
        } else if (event.key === "Tab" && onTab && !draft) {
            event.preventDefault();
            onTab();
        }
    };
    const Box = bordered ? S.ReviseBox : S.InputBox;
    return (
        <S.Prompt className={className}>
            <Box>
                {glyph && <Icon name="bi-ai-chat" sx={{ width: "14px", height: "14px", color: ThemeColors.ON_SURFACE_VARIANT }} iconSx={{ fontSize: "14px" }} />}
                <S.Input
                    {...input}
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    aria-label={input.placeholder}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onKeyDown}
                />
            </Box>
            <SendButton loading={loading} ready={!!draft.trim()} onSend={onSend} onStop={onStop} />
        </S.Prompt>
    );
}

// The Codicon box is 16px tall and top-aligns a smaller glyph.
const CENTERED_ICON = { display: "flex", alignItems: "center", justifyContent: "center", width: "16px" };

function SendButton({ loading, ready, onSend, onStop }: { loading: boolean; ready: boolean; onSend: () => void; onStop?: () => void }) {
    const stop = loading && !!onStop;
    const size = stop ? "12px" : "14px";
    return (
        <S.Send type="button" title={stop ? "Stop (Esc)" : "Send (Enter)"} aria-label={stop ? "Stop" : "Send"} disabled={!stop && (!ready || loading)} onClick={stop ? onStop : onSend}>
            <Codicon name={stop ? "debug-stop" : "arrow-up"} sx={{ ...CENTERED_ICON, fontSize: size }} iconSx={{ fontSize: size }} />
        </S.Send>
    );
}

// What the thread says besides the proposal: a value kept local, an error, or an answer that changes nothing.
function Messages({ withheld, error, reply }: { withheld?: boolean; error?: string; reply?: string }) {
    return (
        <>
            {withheld && (
                <S.Message>
                    <Codicon name="lock" sx={{ fontSize: "12px" }} iconSx={{ fontSize: "12px" }} />
                    Your current value stayed on this machine; it wasn't sent to Copilot.
                </S.Message>
            )}
            {error && (
                <S.Message role="alert">
                    <Codicon name="info" sx={{ fontSize: "12px" }} iconSx={{ fontSize: "12px" }} />
                    {error}
                </S.Message>
            )}
            {reply && <S.Reply>{reply}</S.Reply>}
        </>
    );
}
