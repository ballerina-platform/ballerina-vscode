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

import React, { forwardRef, useCallback, useMemo, useEffect, useState, useRef } from "react";
import isEqual from "lodash/isEqual";
import { useForm } from "react-hook-form";
import {
    Button,
    Codicon,
    ErrorBanner,
    LinkButton,
    ThemeColors,
    SidePanelBody,
    CheckBox,
    Typography,
    CompletionItem,
    ProgressRing
} from "@wso2/ui-toolkit";
import styled from "@emotion/styled";

import { ExpressionFormField, FieldDerivation, FormExpressionEditorProps, FormField, FormImports, FormValues } from "./types";
import { FieldFactory } from "../editors/FieldFactory";
import { InputMode } from "../editors/MultiModeExpressionEditor/ChipExpressionEditor/types";
import { getValueForDropdown, isDropdownField } from "../editors/utils";
import {
    Diagnostic,
    LineRange,
    NodeKind,
    SubPanel,
    SubPanelView,
    FormDiagnostics,
    FlowNode,
    ExpressionProperty,
    RecordTypeField,
    VisualizableField,
    NodeProperties,
    VisualizerLocation,
    getPrimaryInputType,
    MACHINE_VIEW,
    EditorDisplayMode,
    Imports,
    getSecondaryInputType,
    DIRECTORY_MAP,
    AvailableNode,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { FormContext, Provider, FormFieldLoadingProvider, useFormFieldLoadingContext } from "../../context";
import {
    formatJSONLikeString,
    updateFormFieldWithImports,
    hasIncompleteRequiredFormFields,
    shouldRunExternalFormValidation,
    isPrioritizedField,
    hasRequiredParameters,
    hasOptionalParameters,
} from "./utils";
import FormDescription from "./FormDescription";
import MarkdownDescription from "./MarkdownDescription";
import TypeHelperText from "./TypeHelperText";

namespace S {
    export const Container = styled(SidePanelBody) <{ nestedForm?: boolean; compact?: boolean; footerActionButton?: boolean }>`
        display: flex;
        flex-direction: column;
        gap: ${({ compact }) => (compact ? "8px" : "20px")};
        padding: ${({ nestedForm }) => (nestedForm ? "16px 5px" : "16px")};
        height: ${({ nestedForm, footerActionButton }) => {
            if (nestedForm) return "unset";
            if (footerActionButton) return "100%";
            return "calc(100vh - 50px)";
        }};
        max-height: ${({ footerActionButton }) => footerActionButton ? "100%" : "none"};
        min-height: ${({ footerActionButton }) => footerActionButton ? "0" : "auto"};
        overflow: ${({ nestedForm, footerActionButton }) => {
            if (nestedForm) return "visible";
            if (footerActionButton) return "hidden";
            return "auto";
        }};
        position: ${({ footerActionButton }) => footerActionButton ? "relative" : "static"};
        & > :last-child {
            margin-top: ${({ compact }) => (compact ? "12px" : "0")};
        }
    `;

    export const ScrollableContent = styled.div<{}>`
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        gap: 20px;
    `;

    export const Row = styled.div<{}>`
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    `;

    // A field rendered indented under the field above it, so the two read as grouped (e.g. a
    // fixed-value input that belongs to the checkbox above it).
    export const IndentedRow = styled(Row)`
        width: calc(100% - 14px);
        margin-left: 14px;
        padding-left: 10px;
        border-left: 2px solid ${ThemeColors.OUTLINE_VARIANT};
        box-sizing: border-box;
    `;

    export const CategoryRow = styled.div<{ bottomBorder?: boolean; topBorder?: boolean }>`
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: flex-start;
        gap: 20px;
        width: 100%;
        margin-top: 8px;
        padding-bottom: ${({ bottomBorder }) => (bottomBorder ? "14px" : "0")};
        border-bottom: ${({ bottomBorder }) => (bottomBorder ? `1px solid ${ThemeColors.OUTLINE_VARIANT}` : "none")};
        padding-top: ${({ topBorder }) => (topBorder ? "14px" : "0")};
        border-top: ${({ topBorder }) => (topBorder ? `1px solid ${ThemeColors.OUTLINE_VARIANT}` : "none")};
    `;

    export const CheckboxRow = styled.div<{}>`
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        width: 100%;
    `;

    export const Footer = styled.div<{}>`
        display: flex;
        gap: 8px;
        flex-direction: row;
        justify-content: flex-end;
        align-items: center;
        margin-top: 8px;
        width: 100%;
    `;

    export const FooterActionButtonContainer = styled.div<{}>`
        position: sticky;
        bottom: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10;
        width: 100%;
    `;

    export const FooterActionButton = styled(Button)`
        width: 100% !important;
        min-width: 0 !important;
        display: flex !important;
        justify-content: center;
        align-items: center;
        height: 35px !important;
    `;

    export const TitleContainer = styled.div<{}>`
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 100%;
        margin-bottom: 8px;
    `;

    export const Title = styled.div<{}>`
        font-size: 14px;
        font-family: GilmerBold;
        text-wrap: nowrap;
        &:first {
            margin-top: 0;
        }
    `;

    export const BodyText = styled.div<{}>`
        font-size: 11px;
        opacity: 0.5;
    `;

    export const DrawerContainer = styled.div<{}>`
        width: 400px;
    `;

    export const ButtonContainer = styled.div<{}>`
        display: flex;
        flex-direction: row;
        flex-grow: 1;
        justify-content: flex-end;
    `;

    export const DataMapperRow = styled.div`
        display: flex;
        justify-content: center;
        width: 100%;
        margin: 10px 0;
    `;

    export type EditorContainerStyleProp = {
        color: string;
    };
    export const EditorContainer = styled.div<EditorContainerStyleProp>`
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        padding: 8px;
        border-radius: 4px;
        /* border: 1px solid ${(props: EditorContainerStyleProp) => props.color}; */
        position: relative;
        z-index: 1;

        &::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: ${(props: EditorContainerStyleProp) => props.color};
            opacity: 0.1;
            z-index: -1;
            border-radius: inherit;
        }
    `;

    export const UseDataMapperButton = styled(Button)`
        & > vscode-button {
            width: 250px;
            height: 30px;
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-welcomePage-tileBorder);
        }
        align-self: center;
    `;

    export const InfoLabel = styled.div`
        font-size: var(--vscode-font-size);
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    `;

    export const ActionButtonContainer = styled.div`
        display: flex;
        justify-content: flex-start;
    `;

    export const MarkdownWrapper = styled.div`
        position: relative;
        width: 100%;
        margin-bottom: -12px;
    `;

    export const FormDiagnosticsContainer = styled.div`
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
    `;

    export const FormDiagnosticsActionContainer = styled.div`
        display: flex;
        justify-content: flex-end;
        align-items: center;
        width: fit-content;
        align-self: flex-end;
    `;

    export const MarkdownContainer = styled.div<{ isExpanded: boolean }>`
        width: 100%;
        ${({ isExpanded }) =>
            !isExpanded &&
            `
            max-height: 200px;
            mask-image: linear-gradient(to bottom, black 160px, transparent 200px);
        `}
        transition: max-height 0.3s ease-in-out;
    `;

    export const ConcertContainer = styled.div`
        display: flex;
        align-items: center;
        gap: 4px;
        width: 100%;
        border-radius: 4px;
    `;

    export const ConcertMessage = styled.div`
        font-size: 13px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    `;
}
export interface FormProps {
    infoLabel?: string;
    formFields: FormField[];
    submitText?: string;
    cancelText?: string;
    actionButton?: React.ReactNode; // Action button to display at the top
    targetLineRange?: LineRange; // TODO: make them required after connector wizard is fixed
    fileName?: string; // TODO: make them required after connector wizard is fixed
    projectPath?: string;
    selectedNode?: NodeKind;
    onSubmit?: (data: FormValues, dirtyFields?: any) => void;
    onBlur?: (data: FormValues, dirtyFields?: any) => void;
    onFormValidation?: (data: FormValues, dirtyFields?: any) => Promise<boolean>;
    isSaving?: boolean;
    openRecordEditor?: (isOpen: boolean, fields: FormValues, editingField?: FormField, newType?: string | NodeProperties) => void;
    openView?: (location: VisualizerLocation) => void;
    openSubPanel?: (subPanel: SubPanel) => void;
    subPanelView?: SubPanelView;
    onCancelForm?: () => void;
    oneTimeForm?: boolean;
    expressionEditor?: FormExpressionEditorProps;
    updatedExpressionField?: ExpressionFormField;
    resetUpdatedExpressionField?: () => void;
    mergeFormDataWithFlowNode?: (data: FormValues, targetLineRange: LineRange) => FlowNode;
    handleVisualizableFields?: (filePath: string, typeName?: string) => void;
    visualizableField?: VisualizableField;
    recordTypeFields?: RecordTypeField[];
    nestedForm?: boolean;
    isInferredReturnType?: boolean;
    disableSaveButton?: boolean;
    compact?: boolean;
    concertRequired?: boolean;
    concertMessage?: string;
    formImports?: FormImports;
    popupManager?: {
        addPopup: (modal: React.ReactNode, id: string, title: string, height?: number, width?: number) => void;
        removeLastPopup: () => void;
        closePopup: (id: string) => void;
    }
    formDiagnostics?: { message: string; severity: "ERROR" | "WARNING" | "INFO" }[];
    formDiagnosticsAction?: React.ReactNode;
    preserveOrder?: boolean;
    handleSelectedTypeChange?: (type: string | CompletionItem) => void;
    scopeFieldAddon?: React.ReactNode;
    onChange?: (fieldKey: string, value: any, allValues: FormValues) => void;
    injectedComponents?: {
        component: React.ReactNode;
        index: number;
        advanced?: boolean;
    }[];
    hideSaveButton?: boolean; // Option to hide the save button
    footerActionButton?: boolean; // Render save button as footer action button
    onValidityChange?: (isValid: boolean) => void; // Callback for form validity status
    // Optional extra primary action rendered next to the save button (e.g. a "Next" that submits the
    // form but continues to a following step). Validated through the same path as save.
    secondarySubmitButton?: { text: string; onClick: (data: FormValues, dirtyFields?: any) => void };
    changeOptionalFieldTitle?: string; // Option to change the title of optional fields
    openFormTypeEditor?: (open: boolean, newType?: string, editingField?: FormField) => void;
    derivedFields?: FieldDerivation[]; // Configuration for auto-deriving field values from other fields
    updateImports?: (key: string, imports: Imports) => void;
    defaultExpandAdvanced?: boolean;
    onRequestCreateConnection?: (params: {
        selectedConnector: AvailableNode;
        onSaved: (variableName: string) => void;
    }) => void;
}

export const Form = forwardRef((props: FormProps, _ref) => {
    const {
        infoLabel,
        formFields,
        selectedNode,
        submitText,
        cancelText,
        actionButton,
        onSubmit,
        onBlur,
        onFormValidation,
        isSaving,
        onCancelForm,
        oneTimeForm,
        openRecordEditor,
        openSubPanel,
        subPanelView,
        expressionEditor,
        targetLineRange,
        fileName,
        handleVisualizableFields,
        visualizableField,
        recordTypeFields,
        nestedForm,
        popupManager,
        formDiagnostics,
        formDiagnosticsAction,
        compact = false,
        isInferredReturnType,
        concertRequired = true,
        concertMessage,
        formImports,
        preserveOrder = false,
        handleSelectedTypeChange,
        scopeFieldAddon,
        injectedComponents,
        hideSaveButton = false,
        footerActionButton = false,
        onValidityChange,
        secondarySubmitButton,
        changeOptionalFieldTitle = undefined,
        openFormTypeEditor,
        derivedFields = [],
        updateImports,
        onRequestCreateConnection,
    } = props;

    const { rpcClient } = useRpcContext();

    const {
        control,
        getValues,
        register,
        unregister,
        handleSubmit,
        reset,
        watch,
        setValue,
        setError,
        clearErrors,
        trigger,
        formState: { isValidating, isValid: formStateIsValid, errors, dirtyFields, isDirty },
    } = useForm<FormValues>();

    useEffect(() => {
        if (!fileName || !rpcClient) {
            return;
        }
        rpcClient.getBIDiagramRpcClient().formDirtyDidChange({ filePath: fileName, isDirty });
    }, [isDirty, fileName, rpcClient]);

    const [showAdvancedOptions, setShowAdvancedOptions] = useState(props.defaultExpandAdvanced ?? false);
    const [activeFormField, setActiveFormField] = useState<string | undefined>(undefined);
    const [diagnosticsInfo, setDiagnosticsInfo] = useState<FormDiagnostics[] | undefined>(undefined);
    const [isMarkdownExpanded, setIsMarkdownExpanded] = useState(false);
    const [isIdentifierEditing, setIsIdentifierEditing] = useState(false);
    const [manuallyEditedFields, setManuallyEditedFields] = useState<Set<string>>(new Set());
    const [isSubComponentEnabled, setIsSubComponentEnabled] = useState(false);
    const [optionalFieldsTitle, setOptionalFieldsTitle] = useState("Advanced Configurations");

    const markdownRef = useRef<HTMLDivElement>(null);

    const [isUserConcert, setIsUserConcert] = useState(false);
    const [savingButton, setSavingButton] = useState<string | null>(null);
    const [isValidatingForm, setIsValidatingForm] = useState(false);

    // Read parent form's loading context (present when this is a nested form)
    const parentLoadingContext = useFormFieldLoadingContext();
    const nestedFormIdRef = useRef(`nested-form-${Math.random().toString(36).slice(2)}`);

    const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());
    const registerLoading = useCallback((fieldId: string) => {
        setLoadingFields(prev => {
            const next = new Set(prev);
            next.add(fieldId);
            return next;
        });
    }, []);
    const unregisterLoading = useCallback((fieldId: string) => {
        setLoadingFields(prev => {
            if (!prev.has(fieldId)) return prev;
            const next = new Set(prev);
            next.delete(fieldId);
            return next;
        });
    }, []);
    const isFormLoading = loadingFields.size > 0;

    // Bubble loading state up to the parent form when this is a nested form
    useEffect(() => {
        if (!nestedForm) return;
        const id = nestedFormIdRef.current;
        if (isFormLoading) {
            parentLoadingContext.registerLoading(id);
        } else {
            parentLoadingContext.unregisterLoading(id);
        }
        return () => {
            parentLoadingContext.unregisterLoading(id);
        };
    }, [isFormLoading, nestedForm]);


    useEffect(() => {
        // Check if the form is a onetime usage or not. This is checked due to reset issue with nested forms in param manager
        if (!oneTimeForm) {
            // Reset form with new values when formFields change
            const defaultValues: FormValues = {};
            const diagnosticsMap: FormDiagnostics[] = [];
            const formValues = getValues();
            console.log("Existing form values: ", formValues);

            // First, preserve ALL existing form values
            Object.keys(formValues).forEach(key => {
                if (formValues[key] !== undefined && formValues[key] !== "") {
                    defaultValues[key] = formValues[key];
                }
            });

            formFields.forEach((field) => {
                // Only set field defaults if no existing value is present
                if (defaultValues[field.key] === undefined) {
                    if (field.hidden) {
                        defaultValues[field.key] = field.value;
                    } else if (isDropdownField(field)) {
                        defaultValues[field.key] = getValueForDropdown(field) ?? "";
                    } else if (field.type === "FLAG") {
                        defaultValues[field.key] = field.value;
                    } else if (typeof field.value === "string") {
                        defaultValues[field.key] = formatJSONLikeString(field.value) ?? "";
                    } else {
                        defaultValues[field.key] = field.value;
                    }
                    if (field.key === "variable") {
                        defaultValues[field.key] = formValues[field.key] ?? defaultValues[field.key] ?? "";
                    }
                    if (field.key === "parameters" && field.value?.length && field.value.length === 0) {
                        defaultValues[field.key] = formValues[field.key] ?? [];
                    }

                    // Handle choice fields and their properties
                    if (field?.choices && field.choices.length > 0) {
                        // Get the selected choice index (default to 0 if not set)
                        const selectedChoiceIndex = formValues[field.key] !== undefined ? Number(formValues[field.key]) : 0;

                        const selectedChoice = field.choices[selectedChoiceIndex];

                        if (selectedChoice && selectedChoice?.properties) {
                            Object.entries(selectedChoice.properties).forEach(([propKey, propValue]) => {
                                // Preserve existing form values if they exist, otherwise use propValue.value
                                if (formValues[propKey] !== undefined && formValues[propKey] !== "") {
                                    defaultValues[propKey] = formValues[propKey];
                                } else if (propValue?.value !== undefined && defaultValues[propKey] === undefined) {
                                    defaultValues[propKey] = propValue.value;
                                }

                                diagnosticsMap.push({ key: propKey, diagnostics: [] });
                            });
                        }
                    }

                    const rawDiag = (field.diagnostics as any);
                    const diagArray = Array.isArray(rawDiag) ? rawDiag : (rawDiag?.diagnostics ?? []);
                    diagnosticsMap.push({ key: field.key, diagnostics: diagArray });
                }

                const primaryInputType = getPrimaryInputType(field.types)?.fieldType;
                if (primaryInputType === "TYPE" || primaryInputType === "ACTION_TYPE") {
                    const existingType = formValues[field.key];
                    const newType = field.value;
                    const isValueChanged = existingType !== newType;
                    const isFieldDirty = dirtyFields?.[field.key];
                    if (isValueChanged) {
                        const newValue = isFieldDirty ? existingType : newType;
                        setValue(field.key, newValue, { shouldValidate: true, shouldDirty: false });
                        defaultValues[field.key] = newValue;
                        getVisualiableFields();
                    } else if (newType === undefined) {
                        defaultValues[field.key] = "";
                    } else {
                        defaultValues[field.key] = newType;
                    }
                }

                // Handle the case where the name is updated dynamically (e.g., from a sibling field's onValueChange like headerName)
                // Sync from field.value when it differs from form - but preserve user edits (when field was manually touched)
                if (field.key === "name" && field.value !== undefined && field.value !== null) {
                    const existingName = formValues[field.key];
                    const newName = typeof field.value === "string" ? (formatJSONLikeString(field.value) ?? field.value) : String(field.value);
                    // Only sync from field when: form is stale (external update) or user hasn't edited the name field
                    if (existingName !== newName && !dirtyFields?.[field.key]) {
                        setValue(field.key, newName, { shouldDirty: false });
                        defaultValues[field.key] = newName;
                    }
                }
            });
            setDiagnosticsInfo(diagnosticsMap);
            reset(defaultValues, { keepDirtyValues: true });

            if (changeOptionalFieldTitle) {
                setOptionalFieldsTitle("Advanced Configurations");
            }
        }
    }, [formFields, reset]);

    const handleOnSave = (data: FormValues) => {
        console.log(">>> saved form fields", { data });
        onSubmit && onSubmit(data, dirtyFields);
    };

    const canRunExternalFormValidation = (values: FormValues) => shouldRunExternalFormValidation({
        formStateIsValid,
        errors,
        hasIncompleteRequiredFields: hasIncompleteRequiredFormFields(formFields, values),
    });

    const runExternalFormValidation = async (data: FormValues): Promise<boolean> => {
        if (!onFormValidation) {
            return true;
        }

        setIsValidatingForm(true);

        try {
            const validationResult = await onFormValidation(data, dirtyFields);
            return validationResult;
        } finally {
            setIsValidatingForm(false);
        }
    }

    const handleFormValidation = async (formData?: FormValues, forceValidation?: boolean): Promise<boolean> => {
        const data = formData ?? getValues();
        if (!onFormValidation || (!forceValidation && !canRunExternalFormValidation(data))) {
            return true;
        }

        return runExternalFormValidation(data);
    }

    const handleOnBlur = async () => {
        const values = getValues();
        if (onFormValidation && !canRunExternalFormValidation(values)) {
            return;
        }
        onBlur?.(values, dirtyFields);
    };

    const handleOpenRecordEditor = (open: boolean, typeField?: FormField, newType?: string | NodeProperties) => {
        openRecordEditor?.(open, getValues(), typeField, newType);
    };

    const handleOnShowAdvancedOptions = () => {
        setShowAdvancedOptions(true);
    };

    const handleOnHideAdvancedOptions = () => {
        setShowAdvancedOptions(false);
    };

    const handleOnFieldFocus = (key: string) => {
        const isActiveSubPanel = subPanelView !== SubPanelView.UNDEFINED;

        if (isActiveSubPanel && activeFormField !== key) {
            openSubPanel && openSubPanel({ view: SubPanelView.UNDEFINED });
        }
        setActiveFormField(key);
    };

    const handleSetDiagnosticsInfo = useCallback((diagnostics: FormDiagnostics) => {
        setDiagnosticsInfo(prev => {
            const otherDiagnostics = prev?.filter((item) => item.key !== diagnostics.key) || [];
            return [...otherDiagnostics, diagnostics];
        });
    }, []);

    const handleOpenSubPanel = (subPanel: SubPanel) => {
        let updatedSubPanel = subPanel;
        openSubPanel(updatedSubPanel);
    };

    const handleNewTypeSelected = (type: string | CompletionItem) => {
        handleSelectedTypeChange && handleSelectedTypeChange(type);
    }

    const getVisualiableFields = () => {
        const typeName = watch("type");
        typeName && handleVisualizableFields && handleVisualizableFields(fileName, typeName);
    };

    const handleGetExpressionDiagnostics = async (
        showDiagnostics: boolean,
        expression: string,
        key: string,
        property: ExpressionProperty
    ) => {
        // HACK: For variable nodes, update the type value in the node
        const isVariableNode = selectedNode === "VARIABLE";
        await expressionEditor?.getExpressionFormDiagnostics?.(
            showDiagnostics,
            expression,
            key,
            property,
            handleSetDiagnosticsInfo,
            isVariableNode,
            watch("type")
        );
    };

    // Recursively collect advanced fields from selected choices (including nested choices)
    const advancedChoiceFields = useMemo(() => {
        const fields: FormField[] = [];
        const formValues = getValues();

        // Recursive function to traverse nested choices
        const collectAdvancedFields = (properties: any) => {
            if (!properties) return;

            Object.entries(properties).forEach(([propKey, propValue]: [string, any]) => {
                // If this property is a choice field, recurse into selected choice
                if (propValue?.choices && propValue.choices.length > 0) {
                    const selectedChoiceIndex = formValues[propKey] !== undefined ? Number(formValues[propKey]) : 0;
                    const selectedChoice = propValue.choices[selectedChoiceIndex];

                    if (selectedChoice && selectedChoice?.properties && !selectedChoice.advanced && !propValue.advanced) {
                        // Recursively collect from nested choice properties
                        collectAdvancedFields(selectedChoice.properties);
                    }
                }
                // Skip GROUP_SECTION properties - they handle their own advanced fields internally
                else if (propValue?.properties && !propValue.advanced && getPrimaryInputType(propValue?.types)?.fieldType === "GROUP_SECTION") {
                    // Do not traverse into GROUP_SECTION; its ChoiceForm renders advanced fields within the group
                }
                // If this property is advanced, add it to the list
                else if (propValue.advanced && propValue.enabled && !propValue.hidden && !propValue.choices) {
                    const choiceFormField: FormField = {
                        key: propKey,
                        label: propValue?.metadata?.label || propKey.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, str => str.toUpperCase()),
                        type: getPrimaryInputType(propValue.types)?.fieldType,
                        documentation: propValue?.metadata?.description || "",
                        types: propValue.types,
                        editable: propValue.editable,
                        enabled: propValue?.enabled ?? true,
                        optional: propValue.optional,
                        value: propValue.value,
                        advanced: propValue.advanced,
                        diagnostics: [],
                        items: propValue.items,
                        choices: propValue.choices,
                        placeholder: propValue.placeholder,
                    };
                    fields.push(choiceFormField);
                }
            });
        };

        // Start collection from top-level form fields
        formFields.forEach((field) => {
            if (field?.choices && field.choices.length > 0) {
                const selectedChoiceIndex = formValues[field.key] !== undefined ? Number(formValues[field.key]) : 0;
                const selectedChoice = field.choices[selectedChoiceIndex];

                if (selectedChoice && selectedChoice?.properties && !field.advanced) {
                    collectAdvancedFields(selectedChoice.properties);
                }
            }
        });

        return fields;
    }, [formFields, watch()]);

    // Initialize form values for advanced choice fields
    useEffect(() => {
        advancedChoiceFields.forEach(field => {
            const currentValue = getValues(field.key);
            // Only set the value if it's currently undefined and the field has a value
            if (currentValue === undefined && field.value !== undefined) {
                setValue(field.key, field.value);
            }
        });
    }, [advancedChoiceFields, getValues, setValue]);

    // Drop react-hook-form state for fields that were removed from formFields. A dynamic form can
    // remove a field (e.g. a required parameter's inline value field disappears when its checkbox is
    // re-checked); react-hook-form otherwise keeps that field's last value and any validation error,
    // which leaves the form invalid (Save/Next disabled) even though the field is gone. Unregister the
    // removed keys and revalidate so validity reflects only the fields currently on screen.
    const prevFieldKeysRef = useRef<string[]>([]);
    useEffect(() => {
        const currentKeys = new Set(formFields.map((field) => field.key));
        const removedKeys = prevFieldKeysRef.current.filter((key) => !currentKeys.has(key));
        if (removedKeys.length > 0) {
            unregister(removedKeys);
            trigger();
        }
        prevFieldKeysRef.current = Array.from(currentKeys);
    }, [formFields, unregister, trigger]);

    // has advance fields
    const hasAdvanceFields = formFields.some((field) => field.advanced && field.enabled && !field.hidden) || advancedChoiceFields.length > 0;
    const variableField = formFields.find((field) => field.key === "variable");
    // Exclude PARAM_FOR_TYPE_INFER fields (e.g. the activity/human-task "Databinding Type"): those are
    // rendered via targetTypeField below, so matching them here too would render the same field twice.
    const typeField = formFields.find((field) => !field.advanced && !field.hidden && field.codedata?.kind !== "PARAM_FOR_TYPE_INFER" && getPrimaryInputType(field.types)?.fieldType === "TYPE");
    const expressionField = formFields.find((field) => getSecondaryInputType(field.types)?.fieldType === "EXPRESSION" || getPrimaryInputType(field.types)?.fieldType === "ACTION_OR_EXPRESSION");
    const targetTypeField = formFields.find((field) => field.codedata?.kind === "PARAM_FOR_TYPE_INFER");
    const hasParameters = hasRequiredParameters(formFields, selectedNode) || hasOptionalParameters(formFields);

    const canOpenInDataMapper = (selectedNode === "VARIABLE" &&
        expressionField &&
        visualizableField?.isDataMapped) ||
        selectedNode === "DATA_MAPPER_CREATION";

    const canOpenInFunctionEditor = selectedNode === "FUNCTION_CREATION";

    const contextValue: FormContext = {
        form: {
            control,
            getValues,
            setValue,
            watch,
            register,
            unregister,
            setError,
            clearErrors,
            formState: { isValidating, errors },
        },
        expressionEditor: {
            ...expressionEditor,
            getExpressionEditorDiagnostics: handleGetExpressionDiagnostics,
        },
        targetLineRange,
        fileName,
        popupManager: popupManager,
        nodeInfo: {
            kind: selectedNode,
        },
        onRequestCreateConnection,
    };

    // Find the first editable identifier field
    const firstEditableFieldIndex = formFields.findIndex(
        (field) => field.editable !== false && getPrimaryInputType(field.types)?.fieldType === "IDENTIFIER"
    );

    const isValid = useMemo(() => {
        let hasDiagnostics: boolean = false;

        // Check diagnostics from diagnosticsInfo state
        if (diagnosticsInfo) {
            for (const diagnosticsInfoItem of diagnosticsInfo) {
                const key = diagnosticsInfoItem.key;
                if (!key) {
                    continue;
                }

                let diagnostics: Diagnostic[] = Array.isArray(diagnosticsInfoItem.diagnostics) ? diagnosticsInfoItem.diagnostics : [];
                if (diagnostics.length === 0) {
                    // Only clear errors that were set by the expression diagnostics system,
                    // not errors set by other validators (e.g., PathEditor)
                    if (errors[key]?.type === "expression_diagnostic") {
                        clearErrors(key);
                        // clearErrors removes the entry but does not refresh formState.isValid;
                        // trigger a revalidation so Save re-enables once diagnostics go clean.
                        trigger(key);
                    }
                    continue;
                } else {
                    // Filter the BCE2066 diagnostics
                    diagnostics = diagnostics.filter(
                        (d) => d.code !== "BCE2066" || d.message !== "incompatible types: expected 'any', found 'error'"
                    );

                    const diagnosticsMessage = diagnostics.map((d) => d.message).join("\n");
                    setError(key, { type: "expression_diagnostic", message: diagnosticsMessage });

                    // If the severity is not ERROR, don't invalidate
                    const hasErrorDiagnostics = diagnostics.some((d) => d.severity === 1);
                    if (hasErrorDiagnostics) {
                        hasDiagnostics = true;
                    } else {
                        continue;
                    }
                }
            }
        }

        // Check diagnostics directly from formFields
        for (const field of formFields) {
            if (field.diagnostics && field.diagnostics.length > 0) {
                hasDiagnostics = true;
            }
        }

        return !hasDiagnostics;
    }, [diagnosticsInfo, formFields]);

    const prevValuesRef = useRef<FormValues>({});
    const watchedValues = watch();
    const hasIncompleteRequiredFields = !!onFormValidation &&
        hasIncompleteRequiredFormFields(formFields, watchedValues);

    // Call onValidityChange when form validity changes
    useEffect(() => {
        if (onValidityChange) {
            // formStateIsValid captures errors from PathEditor and other validators (setError)
            const formIsValid = isValid && formStateIsValid && !isValidating && Object.keys(errors).length === 0 && !hasIncompleteRequiredFields &&
                (!concertMessage || !concertRequired || isUserConcert) && !isIdentifierEditing && !isSubComponentEnabled;
            onValidityChange(formIsValid);
        }
    }, [isValid, formStateIsValid, isValidating, errors, hasIncompleteRequiredFields, concertMessage, concertRequired, isUserConcert, isIdentifierEditing, isSubComponentEnabled, onValidityChange]);

    const handleIdentifierEditingStateChange = (isEditing: boolean) => {
        setIsIdentifierEditing(isEditing);
    };

    const handleConcertChange = (checked: boolean) => {
        setIsUserConcert(checked);
    };

    const disableSaveButton =
        isValidating || props.disableSaveButton || (concertMessage && concertRequired && !isUserConcert) ||
        isIdentifierEditing || isSubComponentEnabled || isValidatingForm || hasIncompleteRequiredFields ||
        !formStateIsValid || Object.keys(errors).length > 0;

    const handleShowMoreClick = () => {
        setIsMarkdownExpanded(!isMarkdownExpanded);
        // If collapsing, scroll to top of container with smooth animation
        if (isMarkdownExpanded) {
            const container = document.querySelector(".side-panel-body");
            container?.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    useEffect(() => {
        if (props.onChange) {
            const prevValues = prevValuesRef.current;
            Object.entries(watchedValues).forEach(([key, value]) => {
                if (!isEqual(prevValues[key], value)) {
                    props.onChange?.(key, value, watchedValues);
                }
            });
            prevValuesRef.current = { ...watchedValues };
        }
    }, [watchedValues]);

    // Handle derived fields: auto-generate target field values from source fields
    useEffect(() => {
        if (derivedFields.length === 0) return;

        derivedFields.forEach(({ sourceField, targetField, deriveFn, breakOnManualEdit = true }) => {
            const sourceValue = watchedValues[sourceField];
            const currentTargetValue = watchedValues[targetField];

            // Skip if this field has been manually edited and breakOnManualEdit is true
            if (breakOnManualEdit && manuallyEditedFields.has(targetField)) {
                return;
            }

            // Derive the new target value
            const derivedValue = deriveFn(sourceValue);

            // Only update if the value has actually changed
            if (derivedValue !== currentTargetValue) {
                setValue(targetField, derivedValue);
            }
        });
    }, [watchedValues, derivedFields, manuallyEditedFields, setValue]);

    // Track manual edits to derived target fields
    useEffect(() => {
        if (derivedFields.length === 0) return;

        const prevValues = prevValuesRef.current;
        derivedFields.forEach(({ targetField, breakOnManualEdit = true }) => {
            if (!breakOnManualEdit) return;

            const currentValue = watchedValues[targetField];
            const prevValue = prevValues[targetField];

            if (currentValue !== prevValue && prevValue !== undefined) {
                // Mark this field as manually edited
                setManuallyEditedFields(prev => {
                    if (!prev.has(targetField)) {
                        const newSet = new Set(prev);
                        newSet.add(targetField);
                        return newSet;
                    }
                    return prev;
                });
            }
        });
    }, [watchedValues, derivedFields]);

    const handleOnOpenInDataMapper = () => {
        setSavingButton('dataMapper');
        handleSubmit((data) => {
            if (data.expression === '' && visualizableField?.defaultValue) {
                data.expression = visualizableField.defaultValue;
            }
            return handleOnSave({
                ...data,
                editorConfig: {
                    view: selectedNode === "VARIABLE" ? MACHINE_VIEW.InlineDataMapper : MACHINE_VIEW.DataMapper,
                    displayMode: EditorDisplayMode.VIEW,
                },
            });
        })();
    };

    const handleOnOpenInFunctionEditor = () => {
        setSavingButton('functionEditor');
        handleSubmit((data) => {
            return handleOnSave({
                ...data,
                editorConfig: {
                    view: MACHINE_VIEW.BIDiagram,
                    displayMode: EditorDisplayMode.VIEW,
                    artifactType: DIRECTORY_MAP.FUNCTION,
                },
            });
        })();
    };

    const handleOnSaveClick = () => {
        setSavingButton('save');

        handleSubmit(
            async (data) => {
                try {
                    const isValidForm = await runExternalFormValidation(data);
                    if (!isValidForm) {
                        console.error(">>> Form validation failed, not saving", { data: props, formData: data });
                        setSavingButton(null);
                        return;
                    }
                    handleOnSave(data);
                } catch (error) {
                    console.error(">>> Error validating form before save", error);
                    setSavingButton(null);
                }
            },
            () => {
                setSavingButton(null);
            }
        )();
    };

    // Mirrors handleOnSaveClick for the optional secondary action ("Next"): validate through the same
    // path, then route to the caller's handler instead of the save handler.
    const handleOnSecondaryClick = () => {
        if (!secondarySubmitButton) {
            return;
        }
        setSavingButton('secondary');
        handleSubmit(
            async (data) => {
                try {
                    const isValidForm = await runExternalFormValidation(data);
                    if (!isValidForm) {
                        setSavingButton(null);
                        return;
                    }
                    secondarySubmitButton.onClick(data, dirtyFields);
                } catch (error) {
                    console.error(">>> Error validating form before secondary action", error);
                    setSavingButton(null);
                }
            },
            () => {
                setSavingButton(null);
            }
        )();
    };

    const formContent = (
        <>
            {actionButton && <S.ActionButtonContainer>{actionButton}</S.ActionButtonContainer>}
            {infoLabel && !compact && (
                <S.MarkdownWrapper>
                    <S.MarkdownContainer ref={markdownRef} isExpanded={isMarkdownExpanded}>
                        <MarkdownDescription description={infoLabel} />
                    </S.MarkdownContainer>
                    {markdownRef.current && markdownRef.current.scrollHeight > 200 && (
                        <S.ButtonContainer>
                            <LinkButton
                                onClick={handleShowMoreClick}
                                sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                            >
                                <Codicon
                                    name={isMarkdownExpanded ? "chevron-up" : "chevron-down"}
                                    iconSx={{ fontSize: 12 }}
                                    sx={{ height: 12 }}
                                />
                                {isMarkdownExpanded ? "Show Less" : "Show More"}
                            </LinkButton>
                        </S.ButtonContainer>
                    )}
                </S.MarkdownWrapper>
            )}
            {!preserveOrder && !compact && (
                <FormDescription formFields={formFields} selectedNode={selectedNode} />
            )}
            {formDiagnostics && formDiagnostics.length > 0 && (
                <S.FormDiagnosticsContainer>
                    <ErrorBanner
                        errorMsg={formDiagnostics.map((diagnostic) => diagnostic.message).join("\n")}
                        sx={{ alignItems: "flex-start" }}
                    />
                    {formDiagnosticsAction && (
                        <S.FormDiagnosticsActionContainer>
                            {formDiagnosticsAction}
                        </S.FormDiagnosticsActionContainer>
                    )}
                </S.FormDiagnosticsContainer>
            )}

            {/*
                 * Two rendering modes based on preserveOrder prop:
                 *
                 * 1. preserveOrder = true: Render all fields in original order from formFields array
                 * 2. preserveOrder = false: Render name and type fields at the bottom, and rest at top
                 */}
            <S.CategoryRow bottomBorder={false}>
                {(() => {
                    const fieldsToRender = [...formFields]
                        .sort((a, b) => (b.groupNo ?? 0) - (a.groupNo ?? 0))
                        .filter((field) => field.type !== "VIEW");

                    const renderedComponents: React.ReactNode[] = [];
                    let renderedFieldCount = 0;
                    const injectedIndices = new Set<number>(); // Track which injections have been added

                    const nonAdvancedInjections = injectedComponents?.filter((ic) => !ic.advanced);

                    fieldsToRender.forEach((field) => {
                        // Check if we need to inject components before this field
                        if (nonAdvancedInjections) {
                            nonAdvancedInjections.forEach((injected) => {
                                if (injected.index === renderedFieldCount && !injectedIndices.has(injected.index)) {
                                    renderedComponents.push(
                                        <React.Fragment key={`injected-${injected.index}`}>
                                            {injected.component}
                                        </React.Fragment>
                                    );
                                    injectedIndices.add(injected.index);
                                }
                            });
                        }

                        if (field.advanced || field.hidden) {
                            return;
                        }
                        // When preserveOrder is false, skip prioritized fields (they'll be rendered at bottom)
                        if (!preserveOrder && isPrioritizedField(field)) {
                            return;
                        }

                        const updatedField = updateFormFieldWithImports(field, formImports);
                        const RowComponent = updatedField.indent ? S.IndentedRow : S.Row;
                        renderedComponents.push(
                            <RowComponent key={updatedField.key}>
                                <FieldFactory
                                    field={updatedField}
                                    selectedNode={selectedNode}
                                    openRecordEditor={
                                        openRecordEditor &&
                                        ((open: boolean, newType?: string | NodeProperties) => handleOpenRecordEditor(open, updatedField, newType))
                                    }
                                    openSubPanel={handleOpenSubPanel}
                                    subPanelView={subPanelView}
                                    handleFormValidation={handleFormValidation}
                                    handleOnFieldFocus={handleOnFieldFocus}
                                    autoFocus={firstEditableFieldIndex === formFields.indexOf(updatedField) && !hideSaveButton}
                                    recordTypeFields={recordTypeFields}
                                    onIdentifierEditingStateChange={handleIdentifierEditingStateChange}
                                    setSubComponentEnabled={setIsSubComponentEnabled}
                                    handleNewTypeSelected={handleNewTypeSelected}
                                    onBlur={handleOnBlur}
                                    isContextTypeEditorSupported={updatedField?.isContextTypeSupported}
                                    openFormTypeEditor={
                                        openFormTypeEditor &&
                                        ((open: boolean, newType?: string) => openFormTypeEditor(open, newType, updatedField))
                                    }
                                    updateImports={updateImports}
                                />
                                {updatedField.key === "scope" && scopeFieldAddon}
                            </RowComponent>
                        );
                        renderedFieldCount++;
                    });

                    // Check if we need to inject components after all fields
                    if (nonAdvancedInjections) {
                        nonAdvancedInjections.forEach((injected) => {
                            if (injected.index >= renderedFieldCount && !injectedIndices.has(injected.index)) {
                                renderedComponents.push(
                                    <React.Fragment key={`injected-${injected.index}`}>
                                        {injected.component}
                                    </React.Fragment>
                                );
                                injectedIndices.add(injected.index);
                            }
                        });
                    }

                    return renderedComponents;
                })()}
                {hasAdvanceFields && (
                    <S.Row>
                        {optionalFieldsTitle}
                        <S.ButtonContainer>
                            {!showAdvancedOptions && (
                                <LinkButton
                                    onClick={handleOnShowAdvancedOptions}
                                    sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                                >
                                    <Codicon
                                        name={"chevron-down"}
                                        iconSx={{ fontSize: 12 }}
                                        sx={{ height: 12 }}
                                    />
                                    Expand
                                </LinkButton>
                            )}
                            {showAdvancedOptions && (
                                <LinkButton
                                    onClick={handleOnHideAdvancedOptions}
                                    sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                                >
                                    <Codicon
                                        name={"chevron-up"}
                                        iconSx={{ fontSize: 12 }}
                                        sx={{ height: 12 }}
                                    />Collapse
                                </LinkButton>
                            )}
                        </S.ButtonContainer>
                    </S.Row>
                )}
                {hasAdvanceFields &&
                    showAdvancedOptions &&
                    (() => {
                        const advancedComponents: React.ReactNode[] = [];
                        let advancedFieldCount = 0;
                        const advancedInjectedIndices = new Set<number>();
                        const advancedInjections = injectedComponents?.filter((ic) => ic.advanced);

                        formFields.forEach((field) => {
                            if (field.advanced && !field.hidden) {
                                if (advancedInjections) {
                                    advancedInjections.forEach((injected) => {
                                        if (injected.index === advancedFieldCount && !advancedInjectedIndices.has(injected.index)) {
                                            advancedComponents.push(
                                                <React.Fragment key={`injected-advanced-${injected.index}`}>
                                                    {injected.component}
                                                </React.Fragment>
                                            );
                                            advancedInjectedIndices.add(injected.index);
                                        }
                                    });
                                }

                                const updatedField = updateFormFieldWithImports(field, formImports);
                                advancedComponents.push(
                                    <S.Row key={updatedField.key}>
                                        <FieldFactory
                                            field={updatedField}
                                            handleFormValidation={handleFormValidation}
                                            openRecordEditor={
                                                openRecordEditor &&
                                                ((open: boolean, newType?: string | NodeProperties) => handleOpenRecordEditor(open, updatedField, newType))
                                            }
                                            subPanelView={subPanelView}
                                            handleOnFieldFocus={handleOnFieldFocus}
                                            recordTypeFields={recordTypeFields}
                                            onIdentifierEditingStateChange={handleIdentifierEditingStateChange}
                                            onBlur={handleOnBlur}
                                        />
                                    </S.Row>
                                );
                                advancedFieldCount++;
                            }
                        });

                        if (advancedInjections) {
                            advancedInjections.forEach((injected) => {
                                if (injected.index >= advancedFieldCount && !advancedInjectedIndices.has(injected.index)) {
                                    advancedComponents.push(
                                        <React.Fragment key={`injected-advanced-${injected.index}`}>
                                            {injected.component}
                                        </React.Fragment>
                                    );
                                    advancedInjectedIndices.add(injected.index);
                                }
                            });
                        }

                        return advancedComponents;
                    })()}
                {hasAdvanceFields &&
                    showAdvancedOptions &&
                    advancedChoiceFields.map((field) => {
                        const updatedField = updateFormFieldWithImports(field, formImports);
                        return (
                            <S.Row key={updatedField.key}>
                                <FieldFactory
                                    field={updatedField}
                                    openRecordEditor={
                                        openRecordEditor &&
                                        ((open: boolean, newType?: string | NodeProperties) => handleOpenRecordEditor(open, updatedField, newType))
                                    }
                                    subPanelView={subPanelView}
                                    handleOnFieldFocus={handleOnFieldFocus}
                                    recordTypeFields={recordTypeFields}
                                    onIdentifierEditingStateChange={handleIdentifierEditingStateChange}
                                    onBlur={handleOnBlur}
                                    handleFormValidation={handleFormValidation}
                                    />
                            </S.Row>
                        );
                    })}
            </S.CategoryRow>

            {!preserveOrder && (variableField || typeField || targetTypeField) && (
                <S.CategoryRow topBorder={!compact && hasParameters}>
                    {variableField && (
                        <FieldFactory
                            field={variableField}
                            handleOnFieldFocus={handleOnFieldFocus}
                            recordTypeFields={recordTypeFields}
                            onIdentifierEditingStateChange={handleIdentifierEditingStateChange}
                            onBlur={handleOnBlur}
                            handleFormValidation={handleFormValidation}
                        />
                    )}
                    {typeField && !isInferredReturnType && (
                        <FieldFactory
                            field={typeField}
                            openRecordEditor={
                                openRecordEditor &&
                                ((open: boolean, newType?: string | NodeProperties) => handleOpenRecordEditor(open, typeField, newType))
                            }
                            handleOnFieldFocus={handleOnFieldFocus}
                            recordTypeFields={recordTypeFields}
                            onIdentifierEditingStateChange={handleIdentifierEditingStateChange}
                            handleNewTypeSelected={handleNewTypeSelected}
                            onBlur={handleOnBlur}
                            handleFormValidation={handleFormValidation}
                        />
                    )}
                    {targetTypeField && !targetTypeField.advanced && (
                        <>
                            <FieldFactory
                                field={targetTypeField}
                                handleOnFieldFocus={handleOnFieldFocus}
                                recordTypeFields={recordTypeFields}
                                onIdentifierEditingStateChange={handleIdentifierEditingStateChange}
                                handleNewTypeSelected={handleNewTypeSelected}
                                onBlur={handleOnBlur}
                                handleFormValidation={handleFormValidation}
                            />
                            {typeField && (
                                <TypeHelperText
                                    targetTypeField={targetTypeField}
                                    typeField={typeField}
                                />
                            )}
                        </>
                    )}
                </S.CategoryRow>
            )}

            {concertMessage && (
                <S.ConcertContainer>
                    <CheckBox checked={isUserConcert} onChange={handleConcertChange} label={concertMessage} />
                </S.ConcertContainer>
            )}
        </>
    );

    return (
        <FormFieldLoadingProvider
            loadingFields={loadingFields}
            registerLoading={registerLoading}
            unregisterLoading={unregisterLoading}
        >
            <Provider {...contextValue}>
                <S.Container nestedForm={nestedForm} compact={compact} footerActionButton={footerActionButton} className="side-panel-body">
                    {isFormLoading && (
                        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "12px", flex: 1 }}>
                            <ProgressRing color={ThemeColors.PRIMARY} />
                            <span style={{ fontSize: "12px", color: ThemeColors.ON_SURFACE_VARIANT }}>Loading form data...</span>
                        </div>
                    )}
                    {/* NOTE: isFormLoading is only expected to be true during initial field value
    resolution on form open. If this ever becomes true during user interaction,
    it will drop focus — treat that as a bug in the loading registration logic. */}
                    <div style={{ display: isFormLoading ? "none" : "contents" }}>
                        {footerActionButton ? (
                            <S.ScrollableContent>
                                {formContent}
                            </S.ScrollableContent>
                        ) : (
                            formContent
                        )}
                        {onSubmit && !hideSaveButton && !footerActionButton && (
                            <S.Footer>
                                {onCancelForm && (
                                    <Button appearance="secondary" onClick={onCancelForm}>
                                        {" "}
                                        {cancelText || "Cancel"}{" "}
                                    </Button>
                                )}
                                {canOpenInDataMapper &&
                                    <Button
                                        appearance="secondary"
                                        onClick={handleOnOpenInDataMapper}
                                        disabled={isSaving}
                                    >
                                        {isSaving && savingButton === 'dataMapper' ? (
                                            <Typography variant="progress">{submitText || "Opening in Data Mapper..."}</Typography>
                                        ) : submitText || "Open in Data Mapper"}
                                    </Button>
                                }
                                {canOpenInFunctionEditor && (
                                    <Button
                                        appearance="secondary"
                                        onClick={handleOnOpenInFunctionEditor}
                                        disabled={isSaving}
                                    >
                                        {isSaving && savingButton === 'functionEditor' ? (
                                            <Typography variant="progress">{submitText || "Opening in Function Editor..."}</Typography>
                                        ) : submitText || "Open in Function Editor"}
                                    </Button>
                                )}
                                {secondarySubmitButton && (
                                    <Button
                                        appearance="secondary"
                                        onClick={handleOnSecondaryClick}
                                        disabled={disableSaveButton || isSaving}
                                    >
                                        {isSaving && savingButton === 'secondary' ? (
                                            <Typography variant="progress">{secondarySubmitButton.text}</Typography>
                                        ) : (
                                            secondarySubmitButton.text
                                        )}
                                    </Button>
                                )}
                                <Button
                                    appearance="primary"
                                    onClick={handleOnSaveClick}
                                    disabled={disableSaveButton || isSaving}
                                >
                                    {isValidatingForm ? (
                                        <Typography variant="progress">Validating...</Typography>
                                    ) : isSaving && savingButton === 'save' ? (
                                        <Typography variant="progress">{submitText || "Saving..."}</Typography>
                                    ) : (
                                        submitText || "Save"
                                    )}
                                </Button>
                            </S.Footer>
                        )}
                        {onSubmit && !hideSaveButton && footerActionButton && (
                            <S.FooterActionButtonContainer>
                                <S.FooterActionButton
                                    appearance="primary"
                                    onClick={handleOnSaveClick}
                                    disabled={disableSaveButton || isSaving}
                                    buttonSx={{ width: "100%", height: "35px" }}
                                >
                                    {isValidatingForm ? (
                                        <Typography variant="progress">Validating...</Typography>
                                    ) : isSaving && savingButton === 'save' ? (
                                        <Typography variant="progress">{submitText || "Saving..."}</Typography>
                                    ) : (
                                        submitText || "Save"
                                    )}
                                </S.FooterActionButton>
                            </S.FooterActionButtonContainer>
                        )}
                    </div>
                </S.Container>
            </Provider>
        </FormFieldLoadingProvider>
    );
});

export default Form;

export const FormRow = S.Row;
export const FormButtonContainer = S.ButtonContainer;
