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
    // Inside the Copilot popover, which supplies the card and keeps the draft across scopes.
    embedded?: boolean;
    // The card has no header, so the prompt carries Copilot's glyph.
    headless?: boolean;
    // What Copilot can do here, shown until the first prompt.
    hint?: string;
    // Ready-made requests shown with the hint; a click puts one in the prompt to edit.
    starters?: string[];
    // Runs a starter at once instead of putting it in the prompt; returns true when it did.
    onStarter?: (starter: string) => boolean;
    // While a request runs, Send becomes Stop and Esc stops it.
    onStop?: () => void;
    // Copilot's answer when a request changes nothing, e.g. an explanation.
    reply?: string;
    // Off where the thread is pinned in view already, so it never pulls the form away from what changed.
    keepInView?: boolean;
    children?: React.ReactNode;
}

const DIALOG = { role: "dialog", "aria-label": "Copilot" };

// The popover keeps the draft, so it survives a switch between a field and the whole form.
function useDraft(embedded?: boolean): [string, (draft: string) => void] {
    const host = useAssistHost();
    const local = useState("");
    return embedded && host ? [host.draft, host.setDraft] : local;
}

// The helper's frame: what was asked, progress, messages, the proposal passed as children, and the prompt.
export function AssistShell({ history, loadingLabel, error, withheld, placeholder, onSubmit, onClose, proposal, onAccept, embedded, headless, hint, starters, onStarter, onStop, reply, keepInView = true, children }: AssistShellProps) {
    const [draft, setDraft] = useDraft(embedded);
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
    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            (loading && onStop ? onStop : onClose)();
        } else if (event.key === "Tab" && proposal && onAccept && !draft) {
            event.preventDefault();
            onAccept();
        }
    };

    const Frame = embedded ? S.EmbeddedPanel : S.Panel;
    const empty = !history.length && !loading && !error && !proposal;
    return (
        <Frame ref={panelRef} className="copilot-panel" {...(embedded ? {} : DIALOG)}>
            {history.length > 0 && (
                <S.History>
                    {history.map((text, index) => <S.Bubble key={index}>{text}</S.Bubble>)}
                </S.History>
            )}
            {loading && <S.Status role="status">{loadingLabel}</S.Status>}
            <Messages withheld={withheld} error={loading ? undefined : error} reply={loading ? undefined : reply} />
            {!loading && children}
            {embedded && empty && hint && (
                <S.Hint>{hint}</S.Hint>
            )}
            {empty && <Starters starters={starters} afterHint={!!(embedded && hint)} onPick={(starter) => {
                if (onStarter?.(starter)) {
                    return;
                }
                setDraft(starter);
                inputRef.current?.focus();
            }} />}
            <S.Prompt className="copilot-prompt">
                <S.InputBox>
                    {/* The popover's header already carries Copilot's glyph. */}
                    {(!embedded || headless) && <Icon name="bi-ai-chat" sx={{ width: "14px", height: "14px", color: ThemeColors.ON_SURFACE_VARIANT }} iconSx={{ fontSize: "14px" }} />}
                    <S.Input
                        ref={inputRef}
                        rows={1}
                        value={draft}
                        placeholder={placeholder}
                        aria-label={placeholder}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={onKeyDown}
                    />
                </S.InputBox>
                <SendButton loading={loading} ready={!!draft.trim()} onSend={send} onStop={onStop} />
            </S.Prompt>
        </Frame>
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

// The Codicon box is 16px tall and top-aligns a smaller glyph.
const CENTERED_ICON = { display: "flex", alignItems: "center", justifyContent: "center", width: "16px" };

// While a request runs and can be stopped, Send becomes Stop.
function SendButton({ loading, ready, onSend, onStop }: { loading: boolean; ready: boolean; onSend: () => void; onStop?: () => void }) {
    if (loading && onStop) {
        return (
            <S.Send type="button" title="Stop (Esc)" aria-label="Stop" onClick={onStop}>
                <Codicon name="debug-stop" sx={{ ...CENTERED_ICON, fontSize: "12px" }} iconSx={{ fontSize: "12px" }} />
            </S.Send>
        );
    }
    return (
        <S.Send type="button" title="Send (Enter)" aria-label="Send" disabled={!ready || loading} onClick={onSend}>
            <Codicon name="arrow-up" sx={{ ...CENTERED_ICON, fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
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
