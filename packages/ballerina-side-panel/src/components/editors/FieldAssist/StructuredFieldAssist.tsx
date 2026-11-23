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

import React, { useEffect } from "react";
import { ExpressionAssistResponse } from "@wso2/ballerina-core";
import { useFormContext } from "../../../context";
import { FormField } from "../../Form/types";
import { useModeSwitcherContext } from "../ModeSwitcherContext";
import { InputMode } from "../MultiModeExpressionEditor/ChipExpressionEditor/types";
import { getPropertyFromFormField } from "../utils";
import { replaceEditorText, whenEditorReplaced } from "../ExpressionEditor";
import { AssistCard, AssistHostContent, reviseInCard, useAssistHost } from "./AssistHost";
import { AssistButton, FieldAssistContext, FieldAssistPanel, useFieldAssist } from "./FieldAssist";

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
    const scope = `field:${key}`;
    const hosted = !!host && assist.available;
    const open = host?.scope === scope;
    // Another field or the whole form took the popover: this thread ends.
    useEffect(() => {
        if (hosted && host.shownScope !== scope && assist.open) {
            assist.close();
        }
    }, [hosted, host?.shownScope]);
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
    if (!hosted) {
        return { button: null, panel: null };
    }
    const context = { open: () => reviseInCard(host, key) || (open ? host.close() : host.open(scope, field.label)), isOpen: open || host.revising === key };
    return {
        button: <FieldAssistContext.Provider value={context}><AssistButton /></FieldAssistContext.Provider>,
        panel: (
            <>
                <AssistCard scope={scope} />
                <AssistHostContent scope={scope}>
                    <FieldAssistPanel assist={{ ...assist, close: () => host.close() }} value="" onApply={apply} embedded headless />
                </AssistHostContent>
            </>
        ),
    };
}
