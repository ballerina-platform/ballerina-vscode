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
import { ExpressionAssistResponse } from "@wso2/ballerina-core";
import { useFormContext } from "../../../context";
import { FormField } from "../../Form/types";
import { useModeSwitcherContext } from "../ModeSwitcherContext";
import { InputMode } from "../MultiModeExpressionEditor/ChipExpressionEditor/types";
import { getPropertyFromFormField } from "../utils";
import { replaceEditorText, whenEditorReplaced } from "../ExpressionEditor";
import { AssistCard, AssistHostContent, reviseInCard, useAssistHost, withFieldChange } from "./AssistHost";
import { AssistButton, FieldAssistContext, FieldAssistPanel, Proposal, useFieldAssist } from "./FieldAssist";

/**
 * The field Copilot for a list or map editor, which edits item by item: a value it suggests goes in through the
 * field's expression mode. `beforeSwitch` runs the editor's own cleanup for a mode change.
 */
export function useStructuredFieldAssist(field: FormField, beforeSwitch?: () => void) {
    const host = useAssistHost();
    const { expressionEditor, updateImports } = useFormContext();
    const modeSwitcher = useModeSwitcherContext();
    const key = field.key;
    const canExpress = !!modeSwitcher?.isModeSwitcherEnabled && !!modeSwitcher.types?.some((type) => type.fieldType === "EXPRESSION");
    const assistExpression = canExpress && field.editable !== false ? expressionEditor?.assistExpression : undefined;
    const assist = useFieldAssist({
        assist: assistExpression && ((input) => assistExpression({
            ...input,
            key,
            property: { ...getPropertyFromFormField(field), types: modeSwitcher.types.map((type) => ({ ...type, selected: type.fieldType === "EXPRESSION" })) },
        })),
        abort: expressionEditor?.abortExpressionAssist,
        getValue: () => "",
    });
    const apply = async ({ expression, imports }: ExpressionAssistResponse & { expression: string }) => {
        if (imports) {
            updateImports?.(key, imports);
        }
        const previous = document.querySelector(`[data-testid="ex-editor-${key}"] .cm-editor`);
        beforeSwitch?.();
        modeSwitcher?.onModeChange(InputMode.EXP);
        whenEditorReplaced(key, previous, (editor) => replaceEditorText(editor, expression));
        // The user's edit, as typing is, so a form review of the field ends.
        host?.dropMark(key);
    };
    return useHostedFieldAssist(field, assist, { value: "", onApply: apply });
}

const NOT_TEXT = "This field holds plain text, so values from the flow can't go in. Ask for the text itself.";

/** The text a plain text field holds for a suggested value: a string literal or a template with nothing interpolated. */
export function plainText(expression: string): string | undefined {
    const trimmed = expression.trim();
    const template = /^(?:string\s*)?`([^`]*)`$/.exec(trimmed);
    if (template) {
        return template[1].includes("${") ? undefined : template[1];
    }
    if (!/^"(?:[^"\\]|\\.)*"$/.test(trimmed)) {
        return undefined;
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        return undefined;
    }
}

/** The field Copilot for a plain text field: a suggestion goes in as the text itself and is reviewed under the field. */
export function usePlainTextFieldAssist(field: FormField) {
    const host = useAssistHost();
    const { form, expressionEditor } = useFormContext();
    const key = field.key;
    const text = () => String(form.getValues(key) ?? "");
    const asExpression = () => (text() ? JSON.stringify(text()) : "");
    const write = (value: string) => {
        form.setValue(key, value, { shouldDirty: true, shouldValidate: true });
        field.onValueChange?.(value);
    };
    const fail = useRef<(error: string) => void>();
    const writeForReview = (proposal: Proposal, request: string) => {
        const after = plainText(proposal.expression);
        if (after === undefined) {
            fail.current?.(NOT_TEXT);
            return;
        }
        const before = text();
        write(after);
        host?.setApplied((current) => withFieldChange(current, key, {
            before, after, display: "text", request, label: field.label, note: proposal.note,
            values: { before, after }, revert: () => write(before),
        }));
        host?.setReviewKey(key);
        host?.close();
    };
    const assistExpression = field.editable !== false ? expressionEditor?.assistExpression : undefined;
    const assist = useFieldAssist({
        assist: assistExpression && ((input) => assistExpression({
            ...input,
            key,
            property: { ...getPropertyFromFormField(field), types: [{ fieldType: "EXPRESSION", ballerinaType: "string", selected: true }] },
        })),
        abort: expressionEditor?.abortExpressionAssist,
        getValue: asExpression,
        review: host ? writeForReview : undefined,
    });
    fail.current = assist.fail;
    const apply = async ({ expression }: Proposal) => {
        const after = plainText(expression);
        if (after === undefined) {
            throw new Error(NOT_TEXT);
        }
        write(after);
        host?.dropMark(key);
    };
    return useHostedFieldAssist(field, assist, { value: asExpression(), onApply: apply, display: (expression) => plainText(expression) ?? expression });
}

interface HostedPanel {
    value: string;
    onApply: (proposal: Proposal) => void | Promise<void>;
    display?: (expression: string) => string;
}

// A field's Copilot button and its thread in the form's Copilot host; the context also gives an expanded editor the button.
function useHostedFieldAssist(field: FormField, assist: ReturnType<typeof useFieldAssist>, panel: HostedPanel) {
    const host = useAssistHost();
    const key = field.key;
    const scope = `field:${key}`;
    const hosted = !!host && assist.available;
    const open = host?.scope === scope;
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
        panel: (
            <>
                <AssistCard scope={scope} />
                <AssistHostContent scope={scope}>
                    <FieldAssistPanel assist={{ ...assist, close: () => host.close() }} {...panel} embedded headless />
                </AssistHostContent>
            </>
        ),
    };
}
