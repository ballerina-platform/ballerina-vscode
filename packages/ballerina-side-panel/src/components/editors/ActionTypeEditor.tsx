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

import React, { useEffect, useRef, useState } from "react";
import {
    Codicon,
    ErrorBanner,
    FormExpressionEditor,
    FormExpressionEditorRef,
    HelperPaneHeight,
    Icon,
    Item,
    Menu,
    MenuItem,
    RequiredFormInput,
    ThemeColors,
    Tooltip,
    Typography,
    CompletionItem,
    Button,
    CheckBox,
} from "@wso2/ui-toolkit";
import { FormField } from "../Form/types";
import { useFormContext } from "../../context";
import { Controller } from "react-hook-form";
import { S } from "./ExpressionEditor";
import { buildRequiredRule, getPropertyFromFormField, sanitizeType } from "./utils";
import { debounce } from "lodash";
import styled from "@emotion/styled";
import ReactMarkdown from "react-markdown";
import { getFieldTypeLabel, NodeProperties, PropertyModel } from "@wso2/ballerina-core";

const isGraphQLScalarType = (type: string): boolean => {
    const scalarTypes = [
        'string',
        'int',
        'float',
        'decimal'
    ];

    const isScalarOrArrayOfScalar = (t: string): boolean => {
        let cleanType = t.trim().replace(/\?$/, '');

        if (cleanType.endsWith('[]')) {
            const baseType = cleanType.slice(0, -2).trim();
            return isScalarOrArrayOfScalar(baseType);
        }

        if (cleanType.startsWith('(') && cleanType.endsWith(')')) {
            cleanType = cleanType.slice(1, -1).trim();
            if (cleanType.includes('|')) {
                const unionParts = cleanType.split('|').map(part => part.trim());
                return unionParts.every(part => isScalarOrArrayOfScalar(part));
            }
        }

        return scalarTypes.includes(cleanType.toLowerCase());
    };

    let cleanType = type.trim().replace(/\?$/, '');

    if (cleanType.endsWith('[]') && cleanType.includes('(') && cleanType.includes('|')) {
        const baseType = cleanType.slice(0, -2).trim();
        return isScalarOrArrayOfScalar(baseType);
    }

    if (cleanType.includes('|')) {
        const unionParts = cleanType.split('|').map(part => part.trim());
        return unionParts.every(part => isScalarOrArrayOfScalar(part));
    }

    if (cleanType.endsWith('[]')) {
        const baseType = cleanType.slice(0, -2).trim();
        return isScalarOrArrayOfScalar(baseType);
    }

    return isScalarOrArrayOfScalar(cleanType);
};

interface ActionTypeEditorProps {
    field: FormField;
    openRecordEditor: (open: boolean, newType?: string | NodeProperties) => void;
    handleOnFieldFocus?: (key: string) => void;
    handleOnTypeChange?: (value?: string) => void;
    handleNewTypeSelected?: (type: string | CompletionItem) => void;
    autoFocus?: boolean;
}

const Ribbon = styled.div({
    backgroundColor: ThemeColors.PRIMARY,
    opacity: 0.6,
    width: '24px',
    height: `calc(100% - 6.5px)`,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    borderTopLeftRadius: '2px',
    borderBottomLeftRadius: '2px',
    borderRight: 'none',
    marginTop: '3.75px',
    paddingTop: '6px',
    cursor: 'pointer'
});

const codiconStyles = {
    color: 'var(--vscode-editorLightBulb-foreground)',
    marginRight: '2px'
}

const CheckBoxLabel = styled.div`
    font-family: var(--font-family);
    color: var(--vscode-editor-foreground);
    text-align: left;
`;

const CheckBoxDescription = styled.div`
    font-family: var(--font-family);
    color: var(--vscode-list-deemphasizedForeground);
    text-align: left;
`;

const CheckBoxLabelGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const CheckBoxBoxGroup = styled.div`
    display: flex;
    flex-direction: row;
    width: 100%;
    align-items: flex-start;
`;

const EditorRibbon = ({ onClick }: { onClick: () => void }) => {
    return (
        <Tooltip content="Add Type" containerSx={{ cursor: 'default' }}>
            <Ribbon onClick={onClick}>
                <Icon name="bi-type" sx={{
                    color: ThemeColors.ON_PRIMARY,
                    fontSize: '12px',
                    width: '12px',
                    height: '12px'
                }} />
            </Ribbon>
        </Tooltip>
    );
};

const getDefaultCompletion = (newType: string) => {
    return (
        <S.TitleContainer data-testid="add-type-completion">
            <Codicon name="add" />
            <Typography variant="body3" sx={{ fontWeight: 600 }}>
                Add Type: {newType}
            </Typography>
        </S.TitleContainer>
    )
}

export function ActionTypeEditor(props: ActionTypeEditorProps) {
    const { field, openRecordEditor, handleOnFieldFocus, handleOnTypeChange, autoFocus, handleNewTypeSelected } = props;
    const { form, expressionEditor } = useFormContext();
    const { control } = form;
    const {
        types,
        referenceTypes,
        helperPaneOrigin: typeHelperOrigin,
        helperPaneHeight: typeHelperHeight,
        retrieveVisibleTypes,
        getTypeHelper,
        onFocus,
        onBlur,
        onCompletionItemSelect,
        onSave,
        onCancel,
        getExpressionEditorDiagnostics
    } = expressionEditor;

    const exprRef = useRef<FormExpressionEditorRef>(null);
    const typeBrowserRef = useRef<HTMLDivElement>(null);
    const codeActionRef = useRef<HTMLDivElement>(null);
    const onChangeRef = useRef<((value: string) => void) | null>(null);

    const cursorPositionRef = useRef<number | undefined>(undefined);
    const [showDefaultCompletion, setShowDefaultCompletion] = useState<boolean>(false);
    const [focused, setFocused] = useState<boolean>(false);
    const [isTypeOptional, setIsTypeOptional] = useState<boolean>(false);
    const [isCodeActionMenuOpen, setIsCodeActionMenuOpen] = useState<boolean>(false);
    const [isGraphqlId, setIsGraphqlId] = useState<boolean>(field.isGraphqlId || false);
    const [showGraphqlCheckbox, setShowGraphqlCheckbox] = useState<boolean>(false);

    const [isTypeHelperOpen, setIsTypeHelperOpen] = useState<boolean>(false);

    /** HACK: FE implementation check the optional support of a type till the LS supports it
     * Issue: https://github.com/wso2/product-ballerina-integrator/issues/1262
     */
    const checkTypeOptional = (typeValue: string | any[]): boolean => {
        if (!typeValue) {
            return false;
        }

        // Handle string values
        if (typeof typeValue === 'string') {
            const trimmedValue = typeValue.trim();

            // Check for optional syntax (ends with '?')
            if (trimmedValue.endsWith('?')) {
                return true;
            }

            // Check for standalone () - representing nil
            if (trimmedValue === '()') {
                return true;
            }

            // Check for union with () - representing nil
            if (trimmedValue.includes('()')) {
                const unionParts = trimmedValue.split('|').map(part => part.trim());
                return unionParts.some(part => part === '()');
            }

            // Check for stream<T> where T is optional
            // Pattern: stream<string?, error> or stream<int|(), string>
            if (trimmedValue.startsWith('stream<') && trimmedValue.includes('>')) {
                const streamMatch = trimmedValue.match(/^stream<(.+)>$/);
                if (streamMatch) {
                    const typeParams = streamMatch[1];
                    // Split by comma to get individual type parameters
                    const params = typeParams.split(',').map(param => param.trim());
                    // Check if the first type parameter (T) is optional
                    if (params.length > 0) {
                        const firstParam = params[0];
                        return checkTypeOptional(firstParam);
                    }
                }
            }

            return false;
        }

        // Handle array values - check if any item is optional
        if (Array.isArray(typeValue)) {
            return typeValue.some(item =>
                typeof item === 'string' && checkTypeOptional(item)
            );
        }

        return false;
    };

    const handleMakeOptional = async () => {
        const currentValue = form.getValues(field.key) || field.value || '';

        if (exprRef.current) {
            let newValue = currentValue;

            // Check if it's a stream type
            if (currentValue.startsWith('stream<') && currentValue.includes('>')) {
                const streamMatch = currentValue.match(/^stream<(.+)>$/);
                if (streamMatch) {
                    const typeParams = streamMatch[1];
                    const params = typeParams.split(',').map(param => param.trim());

                    if (params.length > 0) {
                        const firstParam = params[0];
                        // Add ? to the first type parameter if it doesn't already have one
                        if (!firstParam.endsWith('?') && !checkTypeOptional(firstParam)) {
                            const modifiedFirstParam = firstParam + '?';
                            params[0] = modifiedFirstParam;
                            newValue = `stream<${params.join(', ')}>`;
                        }
                    }
                }
            } else if (!currentValue.toString().endsWith('?')) {
                // For non-stream types, add ? at the end
                newValue = currentValue + '?';
            }

            // Only update if the value actually changed
            if (newValue !== currentValue) {
                // Update the form value using setValue instead of onChange
                form.setValue(field.key, newValue, { shouldValidate: true, shouldDirty: true });

                // Update the expression editor value directly
                if (exprRef.current.inputElement) {
                    exprRef.current.inputElement.value = newValue;
                }

                // Move cursor to the end
                const newCursorPosition = newValue.length;
                cursorPositionRef.current = newCursorPosition;

                setIsTypeOptional(true);
            }
        }
    };

    const handleCodeActionClick = () => {
        setIsCodeActionMenuOpen(prev => !prev);
    };

    const handleCodeActionClose = () => {
        setIsCodeActionMenuOpen(false);
    };

    const handleFocus = async (value: string) => {
        setFocused(true);
        // Trigger actions on focus
        await onFocus?.();
        await retrieveVisibleTypes(value, value.length, true, field.types, field.key);
        handleOnFieldFocus?.(field.key);
    };

    const handleBlur = async () => {
        setFocused(false);
        // Trigger actions on blur
        await onBlur?.();
        setShowDefaultCompletion(undefined);
        // Clean up memory
        cursorPositionRef.current = undefined;
    };

    const handleCompletionSelect = async (value: string) => {
        // Trigger actions on completion select
        await onCompletionItemSelect?.(value, field.key);

        // Set cursor position
        const cursorPosition = exprRef.current?.shadowRoot?.querySelector('textarea')?.selectionStart;
        cursorPositionRef.current = cursorPosition;
        setShowDefaultCompletion(false);
    };

    const handleCancel = () => {
        onCancel?.();
        handleChangeTypeHelperState(false);
        setShowDefaultCompletion(false);
    }

    const handleDefaultCompletionSelect = (value: string | NodeProperties) => {
        openRecordEditor(true, value);
        handleCancel();
    }

    const handleTypeEdit = (value: string) => {
        handleOnTypeChange && handleOnTypeChange(value);
    };

    const debouncedTypeEdit = debounce(handleTypeEdit, 300);

    const handleChangeTypeHelperState = (isOpen: boolean) => {
        setIsTypeHelperOpen(isOpen);
    };

    const toggleTypeHelperPaneState = () => {
        if (!isTypeHelperOpen) {
            exprRef.current?.focus();
        } else {
            handleChangeTypeHelperState(false);
        }
    };

    const handleGetTypeHelper = (
        value: string,
        onChange: (value: string, updatedCursorPosition: number) => void,
        helperPaneHeight: HelperPaneHeight
    ) => {
        return getTypeHelper(
            field.key,
            field.types,
            typeBrowserRef,
            value,
            cursorPositionRef.current,
            isTypeHelperOpen,
            onChange,
            handleChangeTypeHelperState,
            helperPaneHeight,
            handleCancel,
            exprRef
        );
    }

    /* Track cursor position */
    const handleSelectionChange = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return;
        }

        const range = selection.getRangeAt(0);

        if (exprRef.current?.parentElement.contains(range.startContainer)) {
            cursorPositionRef.current = exprRef.current?.inputElement?.selectionStart ?? 0;
        }
    }

    // Initialize optional type state based on field value
    useEffect(() => {
        const typeValue = typeof field.value === 'string' ? field.value : '';

        if (typeValue) {
            const isOptional = checkTypeOptional(typeValue);
            setIsTypeOptional(isOptional);

            // Check if the type is a GraphQL scalar type to show/hide checkbox
            const isScalar = isGraphQLScalarType(typeValue);
            setShowGraphqlCheckbox(isScalar);
        } else {
            // If no value, hide the checkbox
            setShowGraphqlCheckbox(false);
        }
    }, [field.value]);

    // Initialize GraphQL ID state from field
    useEffect(() => {
        if (field.isGraphqlId !== undefined) {
            setIsGraphqlId(field.isGraphqlId);
        }
    }, [field.isGraphqlId]);

    // Update form value when checkbox changes
    const handleGraphqlIdChange = (checked: boolean) => {
        setIsGraphqlId(checked);
        // Store the isGraphqlId value in a hidden form field
        form.setValue(`isGraphqlId`, checked, { shouldValidate: false, shouldDirty: true });
    };

    // Create code actions and menu items
    const createCodeActionsAndMenuItems = () => {
        const nullableAction = field.properties ? field.properties["nullableAction"] : undefined;
        if (!nullableAction) return { codeActions: [], menuItems: [] };

        const nullableProperty: PropertyModel = field.properties["nullableAction"].properties;
        const action = nullableProperty["false"]?.value;

        const codeActions = !isTypeOptional && action ? [{
            title: action,
            onClick: async () => {
                handleMakeOptional();
                handleCodeActionClose();
            }
        }] : [];

        const menuItems: React.ReactNode[] = [];
        codeActions.forEach((item, index) => {
            const menuItem: Item = {
                id: `${item.title}-${index}`,
                label: item.title,
                onClick: item.onClick
            }
            menuItems.push(
                <MenuItem
                    key={`${item.title}-${index}`}
                    sx={{ pointerEvents: "auto", userSelect: "none" }}
                    item={menuItem}
                    data-testid={`code-action-nullable-${index}`}
                />
            );
        });

        return { codeActions, menuItems };
    };

    const { codeActions, menuItems } = createCodeActionsAndMenuItems();

    useEffect(() => {
        const typeField = exprRef.current;
        if (!typeField) {
            return;
        }

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
        }
    }, [exprRef.current]);

    // Handle click outside to close code action menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (codeActionRef.current && !codeActionRef.current.contains(event.target as Node)) {
                setIsCodeActionMenuOpen(false);
            }
        };

        if (isCodeActionMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isCodeActionMenuOpen]);

    return (
        <S.Container>
            <S.HeaderContainer>
                <S.Header>
                    <S.LabelContainer>
                        <S.Label>{field.label}</S.Label>
                        {!field.optional && <RequiredFormInput />}
                    </S.LabelContainer>
                    <S.EditorMdContainer>
                        {field.documentation && <ReactMarkdown>{field.documentation}</ReactMarkdown>}
                    </S.EditorMdContainer>

                    {/* Conditional metadata rendering based on optional type state */}
                    {(() => {
                        let msg;
                        const nullableAction = field.properties ? field.properties["nullableAction"] : undefined;

                        // Check if there are any diagnostics for this field
                        const hasDiagnostics = form.formState.errors && form.formState.errors[field.key];

                        // Get current form value to check if field has content
                        const currentValue = form.watch(field.key) || field.value || '';

                        // Only show nullable action UI if there are no diagnostics, nullableAction exists, and field has a value
                        if (nullableAction && !hasDiagnostics && currentValue.trim()) {
                            const nullableProperty: PropertyModel = field.properties["nullableAction"].properties;

                            if (isTypeOptional) {
                                msg = nullableProperty["true"]?.metadata?.description || '';
                            } else {
                                msg = nullableProperty["false"]?.metadata?.description || '';
                            }

                            return (
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '2px' }} ref={codeActionRef}>
                                    {!isTypeOptional && codeActions.length > 0 && (
                                        <>
                                            <Button
                                                appearance="icon"
                                                data-testid="code-action-icon"
                                                onClick={handleCodeActionClick}
                                            >
                                                <Codicon name="lightbulb" sx={codiconStyles} />
                                            </Button>
                                            {isCodeActionMenuOpen && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '100%',
                                                    left: 0,
                                                    zIndex: 1000,
                                                    backgroundColor: 'var(--vscode-menu-background)',
                                                    border: '1px solid var(--vscode-menu-border)',
                                                    borderRadius: '3px',
                                                    boxShadow: '0 2px 8px var(--vscode-widget-shadow)',
                                                    minWidth: '150px'
                                                }}>
                                                    <Menu
                                                        sx={{
                                                            background: 'transparent',
                                                            boxShadow: 'none',
                                                            padding: 0,
                                                            border: 'none'
                                                        }}
                                                    >
                                                        {menuItems}
                                                    </Menu>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    <S.DefaultValue>
                                        {msg}
                                    </S.DefaultValue>

                                </div>
                            );

                        } else {
                            return null;
                        }
                    })()
                    }
                </S.Header>
                {getFieldTypeLabel(field.types) &&
                    <S.Type
                        isVisible={focused}
                        title={getFieldTypeLabel(field.types)}
                    >
                        {sanitizeType(getFieldTypeLabel(field.types))}
                    </S.Type>
                }
            </S.HeaderContainer>
            <Controller
                control={control}
                name={field.key}
                defaultValue={field.value}
                rules={{
                    required: buildRequiredRule({ isRequired: !field.optional, label: field.label })
                }}
                render={({ field: { name, value, onChange }, fieldState: { error } }) => {
                    onChangeRef.current = onChange;

                    return (
                        <div>
                            <FormExpressionEditor
                                key={field.key}
                                ref={exprRef}
                                anchorRef={typeBrowserRef}
                                name={name}
                                startAdornment={<EditorRibbon onClick={toggleTypeHelperPaneState} />}
                                completions={types}
                                showDefaultCompletion={showDefaultCompletion}
                                getDefaultCompletion={() => getDefaultCompletion(value)}
                                value={value}
                                ariaLabel={field.label}
                                onChange={async (updatedValue: string, updatedCursorPosition: number) => {
                                    if (updatedValue === value) {
                                        return;
                                    }

                                    onChange(updatedValue);
                                    debouncedTypeEdit(updatedValue);
                                    cursorPositionRef.current = updatedCursorPosition;

                                    // Check if type is optional and update state
                                    const isOptional = checkTypeOptional(updatedValue);
                                    setIsTypeOptional(isOptional);

                                    // Check if the new type is a GraphQL scalar type
                                    const isScalar = isGraphQLScalarType(updatedValue);
                                    setShowGraphqlCheckbox(isScalar);

                                    // If the type is not a scalar, reset the GraphQL ID checkbox
                                    if (!isScalar) {
                                        setIsGraphqlId(false);
                                        form.setValue(`isGraphqlId`, false, { shouldValidate: false, shouldDirty: true });
                                    }

                                    // Set show default completion
                                    const typeExists = referenceTypes.find((type) => type.label === updatedValue);

                                    // disabling expression editor diagnostics for type field 
                                    // as the expressionEditor/diagnstics API is currently
                                    // having a limitation on validating the type fields
                                    
                                    // if (getExpressionEditorDiagnostics) {
                                    //     const required = !field.optional;

                                    //     getExpressionEditorDiagnostics(
                                    //         (required ?? !field.optional) || updatedValue !== '',
                                    //         updatedValue,
                                    //         field.key,
                                    //         getPropertyFromFormField(field)
                                    //     );
                                    // }

                                    handleNewTypeSelected && handleNewTypeSelected(typeExists ? typeExists : updatedValue)
                                    const validTypeForCreation = updatedValue.match(/^[a-zA-Z_'][a-zA-Z0-9_]*$/);
                                    if (updatedValue && !typeExists && validTypeForCreation) {
                                        setShowDefaultCompletion(true);
                                    } else {
                                        setShowDefaultCompletion(false);
                                    }

                                    // Retrieve types
                                    await retrieveVisibleTypes(
                                        updatedValue,
                                        updatedCursorPosition,
                                        false,
                                        field.types,
                                        field.key
                                    );
                                }}
                                onCompletionSelect={handleCompletionSelect}
                                onDefaultCompletionSelect={() => handleDefaultCompletionSelect(value)}
                                onFocus={() => handleFocus(value)}
                                enableExIcon={false}
                                isHelperPaneOpen={isTypeHelperOpen}
                                changeHelperPaneState={handleChangeTypeHelperState}
                                getHelperPane={handleGetTypeHelper}
                                helperPaneOrigin={typeHelperOrigin}
                                helperPaneHeight={typeHelperHeight}
                                onBlur={handleBlur}
                                onSave={onSave}
                                onCancel={handleCancel}
                                placeholder={field.placeholder}
                                autoFocus={autoFocus}
                                sx={{ paddingInline: '0' }}
                                helperPaneZIndex={40001}
                            />
                            {error?.message && <ErrorBanner errorMsg={error.message.toString()} />}

                            {/* GraphQL ID Checkbox - only shown for scalar types */}
                            {showGraphqlCheckbox ? (
                                    <div style={{ marginBottom: '8px', marginTop: '8px' }}>
                                        <CheckBoxBoxGroup>
                                            <CheckBox
                                                label=""
                                                checked={isGraphqlId}
                                                onChange={(checked) => handleGraphqlIdChange(checked)}
                                                data-testid="graphql-id-checkbox"
                                            />
                                            <CheckBoxLabelGroup>
                                                <CheckBoxLabel>ID Type</CheckBoxLabel>
                                                <CheckBoxDescription>
                                                    Mark this field as a GraphQL ID type
                                                </CheckBoxDescription>
                                            </CheckBoxLabelGroup>
                                        </CheckBoxBoxGroup>
                                    </div>
                                ) : null
                            }
                        </div>
                    );
                }}
            />
        </S.Container>
    );
}
