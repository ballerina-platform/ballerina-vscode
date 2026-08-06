/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com)
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

import { useEffect, useState } from 'react';
import { Divider, Typography } from '@wso2/ui-toolkit';
import { EditorContainer } from '../../../styles';
import { getPrimaryInputType, LineRange, ParameterModel } from '@wso2/ballerina-core';
import { FormField, FormImports } from '@wso2/ballerina-side-panel';
import ArtifactForm from '../../../../Forms/ArtifactForm';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { getImportsForProperty } from '../../../../../../utils/bi';

export interface ParamEditorProps {
    param: ParameterModel;
    onChange: (param: ParameterModel) => void;
    onSave?: (param: ParameterModel) => void;
    onCancel?: (param?: ParameterModel) => void;
    typeLabel?: string;
    /** Hides the name field — the parameter keeps its shipped name (e.g. a fixed data-binding param). */
    hideName?: boolean;
}

/** Strips array or stream wrapper to recover the bare record type name. */
const extractBaseRecordType = (typeValue: string): string => {
    if (!typeValue) return '';
    if (typeValue.endsWith('[]') && typeValue !== 'string[]' && typeValue !== 'byte[]') {
        return typeValue.slice(0, -2);
    }
    if (typeValue.startsWith('stream<')) {
        if (typeValue.endsWith(', error?>')) return typeValue.slice(7, -9);
        if (typeValue.endsWith(', error>')) return typeValue.slice(7, -8);
        if (typeValue.endsWith('>')) return typeValue.slice(7, -1);
    }
    return typeValue;
};

export function ParamEditor(props: ParamEditorProps) {
    const { param, onChange, onSave, onCancel, typeLabel = 'Content Schema', hideName } = props;

    const { rpcClient } = useRpcContext();
    const [currentFields, setCurrentFields] = useState<FormField[]>([]);
    const [filePath, setFilePath] = useState<string>('');
    const [targetLineRange, setTargetLineRange] = useState<LineRange>();

    const handleOnCancel = () => {
        onCancel?.(param);
    };

    useEffect(() => {
        rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['main.bal'] }).then((response) => {
            setFilePath(response.filePath);
        });
        updateFormFields();
    }, []);

    const updateFormFields = () => {
        const fields: FormField[] = [];
        const typeFieldType = getPrimaryInputType(param.type?.types)?.fieldType || 'TYPE';
        const baseType = extractBaseRecordType(param.type?.value || param.type?.placeholder || '');

        if (!hideName) {
            fields.push({
                key: `name`,
                label: 'Name',
                type: 'IDENTIFIER',
                optional: false,
                editable: true,
                documentation: '',
                enabled: param.name?.enabled ?? true,
                value: param.name?.value ?? '',
                types: [{ fieldType: 'IDENTIFIER', selected: false }]
            });
        }

        fields.push({
            key: `type`,
            label: typeLabel,
            type: typeFieldType,
            optional: false,
            editable: true,
            documentation: param?.type?.metadata?.description || '',
            enabled: param.type?.enabled ?? true,
            value: baseType,
            defaultValue: baseType,
            types: [{ fieldType: typeFieldType, selected: false }]
        });

        setCurrentFields(fields);
    };

    useEffect(() => {
        updateFormFields();
    }, [param.name, param.type]);

    const onParameterSubmit = (dataValues: Record<string, string>, formImports: FormImports) => {
        const baseType = dataValues['type'] ?? extractBaseRecordType(param.type?.value || '');

        // Detect wrapper from the current stored type value and reapply it
        const currentType = param.type?.value || '';
        const isCurrentlyStream = currentType.startsWith('stream<');
        const isCurrentlyArray = currentType.endsWith('[]') && !['string[]', 'byte[]'].includes(currentType);
        const resolvedValue = isCurrentlyStream ? `stream<${baseType}, error?>`
            : isCurrentlyArray ? `${baseType}[]`
                : baseType;

        const resolvedName = dataValues['name'] ?? param.name?.value ?? '';

        const updatedParam = {
            ...param,
            type: {
                ...param.type,
                value: resolvedValue,
                imports: getImportsForProperty('type', formImports)
            },
            name: { ...param.name, value: resolvedName }
        };

        onChange(updatedParam);
        if (onSave) onSave(updatedParam);
    };

    useEffect(() => {
        if (filePath && rpcClient) {
            rpcClient
                .getBIDiagramRpcClient()
                .getEndOfFile({ filePath })
                .then((res) => {
                    setTargetLineRange({
                        startLine: res,
                        endLine: res,
                    });
                });
        }
    }, [filePath, rpcClient]);

    return (
        <EditorContainer>
            <Typography sx={{ marginBlockEnd: 0, marginTop: 5 }} variant="h4">
                Content Schema
            </Typography>
            <Divider />
            <>
                {filePath && targetLineRange &&
                    <ArtifactForm
                        fileName={filePath}
                        targetLineRange={targetLineRange}
                        fields={currentFields}
                        onBack={handleOnCancel}
                        onSubmit={onParameterSubmit}
                        submitText="Save"
                        nestedForm={true}
                        helperPaneSide='left'
                        preserveFieldOrder={true}
                        recordsOnly={true}
                    />
                }
            </>
        </EditorContainer>
    );
}
