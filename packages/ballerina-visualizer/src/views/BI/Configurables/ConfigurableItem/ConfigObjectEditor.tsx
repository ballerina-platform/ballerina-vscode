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

import React, { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { VSCodeTextField, VSCodeButton, VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react";
import { GetRecordConfigRequest, Property, TypeField, RecordSourceGenRequest, RecordSourceGenResponse, getPrimaryInputType } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon, Typography } from "@wso2/ui-toolkit";
import { normalizeIntersections } from "../../HelperPaneNew/Components/RecordConstructView/utils/intersection";
import { getTomlPlaceholder, validateTomlValue } from "./utils";

const EditorContainer = styled.div`
    width: 100%;
    font-size: 13px;
`;

const FieldRow = styled.div<{ level: number }>`
    display: flex;
    flex-direction: column;
    margin-bottom: 12px;
    padding-left: ${(props: { level: number }) => props.level * 16}px;
`;

const FieldHeader = styled.div`
    display: flex;
    align-items: center;
    margin-bottom: 4px;
    cursor: pointer;
    user-select: none;
`;

const FieldLabel = styled.span`
    color: var(--vscode-settings-headerForeground);
    font-weight: 500;
    margin-right: 8px;
    font-size: 13px;
`;

const FieldType = styled.span`
    font-size: 13px;
    margin-left: 4px;
`;

const OptionalLabel = styled.span`
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    margin-left: 4px;
`;

const RequiredLabel = styled.span`
    color: var(--vscode-editorWarning-foreground);
    font-size: 12px;
    margin-left: 4px;
`;

const DefaultableLabel = styled.span`
    font-size: 12px;
    margin-left: 4px;
`;

const DocumentationText = styled.div`
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    margin-top: 2px;
    margin-bottom: 6px;
    line-height: 1.4;
`;

const ExpandIcon = styled(Codicon) <{ expanded: boolean }>`
    margin-right: 4px;
    transition: transform 0.2s;
    transform: ${(props: { expanded: boolean }) => props.expanded ? 'rotate(90deg)' : 'rotate(0deg)'};
`;

const NestedFieldsContainer = styled.div`
    margin-left: 16px;
    border-left: 1px solid var(--vscode-panel-border);
    padding-left: 8px;
    margin-top: 8px;
`;

const ArrayContainer = styled.div`
    margin-top: 8px;
`;

const ArrayItem = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
`;

const ArrayInputContainer = styled.div`
    flex: 1;
    max-width: 350px;
`;

const ArrayControls = styled.div`
    display: flex;
    gap: 4px;
    margin-top: 4px;
`;

const AddButton = styled(VSCodeButton)`
    font-size: 12px;
`;

const RemoveButton = styled(VSCodeButton)`
    font-size: 12px;
    min-width: 24px;
`;

const ValidationErrorText = styled.div`
    color: var(--vscode-editorError-foreground);
    font-size: 12px;
    line-height: 16px;
    margin-top: 4px;
`;

interface ObjectEditorProps {
    fileName: string;
    configValue: string | object;
    typeValue: Property;
    onChange: (value: string) => void;
    disabled?: boolean;
}

interface TypeFieldRendererProps {
    field: TypeField;
    level: number;
    onFieldChange: (field: TypeField, newValue: any) => void;
    disabled?: boolean;
}

function TypeFieldRenderer(props: TypeFieldRendererProps) {
    const { field, level, onFieldChange, disabled } = props;
    const [isExpanded, setIsExpanded] = useState<boolean>(true);
    const [fieldValue, setFieldValue] = useState<string>(field.value !== undefined && field.value !== null ? String(field.value) : '');
    const [boolValue, setBoolValue] = useState<boolean>(field.value === true || field.value === 'true');
    const [arrayItems, setArrayItems] = useState<any[]>([]);
    const [validationError, setValidationError] = useState<string>('');
    const [arrayValidationErrors, setArrayValidationErrors] = useState<{ [index: number]: string }>({});

    // Check field type
    const isArrayType = field.typeName === 'array' || field.typeName?.endsWith('[]');
    const isBooleanType = field.typeName === 'boolean';
    const isNumericType = field.typeName === 'int' || field.typeName === 'byte' || field.typeName === 'float' || field.typeName === 'decimal';
    const isStringType = field.typeName === 'string';

    // Update field value when the field prop changes
    useEffect(() => {
        if (isBooleanType) {
            setBoolValue(field.value === true || field.value === 'true');
        } else if (isStringType && field.value !== undefined && field.value !== null) {
            setFieldValue(field.value.replace(/^"|"$/g, ''));
        } else if (isArrayType && field.value !== undefined && field.value !== null) {
            // Parse array value
            try {
                let parsedArray;
                if (typeof field.value === 'string') {
                    parsedArray = JSON.parse(field.value);
                } else if (Array.isArray(field.value)) {
                    parsedArray = field.value;
                } else {
                    parsedArray = [];
                }
                setArrayItems(parsedArray);
            } catch (e) {
                setArrayItems([]);
            }
        } else if (isArrayType) {
            // Array type with no value (null/undefined)
            setArrayItems([]);
        } else {
            setFieldValue(field.value !== undefined && field.value !== null ? String(field.value) : '');
        }
        setValidationError('');
        setArrayValidationErrors({});
    }, [field.value, isArrayType, isBooleanType, isStringType]);

    // Initialize empty array if no value exists
    useEffect(() => {
        if (isArrayType && arrayItems.length === 0 && field.value === undefined) {
            setArrayItems([]);
        }
    }, [isArrayType, field.value]);

    const hasNestedFields = field.fields && field.fields.length > 0;
    const isRecordType = field.typeName === 'record';

    const getValueForValidation = (value: any, type: string) => {
        if (type === 'string' && typeof value === 'string' && !/^".*"$/.test(value)) {
            return `"${value}"`;
        }
        return String(value);
    };

    const getArrayValidationErrors = (items: any[]) => {
        const errors: { [index: number]: string } = {};
        const memberTypeName = field.memberType?.typeName || '';

        items.forEach((item, index) => {
            const error = validateTomlValue(getValueForValidation(item, memberTypeName), memberTypeName);
            if (error) {
                errors[index] = error;
            }
        });

        return errors;
    };

    const handleValueChange = (e: any) => {
        let newValue = e.target.value;
        setFieldValue(newValue);

        // If the field type is string, wrap the value with quotes when updating
        if (isStringType) {
            // Add quotes only if not already present
            if (!/^".*"$/.test(newValue)) {
                newValue = `"${newValue}"`;
            }
        } else if (isNumericType) {
            // For numeric types, don't wrap with quotes
            // No action needed for numeric types; leave newValue unchanged.
        }

        const currentValidationError = validateTomlValue(String(newValue), String(field.typeName || ''));
        setValidationError(currentValidationError);
        if (currentValidationError) {
            return;
        }

        field.value = newValue;
        onFieldChange(field, newValue);
    };

    const handleBooleanChange = (e: any) => {
        const newValue = e.target.checked;
        setBoolValue(newValue);
        field.value = newValue;
        onFieldChange(field, newValue);
    };

    const handleNumericChange = (e: any) => {
        const value = e.target.value;
        setFieldValue(value);

        const currentValidationError = validateTomlValue(value, String(field.typeName || ''));
        setValidationError(currentValidationError);
        if (currentValidationError) {
            return;
        }

        field.value = value;
        onFieldChange(field, value);
    };

    const handleArrayItemChange = (index: number, value: any) => {
        const newArrayItems = [...arrayItems];

        // Handle based on member type
        const memberTypeName = field.memberType?.typeName;
        if (memberTypeName === 'string') {
            // For strings, wrap in quotes if not already wrapped
            newArrayItems[index] = value;
        } else if (memberTypeName === 'boolean') {
            newArrayItems[index] = value;
        } else if (memberTypeName === 'int' || memberTypeName === 'byte' || memberTypeName === 'float' || memberTypeName === 'decimal') {
            newArrayItems[index] = value;
        } else {
            newArrayItems[index] = value;
        }

        setArrayItems(newArrayItems);

        const currentValidationErrors = getArrayValidationErrors(newArrayItems);
        setArrayValidationErrors(currentValidationErrors);
        if (Object.keys(currentValidationErrors).length > 0) {
            return;
        }

        // Update the field with the new array value
        // If all items are empty, set to empty array []
        const filteredItems = newArrayItems.filter(item => item !== '');
        const arrayValue = filteredItems.length > 0 ? JSON.stringify(newArrayItems) : '[]';
        field.value = arrayValue;
        onFieldChange(field, arrayValue);
    };

    const addArrayItem = () => {
        // Determine default value based on member type
        const memberTypeName = field.memberType?.typeName;
        let defaultValue: any = '';

        if (memberTypeName === 'boolean') {
            defaultValue = false;
        } else if (memberTypeName === 'int' || memberTypeName === 'byte' || memberTypeName === 'float' || memberTypeName === 'decimal') {
            defaultValue = '';
        } else if (memberTypeName === 'string') {
            defaultValue = '';
        }

        const newArrayItems = [...arrayItems, defaultValue];
        setArrayItems(newArrayItems);
        const currentValidationErrors = getArrayValidationErrors(newArrayItems);
        setArrayValidationErrors(currentValidationErrors);
        if (Object.keys(currentValidationErrors).length > 0) {
            return;
        }

        // Update field value and trigger change
        field.value = JSON.stringify(newArrayItems);
        onFieldChange(field, JSON.stringify(newArrayItems));
    };

    const removeArrayItem = (index: number) => {
        const newArrayItems = arrayItems.filter((_, i) => i !== index);
        setArrayItems(newArrayItems);
        const currentValidationErrors = getArrayValidationErrors(newArrayItems);
        setArrayValidationErrors(currentValidationErrors);
        if (Object.keys(currentValidationErrors).length > 0) {
            return;
        }

        // If no items left, set value to empty array []
        if (newArrayItems.length === 0) {
            field.value = '[]';
            onFieldChange(field, '[]');
        } else {
            const arrayValue = JSON.stringify(newArrayItems);
            field.value = arrayValue;
            onFieldChange(field, arrayValue);
        }
    };

    const toggleExpand = () => {
        if (hasNestedFields || isArrayType) {
            setIsExpanded(!isExpanded);
        }
    };

    return (
        <FieldRow level={level}>
            <FieldHeader onClick={isBooleanType ? undefined : toggleExpand} style={{ cursor: isBooleanType ? 'default' : 'pointer' }}>
                {(hasNestedFields || isArrayType) && (
                    <ExpandIcon
                        name="chevron-right"
                        expanded={isExpanded}
                    />
                )}
                <FieldLabel>{field.name || field.displayName}</FieldLabel>
                {field.typeName && (
                    <FieldType>{field.typeName}</FieldType>
                )}
                {field.optional && (
                    <OptionalLabel>(Optional)</OptionalLabel>
                )}
                {!field.optional && !field.defaultable && field.typeName !== "record" && (field.value === undefined || field.value === null || field.value === '' || field.value === '[]') && (
                    <RequiredLabel>(Required)</RequiredLabel>
                )}
                {field.defaultable && (
                    <DefaultableLabel>(Has Default)</DefaultableLabel>
                )}
            </FieldHeader>

            {/* Show documentation below header */}
            {field.documentation && (
                <DocumentationText>
                    {field.documentation}
                </DocumentationText>
            )}

            {/* Array type rendering */}
            {isArrayType && isExpanded && (
                <ArrayContainer>
                    {arrayItems.length === 0 ? (
                        <Typography variant="body3" sx={{ color: 'var(--vscode-descriptionForeground)', marginBottom: '8px' }}>
                            No items ([])
                        </Typography>
                    ) : (
                        arrayItems.map((item, index) => {
                            const memberTypeName = field.memberType?.typeName;
                            return (
                                <ArrayItem key={index}>
                                    {memberTypeName === 'boolean' ? (
                                        <VSCodeCheckbox
                                            checked={item === true || item === 'true'}
                                            disabled={disabled}
                                            onChange={(e: any) => handleArrayItemChange(index, e.target.checked)}
                                        >
                                            Item {index + 1}
                                        </VSCodeCheckbox>
                                    ) : memberTypeName === 'int' || memberTypeName === 'byte' || memberTypeName === 'float' || memberTypeName === 'decimal' ? (
                                        <ArrayInputContainer>
                                            <VSCodeTextField
                                                value={typeof item === 'string' ? item : String(item)}
                                                disabled={disabled}
                                                style={{
                                                    width: '100%'
                                                }}
                                                onChange={(e: any) => handleArrayItemChange(index, e.target.value)}
                                                placeholder={getTomlPlaceholder(memberTypeName || '')}
                                            />
                                            {arrayValidationErrors[index] && (
                                                <ValidationErrorText>{arrayValidationErrors[index]}</ValidationErrorText>
                                            )}
                                        </ArrayInputContainer>
                                    ) : (
                                        <ArrayInputContainer>
                                            <VSCodeTextField
                                                value={typeof item === 'string' ? item : JSON.stringify(item)}
                                                disabled={disabled}
                                                style={{
                                                    width: '100%'
                                                }}
                                                onChange={(e: any) => handleArrayItemChange(index, e.target.value)}
                                                placeholder={`Item ${index + 1}${memberTypeName ? ` (${memberTypeName})` : ''}`}
                                            />
                                            {arrayValidationErrors[index] && (
                                                <ValidationErrorText>{arrayValidationErrors[index]}</ValidationErrorText>
                                            )}
                                        </ArrayInputContainer>
                                    )}
                                    <RemoveButton
                                        appearance="icon"
                                        disabled={disabled}
                                        onClick={() => removeArrayItem(index)}
                                        title="Remove item"
                                    >
                                        <Codicon name="trash" />
                                    </RemoveButton>
                                </ArrayItem>
                            );
                        })
                    )}
                    <ArrayControls>
                        <AddButton
                            appearance="secondary"
                            disabled={disabled}
                            onClick={addArrayItem}
                        >
                            <Codicon name="add" sx={{ marginRight: '4px' }} />
                            Add Item
                        </AddButton>
                    </ArrayControls>
                </ArrayContainer>
            )}

            {/* Boolean field rendering */}
            {isBooleanType && (
                <VSCodeCheckbox
                    checked={boolValue}
                    disabled={disabled}
                    onChange={handleBooleanChange}
                >
                    {boolValue ? 'Enabled' : 'Disabled'}
                </VSCodeCheckbox>
            )}

            {/* Numeric field rendering */}
            {isNumericType && !isArrayType && (
                <VSCodeTextField
                    value={fieldValue}
                    disabled={disabled}
                    style={{
                        width: '100%',
                        maxWidth: '400px'
                    }}
                    onChange={handleNumericChange}
                    placeholder={getTomlPlaceholder(field.typeName || '', field.defaultValue)}
                />
            )}
            {isNumericType && !isArrayType && validationError && (
                <ValidationErrorText>{validationError}</ValidationErrorText>
            )}

            {/* String field rendering */}
            {isStringType && !isArrayType && (
                <VSCodeTextField
                    value={fieldValue}
                    disabled={disabled}
                    style={{
                        width: '100%',
                        maxWidth: '400px'
                    }}
                    onChange={handleValueChange}
                    placeholder={getTomlPlaceholder(field.typeName || '', field.defaultValue)}
                />
            )}
            {isStringType && !isArrayType && validationError && (
                <ValidationErrorText>{validationError}</ValidationErrorText>
            )}

            {/* Other types field rendering */}
            {!isBooleanType && !isNumericType && !isStringType && !isRecordType && !hasNestedFields && !isArrayType && (
                <VSCodeTextField
                    value={fieldValue}
                    disabled={disabled}
                    style={{
                        width: '100%',
                        maxWidth: '400px'
                    }}
                    onChange={handleValueChange}
                    placeholder={getTomlPlaceholder(field.typeName || '', field.defaultValue)}
                />
            )}
            {!isBooleanType && !isNumericType && !isStringType && !isRecordType && !hasNestedFields && !isArrayType && validationError && (
                <ValidationErrorText>{validationError}</ValidationErrorText>
            )}

            {/* Nested fields rendering */}
            {hasNestedFields && isExpanded && !isArrayType && (
                <NestedFieldsContainer>
                    {field.fields.map((nestedField, index) => (
                        <TypeFieldRenderer
                            key={`${nestedField.name}-${index}`}
                            field={nestedField}
                            level={level + 1}
                            onFieldChange={onFieldChange}
                            disabled={disabled}
                        />
                    ))}
                </NestedFieldsContainer>
            )}
        </FieldRow>
    );
}

export function ConfigObjectEditor(props: ObjectEditorProps) {
    const { fileName, configValue, typeValue, onChange, disabled: parentDisabled } = props;

    const [recordConfig, setRecordConfig] = useState<TypeField | null>(null);
    // Package coordinates of the configurable's type, captured when building the getRecordConfig
    // request and reused for the generateValue (getRecordSource) call so the backend can resolve imports.
    const codedataRef = useRef<RecordSourceGenRequest["codedata"]>(undefined);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [error, setError] = useState<string>('');

    const { rpcClient } = useRpcContext();

    // Derive a stable string key so loadRecordConfig only fires when the actual
    // type or file changes — not when the parent passes a new typeValue object reference
    // on every re-render (which would reset the form mid-edit).
    const typeKey = `${fileName}::${String(typeValue?.value)}`;

    useEffect(() => {
        loadRecordConfig();
    }, [typeKey]);

    const loadRecordConfig = async () => {
        setIsLoading(true);
        setError('');
        try {
            const typeInfo = getPrimaryInputType(typeValue.types)?.typeMembers?.find(m => typeValue.value.toString().includes(m.type));
            if (!typeInfo) {
                setError('Type information not found');
                setIsLoading(false);
                return;
            }
            const parts = typeInfo.packageInfo.split(':');
            let orgName = '';
            let moduleName = '';
            let version = '';
            let packageName = '';
            if (parts.length === 3) {
                [orgName, moduleName, version] = parts;
                packageName = typeInfo.packageName;
            }
            const request: GetRecordConfigRequest = {
                filePath: fileName,
                codedata: {
                    org: orgName,
                    module: moduleName,
                    version: version,
                    packageName: packageName,
                },
                typeConstraint: typeValue.value as string,
            };
            codedataRef.current = request.codedata;
            const response = await rpcClient.getBIDiagramRpcClient().getRecordConfig(request);
            console.log('recordConfig', response);

            if (response.recordConfig) {
                const configWithName: TypeField = {
                    name: typeValue.value as string,
                    ...normalizeIntersections(response.recordConfig)
                };
                // Set all fields and nested fields' selected to true recursively
                function setAllValuesTrue(field: TypeField) {
                    field.selected = true;
                    if (field.fields && field.fields.length > 0) {
                        field.fields.forEach(setAllValuesTrue);
                    }
                }
                setAllValuesTrue(configWithName);

                // If there's an existing config value, parse it and merge with recordConfig
                if (configValue) {
                    try {
                        let parsedValue: any;
                        if (typeof configValue === 'string') {
                            // Attempt to fix JSON if it is JavaScript-style (unquoted keys)
                            const fixedJson = configValue.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
                            parsedValue = JSON.parse(fixedJson);
                            // Check if there are string values that are not wrapped in quotes
                            Object.keys(parsedValue).forEach(key => {
                                if (typeof parsedValue[key] === 'string' && !/^".*"$/.test(parsedValue[key])) {
                                    parsedValue[key] = `"${parsedValue[key]}"`;
                                }
                            });
                        } else {
                            parsedValue = configValue;
                        }
                        mergeValuesIntoConfig(configWithName, parsedValue);
                    } catch (e) {
                        console.error('Error parsing config value:', e);
                    }
                }

                setRecordConfig(configWithName);
            }
        } catch (err) {
            console.error('Error loading record config:', err);
            setError('Failed to load record configuration');
        } finally {
            setIsLoading(false);
        }
    };

    const withOnlyFilledFields = (config: TypeField): TypeField => {
        const clone = { ...config };
        if (clone.fields) {
            clone.fields = clone.fields
                .map(withOnlyFilledFields)
                .filter(f => {
                    if (f.fields && f.fields.length > 0) return true;
                    return f.value !== undefined && f.value !== null && f.value !== '' && f.value !== '[]';
                });
        }
        return clone;
    };

    const mergeValuesIntoConfig = (config: TypeField, values: any) => {
        if (config.fields && typeof values === 'object' && values !== null) {
            config.fields.forEach(field => {
                if (field.name && values[field.name] !== undefined) {
                    if (field.fields && field.fields.length > 0 && typeof values[field.name] === 'object') {
                        mergeValuesIntoConfig(field, values[field.name]);
                    } else {
                        field.value = values[field.name];
                    }
                }
            });
        }
    };

    const handleFieldChange = async (field: TypeField, newValue: any) => {
        // Update the field value in the recordConfig
        field.value = newValue;

        // Generate source code from the updated recordConfig
        if (recordConfig) {
            setIsSaving(true);
            try {
                // The configurable's type (the type the generated value is assigned to) is sent
                // as the optional typeConstraint so the backend can derive the correct value.
                const typeConstraint = typeValue?.value as string;
                const request: RecordSourceGenRequest = {
                    filePath: fileName,
                    type: withOnlyFilledFields(recordConfig),
                    ...(typeConstraint ? { typeConstraint } : {}),
                    ...(codedataRef.current ? { codedata: codedataRef.current } : {})
                };
                const response: RecordSourceGenResponse = await rpcClient.getBIDiagramRpcClient().getRecordSource(request);
                console.log('>>> recordSourceResponse', response);

                if (response.recordValue !== undefined) {
                    // Format the recordValue as a minified single line JSON-like string
                    if (response.recordValue && typeof response.recordValue === 'string') {
                        // Remove newlines and unnecessary whitespaces between tokens
                        const formattedValue = response.recordValue
                            .replace(/[\n\r]/g, '')      // remove newlines
                            .replace(/\s*([\{\}\[\]:,])\s*/g, '$1') // remove spaces around JSON tokens
                            .replace(/\s{2,}/g, '');    // remove multiple spaces
                        onChange(formattedValue);
                    } else {
                        onChange(response.recordValue);
                    }
                }
            } catch (err) {
                console.error('Error generating record source:', err);
            } finally {
                setIsSaving(false);
            }
        }
    };

    if (isLoading) {
        return (
            <EditorContainer>
                <Typography variant="body3">Loading record configuration...</Typography>
            </EditorContainer>
        );
    }

    if (error) {
        return (
            <EditorContainer>
                <Typography variant="body3" sx={{ color: 'var(--vscode-errorForeground)' }}>
                    {error}
                </Typography>
            </EditorContainer>
        );
    }

    if (!recordConfig || !recordConfig.fields || recordConfig.fields.length === 0) {
        return (
            <EditorContainer>
                <Typography variant="body3">No record fields available</Typography>
            </EditorContainer>
        );
    }

    const isDisabled = parentDisabled || isSaving;

    return (
        <EditorContainer style={{ position: 'relative', opacity: isDisabled ? 0.6 : 1 }}>
            {/* Show the documentation of the record */}
            {recordConfig.documentation && (
                <DocumentationText>
                    {recordConfig.documentation}
                </DocumentationText>
            )}
            <div style={{ marginLeft: '16px', marginTop: '16px' }} >
                {recordConfig.fields.map((field, index) => (
                    <TypeFieldRenderer
                        key={`${field.name}-${index}`}
                        field={field}
                        level={0}
                        onFieldChange={handleFieldChange}
                        disabled={isDisabled}
                    />
                ))}
            </div>
            {isDisabled && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '8px',
                    marginLeft: '16px',
                    color: 'var(--vscode-descriptionForeground)',
                    fontSize: '12px'
                }}>
                    <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: '14px' }} />
                    Updating...
                </div>
            )}
        </EditorContainer>
    );
};

export default ConfigObjectEditor;

