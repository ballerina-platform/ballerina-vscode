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

import React, { useEffect, useRef } from "react";
import { Imports } from "@wso2/ballerina-core";
import { EditorView } from "@codemirror/view";
import { useAssistKey, useFormContext } from "../../../context";
import { FormExpressionEditorProps, FormField } from "../../Form/types";
import { useModeSwitcherContext } from "../ModeSwitcherContext";
import { tokensChangeEffect } from "../MultiModeExpressionEditor/ChipExpressionEditor/CodeUtils";
import { InputMode } from "../MultiModeExpressionEditor/ChipExpressionEditor/types";
import { assistProperty, getPropertyFromFormField } from "../utils";
import { AssistCard, AssistHostContent, AssistHostProvider, reviseInCard, useAssistHost, withFieldChange } from "./AssistHost";
import { AssistMark } from "./AssistMark";
import { AssistButton, FieldAssistContext, FieldAssistPanel, Proposal, reviewNote, runValueActions, useFieldAssist } from "./FieldAssist";
import { stringLiteral } from "./fieldKinds";
import { isSensitiveField } from "./secretGuard";

export const switchesToExpression = (modeSwitcher: ReturnType<typeof useModeSwitcherContext>) =>
    !!modeSwitcher?.isModeSwitcherEnabled && !!modeSwitcher.types?.some((type) => type.fieldType === "EXPRESSION");

// The Expression editor mounts in place of the text one some frames after a mode switch.
export const whenEditorReplaced = (key: string, previous: Element | null | undefined, apply: (editor: HTMLElement) => void, triesLeft = 50) => {
    const editor = document.querySelector<HTMLElement>(`[data-testid="ex-editor-${key}"] .cm-editor`);
    if (editor && editor !== previous) {
        apply(editor);
    } else if (triesLeft > 0) {
        setTimeout(() => whenEditorReplaced(key, previous, apply, triesLeft - 1), 20);
    }
};

export const replaceEditorText = (editor: HTMLElement | null | undefined, text: string, focus = true) => {
    const view = editor && EditorView.findFromDOM(editor);
    view?.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: text.length },
        // The old chips describe text that is gone; mapped over the new text they would draw one long chip.
        effects: tokensChangeEffect.of({ tokens: [] }),
        userEvent: "input.replace",
    });
    if (focus) {
        view?.focus();
    }
};

/** The field Copilot for a list or map editor: a suggested value goes in through the field's expression mode. */
export function useStructuredFieldAssist(field: FormField, beforeSwitch?: () => void, currentValue: () => string = () => "") {
    const host = useAssistHost();
    const { expressionEditor, updateImports } = useFormContext();
    const modeSwitcher = useModeSwitcherContext();
    const key = field.key;
    const markKey = useAssistKey(key);
    const canExpress = switchesToExpression(modeSwitcher);
    const assistExpression = canExpress && field.editable !== false ? expressionEditor?.assistExpression : undefined;
    const expressionEditorOf = () => document.querySelector<HTMLElement>(`[data-testid="ex-editor-${key}"] .cm-editor`);
    // The value goes in through the field's expression mode, so the list or map shows as code from then on.
    const write = ({ expression, imports }: Proposal, focus = true) => {
        if (imports) {
            updateImports?.(key, imports);
        }
        const previous = expressionEditorOf();
        beforeSwitch?.();
        modeSwitcher?.onModeChange(InputMode.EXP);
        whenEditorReplaced(key, previous, (editor) => replaceEditorText(editor, expression, focus));
    };
    // The suggestion lands at once; the card under the field keeps, undoes or revises it, as for a form change.
    const writeForReview = async (proposal: Proposal, request: string) => {
        const before = currentValue();
        const removeCreated = await runValueActions(expressionEditor?.runAssistActions, proposal.actions, before);
        write(proposal, false);
        host?.setApplied((current) => withFieldChange(current, markKey, {
            before, after: proposal.expression, display: "code", request, label: field.label, note: reviewNote(proposal, before),
            values: { before, after: proposal.expression },
            // The field stays in expression mode, so the earlier value goes back into that editor.
            revert: () => {
                replaceEditorText(expressionEditorOf(), before, false);
                if (removeCreated) {
                    void removeCreated();
                }
            },
        }));
        host?.setReviewKey(markKey);
        host?.close();
    };
    const assist = useFieldAssist({
        thread: host?.fieldThread(markKey),
        assist: assistExpression && ((input) => assistExpression({
            ...input,
            key,
            property: { ...getPropertyFromFormField(field), types: modeSwitcher.types.map((type) => ({ ...type, selected: type.fieldType === "EXPRESSION" })) },
        })),
        abort: expressionEditor?.abortExpressionAssist,
        getValue: currentValue,
        sensitive: isSensitiveField(field.label, key),
        review: host ? writeForReview : undefined,
    });
    const apply = async (proposal: Proposal) => {
        await runValueActions(expressionEditor?.runAssistActions, proposal.actions, currentValue());
        write(proposal);
        // The user's edit, as typing is, so a form review of the field ends.
        host?.dropMark(markKey);
    };
    return useHostedFieldAssist(field, markKey, assist, { value: currentValue(), onApply: apply });
}

const NOT_TEXT = "This field holds plain text, so values from the flow can't go in. Ask for the text itself.";

/** The text a plain text field holds for a suggested value: a string literal or a template with nothing interpolated. */
export function plainText(expression: string): string | undefined {
    const trimmed = expression.trim();
    const template = /^(?:string\s*)?`([^`]*)`$/.exec(trimmed);
    if (template) {
        return template[1].includes("${") ? undefined : template[1];
    }
    return stringLiteral(trimmed);
}

/** The field Copilot for a plain text field: a suggestion goes in as the text itself and is reviewed under the field. */
export function usePlainTextFieldAssist(field: FormField) {
    const host = useAssistHost();
    const { form, expressionEditor } = useFormContext();
    const key = field.key;
    const markKey = useAssistKey(key);
    const text = () => String(form.getValues(key) ?? "");
    const asExpression = () => (text() ? JSON.stringify(text()) : "");
    const write = (value: string) => {
        form.setValue(key, value, { shouldDirty: true, shouldValidate: true });
        field.onValueChange?.(value);
    };
    const writeForReview = (proposal: Proposal, request: string) => {
        const after = plainText(proposal.expression);
        if (after === undefined) {
            assist.fail(NOT_TEXT);
            return;
        }
        const before = text();
        write(after);
        host?.setApplied((current) => withFieldChange(current, markKey, {
            before, after, display: "text", request, label: field.label, note: proposal.note,
            values: { before, after }, revert: () => write(before),
        }));
        host?.setReviewKey(markKey);
        host?.close();
    };
    const assistExpression = field.editable !== false ? expressionEditor?.assistExpression : undefined;
    const assist = useFieldAssist({
        thread: host?.fieldThread(markKey),
        assist: assistExpression && ((input) => assistExpression({
            ...input,
            key,
            property: { ...getPropertyFromFormField(field), types: [{ fieldType: "EXPRESSION", ballerinaType: "string", selected: true }] },
        })),
        abort: expressionEditor?.abortExpressionAssist,
        getValue: asExpression,
        sensitive: isSensitiveField(field.label, key),
        review: host ? writeForReview : undefined,
    });
    const apply = async ({ expression }: Proposal) => {
        const after = plainText(expression);
        if (after === undefined) {
            throw new Error(NOT_TEXT);
        }
        write(after);
        host?.dropMark(markKey);
    };
    return useHostedFieldAssist(field, markKey, assist, { value: asExpression(), onApply: apply, display: (expression) => plainText(expression) ?? expression });
}

interface HostedPanel {
    value: string;
    onApply: (proposal: Proposal) => void | Promise<void>;
    display?: (expression: string) => string;
    currentErrors?: () => string[];
}

// A field's thread in the form's Copilot host.
export function HostedFieldPanel({ scope, assist, ...panel }: HostedPanel & { scope: string; assist: ReturnType<typeof useFieldAssist> }) {
    const host = useAssistHost();
    return (
        <>
            <AssistCard scope={scope} />
            <AssistHostContent scope={scope}>
                <FieldAssistPanel assist={{ ...assist, close: () => host.close() }} {...panel} embedded headless />
            </AssistHostContent>
        </>
    );
}

// Lets Revise on a change this field's Copilot made continue the field's own thread, which holds the requests before it.
// The request runs from the change card, which shows it working; only an answer the card can't show, e.g. a question, opens the thread.
export function useFieldThread(key: string, label: string, assist: ReturnType<typeof useFieldAssist>, hosted: boolean, openThread?: () => void) {
    const host = useAssistHost();
    const latest = useRef({ assist, openThread });
    latest.current = { assist, openThread };
    const fromCard = useRef(false);
    const done = () => host?.setFieldRunning((current) => (current === key ? undefined : current));
    useEffect(() => (hosted && host ? host.registerFieldThread(key, {
        revise: (instruction) => {
            fromCard.current = latest.current.assist.submit(instruction);
            if (fromCard.current) {
                host.setFieldRunning(key);
            }
            return fromCard.current;
        },
        stop: () => {
            fromCard.current = false;
            done();
            latest.current.assist.stop();
        },
    }) : undefined), [hosted, key, host?.registerFieldThread]);
    useEffect(() => {
        if (!fromCard.current || assist.state.loading || !host) {
            return;
        }
        fromCard.current = false;
        done();
        if (needsThread(assist.state)) {
            host.setRevising(undefined);
            (latest.current.openThread ?? (() => host.open(`field:${key}`, label)))();
        }
    }, [assist.state.loading]);
}

const needsThread = ({ proposal, error, reply, handoff, failed, question, declined }: ReturnType<typeof useFieldAssist>["state"]) =>
    !!(proposal || error || reply || handoff || failed || question || declined);

// A field's Copilot button and its thread in the form's Copilot host; the context also gives an expanded editor the button.
function useHostedFieldAssist(field: FormField, key: string, assist: ReturnType<typeof useFieldAssist>, panel: HostedPanel) {
    const host = useAssistHost();
    const scope = `field:${key}`;
    const hosted = !!host && assist.available;
    const open = host?.scope === scope;
    useFieldThread(key, field.label, assist, hosted);
    // Another field or the whole form took the popover: this thread ends.
    useEffect(() => {
        if (hosted && host.shownScope !== scope && assist.open) {
            assist.close();
        }
    }, [hosted, host?.shownScope]);
    if (!hosted) {
        return { button: null, panel: null, context: undefined };
    }
    const context = { open: () => reviseInCard(host, key) || (open ? host.close() : host.open(scope, field.label)), isOpen: open || host.revising === key };
    return {
        context,
        button: <FieldAssistContext.Provider value={context}><AssistButton /></FieldAssistContext.Provider>,
        panel: <HostedFieldPanel scope={scope} assist={assist} {...panel} />,
    };
}

interface DialogFieldAssistProps {
    field?: FormField;
    value: string;
    expressionEditor: FormExpressionEditorProps;
    errors: string[];
    onApply: (expression: string, imports?: Imports) => void;
    children: React.ReactNode;
}

/** The field Copilot in a dialog over the form, with a Copilot host of its own: a suggestion is written in and reviewed under the editor. */
export function DialogFieldAssist(props: DialogFieldAssistProps) {
    if (!props.field || !props.expressionEditor.assistExpression) {
        return <>{props.children}</>;
    }
    return (
        <AssistHostProvider review="end">
            <DialogFieldAssistBody {...props} field={props.field} />
        </AssistHostProvider>
    );
}

function DialogFieldAssistBody({ field, value, expressionEditor, errors, onApply, children }: DialogFieldAssistProps & { field: FormField }) {
    const host = useAssistHost();
    const key = field.key;
    const latest = useRef(value);
    latest.current = value;
    const write = async (proposal: Proposal) => {
        const removeCreated = await runValueActions(expressionEditor.runAssistActions, proposal.actions, latest.current);
        onApply(proposal.expression, proposal.imports);
        return removeCreated;
    };
    const writeForReview = async (proposal: Proposal, request: string) => {
        const before = latest.current;
        const removeCreated = await write(proposal);
        host.setApplied((current) => withFieldChange(current, key, {
            before, after: proposal.expression, display: "code", request, label: field.label, note: reviewNote(proposal, before),
            values: { before, after: proposal.expression },
            revert: () => {
                onApply(before);
                if (removeCreated) {
                    void removeCreated();
                }
            },
        }));
        host.setReviewKey(key);
        host.close();
    };
    const assist = useFieldAssist({
        assist: (input) => expressionEditor.assistExpression({ ...input, key, property: assistProperty({ ...field, value: latest.current }) }),
        abort: expressionEditor.abortExpressionAssist,
        getValue: () => latest.current,
        sensitive: isSensitiveField(field.label, key),
        review: writeForReview,
    });
    // The review card's Revise has no form to ask, so it asks this field's own Copilot in its card.
    useEffect(() => host.registerForm({
        parts: () => [],
        handOff: () => undefined,
        revise: (_focus, instruction) => {
            host.setRevising(undefined);
            host.open(`field:${key}`, field.label);
            return assist.submit(instruction);
        },
        stop: () => assist.close(),
        needsValues: () => false,
        describe: () => ({ slots: [], groups: [] }),
        apply: () => undefined,
    }), [key]);
    const { context, panel } = useHostedFieldAssist(field, key, assist, { value, onApply: async (proposal) => { await write(proposal); }, currentErrors: () => errors });
    return (
        <FieldAssistContext.Provider value={context}>
            {/* The review marks this element as the field; display: contents keeps the editor's layout. */}
            <div style={{ display: "contents" }}>
                {children}
                <AssistMark fieldKey={key} />
            </div>
            {panel}
        </FieldAssistContext.Provider>
    );
}
