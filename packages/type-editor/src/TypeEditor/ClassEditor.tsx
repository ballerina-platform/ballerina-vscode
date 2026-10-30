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

import React, { useRef, useState } from 'react';
import { Imports, Type, TypeFunctionModel } from '@wso2/ballerina-core';
import { Codicon, Button, TextField, LinkButton, CheckBox } from '@wso2/ui-toolkit';
import styled from '@emotion/styled';
import { TYPE_MODIFIERS, VALUE_TYPE_MODIFIERS } from '@wso2/ballerina-side-panel';
import { TypeField } from './TypeField';
import { revealSyntaxTogglesOnHover } from './SyntaxToggles';
import { IdentifierField } from './IdentifierField';
import { isGraphQLScalarType } from './TypeUtil';

namespace S {
    export const Container = styled.div`
        display: flex;
        flex-direction: column;
    `;

    export const Header = styled.div`
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 8px 0px;
        margin-bottom: 8px;
    `;

    export const SectionTitle = styled.div`
        font-size: 13px;
        font-weight: 500;
        color: var(--vscode-editor-foreground);
        margin-bottom: 4px;
    `;

    export const FunctionContainer = styled.div`
        display: flex;
        flex-direction: column;
        margin-bottom: 8px;
        gap: 0px;
    `;

    export const FunctionRow = styled.div`
        display: flex;
        gap: 8px;
        align-items: start;
        ${revealSyntaxTogglesOnHover}
    `;

    export const ExpandIconButton = styled(Button)`
        padding: 4px;
        &:hover {
            background: transparent;
        }
    `;

    export const ParameterContainer = styled.div`
        margin-left: 32px;
        padding-left: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;

    export const AddParameterLink = styled(LinkButton)`
        color: var(--vscode-textLink-foreground);
        padding: 4px 0;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 4px;

        &:hover {
            color: var(--vscode-textLink-activeForeground);
        }
    `;

    export const ParameterList = styled.div`
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 8px;
    `;

    export const ParameterItem = styled.div`
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 4px 8px 4px 10px;
        background-color: var(--vscode-editor-background);
        border-radius: 4px;
        font-size: 13px;
        justify-content: space-between;
        cursor: pointer;
        &:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
    `;

    export const ParameterInfo = styled.div`
        display: flex;
        gap: 8px;
        align-items: center;
    `;

    export const ParameterType = styled.span`
        color: var(--vscode-descriptionForeground);
    `;

    export const ButtonGroup = styled.div`
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 8px;
    `;

    export const ParameterForm = styled.div`
        display: flex;
        flex-direction: column;
        gap: 8px;
        background-color: var(--vscode-editor-background);
        border-radius: 4px;
        padding: 8px;
    `;
}

interface ClassEditorProps {
    type: Type;
    isGraphql: boolean;
    onChange: (type: Type) => void;
    onValidationError: (isError: boolean) => void;
}

interface ParameterFormData {
    name: string;
    type: string;
    defaultValue: string;
    imports: Imports;
    isGraphqlId?: boolean;
}

interface FunctionValidationError {
    identifier: boolean;
    type: boolean;
}


export function ClassEditor({ type, onChange, isGraphql, onValidationError }: ClassEditorProps) {
    const [showParameterForm, setShowParameterForm] = useState<number | null>(null);
    const [expandedFunctions, setExpandedFunctions] = useState<number[]>([]);
    const [parameterForm, setParameterForm] = useState<ParameterFormData>({
        name: '',
        type: '',
        defaultValue: '',
        imports: {},
        isGraphqlId: false
    });
    const [editingParamIndex, setEditingParamIndex] = useState<number | null>(null);
    const [paramNameError, setParamNameError] = useState<string>('');

    const [validationErrors, setValidationErrors] = useState<FunctionValidationError[]>([{ identifier: false, type: false }]);

    const currentImports = useRef<Imports | undefined>();

    const handleValidationError = (functionIndex: number, isIdentifier: boolean, hasError: boolean) => {
        setValidationErrors(prev => {
            const newErrors = [...prev];
            // Ensure the field exists
            if (!newErrors[functionIndex]) {
                newErrors[functionIndex] = { identifier: false, type: false };
            }
            if (isIdentifier) {
                newErrors[functionIndex] = { ...newErrors[functionIndex], identifier: hasError };
            } else {
                newErrors[functionIndex] = { ...newErrors[functionIndex], type: hasError };
            }

            // Check if any function has either type or identifier errors
            const hasAnyError = newErrors.some(error => error.identifier || error.type);
            onValidationError?.(hasAnyError);
            return newErrors;
        });
    };

    const toggleFunctionExpand = (index: number) => {
        setExpandedFunctions(prev =>
            prev.includes(index)
                ? prev.filter(i => i !== index)
                : [...prev, index]
        );
    };

    const addFunction = () => {
        const functionCount = type.functions?.length || 0;
        const newFunction: TypeFunctionModel = {
            name: `name${functionCount + 1}`,
            kind: "RESOURCE",
            accessor: "get",
            qualifiers: [],
            parameters: [],
            refs: [],
            returnType: "string"
        };

        onChange({
            ...type,
            functions: [...(type.functions || []), newFunction]
        });
    };

    const updateFunction = (index: number, updates: Partial<TypeFunctionModel>) => {
        const updatedFunctions = [...(type.functions || [])];
        updatedFunctions[index] = {
            ...updatedFunctions[index],
            ...updates,
            imports: currentImports.current
        };

        onChange({
            ...type,
            functions: updatedFunctions
        });

        currentImports.current = undefined;
    };

    const handleUpdateFunctionImports = (index: number, imports: Imports) => {
        const updatedFunctions = [...(type.functions || [])];
        const updatedFunction = updatedFunctions[index];
        const newImportKey = Object.keys(imports)[0];
        if (!updatedFunction.imports || !Object.keys(updatedFunction.imports).includes(newImportKey)) {
            // Updated the existing imports with the new imports
            const updatedImports = { ...updatedFunction.imports, ...imports };

            // Update the imports
            currentImports.current = updatedImports;
        }
    }

    const handleUpdateParameterImports = (imports: Imports) => {
        const newImportKey = Object.keys(imports)[0];
        if (!parameterForm.imports || !Object.keys(parameterForm.imports)?.includes(newImportKey)) {
            const updatedImports = { ...parameterForm.imports, ...imports };
            setParameterForm({
                ...parameterForm,
                imports: updatedImports
            });
        }
    }

    const deleteFunction = (index: number) => {
        const updatedFunctions = (type.functions || []).filter((_, i) => i !== index);
        onChange({
            ...type,
            functions: updatedFunctions
        });
    };

    const openParameterForm = (functionIndex: number, paramIndex?: number) => {
        if (paramIndex !== undefined) {
            // Editing existing parameter
            const param = type.functions[functionIndex].parameters[paramIndex];
            setParameterForm({
                name: String(param.name),
                type: String(param.type),
                defaultValue: param.defaultValue ? String(param.defaultValue) : '',
                imports: param.imports,
                isGraphqlId: param.isGraphqlId || false
            });
            setEditingParamIndex(paramIndex);
        } else {
            // Adding new parameter
            setParameterForm({ name: '', type: '', defaultValue: '', imports: {}, isGraphqlId: false });
            setEditingParamIndex(null);
        }
        setShowParameterForm(functionIndex);
    };

    const handleParameterSave = (functionIndex: number) => {

        const updatedFunctions = [...(type.functions || [])];
        const currentFunction = updatedFunctions[functionIndex];

        const updatedParameter = {
            kind: "PARAMETER" as const,
            refs: [] as string[],
            type: parameterForm.type,
            name: parameterForm.name,
            defaultValue: parameterForm.defaultValue || undefined,
            enabled: true,
            editable: true,
            optional: false,
            advanced: false,
            imports: parameterForm.imports,
            isGraphqlId: parameterForm.isGraphqlId || false
        };

        if (editingParamIndex !== null) {
            // Update existing parameter
            const updatedParameters = [...currentFunction.parameters];
            updatedParameters[editingParamIndex] = updatedParameter;
            updatedFunctions[functionIndex] = {
                ...currentFunction,
                parameters: updatedParameters
            };
        } else {
            // Add new parameter
            updatedFunctions[functionIndex] = {
                ...currentFunction,
                parameters: [...(currentFunction.parameters || []), updatedParameter]
            };
        }

        onChange({
            ...type,
            functions: updatedFunctions
        });

        // Reset form and hide it
        setParameterForm({ name: '', type: '', defaultValue: '', imports: {}, isGraphqlId: false });
        setShowParameterForm(null);
        setEditingParamIndex(null);
        setParamNameError(''); // Clear any error message
    };

    const deleteParameter = (functionIndex: number, paramIndex: number) => {
        const updatedFunctions = [...(type.functions || [])];
        const currentFunction = updatedFunctions[functionIndex];

        const updatedParameters = currentFunction.parameters.filter((_, i) => i !== paramIndex);

        updatedFunctions[functionIndex] = {
            ...currentFunction,
            parameters: updatedParameters
        };

        onChange({
            ...type,
            functions: updatedFunctions
        });
    };

    return (
        <S.Container>
            <S.Header>
                <S.SectionTitle>{isGraphql ? 'Object Fields' : 'Resource Methods'}</S.SectionTitle>
                <div style={{ display: 'flex', gap: '8px' }} data-testid="function-add-button">
                    <Button appearance="icon" onClick={addFunction} tooltip={isGraphql ? 'Add Field' : 'Add Resource Method'}>
                        <Codicon name="add" />
                    </Button>
                </div>
            </S.Header>

            {type.functions?.map((func, index) => (
                <S.FunctionContainer key={index}>
                    <S.FunctionRow>
                        <S.ExpandIconButton
                            appearance="icon"
                            onClick={() => toggleFunctionExpand(index)}
                        >
                            <Codicon name={expandedFunctions.includes(index) ? "chevron-down" : "chevron-right"} />
                        </S.ExpandIconButton>
                        <IdentifierField
                            value={func.name}
                            onChange={(newName) => updateFunction(index, { name: newName })}
                            rootType={type}
                            onValidationError={(hasError) => handleValidationError(index, true, hasError)}
                            placeholder="Name"
                        />
                        <TypeField
                            fieldIndex={index}
                            type={func.returnType}
                            memberName={typeof func.returnType === 'string' ? func.returnType : func.returnType?.name}
                            onChange={(newType) => updateFunction(index, { returnType: newType })}
                            onUpdateImports={(imports) => handleUpdateFunctionImports(index, imports)}
                            placeholder="Type"
                            rootType={type}
                            onValidationError={(hasError) => handleValidationError(index, false, hasError)}
                            modifiers={TYPE_MODIFIERS}
                        />
                        <Button appearance="icon" onClick={() => deleteFunction(index)} tooltip='Delete'>
                            <Codicon name="trash" />
                        </Button>
                    </S.FunctionRow>

                    {expandedFunctions.includes(index) && (
                        <S.ParameterContainer>

                            {isGraphql && isGraphQLScalarType(func.returnType) &&
                                <CheckBox
                                    label="ID Type"
                                    checked={func.isGraphqlId || false}
                                    onChange={() => updateFunction(index, { isGraphqlId: !func.isGraphqlId })}
                                    disabled={false}
                                />
                            }
                            <S.AddParameterLink
                                onClick={() => openParameterForm(index)}
                            >
                                <Codicon name="add" />
                                {isGraphql ? 'Add Argument' : 'Add Parameter'}
                            </S.AddParameterLink>

                            {func.parameters && func.parameters.length > 0 && (
                                <S.ParameterList>
                                    {func.parameters.map((param, paramIndex) => (
                                        <S.ParameterItem
                                            key={paramIndex}
                                            onClick={() => openParameterForm(index, paramIndex)}
                                        >
                                            <S.ParameterInfo>
                                                <span>{String(param.name)}</span>
                                                <S.ParameterType>{String(param.type)}</S.ParameterType>
                                                {param.defaultValue && (
                                                    <S.ParameterType>= {String(param.defaultValue)}</S.ParameterType>
                                                )}
                                            </S.ParameterInfo>
                                            <Button
                                                appearance="icon"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteParameter(index, paramIndex);
                                                }}
                                                tooltip='Delete'
                                            >
                                                <Codicon name="trash" />
                                            </Button>
                                        </S.ParameterItem>
                                    ))}
                                </S.ParameterList>
                            )}

                            {showParameterForm === index && (
                                <S.ParameterForm>
                                    <IdentifierField
                                        value={parameterForm.name}
                                        onChange={(newName) => setParameterForm(prev => ({ ...prev, name: newName }))}
                                        rootType={type}
                                        onValidationError={onValidationError}
                                        placeholder={isGraphql ? "Argument Name" : "Parameter Name"}
                                    />
                                    <TypeField
                                        fieldIndex={index}
                                        type={parameterForm.type}
                                        memberName={parameterForm.type}
                                        onChange={(newType) => setParameterForm(prev => ({ ...prev, type: newType }))}
                                        onUpdateImports={(imports) => handleUpdateParameterImports(imports)}
                                        placeholder={isGraphql ? "Argument Type" : "Parameter Type"}
                                        rootType={type}
                                        onValidationError={onValidationError}
                                        modifiers={VALUE_TYPE_MODIFIERS}
                                    />
                                    <TextField
                                        placeholder="Default Value"
                                        value={parameterForm.defaultValue}
                                        onChange={(e) => setParameterForm(prev => ({ ...prev, defaultValue: e.target.value }))}
                                    />
                                    {isGraphql && isGraphQLScalarType(parameterForm.type) &&
                                        <CheckBox
                                            label="ID Type"
                                            checked={parameterForm.isGraphqlId || false}
                                            onChange={() => setParameterForm(prev => ({ ...prev, isGraphqlId: !prev.isGraphqlId }))}
                                            disabled={false}
                                        />
                                    }
                                    <S.ButtonGroup>
                                        <Button onClick={() => {
                                            setShowParameterForm(null);
                                            setParameterForm({ name: '', type: '', defaultValue: '', imports: {}, isGraphqlId: false });
                                            setParamNameError('');
                                        }}>
                                            Cancel
                                        </Button>
                                        <Button
                                            appearance="primary"
                                            onClick={() => handleParameterSave(index)}
                                            disabled={!parameterForm.name || !parameterForm.type || paramNameError !== ''}
                                        >
                                            Save
                                        </Button>
                                    </S.ButtonGroup>
                                </S.ParameterForm>
                            )}
                        </S.ParameterContainer>
                    )}
                </S.FunctionContainer>
            ))}
        </S.Container>
    );
} 
