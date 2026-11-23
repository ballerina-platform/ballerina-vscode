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
import { Codicon } from "@wso2/ui-toolkit";
import { FormAssistAction, FormAssistFlowChange, FormAssistGroup, FormAssistQuestion, FormAssistResponse, FormAssistSlot, alignRows } from "@wso2/ballerina-core";
import { AssistShell } from "./AssistShell";
import { AppliedChanges, AppliedMark, AssistDock, liveChangeCount, undoAll, AssistFocus, AssistHostContent, FORM_SCOPE, FormController, FormThread, ValueDisplay, errorLines, useAssistHost, UndoAllButton } from "./AssistHost";
import { SECRET_IN_PROMPT, newRequestId, noChange } from "./FieldAssist";
import { isSensitiveField, looksLikeCredential, shouldWithhold } from "./secretGuard";
import { S } from "./styles";

export interface FormAssistDescription {
    slots: FormAssistSlot[];
    groups: FormAssistGroup[];
    actions?: FormAssistAction[];
}

// What a request carries besides the form: where it was asked from, the earlier messages, and an unapplied suggestion.
export interface FormAssistContext {
    focus?: AssistFocus;
    earlier?: string[];
    pending?: string;
    // The question Copilot asked last, which the instruction answers.
    asked?: string;
    errors?: string[];
}

export type RunFormAssist = (instruction: string, description: FormAssistDescription, requestId: string, context: FormAssistContext) => Promise<FormAssistResponse>;

interface FormAssistProps {
    // The form's current values, as the request and the change list read them.
    describe: () => FormAssistDescription;
    run: RunFormAssist;
    abort?: (requestId: string) => void;
    onApply: (response: FormAssistResponse) => void;
    // Which form this is, so another form's change marks are cleared.
    formId?: string;
    // What the empty thread says the form's Copilot does, and the prompts it offers.
    intro?: FormAssistIntro;
    // Hands a change outside the form to the main Copilot, with the form's values as plain lines; the form then closes.
    onContinueInChat?: (request: string, values: string[], context?: string) => void;
}

interface Proposal {
    response: FormAssistResponse;
    // The form before this turn, so each change knows what it replaces.
    before: FormAssistDescription;
}

export interface FormAssistIntro {
    hint: string;
    starters: string[];
}

const NODE_INTRO: FormAssistIntro = {
    hint: "Describe what you need, and Copilot will help fill in this form.",
    starters: [],
};
const STOPPED = "Stopped. No fields changed.";
const UNDONE = "Undid all changes.";
const NOT_DONE = "(not done)";
const EXPLAINED = "(explained, nothing changed)";
// How the next request marks a turn that changed nothing; one that proposed changes gets no mark.
const turnMark = (response: FormAssistResponse): string | undefined =>
    response.explanation ? EXPLAINED : response.question || response.declined ? NOT_DONE : undefined;

// The thread's state, written through to the host: applying a change can rebuild the form before any effect runs.
function useFormThread(formId: string) {
    const host = useAssistHost();
    const saved = host?.formThread.current?.formId === formId ? host.formThread.current : undefined;
    const [history, setHistoryState] = useState<string[]>(saved?.history ?? []);
    // Turns in `history` that changed nothing, by index, with the mark the next request carries.
    const marksRef = useRef(saved?.marks ?? new Map<number, string>());
    const [reply, setReplyState] = useState<string | undefined>(saved?.reply);
    const [changed, setChangedState] = useState<string | undefined>(saved?.changed);
    const keep = (next: Partial<FormThread>) => {
        if (host) {
            const current = host.formThread.current?.formId === formId ? host.formThread.current : { formId, history: [] };
            host.formThread.current = { ...current, marks: marksRef.current, ...next };
        }
    };
    const setHistory = (next: string[]) => {
        keep({ history: next });
        setHistoryState(next);
    };
    const setReply = (next?: string) => {
        keep({ reply: next });
        setReplyState(next);
    };
    const setChanged = (next?: string) => {
        keep({ changed: next });
        setChangedState(next);
    };
    return { history, setHistory, marksRef, reply, setReply, changed, setChanged };
}

// Takes over a field's request when it reaches other fields, and shows the whole form's changes in the panel's popover.
export function FormAssist({ describe, run, abort, onApply, formId = "", intro = NODE_INTRO, onContinueInChat }: FormAssistProps) {
    const host = useAssistHost();
    const open = host?.scope === FORM_SCOPE;
    const { history, setHistory, marksRef, reply, setReply, changed, setChanged } = useFormThread(formId);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();
    const [declined, setDeclined] = useState<string>();
    const [question, setQuestion] = useState<FormAssistQuestion>();
    const [withheld, setWithheld] = useState(false);
    const [handoff, setHandoff] = useState<FormAssistFlowChange>();
    const focusRef = useRef<AssistFocus>();
    // The field's suggestion handed over with the thread; the first form proposal replaces it.
    const pendingRef = useRef<string>();
    const pending = useRef<string>();

    const cancel = () => {
        if (pending.current) {
            abort?.(pending.current);
            pending.current = undefined;
        }
    };
    useEffect(() => cancel, []);
    // Marks from another form never carry over.
    useEffect(() => {
        if (host?.applied && host.applied.formId !== formId) {
            host.setApplied(undefined);
        }
    }, [formId]);

    const reset = () => {
        cancel();
        focusRef.current = undefined;
        pendingRef.current = undefined;
        marksRef.current = new Map();
        setHistory([]);
        setLoading(false);
        setError(undefined);
        setDeclined(undefined);
        setQuestion(undefined);
        setReply(undefined);
        setChanged(undefined);
        setWithheld(false);
        setHandoff(undefined);
    };
    const hide = () => host?.close();
    const close = () => {
        reset();
        hide();
    };
    // Closing the popover keeps the thread, and so does the form rebuilding itself; a different form starts a new one.
    const formIdRef = useRef(formId);
    useEffect(() => {
        if (formIdRef.current !== formId) {
            formIdRef.current = formId;
            reset();
        }
    }, [formId]);
    useEffect(() => {
        const failed = !!error && error !== STOPPED && error !== noChange("form");
        host?.setOrbState(loading ? "running" : question || declined ? "awaiting-input" : failed ? "error" : undefined);
    }, [loading, error, declined, question]);

    const stop = () => {
        cancel();
        marksRef.current.set(history.length - 1, NOT_DONE);
        setLoading(false);
        setError(STOPPED);
    };

    // Returns true when the thread holds something for the user: a question, a reply, an error or a hand-off.
    const settle = (next: Proposal, thread: string[]): boolean => {
        const { response } = next;
        const mark = turnMark(response);
        if (mark) {
            marksRef.current.set(thread.length - 1, mark);
        }
        if (response.question) {
            setQuestion(response.question);
            return true;
        }
        if (response.explanation) {
            setReply(response.explanation);
            return true;
        }
        if (response.declined) {
            setDeclined(response.error);
            return true;
        }
        // A reply whose values all match the form changes nothing, however it is worded.
        const changes = changesOf(next);
        if (response.error || (!response.flowChange && changes.length === 0)) {
            marksRef.current.set(thread.length - 1, NOT_DONE);
            setError(response.error ?? noChange("form"));
            return true;
        }
        // The values go straight into the form, which saves nothing until Save; the thread stays open for the next request.
        if (changes.length) {
            applyChanges(next, changes, thread[thread.length - 1] ?? "");
        }
        const summary = changedSummary(changes);
        setChanged([summary, response.skipped].filter(Boolean).join(" ") || undefined);
        // Work outside the form closes it, so the user confirms before the main Copilot takes it over.
        if (response.flowChange) {
            setHandoff(response.flowChange);
            return true;
        }
        // The changes wait for review in the form, and the thread for the next request; a request that only opened another form leaves nothing to follow up on.
        (summary ? hide : close)();
        return false;
    };

    // A request aimed at one field comes from its change card, which shows the result; the thread opens only when it has something to say.
    const submit = (instruction: string, earlier: string[] = history, aimed?: AssistFocus): boolean => {
        if (looksLikeCredential(instruction)) {
            setError(SECRET_IN_PROMPT);
            aimed && host?.open(FORM_SCOPE);
            return false;
        }
        const origin = { ...describe(), actions: offeredActions() };
        const { description, hidden } = withholdSecrets(origin);
        const focus = aimed ?? focusRef.current;
        const asked = question?.text;
        const thread = [...earlier, instruction];
        cancel();
        const requestId = newRequestId();
        pending.current = requestId;
        setHistory(thread);
        setLoading(true);
        setError(undefined);
        setDeclined(undefined);
        setQuestion(undefined);
        setReply(undefined);
        setChanged(undefined);
        setWithheld(hidden);
        const errors = errorLines(host?.formErrors);
        const marked = earlier.map((text, index) => marksRef.current.has(index) ? `${text} ${marksRef.current.get(index)}` : text);
        run(instruction, description, requestId, { focus, earlier: marked, asked, pending: pendingRef.current, errors })
            .catch((failure: Error): FormAssistResponse => ({ error: failure.message }))
            .then((response) => {
                if (pending.current !== requestId) {
                    return;
                }
                pending.current = undefined;
                setLoading(false);
                // The changes land in the review card, which takes the focus; set first, since the form can rebuild the card while it applies.
                if (host) {
                    host.reviewFocus.current = "keep";
                    aimed && host.setReviewKey(aimed.key);
                }
                const waiting = settle({ response, before: origin }, thread);
                if (waiting && host) {
                    host.reviewFocus.current = undefined;
                    aimed && host.open(FORM_SCOPE);
                } else if (aimed) {
                    host?.setRevising(undefined);
                }
            });
        return true;
    };
    const submitRef = useRef(submit);
    submitRef.current = submit;
    const stopRef = useRef(stop);
    stopRef.current = stop;

    // Registered once per mount; the latest submit and describe are read through refs.
    const describeRef = useRef(describe);
    describeRef.current = describe;
    const onApplyRef = useRef(onApply);
    onApplyRef.current = onApply;
    useEffect(() => host?.registerForm({
        parts: () => describeParts(describeRef.current()),
        handOff: (messages, focus, pending) => {
            focusRef.current = focus;
            pendingRef.current = pending;
            const earlier = messages.slice(0, -1);
            marksRef.current = new Map();
            setHistory(earlier);
            submitRef.current(messages[messages.length - 1], earlier);
        },
        revise: (focus, instruction) => submitRef.current(instruction, undefined, focus),
        stop: () => stopRef.current(),
        needsValues: () => describeRef.current().slots.some((slot) => !slot.optional && !slot.value.trim()),
        describe: () => describeRef.current(),
        apply: (response) => onApplyRef.current(response),
    }), [host?.registerForm]);

    const offeredActions = (): FormAssistAction[] => [...(host?.assistActions() ?? new Map())]
        .map(([id, action]) => ({ id, label: action.label, description: action.description }));

    const applyChanges = (next: Proposal, changes: Change[], request: string) => {
        onApply(next.response);
        if (host) {
            host.refocus.current = !!document.activeElement?.closest(".copilot-prompt");
            host.reveal.current = changes.flatMap(({ field, row }) => [field, row?.field]).filter((key): key is string => !!key);
            const latest = appliedChanges(changes, request, next.response.note, formId, host.liveForm);
            host.setApplied((current) => mergeApplied(current?.formId === formId ? current : undefined, latest));
        }
        // Another form opens once this one holds the values it was told about.
        next.response.actions?.forEach(({ id, request: asked }) => host?.assistActions().get(id)?.open(asked));
    };
    // Besides the request it shows, the main Copilot gets the form's values, the user's own words and why the form could not hold the change; secrets stay behind.
    const handToChat = (request: string, reason: string) => {
        onContinueInChat?.(request, describeValues(withholdSecrets(describe()).description), handOffNote(history, `It goes beyond the form because: ${reason}`));
        close();
    };
    const continueInChat = ({ request, reason }: FormAssistFlowChange) => handToChat(request, reason);
    const continueDeclined = (reason: string) => {
        onContinueInChat?.([...new Set(history)].join("\n"), describeValues(withholdSecrets(describe()).description),
            `The form could not do this because: ${reason}`);
        close();
    };
    const shell = (
        <AssistShell
            history={history}
            loadingLabel={loading ? "Working…" : undefined}
            error={error}
            reply={reply}
            withheld={withheld}
            placeholder={question ? "Or type an answer" : "Ask for a change"}
            onSubmit={(instruction) => submit(instruction)}
            onClose={hide}
            onStop={stop}
            proposal={handoff}
            keepInView={!host?.formShown}
            hint={intro.hint}
            embedded
            starters={focusRef.current ? undefined : intro.starters}
        >
            <ChangeSummary formId={formId} text={changed} onUndone={() => setChanged(UNDONE)} />
            {question && <QuestionCard question={question} onAnswer={(answer) => submit(answer)} />}
            {declined && <DeclinedCard reason={declined} onContinue={onContinueInChat && (() => continueDeclined(declined))} onDismiss={() => setDeclined(undefined)} />}
            {handoff && <HandoffCard flowChange={handoff} onContinue={onContinueInChat && continueInChat} onDismiss={() => setHandoff(undefined)} />}
        </AssistShell>
    );
    return (
        host?.formShown
            ? <AssistDock closing={host.closing} onClose={hide} onClear={reset}>{shell}</AssistDock>
            : <AssistHostContent scope={FORM_SCOPE}>{shell}</AssistHostContent>
    );
}

// What the turn changed, with Undo All while any of Copilot's changes still shows.
function ChangeSummary({ formId, text, onUndone }: { formId: string; text?: string; onUndone: () => void }) {
    const host = useAssistHost();
    if (!text) {
        return null;
    }
    const applied = host?.applied?.formId === formId ? host.applied : undefined;
    const undo = () => {
        if (host) {
            // The thread stays the place to ask next, so its input keeps the focus through the form's rebuild.
            host.refocus.current = true;
            undoAll(host);
        }
        onUndone();
    };
    return (
        <S.ChangeSummary>
            <span>{text}</span>
            {host && liveChangeCount(applied) > 0 && <UndoAllButton onClick={undo} />}
        </S.ChangeSummary>
    );
}

function QuestionCard({ question, onAnswer }: { question: FormAssistQuestion; onAnswer: (answer: string) => void }) {
    return (
        <S.Question>
            <div>{question.text}</div>
            <S.Starters>
                {question.options.map((option) => (
                    <S.Chip key={option} type="button" onClick={() => onAnswer(option)}>{option}</S.Chip>
                ))}
            </S.Starters>
        </S.Question>
    );
}

function DeclinedCard({ reason, onContinue, onDismiss }: { reason: string; onContinue?: () => void; onDismiss: () => void }) {
    return (
        <OutsideFormCard title="Request Not Applied" reason={reason} note="No fields changed." onApply={onContinue} onCancel={onDismiss} />
    );
}


// The whole-form helper for a form with no node schema: its parts are the fields that have their own helper.
export function FieldsFormAssist({ run, abort, onContinueInChat }: { run: RunFormAssist; abort?: (requestId: string) => void; onContinueInChat?: FormAssistProps["onContinueInChat"] }) {
    const host = useAssistHost();
    const owner = useRef({}).current;
    useEffect(() => host?.claimDock(owner), [host?.claimDock]);
    // Takes the box over when the form that held it closes.
    useEffect(() => {
        if (host && !host.dockOwner) {
            host.claimDock(owner);
        }
    }, [host?.dockOwner]);
    if (!host?.fieldCount || host.dockOwner !== owner) {
        return null;
    }
    const describe = (): FormAssistDescription => ({
        slots: [...host.assistFields()].map(([path, field]) => {
            const property = field.property();
            return { path, label: field.label, description: field.description, property, value: field.value(), optional: property.optional };
        }),
        groups: [],
    });
    // Each field writes its own value, so text and template fields keep their quoting and modes.
    const apply = (response: FormAssistResponse) => Object.entries(response.values ?? {}).forEach(([path, value], index) =>
        host.assistFields().get(path)?.apply(value, index === 0 ? response.imports : undefined));
    // A field whose editor changes registers again at the end, so the form keeps its id only when sorted.
    return <FormAssist describe={describe} run={run} abort={abort} onApply={apply} formId={[...host.assistFields().keys()].sort().join(",")} onContinueInChat={onContinueInChat} />;
}

// The form's parts as a field request lists them, so the field helper knows what it may hand over.
function describeParts({ slots, groups }: FormAssistDescription): string[] {
    return [
        ...slots.map((slot) => slot.label),
        ...groups.map((group) => group.item.length ? `${group.label} (repeatable)` : `${group.label} (on or off)`),
    ];
}

// The form's values as the chat reads them, one "Label: value" line each.
function describeValues({ slots, groups }: FormAssistDescription): string[] {
    return [
        ...slots.filter((slot) => slot.value.trim() || slot.withheld)
            .map((slot) => `${slot.label}: ${slot.withheld ? "(secret, not shown)" : slot.value}`),
        ...groups.filter((group) => group.rows.length)
            .map((group) => `${group.label}: ${group.item.length ? JSON.stringify(group.rows) : "on"}`),
    ];
}

// A value that looks like a key or password is sent empty; it never leaves the editor.
function withholdSecrets(description: FormAssistDescription): { description: FormAssistDescription; hidden: boolean } {
    let hidden = false;
    const blank = (value: string) => {
        const secret = shouldWithhold(value, false);
        hidden ||= secret;
        return secret ? "" : value;
    };
    return {
        description: {
            ...description,
            slots: description.slots.map((slot) => ({
                ...(shouldWithhold(slot.value, false) ? { ...slot, value: blank(slot.value), withheld: true } : slot),
                previous: slot.previous && blank(slot.previous),
                credential: isSensitiveField(slot.label, fieldKey(slot.path)) || undefined,
            })),
            groups: description.groups.map((group) => ({
                ...group,
                rows: group.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, blank(value)]))),
            })),
        },
        hidden,
    };
}

interface Change {
    // A slot path, a group id, or `action:<id>`.
    id: string;
    // The field it marks.
    field?: string;
    label: string;
    mark?: "+" | "−";
    before: string;
    display?: ValueDisplay;
    source?: string;
    sample?: boolean;
    // Puts the value back as it was before the change.
    revert?: FormAssistResponse;
    // Copilot's value as the field shows it, and both values as expressions.
    after?: string;
    values?: { before: string; after: string };
    // A row the change added or edited, marked on its own field (`branch-2`) in the If, Match and Fork forms.
    row?: { field: string; was?: Record<string, string>; now: Record<string, string> };
}

const fieldKey = (path: string) => path.replace(/^properties\./, "");

const LITERAL = /^(-?\d+(\.\d+)?[dfDF]?|"(?:[^"\\]|\\.)*"|true|false|\(\)|\[\]|\{\})$/;

const namesOrTypes = (slot: FormAssistSlot) => ["TYPE", "IDENTIFIER"].includes(selectedKind(slot));

const selectedKind = (slot: FormAssistSlot) => (slot.property.types?.find((option) => option.selected) ?? slot.property.types?.[0])?.fieldType ?? "";

// Fields whose value is a name, a type or a choice, which read as they are.
const PLAIN_KINDS = ["SINGLE_SELECT", "MULTIPLE_SELECT", "FLAG", "IDENTIFIER", "TYPE"];
const TEXT_KINDS = ["PROMPT", "TEXT", "STRING", "RAW_TEMPLATE"];
const REFERENCE = /^[A-Za-z_]\w*(\??\.[A-Za-z_]\w*)*$/;

// A template or string literal as its text, as the field shows it; anything else as it is.
function asText(value: string): string {
    const trimmed = value.trim();
    const template = /^(?:string\s*)?`([\s\S]*)`$/.exec(trimmed);
    if (template) {
        return template[1];
    }
    try {
        return /^"(?:[^"\\]|\\.)*"$/.test(trimmed) ? JSON.parse(trimmed) : value;
    } catch {
        return value;
    }
}

// One of the field's listed choices, from any of its modes: a select may be offered in Expression mode to the form's Copilot.
const choiceOf = (slot: FormAssistSlot, value: string) => (slot.property.types ?? [])
    .flatMap((type) => (type as { options?: { label?: string; value: string }[] }).options ?? [])
    .find((option) => option.value === value);

// A value as its field shows it: a choice by its label, a flag as On or Off, text without its quotes.
function shown(slot: FormAssistSlot, value: string): string {
    const type = slot.property.types?.find((option) => option.selected) ?? slot.property.types?.[0];
    if (TEXT_KINDS.includes(type?.fieldType ?? "")) {
        return asText(value);
    }
    if (type?.fieldType === "FLAG" && /^(true|false)$/.test(value.trim())) {
        return value.trim() === "true" ? "On" : "Off";
    }
    return choiceOf(slot, value)?.label ?? value;
}

function displayOf(slot: FormAssistSlot, value: string): ValueDisplay | undefined {
    const kind = selectedKind(slot);
    if (TEXT_KINDS.includes(kind)) {
        return "text";
    }
    const trimmed = value.trim();
    if (PLAIN_KINDS.includes(kind) || choiceOf(slot, value) || !trimmed || LITERAL.test(trimmed)) {
        return undefined;
    }
    return REFERENCE.test(trimmed) ? "reference" : "code";
}

function slotChange(slot: FormAssistSlot, value: string, { response }: Proposal): Change {
    return {
        id: slot.path,
        field: fieldKey(slot.path),
        label: slot.label,
        before: shown(slot, slot.value),
        display: displayOf(slot, slot.value),
        // A type, a name or a literal has no source worth naming; a type or a name is never a sample.
        source: namesOrTypes(slot) || LITERAL.test(value.trim()) ? undefined : response.sources?.[slot.path],
        sample: !namesOrTypes(slot) && response.samples?.includes(slot.path),
        revert: { values: { [slot.path]: slot.value } },
        after: shown(slot, value),
        values: { before: slot.value, after: value },
    };
}

function changesOf(proposal: Proposal): Change[] {
    const { response, before } = proposal;
    const slots = Object.entries(response.values ?? {}).flatMap(([path, value]): Change[] => {
        const slot = before.slots.find((known) => known.path === path);
        return slot && slot.value !== value ? [slotChange(slot, value, proposal)] : [];
    });
    const groups = Object.entries(response.groups ?? {}).flatMap(([id, rows]) => {
        const group = before.groups.find((known) => known.id === id);
        return group ? groupChanges(group, rows) : [];
    });
    const opens = (response.actions ?? []).flatMap(({ id, request }): Change[] => {
        const action = before.actions?.find((known) => known.id === id);
        return action ? [{ id: `action:${id}`, label: `Opens ${action.label}`, before: request }] : [];
    });
    return [...slots, ...groups, ...opens];
}

function groupChanges(group: FormAssistGroup, rows: Record<string, string>[]): Change[] {
    const base = { id: group.id, field: group.id, revert: { groups: { [group.id]: group.rows } } };
    // A toggle has no values: it only turns on or off.
    if (group.item.length === 0) {
        return rows.length === group.rows.length ? [] : [{ ...base, label: group.label, mark: rows.length ? "+" : "−", before: "" }];
    }
    // A flag reads as its label when on, and drops out when off.
    const shown = (field: FormAssistGroup["item"][number], value = "") =>
        field.property.types?.[0]?.fieldType === "FLAG" ? (value === "true" ? field.label : "") : value;
    const text = (row: Record<string, string>) => group.item.map((field) => shown(field, row[field.key])).filter(Boolean).join(" · ");
    return alignRows(group.rows.map(text), rows.map(text))
        .filter((step) => step.was !== step.now)
        .map((step) => ({
            ...base,
            row: step.after === undefined ? undefined
                : { field: `branch-${step.after}`, was: step.before === undefined ? undefined : group.rows[step.before], now: rows[step.after] },
            label: `${group.rowLabel ?? group.label} ${(step.after ?? step.before ?? 0) + 1}`,
            mark: step.was === undefined ? "+" : step.now === undefined ? "−" : undefined,
            before: step.was ?? "",
        }));
}

const sameRow = (row: Record<string, string>, target: Record<string, string>) =>
    Object.keys(target).every((key) => (row[key] ?? "").trim() === (target[key] ?? "").trim());

// Puts one row back, found by its applied value so that reverting another row first doesn't shift it.
function revertRow(id: string, row: NonNullable<Change["row"]>, current: FormAssistDescription): FormAssistResponse {
    const rows = [...(current.groups.find((group) => group.id === id)?.rows ?? [])];
    const index = rows.findIndex((candidate) => sameRow(candidate, row.now));
    if (index >= 0) {
        rows.splice(index, 1, ...(row.was ? [row.was] : []));
    }
    return { groups: { [id]: rows } };
}

// e.g. "Changed Role and Instructions."; nothing when the turn changed no field.
function changedSummary(changes: Change[]): string | undefined {
    const labels = [...new Set(changes.filter((change) => change.revert).map((change) => change.label))];
    if (!labels.length) {
        return undefined;
    }
    const last = labels.pop();
    return `Changed ${labels.length ? `${labels.join(", ")} and ${last}` : last}.`;
}

// Undo puts back every value the turn set; a form another action opened keeps what it created.
function appliedChanges(changes: Change[], request: string, note: string | undefined, formId: string, live: () => FormController | undefined): AppliedChanges | undefined {
    const undoable = changes.filter((change) => change.revert);
    if (!undoable.length) {
        return undefined;
    }
    const mark = (change: Change, revert: () => void): AppliedMark => ({
        before: change.before, display: change.display, added: change.mark === "+", sample: change.sample, request, source: change.source, revert,
        label: change.label, after: change.after, values: change.values,
    });
    const marks = Object.fromEntries(undoable.flatMap(({ row, ...change }) => [
        ...(change.field ? [[change.field, mark(change, () => live()?.apply(change.revert))]] : []),
        ...(row ? [[row.field, mark(change, () => {
            const form = live();
            form?.apply(revertRow(change.id, row, form.describe()));
        })]] : []),
    ]));
    const changeKeys = Object.fromEntries(undoable.map(({ id, label, field, row }) =>
        [`${id}:${label}`, [field, row?.field].filter((key): key is string => !!key)]));
    const revert = (keys: string[]) => mergeReverts(undoable
        .filter(({ field, row }) => [field, row?.field].some((key) => !!key && keys.includes(key)))
        .map((change) => change.revert));
    return { formId, changes: changeKeys, request, note, marks, revert };
}

// Later values win, so the oldest turn goes last.
function mergeReverts(reverts: FormAssistResponse[]): FormAssistResponse {
    return reverts.reduce<FormAssistResponse>((all, revert) => ({
        values: { ...all.values, ...revert.values },
        groups: { ...all.groups, ...revert.groups },
    }), {});
}

// A field changed again keeps what it was before Copilot first changed it, and Undo All puts the oldest values back.
function mergeApplied(previous: AppliedChanges | undefined, latest: AppliedChanges | undefined): AppliedChanges | undefined {
    if (!previous || !latest) {
        return latest ?? previous;
    }
    return {
        ...latest,
        changes: { ...previous.changes, ...latest.changes },
        marks: { ...previous.marks, ...Object.fromEntries(Object.entries(latest.marks).map(([key, mark]) => [key, olderBefore(previous.marks[key], mark)])) },
        // An earlier change the user kept before this turn stays.
        revert: (keys) => mergeReverts([latest.revert(keys), previous.revert(keys.filter((key) => key in previous.marks))]),
    };
}

// The latest change to a field, reviewed and reverted against the value before Copilot first changed it.
function olderBefore(older: AppliedMark | undefined, latest: AppliedMark): AppliedMark {
    if (!older) {
        return latest;
    }
    const values = older.values && latest.values && { before: older.values.before, after: latest.values.after };
    return { ...latest, before: older.before, display: older.display, added: older.added, revert: older.revert, values };
}

// What the user asked in the form, in their words, and what the form's Copilot made of it.
function handOffNote(history: string[], why: string): string {
    const asked = [...new Set(history)].map((message) => `"${message}"`).join(", then ");
    return [asked && `In the form, the user asked: ${asked}.`, why].filter(Boolean).join("\n");
}

function HandoffCard({ flowChange, onContinue, onDismiss }: { flowChange: FormAssistFlowChange; onContinue?: (flowChange: FormAssistFlowChange) => void; onDismiss: () => void }) {
    return (
        <OutsideFormCard title="Changes Required Outside This Form" reason={flowChange.reason} focusApply
            note="Applying closes this form and makes the changes in the project. Unsaved values in this form are included."
            onApply={onContinue && (() => onContinue(flowChange))} onCancel={onDismiss} />
    );
}

// Copilot carries the request on in the project, closing the form; Cancel keeps the form as it is.
function OutsideFormCard({ title, reason, note, focusApply, onApply, onCancel }: { title: string; reason: string; note: string; focusApply?: boolean; onApply?: () => void; onCancel: () => void }) {
    const apply = useRef<HTMLButtonElement>(null);
    // The confirmation takes the focus, so Enter carries on and Tab reaches Cancel.
    useEffect(() => {
        if (focusApply) {
            apply.current?.focus({ preventScroll: true });
        }
    }, []);
    return (
        <S.Handoff role="status">
            <S.HandoffTitle>
                <Codicon name="info" sx={{ fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
                {title}
            </S.HandoffTitle>
            <div>{reason}</div>
            <S.Muted>{note}</S.Muted>
            {onApply && (
                <S.HandoffActions>
                    <S.Primary ref={apply} type="button" onClick={onApply}>Apply in Project</S.Primary>
                    <S.Secondary type="button" onClick={onCancel}>Cancel</S.Secondary>
                </S.HandoffActions>
            )}
        </S.Handoff>
    );
}
