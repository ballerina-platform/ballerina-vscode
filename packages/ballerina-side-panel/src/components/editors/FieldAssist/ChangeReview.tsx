/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import { ChipText, StandardIcon, getTokenIconClass } from "../MultiModeExpressionEditor/ChipExpressionEditor/chipStyles";
import { TokenType } from "../MultiModeExpressionEditor/ChipExpressionEditor/types";
import { AppliedMark, AssistFocus, AssistHostValue, ReviewFocus, ReviewSide, ValueDisplay, scrollParent, undoAll } from "./AssistHost";
import { SendButton } from "./AssistShell";
import { CHANGED_FIELD, S } from "./styles";

export interface DiffPart {
    text: string;
    kind: "same" | "del" | "ins";
}

// Text splits into words, code into names, literals and punctuation; each keeps the spaces after it.
const WORDS = /\S+\s*/g;
const CODE_TOKENS = /(?:"(?:[^"\\]|\\.)*"|`[^`]*`|\w+|[^\s\w])\s*/g;

/** The words two values share and the words each one has alone, in reading order; a change of spacing alone is no change. */
export function wordDiff(before: string, after: string, code = false): DiffPart[] {
    const a = before.trimStart().match(code ? CODE_TOKENS : WORDS) ?? [];
    const b = after.trimStart().match(code ? CODE_TOKENS : WORDS) ?? [];
    const same = (i: number, j: number) => a[i].trimEnd() === b[j].trimEnd();
    // Longest common subsequence, filled from the end so the walk below reads forwards.
    const common = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            common[i][j] = same(i, j) ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
        }
    }
    const parts: DiffPart[] = [];
    const push = (text: string, kind: DiffPart["kind"]) => {
        const last = parts[parts.length - 1];
        if (last?.kind === kind) {
            last.text += text;
        } else {
            parts.push({ text, kind });
        }
    };
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && same(i, j)) {
            // Shared words read as the value reads now.
            push(b[j++], "same");
            i++;
        } else if (i < a.length && (j === b.length || common[i + 1][j] >= common[i][j + 1])) {
            push(a[i++], "del");
        } else {
            push(b[j++], "ins");
        }
    }
    return parts;
}

// Below this share of unchanged text, a word diff interleaves two different texts; they read better whole.
const REWRITE_SHARE = 0.5;

/** Whether the parts are mostly new text, so the old and new value read better one after the other. */
export function isRewrite(parts: DiffPart[]): boolean {
    const length = (kinds: DiffPart["kind"][]) => parts.filter((part) => kinds.includes(part.kind)).reduce((sum, part) => sum + part.text.length, 0);
    const same = length(["same"]);
    const longest = Math.max(length(["same", "del"]), length(["same", "ins"]));
    return longest > 0 && same / longest < REWRITE_SHARE;
}

/** The changed fields in the order the form shows them; one not on screen, e.g. in a closed section, goes last. */
export function reviewOrder(host: AssistHostValue): string[] {
    const keys = Object.keys(host.applied?.marks ?? {});
    const shown = [...document.querySelectorAll(`[${CHANGED_FIELD}]`)].map((field) => field.getAttribute(CHANGED_FIELD));
    const rank = (key: string) => (shown.includes(key) ? shown.indexOf(key) : shown.length);
    return keys.sort((a, b) => rank(a) - rank(b));
}

/** The change under review: the one the user moved to, else the first in the form. */
export function currentReview(host: AssistHostValue): string | undefined {
    const keys = reviewOrder(host);
    return host.reviewKey && keys.includes(host.reviewKey) ? host.reviewKey : keys[0];
}

/** Puts a field back as it was before Copilot changed it: through its own editor, else by rebuilding the form. */
export function revertMark(host: AssistHostValue, fieldKey: string, mark: AppliedMark) {
    const editor = host.assistFields().get(fieldKey);
    if (editor && mark.values) {
        editor.apply(mark.values.before);
    } else {
        mark.revert();
    }
    host.dropMark(fieldKey);
}

// Where the focus returns after the last decision: the field's Copilot button, else a plain input; an expression editor opens its helper menu on focus.
const FIELD_RETURN = "button[aria-label='Fill this field with Copilot'], input:not([type='hidden']), textarea, vscode-text-field, vscode-text-area, vscode-dropdown, select";

const reveal = (key: string) =>
    document.querySelector(`[${CHANGED_FIELD}="${key}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });

const CARD_WIDTH = 360;
const CARD_MIN_WIDTH = 260;
const CARD_GAP = 16;
const CARET_TOP = 13;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

interface Beside {
    left: number;
    top: number;
    width: number;
    // The caret's offset from the card's top, so it points at the top of the field's value.
    caret: number;
    // The field is scrolled out of its form.
    hidden: boolean;
}

const FIELD_CONTROLS = "input:not([type='hidden']), textarea, select, vscode-text-field, vscode-text-area, vscode-dropdown";

/** The box the field's value sits in: a code editor's bordered frame, else the input; the card points at it rather than at the label. */
export function valueBox(field: HTMLElement): HTMLElement {
    let box = field.querySelector<HTMLElement>(".cm-editor");
    if (!box) {
        return field.querySelector<HTMLElement>(FIELD_CONTROLS) ?? field;
    }
    while (box !== field && box.parentElement && getComputedStyle(box).borderTopStyle === "none") {
        box = box.parentElement;
    }
    return box;
}

/** Where the card fits beside the field's form, in window coordinates; none in a dialog or when the gap is narrower than the card. */
export function besideField(field: HTMLElement, side: ReviewSide, cardHeight: number): Beside | undefined {
    const view = field.ownerDocument.defaultView;
    if (!view || field.closest("[role=dialog]")) {
        return undefined;
    }
    const box = field.getBoundingClientRect();
    const form = scrollParent(field)?.getBoundingClientRect() ?? new DOMRect(0, 0, view.innerWidth, view.innerHeight);
    // A side panel's canvas lies left of its form; a page's margin lies right of its fields.
    const [from, to] = side === "start" ? [CARD_GAP, form.left - CARD_GAP] : [box.right + CARD_GAP, view.innerWidth - CARD_GAP];
    const width = Math.min(CARD_WIDTH, to - from);
    if (width < CARD_MIN_WIDTH) {
        return undefined;
    }
    const value = valueBox(field).getBoundingClientRect();
    const top = clamp(value.top, CARD_GAP, view.innerHeight - CARD_GAP - cardHeight);
    return {
        left: side === "start" ? to - width : from,
        top,
        width,
        caret: clamp(value.top - top + CARET_TOP, CARET_TOP, cardHeight - 2 * CARET_TOP),
        hidden: box.bottom < form.top || box.top > form.bottom,
    };
}

// Measured as it renders, so the card mounts where it belongs and keeps its focus; it follows the field as the form scrolls or resizes.
function useBeside(field: HTMLElement, side: ReviewSide | undefined, card: HTMLElement | null): Beside | undefined {
    const [, setLayout] = useState(0);
    useLayoutEffect(() => {
        const view = field.ownerDocument.defaultView;
        if (!side || !view) {
            return;
        }
        const update = () => setLayout((count) => count + 1);
        const observer = new ResizeObserver(update);
        observer.observe(field);
        card && observer.observe(card);
        view.addEventListener("resize", update);
        view.addEventListener("scroll", update, true);
        return () => {
            observer.disconnect();
            view.removeEventListener("resize", update);
            view.removeEventListener("scroll", update, true);
        };
    }, [field, side, card]);
    return side ? besideField(field, side, card?.offsetHeight ?? 0) : undefined;
}

interface ChangeCardProps {
    host: AssistHostValue;
    fieldKey: string;
    mark: AppliedMark;
    field: HTMLElement | null;
}

/** By the changed field being reviewed: what Copilot changed in it, kept or undone here, then on to the next one. */
export function ChangeCard({ field, ...props }: ChangeCardProps) {
    // The field is known once its mark is in the page; until then there is nothing to place the card by.
    return field ? <PlacedChangeCard field={field} {...props} /> : null;
}

function PlacedChangeCard({ host, fieldKey, mark, field }: ChangeCardProps & { field: HTMLElement }) {
    const [card, setCard] = useState<HTMLDivElement | null>(null);
    const beside = useBeside(field, host.reviewSide, card);
    const content = <ChangeCardContent host={host} fieldKey={fieldKey} mark={mark} field={field} hidden={!!beside?.hidden} />;
    if (!beside) {
        return <S.ChangeCard ref={setCard} role="group" aria-label={cardLabel(host, fieldKey, mark)}><S.ChangeCaret aria-hidden="true" />{content}</S.ChangeCard>;
    }
    // Out of the form's flow, so the fields below stay where they are.
    return createPortal(
        <S.ChangeCard
            ref={setCard}
            beside
            role="group"
            aria-label={cardLabel(host, fieldKey, mark)}
            style={{ left: beside.left, top: beside.top, width: beside.width, visibility: beside.hidden ? "hidden" : undefined }}
        >
            <S.ChangeCaret aria-hidden="true" side={host.reviewSide} style={{ top: beside.caret }} />
            {content}
        </S.ChangeCard>,
        field.ownerDocument.body
    );
}

function cardLabel(host: AssistHostValue, fieldKey: string, mark: AppliedMark): string {
    const keys = reviewOrder(host);
    const added = changeKind(mark.added ? "" : mark.before, mark.after ?? "", mark.display) === "added";
    return `Copilot change ${keys.indexOf(fieldKey) + 1} of ${keys.length}: ${mark.label}${added ? ", added" : ""}`;
}

interface ChangeCardContentProps {
    host: AssistHostValue;
    fieldKey: string;
    mark: AppliedMark;
    field: HTMLElement;
    hidden: boolean;
}

function ChangeCardContent({ host, fieldKey, mark, field, hidden }: ChangeCardContentProps) {
    const buttons: Record<ReviewFocus, React.RefObject<HTMLButtonElement>> = { keep: useRef(null), previous: useRef(null), next: useRef(null) };
    const reviseRef = useRef<HTMLButtonElement>(null);
    const revising = host.revising === fieldKey;
    // Taken from the host when the card mounts or its change is replaced; a hidden card, e.g. while its field scrolls into view, can't take the focus yet.
    const focusNext = useRef<ReviewFocus>();
    useEffect(() => {
        focusNext.current = host.reviewFocus.current ?? focusNext.current;
        host.reviewFocus.current = undefined;
    }, [mark]);
    useEffect(() => {
        if (!hidden && focusNext.current) {
            buttons[focusNext.current].current?.focus({ preventScroll: true });
            focusNext.current = undefined;
        }
    }, [mark, hidden]);
    const keys = reviewOrder(host);
    const index = keys.indexOf(fieldKey);
    const step = (by: number) => keys[(index + by + keys.length) % keys.length];
    const moveTo = (key: string | undefined, focus: ReviewFocus) => {
        host.reviewFocus.current = focus;
        host.setReviewKey(key);
        if (key) {
            reveal(key);
        }
    };
    // A decision ends a revision still running; the value the user decided on stays. After the last one, the field takes the focus back.
    const decide = (apply: () => void, next?: string) => {
        if (revising && host.orbState === "running") {
            host.liveForm()?.stop();
        }
        host.setRevising(undefined);
        apply();
        if (next) {
            moveTo(next, "keep");
        } else {
            host.setReviewKey(undefined);
            field.querySelector<HTMLElement>(FIELD_RETURN)?.focus({ preventScroll: true });
        }
    };
    const nextChange = keys.length > 1 ? step(1) : undefined;
    const before = mark.added ? "" : mark.before;
    const after = mark.after ?? "";
    const added = changeKind(before, after, mark.display) === "added";
    const closePrompt = () => {
        host.setRevising(undefined);
        reviseRef.current?.focus({ preventScroll: true });
    };
    return (
        <>
            <S.ChangeCardHead>
                <S.ReviewCount>
                    {keys.length > 1 ? `Change ${index + 1} of ${keys.length}` : "Changed by Copilot"}
                    {added && <S.Tag>Added</S.Tag>}
                </S.ReviewCount>
                {keys.length > 1 && (
                    <>
                        <S.HeadLink type="button" onClick={() => decide(() => undoAll(host))}>Undo All</S.HeadLink>
                        <S.HeadLink type="button" onClick={() => decide(() => host.setApplied(undefined))}>Keep All</S.HeadLink>
                        <S.HeaderButton ref={buttons.previous} type="button" aria-label="Previous Change" title="Previous Change" onClick={() => moveTo(step(-1), "previous")}>
                            <Codicon name="chevron-up" sx={{ fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
                        </S.HeaderButton>
                        <S.HeaderButton ref={buttons.next} type="button" aria-label="Next Change" title="Next Change" onClick={() => moveTo(nextChange, "next")}>
                            <Codicon name="chevron-down" sx={{ fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
                        </S.HeaderButton>
                    </>
                )}
            </S.ChangeCardHead>
            {!added && (
                <S.Diff prose={!mark.display}>
                    <ReviewDiff before={before} after={after} display={mark.display} />
                </S.Diff>
            )}
            <S.ChangeActions>
                <S.GhostAction ref={reviseRef} type="button" aria-pressed={revising} title={`Ask Copilot for a different ${mark.label}`} onClick={() => host.setRevising(revising ? undefined : fieldKey)}>
                    <Icon name="bi-ai-chat" sx={{ width: "14px", height: "14px" }} iconSx={{ fontSize: "14px" }} />
                    Revise
                </S.GhostAction>
                <S.Secondary type="button" onClick={() => decide(() => revertMark(host, fieldKey, mark), nextChange)}>{mark.added ? "Remove" : "Undo"}</S.Secondary>
                <S.Primary ref={buttons.keep} type="button" onClick={() => decide(() => host.dropMark(fieldKey), nextChange)}>Keep</S.Primary>
            </S.ChangeActions>
            {revising && <RevisePrompt host={host} focus={{ key: fieldKey, label: mark.label }} onClose={closePrompt} />}
        </>
    );
}

// Asks the form's thread for a different value for this field; the draft stays while the request runs or when nothing changed.
function RevisePrompt({ host, focus, onClose }: { host: AssistHostValue; focus: AssistFocus; onClose: () => void }) {
    const [draft, setDraft] = useState("");
    const running = host.orbState === "running";
    const placeholder = `Ask for a change to ${focus.label}`;
    const send = () => {
        const text = draft.trim();
        if (text && !running) {
            host.liveForm()?.revise(focus, text);
        }
    };
    const stop = () => host.liveForm()?.stop();
    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
            // Cmd/Ctrl+Enter sends here too, and doesn't also save the form.
            event.preventDefault();
            event.stopPropagation();
            send();
        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            (running ? stop : onClose)();
        }
    };
    return (
        <>
            {running && <S.Status role="status">Working…</S.Status>}
            <S.Prompt>
                <S.ReviseBox>
                    <S.Input
                        autoFocus
                        rows={1}
                        value={draft}
                        readOnly={running}
                        placeholder={placeholder}
                        aria-label={placeholder}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={onKeyDown}
                    />
                </S.ReviseBox>
                <SendButton loading={running} ready={!!draft.trim()} onSend={send} onStop={stop} />
            </S.Prompt>
        </>
    );
}

// The old value above the new one, marked − and +; when they share most words, only the changed words are tinted.
export function ValueDiff({ before, after, display }: { before: string; after: string; display?: ValueDisplay }) {
    const removed = (content: React.ReactNode) => (
        <S.DiffLine kind="remove"><S.LineSign removed>−</S.LineSign><S.OldValue>{content}</S.OldValue></S.DiffLine>
    );
    const added = (content: React.ReactNode) => (
        <S.DiffLine kind="add"><S.LineSign>+</S.LineSign><S.NewValue>{content}</S.NewValue></S.DiffLine>
    );
    if (!before.trim() || !after.trim()) {
        return before.trim() ? removed(<Value text={before} display={display} />) : added(<Value text={after} display={display} />);
    }
    const parts = display === "reference" ? [] : wordDiff(before, after, display === "code");
    if (!parts.length || isRewrite(parts)) {
        return <>{removed(<Value text={before} display={display} />)}{added(<Value text={after} display={display} />)}</>;
    }
    const line = (kind: "del" | "ins") => parts
        .filter((part) => part.kind === "same" || part.kind === kind)
        .map((part, index) => (part.kind === kind ? <S.Changed key={index} kind={kind}>{part.text}</S.Changed> : part.text));
    return <>{removed(line("del"))}{added(line("ins"))}</>;
}

export type ChangeKind = "added" | "edited" | "replaced" | "cleared";

export function changeKind(before: string, after: string, display?: ValueDisplay): ChangeKind {
    if (!before.trim()) {
        return "added";
    }
    if (!after.trim()) {
        return "cleared";
    }
    const parts = display === "reference" ? [] : wordDiff(before, after, display === "code");
    return parts.length && !isRewrite(parts) ? "edited" : "replaced";
}

// The field already shows the new value, so a review shows only what it can't: the old value, or which words a small edit changed.
export function ReviewDiff({ before, after, display }: { before: string; after: string; display?: ValueDisplay }) {
    const kind = changeKind(before, after, display);
    if (kind === "added") {
        return null;
    }
    if (kind !== "edited") {
        return <S.DiffLine kind="remove"><S.LineSign removed>−</S.LineSign><S.OldValue><Value text={before} display={display} /></S.OldValue></S.DiffLine>;
    }
    return (
        <S.DiffLine kind="edit">
            <S.NewValue>
                {wordDiff(before, after, display === "code").map((part, index) => (part.kind === "same" ? part.text : <S.Changed key={index} kind={part.kind}>{part.text}</S.Changed>))}
            </S.NewValue>
        </S.DiffLine>
    );
}

// A reference shows as the editor's chip; other values as text.
function Value({ text, display }: { text: string; display?: ValueDisplay }) {
    return display === "reference" ? <Reference name={text.trim()} /> : <>{text}</>;
}

function Reference({ name }: { name: string }) {
    return (
        <S.WasChip chipType={TokenType.VARIABLE}>
            <StandardIcon chipType={TokenType.VARIABLE} className={getTokenIconClass(TokenType.VARIABLE)} />
            <ChipText>{name}</ChipText>
        </S.WasChip>
    );
}
