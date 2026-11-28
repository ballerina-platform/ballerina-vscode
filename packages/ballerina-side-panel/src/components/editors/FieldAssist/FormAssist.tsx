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
import { FormAssistAction, AssistFlowChange, FormAssistGroup, FormAssistQuestion, FormAssistResponse, FormAssistSlot, alignRows, isSensitiveField, isWithheldCell, looksLikeCredential, shouldWithhold, withheldCell } from "@wso2/ballerina-core";
import { AssistShell } from "./AssistShell";
import { DeclinedCard, Declined, EXPLAINED, HandoffCard, NOT_DONE, NO_VALID_VALUES, compileFailure, handOffNote, markedTurns, questionReply, threadRequest, QuestionCard, STOPPED } from "./Handoff";
import { Icon } from "@wso2/ui-toolkit";
import { AppliedChanges, AppliedMark, AssistDock, AssistHostValue, liveChangeCount, undoAll, AssistFocus, AssistHostContent, FORM_SCOPE, FormController, FormThread, ValueDisplay, errorLines, useAssistHost } from "./AssistHost";
import { RunAssistActions, SECRET_IN_PROMPT, configLiteral, noChange, runValueActions, usePendingRequest, withReply } from "./FieldAssist";
import { selectedType, stringLiteral, templateBody } from "./fieldKinds";
import { moveRows } from "./ChangeReview";
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
    // Copilot's reply to each of `earlier`, by index.
    replies?: string[];
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
    // Carries out what a value needs outside the form, e.g. declaring a configurable, as the field's Copilot does.
    runAssistActions?: RunAssistActions;
    // A value as saved, so a hand-off never puts it back over an edit not saved yet.
    savedValue?: (path: string) => string | undefined;
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
const UNDONE = "Undid all changes.";
// How the next request marks a turn that changed nothing; one that proposed changes gets no mark.
const turnMark = (response: FormAssistResponse): string | undefined =>
    response.explanation ? EXPLAINED : response.question || response.declined || response.errors?.length ? NOT_DONE : undefined;

// The thread's state, written through to the host: applying a change can rebuild the form before any effect runs.
function useFormThread(formId: string) {
    const host = useAssistHost();
    const saved = host?.formThread.current?.formId === formId ? host.formThread.current : undefined;
    const [history, setHistoryState] = useState<string[]>(saved?.history ?? []);
    // Turns in `history` that changed nothing, by index, with the mark the next request carries.
    const marksRef = useRef(saved?.marks ?? new Map<number, string>());
    const [reply, setReplyState] = useState<string | undefined>(saved?.reply);
    const [changed, setChangedState] = useState<string | undefined>(saved?.changed);
    const [handoff, setHandoffState] = useState<AssistFlowChange | undefined>(saved?.handoff);
    // Read through the ref too, since a turn's reply lands after the request that started it.
    const repliesRef = useRef<string[]>(saved?.replies ?? []);
    const [replies, setRepliesState] = useState(repliesRef.current);
    const keep = (next: Partial<FormThread>) => {
        if (host) {
            const current = host.formThread.current?.formId === formId ? host.formThread.current : { formId, history: [] };
            host.formThread.current = { ...current, marks: marksRef.current, ...next };
        }
    };
    const kept = <T,>(key: keyof FormThread, set: (next: T) => void) => (next: T) => {
        keep({ [key]: next });
        set(next);
    };
    const setHistory = kept<string[]>("history", setHistoryState);
    const setReplies = kept<string[]>("replies", (next) => {
        repliesRef.current = next;
        setRepliesState(next);
    });
    const setReplyAt = (index: number, text: string) => setReplies(withReply(repliesRef.current, index, text));
    const setReply = kept<string | undefined>("reply", setReplyState);
    const setChanged = kept<string | undefined>("changed", setChangedState);
    const setHandoff = kept<AssistFlowChange | undefined>("handoff", setHandoffState);
    return { history, setHistory, marksRef, replies, setReplies, setReplyAt, reply, setReply, changed, setChanged, handoff, setHandoff };
}

// Takes over a field's request when it reaches other fields, and shows the whole form's changes in the panel's popover.
export function FormAssist({ describe, run, abort, onApply, formId = "", intro = NODE_INTRO, onContinueInChat, runAssistActions, savedValue }: FormAssistProps) {
    const host = useAssistHost();
    const open = host?.scope === FORM_SCOPE;
    const { history, setHistory, marksRef, replies, setReplies, setReplyAt, reply, setReply, changed, setChanged, handoff, setHandoff } = useFormThread(formId);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();
    const [declined, setDeclined] = useState<Declined>();
    const [question, setQuestion] = useState<FormAssistQuestion>();
    const [withheld, setWithheld] = useState(false);
    const focusRef = useRef<AssistFocus>();
    // The field's suggestion handed over with the thread; the first form proposal replaces it.
    const pendingRef = useRef<string>();
    const { pending, cancel, start } = usePendingRequest(abort);
    // What removes each item a value created outside the form, by name, e.g. a configurable.
    const createdRef = useRef(new Map<string, () => Promise<void>>());
    // The items the latest turn's applied changes name.
    const claimedRef = useRef(new Set<string>());
    // Each removal edits config.bal, so they run one after another.
    const removals = useRef(Promise.resolve());
    const queueRemoval = (remove: () => Promise<void>) => {
        removals.current = removals.current.then(remove).catch(() => undefined);
    };
    const removeCreated = (names: string[]) => names.forEach((name) => {
        const remove = createdRef.current.get(name);
        createdRef.current.delete(name);
        if (remove) {
            queueRemoval(remove);
        }
    });
    // What a turn created stays only when a change it applied names it.
    const keepClaimed = (made: Map<string, () => Promise<void>>, claimed: Set<string>) => made.forEach((remove, name) => {
        if (claimed.has(name)) {
            createdRef.current.set(name, remove);
        } else {
            queueRemoval(remove);
        }
    });

    const reset = () => {
        cancel();
        focusRef.current = undefined;
        pendingRef.current = undefined;
        marksRef.current = new Map();
        setHistory([]);
        setReplies([]);
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
    // Closing the popover keeps the thread, and so does the form rebuilding itself; a different form starts a new one, and its marks go.
    const formIdRef = useRef(formId);
    useEffect(() => {
        if (host?.applied && host.applied.formId !== formId) {
            host.setApplied(undefined);
        }
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
        setReplyAt(history.length - 1, STOPPED);
        setLoading(false);
        setError(STOPPED);
    };

    // Returns true when the thread holds something for the user: a question, a reply, an error or a hand-off.
    const settle = (proposal: Proposal, thread: string[]): boolean => {
        const next = keepUnsavedEdits(proposal, savedValue);
        const { response } = next;
        const mark = turnMark(response);
        if (mark) {
            marksRef.current.set(thread.length - 1, mark);
        }
        const say = (text: string) => setReplyAt(thread.length - 1, text);
        if (response.question) {
            say(questionReply(response.question));
            setQuestion(response.question);
            return true;
        }
        if (response.explanation) {
            say(response.explanation);
            setReply(response.explanation);
            return true;
        }
        const decline = declineOf(response, !!onContinueInChat);
        if (decline) {
            say(decline.reason);
            setDeclined(decline);
            return true;
        }
        // A reply whose values all match the form changes nothing, however it is worded.
        const changes = changesOf(next);
        if (response.error || (!response.flowChange && changes.length === 0)) {
            const failure = response.error ?? noChange("form");
            marksRef.current.set(thread.length - 1, NOT_DONE);
            say(failure);
            setError(failure);
            return true;
        }
        // The values go straight into the form, which saves nothing until Save; the thread stays open for the next request.
        if (changes.length) {
            applyChanges(next, changes, thread[thread.length - 1] ?? "");
        }
        const summary = changedSummary(changes);
        const done = [summary, response.note, response.skipped].filter(Boolean).join(" ");
        setChanged(done || undefined);
        say([done, response.flowChange?.reason].filter(Boolean).join(" "));
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
        const { description, hidden, cells } = withholdSecrets(origin);
        const focus = aimed ?? focusRef.current;
        const asked = question?.text;
        const thread = [...earlier, instruction];
        // Turns handed over from a field or a change card come without Copilot's replies.
        const earlierReplies = earlier === history ? earlier.map((_, index) => replies[index] ?? "") : [];
        const requestId = start();
        setHistory(thread);
        setReplies(earlierReplies);
        setLoading(true);
        setError(undefined);
        setDeclined(undefined);
        setQuestion(undefined);
        setReply(undefined);
        setChanged(undefined);
        setWithheld(hidden);
        const errors = errorLines(host?.formErrors);
        const made = new Map<string, () => Promise<void>>();
        run(instruction, description, requestId, { focus, earlier: markedTurns(earlier, marksRef.current), replies: earlierReplies, asked, pending: pendingRef.current, errors })
            .then((response) => pending.current === requestId ? prepareValues(withSecretCells(response, cells), origin, runAssistActions, made) : response)
            .catch((failure: Error): FormAssistResponse => ({ error: failure.message }))
            .then((response) => {
                if (pending.current !== requestId) {
                    keepClaimed(made, new Set());
                    return;
                }
                pending.current = undefined;
                setLoading(false);
                // The changes land in the review card, which takes the focus; set first, since the form can rebuild the card while it applies.
                if (host) {
                    host.reviewFocus.current = "keep";
                    aimed && host.setReviewKey(aimed.key);
                }
                claimedRef.current = new Set();
                const waiting = settle({ response, before: origin }, thread);
                keepClaimed(made, claimedRef.current);
                if (waiting && host) {
                    host.reviewFocus.current = undefined;
                    aimed && host.open(FORM_SCOPE);
                } else if (aimed) {
                    host?.setRevising(undefined);
                }
            });
        return true;
    };

    const offeredActions = (): FormAssistAction[] => [...(host?.assistActions() ?? new Map())]
        .map(([id, action]) => ({ id, label: action.label, description: action.description }));

    const applyChanges = (next: Proposal, changes: Change[], request: string) => {
        claimedRef.current = new Set(changes.flatMap((change) => change.creates ?? []));
        onApply(next.response);
        if (host) {
            host.reveal.current = changes.flatMap(({ field, row }) => [field, row?.field]).filter((key): key is string => !!key);
            const latest = appliedChanges(changes, request, formId, host.liveForm, removeCreated);
            host.setApplied((current) => mergeApplied(current?.formId === formId ? current : undefined, latest, host.liveForm));
        }
        // Another form opens once this one holds the values it was told about.
        next.response.actions?.forEach(({ id, request: asked }) => host?.assistActions().get(id)?.open(asked));
    };
    // Besides the request it shows, the main Copilot gets the form's values, the user's own words and why the form could not hold the change; secrets stay behind.
    const handToChat = (request: string, context: string) => {
        onContinueInChat?.(request, describeValues(withholdSecrets(describe()).description), context);
        close();
    };
    // Registered once per mount; the latest callbacks are read through the ref.
    const latest = useRef({ submit, stop, describe, onApply, handToChat });
    latest.current = { submit, stop, describe, onApply, handToChat };
    useEffect(() => host?.registerForm({
        parts: () => describeParts(latest.current.describe()),
        handOff: (messages, focus, pending) => {
            focusRef.current = focus;
            pendingRef.current = pending;
            const earlier = messages.slice(0, -1);
            marksRef.current = new Map();
            setHistory(earlier);
            latest.current.submit(messages[messages.length - 1], earlier);
        },
        // A revise starts a thread of its own, so the old thread's turn marks don't carry over.
        revise: (focus, instruction, earlier) => {
            marksRef.current = new Map();
            return latest.current.submit(instruction, earlier ? [earlier] : [], focus);
        },
        stop: () => latest.current.stop(),
        describe: () => latest.current.describe(),
        apply: (response) => latest.current.onApply(response),
        continueInChat: onContinueInChat && ((request, context) => latest.current.handToChat(request, context)),
    }), [host?.registerForm, !!onContinueInChat]);
    const continueInChat = ({ request, reason }: AssistFlowChange) => handToChat(request, handOffNote(history, `It goes beyond the form because: ${reason}`));
    const shell = (
        <AssistShell
            history={history}
            replies={replies}
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
            starters={focusRef.current ? undefined : intro.starters}
        >
            <ChangeSummary formId={formId} text={changed} onUndone={() => setChanged(UNDONE)} />
            {question && <QuestionCard question={question} onAnswer={(answer) => submit(answer)} />}
            {declined && <DeclinedCard reason={declined.reason} onContinue={onContinueInChat && (() => handToChat(threadRequest(history), declined.why))} onDismiss={() => setDeclined(undefined)} />}
            {handoff && <HandoffCard flowChange={handoff} onContinue={onContinueInChat && continueInChat} onDismiss={() => setHandoff(undefined)} />}
        </AssistShell>
    );
    return (
        host?.formShown
            ? <AssistDock onClear={reset}>{shell}</AssistDock>
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
            undoAll(host);
        }
        onUndone();
    };
    return (
        <S.ChangeSummary>
            <span>{text}</span>
            {host && liveChangeCount(applied) > 0 && (
                <S.HeaderButton type="button" title="Undo All" aria-label="Undo All" onClick={undo}>
                    <Icon name="bi-undo" sx={{ fontSize: "14px", width: "14px", height: "14px" }} iconSx={{ fontSize: "14px" }} />
                </S.HeaderButton>
            )}
        </S.ChangeSummary>
    );
}

// The whole-form helper for a form with no node schema: its parts are the fields that have their own helper.
type FieldsFormAssistProps = Pick<FormAssistProps, "run" | "abort" | "onContinueInChat" | "runAssistActions" | "savedValue">;

export function FieldsFormAssist({ run, abort, onContinueInChat, runAssistActions, savedValue }: FieldsFormAssistProps) {
    const host = useAssistHost();
    const owner = useRef({}).current;
    useEffect(() => host?.claimDock(owner), [host?.claimDock]);
    // Takes the box over when the form that held it closes.
    useEffect(() => {
        if (host && !host.dockOwner) {
            host.claimDock(owner);
        }
    }, [host?.dockOwner]);
    if (!host?.partCount || host.dockOwner !== owner) {
        return null;
    }
    const describe = () => hostDescription(host);
    const apply = (response: FormAssistResponse) => applyToHost(host, response);
    return <FormAssist describe={describe} run={run} abort={abort} onApply={apply} formId={hostFormId(describe())} onContinueInChat={onContinueInChat} runAssistActions={runAssistActions} savedValue={savedValue} />;
}

// Sorted, so a form keeps its id while editors mount and unmount.
const hostFormId = ({ slots, groups }: FormAssistDescription) =>
    [...slots.map((slot) => slot.path), ...groups.map((group) => group.id)].sort().join(",");

// The first source wins a shared key; a field on screen describes itself unless a source offers it as rows.
function hostDescription(host: AssistHostValue): FormAssistDescription {
    const { slots, groups } = describeSources(host.fieldSources());
    host.assistFields().forEach((field, path) => {
        if (groups.has(path)) {
            return;
        }
        const property = field.property();
        slots.set(path, { path, label: field.label, description: field.description, property, value: field.value(), optional: property.optional, when: slots.get(path)?.when });
    });
    return { slots: [...slots.values()], groups: [...groups.values()] };
}

type FieldSources = ReturnType<AssistHostValue["fieldSources"]>;
type PartChange = Pick<FormAssistResponse, "values" | "groups" | "imports">;

// The first source wins a shared key.
function describeSources(sources: FieldSources) {
    const slots = new Map<string, FormAssistSlot>();
    const groups = new Map<string, FormAssistGroup>();
    sources.forEach((source) => {
        const own = source.describe();
        own.slots.forEach((slot) => !slots.has(slot.path) && slots.set(slot.path, slot));
        own.groups.forEach((group) => !groups.has(group.id) && groups.set(group.id, group));
    });
    return { slots, groups };
}

const pick = <T,>(entries: Record<string, T>, keys: Set<string>) =>
    Object.fromEntries(Object.entries(entries).filter(([key]) => keys.has(key)));

// Each source gets the values and groups it describes; what no source took is returned.
function applyToSources(sources: FieldSources, { values: given = {}, groups: givenGroups = {}, imports: givenImports }: PartChange): PartChange {
    let imports = givenImports;
    const values = { ...given };
    const groups = { ...givenGroups };
    sources.forEach((source) => {
        const own = source.describe();
        const change = {
            values: pick(values, new Set(own.slots.map((slot) => slot.path))),
            groups: pick(groups, new Set(own.groups.map((group) => group.id))),
        };
        if (Object.keys(change.values).length || Object.keys(change.groups).length) {
            source.apply({ ...change, imports });
            imports = undefined;
            Object.keys(change.values).forEach((path) => delete values[path]);
            Object.keys(change.groups).forEach((id) => delete groups[id]);
        }
    });
    return { values, groups, imports };
}

// Parts registered with useAssistSource, e.g. a custom toggle, for a form Copilot that describes its own fields.
export function useAssistParts() {
    const host = useAssistHost();
    const sources = () => host?.fieldSources() ?? [];
    return {
        describe: (): Pick<FormAssistDescription, "slots" | "groups"> => {
            const { slots, groups } = describeSources(sources());
            return { slots: [...slots.values()], groups: [...groups.values()] };
        },
        apply: (change: PartChange): PartChange => applyToSources(sources(), change),
    };
}

// An editor on screen writes its own value, keeping its quoting and mode; the rest goes to the first source that describes it.
function applyToHost(host: AssistHostValue, response: FormAssistResponse) {
    let imports = response.imports;
    const values: Record<string, string> = {};
    Object.entries(response.values ?? {}).forEach(([path, value]) => {
        const field = host.assistFields().get(path);
        if (field) {
            field.apply(value, imports);
            imports = undefined;
        } else {
            values[path] = value;
        }
    });
    applyToSources(host.fieldSources(), { values, groups: response.groups, imports });
}

// What the values name outside the form, e.g. a new configurable, exists before they land; a value moved into one is read here, so a secret stays in the editor.
export async function prepareValues(response: FormAssistResponse, before: FormAssistDescription, runAssistActions?: RunAssistActions,
    created?: Map<string, () => Promise<void>>): Promise<FormAssistResponse> {
    // Two values may name the same configurable; it is declared once.
    const declared = new Set<string>();
    for (const [path, actions] of Object.entries(response.valueActions ?? {})) {
        const fresh = actions.filter(({ name }) => !declared.has(name));
        fresh.forEach(({ name }) => declared.add(name));
        for (const action of fresh) {
            const remove = await runValueActions(runAssistActions, [action], before.slots.find((slot) => slot.path === path)?.value ?? "");
            remove && created?.set(action.name, remove);
        }
    }
    return response;
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

// A value that looks like a key or password is sent empty, or as a placeholder in a row; it never leaves the editor.
export function withholdSecrets(description: FormAssistDescription): { description: FormAssistDescription; hidden: boolean; cells: Map<string, string> } {
    let hidden = false;
    const cells = new Map<string, string>();
    const hideCell = (value: string, sensitive: boolean) => {
        if (!shouldWithhold(value, sensitive)) {
            return value;
        }
        hidden = true;
        const placeholder = withheldCell(cells.size + 1);
        cells.set(placeholder, value);
        return placeholder;
    };
    const blank = (value: string, sensitive: boolean) => {
        const secret = shouldWithhold(value, sensitive);
        hidden ||= secret;
        return secret ? "" : value;
    };
    return {
        description: {
            ...description,
            slots: description.slots.map((slot) => {
                const credential = isSensitiveField(slot.label, fieldKey(slot.path));
                return {
                    ...(shouldWithhold(slot.value, credential) ? { ...slot, value: blank(slot.value, credential), withheld: true } : slot),
                    previous: slot.previous && blank(slot.previous, credential),
                    credential: credential || undefined,
                };
            }),
            groups: description.groups.map((group) => ({
                ...group,
                rows: group.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) =>
                    [key, hideCell(value, isSensitiveField(key, group.item.find((item) => item.key === key)?.label))]))),
            })),
        },
        hidden,
        cells,
    };
}

// Rows come back with the placeholders they kept; each gets its secret back, and one Copilot made up gets nothing.
export function withSecretCells(response: FormAssistResponse, cells: Map<string, string>): FormAssistResponse {
    if (!response.groups || cells.size === 0) {
        return response;
    }
    const restore = (value: string) => isWithheldCell(value) ? cells.get(value.trim()) ?? "" : value;
    return {
        ...response,
        groups: Object.fromEntries(Object.entries(response.groups).map(([id, rows]) =>
            [id, rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, restore(value)])))])),
    };
}

export interface Change {
    // A slot path, a group id, or `action:<id>`.
    id: string;
    // The field it marks.
    field?: string;
    label: string;
    mark?: "+" | "−";
    before: string;
    display?: ValueDisplay;
    // Puts the value back as it was before the change.
    revert?: FormAssistResponse;
    // Copilot's value as the field shows it, and both values as expressions.
    after?: string;
    values?: { before: string; after: string };
    // A row the change added or edited, marked on its own field (`branch-2`) when its group names one.
    row?: { field: string; was?: Record<string, string>; now: Record<string, string> };
    // A row the change removed from a group that names its rows, and the row it followed, so Undo puts back that row alone.
    removed?: { was: Record<string, string>; index: number; after?: { was?: Record<string, string>; now: Record<string, string> } };
    // Where each of the group's earlier rows went, so marks from earlier turns follow their rows.
    moves?: { rowField: string; to: (number | undefined)[] };
    // The configurables the change adds, which its Undo removes, and the line that names them on its card.
    creates?: string[];
    note?: string;
}

// The configurables the values under `key` add; only those `text` names, when given, e.g. one row of a group.
function createdBy(response: FormAssistResponse, key: string, text?: string, current?: string): Pick<Change, "creates" | "note"> {
    const words = text?.split(/[^\w']+/);
    const actions = (response.valueActions?.[key] ?? []).filter(({ name }) => !words || words.includes(name));
    if (!actions.length) {
        return {};
    }
    const names = actions.map(({ name }) => name);
    const kept = actions.some(({ useFieldValue }) => useFieldValue) && current !== undefined && configLiteral(current);
    const value = kept ? "The previous value is saved in Config.toml." : `Set ${names.length > 1 ? "their values" : "its value"} in Config.toml.`;
    return { creates: names, note: `Adds ${names.length > 1 ? "configurables" : "configurable"} ${names.join(", ")}. ${value}` };
}

const fieldKey = (path: string) => path.replace(/^properties\./, "");

const LITERAL = /^(-?\d+(\.\d+)?[dfDF]?|"(?:[^"\\]|\\.)*"|true|false|\(\)|\[\]|\{\})$/;

// Fields whose value is a name, a type or a choice, which read as they are.
const PLAIN_KINDS = ["SINGLE_SELECT", "MULTIPLE_SELECT", "FLAG", "IDENTIFIER", "TYPE"];
const TEXT_KINDS = ["PROMPT", "TEXT", "STRING", "RAW_TEMPLATE"];

// One of the field's listed choices, from any of its modes: a select may be offered in Expression mode to the form's Copilot.
const choiceOf = (slot: FormAssistSlot, value: string) => (slot.property.types ?? [])
    .flatMap((type) => (type as { options?: { label?: string; value: string }[] }).options ?? [])
    .find((option) => option.value === value);

// A value as its field shows it: a choice by its label, a flag as On or Off, text without its quotes.
function shown(slot: FormAssistSlot, value: string): string {
    const type = selectedType(slot.property);
    if (TEXT_KINDS.includes(type?.fieldType ?? "")) {
        return templateBody(value) ?? stringLiteral(value.trim()) ?? value;
    }
    if (type?.fieldType === "FLAG" && /^(true|false)$/.test(value.trim())) {
        return value.trim() === "true" ? "On" : "Off";
    }
    return choiceOf(slot, value)?.label ?? value;
}

function displayOf(slot: FormAssistSlot, value: string): ValueDisplay | undefined {
    const kind = selectedType(slot.property)?.fieldType ?? "";
    if (TEXT_KINDS.includes(kind)) {
        return "text";
    }
    const trimmed = value.trim();
    if (PLAIN_KINDS.includes(kind) || choiceOf(slot, value) || !trimmed || LITERAL.test(trimmed)) {
        return undefined;
    }
    return "code";
}

// The model can copy a hand-off's values from the saved source; one that would undo an edit not saved yet is dropped.
export function keepUnsavedEdits(next: Proposal, savedValue?: (path: string) => string | undefined): Proposal {
    const { response, before } = next;
    if (!response.flowChange || !response.values || !savedValue) {
        return next;
    }
    const current = (path: string) => before.slots.find((slot) => slot.path === path)?.value;
    const undoesEdit = ([path, value]: [string, string]) => value === savedValue(path) && current(path) !== value;
    return { ...next, response: { ...response, values: Object.fromEntries(Object.entries(response.values).filter((entry) => !undoesEdit(entry))) } };
}

function slotChange(slot: FormAssistSlot, value: string, { response }: Proposal): Change {
    return {
        id: slot.path,
        field: fieldKey(slot.path),
        label: slot.label,
        before: shown(slot, slot.value),
        display: displayOf(slot, slot.value),
        revert: { values: { [slot.path]: slot.value } },
        after: shown(slot, value),
        values: { before: slot.value, after: value },
        ...createdBy(response, slot.path, undefined, slot.value),
    };
}

export function changesOf(proposal: Proposal): Change[] {
    const { response, before } = proposal;
    const slots = Object.entries(response.values ?? {}).flatMap(([path, value]): Change[] => {
        const slot = before.slots.find((known) => known.path === path);
        return slot && slot.value.trim() !== value.trim() ? [slotChange(slot, value, proposal)] : [];
    });
    const groups = Object.entries(response.groups ?? {}).flatMap(([id, rows]) => {
        const group = before.groups.find((known) => known.id === id);
        return group ? groupChanges(group, rows, response) : [];
    });
    const opens = (response.actions ?? []).flatMap(({ id, request }): Change[] => {
        const action = before.actions?.find((known) => known.id === id);
        return action ? [{ id: `action:${id}`, label: `Opens ${action.label}`, before: request }] : [];
    });
    return [...slots, ...groups, ...opens];
}

function groupChanges(group: FormAssistGroup, rows: Record<string, string>[], response: FormAssistResponse): Change[] {
    const base = { id: group.id, field: group.id, revert: { groups: { [group.id]: group.rows } } };
    // A toggle has no values: it only turns on or off.
    if (group.item.length === 0) {
        return rows.length === group.rows.length ? [] : [{ ...base, label: group.label, mark: rows.length ? "+" : "−", before: "" }];
    }
    // A flag reads as its label when on, and drops out when off.
    const shown = (field: FormAssistGroup["item"][number], value = "") =>
        field.property.types?.[0]?.fieldType === "FLAG" ? (value === "true" ? field.label : "") : value;
    const text = (row: Record<string, string>) => group.item.map((field) => shown(field, row[field.key])).filter(Boolean).join(" · ");
    const steps = alignRows(group.rows.map(text), rows.map(text));
    const to = group.rows.map((_, index) => steps.find((step) => step.before === index)?.after);
    const moves = group.rowField ? { rowField: group.rowField, to } : undefined;
    // The nearest row above that is still there.
    const anchor = (position: number) => {
        const step = steps.slice(0, position).reverse().find((earlier) => earlier.after !== undefined);
        return step && { was: step.before === undefined ? undefined : group.rows[step.before], now: rows[step.after!] };
    };
    return steps
        .map((step, position) => ({ step, position }))
        .filter(({ step }) => step.was !== step.now)
        .map(({ step, position }) => ({
            ...base,
            moves,
            removed: step.after === undefined && group.rowField
                ? { was: group.rows[step.before!], index: step.before!, after: anchor(position) } : undefined,
            row: step.after === undefined || !group.rowField ? undefined
                : { field: `${group.rowField}-${step.after}`, was: step.before === undefined ? undefined : group.rows[step.before], now: rows[step.after] },
            label: (group.max ?? 2) <= 1 ? group.rowLabel ?? group.label : `${group.rowLabel ?? group.label} ${(step.after ?? step.before ?? 0) + 1}`,
            mark: step.was === undefined ? "+" : step.now === undefined ? "−" : undefined,
            before: step.was ?? "",
            after: step.now,
            ...createdBy(response, group.id, step.now ?? ""),
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

// Puts a removed row back under the row it followed, found by its value now or before this turn.
function restoreRow(id: string, removed: NonNullable<Change["removed"]>, current: FormAssistDescription): FormAssistResponse {
    const rows = [...(current.groups.find((group) => group.id === id)?.rows ?? [])];
    const { after } = removed;
    const above = after ? rows.findIndex((row) => sameRow(row, after.now) || (!!after.was && sameRow(row, after.was))) : -1;
    const at = !after ? 0 : above >= 0 ? above + 1 : Math.min(removed.index, rows.length);
    rows.splice(at, 0, removed.was);
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
export function appliedChanges(changes: Change[], request: string, formId: string, live: () => FormController | undefined,
    remove?: (names: string[]) => void): AppliedChanges | undefined {
    const undoable = changes.filter((change) => change.revert);
    if (!undoable.length) {
        return undefined;
    }
    // A configurable a change added goes once every change that names it is undone; a kept one still names it.
    const undone = new Set<Change>();
    const undo = (reverted: Change[]) => {
        reverted.forEach((change) => undone.add(change));
        const names = [...new Set(reverted.flatMap((change) => change.creates ?? []))];
        remove?.(names.filter((name) => undoable.every((change) => undone.has(change) || !change.creates?.includes(name))));
    };
    const mark = (change: Change, revertIn: (form: FormAssistDescription) => FormAssistResponse, covers = [change]): AppliedMark => ({
        before: change.before, display: change.display, added: change.mark === "+", request, revertIn,
        revert: () => {
            const form = live();
            form?.apply(revertIn(form.describe()));
        },
        undone: () => undo(covers),
        label: change.label, after: change.after, values: change.values, note: change.note,
    });
    // A group's removed rows share its mark; each goes back under the row it followed, the lowest first so they keep their order.
    const removals = (id: string) => undoable.filter((change) => change.id === id && change.removed).sort((a, b) => b.removed!.index - a.removed!.index);
    const restoreAll = (id: string, form: FormAssistDescription) => removals(id).reduce<FormAssistResponse>((all, change) =>
        mergeReverts([all, restoreRow(id, change.removed!, afterRevert(form, all))]), {});
    // A row's change is marked on the row alone; its group is marked only for what has no row, such as a removed one.
    const marks = Object.fromEntries(undoable.flatMap((change) => [
        ...(change.removed ? [[change.field, mark(change, (form) => restoreAll(change.id, form), removals(change.id))]] : []),
        ...(change.field && !change.row && !change.removed ? [[change.field, mark(change, () => change.revert!)]] : []),
        ...(change.row ? [[change.row.field, mark(change, (form) => revertRow(change.id, change.row!, form))]] : []),
    ]));
    const changeKeys = Object.fromEntries(undoable.map(({ id, label, field, row }) =>
        [`${id}:${label}`, [field, row?.field].filter((key): key is string => !!key)]));
    // Rows go back one at a time, so a row the user kept stays; a change without a row puts its whole group back first, and removed rows return last.
    const rank = (change: Change) => change.removed ? 2 : Number(!!change.row);
    const revert = (keys: string[], form?: FormAssistDescription) => {
        const picked = undoable.filter(({ field, row }) => keys.includes(row?.field ?? field ?? ""))
            .sort((a, b) => rank(a) - rank(b) || (b.removed?.index ?? 0) - (a.removed?.index ?? 0));
        undo(picked);
        return picked.reduce<FormAssistResponse>((all, change) => {
            const current = form && afterRevert(form, all);
            const back = change.row && current ? revertRow(change.id, change.row, current)
                : change.removed && current ? restoreRow(change.id, change.removed, current) : change.revert!;
            return mergeReverts([all, back]);
        }, {});
    };
    const rowMoves = Object.fromEntries(changes.flatMap(({ moves }) => moves ? [[moves.rowField, moves.to]] : []));
    return { formId, changes: changeKeys, marks, revert, rowMoves };
}

const afterRevert = (form: FormAssistDescription, revert: FormAssistResponse): FormAssistDescription =>
    ({ ...form, groups: form.groups.map((group) => revert.groups?.[group.id] ? { ...group, rows: revert.groups[group.id] } : group) });

// Later values win, so the oldest turn goes last.
function mergeReverts(reverts: FormAssistResponse[]): FormAssistResponse {
    return reverts.reduce<FormAssistResponse>((all, revert) => ({
        values: { ...all.values, ...revert.values },
        groups: { ...all.groups, ...revert.groups },
    }), {});
}

// A field changed again keeps what it was before Copilot first changed it, and Undo All puts the oldest values back.
export function mergeApplied(previous: AppliedChanges | undefined, latest: AppliedChanges | undefined, live: () => FormController | undefined): AppliedChanges | undefined {
    if (!latest) {
        return previous;
    }
    if (!previous) {
        return latest;
    }
    // Rows the latest turn added or removed move the earlier turns' row marks with their rows.
    previous = Object.entries(latest.rowMoves ?? {}).reduce((applied, [rowField, to]) => moveRows(applied, rowField, (row) => to[row]), previous);
    return {
        ...latest,
        changes: { ...previous.changes, ...latest.changes },
        marks: { ...previous.marks, ...Object.fromEntries(Object.entries(latest.marks).map(([key, mark]) => [key, olderBefore(previous.marks[key], mark, live)])) },
        // An earlier change the user kept before this turn stays.
        revert: (keys, form) => {
            const later = latest.revert(keys, form);
            return mergeReverts([later, previous.revert(keys.filter((key) => key in previous.marks), form && afterRevert(form, later))]);
        },
    };
}

// The latest change to a field, reviewed and reverted against the value before Copilot first changed it.
function olderBefore(older: AppliedMark | undefined, latest: AppliedMark, live: () => FormController | undefined): AppliedMark {
    if (!older) {
        return latest;
    }
    const values = older.values && latest.values && { before: older.values.before, after: latest.values.after };
    const undone = () => { older.undone?.(); latest.undone?.(); };
    const merged = { ...latest, before: older.before, display: older.display, added: older.added, revert: older.revert, revertIn: undefined, undone, values };
    if (!older.revertIn || !latest.revertIn) {
        return merged;
    }
    // The latest turn goes back first, so the older one finds its rows as it left them.
    const revertIn = (form: FormAssistDescription) => {
        const later = latest.revertIn!(form);
        return mergeReverts([later, older.revertIn!(afterRevert(form, later))]);
    };
    const revert = () => {
        const form = live();
        form?.apply(revertIn(form.describe()));
    };
    return { ...merged, revertIn, revert };
}

// A request the form could not carry out that the main Copilot can still take: a refusal, or values that never compiled.
function declineOf(response: FormAssistResponse, canContinue: boolean): Declined | undefined {
    if (response.declined) {
        return { reason: response.error ?? "", why: `The form could not do this because: ${response.error}` };
    }
    return response.errors?.length && canContinue ? { reason: NO_VALID_VALUES, why: compileFailure(response.errors) } : undefined;
}
