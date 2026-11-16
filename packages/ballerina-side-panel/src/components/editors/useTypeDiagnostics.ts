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

import { useEffect, useRef } from "react";
import { FormField } from "../Form/types";
import { useFormContext } from "../../context";
import { useDiagnosticsStore } from "../Form/DiagnosticsStore";
import { getPropertyFromFormField } from "./utils";

// A module-qualified type reference such as `http:Client`.
const MODULE_QUALIFIED_TYPE = /[A-Za-z_'][\w.]*:[A-Za-z_']/;

export interface TypeDiagnosticsOptions {
    enabled: boolean;
    // Report errors on module-qualified types as warnings (ballerina-lang#44533 flags valid submodule types).
    warnOnModuleQualified?: boolean;
}

export interface TypeDiagnostics {
    validateType: (value: string) => void;
    typeErrorMessage?: string;
    typeWarningMessage?: string;
}

/**
 * Checks a type field's value through the host's form diagnostics and keeps the result in the
 * diagnostics store, so Save stays disabled while a check is pending and while the type is invalid.
 */
export function useTypeDiagnostics(field: FormField, options: TypeDiagnosticsOptions): TypeDiagnostics {
    const { enabled, warnOnModuleQualified } = options;
    const { form, expressionEditor } = useFormContext();
    const getExpressionFormDiagnostics = expressionEditor?.getExpressionFormDiagnostics;

    const diagnosticsStore = useDiagnosticsStore();
    const diagnosticsStoreRef = useRef(diagnosticsStore);
    diagnosticsStoreRef.current = diagnosticsStore;
    const latestVersionRef = useRef<number>();
    const fieldKeyRef = useRef(field.key);
    fieldKeyRef.current = field.key;

    const validateType = (value: string) => {
        if (!enabled || !getExpressionFormDiagnostics) {
            return;
        }
        const requestKey = field.key;
        const version = diagnosticsStore?.bumpVersion(requestKey);
        latestVersionRef.current = version;
        void getExpressionFormDiagnostics(
            !!value.trim(),
            value,
            requestKey,
            getPropertyFromFormField(field),
            ({ diagnostics }) => {
                // Drop the response if this editor now serves another field or a newer check is pending.
                if (fieldKeyRef.current !== requestKey || latestVersionRef.current !== version) {
                    return;
                }
                const store = diagnosticsStoreRef.current;
                store?.settleVersion(requestKey, version);
                if (form.getValues(requestKey) !== value) {
                    return;
                }
                // Kept in the store rather than set on react-hook-form: a later revalidation of the field
                // would clear a manual setError without checking the type again, and re-enable Save.
                const firstError = diagnostics?.find((diagnostic) => diagnostic.severity === 1);
                const severity = warnOnModuleQualified && MODULE_QUALIFIED_TYPE.test(value) ? "WARNING" : "ERROR";
                store?.setBucket(requestKey, "compiler", firstError
                    ? [{ rule: "type", message: firstError.message, severity, source: "compiler" }]
                    : []);
            }
        );
    };

    // Drop an in-flight check and the field's store entry when the editor goes away, or Save stays disabled.
    useEffect(() => {
        if (!enabled) {
            return;
        }
        const key = field.key;
        return () => {
            latestVersionRef.current = undefined;
            diagnosticsStoreRef.current?.clearField(key);
        };
    }, [field.key, enabled]);

    const finding = enabled ? diagnosticsStore?.getField(field.key).compiler[0] : undefined;
    return {
        validateType,
        typeErrorMessage: finding?.severity === "ERROR" ? finding.message : undefined,
        typeWarningMessage: finding && finding.severity !== "ERROR" ? finding.message : undefined,
    };
}
