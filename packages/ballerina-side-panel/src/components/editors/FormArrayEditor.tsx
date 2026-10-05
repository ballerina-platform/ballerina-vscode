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

import React, { useEffect, useRef, useState } from "react";
import { isEqual } from "lodash";
import { FormDiagnostics, InputType, Property } from "@wso2/ballerina-core";
import { Form, FormField, FormFieldEditorProps, FormValues, S, useFormContext, useModeSwitcherContext } from "../..";
import { ErrorBanner, RequiredFormInput } from "@wso2/ui-toolkit";
import { Codicon } from "@wso2/ui-toolkit/lib/components/Codicon/Codicon";
import { ScrollableList, ScrollableListRef } from "@wso2/ui-toolkit/lib/components/ScrollableList/ScrollableList";
import ModeSwitcher from "../ModeSwitcher";
import { getArrayElementValues, getArraySubFormFieldFromTypes, normalizeDiagnostics, getRepeatableErrorMessages, stringToRawArrayElements, buildStringArray, getRecordTypeFields, mapDiagnosticsServerityToFormSeverity, getPropertyFromFormField } from "./utils";
import { InputMode } from "./MultiModeExpressionEditor/ChipExpressionEditor/types";
import { getInputModeFromTypes } from "./MultiModeExpressionEditor/ChipExpressionEditor/utils";

export const FormArrayEditor = (props: FormFieldEditorProps & {
    onChange: (value: any) => void;
    value: any;
    error?: string;
}) => {
    const [repeatableFields, setRepeatableFields] = useState<FormField[]>([]);
    const [fieldDiagnostics, setFieldDiagnostics] = useState(props.field.diagnostics);

    useEffect(() => {
        const serverValue = props.field.value;
        const currentValue = props.value;
        const valuesMatch = Array.isArray(serverValue) && Array.isArray(currentValue)
            ? isEqual(getArrayElementValues(serverValue), getArrayElementValues(currentValue))
            : serverValue === currentValue;
        if (!valuesMatch) return;
        setFieldDiagnostics(props.field.diagnostics);
    }, [props.field.diagnostics, props.field.value, props.value]);

    const { expressionEditor } = useFormContext();
    const elementDiagnosticsRef = useRef<FormDiagnostics[]>([]);
    const prevDiagnosticsRef = useRef<Record<string, string>>({});
    const scrollableListRef = useRef<ScrollableListRef>(null);

    const modeSwitcherContext = useModeSwitcherContext();

    const handleAddNewItem = () => {
        setFieldDiagnostics([]);
        const key = crypto.randomUUID();
        if (!(props.field.types[0] as any).template) return;
        const newField = getArraySubFormFieldFromTypes(key, (props.field.types[0] as any).template.types as InputType[])
        const newRepeatableFields = [...repeatableFields, newField];
        setRepeatableFields(newRepeatableFields);
        props.onChange(newRepeatableFields);
        props.handleFormValidation?.(undefined, true);
        // Wait for the dom update
        setTimeout(() => {
            scrollableListRef.current?.scrollToBottom();
        }, 100);
    }

    const handleFormOnChange = (_fieldKey: string, value: any, _allValues: FormValues, parentKey: string) => {
        setFieldDiagnostics([]);
        const newRepeatableFields = repeatableFields.map((formField) => {
            if (formField.key === parentKey) {
                return { ...formField, value };
            }
            return formField;
        });
        setRepeatableFields(newRepeatableFields);
        props.onChange(newRepeatableFields);
    }

    const handleModeSwitchValueChange = () => {
        const stringValue = buildStringArray(repeatableFields);
        props.onChange(stringValue);
    }

    const handleDeleteItem = (keyToDelete: string) => {
        setFieldDiagnostics([]);
        const newRepeatableFields = repeatableFields.filter((formField) => formField.key !== keyToDelete);
        setRepeatableFields(newRepeatableFields);
        props.onChange(newRepeatableFields.length > 0 ? newRepeatableFields : "");
        props.handleFormValidation?.(undefined, true);
    };

    const handleSetDiagnosticsInfoChange = (diagnostics: FormDiagnostics) => {
        const existingDiagnostics = elementDiagnosticsRef.current.filter(d => d.key !== diagnostics.key);
        elementDiagnosticsRef.current = [...existingDiagnostics, diagnostics];
        setRepeatableFields(prev => prev.map(field => {
            if (field.key !== diagnostics.key) return field;
            return {
                ...field,
                diagnostics: diagnostics.diagnostics.map(diag => ({
                    message: diag.message,
                    severity: mapDiagnosticsServerityToFormSeverity(diag.severity)
                }))
            };
        }));
    }

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
            variableType);
    };

    const handleElementFormValidation = async (data: FormValues, dirtyFields?: any): Promise<boolean> => {
        const key = Object.keys(data)[0];
        if (!key) return true;
        const value = data[key];
        const valueField = repeatableFields.find(field => field.key === key);
        if (!valueField) return true;
        await handleFormDiagnosticsChange(true, value, key, getPropertyFromFormField(valueField), () => { }, false, (props.field.types[0] as any).name);

        return true;
    }

    const applyDiagnosticsToField = (field: FormField): FormField => {
        const diagnostics = elementDiagnosticsRef.current.find(diag => diag.key === field.key);
        if (!diagnostics) return field;
        return {
            ...field,
            diagnostics: diagnostics.diagnostics.map(diag => ({
                message: diag.message,
                severity: mapDiagnosticsServerityToFormSeverity(diag.severity)
            }))
        };
    };

    const makeDiagnosticsKey = (diagnostics?: any[]) => {
        if (!Array.isArray(diagnostics) || diagnostics.length === 0) return "";
        return diagnostics.map(d => `${d.message}|${d.severity}`).join("||");
    }

    useEffect(() => {
        if (!Array.isArray(props.value)) return;
        const newRepeatableFields = repeatableFields.map(applyDiagnosticsToField);
        let changed = false;
        newRepeatableFields.forEach(field => {
            const key = field.key;
            const diagKey = makeDiagnosticsKey(field.diagnostics as any[]);
            if (prevDiagnosticsRef.current[key] !== diagKey) {
                changed = true;
            }
        });
        if (!changed) return;
        // update prevDiagnosticsRef and state only when diagnostics actually changed
        prevDiagnosticsRef.current = newRepeatableFields.reduce((acc: Record<string, string>, f) => {
            acc[f.key] = makeDiagnosticsKey(f.diagnostics as any[]);
            return acc;
        }, {});
        setRepeatableFields(newRepeatableFields);
        props.onChange(newRepeatableFields);
    }, [props.value]);

    /**
     * Loads the element diagnostics the language server returns with refreshed fields onto the existing elements.
     * The server checked the same values the elements hold, so its result replaces each element's diagnostics,
     * including clearing them when it reports none. The elements are kept as they are, so a refresh does not
     * remount them.
     */
    useEffect(() => {
        if (!Array.isArray(props.field.value) || props.field.value.length === 0) return;
        if (props.field.value.length !== repeatableFields.length) return;
        if (!isEqual(getArrayElementValues(props.field.value), getArrayElementValues(repeatableFields))) return;
        const serverDiagnostics: FormDiagnostics[] = repeatableFields.map((field, index) => ({
            key: field.key,
            diagnostics: normalizeDiagnostics((props.field.value as any[])[index]?.diagnostics)
        }));
        const serverKeys = new Set(serverDiagnostics.map(diag => diag.key));
        elementDiagnosticsRef.current = [
            ...elementDiagnosticsRef.current.filter(diag => !serverKeys.has(diag.key)),
            ...serverDiagnostics
        ];
        const applied = repeatableFields.map(applyDiagnosticsToField);
        prevDiagnosticsRef.current = applied.reduce((acc: Record<string, string>, f) => {
            acc[f.key] = makeDiagnosticsKey(f.diagnostics as any[]);
            return acc;
        }, {});
        setRepeatableFields(applied);
    }, [props.field.value]);

    useEffect(() => {
        if (!props.value) return;
        if (Array.isArray(props.value) &&
            isEqual(getArrayElementValues(props.value), getArrayElementValues(repeatableFields))) {
            return;
        }
        const keyArray: string[] = [];
        if (Array.isArray(props.value)) {
            const initialDioagnostics: FormDiagnostics[] = props.value.map((val: any) => {
                const key = crypto.randomUUID();
                keyArray.push(key);
                return {
                    key: `ar-elm-${key}`,
                    diagnostics: normalizeDiagnostics(val?.diagnostics).map((diag: any) => ({
                        message: diag.message,
                        severity: mapDiagnosticsServerityToFormSeverity(diag.severity),
                    })) as any[]
                }
            });
            elementDiagnosticsRef.current = initialDioagnostics;
        }
        // An array holds the elements already, so the values are read from it directly. Building a string out of it
        // and splitting it back apart loses an element that contains a comma, such as a string template.
        const initialValues: string[] = Array.isArray(props.value)
            ? getArrayElementValues(props.value)
            : stringToRawArrayElements(buildStringArray(props.value));
        if (!Array.isArray(props.value)) {
            initialValues.forEach((val: any, index: number) => {
                const key = crypto.randomUUID();
                keyArray.push(key);
            })
        }
        if (keyArray.length !== initialValues.length) {
            // The keys are only used to identify the elements of the editor. Hence, they are adjusted to the values
            // instead of failing the render of the form.
            console.warn(`FormArrayEditor: ${keyArray.length} keys for ${initialValues.length} values`);
            while (keyArray.length < initialValues.length) {
                keyArray.push(crypto.randomUUID());
            }
            keyArray.length = initialValues.length;
        }
        const initialFields = initialValues.map((val, index) => {
            const key = keyArray[index];
            return {
                ...getArraySubFormFieldFromTypes(key, (props.field.types[0] as any).template.types as InputType[]),
                value: val
            }
        });
        const applied = initialFields.map(applyDiagnosticsToField);
        setRepeatableFields(applied);
        // initialize prevDiagnosticsRef so subsequent diagnostic-only updates are detected correctly
        prevDiagnosticsRef.current = applied.reduce((acc: Record<string, string>, f) => {
            acc[f.key] = makeDiagnosticsKey(f.diagnostics as any[]);
            return acc;
        }, {});

    }, [props.value, props.field.types]);

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
                maxVisibleItems={3}
            >
                {
                    repeatableFields.map((formField) => (
                        <S.ItemContainer style={{ position: 'relative', marginBottom: '4px' }} key={formField.key}>
                            <div style={{ position: 'absolute', top: '2px', right: '5px', zIndex: 1 }}>
                                <Codicon
                                    name="close"
                                    sx={{ cursor: 'pointer', opacity: 0.6, '&:hover': { opacity: 1 } }}
                                    onClick={() => handleDeleteItem(formField.key)}
                                />
                            </div>
                            <Form
                                key={formField.key}
                                formFields={[formField]}

                                recordTypeFields={getRecordTypeFields([formField])}
                                openRecordEditor={props.openRecordEditor}
                                onChange={(fieldKey: string, value: any, allValues: FormValues) => {
                                    handleFormOnChange(fieldKey, value, allValues, formField.key);
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
                        </S.ItemContainer>

                    ))}
            </ScrollableList>
            {errorMessages.length > 0 && <ErrorBanner errorMsg={errorMessages.join("\n")} />}
            <S.AddNewButton
                onClick={handleAddNewItem}
                appearance="icon"
            >
                <Codicon name="add" sx={{ marginRight: "5px" }} />
                {repeatableFields.length === 0 ? "Initialize Array" : "Add New Item"}
            </S.AddNewButton>
        </S.Container>
    )
};
