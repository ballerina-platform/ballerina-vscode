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
import { AppliedChanges, AssistDock, AssistFocus, AssistHostContent, FORM_SCOPE, FormController, errorLines, useAssistHost } from "./AssistHost";
import { SECRET_IN_PROMPT, ValueChange, newRequestId, noChange } from "./FieldAssist";
import { looksLikeCredential, shouldWithhold } from "./secretGuard";
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
    // Everything Apply will set, merged across the thread's turns.
    response: FormAssistResponse;
    // The form as saved, so the card always shows what Apply changes.
    before: FormAssistDescription;
    focus?: AssistFocus;
}

export interface FormAssistIntro {
    hint: string;
    starters: string[];
}

const NODE_INTRO: FormAssistIntro = {
    hint: "Describe what this node should do. Copilot fills in the fields.",
    starters: ["Fill the required fields", "Use sample values for testing", "Use values from earlier nodes"],
};
const STOPPED = "Stopped. No fields changed.";
const NOT_DONE = "(not done)";
const EXPLAINED = "(explained, nothing changed)";
// How the next request marks a turn that changed nothing; one that proposed changes gets no mark.
const turnMark = (response: FormAssistResponse): string | undefined =>
    response.explanation ? EXPLAINED : response.question || response.declined ? NOT_DONE : undefined;

// Takes over a field's request when it reaches other fields, and shows the whole form's changes in the panel's popover.
export function FormAssist({ describe, run, abort, onApply, formId = "", intro = NODE_INTRO, onContinueInChat }: FormAssistProps) {
    const host = useAssistHost();
    const open = host?.scope === FORM_SCOPE;
    const [history, setHistory] = useState<string[]>([]);
    // Turns in `history` that changed nothing, by index, with the mark the next request carries.
    const marksRef = useRef(new Map<number, string>());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();
    const [declined, setDeclined] = useState<string>();
    const [question, setQuestion] = useState<FormAssistQuestion>();
    const [reply, setReply] = useState<string>();
    const [withheld, setWithheld] = useState(false);
    const [proposal, setProposal] = useState<Proposal>();
    const [excluded, setExcluded] = useState<Set<string>>(new Set());
    const focusRef = useRef<AssistFocus>();
    // The field's suggestion handed over with the thread; the first form proposal replaces it.
    const pendingRef = useRef<string>();
    const autoApplyRef = useRef(false);
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
        setWithheld(false);
        setProposal(undefined);
    };
    const hide = () => host?.close();
    const close = () => {
        reset();
        hide();
    };
    // Closing the popover keeps the thread; a different form starts a new one.
    useEffect(() => reset, [formId]);
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

    const settle = (next: Proposal, response: FormAssistResponse, thread: string[]) => {
        // A reply whose values all match the form changes nothing, however it is worded.
        const autoApply = autoApplyRef.current;
        autoApplyRef.current = false;
        const mark = turnMark(response);
        if (mark) {
            marksRef.current.set(thread.length - 1, mark);
        }
        if (response.question) {
            setQuestion(response.question);
            return;
        }
        if (response.explanation) {
            setReply(response.explanation);
            return;
        }
        if (response.declined) {
            setDeclined(response.error);
            return;
        }
        if (response.error || (!next.response.flowChange && (!hasChanges(response) || changesOf(next).length === 0))) {
            marksRef.current.set(thread.length - 1, NOT_DONE);
            setError(response.error ?? noChange("form"));
            return;
        }
        // Every change starts ticked: the list shows what each one replaces, and unticking keeps a value.
        if (autoApply) {
            applyProposal(next, new Set(), thread);
            return;
        }
        setExcluded(new Set());
        setProposal(next);
    };

    const submit = (instruction: string, earlier: string[] = history): boolean => {
        if (looksLikeCredential(instruction)) {
            setError(SECRET_IN_PROMPT);
            return false;
        }
        // Each prompt refines the latest proposal; the card still compares with the saved form.
        const origin = proposal?.before ?? { ...describe(), actions: offeredActions() };
        const base = proposal ? withResponse(origin, proposal.response) : origin;
        const { description, hidden } = withholdSecrets(base);
        const focus = focusRef.current;
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
        setWithheld(hidden);
        const errors = errorLines(host?.formErrors);
        const marked = earlier.map((text, index) => marksRef.current.has(index) ? `${text} ${marksRef.current.get(index)}` : text);
        run(instruction, description, requestId, { focus, earlier: marked, asked, pending: proposal ? undefined : pendingRef.current, errors })
            .catch((failure: Error): FormAssistResponse => ({ error: failure.message }))
            .then((response) => {
                if (pending.current !== requestId) {
                    return;
                }
                pending.current = undefined;
                setLoading(false);
                settle({ response: mergeResponses(proposal?.response, response), before: origin, focus }, response, thread);
            });
        return true;
    };
    const submitRef = useRef(submit);
    submitRef.current = submit;

    // Registered once per mount; the latest submit and describe are read through refs.
    const describeRef = useRef(describe);
    describeRef.current = describe;
    const onApplyRef = useRef(onApply);
    onApplyRef.current = onApply;
    useEffect(() => host?.registerForm({
        parts: () => describeParts(describeRef.current()),
        handOff: (messages, focus, pending, autoApply) => {
            focusRef.current = focus;
            pendingRef.current = pending;
            autoApplyRef.current = !!autoApply;
            const earlier = messages.slice(0, -1);
            marksRef.current = new Map();
            setHistory(earlier);
            submitRef.current(messages[messages.length - 1], earlier);
        },
        needsValues: () => describeRef.current().slots.some((slot) => !slot.optional && !slot.value.trim()),
        describe: () => describeRef.current(),
        apply: (response) => onApplyRef.current(response),
    }), [host?.registerForm]);

    const offeredActions = (): FormAssistAction[] => [...(host?.assistActions() ?? new Map())]
        .map(([id, action]) => ({ id, label: action.label, description: action.description }));

    const applyProposal = (next: Proposal, skipped: Set<string>, thread: string[]) => {
        const chosen = changesOf(next).filter((change) => !skipped.has(change.id));
        const response = selectedResponse(next.response, skipped);
        onApply(response);
        host?.setApplied(appliedChanges(chosen, thread[thread.length - 1] ?? "", formId, host.liveForm));
        close();
        // Another form opens once this one holds the values it was told about.
        response.actions?.forEach(({ id, request }) => host?.assistActions().get(id)?.open(request));
    };
    const apply = () => proposal && changesOf(proposal).some((change) => !excluded.has(change.id)) && applyProposal(proposal, excluded, history);
    // The chat writes the step from the values the user kept; secrets stay behind.
    const continueInChat = (request: string) => {
        if (!proposal || !onContinueInChat) {
            return;
        }
        const { description } = withholdSecrets(withResponse(proposal.before, selectedResponse(proposal.response, excluded)));
        onContinueInChat(request, describeValues(description));
        close();
    };
    const continueDeclined = (reason: string) => {
        onContinueInChat?.([...new Set(history)].join("\n"), describeValues(withholdSecrets(describe()).description),
            `The form's Copilot could not do this: ${reason}`);
        close();
    };
    const toggle = (id: string) => setExcluded((current) => {
        const next = new Set(current);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const shell = (
        <AssistShell
            history={history}
            loadingLabel={loading ? "Updating the fields…" : undefined}
            error={error}
            reply={reply}
            withheld={withheld}
            placeholder={question ? "Or type an answer" : proposal ? "Ask for a change" : "Describe what you need"}
            onSubmit={(instruction) => submit(instruction)}
            onClose={hide}
            onStop={stop}
            proposal={proposal}
            onAccept={apply}
            embedded
            hint={focusRef.current ? undefined : intro.hint}
            starters={focusRef.current ? undefined : intro.starters}
        >
            {question && <QuestionCard question={question} onAnswer={(answer) => submit(answer)} />}
            {declined && <DeclinedCard reason={declined} onContinue={onContinueInChat && (() => continueDeclined(declined))} />}
            {proposal && <ChangeList proposal={proposal} excluded={excluded} onToggle={toggle} onApply={apply} onDiscard={close}
                onContinue={onContinueInChat && continueInChat} />}
        </AssistShell>
    );
    return (
        <>
            {host?.applied?.formId === formId && <AppliedBar applied={host.applied} onDismiss={() => host.setApplied(undefined)} />}
            {host?.formShown
                ? <AssistDock closing={host.closing} onClose={hide} onClear={reset}>{shell}</AssistDock>
                : <AssistHostContent scope={FORM_SCOPE}>{shell}</AssistHostContent>}
        </>
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

function DeclinedCard({ reason, onContinue }: { reason: string; onContinue?: () => void }) {
    return (
        <S.Declined role="alert">
            <S.DeclinedTitle>
                <Codicon name="info" sx={{ fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
                Not something this form can do
            </S.DeclinedTitle>
            <div>{reason}</div>
            {onContinue ? (
                <S.HandoffActions>
                    <S.Primary type="button" onClick={onContinue}>Edit the Flow with Copilot</S.Primary>
                    <S.Muted>Closes this form. Its values go with the request.</S.Muted>
                </S.HandoffActions>
            ) : <S.Muted>No fields changed.</S.Muted>}
        </S.Declined>
    );
}

function AppliedBar({ applied, onDismiss }: { applied: AppliedChanges; onDismiss: () => void }) {
    return (
        <S.AppliedBar role="status">
            <span>Copilot changed {applied.count} {applied.count === 1 ? "field" : "fields"}</span>
            <S.BarButton type="button" onClick={() => {
                applied.undo();
                onDismiss();
            }}>Undo</S.BarButton>
            <S.HeaderButton type="button" title="Dismiss" aria-label="Dismiss" onClick={onDismiss}>
                <Codicon name="close" sx={{ width: "12px", height: "12px" }} iconSx={{ fontSize: "12px" }} />
            </S.HeaderButton>
        </S.AppliedBar>
    );
}

// The whole-form helper for a form with no node schema: its parts are the fields that have their own helper.
export function FieldsFormAssist({ run, abort }: { run: RunFormAssist; abort?: (requestId: string) => void }) {
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
    return <FormAssist describe={describe} run={run} abort={abort} onApply={apply} formId={[...host.assistFields().keys()].join(",")} />;
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

// A refinement leaves out what it did not touch this turn, so earlier turns' changes carry over.
function mergeResponses(previous: FormAssistResponse | undefined, next: FormAssistResponse): FormAssistResponse {
    return previous ? {
        ...next,
        flowChange: next.flowChange ?? previous.flowChange,
        values: { ...previous.values, ...next.values },
        groups: { ...previous.groups, ...next.groups },
        imports: { ...previous.imports, ...next.imports },
        actions: next.actions ?? previous.actions,
        sources: { ...previous.sources, ...next.sources },
        samples: [...new Set([...(previous.samples ?? []), ...(next.samples ?? [])])],
    } : next;
}

const hasChanges = ({ values, groups, actions }: FormAssistResponse) =>
    Object.keys(values ?? {}).length > 0 || Object.keys(groups ?? {}).length > 0 || !!actions?.length;

function withResponse(description: FormAssistDescription, { values = {}, groups = {} }: FormAssistResponse): FormAssistDescription {
    return {
        ...description,
        slots: description.slots.map((slot) => (slot.path in values && values[slot.path] !== slot.value ? { ...slot, value: values[slot.path], previous: slot.value } : slot)),
        groups: description.groups.map((group) => (group.id in groups ? { ...group, rows: groups[group.id] } : group)),
    };
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
    // What a checkbox keeps or drops: a slot path, a group id, or `action:<id>`.
    id: string;
    // The field it marks after Apply.
    field?: string;
    label: string;
    mark?: "+" | "−";
    before: string;
    after: string;
    // Belongs to the field the request came from.
    focused?: boolean;
    source?: string;
    sample?: boolean;
    // Replaces a value the form already had.
    replaces?: boolean;
    // Puts the value back as it was before Apply.
    revert?: FormAssistResponse;
    // A row the change added or edited, marked on its own field (`branch-2`) in the If, Match and Fork forms.
    row?: { field: string; was?: Record<string, string>; now: Record<string, string> };
}

const fieldKey = (path: string) => path.replace(/^properties\./, "");

// A field key names a property in a property form, and a branch's value (`branch-2`) in the If, Match and Fork forms.
const isFocusSlot = (focus: AssistFocus | undefined, path: string) => focus?.key === fieldKey(path);
const isFocusRow = (focus: AssistFocus | undefined, groupId: string, index: number) =>
    focus?.key === groupId || focus?.key === `branch-${index}`;

const LITERAL = /^(-?\d+(\.\d+)?[dfDF]?|"(?:[^"\\]|\\.)*"|true|false|\(\)|\[\]|\{\})$/;

const namesOrTypes = (slot: FormAssistSlot) => ["TYPE", "IDENTIFIER"].includes(selectedKind(slot));

const selectedKind = (slot: FormAssistSlot) => (slot.property.types?.find((option) => option.selected) ?? slot.property.types?.[0])?.fieldType ?? "";

// A select's value reads as its option's label, e.g. Enum rather than ENUM; a prompt reads without its backticks.
function shown(slot: FormAssistSlot, value: string): string {
    const type = slot.property.types?.find((option) => option.selected) ?? slot.property.types?.[0];
    if (type?.fieldType === "PROMPT" && /^`[\s\S]*`$/.test(value.trim())) {
        return value.trim().slice(1, -1);
    }
    return (type as { options?: { label: string; value: string }[] })?.options?.find((option) => option.value === value)?.label ?? value;
}

function slotChange(slot: FormAssistSlot, value: string, { response, focus }: Proposal): Change {
    return {
        id: slot.path,
        field: fieldKey(slot.path),
        label: slot.label,
        before: shown(slot, slot.value),
        after: shown(slot, value),
        focused: isFocusSlot(focus, slot.path),
        // A type, a name or a literal has no source worth naming; a type or a name is never a sample.
        source: namesOrTypes(slot) || LITERAL.test(value.trim()) ? undefined : response.sources?.[slot.path],
        sample: !namesOrTypes(slot) && response.samples?.includes(slot.path),
        replaces: !!slot.value.trim(),
        revert: { values: { [slot.path]: slot.value } },
    };
}

function changesOf(proposal: Proposal): Change[] {
    const { response, before, focus } = proposal;
    const slots = Object.entries(response.values ?? {}).flatMap(([path, value]): Change[] => {
        const slot = before.slots.find((known) => known.path === path);
        return slot && slot.value !== value ? [slotChange(slot, value, proposal)] : [];
    });
    const groups = Object.entries(response.groups ?? {}).flatMap(([id, rows]) => {
        const group = before.groups.find((known) => known.id === id);
        return group ? groupChanges(group, rows, focus) : [];
    });
    const opens = (response.actions ?? []).flatMap(({ id, request }): Change[] => {
        const action = before.actions?.find((known) => known.id === id);
        return action ? [{ id: `action:${id}`, label: `Opens ${action.label}`, before: "", after: request }] : [];
    });
    return [...slots, ...groups, ...opens];
}

function groupChanges(group: FormAssistGroup, rows: Record<string, string>[], focus?: AssistFocus): Change[] {
    const base = { id: group.id, field: group.id, revert: { groups: { [group.id]: group.rows } } };
    // A toggle has no values: it only turns on or off.
    if (group.item.length === 0) {
        return rows.length === group.rows.length ? [] : [{ ...base, label: group.label, mark: rows.length ? "+" : "−", before: "", after: "" }];
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
            after: step.now ?? "",
            focused: isFocusRow(focus, group.id, step.before ?? -1),
        }));
}

// A change that overwrites a value starts unticked, unless the request came from that field, names it, or the field has an error.
function selectedResponse(response: FormAssistResponse, excluded: Set<string>): FormAssistResponse {
    const keep = <T,>(record?: Record<string, T>) => record && Object.fromEntries(Object.entries(record).filter(([id]) => !excluded.has(id)));
    return {
        ...response,
        values: keep(response.values),
        groups: keep(response.groups),
        actions: response.actions?.filter(({ id }) => !excluded.has(`action:${id}`)),
    };
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

// Undo puts back every value Apply set; a form another action opened keeps what it created.
function appliedChanges(changes: Change[], request: string, formId: string, live: () => FormController | undefined): AppliedChanges | undefined {
    const undoable = changes.filter((change) => change.revert);
    if (!undoable.length) {
        return undefined;
    }
    const mark = (change: Change, revert: () => void) => ({ before: change.before, request, source: change.source, revert });
    const marks = Object.fromEntries(undoable.flatMap(({ row, ...change }) => [
        ...(change.field ? [[change.field, mark(change, () => live()?.apply(change.revert))]] : []),
        ...(row ? [[row.field, mark(change, () => {
            const form = live();
            form?.apply(revertRow(change.id, row, form.describe()));
        })]] : []),
    ]));
    const undo = undoable.reduce<FormAssistResponse>((all, { revert }) => ({
        values: { ...all.values, ...revert.values },
        groups: { ...all.groups, ...revert.groups },
    }), {});
    return { formId, count: undoable.length, marks, undo: () => live()?.apply(undo) };
}

function ChangeRow({ change, checked, onToggle }: { change: Change; checked: boolean; onToggle: () => void }) {
    return (
        <S.ChangeRow>
            <input type="checkbox" checked={checked} onChange={onToggle} />
            <S.ChangeBody off={!checked}>
                <S.ChangeLabel>
                    {/* A value line carries its own sign; a toggle has none, so its label does. */}
                    {change.mark && !(change.before || change.after) && <S.ChangeMark removed={change.mark === "−"}>{change.mark}</S.ChangeMark>}
                    {change.label}
                    {change.sample && <S.Tag>Sample Value</S.Tag>}
                </S.ChangeLabel>
                {(change.before || change.after) && (
                    <S.ChangeValue>
                        <ValueChange before={change.before} after={change.after} />
                    </S.ChangeValue>
                )}
                {change.source && !change.sample && <S.Muted>From {change.source}</S.Muted>}
                {!checked && change.replaces && <S.Muted>Replaces the current value. Tick to change it.</S.Muted>}
            </S.ChangeBody>
        </S.ChangeRow>
    );
}

interface ChangeListProps {
    proposal: Proposal;
    excluded: Set<string>;
    onToggle: (id: string) => void;
    onApply: () => void;
    onDiscard: () => void;
    onContinue?: (request: string) => void;
}

function HandoffCard({ flowChange, onContinue }: { flowChange: FormAssistFlowChange; onContinue?: (request: string) => void }) {
    return (
        <S.Handoff>
            <S.HandoffTitle>
                <Codicon name="comment-discussion" sx={{ fontSize: "14px" }} iconSx={{ fontSize: "14px" }} />
                Needs a Flow Change
            </S.HandoffTitle>
            <div>{flowChange.reason}</div>
            {onContinue && (
                <S.HandoffActions>
                    <S.Primary type="button" onClick={() => onContinue(flowChange.request)}>Edit the Flow with Copilot</S.Primary>
                    <S.Muted>Closes this form. Its values go with the request.</S.Muted>
                </S.HandoffActions>
            )}
        </S.Handoff>
    );
}

// With a hand-off on offer, the chat is the way to finish, so Apply steps back and keeps only this form's part.
function ApplyButton({ count, handoff, onApply }: { count: number; handoff: boolean; onApply: () => void }) {
    if (count === 0) {
        return null;
    }
    const Button = handoff ? S.Secondary : S.Primary;
    return (
        <Button type="button" onClick={onApply}>
            {handoff ? "Apply Only" : count === 1 ? "Apply 1 Change" : `Apply ${count} Changes`}
            <S.Key>Tab</S.Key>
        </Button>
    );
}

// The asked-about field's change leads; the rest follow under their own heading.
function ChangeList({ proposal, excluded, onToggle, onApply, onDiscard, onContinue }: ChangeListProps) {
    const changes = changesOf(proposal);
    const lead = changes.filter((change) => change.focused);
    const others = changes.filter((change) => !change.focused);
    const count = changes.filter((change) => !excluded.has(change.id)).length;
    const { flowChange } = proposal.response;
    const row = (prefix: string) => (change: Change, index: number) => (
        <ChangeRow key={`${prefix}-${index}`} change={change} checked={!excluded.has(change.id)} onToggle={() => onToggle(change.id)} />
    );
    return (
        <S.Proposal>
            {changes.length > 0 && (
                <S.Changes>
                    {lead.map(row("lead"))}
                    {lead.length > 0 && others.length > 0 && <S.ChangesHeading>Also Changes</S.ChangesHeading>}
                    {others.map(row("other"))}
                </S.Changes>
            )}
            {proposal.response.note && <S.Note>{proposal.response.note}</S.Note>}
            {flowChange && <HandoffCard flowChange={flowChange} onContinue={onContinue} />}
            <S.Actions>
                <ApplyButton count={count} handoff={!!flowChange && !!onContinue} onApply={onApply} />
                <S.Secondary type="button" onClick={onDiscard}>
                    Discard
                </S.Secondary>
            </S.Actions>
        </S.Proposal>
    );
}
