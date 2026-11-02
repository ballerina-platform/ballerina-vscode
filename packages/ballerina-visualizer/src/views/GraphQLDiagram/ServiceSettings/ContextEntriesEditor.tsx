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

import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import type { ContextEntry, ContextEntrySource } from "@wso2/ballerina-core";
import { Button, CheckBox, Codicon, Dropdown, TextField, ThemeColors } from "@wso2/ui-toolkit";
import {
    SOURCE_OPTIONS,
    canBeRequired,
    hasErrors,
    isDirty,
    newEntry,
    normalizeEntries,
    validateEntries,
    withSource,
} from "./contextEntries";
import { Actions, Code, Description, EmptyState, ErrorText, Section, SectionTitle } from "./styles";

const EntryCard = styled.li`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 6px;
`;

const EntryList = styled.ul`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
`;

const FieldRow = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    align-items: start;
`;

const EntryFooter = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 24px;
`;

const AddButton = styled(Button)`
    align-self: flex-start;
`;

interface ContextEntriesEditorProps {
    /** The values the function sets now. */
    entries: ContextEntry[];
    saving: boolean;
    error?: string;
    onSave: (entries: ContextEntry[]) => void;
}

/**
 * The values the request context carries, edited as a list: each has a key, where its value comes from, and for a
 * request header or query parameter, whether a request without it is rejected.
 */
export function ContextEntriesEditor({ entries, saving, error, onSave }: ContextEntriesEditorProps) {
    const [draft, setDraft] = useState<ContextEntry[]>(entries);
    const [showErrors, setShowErrors] = useState(false);

    // A save, or an edit made in source, refreshes the saved entries; start again from them.
    const savedSignature = JSON.stringify(entries);
    useEffect(() => {
        setDraft(entries);
        setShowErrors(false);
    }, [savedSignature]);

    const errors = validateEntries(draft);
    const dirty = isDirty(entries, draft);

    const update = (index: number, change: Partial<ContextEntry>) =>
        setDraft((current) => current.map((entry, i) => (i === index ? { ...entry, ...change } : entry)));
    const remove = (index: number) => setDraft((current) => current.filter((_, i) => i !== index));
    const add = () => setDraft((current) => [...current, newEntry()]);

    const save = () => {
        if (hasErrors(errors)) {
            setShowErrors(true);
            return;
        }
        onSave(normalizeEntries(draft));
    };

    return (
        <Section aria-labelledby="context-values-title">
            <SectionTitle id="context-values-title">Values</SectionTitle>
            {draft.length === 0 ? (
                <EmptyState>No values yet. Add one to pass request data to your resolvers.</EmptyState>
            ) : (
                <EntryList>
                    {draft.map((entry, index) => {
                        const option = SOURCE_OPTIONS[entry.source];
                        const entryErrors = showErrors ? errors[index] : {};
                        return (
                            <EntryCard key={index} data-testid={`context-entry-${index}`}>
                                <FieldRow>
                                    <TextField
                                        id={`context-entry-key-${index}`}
                                        label="Key"
                                        value={entry.key}
                                        placeholder="scope"
                                        autoFocus={index === draft.length - 1 && !entry.key}
                                        onTextChange={(key: string) => update(index, { key })}
                                        errorMsg={entryErrors.key}
                                    />
                                    <Dropdown
                                        id={`context-entry-source-${index}`}
                                        label="From"
                                        value={entry.source}
                                        items={(Object.keys(SOURCE_OPTIONS) as ContextEntrySource[]).map((source) => ({
                                            id: source,
                                            value: source,
                                            content: SOURCE_OPTIONS[source].label,
                                        }))}
                                        onValueChange={(source: string) =>
                                            setDraft((current) => current.map((e, i) =>
                                                i === index ? withSource(e, source as ContextEntrySource) : e))}
                                    />
                                </FieldRow>
                                <TextField
                                    id={`context-entry-value-${index}`}
                                    label={option.valueLabel}
                                    value={entry.value}
                                    placeholder={option.placeholder}
                                    onTextChange={(value: string) => update(index, { value })}
                                    errorMsg={entryErrors.value}
                                    sx={entry.source === "expression"
                                        ? { fontFamily: "var(--vscode-editor-font-family)" } : undefined}
                                />
                                <EntryFooter>
                                    {canBeRequired(entry.source) ? (
                                        <CheckBox
                                            label="Required: reject requests without it"
                                            checked={entry.required}
                                            onChange={(required: boolean) => update(index, { required })}
                                        />
                                    ) : <span />}
                                    <Button
                                        appearance="icon"
                                        tooltip="Remove value"
                                        aria-label={`Remove ${entry.key || "value"}`}
                                        onClick={() => remove(index)}
                                    >
                                        <Codicon name="trash" />
                                    </Button>
                                </EntryFooter>
                            </EntryCard>
                        );
                    })}
                </EntryList>
            )}
            <AddButton appearance="secondary" onClick={add} data-testid="add-context-entry">
                <Codicon name="add" sx={{ marginRight: 4 }} /> Add Value
            </AddButton>
            {draft.length > 0 && (
                <Description>
                    Resolvers read a value with <Code>context.get("key")</Code>.
                </Description>
            )}
            {error && <ErrorText role="alert">{error}</ErrorText>}
            {dirty && (
                <Actions>
                    <Button appearance="secondary" onClick={() => setDraft(entries)} disabled={saving}>
                        Discard
                    </Button>
                    <Button appearance="primary" onClick={save} disabled={saving} data-testid="save-context-entries">
                        {saving ? "Saving..." : "Save Values"}
                    </Button>
                </Actions>
            )}
        </Section>
    );
}
