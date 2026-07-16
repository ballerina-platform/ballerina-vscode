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

import React, { useEffect, useRef, useState } from 'react';
import { Control, Controller, FieldValues, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import styled from '@emotion/styled';
import {
    Button,
    Codicon,
    CompletionItem,
    ErrorBanner,
    FormExpressionEditorRef,
    HelperPaneHeight,
    Icon,
    RequiredFormInput,
    ThemeColors
} from '@wso2/ui-toolkit';
import { LinkButton } from "@wso2/ui-toolkit/lib/components/LinkButton/LinkButton";
import { buildRequiredRule, getPropertyFromFormField, isExpandableMode, sanitizeType, toEditorMode } from './utils';
import { FormField, FormExpressionEditorProps, HelperpaneOnChangeOptions } from '../Form/types';
import { useFormContext, useFormFieldLoadingContext } from '../../context';
import {
    ExpressionProperty,
    FormDiagnostics,
    getFieldTypeLabel,
    getPrimaryInputType,
    InputType,
    LineRange,
    RecordTypeField,
    SubPanel,
    SubPanelView,
    Type
} from '@wso2/ballerina-core';
import ReactMarkdown from 'react-markdown';
import { FieldProvider } from "./FieldContext";
import { useModeSwitcherContext } from "./ModeSwitcherContext";
import ModeSwitcher from '../ModeSwitcher';
import { ExpressionField } from './ExpressionField';
import { InputMode } from './MultiModeExpressionEditor/ChipExpressionEditor/types';
import { getInputModeFromTypes } from './MultiModeExpressionEditor/ChipExpressionEditor/utils';
import { ExpandedEditor } from './ExpandedEditor';
import { SkeletonBase } from '../Skeletons/styles';

export type ContextAwareExpressionEditorProps = {
    id?: string;
    fieldKey?: string;
    fieldInputType: InputType;
    inputTypes?: InputType[];
    placeholder?: string;
    required?: boolean;
    showHeader?: boolean;
    field: FormField;
    openSubPanel?: (subPanel: SubPanel) => void;
    subPanelView?: SubPanelView;
    handleOnFieldFocus?: (key: string) => void;
    onBlur?: () => void | Promise<void>;
    autoFocus?: boolean;
    recordTypeField?: RecordTypeField;
    helperPaneZIndex?: number;
    isInExpandedMode?: boolean;
};

type diagnosticsFetchContext = {
    fetchedInitialDiagnostics: boolean;
    //TargetLineRange which initial diagnostics fetched
    diagnosticsFetchedTargetLineRange: LineRange;
}

type ExpressionEditorProps = ContextAwareExpressionEditorProps &
    FormExpressionEditorProps & {
        control: Control<FieldValues, any>;
        watch: UseFormWatch<any>;
        setValue: UseFormSetValue<FieldValues>;
        targetLineRange?: LineRange;
        fileName: string;
    };

export namespace S {
    export const Container = styled.div({
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        fontFamily: 'var(--font-family)',
        position: 'relative',
    });

    export const Ribbon = styled.div({
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

    export const TitleContainer = styled.div`
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    export const ItemContainer = styled.div`
        border: 1px solid var(--vscode-dropdown-border);
        border-radius: 4px
    `;

    export const LabelContainer = styled.div({
        display: 'block'
    });

    export const HeaderContainer = styled.div({
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        minHeight: '26px'
    });

    export const Header = styled.div({
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    });

    export const HeaderRow = styled.div({
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    });

    export const HeaderMain = styled.div({
        flex: 1,
        minWidth: 0
    });

    export const Type = styled.div<{ isVisible: boolean }>(({ isVisible }) => ({
        color: ThemeColors.PRIMARY,
        fontFamily: 'monospace',
        fontSize: '10px',
        border: `1px solid ${ThemeColors.PRIMARY}`,
        borderRadius: '999px',
        padding: '1px 6px',
        display: 'inline-block',
        verticalAlign: 'middle',
        userSelect: 'none',
        maxWidth: '120px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        opacity: 0,
        animation: `${isVisible ? 'fadeIn' : 'fadeOut'} 0.2s ease-${isVisible ? 'in' : 'out'} forwards`,
        '@keyframes fadeIn': {
            '0%': { opacity: 0 },
            '100%': { opacity: 1 }
        },
        '@keyframes fadeOut': {
            '0%': { opacity: 1 },
            '100%': { opacity: 0 }
        }
    }));

    export const Label = styled.label({
        color: 'var(--vscode-editor-foreground)',
        textTransform: 'capitalize',
        overflowWrap: 'anywhere'
    });

    export const Description = styled.div({
        color: 'var(--vscode-list-deemphasizedForeground)'
    });

    export const DataMapperBtnTxt = styled.p`
        font-size: 10px;
        margin: 0;
        color: var(--vscode-button-background);
    `;

    export const AddNewButton = styled(Button)`
        & > vscode-button {
            color: var(--vscode-textLink-activeForeground);
            border-radius: 0px;
            padding: 3px 5px;
            margin-top: 4px;
        }
        & > vscode-button > * {
            margin-right: 6px;
        }
    `;

    export const DefaultValue = styled.span`
        color: var(--vscode-input-placeholderForeground);
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
        overflow-wrap: anywhere;
    `;

    export const FieldInfoSection = styled.div({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '5px',
        flexShrink: 0
    });

    export const EditorMdContainer = styled.div`
        width: 100%;
        font-size: 13px;
        font-family: var(--vscode-font-family);
        color: var(--vscode-list-deemphasizedForeground);
        border-radius: 4px;
        margin-bottom: 0;
        overflow-wrap: anywhere;

        h1,
        h2,
        h3,
        h4,
        h5,
        h6 {
            margin: 16px 0 8px 0;
            font-family: var(--vscode-font-family);
            font-weight: normal;
            font-size: 13px;
            color: var(--vscode-list-deemphasizedForeground);
        }

        p {
            font-size: 13px;
            margin: 0;
            line-height: 1.5;
            font-family: var(--vscode-font-family);
            color: var(--vscode-list-deemphasizedForeground);
        }

        code {
            background-color: var(--vscode-textPreformat-background);
            border-radius: 3px;
            padding: 2px 4px;
            color: var(--vscode-textPreformat-foreground);
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }

        pre {
            background-color: var(--vscode-textPreformat-background);
            color: var(--vscode-textPreformat-foreground);
            border-radius: 4px;
            padding: 12px;
            margin: 8px 0;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            line-height: 1.4;
        }

        ul,
        ol {
            margin: 8px 0;
            padding-left: 24px;
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }

        li {
            margin: 4px 0;
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }

        blockquote {
            margin: 8px 0;
            padding-left: 8px;
            border-left: 4px solid ${ThemeColors.PRIMARY};
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }

        table {
            border-collapse: collapse;
            width: 100%;
            margin: 8px 0;
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }

        th,
        td {
            border: 1px solid var(--vscode-editor-inactiveSelectionBackground);
            padding: 8px;
            text-align: left;
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }

        th {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }
    `;
}

export const ContextAwareExpressionEditor = (props: ContextAwareExpressionEditorProps) => {
    const { form, expressionEditor, targetLineRange, fileName } = useFormContext();

    return (
        <ExpressionEditor
            fileName={fileName}
            targetLineRange={targetLineRange}
            helperPaneZIndex={props.helperPaneZIndex}
            {...form}
            {...expressionEditor}
            {...props}
        />
    );
};

export const DataMapperJoinClauseRhsEditor = (props: ContextAwareExpressionEditorProps) => {
    const { form, expressionEditor, targetLineRange, fileName } = useFormContext();

    const modifiedExpressionEditor = {
        ...expressionEditor
    };

    modifiedExpressionEditor.retrieveCompletions = async (value: string, property: ExpressionProperty, offset: number, triggerCharacter?: string) => {
        const varName = form.watch('name');
        const expression = form.watch('expression');
        const prefixExpr = `from var ${varName} in ${expression} select `;
        return await expressionEditor.retrieveCompletions(prefixExpr + value, property, prefixExpr.length + offset, triggerCharacter);
    }

    modifiedExpressionEditor.getExpressionEditorDiagnostics = async (
        showDiagnostics: boolean,
        expression: string,
        key: string,
        property: ExpressionProperty
    ) => {
        const varName = form.watch('name');
        const joinExpression = form.watch('expression');
        const prefixExpr = `from var ${varName} in ${joinExpression} select `;
        return await expressionEditor.getExpressionEditorDiagnostics(
            showDiagnostics,
            prefixExpr + expression,
            key,
            property
        );
    }

    return (
        <ExpressionEditor
            fileName={fileName}
            targetLineRange={targetLineRange}
            helperPaneZIndex={props.helperPaneZIndex}
            {...form}
            {...modifiedExpressionEditor}
            {...props}
        />
    );
};


export const ExpressionEditor = (props: ExpressionEditorProps) => {
    const {
        autoFocus,
        control,
        field,
        fieldInputType,
        id,
        placeholder,
        required,
        showHeader = true,
        watch,
        setValue,
        fieldKey,
        completions,
        triggerCharacters,
        retrieveCompletions,
        extractArgsFromFunction,
        getExpressionEditorDiagnostics,
        getHelperPane,
        onFocus,
        onBlur,
        onCompletionItemSelect,
        onSave,
        onCancel,
        onRemove,
        handleOnFieldFocus,
        onOpenRecordConfigPage,
        targetLineRange,
        fileName,
        helperPaneHeight,
        recordTypeField,
        helperPaneZIndex,
        growRange = { start: 1, offset: 9 },
        rawExpression, // original expression
        sanitizedExpression // sanitized expression that will be rendered in the editor
    } = props as ExpressionEditorProps;

    const key = fieldKey ?? field.key;
    const readOnly = field.editable === false;
    const [focused, setFocused] = useState<boolean>(false);
    const [formDiagnostics, setFormDiagnostics] = useState(field.diagnostics);
    const [isExpandedModalOpen, setIsExpandedModalOpen] = useState(false);

    // Update formDiagnostics when field.diagnostics changes
    useEffect(() => {
        setFormDiagnostics(field.diagnostics);
    }, [field.diagnostics]);



    // If Form directly  calls ExpressionEditor without setting targetLineRange and fileName through context
    const { targetLineRange: contextTargetLineRange, fileName: contextFileName } = useFormContext();
    const effectiveTargetLineRange = targetLineRange ?? contextTargetLineRange;
    const effectiveFileName = fileName ?? contextFileName;

    if (field.placeholder === 'object {}' || field.placeholder === '""') {
        field.placeholder = '';
    }

    const [isHelperPaneOpen, setIsHelperPaneOpen] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    /* Define state to retrieve helper pane data */

    const { registerLoading, unregisterLoading } = useFormFieldLoadingContext();
    const loadingIdRef = useRef<string>(`expr-${key}-${Math.random().toString(36).slice(2, 8)}`);

    useEffect(() => {
        const id = loadingIdRef.current;
        if (isLoading) {
            registerLoading(id);
        } else {
            unregisterLoading(id);
        }
        return () => {
            unregisterLoading(id);
        };
    }, [isLoading, registerLoading, unregisterLoading]);

    const exprRef = useRef<FormExpressionEditorRef>(null);
    const anchorRef = useRef<HTMLDivElement>(null);

    // This guard is here because the IF form and Match forms
    //  does not populate the context value since they use expressionEditor 
    // component directly instead of going through the FieldFactory. 
    // This should ideally be handled as followes.
    //  1.) Refactor IF and Match forms to use FieldFactory component
    //  and LS property models
    //  2.) Remove this guard and make sure all the usages of ExpressionEditor 
    // are wrapped with ModeSwitcherContext provider
    const modeSwitcherContext = useModeSwitcherContext() ?? {
        inputMode: InputMode.EXP,
        isModeSwitcherEnabled: false,
        isRecordTypeField: false,
        onModeChange: () => { },
        types: undefined
    };

    const { inputMode } = modeSwitcherContext;

    const isPromptWithDiagnostics = inputMode === InputMode.PROMPT && key !== 'role' && key !== 'instructions';

    // Use to fetch initial diagnostics
    const previousDiagnosticsFetchContext = useRef<diagnosticsFetchContext>({
        fetchedInitialDiagnostics: false,
        diagnosticsFetchedTargetLineRange: undefined
    });
    const fieldValue = (inputMode === InputMode.PROMPT || inputMode === InputMode.TEMPLATE) && rawExpression ? rawExpression(watch(key)) : watch(key);

    // Initial render
    useEffect(() => {
        if (!targetLineRange) return;
        if (readOnly) return;
        // Fetch initial diagnostics
        if (getExpressionEditorDiagnostics && fieldValue !== undefined
            && (inputMode === InputMode.EXP || inputMode === InputMode.TEMPLATE || isPromptWithDiagnostics)
            && (previousDiagnosticsFetchContext.current.fetchedInitialDiagnostics === false
                || previousDiagnosticsFetchContext.current.diagnosticsFetchedTargetLineRange !== targetLineRange
            )) {
            previousDiagnosticsFetchContext.current = {
                fetchedInitialDiagnostics: true,
                diagnosticsFetchedTargetLineRange: targetLineRange
            };
            // Only validate on initial render if the field has a non-empty value
            getExpressionEditorDiagnostics(
                fieldValue !== '',
                fieldValue,
                key,
                getPropertyFromFormField(field)
            );
        }
    }, [fieldValue, targetLineRange]);

    const handleFocus = async (controllerOnChange?: (value: string) => void) => {
        setFocused(true);

        // If in guided mode with recordTypeField, open ConfigureRecordPage directly
        if (inputMode === InputMode.RECORD && recordTypeField && onOpenRecordConfigPage) {
            const currentValue = watch(key) || '';
            // Create onChange callback that updates the form value
            const onChangeCallback = (value: string) => {
                if (controllerOnChange) {
                    controllerOnChange(value);
                } else {
                    setValue(key, value);
                }
            };
            onOpenRecordConfigPage(key, currentValue, recordTypeField, onChangeCallback);
            return;
        }

        // Trigger actions on focus
        await onFocus?.();
        handleOnFieldFocus?.(key);
    };

    const handleBlur = async () => {
        setFocused(false);
        await onBlur?.();
    };

    const handleCompletionSelect = async (value: string, item: CompletionItem) => {
        await onCompletionItemSelect?.(value, key, item.additionalTextEdits);
    };

    const handleChangeHelperPaneState = (isOpen: boolean) => {
        setIsHelperPaneOpen(isOpen);
    };

    const handleSave = async (value: string) => {
        let valueToBeSaved = value;
        if (inputMode === InputMode.TEXT) {
            valueToBeSaved = `\"${value}\"`;
        }
        onSave?.(valueToBeSaved);
    }

    const toggleHelperPaneState = () => {
        if (!isHelperPaneOpen) {
            exprRef.current?.focus();
        } else {
            handleChangeHelperPaneState(false);
        }
    };

    const handleGetHelperPane = (
        value: string,
        onChange: (value: string, options?: HelperpaneOnChangeOptions) => void,
        helperPaneHeight: HelperPaneHeight
    ) => {
        return getHelperPane?.(
            key,
            exprRef,
            anchorRef,
            field.placeholder,
            value,
            onChange,
            handleChangeHelperPaneState,
            helperPaneHeight,
            recordTypeField,
            field.type === "LV_EXPRESSION",
            field.types,
            inputMode,
        );
    };

    const handleExtractArgsFromFunction = async (value: string, cursorPosition: number) => {
        return await extractArgsFromFunction(value, getPropertyFromFormField(field), cursorPosition);
    };

    const handleOpenExpandedMode = () => {
        setIsExpandedModalOpen(true);
    };

    const handleSaveExpandedMode = (value: string) => {
        setValue(key, value);
        if (field.onValueChange) {
            field.onValueChange(value);
        }
    };

    const onOpenExpandedMode = !props.isInExpandedMode && isExpandableMode(inputMode)
        ? handleOpenExpandedMode
        : undefined;

    const documentation = field.documentation
        ? field.documentation.endsWith('.')
            ? field.documentation
            : `${field.documentation}.`
        : '';

    const modeSwitcherNode = modeSwitcherContext?.isModeSwitcherEnabled ? (
        <S.FieldInfoSection>
            {isLoading ? (
                <SkeletonBase height="24px" width="112px" style={{ borderRadius: '2px', marginTop: '2px' }} />
            ) : (
                <ModeSwitcher
                    fieldKey={field.key}
                    value={modeSwitcherContext.inputMode}
                    isRecordTypeField={modeSwitcherContext.isRecordTypeField}
                    onChange={modeSwitcherContext.onModeChange}
                    types={modeSwitcherContext.types}
                />
            )}
        </S.FieldInfoSection>
    ) : null;

    return (
        <FieldProvider
            initialField={props.field}
            triggerCharacters={props.triggerCharacters}
        >
            <S.Container
                id={id}
                data-testid={`ex-editor-${field.key}`}
            >
                {showHeader && (
                    <S.Header>
                        {field.label && (
                            <S.HeaderContainer>
                                {isLoading ? (
                                    <SkeletonBase height="14px" width="40%" />
                                ) : (
                                    <S.LabelContainer>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <S.Label>{field.label}</S.Label>
                                            {readOnly && (
                                                <span title="Read only" style={{ display: 'inline-flex' }}>
                                                    <Icon name="bi-lock" iconSx={{ fontSize: "14px" }} sx={{ color: 'var(--vscode-list-deemphasizedForeground)' }} />
                                                </span>
                                            )}
                                        </span>
                                        {(field.defaultValue && field.defaultValue?.trim() !== "()" && field.defaultValue?.trim() !== "object {}") && <S.DefaultValue style={{ marginLeft: '8px' }}>{`(Default: ${field.defaultValue}) `}</S.DefaultValue>}
                                        {(required ?? !field.optional) && <RequiredFormInput />}
                                        {getFieldTypeLabel(field.types) && (
                                            <S.Type style={{ marginLeft: '5px' }} isVisible={focused} title={getFieldTypeLabel(field.types)}>
                                                {sanitizeType(getFieldTypeLabel(field.types))}
                                            </S.Type>
                                        )}
                                    </S.LabelContainer>
                                )}
                                {!documentation && modeSwitcherNode}
                            </S.HeaderContainer>
                        )}
                        {(documentation || !field.label) && (
                            <S.HeaderRow>
                                <S.HeaderMain>
                                    {isLoading ? (
                                        documentation ? <SkeletonBase height="13px" width="80%" /> : null
                                    ) : (
                                        <S.EditorMdContainer>
                                            {documentation && <ReactMarkdown>{documentation}</ReactMarkdown>}
                                        </S.EditorMdContainer>
                                    )}
                                </S.HeaderMain>
                                {modeSwitcherNode}
                            </S.HeaderRow>
                        )}
                    </S.Header>
                )}
                <Controller
                    control={control}
                    name={key}
                    rules={(() => {
                        const expressionSetType = field.types?.find(t => t.fieldType === "EXPRESSION_SET" || t.fieldType === "TEXT_SET");
                        const patternType = field.types?.find(t => t.pattern);
                        const rules: any = {};

                        // Only use 'required' if there's no pattern validation (pattern will handle empty values)
                        if (!patternType?.pattern && !expressionSetType?.pattern) {
                            const effectiveRequired = required ?? !field.optional;
                            rules.required = buildRequiredRule({
                                isRequired: !!effectiveRequired,
                                label: field.label
                            });
                        }

                        if (expressionSetType?.pattern) {
                            // For EXPRESSION_SET or TEXT_SET (arrays), validate each item
                            rules.validate = {
                                pattern: (value: any) => {
                                    try {
                                        if (!Array.isArray(value)) return true;

                                        const regex = new RegExp(expressionSetType.pattern);
                                        for (const item of value) {
                                            if (!regex.test(item)) {
                                                return expressionSetType.patternErrorMessage || "Invalid format";
                                            }
                                        }
                                        return true;
                                    } catch (error) {
                                        console.error(`[${key}] Invalid regex pattern:`, expressionSetType.pattern, error);
                                        return true; // Skip validation if regex is invalid
                                    }
                                },
                                minItems: (value: any) => {
                                    if (!Array.isArray(value)) return true;
                                    const minItems = expressionSetType.minItems ?? 0;
                                    if (minItems > 0 && value.length < minItems) {
                                        return `At least ${minItems} ${minItems > 1 ? 'items are' : 'item is'} required`;
                                    }
                                    return true;
                                }
                            };
                        } else if (patternType?.pattern) {
                            // For non-array fields, validate pattern only in TEXT mode with literal values
                            rules.validate = {
                                pattern: (value: any) => {
                                    try {
                                        const currentMode = inputMode;

                                        // Only validate in TEXT mode
                                        if (currentMode !== InputMode.TEXT) {
                                            return true;
                                        }

                                        // Skip pattern validation if value contains interpolations (e.g., ${variable})
                                        if (value && typeof value === 'string' && /\$\{[^}]*\}/.test(value)) {
                                            return true;
                                        }

                                        // Validate pattern for TEXT mode with literal values
                                        const regex = new RegExp(patternType.pattern);
                                        if (!regex.test(value || '')) {
                                            return patternType.patternErrorMessage || "Invalid format";
                                        }

                                        return true;
                                    } catch (error) {
                                        console.error(`[${key}] Invalid regex pattern:`, patternType.pattern, error);
                                        return true; // Skip validation if regex is invalid
                                    }
                                }
                            };
                        }

                        return rules;
                    })()}
                    render={({ field: { name, value, onChange }, fieldState: { error } }) => {
                        return (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                                    <div style={{ flex: 1, minWidth: 0, position: 'relative', cursor: readOnly ? 'not-allowed' : undefined }}>
                                        {isLoading && <SkeletonBase height="28px" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1, borderRadius: '2px' }} />}
                                        <div style={{ visibility: isLoading ? 'hidden' : 'visible', opacity: readOnly ? 0.7 : 1 }}>
                                            <ExpressionField
                                                field={field}
                                                inputMode={inputMode}
                                                primaryMode={getInputModeFromTypes(getPrimaryInputType(field.types))}
                                                name={name}
                                                value={value}
                                                completions={completions}
                                                fileName={effectiveFileName}
                                                targetLineRange={effectiveTargetLineRange}
                                                autoFocus={recordTypeField ? false : autoFocus}
                                                sanitizedExpression={(inputMode === InputMode.PROMPT || inputMode === InputMode.TEMPLATE) ? sanitizedExpression : undefined}
                                                rawExpression={(inputMode === InputMode.PROMPT || inputMode === InputMode.TEMPLATE) ? rawExpression : undefined}
                                                ariaLabel={field.label}
                                                placeholder={placeholder}
                                                onChange={async (updatedValue: string | any[] | Record<string, unknown>, updatedCursorPosition: number) => {

                                                    // clear field diagnostics
                                                    setFormDiagnostics([]);
                                                    // Use ref to get current mode (not stale closure value)
                                                    const currentMode = inputMode;
                                                    const rawValue = (currentMode === InputMode.PROMPT || currentMode === InputMode.TEMPLATE) &&
                                                        rawExpression ? rawExpression(typeof updatedValue === 'string' ? updatedValue : JSON.stringify(updatedValue)) : updatedValue;

                                                    onChange(rawValue);
                                                    if (getExpressionEditorDiagnostics && (currentMode === InputMode.EXP || currentMode === InputMode.TEMPLATE || isPromptWithDiagnostics)) {
                                                        getExpressionEditorDiagnostics(
                                                            (required ?? !field.optional) || updatedValue !== '',
                                                            typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue),
                                                            key,
                                                            getPropertyFromFormField(field)
                                                        );
                                                    }

                                                    // Check if the current character is a trigger character
                                                    const triggerCharacter =
                                                        updatedCursorPosition > 0
                                                            ? triggerCharacters.find((char) => updatedValue[updatedCursorPosition - 1] === char)
                                                            : undefined;
                                                    if (triggerCharacter) {
                                                        await retrieveCompletions(
                                                            typeof updatedValue === 'string' ? updatedValue : JSON.stringify(updatedValue),
                                                            getPropertyFromFormField(field),
                                                            updatedCursorPosition,
                                                            triggerCharacter
                                                        );
                                                    } else {
                                                        await retrieveCompletions(
                                                            typeof updatedValue === 'string' ? updatedValue : JSON.stringify(updatedValue),
                                                            getPropertyFromFormField(field),
                                                            updatedCursorPosition
                                                        );
                                                    }
                                                }}
                                                extractArgsFromFunction={handleExtractArgsFromFunction}
                                                onCompletionSelect={handleCompletionSelect}
                                                onFocus={async () => {
                                                    handleFocus(onChange);
                                                }}
                                                onBlur={handleBlur}
                                                onSave={handleSave}
                                                onCancel={onCancel}
                                                isHelperPaneOpen={isHelperPaneOpen}
                                                changeHelperPaneState={handleChangeHelperPaneState}
                                                getHelperPane={handleGetHelperPane}
                                                helperPaneHeight={helperPaneHeight}
                                                helperPaneWidth={recordTypeField ? 400 : undefined}
                                                growRange={growRange}
                                                helperPaneZIndex={helperPaneZIndex}
                                                exprRef={exprRef}
                                                anchorRef={anchorRef}
                                                onToggleHelperPane={toggleHelperPaneState}
                                                onOpenExpandedMode={onOpenExpandedMode}
                                                isInExpandedMode={isExpandedModalOpen}
                                                onLoadingStateChange={setIsLoading}
                                                onNormalizeValue={(normalizedValue: string) => {
                                                    setValue(key, normalizedValue, { shouldDirty: false, shouldValidate: true });
                                                }}
                                                disabled={readOnly}
                                            />
                                        </div>
                                    </div>
                                    {onRemove && (
                                        <Button
                                            appearance="icon"
                                            onClick={onRemove}
                                            tooltip="Remove"
                                            sx={{ marginTop: '2px', flexShrink: 0 }}
                                        >
                                            <Codicon name="trash" sx={{ color: ThemeColors.ERROR }} />
                                        </Button>
                                    )}
                                </div>
                                {error ?
                                    <ErrorBanner errorMsg={error.message.toString()} /> :
                                    formDiagnostics && formDiagnostics.length > 0 &&
                                    <ErrorBanner errorMsg={formDiagnostics.map(d => d.message).join('\n')} />
                                }
                                {field.actionCallback && (
                                    <LinkButton
                                        onClick={field.actionCallback}
                                        sx={{ padding: "4px 6px", margin: 0, marginTop: "6px", fontSize: "13px" }}
                                    >
                                        {field.actionLabel}
                                    </LinkButton>
                                )}
                                {onOpenExpandedMode && toEditorMode(inputMode) && (
                                    <ExpandedEditor
                                        isOpen={isExpandedModalOpen}
                                        field={field}
                                        value={watch(key)}
                                        onChange={async (updatedValue: string, updatedCursorPosition: number) => {

                                            // clear field diagnostics
                                            setFormDiagnostics([]);
                                            // Use ref to get current mode (not stale closure value)
                                            const currentMode = inputMode;
                                            const rawValue = (currentMode === InputMode.PROMPT || currentMode === InputMode.TEMPLATE) && rawExpression ? rawExpression(updatedValue) : updatedValue;

                                            onChange(rawValue);
                                            if (getExpressionEditorDiagnostics && (inputMode === InputMode.EXP || inputMode === InputMode.TEMPLATE || isPromptWithDiagnostics)) {
                                                getExpressionEditorDiagnostics(
                                                    (required ?? !field.optional) || rawValue !== '',
                                                    rawValue,
                                                    key,
                                                    getPropertyFromFormField(field)
                                                );
                                            }

                                            // Check if the current character is a trigger character
                                            const triggerCharacter =
                                                updatedCursorPosition > 0
                                                    ? triggerCharacters.find((char) => rawValue[updatedCursorPosition - 1] === char)
                                                    : undefined;
                                            if (triggerCharacter) {
                                                await retrieveCompletions(
                                                    rawValue,
                                                    getPropertyFromFormField(field),
                                                    updatedCursorPosition,
                                                    triggerCharacter
                                                );
                                            } else {
                                                await retrieveCompletions(
                                                    rawValue,
                                                    getPropertyFromFormField(field),
                                                    updatedCursorPosition
                                                );
                                            }
                                        }}
                                        onClose={() => {
                                            setIsExpandedModalOpen(false)
                                        }}
                                        onSave={handleSaveExpandedMode}
                                        mode={toEditorMode(inputMode)!}
                                        completions={completions}
                                        fileName={effectiveFileName}
                                        targetLineRange={effectiveTargetLineRange}
                                        sanitizedExpression={sanitizedExpression}
                                        rawExpression={rawExpression}
                                        extractArgsFromFunction={handleExtractArgsFromFunction}
                                        getHelperPane={handleGetHelperPane}
                                        error={error}
                                        formDiagnostics={formDiagnostics}
                                        inputMode={inputMode}
                                        readOnly={readOnly}
                                    />
                                )}
                            </div>
                        );
                    }}
                />
            </S.Container>
        </FieldProvider>
    );
};
