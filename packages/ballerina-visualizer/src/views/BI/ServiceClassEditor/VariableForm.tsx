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

import React, { useState, useEffect } from 'react';
import { FieldType, LineRange, PropertyModel, Type } from '@wso2/ballerina-core';
import { ArtifactForm } from '../Forms/ArtifactForm';
import { FormField, FormImports, FormValues } from '@wso2/ballerina-side-panel';
import { getImportsForProperty } from '../../../utils/bi';

interface VariableFormProps {
    model: FieldType;
    filePath: string;
    lineRange: LineRange;
    onSave: (model: FieldType) => void;
    onClose: () => void;
    isSaving: boolean;
    /** Requires an initial value, for a class with no init to set the variable in. */
    requireDefaultValue?: boolean;
}

export function VariableForm(props: VariableFormProps) {
    const { model, onSave, onClose, filePath, lineRange, isSaving, requireDefaultValue } = props;
    const [fields, setFields] = useState<FormField[]>([]);

    // Initialize form fields
    useEffect(() => {
        const initialFields = [
            {
                key: 'name',
                label: model.name.metadata?.label || 'Variable Name',
                type: 'IDENTIFIER',
                optional: model.name.optional,
                editable: model.name.editable,
                advanced: model.name.advanced,
                enabled: model.name.enabled,
                documentation: model.name.metadata?.description,
                value: model?.name.value || '',
                types: model.name?.types,
                lineRange: model?.name?.codedata?.lineRange
            },
            {
                key: 'returnType',
                label: model.type.metadata?.label || 'Type',
                type: 'TYPE',
                optional: model.type.optional,
                editable: model.type.editable,
                advanced: model.type.advanced,
                enabled: model.type.enabled,
                documentation: model.type.metadata?.description,
                value: model?.type.value || '',
                types: model.type?.types,
                validateType: true
            },
            {
                key: 'expression',
                label: 'Default Value',
                type: 'EXPRESSION',
                optional: !requireDefaultValue, // TODO: need to fix for LS
                editable: (model.defaultValue as PropertyModel)?.editable || false,
                advanced: (model.defaultValue as PropertyModel)?.advanced || false,
                enabled: (model.defaultValue as PropertyModel)?.enabled ?? true,
                documentation: (model.defaultValue as PropertyModel)?.metadata?.description,
                value: (model.defaultValue as PropertyModel)?.value || '',
                types: (model.defaultValue as PropertyModel)?.types
            }
        ];
        setFields(initialFields);
    }, [model, requireDefaultValue]);

    const handleVariableSave = (data: FormValues, formImports: FormImports) => {
        const updatedVariable: FieldType = {
            ...model,
            name: { ...model.name, value: data.name },
            type: {
                ...model.type,
                value: data.returnType,
                imports: getImportsForProperty('returnType', formImports)
            },
            defaultValue: {
                ...(model.defaultValue as PropertyModel),
                value: data.expression,
                imports: getImportsForProperty('expression', formImports)
            }
        };
        onSave(updatedVariable);
    };

    return (
        <>
            {fields.length > 0 && (
                <ArtifactForm
                    fileName={filePath}
                    targetLineRange={lineRange}
                    fields={fields}
                    isSaving={isSaving}
                    onSubmit={handleVariableSave}
                    onBack={onClose}
                    submitText={isSaving ? "Saving..." : "Save"}
                    helperPaneSide="left"
                    preserveFieldOrder={true}
                />
            )}
        </>
    );
}
