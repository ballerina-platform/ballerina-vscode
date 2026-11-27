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

import React, { useCallback, useEffect, useState } from "react";
import { Global } from "@emotion/react";
import { scrollParent, useAssistHost } from "./AssistHost";
import type { FormField } from "../../Form/types";
import { ChangeCard, currentReview } from "./ChangeReview";
import { keysWithin } from "./formFields";
import { CHANGED_FIELD, S, changedFieldStyles } from "./styles";

// `expanded` is the mark in the field's expanded editor, which takes the review card while that editor is open.
export function AssistMark({ fieldKey, expanded = false }: { fieldKey: string; expanded?: boolean }) {
    const host = useAssistHost();
    const mark = host?.applied?.marks[fieldKey];
    const [field, setField] = useState<HTMLElement | null>(null);
    const markRef = useCallback((span: HTMLSpanElement | null) => setField(span?.parentElement ?? null), []);
    // Typing or picking in the field is an edit; a change the form makes itself, which a checkbox or list also announces, is not.
    useEffect(() => {
        if (!mark || !field) {
            return;
        }
        field.setAttribute(CHANGED_FIELD, fieldKey);
        const stopReveal = host?.reveal.current?.includes(fieldKey) ? revealField(field, host.reveal) : undefined;
        // The field's own Copilot and its review card open inside the field; typing a request there is not an edit.
        const inCopilot = (event: Event) => !!(event.target as Element).closest?.(".copilot-panel, [data-copilot-card]");
        let touched = false;
        const touch = (event: Event) => {
            touched ||= !inCopilot(event);
        };
        const edited = (event: Event) => {
            if (touched && !inCopilot(event)) {
                host?.dropMark(fieldKey);
            }
        };
        // Focusing a changed field brings its review card, so the user needn't step to it with the arrows.
        const focused = () => host?.setReviewKey(fieldKey);
        const listeners: [string, (event: Event) => void, boolean][] = [
            ["pointerdown", touch, true], ["keydown", touch, true], ["input", edited, true], ["change", edited, true], ["focusin", focused, false],
        ];
        listeners.forEach(([type, listener, capture]) => field.addEventListener(type, listener, capture));
        return () => {
            stopReveal?.();
            field.removeAttribute(CHANGED_FIELD);
            listeners.forEach(([type, listener, capture]) => field.removeEventListener(type, listener, capture));
        };
    }, [mark, fieldKey, field]);
    if (!host || !mark) {
        return null;
    }
    return (
        <>
            <span ref={markRef} hidden><Global styles={changedFieldStyles} /></span>
            {field && currentReview(host) === fieldKey && (host.expandedKey === fieldKey) === expanded && <ChangeCard host={host} fieldKey={fieldKey} mark={mark} field={field} inline={expanded} />}
        </>
    );
}

const USER_INPUT = ["wheel", "pointerdown", "keydown", "touchstart"];

// A rebuilt form lays its fields out over several frames, pushing this one down; it stays in view until the user takes over.
function revealField(field: HTMLElement, reveal: React.MutableRefObject<string[] | undefined>): () => void {
    reveal.current = undefined;
    const scroller = scrollParent(field);
    // Centred when it is out of view or in the lower third, where the review card beside it gets cut off; it settles instead of chasing every layout step.
    const observer = new ResizeObserver(() => {
        const box = field.getBoundingClientRect();
        const view = scroller?.getBoundingClientRect();
        if (box.height && view && (box.top < view.top || box.bottom > view.top + view.height * 2 / 3)) {
            field.scrollIntoView({ block: "center" });
        }
    });
    observer.observe(field);
    // Whatever sits above the field moves it when it grows.
    for (let node: Element | null = field; node && node !== scroller; node = node.parentElement) {
        for (let above = node.previousElementSibling; above; above = above.previousElementSibling) {
            observer.observe(above);
        }
    }
    const stop = () => {
        observer.disconnect();
        USER_INPUT.forEach((type) => scroller?.removeEventListener(type, stop));
    };
    USER_INPUT.forEach((type) => scroller?.addEventListener(type, stop, { passive: true }));
    return stop;
}

export function useCopilotChanged(fieldKeys: string[]): boolean {
    const changes = useAssistHost()?.applied?.changes;
    return !!changes && Object.values(changes).some((keys) => keys.some((key) => fieldKeys.includes(key)));
}

// `keys` names a section's parts that are not form fields, e.g. a custom toggle's Copilot slot.
export function SectionChanges({ fields = [], keys, onReveal }: { fields?: FormField[]; keys?: string[]; onReveal: () => void }) {
    const host = useAssistHost();
    const fieldKeys = keys ?? keysWithin(fields);
    const marks = host?.applied?.marks;
    const count = fieldKeys.filter((key) => marks?.[key]).length;
    const reviewed = !!host?.reviewKey && fieldKeys.includes(host.reviewKey);
    useEffect(() => {
        if (count || reviewed) {
            onReveal();
        }
    }, [count, reviewed, host?.reviewKey]);
    return count ? <S.Tag>{count === 1 ? "1 Change" : `${count} Changes`}</S.Tag> : null;
}
