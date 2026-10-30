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
import { canOfferTypeCreation } from "./typeCreationGate";
import { SyntaxToggles } from "./SyntaxToggles";
import { parseTypeShape, printTypeShape, toggleTypeModifier, TypeModifier } from "./typeModifiers";

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
    openRecordEditor?: (open: boolean, newType?: string | NodeProperties) => void;
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

// Only nil is offered here: a GraphQL type is a list by what the user types, and an error is set apart from the type.
const NULLABLE_ONLY: readonly TypeModifier[] = ["nullable"];

/** The text the user typed without the trailing `?` the non-null toggle stands for. */
const withoutTypedNil = (text: string): string => {
    const trimmed = text.trimEnd();
    return trimmed.endsWith("?") ? trimmed.slice(0, -1) : text;
};

/**
 * What the non-null toggle tells the user, in GraphQL's words: GraphQL reads a type the other way round from
 * Ballerina, so a Ballerina `T` is the non-null `T!` and a `T?` is the nullable `T`.
 */
const getNonNullInfo = (field: FormField, nonNull: boolean): { title: string; description: string } => {
    const messages: PropertyModel | undefined = field.properties?.["nullableAction"]?.properties;
    const stated = messages?.[nonNull ? "false" : "true"]?.metadata?.description;
    return nonNull
        ? { title: "Non-null (!)", description: `${stated ?? "The value is never null"}. Turn off to allow null.` }
        : { title: "Nullable", description: `${stated ?? "The value can be null"}. Turn on to make it non-null (!).` };
};

// The expression editor places an end adornment beside its box, not inside it, so the non-null toggle is laid over
// the end of the box's first line instead, with room kept for it in the text.
const TypeInputContainer = styled.div`
    position: relative;

    vscode-text-area::part(control) {
        padding-right: 28px;
    }
`;

const InlineToggles = styled.div`
    position: absolute;
    top: 0;
    bottom: 0;
    right: 6px;
    display: flex;
    align-items: center;
    z-index: 1;
`;

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
    const onChangeRef = useRef<((value: string) => void) | null>(null);

    const cursorPositionRef = useRef<number | undefined>(undefined);
    const [showDefaultCompletion, setShowDefaultCompletion] = useState<boolean>(false);
    const [focused, setFocused] = useState<boolean>(false);
    const [isGraphqlId, setIsGraphqlId] = useState<boolean>(field.isGraphqlId || false);
    const [showGraphqlCheckbox, setShowGraphqlCheckbox] = useState<boolean>(false);

    const [isTypeHelperOpen, setIsTypeHelperOpen] = useState<boolean>(false);

    // The field shows its type without the `?` and offers a non-null toggle in its place. GraphQL types are nullable
    // unless marked non-null, so a new type starts nullable; the choice is kept while the field is empty, as there is
    // no type to hold it.
    const [nullableWhileEmpty, setNullableWhileEmpty] = useState<boolean>(() => {
        const initial = typeof field.value === "string" ? field.value : "";
        return initial.trim() ? parseTypeShape(initial, NULLABLE_ONLY).nullable : true;
    });
    // What the user is typing, shown as typed until the field is left; it only stands for the type this field last
    // wrote, so a type changed from elsewhere is shown as it is.
    const [draft, setDraft] = useState<string | undefined>(undefined);
    const lastWritten = useRef<string | undefined>(undefined);

    const handleFocus = async (value: string) => {
        setFocused(true);
        // Trigger actions on focus
        await onFocus?.();
        await retrieveVisibleTypes(value, value.length, true, field.types, field.key);
        handleOnFieldFocus?.(field.key);
    };

    const handleBlur = async () => {
        setFocused(false);
        setDraft(undefined);
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
        openRecordEditor?.(true, value);
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

    // Initialize the GraphQL ID checkbox state based on field value
    useEffect(() => {
        const typeValue = typeof field.value === 'string' ? field.value : '';

        if (typeValue) {
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

    // Show the GraphQL ID checkbox for scalar types only, and clear it when the type stops being one
    const updateGraphqlIdState = (updatedValue: string) => {
        const isScalar = isGraphQLScalarType(updatedValue);
        setShowGraphqlCheckbox(isScalar);
        if (!isScalar) {
            setIsGraphqlId(false);
            form.setValue(`isGraphqlId`, false, { shouldValidate: false, shouldDirty: true });
        }
    };


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

                    const shape = parseTypeShape(value ?? "", NULLABLE_ONLY);
                    const nullable = shape.base ? shape.nullable : nullableWhileEmpty;
                    const shownValue = draft !== undefined && lastWritten.current === value
                        ? draft
                        : printTypeShape({ ...shape, nullable: false });

                    const writeType = (fieldType: string) => {
                        lastWritten.current = fieldType;
                        onChange(fieldType);
                        updateGraphqlIdState(fieldType);
                    };

                    const handleNonNullToggle = () => {
                        setNullableWhileEmpty(!nullable);
                        if (shape.base) {
                            const fieldType = toggleTypeModifier(value, "nullable", !nullable, NULLABLE_ONLY);
                            writeType(fieldType);
                            handleTypeEdit(fieldType);
                        }
                    };

                    return (
                        <div>
                            <TypeInputContainer>
                                <FormExpressionEditor
                                    key={field.key}
                                    ref={exprRef}
                                    anchorRef={typeBrowserRef}
                                    name={name}
                                    startAdornment={<EditorRibbon onClick={toggleTypeHelperPaneState} />}
                                    completions={types}
                                    showDefaultCompletion={canOfferTypeCreation(showDefaultCompletion, openRecordEditor)}
                                    getDefaultCompletion={() => getDefaultCompletion(shownValue)}
                                    value={shownValue}
                                    ariaLabel={field.label}
                                    onChange={async (updatedValue: string, updatedCursorPosition: number) => {
                                        if (updatedValue === shownValue) {
                                            return;
                                        }

                                        // A `?` typed at the end is taken over by the toggle, and the toggle's choice
                                        // decorates whatever is typed.
                                        const typed = parseTypeShape(updatedValue, NULLABLE_ONLY);
                                        if (typed.nullable) {
                                            setNullableWhileEmpty(true);
                                        }
                                        const fieldType = typed.base
                                            ? printTypeShape({ ...typed, nullable: nullable || typed.nullable })
                                            : "";
                                        setDraft(withoutTypedNil(updatedValue));
                                        writeType(fieldType);
                                        debouncedTypeEdit(fieldType);
                                        cursorPositionRef.current = updatedCursorPosition;

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
                                    onDefaultCompletionSelect={() => handleDefaultCompletionSelect(shownValue)}
                                    onFocus={() => handleFocus(shownValue)}
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
                                <InlineToggles>
                                    <SyntaxToggles
                                        tooltipPosition="bottom-start"
                                        items={[{
                                            id: "non-null",
                                            glyph: "!",
                                            ...getNonNullInfo(field, !nullable),
                                            pressed: !nullable,
                                            onToggle: handleNonNullToggle
                                        }]}
                                    />
                                </InlineToggles>
                            </TypeInputContainer>
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
