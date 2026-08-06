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

import { useCallback, useEffect, useMemo, useRef } from "react";
import { CodeData, PropertyModel, ValidationResult } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { FormField } from "./types";
import {
    ClientRuleContext,
    ClientValidationFailure,
    evaluateAsyncClientRules,
    evaluateClientRules,
    hasAsyncClientRules,
    resolveActiveValidations,
} from "./validationRules";
import {
    FieldDiagnostic,
    mergeFieldDiagnostics,
    useDiagnosticsStore,
} from "./DiagnosticsStore";

/** Long enough that a typing burst issues one request, short enough to feel immediate. */
const LS_DEBOUNCE_MS = 350;

export interface FieldDiagnosticsContext {
    filePath?: string;
    moduleName?: string;
    /** Locates the enclosing service, for the server rules scoped to one service. */
    codedata?: CodeData;
    /** Sibling values for the in-form uniqueness rule. */
    getSiblingValues?: ClientRuleContext["getSiblingValues"];
    /** Workspace file listing for the file-existence rule. */
    listWorkspaceFiles?: () => Promise<{ workspaceRoot: string; files: { relativePath: string; path: string }[] }>;
    /**
     * The fieldType of the member the user is currently editing. Rules live on a `types[]` member
     * and run only while that member is active, so editors that switch modes (e.g. NUMBER↔EXPRESSION)
     * pass the current one. Omitted → the selected/primary member.
     */
    activeFieldType?: string;
}

export interface UseFieldDiagnosticsResult {
    errors: FieldDiagnostic[];
    warnings: FieldDiagnostic[];
    isValidating: boolean;
    /** Re-runs every producer now and resolves with the merged result. Used by submit. */
    revalidate: (value: unknown) => Promise<FieldDiagnostic[]>;
    /** Feed every edit through this: sync rules run now, the remote checks are debounced. */
    onValueChange: (value: unknown) => void;
}

const hasLsRules = (field: FormField, activeFieldType?: string): boolean =>
    resolveActiveValidations(field, activeFieldType).some((rule) => rule?.rule?.startsWith("ls."));

const toClientDiagnostics = (failures: ClientValidationFailure[]): FieldDiagnostic[] =>
    failures.map((failure) => ({
        rule: failure.rule,
        message: failure.message,
        severity: failure.severity,
        source: "client" as const,
    }));

const toLsDiagnostics = (results: ValidationResult[]): FieldDiagnostic[] =>
    (results ?? []).map((result) => ({
        rule: result.rule,
        message: result.message,
        severity: result.severity === "WARNING" ? "WARNING" : "ERROR",
        source: "ls" as const,
    }));

/**
 * Projects the form's field back onto the wire shape the language server deserializes.
 *
 * `FormField` is the webview's flattened view (`label`, `documentation`), while the server reads a
 * `Value` whose label lives under `metadata`. Sending the raw field would leave `metadata` absent
 * and every `{label}` placeholder rendering as "This field" — the same rule then reads differently
 * live than it does from the save-time gate.
 */
function toPropertyModel(field: FormField, value: unknown): PropertyModel {
    return {
        metadata: { label: field.label ?? field.key, description: field.documentation ?? "" },
        codedata: field.codedata,
        // Validations ride on the type members, so carrying `types` carries the rules too.
        types: field.types,
        value: value as string,
        optional: field.optional,
        editable: field.editable,
        enabled: field.enabled,
        advanced: field.advanced,
        placeholder: field.placeholder,
    };
}

/**
 * Owns one field's diagnostics: runs the client rules synchronously on every change and, for fields
 * carrying `ls.*` or host-backed `vscode.*` rules, issues a debounced remote check.
 *
 * The versioning matters more than the debounce. Requests can complete out of order, so a result is
 * only applied when its version is still the field's latest — otherwise a slow verdict about an old
 * value would overwrite a fast verdict about the current one. One version covers a whole change
 * event, so the server check and the host check cannot invalidate each other.
 */
export function useFieldDiagnostics(
    field: FormField,
    context?: FieldDiagnosticsContext
): UseFieldDiagnosticsResult {
    const store = useDiagnosticsStore();
    const { rpcClient } = useRpcContext();
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    const fieldKey = field?.key;
    const activeFieldType = context?.activeFieldType;
    const shouldQueryLs = !!fieldKey && hasLsRules(field, activeFieldType) && !!context?.filePath && !!rpcClient;
    const shouldQueryHost = !!fieldKey && hasAsyncClientRules(field, activeFieldType)
        && !!context?.listWorkspaceFiles;
    // Whether the active member carries any client-runnable (common.*/vscode.*) rule. When it does
    // not, this field can never produce a client diagnostic, so we never touch the store for it —
    // avoiding a per-keystroke state write (and the fan-out re-render of every other subscribed
    // field) on the many fields that ship no validations.
    const hasClientRules = !!fieldKey && resolveActiveValidations(field, activeFieldType)
        .some((rule) => rule?.rule && !rule.rule.startsWith("ls."));

    const runClientRules = useCallback(
        (value: unknown): FieldDiagnostic[] => {
            if (!hasClientRules) {
                return [];
            }
            const failures = toClientDiagnostics(evaluateClientRules(field, value,
                { getSiblingValues: context?.getSiblingValues, activeFieldType }));
            store?.setBucket(fieldKey, "client", failures);
            return failures;
        },
        [field, fieldKey, store, context?.getSiblingValues, activeFieldType, hasClientRules]
    );

    /** Resolves with the server's findings so callers need not re-read the store afterwards. */
    const runLsRules = useCallback(
        async (value: unknown, version: number): Promise<FieldDiagnostic[]> => {
            if (!shouldQueryLs || !store) {
                return [];
            }
            try {
                const response = await rpcClient.getServiceDesignerRpcClient().validateProperty({
                    filePath: context.filePath,
                    propertyPath: fieldKey,
                    property: toPropertyModel(field, value),
                    moduleName: context.moduleName,
                    codedata: context.codedata,
                    version,
                });
                const diagnostics = toLsDiagnostics(response.validationErrors);
                store.applyVersionedLsResult(fieldKey, response.version, diagnostics);
                return diagnostics;
            } catch (error) {
                // The server is unreachable or errored. Live feedback degrades to the client rules;
                // the save-time gate still runs, so nothing invalid slips through unnoticed.
                console.warn(`[validation] Live validation failed for '${fieldKey}'`, error);
                store.applyVersionedLsResult(fieldKey, version, []);
                return [];
            }
        },
        [shouldQueryLs, store, fieldKey, field, context, rpcClient]
    );

    /**
     * The host-backed `vscode.*` rules. They resolve against the same version as the server check
     * and re-assert the sync results alongside their own, so the client bucket stays a complete
     * picture without a late result resurrecting diagnostics for a value the user has replaced.
     */
    const runHostRules = useCallback(
        async (value: unknown, version: number): Promise<FieldDiagnostic[]> => {
            if (!shouldQueryHost || !store) {
                return [];
            }
            const failures = toClientDiagnostics(await evaluateAsyncClientRules(field, value,
                { listWorkspaceFiles: context.listWorkspaceFiles, activeFieldType }));
            // Re-derive the sync failures rather than reusing a snapshot captured before the await:
            // the value may have changed while the listing was in flight.
            const syncFailures = toClientDiagnostics(evaluateClientRules(field, value,
                { getSiblingValues: context?.getSiblingValues, activeFieldType }));
            store.applyVersionedClientResult(fieldKey, version, [...syncFailures, ...failures]);
            return failures;
        },
        [shouldQueryHost, store, fieldKey, field, context, activeFieldType]
    );

    /** Issues one versioned round of remote checks and resolves with everything they found. */
    const runRemoteRules = useCallback(
        async (value: unknown): Promise<{ ls: FieldDiagnostic[]; host: FieldDiagnostic[] }> => {
            if (!store || (!shouldQueryLs && !shouldQueryHost)) {
                return { ls: [], host: [] };
            }
            // One bump per change event covers both producers, so neither can strand the other's
            // result as stale, and `isValidating` reflects the whole round.
            const version = store.bumpVersion(fieldKey);
            const [ls, host] = await Promise.all([
                runLsRules(value, version),
                runHostRules(value, version),
            ]);
            store.settleVersion(fieldKey, version);
            return { ls, host };
        },
        [store, shouldQueryLs, shouldQueryHost, fieldKey, runLsRules, runHostRules]
    );

    const onValueChange = useCallback(
        (value: unknown) => {
            runClientRules(value);
            if (!shouldQueryLs && !shouldQueryHost) {
                return;
            }
            clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                void runRemoteRules(value);
            }, LS_DEBOUNCE_MS);
        },
        [runClientRules, runRemoteRules, shouldQueryLs, shouldQueryHost]
    );

    const revalidate = useCallback(
        async (value: unknown): Promise<FieldDiagnostic[]> => {
            const clientFailures = runClientRules(value);
            // Submit must not race the debounce: fire everything now and wait for the verdicts.
            clearTimeout(debounceRef.current);
            const { ls, host } = await runRemoteRules(value);
            // Build the answer from what the producers just returned rather than re-reading the
            // store: the store writes above only schedule a re-render, so this closure would still
            // observe the pre-request snapshot and report a field as clean that is not.
            return mergeFieldDiagnostics({
                client: [...clientFailures, ...host],
                ls,
                compiler: store?.getField(fieldKey)?.compiler ?? [],
                version: 0,
                isValidating: false,
            });
        },
        [runClientRules, runRemoteRules, store, fieldKey]
    );

    // `store` is read through a ref rather than closed over directly: its identity changes on every
    // diagnostics write anywhere in the form (each write replaces the whole `fields` map), and if it
    // were a dependency below this cleanup would re-fire — clearing THIS field's diagnostics — every
    // time an unrelated field's diagnostics changed, not just when this field's editor goes away.
    const storeRef = useRef(store);
    storeRef.current = store;

    useEffect(() => {
        return () => {
            clearTimeout(debounceRef.current);
            // Drop this field's entry so an editor that later reuses the same key (e.g. a repeatable
            // list item removed and re-added) does not inherit stale diagnostics left behind here.
            storeRef.current?.clearField(fieldKey);
        };
    }, [fieldKey]);

    // Clear any client diagnostics left over when the field no longer has client rules — e.g. the
    // user switched a NUMBER↔EXPRESSION field from the member that carried a rule to the one that
    // does not. Guarded on the bucket being non-empty so a field that never had rules is never
    // written to (keeping the "don't write when there's nothing to validate" property intact).
    useEffect(() => {
        if (hasClientRules || !store || !fieldKey) {
            return;
        }
        if (store.getField(fieldKey).client.length > 0) {
            store.setBucket(fieldKey, "client", []);
        }
    }, [hasClientRules, activeFieldType, store, fieldKey]);

    const current = store?.getField(fieldKey);
    const merged = useMemo(() => (current ? mergeFieldDiagnostics(current) : []), [current]);

    return {
        errors: merged.filter((diagnostic) => diagnostic.severity === "ERROR"),
        warnings: merged.filter((diagnostic) => diagnostic.severity !== "ERROR"),
        isValidating: current?.isValidating ?? false,
        revalidate,
        onValueChange,
    };
}
