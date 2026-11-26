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

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clamp } from "lodash";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import { AgentRunState, AssistFlowChange, ExpressionProperty, FormAssistResponse, Imports, webviewAssistantName } from "@wso2/ballerina-core";
import type { FormField } from "../../Form/types";
import type { FormAssistDescription } from "./FormAssist";
import type { FieldThread } from "./FieldAssist";
import { FormWriter, describeForm, treeFields, writeFields } from "./formFields";
import { S } from "./styles";

// One Copilot thread per form host: a field opens it in a card under itself, the header button in a popover under the button.

export const FORM_SCOPE = "__form__";
const EXIT_MS = 120;

export interface AssistFocus {
    key: string;
    label: string;
}

export interface FormController {
    parts: () => string[];
    handOff: (messages: string[], focus?: AssistFocus, pending?: string) => void;
    // Asks for a different value for one changed field, from its change card; false when the request was held back.
    revise: (focus: AssistFocus, instruction: string, earlier?: string) => boolean;
    stop: () => void;
    // Whether a required value is still empty, which is when the header's hint shows.
    needsValues: () => boolean;
    describe: () => FormAssistDescription;
    apply: (response: FormAssistResponse) => void;
    // Hands a request to the main Copilot with notes it reads but the user does not see; undefined where the form can't.
    continueInChat?: (request: string, context: string) => void;
}

// How a value reads outside its field: text with its inserted values as chips, a reference as a chip, or code.
export type ValueDisplay = "text" | "reference" | "code";

// The side of the form a change card sits on when it fits there: a side panel's canvas side, or a page's empty margin.
export type ReviewSide = "start" | "end";

export interface AppliedMark {
    before: string;
    display?: ValueDisplay;
    // A row Copilot added, which has no earlier value.
    added?: boolean;
    sample?: boolean;
    request: string;
    source?: string;
    revert: () => void;
    // Runs once the value is back, however it was put back, e.g. to remove a configurable the change added.
    undone?: () => void;
    label: string;
    after?: string;
    // The field's values as expressions, so its own editor can swap them without rebuilding the form.
    values?: { before: string; after: string };
    // Made by the field's own Copilot, so its card stays under the field where the request was typed.
    inField?: boolean;
    note?: string;
    // The part of the request the value could not do, which the main Copilot can carry on.
    handoff?: AssistFlowChange;
}

// The form's thread, kept by the host so it survives the form rebuilding itself after a change.
export interface FormThread {
    formId: string;
    history: string[];
    marks: Map<number, string>;
    reply?: string;
    // What the last turn changed, e.g. "Changed Role and Instructions."
    changed?: string;
    // A hand-off that came with values, which rebuild the form.
    handoff?: AssistFlowChange;
}

export interface AppliedChanges {
    formId: string;
    // Each change's mark keys, across the thread's turns; a change counts while any of its marks shows.
    changes: Record<string, string[]>;
    request: string;
    note?: string;
    marks: Record<string, AppliedMark>;
    // Puts the fields back, rows within `form`, and removes what the changes created outside the form, e.g. a configurable.
    revert: (keys: string[], form?: FormAssistDescription) => FormAssistResponse;
}

// The button the review card focuses when it shows: Keep after a decision or a new change, the arrow after a step.
export type ReviewFocus = "keep" | "previous" | "next";

type OrbState = Extract<AgentRunState, "running" | "awaiting-input" | "error">;

export interface FormErrors {
    fields: { label: string; messages: string[] }[];
    outside: string[];
}

const FIX_REQUEST = "Fix the errors in this form";

// One field's error has that field's own Fix; the form's Copilot is for several, or one no field holds.
export const offersFix = (errors?: FormErrors) => !!errors && (errors.fields.length > 1 || errors.outside.length > 0);

export const errorLines = (errors?: FormErrors): string[] => [
    ...(errors?.fields.flatMap(({ label, messages }) => messages.map((message) => `${label}: ${message}`)) ?? []),
    ...(errors?.outside ?? []),
];

// Something the form offers beyond its values, e.g. Attach Listener: it opens another form with a request for that form's Copilot.
export interface AssistAction {
    label: string;
    description: string;
    open: (request: string) => void;
}

// Values beyond the editors on screen, e.g. a form's whole field tree; `apply` gets only this source's values and groups.
interface AssistFieldSource {
    describe: () => Pick<FormAssistDescription, "slots" | "groups">;
    apply: (change: Pick<FormAssistResponse, "values" | "groups" | "imports">) => void;
}

interface AssistField {
    label: string;
    description?: string;
    property: () => ExpressionProperty;
    value: () => string;
    apply: (value: string, imports?: Record<string, string>) => void;
}

export interface AssistHostValue {
    scope?: string;
    // Kept through the exit, so the closing card still shows its thread.
    shownScope?: string;
    cardScope?: string;
    closing: boolean;
    open: (scope: string, label?: string) => void;
    close: () => void;
    release: (card: string) => void;
    // Registers the form helper; returns its unregister, so a remount never clears its successor.
    registerForm: (controller: FormController) => () => void;
    // The mounted form helper; a form that remounts after Apply replaces the one that applied.
    liveForm: () => FormController | undefined;
    handOff: (messages: string[], focus: AssistFocus, pending?: string) => void;
    formReady: boolean;
    formOpen: boolean;
    formShown: boolean;
    registerField: (key: string, field: AssistField) => () => void;
    // A field's own Copilot thread, which takes Revise for a change it made; returns its unregister.
    registerFieldThread: (key: string, revise: (instruction: string) => boolean) => () => void;
    // Revises a change in the thread of the field that made it; false when the field has no thread here.
    reviseInField: (key: string, instruction: string) => boolean;
    // A field's requests so far, kept here so they outlive the field's editor.
    fieldThread: (key: string) => FieldThread;
    registerAction: (id: string, action: AssistAction) => () => void;
    assistActions: () => Map<string, AssistAction>;
    // Opens the form's thread with a request once the form is ready, e.g. from another form's action.
    ask: (request: string) => void;
    // The one form-level box a host shows, however many forms it holds.
    dockOwner?: object;
    claimDock: (owner: object) => () => void;
    assistFields: () => Map<string, AssistField>;
    fieldCount: number;
    registerFieldSource: (source: AssistFieldSource) => () => void;
    fieldSources: () => AssistFieldSource[];
    sourceCount: number;
    body: HTMLElement | null;
    setBody: (body: HTMLElement | null) => void;
    draft: string;
    setDraft: (draft: string) => void;
    orb: HTMLElement | null;
    setOrb: (orb: HTMLElement | null) => void;
    orbState?: OrbState;
    setOrbState: (state?: OrbState) => void;
    formThread: React.MutableRefObject<FormThread | undefined>;
    // The fields the latest change touched; the first of them to show scrolls into view.
    reveal: React.MutableRefObject<string[] | undefined>;
    // The rebuilt form's thread takes focus back when the user was typing in it as the change landed.
    refocus: React.MutableRefObject<boolean>;
    // The change the review card sits under, and whether the card takes the focus when it moves there.
    reviewKey?: string;
    setReviewKey: (key?: string) => void;
    reviewFocus: React.MutableRefObject<ReviewFocus | undefined>;
    revising?: string;
    setRevising: (key?: string) => void;
    // Where the card goes when there is room beside the form; under the field otherwise.
    reviewSide?: ReviewSide;
    applied?: AppliedChanges;
    setApplied: React.Dispatch<React.SetStateAction<AppliedChanges | undefined>>;
    dropMark: (key: string) => void;
    formErrors?: FormErrors;
    setFormErrors: (errors?: FormErrors) => void;
}

const AssistHostContext = createContext<AssistHostValue | undefined>(undefined);

export const useAssistHost = () => useContext(AssistHostContext);

// The app's own Copilot orb, so the form's orb looks and moves like the one on the diagram.
const AssistOrbContext = createContext<((state: AgentRunState) => React.ReactNode) | undefined>(undefined);
export const AssistOrbProvider = AssistOrbContext.Provider;

const ORB_ICON = <Icon name="bi-ai-chat" sx={{ width: "16px", height: "16px" }} iconSx={{ fontSize: "16px" }} />;

const POPOVER_OPENED = "bi-anchored-popover-opened";

function useExclusivePopover(open: boolean, close: () => void) {
    const id = useRef(Symbol("popover"));
    const closeRef = useRef(close);
    closeRef.current = close;
    useEffect(() => {
        if (!open) {
            return;
        }
        document.dispatchEvent(new CustomEvent(POPOVER_OPENED, { detail: id.current }));
        const onOther = (event: Event) => (event as CustomEvent).detail !== id.current && closeRef.current();
        document.addEventListener(POPOVER_OPENED, onOther);
        return () => document.removeEventListener(POPOVER_OPENED, onOther);
    }, [open]);
}

export function AssistHostContent({ scope, children }: { scope: string; children: React.ReactNode }) {
    const host = useAssistHost();
    return host?.shownScope === scope && host.body ? createPortal(children, host.body) : null;
}

// Uncounted registries never re-render the host.
function useRegistry<K, T>(counted = true) {
    const items = useRef(new Map<K, T>());
    const [count, setCount] = useState(0);
    const register = useCallback((key: K, item: T) => {
        items.current.set(key, item);
        counted && setCount(items.current.size);
        return () => {
            if (items.current.get(key) === item) {
                items.current.delete(key);
                counted && setCount(items.current.size);
            }
        };
    }, []);
    const all = useCallback(() => items.current, []);
    return { register, all, count };
}

interface AssistHostProviderProps {
    children: React.ReactNode;
    review?: ReviewSide;
}

export function AssistHostProvider({ children, review }: AssistHostProviderProps) {
    const [scope, setScope] = useState<string>();
    const [scopeLabel, setScopeLabel] = useState<string>();
    // The field whose card holds the thread; a whole-form request handed over from a field stays in that field's card.
    const [cardScope, setCardScope] = useState<string>();
    const cardScopeRef = useRef<string>();
    cardScopeRef.current = cardScope;
    const [closing, setClosing] = useState(false);
    const formRef = useRef<FormController>();
    const [formReady, setFormReady] = useState(false);
    const [asked, setAsked] = useState<string>();
    const registerForm = useCallback((controller: FormController) => {
        formRef.current = controller;
        setFormReady(true);
        return () => {
            if (formRef.current === controller) {
                formRef.current = undefined;
                setFormReady(false);
            }
        };
    }, []);
    const liveForm = useCallback(() => formRef.current, []);
    const [orbState, setOrbState] = useState<OrbState>();
    const [applied, setApplied] = useState<AppliedChanges>();
    const dropMark = useCallback((key: string) => setApplied((current) => {
        if (!current?.marks[key]) {
            return current;
        }
        const { [key]: _dropped, ...marks } = current.marks;
        return { ...current, marks };
    }), []);
    const formThread = useRef<FormThread>();
    const reveal = useRef<string[]>();
    const refocus = useRef(false);
    const [orb, setOrb] = useState<HTMLElement | null>(null);
    const [reviewKey, setReviewKey] = useState<string>();
    const reviewFocus = useRef<ReviewFocus>();
    const [revising, setRevising] = useState<string>();
    const handOff = useCallback((messages: string[], focus: AssistFocus, pending?: string) => {
        setScope(FORM_SCOPE);
        setScopeLabel(focus.label);
        formRef.current?.handOff(messages, focus, pending);
    }, []);
    const fields = useRegistry<string, AssistField>();
    const sources = useRegistry<AssistFieldSource, AssistFieldSource>();
    const registerFieldSource = useCallback((source: AssistFieldSource) => sources.register(source, source), [sources.register]);
    const fieldSources = useCallback(() => [...sources.all().values()], [sources.all]);
    const actions = useRegistry<string, AssistAction>(false);
    const fieldThreads = useRegistry<string, (instruction: string) => boolean>(false);
    const keptThreads = useRef(new Map<string, Omit<FieldThread, "keep">>());
    const fieldThread = useCallback((key: string): FieldThread => {
        const kept = keptThreads.current.get(key) ?? { history: [], marks: new Map() };
        keptThreads.current.set(key, kept);
        return { ...kept, keep: (history) => { kept.history = history; } };
    }, []);
    const reviseInField = useCallback((key: string, instruction: string) => !!fieldThreads.all().get(key)?.(instruction), [fieldThreads.all]);
    const [dockOwner, setDockOwner] = useState<object>();
    const claimDock = useCallback((owner: object) => {
        setDockOwner((current) => current ?? owner);
        return () => setDockOwner((current) => (current === owner ? undefined : current));
    }, []);
    const [body, setBody] = useState<HTMLElement | null>(null);
    const [draft, setDraft] = useState("");
    const [formErrors, setFormErrors] = useState<FormErrors>();

    const reset = useCallback(() => {
        setScope(undefined);
        setCardScope(undefined);
        setClosing(false);
        setDraft("");
    }, []);
    const open = useCallback((next: string, label?: string) => {
        setClosing(false);
        setScope(next);
        setScopeLabel(label);
        setCardScope(next === FORM_SCOPE ? undefined : next);
    }, []);
    const close = useCallback(() => setClosing(true), []);
    // A card whose field went away, e.g. the panel moved to another node, ends its thread at once.
    const release = useCallback((card: string) => cardScopeRef.current === card && reset(), [reset]);
    // Unmounts once the exit has played; animationend is not dependable in a background webview.
    useEffect(() => {
        if (!closing) {
            return;
        }
        const timer = setTimeout(reset, EXIT_MS);
        return () => clearTimeout(timer);
    }, [closing, reset]);

    useEffect(() => {
        if (asked && formReady) {
            setAsked(undefined);
            open(FORM_SCOPE);
            formRef.current?.handOff([asked]);
        }
    }, [asked, formReady, open]);

    // Opened from the header: the whole form, with no field in focus, docked at the form's top.
    const docked = scope === FORM_SCOPE && !scopeLabel;
    useExclusivePopover(!!scope && !closing && !docked, close);

    const formOpen = docked && !closing;
    const value = useMemo<AssistHostValue>(() => ({
        scope: closing ? undefined : scope,
        shownScope: scope,
        cardScope,
        closing,
        open,
        close,
        release,
        registerForm,
        liveForm,
        handOff,
        formReady,
        formOpen,
        formShown: docked,
        registerField: fields.register,
        registerFieldThread: fieldThreads.register,
        reviseInField,
        fieldThread,
        assistFields: fields.all,
        fieldCount: fields.count,
        registerFieldSource,
        fieldSources,
        sourceCount: sources.count,
        dockOwner,
        claimDock,
        registerAction: actions.register,
        assistActions: actions.all,
        ask: setAsked,
        body,
        setBody,
        draft,
        setDraft,
        orb,
        setOrb,
        orbState,
        setOrbState,
        formThread,
        reveal,
        refocus,
        reviewKey,
        setReviewKey,
        reviewFocus,
        revising,
        setRevising,
        reviewSide: review,
        applied,
        setApplied,
        dropMark,
        formErrors,
        setFormErrors,
    }), [scope, cardScope, closing, open, close, release, registerForm, handOff, formReady, formOpen, docked, fields.register, fields.all, fields.count, fieldThreads.register, reviseInField, fieldThread, registerFieldSource, fieldSources, sources.count, dockOwner, claimDock, actions.register, actions.all, body, draft, orb, orbState, reviewKey, revising, review, applied, dropMark, formErrors]);

    return <AssistHostContext.Provider value={value}>{children}</AssistHostContext.Provider>;
}

// The thread's card, in the form's flow under the field it belongs to, so it pushes the fields below down.
export function AssistCard({ scope }: { scope: string }) {
    const host = useAssistHost();
    const here = host?.cardScope === scope;
    const release = host?.release;
    useEffect(() => (here && release ? () => release(scope) : undefined), [here, release, scope]);
    if (!here) {
        return null;
    }
    const fieldScoped = host.shownScope !== FORM_SCOPE;
    return (
        <AssistCardFrame closing={host.closing} gap headless={fieldScoped} onClose={host.close}>
            <S.PopoverBody ref={host.setBody} />
        </AssistCardFrame>
    );
}

interface AssistCardFrameProps {
    closing?: boolean;
    gap?: boolean;
    // The field's own label and Copilot button already name and toggle the card.
    headless?: boolean;
    onClose: () => void;
    onClear?: () => void;
    children: React.ReactNode;
}

export function AssistCardFrame({ closing, gap, headless, onClose, onClear, children }: AssistCardFrameProps) {
    return (
        <S.Reveal closing={closing} gap={gap}>
            <div>
                <S.Card role="region" aria-label="Copilot">
                    {!headless && <Header onClose={onClose} onClear={onClear} />}
                    {children}
                </S.Card>
            </div>
        </S.Reveal>
    );
}

export function usePresence(open: boolean) {
    const [shown, setShown] = useState(open);
    useEffect(() => {
        if (open) {
            setShown(true);
            return;
        }
        const timer = setTimeout(() => setShown(false), EXIT_MS);
        return () => clearTimeout(timer);
    }, [open]);
    return { shown: open || shown, closing: !open && shown };
}

function Header({ onClose, onClear }: { onClose: () => void; onClear?: () => void }) {
    return (
        <S.PopoverHeader className="copilot-header">
            {ORB_ICON}
            <S.PopoverTitle>{webviewAssistantName()}</S.PopoverTitle>
            <S.HeaderSpacer />
            {onClear && (
                <S.HeaderButton type="button" title="Clear Chat" aria-label="Clear chat" onClick={onClear}>
                    <Codicon name="clear-all" sx={{ fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
                </S.HeaderButton>
            )}
            <S.HeaderButton type="button" title="Close (Esc)" aria-label="Close" onClick={onClose}>
                <Codicon name="close" sx={{ fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
            </S.HeaderButton>
        </S.PopoverHeader>
    );
}

export const liveChangeCount = (applied?: AppliedChanges): number =>
    applied ? Object.values(applied.changes).filter((keys) => keys.some((key) => applied.marks[key])).length : 0;

// A field under review takes its Copilot requests in the review card, so each field has one place to ask.
export function reviseInCard(host: AssistHostValue | undefined, key: string): boolean {
    if (!host?.applied?.marks[key]) {
        return false;
    }
    host.setReviewKey(key);
    host.setRevising(host.revising === key ? undefined : key);
    return true;
}

export function undoAll(host: AssistHostValue) {
    const applied = host.applied;
    if (applied) {
        const form = host.liveForm();
        form?.apply(applied.revert(Object.keys(applied.marks), form.describe()));
        Object.values(applied.marks).filter((mark) => mark.inField).forEach((mark) => mark.revert());
    }
    host.setApplied(undefined);
}

// Adds a change the field's own Copilot made; a field changed before keeps its first value, so Undo goes back to it.
export function withFieldChange(current: AppliedChanges | undefined, key: string, mark: AppliedMark): AppliedChanges {
    const older = current?.marks[key];
    const merged = older ? { ...mark, before: older.before, display: older.display, revert: older.revert, values: older.values && mark.values && { before: older.values.before, after: mark.values.after } } : mark;
    return {
        formId: current?.formId ?? "",
        changes: { ...current?.changes, [`field:${key}`]: [key] },
        request: mark.request,
        note: current?.note,
        marks: { ...current?.marks, [key]: { ...merged, inField: true } },
        // The form puts back only what it changed; this field's own Undo puts back its value.
        revert: (keys, form) => current?.revert(keys.filter((other) => other !== key && !!current.marks[other]), form) ?? {},
    };
}

export function AssistDock({ closing, onClose, onClear, children }: { closing?: boolean; onClose: () => void; onClear?: () => void; children: React.ReactNode }) {
    const orb = useAssistHost()?.orb;
    const card = <AssistCardFrame closing={closing} onClose={onClose} onClear={onClear}>{children}</AssistCardFrame>;
    return orb ? createPortal(<OrbPopover orb={orb} closing={closing}>{card}</OrbPopover>, orb.ownerDocument.body) : card;
}

const POPOVER_WIDTH = 390;
const POPOVER_MARGIN = 20;
const CARET_GAP = 10;
// The popover reaches past the orb, so the caret sits on its straight top edge, clear of the rounded corner.
const CARET_INSET = 12;
const CARET_MIN = 26;
// An orb near the window edge, like a full page's title bar orb, has no room for both; the caret moves onto the corner's curve.
const EDGE_MARGIN = 8;
const EDGE_CARET_MIN = 18;

function placeUnder(viewWidth: number, rect: DOMRect): { right: number; caret: number } {
    const room = viewWidth - (rect.left + rect.width / 2);
    if (room - CARET_MIN >= POPOVER_MARGIN) {
        const right = Math.max(POPOVER_MARGIN, viewWidth - rect.right - CARET_INSET);
        return { right, caret: Math.max(CARET_MIN, room - right) };
    }
    const right = Math.max(EDGE_MARGIN, room - CARET_MIN);
    return { right, caret: Math.max(EDGE_CARET_MIN, room - right) };
}

interface Anchored {
    top: number;
    right: number;
    width: number;
    caret: number;
}

const maxHeight = (view: Window, top: number) => ({ ["--popover-max-height" as string]: `${view.innerHeight - top - POPOVER_MARGIN}px` });

function useAnchor(orb: HTMLElement) {
    const [anchored, setAnchored] = useState<Anchored>();
    useLayoutEffect(() => {
        const view = orb.ownerDocument.defaultView;
        const update = () => {
            const rect = orb.getBoundingClientRect();
            setAnchored({
                top: rect.bottom + CARET_GAP,
                width: Math.min(POPOVER_WIDTH, view.innerWidth - 2 * POPOVER_MARGIN),
                ...placeUnder(view.innerWidth, rect),
            });
        };
        update();
        view.addEventListener("resize", update);
        view.addEventListener("scroll", update, true);
        return () => {
            view.removeEventListener("resize", update);
            view.removeEventListener("scroll", update, true);
        };
    }, [orb]);
    return anchored;
}

// Dragging the header detaches the popover; it stays inside the window and re-attaches on the next open.
function useHeaderDrag(setMoved: (place: { left: number; top: number }) => void) {
    return (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (event.button !== 0 || !target.closest(".copilot-header") || target.closest("button")) {
            return;
        }
        event.preventDefault();
        const box = event.currentTarget.getBoundingClientRect();
        const view = event.currentTarget.ownerDocument.defaultView;
        const grab = { x: event.clientX - box.left, y: event.clientY - box.top };
        const move = (next: PointerEvent) => setMoved({
            left: clamp(next.clientX - grab.x, 0, view.innerWidth - box.width),
            top: clamp(next.clientY - grab.y, 0, view.innerHeight - 48),
        });
        const end = () => {
            view.removeEventListener("pointermove", move);
            view.removeEventListener("pointerup", end);
        };
        view.addEventListener("pointermove", move);
        view.addEventListener("pointerup", end);
    };
}

function OrbPopover({ orb, closing, children }: { orb: HTMLElement; closing?: boolean; children: React.ReactNode }) {
    const anchored = useAnchor(orb);
    const [moved, setMoved] = useState<{ left: number; top: number }>();
    const startDrag = useHeaderDrag(setMoved);
    if (!anchored) {
        return null;
    }
    const view = orb.ownerDocument.defaultView;
    const style: React.CSSProperties = moved
        ? { left: moved.left, top: moved.top, width: anchored.width, ...maxHeight(view, moved.top) }
        : { top: anchored.top, right: anchored.right, width: anchored.width, ...maxHeight(view, anchored.top) };
    // A double-click on the header docks it back under the orb.
    const dock = (event: React.MouseEvent) => (event.target as HTMLElement).closest(".copilot-header") && setMoved(undefined);
    return (
        <S.OrbPopover style={style} closing={closing} detached={!!moved} onPointerDown={startDrag} onDoubleClick={dock}>
            {!moved && <S.PopoverCaret aria-hidden="true" style={{ right: anchored.caret - 6 }} />}
            {children}
        </S.OrbPopover>
    );
}

const HINT_USED_KEY = "wso2.copilot.formChangeApplied";
const HINT_MS = 4000;

function hintUsed(): boolean {
    try {
        return localStorage.getItem(HINT_USED_KEY) === "1";
    } catch {
        return true;
    }
}

function markHintUsed() {
    try {
        localStorage.setItem(HINT_USED_KEY, "1");
    } catch {
        // Blocked storage reads as used, so there is nothing to keep.
    }
}

function useFormHint(ready: boolean, needsValues: () => boolean, formOpen: boolean, applied: boolean) {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        if (!ready || hintUsed() || !needsValues()) {
            return;
        }
        setShown(true);
        const timer = setTimeout(() => setShown(false), HINT_MS);
        return () => clearTimeout(timer);
    }, [ready]);
    useEffect(() => {
        if (formOpen) {
            setShown(false);
        }
    }, [formOpen]);
    useEffect(() => {
        if (applied) {
            markHintUsed();
        }
    }, [applied]);
    return shown;
}

export function AssistHeaderButton() {
    const host = useAssistHost();
    const hint = useFormHint(!!host?.formReady, () => !!host?.liveForm()?.needsValues(), !!host?.formOpen, !!host?.applied);
    const orbFace = useContext(AssistOrbContext);
    if (!host?.formReady) {
        return null;
    }
    const working = host.orbState === "running";
    const errors = !working && !host.formOpen && offersFix(host.formErrors) ? errorLines(host.formErrors).length : 0;
    const face = orbFace?.(errors ? "idle" : host.orbState ?? "idle") ?? ORB_ICON;
    if (errors) {
        const fixErrors = () => {
            host.open(FORM_SCOPE);
            host.liveForm()?.handOff([FIX_REQUEST]);
        };
        // Keyed apart from the toggle, so switching mounts a fresh button; the bubble stays until the errors change or the thread opens.
        return (
            <S.HeaderOrb key="fix" ref={host.setOrb} type="button" aria-label={`Fix ${errors} Errors with Copilot`} onClick={fixErrors}>
                {face}
                <S.OrbHint aria-hidden="true" shown>{errors === 1 ? "1 error. Fix it with Copilot." : `${errors} errors. Fix them with Copilot.`}</S.OrbHint>
            </S.HeaderOrb>
        );
    }
    return (
        <S.HeaderOrb ref={host.setOrb} type="button" aria-label={working ? "Copilot is working" : "Fill this form with Copilot"}
            aria-pressed={host.formOpen} aria-busy={working} onClick={() => (host.formOpen ? host.close() : host.open(FORM_SCOPE))}>
            {face}
            <S.OrbHint aria-hidden="true" shown={hint}>Use Copilot to fill this form</S.OrbHint>
            {!hint && <S.OrbTip aria-hidden="true">Fill this form with Copilot</S.OrbTip>}
        </S.HeaderOrb>
    );
}

export function UndoAllButton({ onClick }: { onClick: () => void }) {
    return (
        <S.HeaderButton type="button" title="Undo All" aria-label="Undo All" onClick={onClick}>
            <Icon name="bi-undo" sx={{ fontSize: "14px", width: "14px", height: "14px" }} iconSx={{ fontSize: "14px" }} />
        </S.HeaderButton>
    );
}

export function scrollParent(element: HTMLElement): HTMLElement | null {
    let parent = element.parentElement;
    while (parent && !/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
        parent = parent.parentElement;
    }
    return parent;
}

export function FormErrorReport({ errors }: { errors: FormErrors }) {
    const host = useAssistHost();
    const key = JSON.stringify(errors);
    useEffect(() => {
        host?.setFormErrors(errors);
        return () => host?.setFormErrors(undefined);
    }, [key, host?.setFormErrors]);
    return null;
}

export function AssistActionEntry({ id, label, description, open }: AssistAction & { id: string }) {
    const host = useAssistHost();
    const openRef = useRef(open);
    openRef.current = open;
    useEffect(() => host?.registerAction(id, { label, description, open: (request) => openRef.current(request) }),
        [host?.registerAction, id, label, description]);
    return null;
}

interface AssistFieldTreeProps {
    fields: FormField[];
    form: FormWriter;
    toProperty: (field: FormField) => ExpressionProperty;
    updateImports?: (key: string, imports: Imports) => void;
}

export function useAssistSource(source: AssistFieldSource) {
    const host = useAssistHost();
    const latest = useRef(source);
    latest.current = source;
    useEffect(() => host?.registerFieldSource({
        describe: () => latest.current.describe(),
        apply: (change) => latest.current.apply(change),
    }), [host?.registerFieldSource]);
}

export function AssistFieldTree({ fields, form, toProperty, updateImports }: AssistFieldTreeProps) {
    useAssistSource({
        describe: () => describeForm(treeFields(fields), form.getValues(), toProperty),
        apply: ({ values = {}, groups = {}, imports }) => {
            const [first] = writeFields(treeFields(fields), { ...groups, ...values }, form);
            if (first && imports) {
                updateImports?.(first, imports);
            }
        },
    });
    return null;
}

export function AssistAsk({ request }: { request: string }) {
    const host = useAssistHost();
    useEffect(() => host?.ask(request), [request, host?.ask]);
    return null;
}
