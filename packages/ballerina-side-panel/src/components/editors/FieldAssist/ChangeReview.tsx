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
import { Codicon } from "@wso2/ui-toolkit";
import { ChipText, StandardIcon, getTokenIconClass } from "../MultiModeExpressionEditor/ChipExpressionEditor/chipStyles";
import { TokenType } from "../MultiModeExpressionEditor/ChipExpressionEditor/types";
import { AppliedMark, AssistHostValue, ReviewSide, ValueDisplay, scrollParent } from "./AssistHost";
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
    // The caret's offset from the card's top, so it points at the field's top.
    caret: number;
    // The field is scrolled out of its form.
    hidden: boolean;
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
    const top = clamp(box.top, CARD_GAP, view.innerHeight - CARD_GAP - cardHeight);
    return {
        left: side === "start" ? to - width : from,
        top,
        width,
        caret: clamp(box.top - top + CARET_TOP, CARET_TOP, cardHeight - 2 * CARET_TOP),
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
    const content = <ChangeCardContent host={host} fieldKey={fieldKey} mark={mark} />;
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
    return `Copilot change ${keys.indexOf(fieldKey) + 1} of ${keys.length}: ${mark.label}`;
}

function ChangeCardContent({ host, fieldKey, mark }: { host: AssistHostValue; fieldKey: string; mark: AppliedMark }) {
    const keepRef = useRef<HTMLButtonElement>(null);
    // A decision moves the card to the next change, which takes the focus so the keyboard can carry on.
    useEffect(() => {
        if (host.reviewFocus.current) {
            host.reviewFocus.current = false;
            keepRef.current?.focus({ preventScroll: true });
        }
    }, []);
    const keys = reviewOrder(host);
    const index = keys.indexOf(fieldKey);
    const step = (by: number) => keys[(index + by + keys.length) % keys.length];
    const moveTo = (key: string | undefined, focus: boolean) => {
        host.reviewFocus.current = focus;
        host.setReviewKey(key);
        if (key) {
            reveal(key);
        }
    };
    const decide = (apply: () => void) => {
        const next = keys.length > 1 ? step(1) : undefined;
        apply();
        moveTo(next, true);
    };
    const several = keys.length > 1;
    return (
        <>
            <S.ChangeCardHead>
                <S.ReviewCount>{several ? `Change ${index + 1} of ${keys.length}` : "Changed by Copilot"}</S.ReviewCount>
                {several && (
                    <>
                        <S.KeepAll type="button" onClick={() => host.setApplied(undefined)}>Keep All</S.KeepAll>
                        <S.HeaderButton type="button" aria-label="Previous Change" title="Previous Change" onClick={() => moveTo(step(-1), false)}>
                            <Codicon name="chevron-up" sx={{ fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
                        </S.HeaderButton>
                        <S.HeaderButton type="button" aria-label="Next Change" title="Next Change" onClick={() => moveTo(step(1), false)}>
                            <Codicon name="chevron-down" sx={{ fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
                        </S.HeaderButton>
                    </>
                )}
            </S.ChangeCardHead>
            <S.ChangeDiff><Diff mark={mark} /></S.ChangeDiff>
            <S.ChangeActions>
                <S.GhostAction type="button" title={`Ask Copilot for a different ${mark.label}`} onClick={() => host.reviseField({ key: fieldKey, label: mark.label })}>
                    <Codicon name="sparkle" sx={{ fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
                    Revise
                </S.GhostAction>
                <S.Secondary type="button" onClick={() => decide(() => revertMark(host, fieldKey, mark))}>{mark.added ? "Remove" : "Undo"}</S.Secondary>
                <S.Primary ref={keepRef} type="button" onClick={() => decide(() => host.dropMark(fieldKey))}>Keep</S.Primary>
            </S.ChangeActions>
        </>
    );
}

// Text and code compare word by word; a reference or a new row shows as the whole old and new value.
function Diff({ mark }: { mark: AppliedMark }) {
    const after = mark.after ?? "";
    if (mark.added) {
        return <ins><Value text={after} display={mark.display} /></ins>;
    }
    if (mark.display === "reference" || !mark.before.trim() || !after.trim()) {
        return (
            <>
                <del><Value text={mark.before} display={mark.display} /></del>{" "}
                <ins><Value text={after} display={mark.display} /></ins>
            </>
        );
    }
    const parts = wordDiff(mark.before, after, mark.display === "code");
    if (isRewrite(parts)) {
        return (
            <S.Rewrite>
                <del>{mark.before}</del>
                <ins>{after}</ins>
            </S.Rewrite>
        );
    }
    return <>{parts.map((part, index) => <DiffText key={index} part={part} />)}</>;
}

function DiffText({ part }: { part: DiffPart }) {
    if (part.kind === "del") {
        return <del>{part.text}</del>;
    }
    return part.kind === "ins" ? <ins>{part.text}</ins> : <>{part.text}</>;
}

// A value as its field shows it: a reference as the editor's chip, code as code, nothing as Empty.
function Value({ text, display }: { text: string; display?: ValueDisplay }) {
    if (!text.trim()) {
        return <S.EmptyValue>Empty</S.EmptyValue>;
    }
    if (display === "reference") {
        return <Reference name={text.trim()} />;
    }
    return display === "code" ? <S.CodeValue>{text}</S.CodeValue> : <>{text}</>;
}

function Reference({ name }: { name: string }) {
    return (
        <S.WasChip chipType={TokenType.VARIABLE}>
            <StandardIcon chipType={TokenType.VARIABLE} className={getTokenIconClass(TokenType.VARIABLE)} />
            <ChipText>{name}</ChipText>
        </S.WasChip>
    );
}
