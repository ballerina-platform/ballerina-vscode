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

import type { ContextEntry, ContextEntrySource } from "@wso2/ballerina-core";

/**
 * How each source reads in the editor: its name, the short tag of its list row, the label of its value field and an
 * example value.
 */
export const SOURCE_OPTIONS: Record<ContextEntrySource, {
    label: string;
    tag: string;
    valueLabel: string;
    placeholder: string;
}> = {
    header: { label: "Request header", tag: "Header", valueLabel: "Header name", placeholder: "x-user-id" },
    query: { label: "Query parameter", tag: "Query", valueLabel: "Parameter name", placeholder: "tenant" },
    value: { label: "Fixed value", tag: "Value", valueLabel: "Value", placeholder: "production" },
    expression: { label: "Expression", tag: "Expression", valueLabel: "Expression", placeholder: "request.rawPath" },
};

/** Whether the source reads from the request, so it can be required. */
export function canBeRequired(source: ContextEntrySource): boolean {
    return source === "header" || source === "query";
}

/** A new, empty entry. Headers are the common case, and a missing one rejects the request. */
export function newEntry(): ContextEntry {
    return { key: "", source: "header", value: "", required: true };
}

/** The entry with its source changed: the value is kept, and "required" only applies to request values. */
export function withSource(entry: ContextEntry, source: ContextEntrySource): ContextEntry {
    return { ...entry, source, required: canBeRequired(source) ? entry.required : false };
}

export interface EntryErrors {
    key?: string;
    value?: string;
}

/**
 * The problems with each entry, by index. Mirrors the language server's checks, except that an expression is only
 * checked for being non-empty here; whether it parses is left to the server, which reports it on save.
 */
export function validateEntries(entries: ContextEntry[]): EntryErrors[] {
    const counts = new Map<string, number>();
    entries.forEach((entry) => {
        const key = entry.key.trim();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return entries.map((entry) => {
        const errors: EntryErrors = {};
        const key = entry.key.trim();
        if (!key) {
            errors.key = "Enter a key.";
        } else if ((counts.get(key) ?? 0) > 1) {
            errors.key = "This key is already used.";
        }
        if (entry.source !== "value" && !entry.value.trim()) {
            errors.value = `Enter ${SOURCE_OPTIONS[entry.source].valueLabel.toLowerCase()}.`;
        }
        return errors;
    });
}

/** The entries as they are saved: keys and request-value names trimmed. Fixed values are kept exactly. */
export function normalizeEntries(entries: ContextEntry[]): ContextEntry[] {
    return entries.map((entry) => ({
        key: entry.key.trim(),
        source: entry.source,
        value: entry.source === "value" ? entry.value : entry.value.trim(),
        required: canBeRequired(entry.source) && entry.required,
    }));
}

/** Whether the draft differs from what the function sets now. */
export function isDirty(saved: ContextEntry[], draft: ContextEntry[]): boolean {
    return JSON.stringify(normalizeEntries(saved)) !== JSON.stringify(normalizeEntries(draft));
}
