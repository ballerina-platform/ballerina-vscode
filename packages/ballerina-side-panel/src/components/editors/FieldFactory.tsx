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

import React, { useRef } from "react";
import { useEffect, useState, useMemo, useCallback } from "react";
import styled from '@emotion/styled';
import { EditorFactory, FormField, InputMode, useFormContext, Provider as FormContextProvider, FormValues } from "../..";
import { Imports, InputType, ExpressionProperty, getPrimaryInputType, carryTextArrayValue } from "@wso2/ballerina-core";
import { NodeKind, NodeProperties, RecordTypeField, SubPanel, SubPanelView } from "@wso2/ballerina-core";
import { CompletionItem } from "@wso2/ui-toolkit";
import { getInputModeFromTypes } from "./MultiModeExpressionEditor/ChipExpressionEditor/utils";
import { ModeSwitcherProvider } from "./ModeSwitcherContext";
import { getEditorConfiguration } from "./ExpressionField";
import { toExpressionText } from "./utils";

/**
 * The element modes a list or map mode builds its entries with. The editors flip each mode's `selected` flag as the
 * user switches, so that is left out: two templates match when they offer an element the same modes.
 */
const getTemplateSignature = (type?: InputType): string =>
    JSON.stringify((type as { template?: { types?: unknown } })?.template?.types ?? null,
        (key, value) => (key === "selected" ? undefined : value));

const Container = styled.div`
    width: 100%;
`;

type FieldFactoryProps = {
    field: FormField;
    selectedNode?: NodeKind;
    openRecordEditor?: (open: boolean, newType?: string | NodeProperties) => void;
    openSubPanel?: (subPanel: SubPanel) => void;
    subPanelView?: SubPanelView;
    handleOnFieldFocus?: (key: string) => void;
    onBlur?: () => void | Promise<void>;
    autoFocus?: boolean;
    handleOnTypeChange?: () => void;
    recordTypeFields?: RecordTypeField[];
    onIdentifierEditingStateChange?: (isEditing: boolean) => void;
    setSubComponentEnabled?: (isAdding: boolean) => void;
    handleNewTypeSelected?: (type: string | CompletionItem) => void;
    scopeFieldAddon?: React.ReactNode;
    isContextTypeEditorSupported?: boolean;
    handleFormValidation?: (formData?: FormValues, forceValidation?: boolean) => Promise<boolean>;
    openFormTypeEditor?: (open: boolean, newType?: string) => void;
    updateImports?: (key: string, imports: Imports) => void;
}


export const FieldFactory = (props: FieldFactoryProps) => {
    const [renderingEditors, setRenderingEditors] = useState<InputType[]>(null);
    const [inputMode, setInputMode] = useState<InputMode>(InputMode.EXP);
    const currentFieldKeyRef = useRef<string | null>(null);
    const currentInputModeRef = useRef<InputMode>(InputMode.EXP);
    const previousTypesRef = useRef<InputType[] | undefined>(undefined);

    const formContext = useFormContext();
    const { expressionEditor } = formContext;

    const form = formContext?.form;

    const updatePropertyForCurrentMode = useCallback(
        (property: ExpressionProperty, expression?: string): ExpressionProperty => {
            const newTypes = property.types.map(type => ({
                ...type,
                selected: getInputModeFromTypes(type) === inputMode
            }));
            return { ...property, types: newTypes, ...(expression !== undefined && { value: expression }) };
        },
        [inputMode]
    );

    const updatedGetExpressionEditorDiagnostics = useCallback(
        async (
            showDiagnostics: boolean,
            expression: string,
            key: string,
            property: ExpressionProperty
        ): Promise<void> => {
            const updatedProperty = updatePropertyForCurrentMode(property, expression);
            expressionEditor?.getExpressionEditorDiagnostics?.(
                showDiagnostics,
                expression,
                key,
                updatedProperty
            )
        },
        [expressionEditor, updatePropertyForCurrentMode]
    );

    const updatedRetrieveCompletions = useCallback(
        async (
            value: string,
            property: ExpressionProperty,
            offset: number,
            triggerCharacter?: string
        ): Promise<void> => {
            const updatedProperty = updatePropertyForCurrentMode(property, value);
            return expressionEditor?.retrieveCompletions?.(
                value,
                updatedProperty,
                offset,
                triggerCharacter
            );
        },
        [expressionEditor, updatePropertyForCurrentMode]
    );

    const updatedExtractArgsFromFunction = useCallback(
        async (
            value: string,
            property: ExpressionProperty,
            cursorPosition: number
        ) => {
            const updatedProperty = updatePropertyForCurrentMode(property, value);
            return expressionEditor?.extractArgsFromFunction?.(
                value,
                updatedProperty,
                cursorPosition
            );
        },
        [expressionEditor, updatePropertyForCurrentMode]
    );

    const updatedExpressionEditor = useMemo(() => {
        if (!expressionEditor) {
            return undefined;
        }
        return {
            ...expressionEditor,
            getExpressionEditorDiagnostics: updatedGetExpressionEditorDiagnostics,
            ...(expressionEditor.retrieveCompletions && { retrieveCompletions: updatedRetrieveCompletions }),
            ...(expressionEditor.extractArgsFromFunction && { extractArgsFromFunction: updatedExtractArgsFromFunction })
        } as typeof expressionEditor;
    }, [expressionEditor, updatedGetExpressionEditorDiagnostics, updatedRetrieveCompletions, updatedExtractArgsFromFunction]);

    const updatedFormContext = useMemo(() => ({
        ...formContext,
        expressionEditor: updatedExpressionEditor
    }), [formContext, updatedExpressionEditor]);

    const getInitialSelectedInputType = (): InputType => {
        if (!props.field.types || props.field.types.length === 0) {
            throw new Error("Field types are not defined");
        }
        const selectedType = props.field.types.find(type => type.selected);
        if (selectedType) {
            return selectedType;
        }
        if (!props.field.value) {
            return props.field.types[0];
        }
        // With no mode chosen, a valued field falls to the last mode — the expression one. That is
        // right for a reference, a call or a list, but not for a plain string read back from
        // source: it opened as an expression and showed its own quotes. So when the field leads
        // with a text mode and the value is a string literal that mode can edit, start there —
        // text mode renders it unquoted. Every other shape still lands on the expression mode.
        const primaryType = props.field.types[0];
        if (primaryType?.fieldType === "TEXT" && typeof props.field.value === "string"
            && getEditorConfiguration(InputMode.TEXT).getIsValueCompatible(props.field.value)) {
            return primaryType;
        }
        return props.field.types[props.field.types.length - 1];
    }

    const checkAndReturnCompatibleInputMode = (selectedInputType: InputType): InputMode => {
        if (
            (getPrimaryInputType(props.field.types)?.fieldType !== "REPEATABLE_MAP") &&
            (getPrimaryInputType(props.field.types)?.fieldType !== "REPEATABLE_LIST")
        ) return getInputModeFromTypes(selectedInputType);
        if (getInputModeFromTypes(selectedInputType) !== InputMode.EXP) return getInputModeFromTypes(selectedInputType);
        if (!props.field.value || typeof props.field.value === "string") return getInputModeFromTypes(selectedInputType);
        return getInputModeFromTypes(getPrimaryInputType(props.field.types));
    }

    /**
     * The mode to open a value in once a type change drops the mode it was in. The new type's own mode is
     * used only when it can edit the value: `string \`hello\`` from the text mode cannot be a number, and
     * the number editor's digits-only filter would reject every edit of it. Such a value opens as an expression.
     */
    const getModeForHeldValue = (selectedInputType: InputType, heldValue: unknown): InputMode => {
        const mode = checkAndReturnCompatibleInputMode(selectedInputType) || InputMode.EXP;
        if (typeof heldValue === "string" && heldValue.trim() !== ""
            && !getEditorConfiguration(mode).getIsValueCompatible(heldValue)) {
            return getInputModeFromTypes(props.field.types[props.field.types.length - 1]) ?? InputMode.EXP;
        }
        return mode;
    }

    /**
     * The expression text of the value the current mode holds. A list of text is written as a list of string
     * literals, as a manual switch to the expression mode writes it (`["hello"]` is `"hello"`, not `hello`).
     */
    const getHeldValueText = (heldValue: unknown): unknown => {
        if (currentInputModeRef.current === InputMode.TEXT_ARRAY) {
            return carryTextArrayValue(false, heldValue) ?? heldValue;
        }
        return toExpressionText(heldValue);
    }

    const notifyModeChange = useCallback((mode: InputMode) => {
        currentInputModeRef.current = mode;
        setInputMode(mode);
    }, [props.field.key]);

    const updateFieldTypesSelection = (targetMode: InputMode) => {
        props.field.types?.forEach(type => {
            if (type.fieldType !== "GROUP_SECTION") {
                type.selected = getInputModeFromTypes(type) === targetMode;
            }
        });
    };

    useEffect(() => {
        if (!props.field.types || props.field.types.length === 0) {
            throw new Error("Field types are not defined");
        }

        const newRenderingTypes = props.field.types.length === 1
            ? [props.field.types[0]]
            : [props.field.types[0], props.field.types[props.field.types.length - 1]];
        setRenderingEditors(newRenderingTypes);

        const isNewField = currentFieldKeyRef.current !== props.field.key;
        currentFieldKeyRef.current = props.field.key;

        const selectedInputType = getInitialSelectedInputType();
        let initialInputMode: InputMode;
        if (isNewField) {
            initialInputMode = checkAndReturnCompatibleInputMode(selectedInputType) || InputMode.EXP;
            notifyModeChange(initialInputMode);
        } else {
            // Preserve the user's current mode selection when the same field is updated,
            // but reset if the current mode is no longer available in the new types.
            const currentType = newRenderingTypes.find(t => getInputModeFromTypes(t) === currentInputModeRef.current);
            const previousType = previousTypesRef.current?.find(t => getInputModeFromTypes(t) === currentInputModeRef.current);
            const heldValue = form?.getValues(props.field.key);
            const isStructuredValue = heldValue !== null && typeof heldValue === "object";
            if (!currentType) {
                // A list or map value belongs to the mode that built it: another structured mode would read it as
                // its own (a list as a map's entries { 0: ..., 1: ... }). So once a type change drops that mode,
                // the value is kept as its expression text, as a manual switch to the expression mode keeps it.
                // The type field reports every keystroke, so half-typed types (`nt[]`, `[]`) reach here too, and
                // nothing typed may be lost on the way to the type the user meant.
                const heldText = getHeldValueText(heldValue);
                if (isStructuredValue) {
                    form.setValue(props.field.key, heldText, { shouldDirty: true });
                }
                initialInputMode = getModeForHeldValue(selectedInputType, heldText);
                notifyModeChange(initialInputMode);
            } else {
                // The mode is still offered, but a list or map whose element type changed (int[] to string[]) holds
                // entries in the old element's modes (a Number entry in a string[]). Its expression text is read
                // back into entries in the expression mode, which shows each value as written for the new type.
                if (isStructuredValue && getTemplateSignature(previousType) !== getTemplateSignature(currentType)) {
                    form.setValue(props.field.key, getHeldValueText(heldValue), { shouldDirty: true });
                }
                initialInputMode = currentInputModeRef.current;
            }
        }
        previousTypesRef.current = props.field.types;
        updateFieldTypesSelection(initialInputMode);
    }, [props.field, props.recordTypeFields, notifyModeChange]);

    const isModeSwitcherEnabled = useMemo(() => {
        return renderingEditors && renderingEditors.length > 1;
    }, [renderingEditors]);

    const isRecordTypeField = useMemo(() => {
        return !!props.recordTypeFields?.find(recordField => recordField.key === props.field.key);
    }, [props.recordTypeFields, props.field.key]);


    const handleModeChange = useCallback((mode: InputMode) => {
        notifyModeChange(mode);
        updateFieldTypesSelection(mode);

        if (!form) {
            props.handleFormValidation?.(undefined, true);
            return;
        }

        const currentValues = form.getValues();
        const currentFieldValue = currentValues[props.field.key];
        // A list of text and the expression for it are two shapes of one value: carry it across
        // the switch, so nothing typed is lost and the new mode has something to show.
        const carried = carryTextArrayValue(mode === InputMode.TEXT_ARRAY, currentFieldValue);
        if (carried !== undefined) {
            form.setValue(props.field.key, carried, { shouldDirty: true });
            props.handleFormValidation?.({ ...currentValues, [props.field.key]: carried }, true);
            return;
        }
        if (typeof currentFieldValue === 'string' && currentFieldValue !== '') {
            try {
                const config = getEditorConfiguration(mode);
                const convertedValue = config.deserializeValue(currentFieldValue);
                props.handleFormValidation?.({ ...currentValues, [props.field.key]: convertedValue }, true);
            } catch (error) {
                console.error("Error converting field value on mode change", error);
                props.handleFormValidation?.(currentValues, true);
            }
        } else {
            props.handleFormValidation?.(currentValues, true);
        }
    }, [notifyModeChange, props.handleFormValidation, form, props.field.key]);


    const editorElements = useMemo(() => {
        if (!renderingEditors) return null;

        if (!isModeSwitcherEnabled) {
            return <EditorFactory {...props} fieldInputType={renderingEditors[0]} />;

        }
        return renderingEditors.map((type, index) => {
            if (inputMode !== getInputModeFromTypes(type)) return null;
            return (<EditorFactory key={index} {...props} fieldInputType={type} />)
        });
    }, [renderingEditors, isModeSwitcherEnabled, inputMode, props]);


    return (
        <FormContextProvider {...updatedFormContext}>
            <ModeSwitcherProvider
                inputMode={inputMode}
                onModeChange={handleModeChange}
                types={renderingEditors}
                isRecordTypeField={isRecordTypeField}
                isModeSwitcherEnabled={isModeSwitcherEnabled}
            >
                <Container>
                    {editorElements}
                </Container>
            </ModeSwitcherProvider>
        </FormContextProvider>
    );
};
