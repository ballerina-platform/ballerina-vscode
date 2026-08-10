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

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { debounce } from "lodash";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import {
    Diagnostic,
    ExpressionProperty,
    LineRange,
    PropertyModel,
    RecordTypeField,
    TriggerCharacter,
    TRIGGER_CHARACTERS,
} from "@wso2/ballerina-core";
import {
    DiagnosticsStoreContext,
    FieldFactory,
    FormExpressionEditorProps,
    FormField,
    FormValues,
    Provider as FormContextProvider,
    evaluateClientRules,
    getRecordTypeFields,
    useDiagnosticsStoreState,
} from "@wso2/ballerina-side-panel";
import { CompletionItem } from "@wso2/ui-toolkit";

import { getHelperPaneNew } from "../../../HelperPaneNew";
import { ConfigureRecordPage } from "../../../HelperPaneNew/Views/RecordConfigModal";
import DynamicModal from "../../../../../components/Modal";
import { EXPRESSION_EXTRACTION_REGEX } from "../../../../../constants";
import { calculateExpressionOffsets, convertBalCompletion, removeDuplicateDiagnostics } from "../../../../../utils/bi";

/**
 * The react-hook-form field key every leaf binds to. Each leaf renders its own isolated
 * {@link useForm} instance, so a single fixed key is sufficient and keeps the value plumbing simple.
 */
const FIELD_KEY = "value";

const EMPTY_LINE_RANGE: LineRange = {
    startLine: { line: 0, offset: 0 },
    endLine: { line: 0, offset: 0 },
};

export interface AnnotationExpressionFieldProps {
    id?: string;
    value: string;
    property?: PropertyModel;
    filePath?: string;
    targetLineRange?: LineRange;
    required?: boolean;
    disabled?: boolean;
    onChange: (value: string) => void;
    onDiagnosticsChange?: (diagnostics: Diagnostic[]) => void;
    onValidationStateChange?: (state: { isValidating: boolean }) => void;
}

export interface AnnotationExpressionFieldHandle {
    /**
     * Synchronously re-runs diagnostics for the current value, bypassing the typing-time debounce.
     * Returns the resulting diagnostics (empty on LS failure — the same silent fallback used while
     * typing). Consumed by the save-time gate.
     */
    revalidate: () => Promise<Diagnostic[]>;
}

/**
 * A single Text/Expression annotation leaf, rendered through the shared side-panel editor stack
 * ({@link FieldFactory} → EditorFactory → the mode-aware ExpressionEditor). Replaces the bespoke
 * TextExpressionField: the Text/Expression toggle, string-literal quoting and required/diagnostic
 * validation are all handled by the shared components instead of hand-rolled here.
 *
 * Each leaf owns an isolated react-hook-form instance bound to {@link FIELD_KEY}; the bound value is
 * mirrored back out through {@link AnnotationExpressionFieldProps.onChange} so the caller's model
 * tree stays the source of truth for save. The value the editor emits (a quoted string literal in
 * Text mode) is stored verbatim — the language server's annotation emitter quotes string leaves
 * idempotently, so it round-trips without double-quoting.
 */
export const AnnotationExpressionField = forwardRef<AnnotationExpressionFieldHandle, AnnotationExpressionFieldProps>(
    (props, ref) => {
        // `disabled` is accepted for API parity with the former TextExpressionField but is not wired:
        // FieldFactory exposes no disabled pass-through, and the annotation panel only disables during
        // the brief save round-trip. `required` is folded into the field's `optional` below.
        const { id, value, property, filePath, targetLineRange, required, onChange,
            onDiagnosticsChange, onValidationStateChange } = props;
        const { rpcClient } = useRpcContext();

        const methods = useForm<FormValues>({ defaultValues: { [FIELD_KEY]: value ?? "" } });
        const { control, getValues, setValue, watch, register, unregister, setError, clearErrors, formState } = methods;

        // Owned here (not just rendered via a plain DiagnosticsStoreProvider below) so this component
        // can read the store the nested shared editor (rendered through FieldFactory further down)
        // writes into. That editor runs its own useFieldDiagnostics() against the same FIELD_KEY,
        // including any `ls.*` (server-side) rule the leaf carries — reading its result back here is
        // what lets a live `ls.*` failure actually reach this leaf's save gate below, instead of only
        // rendering inside the nested editor with no way for this wrapper (or the parent form) to know.
        const diagnosticsStore = useDiagnosticsStoreState();

        const [completions, setCompletions] = useState<CompletionItem[]>([]);
        const [filteredCompletions, setFilteredCompletions] = useState<CompletionItem[]>([]);
        const prevCompletionFetchText = useRef<string>("");

        // Latest diagnostics for the field, kept so revalidate() can resolve synchronously and so the
        // typing-time debounce and the save-time gate agree on a single source.
        const diagnosticsRef = useRef<Diagnostic[]>([]);
        const onChangeRef = useRef(onChange);
        const onDiagnosticsChangeRef = useRef(onDiagnosticsChange);
        const onValidationStateChangeRef = useRef(onValidationStateChange);
        useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
        useEffect(() => { onDiagnosticsChangeRef.current = onDiagnosticsChange; }, [onDiagnosticsChange]);
        useEffect(() => { onValidationStateChangeRef.current = onValidationStateChange; }, [onValidationStateChange]);

        // Withdraw this field's diagnostics when it goes away. A leaf unmounts as soon as it can no
        // longer reach the generated source — its choice branch was deselected (Move → Delete) or the
        // section was unchecked — and a rule failure about a value that will not be emitted must stop
        // blocking save. This mirrors the server's validation walk, which descends only the enabled
        // branch and skips nodes that cannot contribute.
        useEffect(() => () => {
            onDiagnosticsChangeRef.current?.([]);
            onValidationStateChangeRef.current?.({ isValidating: false });
        }, []);

        const effectiveTargetLineRange = targetLineRange ?? EMPTY_LINE_RANGE;

        // ----- mirror the bound value back to the model tree -----
        const watchedValue = watch(FIELD_KEY);
        useEffect(() => {
            onChangeRef.current(typeof watchedValue === "string" ? watchedValue : String(watchedValue ?? ""));
        }, [watchedValue]);

        // The field descriptor handed to the shared editor. `types` carries the connector-shipped
        // `validations[]`, so it is also what the client rule engine evaluates against below.
        const field: FormField = useMemo(() => ({
            key: FIELD_KEY,
            label: property?.metadata?.label || "",
            type: (property?.types?.find((t) => t.selected)?.fieldType
                ?? property?.types?.[0]?.fieldType
                ?? "EXPRESSION") as string,
            optional: required !== undefined ? !required : (property?.optional ?? false),
            editable: property?.editable !== false,
            enabled: true,
            documentation: property?.metadata?.description || "",
            value: value ?? "",
            placeholder: property?.placeholder,
            diagnostics: [],
            types: property?.types,
            metadata: property?.metadata,
            codedata: property?.codedata as any,
            imports: property?.imports,
        }) as FormField, [property, value, required]);

        // A RECORD_MAP_EXPRESSION field whose sole type member is a RECORD_TYPE (the shape a
        // schema-driven annotation always renders as, whether hand-authored or synthesized) is a
        // "record type field": this is what lets FieldFactory/ExpressionEditor offer the guided
        // record-config editor instead of a bare expression box, the same way FormArrayEditor and
        // FormMapEditorNew do for their own record-typed elements.
        const recordTypeFields = useMemo(() => getRecordTypeFields([field]), [field]);

        // ----- record config modal -----
        // Mirrors FlowNodeForm/ArtifactForm's onOpenRecordConfigPage wiring: ExpressionEditor calls
        // this on focus when the field is in guided RECORD mode and resolves to a record type field
        // (see recordTypeFields above), opening a full field-by-field editor instead of asking the
        // user to hand-type the record literal.
        const [recordConfigPageState, setRecordConfigPageState] = useState<{
            isOpen: boolean;
            currentValue?: string;
            recordTypeField?: RecordTypeField;
            onChangeCallback?: (value: string) => void;
        }>({ isOpen: false });

        const openRecordConfigPage = useCallback((
            _fieldKey: string, currentValue: string, recordTypeField: RecordTypeField,
            onChangeCallback: (value: string) => void,
        ) => {
            setRecordConfigPageState({ isOpen: true, currentValue, recordTypeField, onChangeCallback });
        }, []);

        const closeRecordConfigPage = useCallback(() => {
            setRecordConfigPageState({ isOpen: false });
        }, []);

        // ----- diagnostics -----
        // Three independent producers feed the parent's save gate: compiler diagnostics for the
        // expression (async, below), the connector's `validations[]` common/vscode.* rules
        // (synchronous, re-evaluated here), and any `ls.*` (server-side) rule the leaf carries. The
        // nested shared editor (rendered through FieldFactory further down) evaluates that last one
        // itself via its own useFieldDiagnostics() call and writes the result into `diagnosticsStore`
        // — read back below rather than left unseen, which is what previously let an `ls.*` failure
        // render live in the nested editor while never counting toward this leaf's own save gate.
        const [compilerDiagnostics, setCompilerDiagnostics] = useState<Diagnostic[]>([]);

        const clientDiagnostics: Diagnostic[] = useMemo(() => evaluateClientRules(field, watchedValue)
            .filter((failure) => failure.severity === "ERROR")
            .map((failure) => ({ message: failure.message, severity: 1 } as unknown as Diagnostic)),
            [field, watchedValue]);

        const storeField = diagnosticsStore.getField(FIELD_KEY);
        const serverRuleDiagnostics: Diagnostic[] = useMemo(
            () => storeField.ls
                .filter((d) => d.severity === "ERROR")
                .map((d) => ({ message: d.message, severity: 1 } as unknown as Diagnostic)),
            [storeField]
        );

        // ERROR-only: a compiler warning/info must not read as a blocking failure here. Non-error
        // findings from `ls.*`/client rules are already excluded above at the source; the nested
        // editor renders warnings itself (independent of what this wrapper publishes upward).
        const mergedDiagnostics = useMemo(
            () => [...compilerDiagnostics, ...clientDiagnostics, ...serverRuleDiagnostics]
                .filter((d) => d.severity === 1),
            [compilerDiagnostics, clientDiagnostics, serverRuleDiagnostics]
        );

        // Publish the merged view and mirror it into react-hook-form, so the field reads as invalid
        // and the handler form's Save button stays blocked while any rule fails.
        useEffect(() => {
            diagnosticsRef.current = mergedDiagnostics;
            onDiagnosticsChangeRef.current?.(mergedDiagnostics);
            if (mergedDiagnostics.length === 0) {
                clearErrors(FIELD_KEY);
            } else {
                setError(FIELD_KEY, {
                    type: "validate",
                    message: mergedDiagnostics.map((d) => d.message).join("\n"),
                });
            }
        }, [mergedDiagnostics, clearErrors, setError]);

        const applyDiagnostics = useCallback((diagnostics: Diagnostic[]) => {
            setCompilerDiagnostics(diagnostics);
        }, []);

        const runDiagnostics = useCallback(async (expression: string, property?: ExpressionProperty): Promise<Diagnostic[]> => {
            if (!rpcClient || !filePath) {
                onValidationStateChangeRef.current?.({ isValidating: false });
                return [];
            }
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getExpressionDiagnostics({
                    filePath,
                    context: {
                        expression,
                        startLine: effectiveTargetLineRange.startLine,
                        lineOffset: 0,
                        offset: 0,
                        codedata: undefined,
                        property,
                    } as any,
                });
                const result = removeDuplicateDiagnostics(response.diagnostics || []);
                applyDiagnostics(result);
                return result;
            } catch (error) {
                // Silently ignore LS failures during typing; the save gate re-runs via revalidate().
                console.error(">>> Error getting annotation expression diagnostics", error);
                applyDiagnostics([]);
                return [];
            } finally {
                onValidationStateChangeRef.current?.({ isValidating: false });
            }
        }, [rpcClient, filePath, effectiveTargetLineRange, applyDiagnostics]);

        const debouncedDiagnostics = useMemo(
            () => debounce((showDiagnostics: boolean, expression: string, _key: string, property: ExpressionProperty) => {
                if (!showDiagnostics) {
                    applyDiagnostics([]);
                    onValidationStateChangeRef.current?.({ isValidating: false });
                    return;
                }
                onValidationStateChangeRef.current?.({ isValidating: true });
                void runDiagnostics(expression, property);
            }, 250),
            [runDiagnostics, applyDiagnostics]
        );
        useEffect(() => () => debouncedDiagnostics.cancel(), [debouncedDiagnostics]);

        // ----- completions -----
        const debouncedRetrieveCompletions = useMemo(
            () => debounce(async (expression: string, property: ExpressionProperty, offset: number, triggerCharacter?: string) => {
                if (!rpcClient || !filePath) {
                    setCompletions([]);
                    setFilteredCompletions([]);
                    return;
                }
                try {
                    let expressionCompletions: CompletionItem[] = [];
                    const { parentContent, currentContent } = expression
                        .slice(0, offset)
                        .match(EXPRESSION_EXTRACTION_REGEX)?.groups ?? {};
                    const currentContentLower = (currentContent ?? "").toLowerCase();

                    if (completions.length > 0 && !triggerCharacter && parentContent === prevCompletionFetchText.current) {
                        expressionCompletions = completions
                            .filter((c) => c.label.toLowerCase().includes(currentContentLower))
                            .sort((a, b) => a.sortText.localeCompare(b.sortText));
                    } else {
                        const { lineOffset, charOffset } = calculateExpressionOffsets(expression, offset);
                        const response = await rpcClient.getBIDiagramRpcClient().getExpressionCompletions({
                            filePath,
                            context: {
                                expression,
                                startLine: effectiveTargetLineRange.startLine,
                                lineOffset,
                                offset: charOffset,
                                codedata: undefined,
                                property,
                            },
                            completionContext: {
                                triggerKind: triggerCharacter ? 2 : 1,
                                triggerCharacter: triggerCharacter as TriggerCharacter,
                            },
                        } as any);

                        const converted: CompletionItem[] = [];
                        response?.forEach((completion: any) => {
                            if (completion.detail) {
                                converted.push(convertBalCompletion(completion));
                            }
                        });
                        setCompletions(converted);
                        expressionCompletions = triggerCharacter
                            ? converted
                            : converted
                                .filter((c) => c.label.toLowerCase().includes(currentContentLower))
                                .sort((a, b) => a.sortText.localeCompare(b.sortText));
                    }
                    prevCompletionFetchText.current = parentContent ?? "";
                    setFilteredCompletions(expressionCompletions);
                } catch (error) {
                    console.error(">>> Error getting annotation expression completions", error);
                    setCompletions([]);
                    setFilteredCompletions([]);
                }
            }, 250),
            [rpcClient, completions, filePath, effectiveTargetLineRange]
        );
        useEffect(() => () => debouncedRetrieveCompletions.cancel(), [debouncedRetrieveCompletions]);

        const handleRetrieveCompletions = useCallback(async (
            expression: string, property: ExpressionProperty, offset: number, triggerCharacter?: string
        ) => {
            await debouncedRetrieveCompletions(expression, property, offset, triggerCharacter);
            if (triggerCharacter) {
                await debouncedRetrieveCompletions.flush();
            }
        }, [debouncedRetrieveCompletions]);

        // ----- helper pane -----
        const handleGetHelperPane = useCallback((
            _fieldKey: string,
            _exprRef: any,
            anchorRef: any,
            _placeholder: string,
            currentValue: string,
            onHelperChange: (value: string, options?: any) => void,
            _changeHelperPaneState: (isOpen: boolean) => void,
            helperPaneHeight: any,
        ) => {
            if (!filePath) {
                return null;
            }
            return getHelperPaneNew({
                fieldKey: id ?? FIELD_KEY,
                fileName: filePath,
                targetLineRange: effectiveTargetLineRange,
                anchorRef,
                onClose: () => { },
                defaultValue: "",
                currentValue,
                onChange: onHelperChange,
                helperPaneHeight,
                recordTypeField: undefined,
                updateImports: () => { },
                completions: filteredCompletions,
                filteredCompletions,
                isInModal: true,
                types: property?.types as any,
                handleRetrieveCompletions,
            } as any);
        }, [filePath, id, effectiveTargetLineRange, filteredCompletions, property, handleRetrieveCompletions]);

        // ----- expression editor RPC bundle -----
        const expressionEditor = useMemo(() => ({
            completions: filteredCompletions,
            triggerCharacters: TRIGGER_CHARACTERS,
            retrieveCompletions: handleRetrieveCompletions,
            getExpressionEditorDiagnostics: debouncedDiagnostics,
            getHelperPane: handleGetHelperPane,
            rpcManager: {
                getExpressionTokens: (expression: string, fileName: string, position: any) =>
                    rpcClient.getBIDiagramRpcClient().getExpressionTokens({ expression, filePath: fileName, position }),
            },
            onCompletionItemSelect: () => { },
            onFocus: () => { },
            onBlur: () => { },
            onCancel: () => {
                setCompletions([]);
                setFilteredCompletions([]);
            },
            onOpenRecordConfigPage: openRecordConfigPage,
        }) as unknown as FormExpressionEditorProps, [
            filteredCompletions, handleRetrieveCompletions, debouncedDiagnostics, handleGetHelperPane, rpcClient,
            openRecordConfigPage,
        ]);

        const formContextValue = useMemo(() => ({
            form: {
                control, getValues, setValue, watch, register, unregister, setError, clearErrors,
                formState: { isValidating: formState.isValidating, errors: formState.errors },
            },
            expressionEditor,
            targetLineRange: effectiveTargetLineRange,
            fileName: filePath ?? "",
            popupManager: { addPopup: () => { }, removeLastPopup: () => { }, closePopup: () => { } },
            nodeInfo: { kind: "FUNCTION" as any },
        }), [control, getValues, setValue, watch, register, unregister, setError, clearErrors,
            formState.isValidating, formState.errors, expressionEditor, effectiveTargetLineRange, filePath]);

        // Re-validate on mode switch (FieldFactory calls this) using the value it hands back.
        const handleFormValidation = useCallback(async (formData?: FormValues): Promise<boolean> => {
            const current = (formData?.[FIELD_KEY] ?? getValues(FIELD_KEY) ?? "") as string;
            if (!String(current).trim()) {
                applyDiagnostics([]);
                return true;
            }
            const diagnostics = await runDiagnostics(String(current));
            return !diagnostics.some((d) => d.severity === 1);
        }, [getValues, runDiagnostics, applyDiagnostics]);

        useImperativeHandle(ref, () => ({
            revalidate: async () => {
                debouncedDiagnostics.cancel();
                const current = String(getValues(FIELD_KEY) ?? "");
                // The rule failures are derived synchronously from the current value, so they hold
                // even when the value is empty and no compiler check is worth issuing.
                const ruleFailures = evaluateClientRules(field, current)
                    .filter((failure) => failure.severity === "ERROR")
                    .map((failure) => ({ message: failure.message, severity: 1 } as unknown as Diagnostic));
                // The nested shared editor's own `ls.*` check is debounced independently of this
                // handle; its latest settled result (if any) is already sitting in the shared store,
                // so fold it in rather than reporting this leaf clean while a visible `ls.*` error is
                // still showing underneath it. A check still in flight when save is clicked is the
                // same accepted debounce-timing gap as elsewhere in this form.
                const serverFailures = diagnosticsStore.getField(FIELD_KEY).ls
                    .filter((d) => d.severity === "ERROR")
                    .map((d) => ({ message: d.message, severity: 1 } as unknown as Diagnostic));
                if (!current.trim()) {
                    applyDiagnostics([]);
                    onValidationStateChangeRef.current?.({ isValidating: false });
                    return [...ruleFailures, ...serverFailures];
                }
                return [...(await runDiagnostics(current)), ...ruleFailures, ...serverFailures];
            },
        }), [debouncedDiagnostics, getValues, runDiagnostics, applyDiagnostics, field, diagnosticsStore]);

        return (
            // Provides the store this component itself owns (see diagnosticsStore above) rather than
            // a plain DiagnosticsStoreProvider — the nested editor's live rule failures land in this
            // exact store instance, which is what makes them readable above instead of trapped in an
            // isolated provider only the nested editor can see.
            <DiagnosticsStoreContext.Provider value={diagnosticsStore}>
                <FormContextProvider {...(formContextValue as any)}>
                    <FieldFactory
                        field={field}
                        autoFocus={false}
                        handleFormValidation={handleFormValidation}
                        recordTypeFields={recordTypeFields}
                    />
                </FormContextProvider>
                {recordConfigPageState.isOpen
                    && recordConfigPageState.recordTypeField
                    && recordConfigPageState.onChangeCallback && (
                        <DynamicModal
                            width={800}
                            height={600}
                            anchorRef={undefined}
                            title="Record Configuration"
                            openState={recordConfigPageState.isOpen}
                            setOpenState={(isOpen: boolean) => {
                                if (!isOpen) {
                                    closeRecordConfigPage();
                                }
                            }}
                            closeOnBackdropClick={true}
                            closeButtonIcon="minimize"
                        >
                            <ConfigureRecordPage
                                fileName={filePath ?? ""}
                                targetLineRange={effectiveTargetLineRange}
                                onChange={(recordValue: string) => recordConfigPageState.onChangeCallback!(recordValue)}
                                currentValue={recordConfigPageState.currentValue || ""}
                                recordTypeField={recordConfigPageState.recordTypeField}
                                onClose={closeRecordConfigPage}
                                getHelperPane={handleGetHelperPane}
                                field={field}
                                triggerCharacters={TRIGGER_CHARACTERS}
                                formContext={formContextValue as any}
                            />
                        </DynamicModal>
                    )}
            </DiagnosticsStoreContext.Provider>
        );
    }
);

AnnotationExpressionField.displayName = "AnnotationExpressionField";
