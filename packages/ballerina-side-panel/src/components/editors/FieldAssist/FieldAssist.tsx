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

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AssistFlowChange, ExpressionAssistAction, ExpressionAssistMode, ExpressionAssistResponse } from "@wso2/ballerina-core";
import { Icon } from "@wso2/ui-toolkit";
import { S } from "./styles";
import { looksLikeCredential, shouldWithhold } from "./secretGuard";
import { AssistShell } from "./AssistShell";
import { ValueDiff } from "./ChangeReview";
import { DeclinedCard, HandoffCard, NO_VALID_VALUE, compileFailure, handOffNote, threadRequest } from "./Handoff";

export interface FieldAssistInput {
    requestId: string;
    mode: ExpressionAssistMode;
    instruction?: string;
    value: string;
    diagnostics?: string[];
    valueWithheld?: boolean;
}

export type AssistExpression = (input: FieldAssistInput) => Promise<ExpressionAssistResponse>;

export interface Proposal extends ExpressionAssistResponse {
    expression: string;
}

interface AssistState {
    history: string[];
    loading: boolean;
    proposal?: Proposal;
    error?: string;
    // An answer about the field that changes nothing.
    reply?: string;
    // The last request left the field's value out because it looked like a secret.
    withheld?: boolean;
    // The request needs code outside the form, which the main Copilot can add.
    handoff?: AssistFlowChange;
    // No value compiled; the main Copilot can take the request on with these errors.
    failed?: string[];
}

// Lets the field's own toolbar open the helper without threading props through every editor variant.
export const FieldAssistContext = createContext<{ open: (from?: HTMLElement, draft?: string) => void; isOpen: boolean } | undefined>(undefined);

export function AssistButton({ disabled }: { disabled?: boolean }) {
    const assist = useContext(FieldAssistContext);
    if (!assist || disabled) {
        return null;
    }
    return (
        <S.FieldButton
            type="button"
            title="Fill this field with Copilot"
            aria-label="Fill this field with Copilot"
            aria-pressed={assist.isOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => assist.open(event.currentTarget)}
        >
            <Icon name="bi-ai-chat" sx={{ width: "15px", height: "15px" }} iconSx={{ fontSize: "15px" }} />
        </S.FieldButton>
    );
}

export const newRequestId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Resolves to what removes the created items again, where the host can remove them.
export type RunAssistActions = (actions: ExpressionAssistAction[], fieldValue: string) => Promise<void | (() => Promise<void>)>;

/** Carries out what a Copilot value needs outside its field before it lands, e.g. declaring the configurable it names. */
export async function runValueActions(run: RunAssistActions | undefined, actions: ExpressionAssistAction[] | undefined, fieldValue: string): Promise<void | (() => Promise<void>)> {
    if (!actions?.length) {
        return;
    }
    if (!run) {
        throw new Error("This form can't create configurables yet. Add one from the Data Browser.");
    }
    return run(actions, fieldValue);
}

interface UseFieldAssistProps {
    assist?: AssistExpression;
    abort?: (requestId: string) => void;
    getValue: () => string;
    // The field's name suggests it holds a secret, so any literal in it is withheld.
    sensitive?: boolean;
    // Takes over a request that also needs other fields: the thread so far, newest last, and the unapplied suggestion.
    handOff?: (messages: string[], pending?: string) => void;
    // Writes a suggestion into the field and opens its review card; without it, a suggestion waits for Replace.
    review?: (proposal: Proposal, request: string) => void;
    // Hands a request to the main Copilot with notes it reads but the user does not see; without it, a failure stays an error.
    continueInChat?: (request: string, context: string) => void;
}

const FIX_REQUEST = "Fix the error";
// The model's note describes a change, so it would contradict this; the message stands alone.
export const noChange = (subject: "value" | "form") => `No change needed. The ${subject} already does what you asked.`;
export const SECRET_IN_PROMPT = "This looks like a key or password, so it wasn't sent. Remove it and try again.";

export function useFieldAssist({ assist, abort, getValue, sensitive = false, handOff, review, continueInChat }: UseFieldAssistProps) {
    const [open, setOpen] = useState(false);
    const [state, setState] = useState<AssistState>({ history: [], loading: false });
    const pending = useRef<string>();

    const cancel = () => {
        if (pending.current) {
            abort?.(pending.current);
            pending.current = undefined;
        }
    };
    useEffect(() => cancel, []);

    // A request only the main Copilot can carry out: code outside the form, or a value that never compiled.
    const sentOutside = (response: ExpressionAssistResponse) => {
        if (!continueInChat || !(response.flowChange || response.errors?.length)) {
            return false;
        }
        setState((prev) => ({ ...prev, loading: false, handoff: response.flowChange, failed: response.flowChange ? undefined : response.errors }));
        return true;
    };

    // A suggestion that creates something outside the field, or might hold a secret, waits for Replace instead of landing at once.
    const sentToReview = (response: ExpressionAssistResponse, unchanged: boolean, withheld: boolean, asked?: string) => {
        if (!review || !response.expression || unchanged || response.actions?.length || sensitive || withheld) {
            return false;
        }
        setState({ history: [], loading: false });
        review(response as Proposal, asked ?? "");
        return true;
    };

    const run = async (mode: ExpressionAssistMode, instruction?: string, diagnostics?: string[]) => {
        if (!assist) {
            return;
        }
        cancel();
        const requestId = newRequestId();
        pending.current = requestId;
        // Each prompt refines the latest suggestion, not the saved value.
        const value = state.proposal?.expression ?? getValue();
        const withheld = shouldWithhold(value, sensitive);
        const asked = instruction ?? (mode === "fix" ? FIX_REQUEST : undefined);
        setState((prev) => ({
            history: asked ? [...prev.history, asked] : prev.history,
            loading: true,
            proposal: prev.proposal,
            withheld,
        }));
        // Diagnostics can quote the value, so they stay behind with it.
        const request = withheld
            ? { requestId, mode, instruction, value: "", valueWithheld: true }
            : { requestId, mode, instruction, value, diagnostics };
        const response = await assist(request)
            .catch((error: Error): ExpressionAssistResponse => ({ error: error.message }));
        if (pending.current !== requestId) {
            return;
        }
        pending.current = undefined;
        if (response.editsOtherFields && asked && handOff) {
            setState((prev) => ({ ...prev, loading: false }));
            handOff([...state.history, asked], state.proposal?.expression);
            return;
        }
        if (response.explanation) {
            setState((prev) => ({ ...prev, loading: false, reply: response.explanation, error: undefined }));
            return;
        }
        if (sentOutside(response)) {
            return;
        }
        // The value already does what was asked: say so rather than offer the same value back.
        const unchanged = !!response.expression && response.expression.trim() === value.trim() && !response.actions?.length;
        if (sentToReview(response, unchanged, withheld, asked)) {
            return;
        }
        setState((prev) => ({
            ...prev,
            loading: false,
            reply: undefined,
            proposal: response.expression && !unchanged ? (response as Proposal) : prev.proposal,
            error: unchanged ? noChange("value")
                : response.expression ? undefined : response.error ?? "No suggestion. Try describing it differently.",
        }));
    };

    // Returns false when the prompt was held back, so the caller keeps it for editing.
    const submit = (instruction: string): boolean => {
        if (looksLikeCredential(instruction)) {
            setState((prev) => ({ ...prev, error: SECRET_IN_PROMPT }));
            return false;
        }
        run(getValue().trim() || state.proposal ? "refine" : "generate", instruction);
        return true;
    };

    const close = () => {
        cancel();
        setOpen(false);
        setState({ history: [], loading: false });
    };

    const toChat = () => {
        const { handoff, failed, history } = state;
        if (handoff) {
            continueInChat?.(handoff.request, handOffNote(history, `It goes beyond the field because: ${handoff.reason}`));
        } else if (failed) {
            continueInChat?.(threadRequest(history), compileFailure(failed));
        }
    };

    return {
        available: !!assist,
        open,
        state,
        toggle: () => (open ? close() : setOpen(true)),
        close,
        submit,
        fix: (diagnostics: string[]) => {
            setOpen(true);
            run("fix", undefined, diagnostics);
        },
        fail: (error: string) => setState((prev) => ({ ...prev, error })),
        toChat,
        dismissOutside: () => setState((prev) => ({ ...prev, handoff: undefined, failed: undefined })),
    };
}

interface FieldAssistPanelProps {
    assist: ReturnType<typeof useFieldAssist>;
    value: string;
    // May create things outside the field first (see `actions`); a rejection keeps the panel open with the error.
    onApply: (proposal: Proposal) => void | Promise<void>;
    // How the field shows a value, e.g. a text field drops the string template around it.
    display?: (expression: string) => string;
    // The field's current errors; while there are any, the first starter fixes them.
    currentErrors?: () => string[];
    embedded?: boolean;
    headless?: boolean;
}

export function FieldAssistPanel({ assist, value, onApply, display = (expression) => expression, currentErrors, embedded, headless }: FieldAssistPanelProps) {
    const { state } = assist;
    const { proposal } = state;
    const editing = !!value.trim();
    const errors = editing ? currentErrors?.() ?? [] : [];
    const starters = errors.length ? [FIX_REQUEST] : [];
    const runStarter = () => {
        assist.fix(errors);
        return true;
    };
    const apply = async () => {
        if (!proposal) {
            return;
        }
        try {
            await onApply(proposal);
            assist.close();
        } catch (error) {
            assist.fail(error instanceof Error ? error.message : "Couldn't apply the suggestion.");
        }
    };
    // A value the field can't show as text switches it to Expression mode, so both sides compare as expressions.
    const after = proposal ? display(proposal.expression) : "";
    const before = proposal && after !== proposal.expression ? display(value) : value;
    const placeholder = proposal
        ? "Ask for a change"
        : editing ? "Describe the change you want" : "Describe what you need";

    return (
        <AssistShell
            history={state.history}
            loadingLabel={state.loading ? "Working…" : undefined}
            error={state.error}
            withheld={state.withheld}
            placeholder={placeholder}
            onSubmit={assist.submit}
            onClose={assist.close}
            proposal={proposal ?? state.handoff}
            onAccept={apply}
            embedded={embedded}
            headless={headless}
            starters={starters}
            onStarter={runStarter}
            reply={state.reply}
        >
            {proposal && (
                <S.Proposal>
                    <S.Diff>
                        <ValueDiff before={before} after={after} />
                    </S.Diff>
                    {proposal.actions?.map((action) => (
                        <S.Note key={action.name}>{describeAction(action, editing)}</S.Note>
                    ))}
                    {proposal.note && <S.Note>{proposal.note}</S.Note>}
                    <S.Actions>
                        <S.Primary type="button" onClick={apply}>
                            {editing ? "Replace" : "Insert"}
                            <S.Key>Tab</S.Key>
                        </S.Primary>
                        <S.Secondary type="button" onClick={assist.close}>
                            Discard
                            <S.Key>Esc</S.Key>
                        </S.Secondary>
                    </S.Actions>
                </S.Proposal>
            )}
            {state.handoff && <HandoffCard flowChange={state.handoff} onContinue={assist.toChat} onDismiss={assist.dismissOutside} />}
            {state.failed && <DeclinedCard reason={NO_VALID_VALUE} onContinue={assist.toChat} onDismiss={assist.dismissOutside} />}
        </AssistShell>
    );
}

function describeAction(action: ExpressionAssistAction, fieldHasValue: boolean): string {
    const moves = action.useFieldValue && fieldHasValue ? ", holding the current value" : "";
    return `Creates the configurable ${action.name} (${action.type})${moves}.`;
}
