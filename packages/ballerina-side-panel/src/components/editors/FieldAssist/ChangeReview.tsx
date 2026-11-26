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
import { clamp } from "lodash";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import { ChipText, StandardIcon, getTokenIconClass } from "../MultiModeExpressionEditor/ChipExpressionEditor/chipStyles";
import { TokenType } from "../MultiModeExpressionEditor/ChipExpressionEditor/types";
import { AppliedMark, AssistFocus, AssistHostValue, ReviewFocus, ReviewSide, ValueDisplay, scrollParent, undoAll } from "./AssistHost";
import { PromptInput } from "./AssistShell";
import { CHANGED_FIELD, S } from "./styles";

export interface DiffPart {
    text: string;
    kind: "same" | "del" | "ins";
}

// Text splits into words, code into names, literals and punctuation; each keeps the spaces after it.
const WORDS = /\S+\s*/g;
const CODE_TOKENS = /(?:"(?:[^"\\]|\\.)*"|`[^`]*`|\w+|[^\s\w])\s*/g;

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

export function isRewrite(parts: DiffPart[]): boolean {
    const length = (kinds: DiffPart["kind"][]) => parts.filter((part) => kinds.includes(part.kind)).reduce((sum, part) => sum + part.text.length, 0);
    const same = length(["same"]);
    const longest = Math.max(length(["same", "del"]), length(["same", "ins"]));
    return longest > 0 && same / longest < REWRITE_SHARE;
}

const shownKeys = () => [...document.querySelectorAll(`[${CHANGED_FIELD}]`)].map((field) => field.getAttribute(CHANGED_FIELD));

function reviewOrder(host: AssistHostValue): string[] {
    const keys = Object.keys(host.applied?.marks ?? {});
    const shown = shownKeys();
    const rank = (key: string) => (shown.includes(key) ? shown.indexOf(key) : shown.length);
    return keys.sort((a, b) => rank(a) - rank(b));
}

// A step to a field in a closed section shows the first change on screen until the section opens.
export function currentReview(host: AssistHostValue): string | undefined {
    const keys = reviewOrder(host);
    return host.reviewKey && keys.includes(host.reviewKey) && shownKeys().includes(host.reviewKey) ? host.reviewKey : keys[0];
}

function revertMark(host: AssistHostValue, fieldKey: string, mark: AppliedMark) {
    const editor = host.assistFields().get(fieldKey);
    if (editor && mark.values) {
        editor.apply(mark.values.before);
    } else {
        mark.revert();
    }
    mark.undone?.();
    host.dropMark(fieldKey);
}

const FIELD_CONTROLS = "input:not([type='hidden']), textarea, select, vscode-text-field, vscode-text-area, vscode-dropdown";

// Where the focus returns after the last decision: the field's Copilot button, else a plain input; an expression editor opens its helper menu on focus.
const FIELD_RETURN = `button[aria-label='Fill this field with Copilot'], ${FIELD_CONTROLS}`;

// After the next layout, so a field whose section the step opens is on the page.
const reveal = (key: string) => requestAnimationFrame(() => requestAnimationFrame(() =>
    document.querySelector(`[${CHANGED_FIELD}="${key}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })));

const CARD_WIDTH = 360;
const CARD_MIN_WIDTH = 260;
const CARD_GAP = 16;
const CARET_TOP = 13;

interface Beside {
    left: number;
    top: number;
    width: number;
    caret: number;
    hidden: boolean;
}

// The card points at the field's value, a code editor's bordered frame or the input, rather than at the label.
function valueBox(field: HTMLElement): HTMLElement {
    let box = field.querySelector<HTMLElement>(".cm-editor");
    if (!box) {
        return field.querySelector<HTMLElement>(FIELD_CONTROLS) ?? field;
    }
    while (box !== field && box.parentElement && getComputedStyle(box).borderTopStyle === "none") {
        box = box.parentElement;
    }
    return box;
}

function besideField(field: HTMLElement, side: ReviewSide, cardHeight: number): Beside | undefined {
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
    field: HTMLElement;
}

export function ChangeCard({ host, fieldKey, mark, field }: ChangeCardProps) {
    const [card, setCard] = useState<HTMLDivElement | null>(null);
    const side = mark.inField ? undefined : host.reviewSide;
    const beside = useBeside(field, side, card);
    const changeCard = (
        <S.ChangeCard
            ref={setCard}
            beside={!!beside}
            data-copilot-card
            role="group"
            aria-label={cardLabel(host, fieldKey, mark)}
            style={beside ? { left: beside.left, top: beside.top, width: beside.width, visibility: beside.hidden ? "hidden" : undefined } : undefined}
        >
            <S.ChangeCaret aria-hidden="true" side={beside ? side : undefined} style={beside ? { top: beside.caret } : undefined} />
            <ChangeCardContent host={host} fieldKey={fieldKey} mark={mark} field={field} hidden={!!beside?.hidden} />
        </S.ChangeCard>
    );
    // Out of the form's flow, so the fields below stay where they are.
    return beside ? createPortal(changeCard, field.ownerDocument.body) : changeCard;
}

function cardLabel(host: AssistHostValue, fieldKey: string, mark: AppliedMark): string {
    const keys = reviewOrder(host);
    const added = changeKind(mark.added ? "" : mark.before, mark.after ?? "", mark.display) === "added";
    return `Copilot change ${keys.indexOf(fieldKey) + 1} of ${keys.length}: ${mark.label}${added ? ", added" : ""}`;
}

function ChangeCardContent({ host, fieldKey, mark, field, hidden }: ChangeCardProps & { hidden: boolean }) {
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
            {mark.note && <S.Note>{mark.note}</S.Note>}
            <S.ChangeActions>
                <S.GhostAction ref={reviseRef} type="button" aria-pressed={revising} title={`Ask Copilot for a different ${mark.label}`} onClick={() => host.setRevising(revising ? undefined : fieldKey)}>
                    <Icon name="bi-ai-chat" sx={{ width: "14px", height: "14px" }} iconSx={{ fontSize: "14px" }} />
                    Revise
                </S.GhostAction>
                <S.Secondary type="button" onClick={() => decide(() => revertMark(host, fieldKey, mark), nextChange)}>{mark.added ? "Remove" : "Undo"}</S.Secondary>
                <S.Primary ref={buttons.keep} type="button" onClick={() => decide(() => host.dropMark(fieldKey), nextChange)}>Keep</S.Primary>
            </S.ChangeActions>
            {revising && <RevisePrompt host={host} focus={{ key: fieldKey, label: mark.label }} earlier={mark.request} onClose={closePrompt} />}
        </>
    );
}

// `earlier` is the request that made the change, so a follow-up such as "shorter" reads against it.
function RevisePrompt({ host, focus, earlier, onClose }: { host: AssistHostValue; focus: AssistFocus; earlier: string; onClose: () => void }) {
    const [draft, setDraft] = useState("");
    const running = host.orbState === "running";
    const send = () => {
        const text = draft.trim();
        if (text && !running) {
            host.liveForm()?.revise(focus, text, earlier);
        }
    };
    return (
        <>
            {running && <S.Status role="status">Working…</S.Status>}
            <PromptInput draft={draft} setDraft={setDraft} placeholder={`Ask for a change to ${focus.label}`} loading={running} onSend={send}
                onStop={() => host.liveForm()?.stop()} onClose={onClose} bordered autoFocus readOnly={running} />
        </>
    );
}

const removedLine = (content: React.ReactNode) => (
    <S.DiffLine kind="remove"><S.LineSign removed>−</S.LineSign><S.OldValue>{content}</S.OldValue></S.DiffLine>
);

const addedLine = (content: React.ReactNode) => (
    <S.DiffLine kind="add"><S.LineSign>+</S.LineSign><S.NewValue>{content}</S.NewValue></S.DiffLine>
);

export function ValueDiff({ before, after }: { before: string; after: string }) {
    const kind = changeKind(before, after, "code");
    if (kind !== "edited") {
        return <>{kind !== "added" && removedLine(before)}{kind !== "cleared" && addedLine(after)}</>;
    }
    const parts = wordDiff(before, after, true);
    const line = (shown: "del" | "ins") => parts
        .filter((part) => part.kind === "same" || part.kind === shown)
        .map((part, index) => (part.kind === shown ? <S.Changed key={index} kind={shown}>{part.text}</S.Changed> : part.text));
    return <>{removedLine(line("del"))}{addedLine(line("ins"))}</>;
}

type ChangeKind = "added" | "edited" | "replaced" | "cleared";

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
        return removedLine(<Value text={before} display={display} />);
    }
    return (
        <S.DiffLine kind="edit">
            <S.NewValue>
                {wordDiff(before, after, display === "code").map((part, index) => (part.kind === "same" ? part.text : <S.Changed key={index} kind={part.kind}>{part.text}</S.Changed>))}
            </S.NewValue>
        </S.DiffLine>
    );
}

function Value({ text, display }: { text: string; display?: ValueDisplay }) {
    return display === "reference" ? (
        <S.WasChip chipType={TokenType.VARIABLE}>
            <StandardIcon chipType={TokenType.VARIABLE} className={getTokenIconClass(TokenType.VARIABLE)} />
            <ChipText>{text.trim()}</ChipText>
        </S.WasChip>
    ) : <>{text}</>;
}
