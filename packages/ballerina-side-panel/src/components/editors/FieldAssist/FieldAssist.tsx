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
import { ExpressionAssistAction, ExpressionAssistMode, ExpressionAssistResponse } from "@wso2/ballerina-core";
import { Icon } from "@wso2/ui-toolkit";
import { computeWordDiff, DiffType } from "../ExpandedEditor/controls/DiffView";
import { S } from "./styles";
import { looksLikeCredential, shouldWithhold } from "./secretGuard";
import { AssistShell } from "./AssistShell";

export interface FieldAssistInput {
    requestId: string;
    mode: ExpressionAssistMode;
    instruction?: string;
    value: string;
    diagnostics?: string[];
    valueWithheld?: boolean;
}

export type AssistExpression = (input: FieldAssistInput) => Promise<ExpressionAssistResponse>;

interface Proposal extends ExpressionAssistResponse {
    expression: string;
}

interface AssistState {
    history: string[];
    loading: boolean;
    mode?: ExpressionAssistMode;
    proposal?: Proposal;
    error?: string;
    // An answer about the field that changes nothing.
    reply?: string;
    // The last request left the field's value out because it looked like a secret.
    withheld?: boolean;
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
            title="Ask Copilot"
            aria-label="Ask Copilot"
            aria-pressed={assist.isOpen}
            active={assist.isOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => assist.open(event.currentTarget)}
        >
            <Icon name="bi-ai-chat" sx={{ width: "15px", height: "15px" }} iconSx={{ fontSize: "15px" }} />
        </S.FieldButton>
    );
}

const FIELD_STARTERS = ["Suggest a value", "Explain this field"];
const VALUE_STARTERS = ["Explain this field"];

const LOADING_LABEL: Record<ExpressionAssistMode, string> = {
    generate: "Writing the expression…",
    refine: "Updating the expression…",
    fix: "Fixing the expression…",
};

export const newRequestId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface UseFieldAssistProps {
    assist?: AssistExpression;
    abort?: (requestId: string) => void;
    getValue: () => string;
    // The field's name suggests it holds a secret, so any literal in it is withheld.
    sensitive?: boolean;
    // Takes over a request that also needs other fields: the thread so far, newest last, and the unapplied suggestion.
    handOff?: (messages: string[], pending?: string) => void;
}

const FIX_REQUEST = "Fix the error";
// The model's note describes a change, so it would contradict this; the message stands alone.
export const noChange = (subject: "value" | "form") => `No change needed. The ${subject} already does what you asked.`;
export const SECRET_IN_PROMPT = "This looks like a key or password, so it wasn't sent. Remove it and try again.";

export function useFieldAssist({ assist, abort, getValue, sensitive = false, handOff }: UseFieldAssistProps) {
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
            mode,
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
        // The value already does what was asked: say so rather than offer the same value back.
        const unchanged = !!response.expression && response.expression.trim() === value.trim() && !response.actions?.length;
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
    const editing = !!value.trim();
    const errors = editing ? currentErrors?.() ?? [] : [];
    const starters = errors.length ? [FIX_REQUEST, ...VALUE_STARTERS] : editing ? VALUE_STARTERS : FIELD_STARTERS;
    const runStarter = (starter: string) => {
        if (starter !== FIX_REQUEST || !errors.length) {
            return false;
        }
        assist.fix(errors);
        return true;
    };
    const apply = async () => {
        if (!state.proposal) {
            return;
        }
        try {
            await onApply(state.proposal);
            assist.close();
        } catch (error) {
            assist.fail(error instanceof Error ? error.message : "Couldn't apply the suggestion.");
        }
    };
    // A value the field can't show as text switches it to Expression mode, so both sides compare as expressions.
    const shown = (expression: string) => {
        const after = display(expression);
        return { after, before: after === expression ? value : display(value) };
    };
    const placeholder = state.proposal
        ? "Ask for a change"
        : editing ? "Describe the change you want" : "Describe what you need";

    return (
        <AssistShell
            history={state.history}
            loadingLabel={state.loading ? LOADING_LABEL[state.mode ?? "generate"] : undefined}
            error={state.error}
            withheld={state.withheld}
            placeholder={placeholder}
            onSubmit={assist.submit}
            onClose={assist.close}
            proposal={state.proposal}
            onAccept={apply}
            embedded={embedded}
            headless={headless}
            starters={starters}
            onStarter={runStarter}
            reply={state.reply}
        >
            {state.proposal && (
                <ProposalCard
                    proposal={state.proposal}
                    before={shown(state.proposal.expression).before}
                    after={shown(state.proposal.expression).after}
                    editing={editing}
                    onApply={apply}
                    onDiscard={assist.close}
                />
            )}
        </AssistShell>
    );
}

interface ProposalCardProps {
    proposal: Proposal;
    before: string;
    after: string;
    editing: boolean;
    onApply: () => void;
    onDiscard: () => void;
}

function ProposalCard({ proposal, before, after, editing, onApply, onDiscard }: ProposalCardProps) {
    return (
        <S.Proposal>
            <S.Diff>
                <ValueChange before={before} after={after} />
            </S.Diff>
            {proposal.actions?.map((action) => (
                <S.Note key={action.name}>{describeAction(action, editing)}</S.Note>
            ))}
            {proposal.note && <S.Note>{proposal.note}</S.Note>}
            <S.Actions>
                <S.Primary type="button" onClick={onApply}>
                    {editing ? "Replace" : "Insert"}
                    <S.Key>Tab</S.Key>
                </S.Primary>
                <S.Secondary type="button" onClick={onDiscard}>
                    Discard
                    <S.Key>Esc</S.Key>
                </S.Secondary>
            </S.Actions>
        </S.Proposal>
    );
}

function describeAction(action: ExpressionAssistAction, fieldHasValue: boolean): string {
    const moves = action.useFieldValue && fieldHasValue ? ", holding the current value" : "";
    return `Creates the configurable ${action.name} (${action.type})${moves}.`;
}

// Identifiers, numbers and single punctuation marks, so `price * 1.08` diffs by operand rather than by line.
const EXPRESSION_TOKENS = /(\w+|\s+|[^\w\s])/g;

// A small edit reads best inline; a rewrite reads best as the old and the new value on their own lines.
export function ValueChange({ before: rawBefore, after: rawAfter }: { before: string; after: string }) {
    const [before, after] = [rawBefore.trim(), rawAfter.trim()];
    const added = <S.DiffLine kind="add"><S.LineSign>+</S.LineSign><S.NewValue>{after}</S.NewValue></S.DiffLine>;
    const removed = <S.DiffLine kind="remove"><S.LineSign removed>−</S.LineSign><S.OldValue>{before}</S.OldValue></S.DiffLine>;
    if (!before || !after) {
        return before ? removed : added;
    }
    return isSmallEdit(before, after)
        ? <S.DiffLine><S.NewValue><ExpressionDiff before={before} after={after} /></S.NewValue></S.DiffLine>
        : <>{removed}{added}</>;
}

// Only additions or only removals, in at most two spots: a replacement shown inline glues old and new words together.
export function isSmallEdit(before: string, after: string): boolean {
    const edits = computeWordDiff(before, after, EXPRESSION_TOKENS).filter((token) => token.type !== DiffType.Equal);
    return edits.length <= 2 && new Set(edits.map((token) => token.type)).size === 1;
}

export function ExpressionDiff({ before, after }: { before: string; after: string }) {
    return (
        <>
            {computeWordDiff(before, after, EXPRESSION_TOKENS).map((token, index) =>
                token.type === DiffType.Insert ? <S.Inserted key={index}>{token.text}</S.Inserted>
                    : token.type === DiffType.Delete ? <S.Deleted key={index}>{token.text}</S.Deleted>
                        : <span key={index}>{token.text}</span>
            )}
        </>
    );
}
