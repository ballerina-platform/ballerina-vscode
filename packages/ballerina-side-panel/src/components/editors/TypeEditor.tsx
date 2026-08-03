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
    RequiredFormInput,
    ThemeColors,
    Tooltip,
    Typography,
    CompletionItem,
} from "@wso2/ui-toolkit";
import { FormField } from "../Form/types";
import { useFormContext } from "../../context";
import { Controller } from "react-hook-form";
import { S } from "./ExpressionEditor";
import { buildRequiredRule, sanitizeType } from "./utils";
import { debounce } from "lodash";
import styled from "@emotion/styled";
import ReactMarkdown from "react-markdown";
import { getFieldTypeLabel, NodeProperties } from "@wso2/ballerina-core";
import TypeModeSwitcher, { TypeInputMode } from "../TypeModeSwitcher";

interface TypeEditorProps {
    field: FormField;
    openRecordEditor: (open: boolean, newType?: string | NodeProperties) => void;
    openFormTypeEditor?: (open: boolean, newType?: string) => void;
    handleOnFieldFocus?: (key: string) => void;
    handleOnTypeChange?: (value?: string) => void;
    handleNewTypeSelected?: (type: string | CompletionItem) => void;
    isContextTypeEditorSupported?: boolean;
    autoFocus?: boolean;
    onBlur?: () => void | Promise<void>;
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

export function TypeEditor(props: TypeEditorProps) {
    const { field,
        openRecordEditor,
        openFormTypeEditor,
        isContextTypeEditorSupported,
        handleOnFieldFocus,
        handleOnTypeChange, autoFocus,
        handleNewTypeSelected
    } = props;
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
        onCancel
    } = expressionEditor;

    const exprRef = useRef<FormExpressionEditorRef>(null);
    const typeBrowserRef = useRef<HTMLDivElement>(null);

    const cursorPositionRef = useRef<number | undefined>(undefined);
    const [showDefaultCompletion, setShowDefaultCompletion] = useState<boolean>(false);
    const [focused, setFocused] = useState<boolean>(false);
    const [isTypeEditorHovered, setIsTypeEditorHovered] = useState<boolean>(false);
    const [typeInputMode, setTypeInputMode] = useState<TypeInputMode>(isContextTypeEditorSupported ? TypeInputMode.GUIDED : undefined);
    const [formDiagnostics, setFormDiagnostics] = useState(field.diagnostics);

    const [isTypeHelperOpen, setIsTypeHelperOpen] = useState<boolean>(false);

    useEffect(() => {
        setFormDiagnostics(field.diagnostics);
    }, [field.diagnostics]);

    const handleFocus = async (value: string) => {
        setFocused(true);

        // In guided mode, open FormTypeEditor instead of TypeHelper
        if (isContextTypeEditorSupported && typeInputMode === TypeInputMode.GUIDED && openFormTypeEditor) {
            openFormTypeEditor(true, value);
            return;
        }

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
        // Trigger the on Blur from parent
        await props.onBlur?.();
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
        // In guided mode, open FormTypeEditor
        if (isContextTypeEditorSupported && typeInputMode === TypeInputMode.GUIDED && openFormTypeEditor) {
            const currentValue = form.getValues(field.key);
            openFormTypeEditor(true, currentValue);
            return;
        }

        if (!isTypeHelperOpen) {
            exprRef.current?.focus();
        } else {
            handleChangeTypeHelperState(false);
        }
    };

    const handleModeChange = (value: TypeInputMode) => {
        setTypeInputMode(value);
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

    return (
        <S.Container
            onMouseEnter={() => setIsTypeEditorHovered(true)}
            onMouseLeave={() => setIsTypeEditorHovered(false)}
        >
            <S.HeaderContainer>
                <S.Header style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px', width: '100%' }}>
                        <div style={{ flex: 1 }}>
                            <S.LabelContainer>
                                <S.Label>{field.label}</S.Label>
                                {!field.optional && <RequiredFormInput />}
                                {getFieldTypeLabel(field.types) && (
                                    <S.Type style={{ marginLeft: '5px' }} isVisible={focused} title={getFieldTypeLabel(field.types)}>
                                        {sanitizeType(getFieldTypeLabel(field.types))}
                                    </S.Type>
                                )}
                            </S.LabelContainer>
                            <S.EditorMdContainer>
                                {field.documentation && <ReactMarkdown>{field.documentation}</ReactMarkdown>}
                            </S.EditorMdContainer>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                            {(focused || isTypeEditorHovered) && isContextTypeEditorSupported && openFormTypeEditor && (
                                <TypeModeSwitcher
                                    value={typeInputMode}
                                    onChange={handleModeChange}
                                />
                            )}
                        </div>
                    </div>
                </S.Header>
            </S.HeaderContainer>
            <Controller
                control={control}
                name={field.key}
                defaultValue={field.value}
                rules={{
                    required: buildRequiredRule({ isRequired: !field.optional, label: field.label })
                }}
                render={({ field: { name, value, onChange }, fieldState: { error } }) => (
                    <div>
                        <FormExpressionEditor
                            key={field.key}
                            ref={exprRef}
                            anchorRef={typeBrowserRef}
                            name={name}
                            startAdornment={
                                (!isContextTypeEditorSupported || (isContextTypeEditorSupported
                                    && typeInputMode === TypeInputMode.ADVANCED)) ?
                                    <EditorRibbon onClick={toggleTypeHelperPaneState} /> :
                                    undefined
                            }
                            completions={types}
                            showDefaultCompletion={showDefaultCompletion}
                            getDefaultCompletion={() => getDefaultCompletion(value)}
                            value={value}
                            ariaLabel={field.label}
                            onChange={async (updatedValue: string, updatedCursorPosition: number) => {
                                if (updatedValue === value) {
                                    return;
                                }

                                setFormDiagnostics([]);
                                onChange(updatedValue);
                                debouncedTypeEdit(updatedValue);
                                field.onValueChange?.(updatedValue);
                                cursorPositionRef.current = updatedCursorPosition;

                                // Set show default completion
                                const typeExists = referenceTypes.find((type) => type.label === updatedValue);
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
                            isHelperPaneOpen={isContextTypeEditorSupported && typeInputMode === TypeInputMode.GUIDED ? false : isTypeHelperOpen}
                            changeHelperPaneState={isContextTypeEditorSupported && typeInputMode === TypeInputMode.GUIDED ? () => { } : handleChangeTypeHelperState}
                            getHelperPane={isContextTypeEditorSupported && typeInputMode === TypeInputMode.GUIDED ? () => null : handleGetTypeHelper}
                            helperPaneOrigin={typeHelperOrigin}
                            helperPaneHeight={typeHelperHeight}
                            onBlur={handleBlur}
                            onSave={onSave}
                            onCancel={handleCancel}

                            autoFocus={autoFocus}
                            sx={{ paddingInline: '0' }}
                            helperPaneZIndex={40001}
                        />
                        {error?.message && <ErrorBanner errorMsg={error.message.toString()} />}
                        {(!error?.message) && formDiagnostics && formDiagnostics.length > 0 && (
                            <ErrorBanner errorMsg={formDiagnostics.map(d => d.message).join('\n')} />
                        )}
                    </div>
                )}
            />
        </S.Container>
    );
}
