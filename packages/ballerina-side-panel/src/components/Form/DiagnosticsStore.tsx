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

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { ValidationSeverity } from "@wso2/ballerina-core";

/**
 * One inline diagnostics slot per field, fed by three producers with very different latencies:
 * synchronous client rules, debounced language-server rules, and compiler diagnostics from the
 * expression editors. Keeping them in separate buckets is what lets a slow producer's result land
 * without clobbering a fast one's — a single list would race.
 */

export type DiagnosticSource = "client" | "ls" | "compiler";

export interface FieldDiagnostic {
    rule: string;
    message: string;
    severity: ValidationSeverity;
    source: DiagnosticSource;
}

export interface FieldDiagnostics {
    client: FieldDiagnostic[];
    ls: FieldDiagnostic[];
    compiler: FieldDiagnostic[];
    /** Monotonic per-field revision. A response carrying an older version is stale and dropped. */
    version: number;
    isValidating: boolean;
}

const EMPTY_FIELD: FieldDiagnostics = {
    client: [],
    ls: [],
    compiler: [],
    version: 0,
    isValidating: false,
};

interface DiagnosticsStoreValue {
    getField: (fieldKey: string) => FieldDiagnostics;
    /** Replaces one bucket outright — producers own their bucket and never merge into another's. */
    setBucket: (fieldKey: string, source: DiagnosticSource, diagnostics: FieldDiagnostic[]) => void;
    /** Bumps the field's version and returns it, for a caller about to issue an async request. */
    bumpVersion: (fieldKey: string) => number;
    /** Applies an async result only if `version` is still the field's latest. */
    applyVersionedLsResult: (fieldKey: string, version: number, diagnostics: FieldDiagnostic[]) => void;
    /** As above for the client bucket, which host-backed rules also write to asynchronously. */
    applyVersionedClientResult: (fieldKey: string, version: number, diagnostics: FieldDiagnostic[]) => void;
    /** Marks a version's round of remote checks complete, clearing `isValidating` if it is current. */
    settleVersion: (fieldKey: string, version: number) => void;
    setValidating: (fieldKey: string, isValidating: boolean) => void;
    clearField: (fieldKey: string) => void;
    hasBlockingErrors: () => boolean;
    isAnyValidating: () => boolean;
}

/**
 * Exported (rather than kept module-private) so a component that owns the state via
 * {@link useDiagnosticsStoreState} — instead of just rendering {@link DiagnosticsStoreProvider} — can
 * provide it directly. `Form` needs this: it renders `DiagnosticsStoreProvider` as a *descendant* of
 * itself, so `Form` cannot call `useDiagnosticsStore()` to read `hasBlockingErrors()` for its own Save
 * button — a component is never inside the context provider it creates. Calling the hook directly and
 * providing the context explicitly sidesteps that.
 */
export const DiagnosticsStoreContext = createContext<DiagnosticsStoreValue | undefined>(undefined);

/** The state and actions behind {@link DiagnosticsStoreProvider}, for a caller that needs direct access
 * to the value it is about to provide (see {@link DiagnosticsStoreContext}'s doc). */
export function useDiagnosticsStoreState(): DiagnosticsStoreValue {
    const [fields, setFields] = useState<Record<string, FieldDiagnostics>>({});
    // The versions are read and written inside async callbacks, where the state snapshot may be
    // stale; a ref keeps the counter authoritative regardless of render timing.
    const versionsRef = useRef<Record<string, number>>({});

    const getField = useCallback(
        (fieldKey: string) => fields[fieldKey] ?? EMPTY_FIELD,
        [fields]
    );

    const setBucket = useCallback((fieldKey: string, source: DiagnosticSource, diagnostics: FieldDiagnostic[]) => {
        setFields((previous) => {
            const current = previous[fieldKey] ?? EMPTY_FIELD;
            return { ...previous, [fieldKey]: { ...current, [source]: diagnostics } };
        });
    }, []);

    const bumpVersion = useCallback((fieldKey: string) => {
        const next = (versionsRef.current[fieldKey] ?? 0) + 1;
        versionsRef.current[fieldKey] = next;
        setFields((previous) => {
            const current = previous[fieldKey] ?? EMPTY_FIELD;
            return { ...previous, [fieldKey]: { ...current, version: next, isValidating: true } };
        });
        return next;
    }, []);

    const applyVersionedLsResult = useCallback(
        (fieldKey: string, version: number, diagnostics: FieldDiagnostic[]) => {
            // A newer keystroke has already superseded this request — its verdict describes a value
            // the user no longer has, so rendering it would be actively wrong.
            if (version !== versionsRef.current[fieldKey]) {
                return;
            }
            setFields((previous) => {
                const current = previous[fieldKey] ?? EMPTY_FIELD;
                return { ...previous, [fieldKey]: { ...current, ls: diagnostics, isValidating: false } };
            });
        },
        []
    );

    const applyVersionedClientResult = useCallback(
        (fieldKey: string, version: number, diagnostics: FieldDiagnostic[]) => {
            if (version !== versionsRef.current[fieldKey]) {
                return;
            }
            setFields((previous) => {
                const current = previous[fieldKey] ?? EMPTY_FIELD;
                return { ...previous, [fieldKey]: { ...current, client: diagnostics } };
            });
        },
        []
    );

    const settleVersion = useCallback((fieldKey: string, version: number) => {
        // A newer round is already in flight — leave `isValidating` set for it.
        if (version !== versionsRef.current[fieldKey]) {
            return;
        }
        setFields((previous) => {
            const current = previous[fieldKey] ?? EMPTY_FIELD;
            return { ...previous, [fieldKey]: { ...current, isValidating: false } };
        });
    }, []);

    const setValidating = useCallback((fieldKey: string, isValidating: boolean) => {
        setFields((previous) => {
            const current = previous[fieldKey] ?? EMPTY_FIELD;
            return { ...previous, [fieldKey]: { ...current, isValidating } };
        });
    }, []);

    const clearField = useCallback((fieldKey: string) => {
        delete versionsRef.current[fieldKey];
        setFields((previous) => {
            const next = { ...previous };
            delete next[fieldKey];
            return next;
        });
    }, []);

    const hasBlockingErrors = useCallback(
        () => Object.values(fields).some((field) =>
            [...field.client, ...field.ls, ...field.compiler].some((d) => d.severity === "ERROR")),
        [fields]
    );

    const isAnyValidating = useCallback(
        () => Object.values(fields).some((field) => field.isValidating),
        [fields]
    );

    return useMemo<DiagnosticsStoreValue>(
        () => ({
            getField,
            setBucket,
            bumpVersion,
            applyVersionedLsResult,
            applyVersionedClientResult,
            settleVersion,
            setValidating,
            clearField,
            hasBlockingErrors,
            isAnyValidating,
        }),
        [getField, setBucket, bumpVersion, applyVersionedLsResult, applyVersionedClientResult,
            settleVersion, setValidating, clearField, hasBlockingErrors, isAnyValidating]
    );
}

/** Convenience wrapper for a caller that only needs to make the store available to descendants —
 * see {@link useDiagnosticsStoreState} when the caller itself needs to read the value too. */
export function DiagnosticsStoreProvider(props: { children: React.ReactNode }) {
    const value = useDiagnosticsStoreState();
    return (
        <DiagnosticsStoreContext.Provider value={value}>
            {props.children}
        </DiagnosticsStoreContext.Provider>
    );
}

/**
 * The store is optional: forms that have not adopted it still render, they just get no live
 * language-server feedback. Callers must handle `undefined` rather than assuming a provider.
 */
export function useDiagnosticsStore(): DiagnosticsStoreValue | undefined {
    return useContext(DiagnosticsStoreContext);
}

/**
 * Merges a field's buckets for rendering: ERRORs before WARNINGs, and within a severity the fastest
 * producer first (client, then ls, then compiler) so the slot stays stable as slower results land.
 * Duplicates by `(rule, message)` collapse — the same failure often arrives from both the client
 * rule and the server's re-check of it.
 */
export function mergeFieldDiagnostics(field: FieldDiagnostics): FieldDiagnostic[] {
    const ordered = [...field.client, ...field.ls, ...field.compiler];
    const seen = new Set<string>();
    const deduped = ordered.filter((diagnostic) => {
        const key = `${diagnostic.rule} ${diagnostic.message}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
    const errors = deduped.filter((diagnostic) => diagnostic.severity === "ERROR");
    const warnings = deduped.filter((diagnostic) => diagnostic.severity !== "ERROR");
    return [...errors, ...warnings];
}

/**
 * Collapses a list of diagnostic messages (already resolved to display text, unlike
 * {@link mergeFieldDiagnostics} which dedupes structured diagnostics) to their distinct values,
 * preserving order. Shared by the editors that combine react-hook-form's own error with the live
 * client/ls diagnostics into one banner.
 */
export function dedupeMessages(messages: (string | undefined | null | false)[]): string[] {
    return Array.from(new Set(messages.filter((message): message is string => !!message)));
}
