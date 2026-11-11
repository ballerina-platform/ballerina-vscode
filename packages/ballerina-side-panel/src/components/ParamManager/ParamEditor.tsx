/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
// tslint:disable: jsx-no-multiline-js

import React, { RefObject, useEffect, useRef, useState } from 'react';

import { EditorContainer } from './styles';
import { Parameter } from './ParamManager';
import { getAppliedRenames } from './appliedRenames';
import Form from '../Form';
import { FormField, FormValues, HelperpaneOnChangeOptions } from '../Form/types';
import { useFormContext } from '../../context';
import { InputType, RecordTypeField, TextEdit } from '@wso2/ballerina-core';
import { HelperPaneHeight } from '@wso2/ui-toolkit';
import { FormExpressionEditorRef } from '@wso2/ui-toolkit';

export interface ParamProps {
    propertyKey: string;
    parameter: Parameter;
    paramFields: FormField[];
    onSave: (param: Parameter) => void | Promise<void>;
    onCancelEdit: (param?: Parameter) => void;
    openRecordEditor?: (open: boolean) => void;
}

export function ParamEditor(props: ParamProps) {
    const { propertyKey, parameter, paramFields, onSave, onCancelEdit, openRecordEditor } = props;
    const { expressionEditor, targetLineRange, fileName } = useFormContext();

    const onCompletionItemSelect = async (value: string, fieldKey: string, additionalTextEdits?: TextEdit[]) => {
        await expressionEditor?.onCompletionItemSelect(value, propertyKey, additionalTextEdits);
    };

    const getHelperPane = (
        fieldKey: string,
        exprRef: RefObject<FormExpressionEditorRef>,
        anchorRef: RefObject<HTMLDivElement>,
        defaultValue: string,
        value: string,
        onChange: (value: string, options?: HelperpaneOnChangeOptions) => void,
        changeHelperPaneState: (isOpen: boolean) => void,
        helperPaneHeight: HelperPaneHeight,
        recordTypeField?: RecordTypeField
    ) => {
        return expressionEditor?.getHelperPane(
            propertyKey,
            exprRef,
            anchorRef,
            defaultValue,
            value,
            onChange,
            changeHelperPaneState,
            helperPaneHeight,
            recordTypeField
        );
    };

    const getTypeHelper = (
        fieldKey: string,
        types: InputType[],
        typeBrowserRef: RefObject<HTMLDivElement>,
        currentType: string,
        currentCursorPosition: number,
        typeHelperState: boolean,
        onChange: (newType: string, newCursorPosition: number) => void,
        changeTypeHelperState: (isOpen: boolean) => void,
        helperPaneHeight: HelperPaneHeight,
        closeCompletions: () => void,
        exprRef: RefObject<FormExpressionEditorRef>
    ) => {
        return expressionEditor?.getTypeHelper(
            propertyKey,
            types,
            typeBrowserRef,
            currentType,
            currentCursorPosition,
            typeHelperState,
            onChange,
            changeTypeHelperState,
            helperPaneHeight,
            closeCompletions,
            exprRef
        );
    };

    const [fields, setFields] = useState<FormField[]>(paramFields);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setFields(paramFields);
    }, [paramFields]);

    // The editor's current values, so a cancel can still see a rename the LS already applied.
    const latestValues = useRef<FormValues>({});

    // A rename made in place has already changed the source, so cancelling keeps it, and only it:
    // the parameter is saved with the renamed identifier and its other values as they were.
    const handleOnCancel = () => {
        const renames = getAppliedRenames(fields, latestValues.current, parameter.formValues);
        if (Object.keys(renames).length > 0) {
            void onSave({ ...parameter, formValues: { ...parameter.formValues, ...renames } });
            return;
        }
        onCancelEdit(parameter);
    };

    const handleOnSave = async (data: FormValues) => {
        parameter.formValues = data;
        setIsSaving(true);
        try {
            await onSave(parameter);
            setFields([]);
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <EditorContainer>
            <Form
                formFields={fields}
                openRecordEditor={openRecordEditor}
                onSubmit={handleOnSave}
                onCancelForm={handleOnCancel}
                onChange={(_key, _value, allValues) => { latestValues.current = allValues; }}
                expressionEditor={{
                    ...expressionEditor,
                    onCompletionItemSelect: onCompletionItemSelect,
                    getHelperPane: getHelperPane,
                    types: expressionEditor?.types,
                    referenceTypes: expressionEditor?.referenceTypes,
                    retrieveVisibleTypes: expressionEditor?.retrieveVisibleTypes,
                    getTypeHelper: getTypeHelper,
                    helperPaneHeight: expressionEditor?.helperPaneHeight
                }}
                submitText={parameter.key ? 'Save' : 'Add'}
                nestedForm={true}
                targetLineRange={targetLineRange}
                fileName={fileName}
                preserveOrder={true}
                isSaving={isSaving}
            />
        </EditorContainer >
    );
}
