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

import React, { useState } from "react";
import styled from "@emotion/styled";
import type { ContextEntry, ContextEntrySource } from "@wso2/ballerina-core";
import { ActionButtons, CheckBox, Divider, Dropdown, TextField, Typography } from "@wso2/ui-toolkit";
import { EditorContainer, EditorContent } from "../../BI/ServiceDesigner/styles";
import { SOURCE_OPTIONS, canBeRequired, validateEntries, withSource } from "./contextEntries";

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
    onSave: (entry: ContextEntry) => void;
    onCancel: () => void;
}

/**
 * The editor of one context value, opened in place like the resource form's parameter editor: a key, where the
 * value comes from, the header or parameter name (or the value itself), and whether a request without it is
 * rejected.
 */
export function ContextValueEditor({ entry, others, isNew, onSave, onCancel }: ContextValueEditorProps) {
    const [draft, setDraft] = useState<ContextEntry>(entry);
    const [showErrors, setShowErrors] = useState(false);
    const option = SOURCE_OPTIONS[draft.source];
    const errors = validateEntries([...others, draft])[others.length];

    const save = () => {
        if (errors.key || errors.value) {
            setShowErrors(true);
            return;
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
                <TextField
                    id="context-value-value"
                    label={option.valueLabel}
                    required={draft.source !== "value"}
                    value={draft.value}
                    placeholder={option.placeholder}
                    description={draft.source === "expression"
                        ? "A Ballerina expression. The request is available as request." : undefined}
                    onTextChange={(value: string) => setDraft({ ...draft, value })}
                    errorMsg={showErrors ? errors.value : undefined}
                    sx={draft.source === "expression" ? { fontFamily: "var(--vscode-editor-font-family)" } : undefined}
                />
                {canBeRequired(draft.source) && (
                    <CheckBox
                        label="Required: reject requests without it"
                        checked={draft.required}
                        onChange={(required: boolean) => setDraft({ ...draft, required })}
                    />
                )}
            </Fields>
            <ActionButtons
                primaryButton={{ text: isNew ? "Add" : "Save", onClick: save, tooltip: isNew ? "Add" : "Save" }}
                secondaryButton={{ text: "Cancel", onClick: onCancel, tooltip: "Cancel" }}
                sx={{ justifyContent: "flex-end" }}
            />
        </EditorContainer>
    );
}
