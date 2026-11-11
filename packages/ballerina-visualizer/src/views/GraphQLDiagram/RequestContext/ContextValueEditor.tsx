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

import React, { useRef, useState } from "react";
import styled from "@emotion/styled";
import type { ContextEntry, ContextEntrySource, LineRange, PropertyModel } from "@wso2/ballerina-core";
import { ActionButtons, CheckBox, Divider, Dropdown, TextField, Typography } from "@wso2/ui-toolkit";
import { EditorContainer, EditorContent } from "../../BI/ServiceDesigner/styles";
import {
    AnnotationExpressionField,
    AnnotationExpressionFieldHandle,
} from "../../BI/ServiceDesigner/Forms/TriggerHandlerForm/AnnotationExpressionField";
import { SOURCE_OPTIONS, canBeRequired, validateEntries, withSource } from "./contextEntries";

/** The expression field's label, description and type, in the shape the shared expression editor reads. */
const EXPRESSION_PROPERTY: PropertyModel = {
    metadata: {
        label: "Expression",
        description: "A Ballerina expression. Use request to read the incoming HTTP request.",
    },
    types: [{ fieldType: "EXPRESSION", selected: true }],
    optional: false,
    editable: true,
};

const ErrorText = styled.span`
    color: var(--vscode-errorForeground);
    font-size: 12px;
`;

const Fields = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px 0 4px;
`;

interface ContextValueEditorProps {
    /** The value being edited, or a new one. */
    entry: ContextEntry;
    /** The other values the context carries, so a key cannot be used twice. */
    others: ContextEntry[];
    isNew: boolean;
    /**
     * Where an expression value is in scope: the context function's file and a position inside it. With it, an
     * expression gets the shared expression editor, with completions and live diagnostics for that scope.
     */
    expressionScope?: { filePath: string; lineRange: LineRange };
    onSave: (entry: ContextEntry) => void;
    onCancel: () => void;
}

/**
 * The editor of one context value, opened in place like the resource form's parameter editor: a key, where the
 * value comes from, the header or parameter name (or the value itself), and whether a request without it is
 * rejected.
 */
export function ContextValueEditor({ entry, others, isNew, expressionScope, onSave, onCancel }: ContextValueEditorProps) {
    const [draft, setDraft] = useState<ContextEntry>(entry);
    const [showErrors, setShowErrors] = useState(false);
    const option = SOURCE_OPTIONS[draft.source];
    const errors = validateEntries([...others, draft])[others.length];

    const expressionField = useRef<AnnotationExpressionFieldHandle>(null);
    const [checking, setChecking] = useState(false);
    const usesExpressionEditor = draft.source === "expression" && !!expressionScope;

    const save = async () => {
        if (errors.key || errors.value) {
            setShowErrors(true);
            return;
        }
        if (usesExpressionEditor && expressionField.current) {
            // The same gate the trigger form uses: re-check the expression now rather than trust the typing-time
            // debounce, so an expression that does not compile in the context function is never written into it.
            // The field shows its own errors.
            setChecking(true);
            try {
                const diagnostics = await expressionField.current.revalidate();
                if (diagnostics.length > 0) {
                    return;
                }
            } finally {
                setChecking(false);
            }
        }
        onSave(draft);
    };

    return (
        <EditorContainer data-testid="context-value-editor">
            <EditorContent>
                <Typography sx={{ marginBlockEnd: 0, marginTop: 5 }} variant="h4">Context Value</Typography>
            </EditorContent>
            <Divider />
            <Fields>
                <TextField
                    id="context-value-key"
                    label="Key"
                    required
                    value={draft.key}
                    placeholder="scope"
                    description="The name resolvers read the value by."
                    autoFocus={isNew}
                    onTextChange={(key: string) => setDraft({ ...draft, key })}
                    errorMsg={showErrors ? errors.key : undefined}
                />
                <Dropdown
                    id="context-value-source"
                    label="Source"
                    value={draft.source}
                    items={(Object.keys(SOURCE_OPTIONS) as ContextEntrySource[]).map((source) => ({
                        id: source,
                        value: source,
                        content: SOURCE_OPTIONS[source].label,
                    }))}
                    onValueChange={(source: string) => setDraft(withSource(draft, source as ContextEntrySource))}
                />
                {usesExpressionEditor ? (
                    <AnnotationExpressionField
                        ref={expressionField}
                        id="context-value-expression"
                        value={draft.value}
                        property={EXPRESSION_PROPERTY}
                        filePath={expressionScope.filePath}
                        targetLineRange={expressionScope.lineRange}
                        required
                        onChange={(value: string) => setDraft((current) => ({ ...current, value }))}
                    />
                ) : (
                    <TextField
                        id="context-value-value"
                        label={option.valueLabel}
                        required={draft.source !== "value"}
                        value={draft.value}
                        placeholder={option.placeholder}
                        description={draft.source === "expression"
                            ? EXPRESSION_PROPERTY.metadata.description : undefined}
                        onTextChange={(value: string) => setDraft({ ...draft, value })}
                        errorMsg={showErrors ? errors.value : undefined}
                        sx={draft.source === "expression"
                            ? { fontFamily: "var(--vscode-editor-font-family)" } : undefined}
                    />
                )}
                {showErrors && errors.value && usesExpressionEditor && (
                    <ErrorText role="alert">{errors.value}</ErrorText>
                )}
                {canBeRequired(draft.source) && (
                    <CheckBox
                        label="Required: reject requests without it"
                        checked={draft.required}
                        onChange={(required: boolean) => setDraft({ ...draft, required })}
                    />
                )}
            </Fields>
            <ActionButtons
                primaryButton={{
                    text: checking ? "Checking..." : isNew ? "Add" : "Save",
                    onClick: save,
                    tooltip: isNew ? "Add" : "Save",
                    disabled: checking,
                }}
                secondaryButton={{ text: "Cancel", onClick: onCancel, tooltip: "Cancel", disabled: checking }}
                sx={{ justifyContent: "flex-end" }}
            />
        </EditorContainer>
    );
}
