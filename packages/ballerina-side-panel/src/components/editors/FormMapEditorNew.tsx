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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { debounce, isEqual } from "lodash";
import styled from "@emotion/styled";
import { FormDiagnostics, InputType, Property } from "@wso2/ballerina-core";
import { Form, FormValues, S, useFormContext, useModeSwitcherContext, FormField, FormFieldEditorProps } from "../..";
import { ErrorBanner, RequiredFormInput } from "@wso2/ui-toolkit";
import { Codicon } from "@wso2/ui-toolkit/lib/components/Codicon/Codicon";
import { ScrollableList, ScrollableListRef } from "@wso2/ui-toolkit/lib/components/ScrollableList/ScrollableList";
import ModeSwitcher from "../ModeSwitcher";
import { getMapEntryValues, getMapSubFormFieldFromTypes, normalizeDiagnostics, getRepeatableErrorMessages, buildStringMap, stringToRawObjectEntries, getRecordTypeFields, mapDiagnosticsServerityToFormSeverity, getPropertyFromFormField } from "./utils";
import { InputMode } from "./MultiModeExpressionEditor/ChipExpressionEditor/types";
import { getInputModeFromTypes } from "./MultiModeExpressionEditor/ChipExpressionEditor/utils";

export const FormMapEditorNew = (props: FormFieldEditorProps & {
    onChange: (value: any) => void;
    value: any;
    error?: string;
}) => {
    const [repeatableFields, setRepeatableFields] = useState<FormField[][]>([]);
    const [fieldDiagnostics, setFieldDiagnostics] = useState(props.field.diagnostics);

    useEffect(() => {
        const serverValue = props.field.value;
        const currentValue = props.value;
        const valuesMatch = serverValue && typeof serverValue === "object" && !Array.isArray(serverValue)
            && currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
            ? isEqual(getMapEntryValues(serverValue), getMapEntryValues(currentValue))
            : serverValue === currentValue;
        if (!valuesMatch) return;
        setFieldDiagnostics(props.field.diagnostics);
    }, [props.field.diagnostics, props.field.value, props.value]);

    const scrollableListRef = useRef<ScrollableListRef>(null);
    const handleFormValidationRef = useRef(props.handleFormValidation);
    handleFormValidationRef.current = props.handleFormValidation;

    const validateFieldDebounced = useMemo(
        () => debounce(() => handleFormValidationRef.current?.(undefined, true), 500),
        []
    );

    useEffect(() => () => validateFieldDebounced.cancel(), [validateFieldDebounced]);
    const { expressionEditor } = useFormContext();

    const modeSwitcherContext = useModeSwitcherContext();

    const WarningBanner = styled.div`
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        font-size: 11px;
        color: var(--vscode-editorWarning-foreground, #cca700);
        background: var(--vscode-inputValidation-warningBackground);
        margin-top: 6px;
        margin-bottom: 6px;
        margin-left: 6px;
        margin-right: 6px;
        box-sizing: border-box;
        border-radius: 3px;
    `;

    const dedupeFields = (fields: FormField[][]) => {
        const seen = new Set<string>();
        const result: FormField[][] = [];
        fields.forEach((f) => {
            const keyVal = f[0].value as string;
            if (!keyVal) {
                result.push(f);
                return;
            }
            if (!seen.has(keyVal)) {
                seen.add(keyVal);
                result.push(f);
            }
        });
        return result;
    };

    const processToOutputFormat = (fields: FormField[][]): Record<string, unknown> => {
        const output: Record<string, unknown> = {};
        fields.forEach((field) => {
            const keyField = field[0];
            const valueField = field[1];
            if (keyField.value) {
                output[keyField.value as string] = valueField;
            }
        });
        return output;
    }

    /**
     * Emits the entries of the map, or clears the value when the map has no entries left.
     */
    const emitChange = (fields: FormField[][]) => {
        const output = processToOutputFormat(fields);
        props.onChange(Object.keys(output).length > 0 ? output : "");
    }

    const processToInputFormat = (input: Record<string, unknown>): FormField[][] => {
        const fields: FormField[][] = [];
        Object.entries(input).forEach(([key, value]) => {
            const keyId = (value as FormField)?.key?.replace("mp-val-", "mp-key-") || crypto.randomUUID();
            const keyField: FormField = {
                key: keyId,
                label: "Key",
                type: "IDENTIFIER",
                optional: false,
                editable: true,
                documentation: "",
                value: key,
                types: [{ fieldType: "IDENTIFIER", selected: true }],
                enabled: true
            };
            const valueField: FormField = value as FormField;
            fields.push([keyField, valueField]);
        });
        return fields;
    }

    const makeDiagnosticsKey = (diagnostics?: any[]) => {
        if (!Array.isArray(diagnostics) || diagnostics.length === 0) return "";
        return diagnostics.map(d => `${d.message}|${d.severity}`).join("||");
    };

    const handleSetDiagnosticsInfoChange = (diagnostics: FormDiagnostics) => {
        setRepeatableFields(prev => prev.map(fieldPair => {
            const valueField = fieldPair[1];
            if (valueField.key !== diagnostics.key) return fieldPair;
            return [
                fieldPair[0],
                {
                    ...valueField,
                    diagnostics: diagnostics.diagnostics.map(diag => ({
                        message: diag.message,
                        severity: mapDiagnosticsServerityToFormSeverity(diag.severity)
                    }))
                }
            ];
        }));
    };

    const handleFormDiagnosticsChange = async (showDiagnostics: boolean, expression: string, key: string, property: Property, setDiagnosticsInfo: (diagnostics: FormDiagnostics) => void, shouldUpdateNode?: boolean, variableType?: string) => {
        return expressionEditor?.getExpressionFormDiagnostics?.(
            showDiagnostics,
            expression,
            key,
            property,
            (diagnostics: FormDiagnostics) => {
                handleSetDiagnosticsInfoChange(diagnostics);
                setDiagnosticsInfo(diagnostics);
            },
            shouldUpdateNode,
            variableType
        );
    };

    const handleElementFormValidation = async (data: FormValues, _dirtyFields?: any): Promise<boolean> => {
        const valueFieldKey = Object.keys(data).find(k => k.startsWith('mp-val-'));
        if (!valueFieldKey) return true;
        const value = data[valueFieldKey];
        const valueField = repeatableFields.flat().find(field => field.key === valueFieldKey);
        if (!valueField) return true;
        handleFormDiagnosticsChange(true, value, valueFieldKey, getPropertyFromFormField(valueField), () => { }, false, (props.field.types[0] as any).name);
        return true;
    };

    const handleAddNewItem = () => {
        setFieldDiagnostics([]);
        const key = crypto.randomUUID();
        if (!(props.field.types[0] as any).template) return;
        const newField = getMapSubFormFieldFromTypes(key, (props.field.types[0] as any).template.types as InputType[])
        const newRepeatableFields = [...repeatableFields, newField];
        setRepeatableFields(newRepeatableFields);
        emitChange(newRepeatableFields);
        validateFieldDebounced.cancel();
        // Wait for the dom update
        setTimeout(() => {
            scrollableListRef.current?.scrollToBottom();
        }, 100);
    }

    const handleFormOnChange = (fieldKey: string, value: any, _allValues: FormValues, _parentKey: string) => {
        setFieldDiagnostics([]);
        const newRepeatableFields = repeatableFields.map((formFields) => {
            // Check if any field in this array matches the fieldKey
            const fieldIndex = formFields.findIndex(field => field.key === fieldKey);
            if (fieldIndex !== -1) {
                const newFields = [...formFields];
                newFields[fieldIndex] = { ...newFields[fieldIndex], value };
                return newFields;
            }
            return formFields;
        });
        setRepeatableFields(newRepeatableFields);
        emitChange(newRepeatableFields);
        if (fieldKey.startsWith("mp-key-")) {
            validateFieldDebounced();
        }
    }

    const handleModeSwitchValueChange = () => {
        const deduped = dedupeFields(repeatableFields);
        if (deduped.length !== repeatableFields.length) {
            setRepeatableFields(deduped);
        }
        const stringValue = buildStringMap(deduped);
        props.onChange(stringValue);
    }

    const handleDeleteItem = (keyToDelete: string) => {
        setFieldDiagnostics([]);
        const newRepeatableFields = repeatableFields.filter((formField) => formField[0].key !== keyToDelete);
        setRepeatableFields(newRepeatableFields);
        emitChange(newRepeatableFields);
        validateFieldDebounced.cancel();
        props.handleFormValidation?.(undefined, true);
    };

    useEffect(() => {
        if (!props.value) return;
        if (typeof props.value !== 'string' &&
            isEqual(getMapEntryValues(props.value), getMapEntryValues(processToOutputFormat(repeatableFields)))) {
            return;
        }
        let processedInputValue: string | FormField[][] = "";
        if (typeof props.value === 'string') {
            processedInputValue = props.value;
        } else {
            processedInputValue = processToInputFormat(props.value);
        }
        // Build diagnostics lookup from props.field.value (populated by setDiagnosticsToFields)
        const diagnosticsMap: Record<string, any[]> = {};
        if (props.field.value && typeof props.field.value === 'object' && !Array.isArray(props.field.value)) {
            Object.entries(props.field.value as Record<string, any>).forEach(([entryKey, entryVal]) => {
                if (entryVal?.diagnostics) {
                    diagnosticsMap[entryKey] = normalizeDiagnostics(entryVal.diagnostics);
                }
            });
        }
        let newValue = buildStringMap(processedInputValue);
        const initialValues = stringToRawObjectEntries(newValue);
        const initialFields = initialValues.map((val) => {
            const key = crypto.randomUUID();
            const fields = getMapSubFormFieldFromTypes(key, (props.field.types[0] as any).template.types as InputType[]);
            fields[0].value = val.key;
            fields[1].value = val.value;
            if (diagnosticsMap[val.key]) {
                fields[1].diagnostics = diagnosticsMap[val.key];
            }
            return fields;
        });
        setRepeatableFields(initialFields);
    }, [props.value, props.field.types]);

    // When the server responds with updated diagnostics (e.g. after flowDesignService/diagnostics),
    // props.field.value is updated asynchronously after the MAP editor has already rendered.
    // This effect applies the new per-entry diagnostics to existing repeatableFields without
    // recreating the whole list (which would discard in-progress edits).
    useEffect(() => {
        if (!props.field.value || typeof props.field.value !== 'object' || Array.isArray(props.field.value)) return;

        const diagnosticsMap: Record<string, any[]> = {};
        const valuesMap: Record<string, string> = {};
        Object.entries(props.field.value as Record<string, any>).forEach(([entryKey, entryVal]) => {
            if (entryVal?.diagnostics) {
                diagnosticsMap[entryKey] = normalizeDiagnostics(entryVal.diagnostics);
                valuesMap[entryKey] = String(entryVal?.value ?? "");
            }
        });

        setRepeatableFields(prev => {
            if (prev.length === 0) return prev;
            return prev.map(fieldPair => {
                const keyVal = fieldPair[0].value as string;
                if (!keyVal || diagnosticsMap[keyVal] === undefined) return fieldPair;
                if (String(fieldPair[1].value ?? "") !== valuesMap[keyVal]) return fieldPair;
                return [
                    fieldPair[0],
                    { ...fieldPair[1], diagnostics: diagnosticsMap[keyVal] }
                ];
            });
        });
    }, [props.field.value]);

    const duplicateEntryKeys = new Set<string>();
    const seenKeyValues = new Set<string>();
    repeatableFields.forEach((formField) => {
        const keyVal = formField[0].value as string;
        if (keyVal) {
            if (seenKeyValues.has(keyVal)) {
                duplicateEntryKeys.add(formField[0].key);
            } else {
                seenKeyValues.add(keyVal);
            }
        }
    });

    const errorMessages = getRepeatableErrorMessages(fieldDiagnostics, props.error);

    return (
        <S.Container>
            <S.Header>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px' }}>
                    <div>
                        <S.HeaderContainer>
                            <S.LabelContainer>
                                <S.Label>{props.field.label}</S.Label>
                                {!props.field.optional && <RequiredFormInput />}
                            </S.LabelContainer>
                        </S.HeaderContainer>
                        <S.EditorMdContainer>
                            <S.Description>{props.field.documentation}</S.Description>
                        </S.EditorMdContainer>
                    </div>
                    {modeSwitcherContext?.isModeSwitcherEnabled && (
                        <S.FieldInfoSection>
                            <ModeSwitcher
                                fieldKey={props.field.key}
                                value={modeSwitcherContext.inputMode}
                                isRecordTypeField={modeSwitcherContext.isRecordTypeField}
                                onChange={(value) => {
                                    handleModeSwitchValueChange();
                                    modeSwitcherContext.onModeChange(value);
                                }}
                                types={modeSwitcherContext.types}
                            />
                        </S.FieldInfoSection>
                    )}
                </div>
            </S.Header>
            <ScrollableList
                ref={scrollableListRef}
                itemCount={repeatableFields.length}
                maxVisibleItems={2}
            >
                {repeatableFields.map((formField) => {
                        const keyVal = formField[0].value as string;
                        const isDuplicate = duplicateEntryKeys.has(formField[0].key);
                        return (
                            <S.ItemContainer
                                style={{
                                    padding: '1px',
                                    position: 'relative',
                                    marginBottom: '4px',
                                    ...(isDuplicate && {
                                        border: '1px solid var(--vscode-errorForeground, #f44747)'
                                    })
                                }}
                                key={formField[0].key}
                            >
                                <div style={{ position: 'absolute', top: '4px', right: '5px', zIndex: 1 }}>
                                    <Codicon
                                        name="close"
                                        sx={{ cursor: 'pointer', opacity: 0.6, '&:hover': { opacity: 1 } }}
                                        onClick={() => handleDeleteItem(formField[0].key)}
                                    />
                                </div>
                                <Form
                                    key={formField[0].key}
                                    formFields={formField}
                                    recordTypeFields={getRecordTypeFields(formField)}
                                    openRecordEditor={props.openRecordEditor}
                                    onChange={(fieldKey: string, value: any, allValues: FormValues) => {
                                        handleFormOnChange(fieldKey, value, allValues, formField[0].key);
                                    }}
                                    onFormValidation={handleElementFormValidation}
                                    expressionEditor={{
                                        ...expressionEditor,
                                        onCompletionItemSelect: expressionEditor?.onCompletionItemSelect,
                                        getHelperPane: expressionEditor?.getHelperPane,
                                        types: expressionEditor?.types,
                                        referenceTypes: expressionEditor?.referenceTypes,
                                        retrieveVisibleTypes: expressionEditor?.retrieveVisibleTypes,
                                        getTypeHelper: expressionEditor?.getTypeHelper,
                                        helperPaneHeight: expressionEditor?.helperPaneHeight,
                                        getExpressionFormDiagnostics: handleFormDiagnosticsChange,
                                    }}
                                    submitText={'Save'}
                                    nestedForm={true}
                                    preserveOrder={true}
                                />
                                {isDuplicate && (
                                    <WarningBanner>
                                        <Codicon name="warning" sx={{ fontSize: '11px', flexShrink: 0 }} />
                                        <span>Duplicate key &quot;{keyVal}&quot; — this entry will be ignored</span>
                                    </WarningBanner>
                                )}
                            </S.ItemContainer>
                        );
                    })}
            </ScrollableList>
            {errorMessages.length > 0 && <ErrorBanner errorMsg={errorMessages.join("\n")} />}
            <S.AddNewButton
                onClick={handleAddNewItem}
                appearance="icon"
            >
                <Codicon name="add" sx={{ marginRight: "5px" }} />
                {repeatableFields.length === 0 ? "Initialize Map" : "Add New Item"}
            </S.AddNewButton>
        </S.Container>
    )
};
