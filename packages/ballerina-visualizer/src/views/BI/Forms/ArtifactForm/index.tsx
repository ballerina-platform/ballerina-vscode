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

import { ReactNode, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    EVENT_TYPE,
    LineRange,
    NodePosition,
    SubPanel,
    VisualizerLocation,
    TRIGGER_CHARACTERS,
    TriggerCharacter,
    Type,
    TextEdit,
    NodeKind,
    ExpressionProperty,
    RecordTypeField,
    FormDiagnostics,
    Imports,
    CodeData,
    LinePosition,
    NodeProperties,
    ExpressionCompletionsRequest,
    ExpressionCompletionsResponse,
    InputType,
    getPrimaryInputType,
    Diagnostic
} from "@wso2/ballerina-core";
import {
    FormField,
    FormValues,
    Form,
    ExpressionFormField,
    FormExpressionEditorProps,
    FormImports,
    HelperpaneOnChangeOptions,
    InputMode,
    getTypeCompletionSearchText
} from "@wso2/ballerina-side-panel";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { CompletionItem, FormExpressionEditorRef, HelperPaneHeight, Overlay, ThemeColors } from "@wso2/ui-toolkit";

import {
    convertBalCompletion,
    convertToFnSignature,
    convertToVisibleTypes,
    filterUnsupportedDiagnostics,
    getImportsForFormFields,
    calculateExpressionOffsets,
    injectHighlightTheme,
    removeDuplicateDiagnostics,
    updateLineRange
} from "../../../../utils/bi";
import { debounce } from "lodash";
import { FormTypeEditor } from "../../TypeEditor";
import { getTypeHelper } from "../../TypeHelper";
import { EXPRESSION_EXTRACTION_REGEX, TypeHelperContext } from "../../../../constants";
import { getHelperPaneNew } from "../../HelperPaneNew";
import { ConfigureRecordPage } from "../../HelperPaneNew/Views/RecordConfigModal";
import { EntryPointTypeCreator } from "../../../../components/EntryPointTypeCreator";
import React from "react";
import { BreadcrumbContainer, BreadcrumbItem, BreadcrumbSeparator } from "../FlowNodeForm";
import { EditorContext, StackItem } from "@wso2/type-editor";
import DynamicModal from "../../../../components/Modal";
import { useModalStack } from "../../../../Context";
import { deserializeForDiagnosticsAPI } from "../form-utils";

interface ArtifactTypeEditorState {
    isOpen: boolean;
    field?: FormField; // Optional, to store the field being edited
    newTypeValue?: string;
}

interface ArtifactFormProps {
    fileName: string;
    fields: FormField[];
    targetLineRange?: LineRange;
    projectPath?: string;
    submitText?: string;
    cancelText?: string;
    onBack?: () => void;
    onCancel?: () => void;
    editForm?: boolean;
    isGraphqlEditor?: boolean;
    isDataMapperEditor?: boolean;
    onSubmit: (data: FormValues, formImports?: FormImports, importsCodedata?: CodeData) => void;
    isSaving?: boolean;
    isActiveSubPanel?: boolean;
    openSubPanel?: (subPanel: SubPanel) => void;
    updatedExpressionField?: ExpressionFormField;
    resetUpdatedExpressionField?: () => void;
    selectedNode?: NodeKind;
    nestedForm?: boolean;
    compact?: boolean;
    helperPaneSide?: 'right' | 'left';
    recordTypeFields?: RecordTypeField[];
    disableSaveButton?: boolean;
    concertMessage?: string;
    concertRequired?: boolean;
    description?: string;
    preserveFieldOrder?: boolean;
    injectedComponents?: {
        component: ReactNode;
        index: number;
        advanced?: boolean;
    }[];
    changeOptionalFieldTitle?: string;
    onChange?: (fieldKey: string, value: any, allValues: FormValues) => void;
    hideSaveButton?: boolean;
    customDiagnosticFilter?: (diagnostics: Diagnostic[]) => Diagnostic[];
    onValidityChange?: (isValid: boolean) => void;
    recordsOnly?: boolean;
    footerActionButton?: boolean; // Render save button as a full-width footer action button
}

export function ArtifactForm(props: ArtifactFormProps) {
    const {
        fileName,
        fields,
        targetLineRange,
        projectPath,
        submitText,
        cancelText,
        onBack,
        onCancel,
        onSubmit,
        isSaving,
        isGraphqlEditor,
        isDataMapperEditor,
        openSubPanel,
        updatedExpressionField,
        resetUpdatedExpressionField,
        selectedNode,
        nestedForm,
        compact = false,
        helperPaneSide,
        recordTypeFields,
        disableSaveButton = false,
        concertMessage,
        concertRequired,
        description,
        preserveFieldOrder,
        injectedComponents,
        changeOptionalFieldTitle,
        onChange,
        hideSaveButton,
        customDiagnosticFilter,
        onValidityChange,
        recordsOnly,
        footerActionButton
    } = props;

    const { rpcClient } = useRpcContext();



    const getAdjustedStartLine = (targetLineRange: LineRange | undefined, expressionOffset: number): LinePosition | undefined => {
        return targetLineRange ? updateLineRange(targetLineRange, expressionOffset).startLine : undefined;
    };

    const [typeEditorState, setTypeEditorState] = useState<ArtifactTypeEditorState>({ isOpen: false, newTypeValue: "" });

    /* Expression editor related state and ref variables */
    const prevCompletionFetchText = useRef<string>("");
    const [completions, setCompletions] = useState<CompletionItem[]>([]);
    const [filteredCompletions, setFilteredCompletions] = useState<CompletionItem[]>([]);
    const typesCache = useRef<Map<string, CompletionItem[]>>(new Map());
    const [types, setTypes] = useState<CompletionItem[]>([]);
    const [filteredTypes, setFilteredTypes] = useState<CompletionItem[]>([]);
    const expressionOffsetRef = useRef<number>(0); // To track the expression offset on adding import statements
    const importsCodedataRef = useRef<any>(null); // To store codeData for getVisualizableFields

    const [fieldsValues, setFields] = useState<FormField[]>(fields);
    const fieldsRef = useRef<FormField[]>(fields);
    const fieldsValuesRef = useRef<FormField[]>(fields);
    const [formImports, setFormImports] = useState<FormImports>({});
    const formImportsRef = useRef<FormImports>({});
    const [refetchStates, setRefetchStates] = useState<boolean[]>([false]);
    const [valueTypeConstraints, setValueTypeConstraints] = useState<string>();

    const { addModal, closeModal, popModal } = useModalStack();

    // State to manage record config page modal
    const [recordConfigPageState, setRecordConfigPageState] = useState<{
        isOpen: boolean;
        fieldKey?: string;
        currentValue?: string;
        recordTypeField?: RecordTypeField;
        onChangeCallback?: (value: string) => void;
    }>({
        isOpen: false
    });

    //stack for recursive type creation
    const [stack, setStack] = useState<StackItem[]>([{
        isDirty: false,
        type: undefined
    }]);

    const [isTypeEditorOpen, setIsTypeEditorOpen] = useState<boolean>(false);
    const [editingTypeName, setEditingTypeName] = useState<string>("");

    const handleOpenFormTypeEditor = (open: boolean, typeName?: string, editingField?: FormField) => {
        setTypeEditorState((prevState) => ({
            ...prevState,
            field: editingField,
        }));
        setIsTypeEditorOpen(open);
        if (typeName) {
            setEditingTypeName(typeName);
        } else {
            setEditingTypeName("");
        }
    };

    const handleTypeEditorClose = () => {
        setIsTypeEditorOpen(false);
        setEditingTypeName("");
        setTypeEditorState((prevState) => ({ ...prevState, field: undefined }));
    };

    const handleTypeCreated = (type: Type | string, imports?: Imports) => {
        setIsTypeEditorOpen(false);
        setEditingTypeName("");
        if (type) {
            const typeName = typeof type === 'string' ? type : (type as Type).name;
            setFields(fields.map((field) => {
                if (getPrimaryInputType(field.types)?.fieldType === 'TYPE') {
                    return { ...field, value: typeName };
                }
                return field;
            }));
            if (imports) {
                const targetFieldKey = typeEditorState.field?.key || "type";
                handleUpdateImports(targetFieldKey, imports);
            }
        }
    };

    const pushTypeStack = (item: StackItem) => {
        setStack((prev) => [...prev, item]);
        setRefetchStates((prev) => {
            const newStates = [...prev];
            if (newStates.length > 0) {
                newStates[newStates.length - 1] = false;
            }
            return [...newStates, false];
        });
    };

    const resetStack = () => {
        setStack([{
            type: defaultType(),
            isDirty: false
        }]);
    }

    useEffect(() => {
        const tempStack = [...stack];
        const firstItem = tempStack[0];
        if (firstItem) {
            firstItem.type = defaultType();
            tempStack[0] = firstItem;
            setStack(tempStack);
            return;
        }
    }, [typeEditorState.field]);

    const popTypeStack = () => {
        setStack((prev) => {
            const newStack = prev.slice(0, -1);
            // If stack becomes empty, reset to initial state
            if (newStack.length === 0) {
                return [{
                    isDirty: false,
                    type: undefined
                }];
            }
            return newStack;
        });
        setRefetchStates((prev) => {
            const newStates = [...prev];
            const currentState = newStates.pop();
            if (currentState && newStates.length > 0) {
                newStates[newStates.length - 1] = true;
            }
            // If no states left, add initial state
            if (newStates.length === 0) {
                newStates.push(false);
            }
            return newStates;
        });
    };

    const peekTypeStack = (): StackItem | null => {
        return stack.length > 0 ? stack[stack.length - 1] : null;
    };

    const replaceTop = (item: StackItem) => {
        if (stack.length === 0) return;
        setStack((prev) => {
            const newStack = [...prev];
            //preserve fieldIndex if exists
            if (newStack[newStack.length - 1].fieldIndex) {
                item.fieldIndex = newStack[newStack.length - 1].fieldIndex;
            }
            newStack[newStack.length - 1] = item;
            return newStack;
        });
    }

    const setRefetchForCurrentModal = (shouldRefetch: boolean) => {
        setRefetchStates((prev) => {
            const newStates = [...prev];
            if (newStates.length > 0) {
                newStates[newStates.length - 1] = shouldRefetch;
            }
            return newStates;
        });
    };

    const isTypeExcludedFromValueTypeConstraint = (typeLabel: string) => {
        return ["()"].includes(typeLabel);
    }

    const handleValueTypeConstChange = async (valueTypeConstraint: string) => {
        const newTypes = await rpcClient.getBIDiagramRpcClient().getVisibleTypes({
            filePath: fileName,
            position: updateLineRange(targetLineRange, expressionOffsetRef.current).startLine
        });
        const matchedReferenceType = newTypes.find(t => t.label === valueTypeConstraint);
        if (matchedReferenceType) {
            if (matchedReferenceType.labelDetails.detail === "Structural Types"
                || matchedReferenceType.labelDetails.detail === "Behaviour Types"
                || isTypeExcludedFromValueTypeConstraint(matchedReferenceType.label)
            ) {
                setValueTypeConstraints('');
                return;
            }
        }
        setValueTypeConstraints(valueTypeConstraint);
    }

    const addPopupTester = (modal: ReactNode, id: string, title: string, height?: number, width?: number, onClose?: () => void) => {
        addModal(modal, id, title, height, width, onClose);
    }

    const popupManager = {
        addPopup: addPopupTester,
        removeLastPopup: popModal,
        closePopup: closeModal
    }

    const isFunctionParameterForm = () => {
        return (
            (selectedNode === "FUNCTION_DEFINITION" || selectedNode === "NP_FUNCTION_DEFINITION" || selectedNode === "DATA_MAPPER_DEFINITION") &&
            typeEditorState.field?.key === "parameters" &&
            getPrimaryInputType(typeEditorState?.field?.types)?.fieldType === "REPEATABLE_PROPERTY"
        );
    }

    const isParamTypePublicByDefault = () => {
        const isPublicField = fieldsValuesRef.current.find(field => field.key === "isPublic");
        const isPublicFieldValue = typeof isPublicField?.value === "string" ? isPublicField.value.toLowerCase() === "true" : Boolean(isPublicField?.value);
        return (
            isFunctionParameterForm() && isPublicFieldValue
        );
    }

    const handleFieldChange = (fieldKey: string, value: any, allValues: FormValues) => {
        const updated = fieldsValues.map(f => f.key === fieldKey ? { ...f, value: String(value) } : f);
        fieldsValuesRef.current = updated;
        onChange?.(fieldKey, value, allValues);
    };

    const defaultType = (typeName?: string): Type => {
        if (!isGraphqlEditor || typeEditorState.field?.type === 'PARAM_MANAGER') {
            return {
                name: typeName || typeEditorState.newTypeValue || "MyType",
                editable: true,
                metadata: {
                    label: "",
                    description: "",
                },
                codedata: {
                    node: "RECORD",
                },
                properties: {
                    isPublic: {
                        metadata: {
                            label: "public",
                            description: "Make visible across the project"
                        },
                        valueType: "FLAG",
                        value: isParamTypePublicByDefault() ? "true" : "false",
                        optional: false,
                        editable: true,
                        advanced: false
                    }
                },
                members: [],
                includes: [] as string[],
                allowAdditionalFields: false
            };
        } return {
            name: typeName || typeEditorState.newTypeValue || "MyType",
            editable: true,
            metadata: {
                label: "",
                description: ""
            },
            codedata: {
                node: "CLASS"
            },
            properties: {},
            members: [],
            includes: [] as string[],
            functions: []
        };
    }

    useEffect(() => {
        if (rpcClient) {
            // Set current theme
            rpcClient
                .getVisualizerRpcClient()
                .getThemeKind()
                .then((theme) => {
                    injectHighlightTheme(theme);
                });

            // Update highlight theme when theme changes
            rpcClient.onThemeChanged((theme) => {
                injectHighlightTheme(theme);
            });
        }
    }, [rpcClient]);

    useEffect(() => {
        if (fields) {
            setFields(fields);
            fieldsRef.current = fields;
            fieldsValuesRef.current = fields;
            const initialImports = getImportsForFormFields(fields);
            formImportsRef.current = initialImports;
            setFormImports(initialImports);
        }
    }, [fields]);

    useEffect(() => {
        handleFormOpen();

        return () => {
            handleFormClose();
        };
    }, []);

    const handleFormOpen = () => {
        rpcClient
            .getBIDiagramRpcClient()
            .formDidOpen({ filePath: fileName })
            .then(() => {
                console.log('>>> Form opened');
            });
    };

    const handleFormClose = () => {
        rpcClient
            .getBIDiagramRpcClient()
            .formDidClose({ filePath: fileName })
            .then(() => {
                console.log('>>> Form closed');
            });
    };

    const handleOpenView = async (location: VisualizerLocation) => {
        console.log(">>> open view: ", { location });
        const context: VisualizerLocation = {
            documentUri: location.documentUri,
            position: location.position,
        };
        await rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.OPEN_VIEW, location: context });
    };

    /* Expression editor related functions */
    const handleExpressionEditorCancel = () => {
        setFilteredCompletions([]);
        setCompletions([]);
        setFilteredTypes([]);
    };

    const debouncedRetrieveCompletions = useCallback(
        debounce(
            async (
                value: string,
                property: ExpressionProperty,
                offset: number,
                triggerCharacter?: string
            ) => {
                let expressionCompletions: CompletionItem[] = [];
                const { parentContent, currentContent } = value
                    .slice(0, offset)
                    .match(EXPRESSION_EXTRACTION_REGEX)?.groups ?? {};
                if (
                    completions.length > 0 &&
                    !triggerCharacter &&
                    parentContent === prevCompletionFetchText.current
                ) {
                    expressionCompletions = completions
                        .filter((completion) => {
                            const lowerCaseText = currentContent.toLowerCase();
                            const lowerCaseLabel = completion.label.toLowerCase();

                            return lowerCaseLabel.includes(lowerCaseText);
                        })
                        .sort((a, b) => a.sortText.localeCompare(b.sortText));
                } else {
                    const { lineOffset, charOffset } = calculateExpressionOffsets(value, offset);
                    const completionRequest: ExpressionCompletionsRequest = {
                        filePath: fileName,
                        context: {
                            expression: value,
                            startLine: getAdjustedStartLine(targetLineRange, expressionOffsetRef.current),
                            lineOffset: lineOffset,
                            offset: charOffset,
                            codedata: undefined,
                            property: property
                        },
                        completionContext: {
                            triggerKind: triggerCharacter ? 2 : 1,
                            triggerCharacter: triggerCharacter as TriggerCharacter
                        }
                    };

                    let completions: ExpressionCompletionsResponse;
                    if (!isDataMapperEditor) {
                        completions = await rpcClient.getBIDiagramRpcClient().getExpressionCompletions(completionRequest);
                    } else {
                        completions = await rpcClient.getBIDiagramRpcClient().getDataMapperCompletions(completionRequest);
                    }

                    // Convert completions to the ExpressionEditor format
                    let convertedCompletions: CompletionItem[] = [];
                    completions?.forEach((completion) => {
                        if (completion.detail) {
                            // HACK: Currently, completion with additional edits apart from imports are not supported
                            // Completions that modify the expression itself (ex: member access)
                            convertedCompletions.push(convertBalCompletion(completion));
                        }
                    });
                    setCompletions(convertedCompletions);

                    if (triggerCharacter) {
                        expressionCompletions = convertedCompletions;
                    } else {
                        expressionCompletions = convertedCompletions
                            .filter((completion) => {
                                const lowerCaseText = currentContent.toLowerCase();
                                const lowerCaseLabel = completion.label.toLowerCase();

                                return lowerCaseLabel.includes(lowerCaseText);
                            })
                            .sort((a, b) => a.sortText.localeCompare(b.sortText));
                    }
                }

                prevCompletionFetchText.current = parentContent ?? "";
                setFilteredCompletions(expressionCompletions);
            },
            250
        ),
        [rpcClient, completions, fileName, targetLineRange]
    );

    const handleRetrieveCompletions = useCallback(async (
        value: string,
        property: ExpressionProperty,
        offset: number,
        triggerCharacter?: string
    ) => {
        await debouncedRetrieveCompletions(value, property, offset, triggerCharacter);

        if (triggerCharacter) {
            await debouncedRetrieveCompletions.flush();
        }
    }, [debouncedRetrieveCompletions]);

    /**
     * Debounced function that fetches and filters visible types based on user input, with caching support and special handling for GraphQL contexts.
     */
    const debouncedGetVisibleTypes = useCallback(
        debounce(
            async (
                value: string,
                cursorPosition: number,
                fetchReferenceTypes?: boolean,
                types?: InputType[],
                fieldKey?: string
            ) => {
                let context: TypeHelperContext | undefined;
                if (isGraphqlEditor) {
                    context = fieldKey === 'returnType' ? TypeHelperContext.GRAPHQL_FIELD_TYPE : TypeHelperContext.GRAPHQL_INPUT_TYPE;
                }
                let typesCacheKey = fieldKey || 'default';
                let visibleTypes = typesCache.current.get(typesCacheKey);

                if (!visibleTypes) {
                    let visibleTypesResponse;
                    if (isGraphqlEditor && fieldKey && context) {
                        visibleTypesResponse = await rpcClient.getServiceDesignerRpcClient().getResourceReturnTypes({
                            filePath: fileName,
                            context: context,
                        });
                    } else {
                        visibleTypesResponse = await rpcClient.getBIDiagramRpcClient().getVisibleTypes({
                            filePath: fileName,
                            position: getAdjustedStartLine(targetLineRange, expressionOffsetRef.current),
                            ...(getPrimaryInputType(types)?.ballerinaType && { typeConstraint: getPrimaryInputType(types)?.ballerinaType })
                        });
                    }

                    const isFetchingTypesForDM = getPrimaryInputType(types)?.ballerinaType === "json";
                    visibleTypes = convertToVisibleTypes(visibleTypesResponse, isFetchingTypesForDM);
                    typesCache.current.set(typesCacheKey, visibleTypes);
                }
                setTypes(visibleTypes);

                if (!fetchReferenceTypes) {
                    const effectiveText = getTypeCompletionSearchText(value, cursorPosition);
                    let filteredTypes = visibleTypes.filter((type) => {
                        const lowerCaseText = effectiveText.toLowerCase();
                        const lowerCaseLabel = type.label.toLowerCase();

                        return lowerCaseLabel.includes(lowerCaseText);
                    });
                    setFilteredTypes(filteredTypes);
                }
            },
            250
        ),
        [rpcClient, fileName, targetLineRange, isGraphqlEditor]
    );

    const handleGetVisibleTypes = useCallback(
        async (value: string, cursorPosition: number, fetchReferenceTypes?: boolean, types?: InputType[], fieldKey?: string) => {
            await debouncedGetVisibleTypes(value, cursorPosition, fetchReferenceTypes, types, fieldKey);
        },
        [debouncedGetVisibleTypes]
    );

    const handleCompletionItemSelect = async (
        value: string,
        fieldKey: string,
        additionalTextEdits?: TextEdit[]
    ) => {
        if (additionalTextEdits?.[0].newText) {
            const response = await rpcClient.getBIDiagramRpcClient().updateImports({
                filePath: fileName,
                importStatement: additionalTextEdits[0].newText
            });
            expressionOffsetRef.current += response.importStatementOffset;

            if (response.prefix && response.moduleId) {
                const importStatement = {
                    [response.prefix]: response.moduleId
                }
                handleUpdateImports(fieldKey, importStatement);
            }
        }
        debouncedRetrieveCompletions.cancel();
        debouncedGetVisibleTypes.cancel();
        handleExpressionEditorCancel();
    };

    const handleExpressionEditorBlur = () => {
        handleExpressionEditorCancel();
    };

    const handleExpressionFormDiagnostics = useCallback(
        debounce(
            async (
                showDiagnostics: boolean,
                expression: string,
                key: string,
                property: ExpressionProperty,
                setDiagnosticsInfo: (diagnostics: FormDiagnostics) => void,
                shouldUpdateNode?: boolean,
                variableType?: string
            ) => {
                if (!showDiagnostics) {
                    setDiagnosticsInfo({ key, diagnostics: [] });
                    return;
                }

                try {
                    const field = fieldsRef.current.find(f => f.key === key);
                    if (field) {
                        const propertyPrimaryFieldType = getPrimaryInputType(property.types);
                        if (property.types.length > 1 && propertyPrimaryFieldType.fieldType !== "REPEATABLE_LIST" && propertyPrimaryFieldType.fieldType !== "REPEATABLE_MAP") {
                            property.types.forEach(t => {
                                if (t.fieldType === "EXPRESSION") {
                                    t.selected = true;
                                }
                                else {
                                    t.selected = false;
                                }
                            });
                        }
                        const response = await rpcClient.getBIDiagramRpcClient().getExpressionDiagnostics({
                            filePath: fileName,
                            context: {
                                expression: deserializeForDiagnosticsAPI(expression),
                                startLine: getAdjustedStartLine(targetLineRange, expressionOffsetRef.current),
                                lineOffset: 0,
                                offset: 0,
                                codedata: field.codedata,
                                property: property,
                            },
                        });

                        let uniqueDiagnostics = removeDuplicateDiagnostics(response.diagnostics);
                        // HACK: filter unknown module and undefined type diagnostics for local connections
                        uniqueDiagnostics = filterUnsupportedDiagnostics(uniqueDiagnostics);
                        // Apply custom diagnostic filter if provided
                        if (customDiagnosticFilter) {
                            uniqueDiagnostics = customDiagnosticFilter(uniqueDiagnostics);
                        }

                        setDiagnosticsInfo({ key, diagnostics: uniqueDiagnostics });
                    }
                } catch (error) {
                    // Remove diagnostics if LS crashes
                    console.error(">>> Error getting expression diagnostics", error);
                    setDiagnosticsInfo({ key, diagnostics: [] });
                }

            },
            250
        ),
        [rpcClient, fileName, targetLineRange, customDiagnosticFilter]
    );

    const handleGetHelperPane = (
        fieldKey: string,
        exprRef: RefObject<FormExpressionEditorRef>,
        anchorRef: RefObject<HTMLDivElement>,
        defaultValue: string,
        value: string,
        onChange: (value: string, options?: HelperpaneOnChangeOptions) => void,
        changeHelperPaneState: (isOpen: boolean) => void,
        helperPaneHeight: HelperPaneHeight,
        recordTypeField?: RecordTypeField,
        isAssignIdentifier?: boolean,
        types?: InputType[],
        inputMode?: InputMode,
    ) => {
        const handleHelperPaneClose = () => {
            debouncedRetrieveCompletions.cancel();
            changeHelperPaneState(false);
            handleExpressionEditorCancel();
        }

        return getHelperPaneNew({
            fieldKey: fieldKey,
            fileName: fileName,
            targetLineRange: targetLineRange ? updateLineRange(targetLineRange, expressionOffsetRef.current) : undefined,
            anchorRef: anchorRef,
            onClose: handleHelperPaneClose,
            defaultValue: defaultValue,
            currentValue: value,
            onChange: onChange,
            helperPaneHeight: helperPaneHeight,
            recordTypeField: recordTypeField,
            isAssignIdentifier: isAssignIdentifier,
            updateImports: handleUpdateImports,
            completions: completions,
            projectPath: projectPath,
            filteredCompletions: filteredCompletions,
            isInModal: false,
            types: types,
            handleRetrieveCompletions: handleRetrieveCompletions,
            inputMode: inputMode,
        });
    };

    const handleGetTypeHelper = (
        fieldKey: string,
        types: InputType[],
        typeBrowserRef: RefObject<HTMLDivElement>,
        currentType: string,
        currentCursorPosition: number,
        typeHelperState: boolean,
        onChange: (newType: string, newCursorPosition: number) => void,
        changeHelperPaneState: (isOpen: boolean) => void,
        typeHelperHeight: HelperPaneHeight,
        onTypeCreate: () => void,
        exprRef: RefObject<FormExpressionEditorRef>,
    ) => {
        const formField = fieldsValues.find(f => f.key === fieldKey);
        const handleCreateNewType = (typeName: string) => {
            onTypeCreate();
            setTypeEditorState({ isOpen: true, newTypeValue: typeName, field: formField });
            resetStack();
        }

        console.log("#STACK", stack);

        const handleCloseCompletions = () => {
            debouncedGetVisibleTypes.cancel();
            handleExpressionEditorCancel();
        }

        const typeHelperContext = isGraphqlEditor ?
            (fieldKey === 'returnType' ? TypeHelperContext.GRAPHQL_FIELD_TYPE
                : TypeHelperContext.GRAPHQL_INPUT_TYPE)
            : TypeHelperContext.HTTP_STATUS_CODE;

        return getTypeHelper({
            fieldKey: fieldKey,
            types: types,
            typeBrowserRef: typeBrowserRef,
            filePath: fileName,
            targetLineRange: targetLineRange ? updateLineRange(targetLineRange, expressionOffsetRef.current) : undefined,
            currentType: currentType,
            currentCursorPosition: currentCursorPosition,
            helperPaneHeight: typeHelperHeight,
            typeHelperState: typeHelperState,
            onChange: onChange,
            changeTypeHelperState: changeHelperPaneState,
            updateImports: handleUpdateImports,
            onTypeCreate: handleCreateNewType,
            onCloseCompletions: handleCloseCompletions,
            exprRef: exprRef,
            typeHelperContext: typeHelperContext,
            recordsOnly: recordsOnly,
        });
    }

    const handleTypeChange = async (type: Type,) => {
        setTypeEditorState({ ...typeEditorState, isOpen: true });

        if (typeEditorState.field) {
            const updatedFields = fieldsValues.map(field => {
                if (field.key === typeEditorState.field.key) {
                    // Only handle parameter type if editingField is a parameter
                    if ((typeEditorState.field.type === 'REPEATABLE_PROPERTY' || typeEditorState.field.type === 'PARAM_MANAGER')
                        && (field.type === 'REPEATABLE_PROPERTY' || field.type === 'PARAM_MANAGER')
                        && field.paramManagerProps?.formFields
                        && stack.length === 1
                    ) {
                        return {
                            ...field,
                            paramManagerProps: {
                                ...field.paramManagerProps,
                                formFields: field?.paramManagerProps?.formFields.map(subField =>
                                    subField.key === 'type' ? { ...subField, value: type.name } : subField
                                )
                            }
                        };
                    }
                    // Handle regular fields
                    return {
                        ...field,
                        value: type.name
                    };
                }
                return field;
            });
            setFields(updatedFields);
        }
    };

    const handleOpenTypeEditor = (isOpen: boolean, f: FormValues, editingField?: FormField, newType?: string | NodeProperties) => {
        // Get f.value and assign that value to field value
        const updatedFields = fields.map((field) => {
            const updatedField = { ...field };
            if (f[field.key]) {
                updatedField.value = f[field.key];
            }
            return updatedField;
        });
        setFields(updatedFields);
        setTypeEditorState({
            isOpen,
            field: editingField,
            newTypeValue: newType
                ? (typeof newType === 'string' ? newType : (newType as NodeProperties)?.type || newType)
                : f[editingField?.key]
        });
    };

    const handleUpdateImports = (key: string, imports: Imports, codedata?: CodeData) => {
        importsCodedataRef.current = codedata;
        const importKey = Object.keys(imports)?.[0];

        if (Object.keys(formImports).includes(key)) {
            if (importKey && !Object.keys(formImports[key]).includes(importKey)) {
                const updatedImports = { ...formImports, [key]: { ...formImports[key], ...imports } };
                formImportsRef.current = updatedImports;
                setFormImports(updatedImports);
            }
        } else {
            const updatedImports = { ...formImports, [key]: imports };
            formImportsRef.current = updatedImports;
            setFormImports(updatedImports);
        }
    }

    const onCloseTypeEditor = () => {
        setTypeEditorState({ ...typeEditorState, isOpen: false });
    };

    const handleTypeEditorStateChange = (state: boolean) => {
        if (!state) {
            if (stack.length > 1) {
                popTypeStack();
                return;
            }
            resetStack();
        }
        setTypeEditorState({ ...typeEditorState, isOpen: state });
    }

    const getNewTypeCreateForm = (fieldIndex?: number, typeName?: string) => {
        const currentTopItem = peekTypeStack();
        if (currentTopItem) {
            currentTopItem.fieldIndex = fieldIndex;
            replaceTop(currentTopItem);
        }
        pushTypeStack({
            type: defaultType(typeName),
            isDirty: false
        })
    }


    const onSaveType = (type: Type | string) => {
        handleValueTypeConstChange(typeof type === 'string' ? type : (type as Type).name);
        if (stack.length > 0) {
            if (stack.length > 1) {
                const newStack = [...stack]
                const currentTop = newStack[newStack.length - 1];
                const newTop = newStack[newStack.length - 2];
                if (newTop.type.codedata.node === "CLASS") {
                    newTop.type.functions[newTop.fieldIndex!].returnType = currentTop!.type.name;
                }
                else {
                    newTop.type.members[newTop.fieldIndex!].type = currentTop!.type.name;
                }
                newStack[newStack.length - 2] = newTop;
                newStack.pop();
                setStack(newStack);
            }
            setRefetchForCurrentModal(true);
        }
        setTypeEditorState({ ...typeEditorState, isOpen: stack.length !== 1 });
    }

    const extractArgsFromFunction = async (value: string, property: ExpressionProperty, cursorPosition: number) => {
        const { lineOffset, charOffset } = calculateExpressionOffsets(value, cursorPosition);
        // Merge the latest imports from formImportsRef to avoid stale field.imports when a
        // helper pane item is selected (formImportsRef is updated synchronously before onChange
        // fires, but the field prop hasn't re-rendered yet with the new imports).
        const latestImports = Object.values(formImportsRef.current).reduce<Imports>(
            (acc, fieldImports) => ({ ...acc, ...fieldImports }),
            {}
        );
        const signatureHelp = await rpcClient.getBIDiagramRpcClient().getSignatureHelp({
            filePath: fileName,
            context: {
                expression: value,
                startLine: getAdjustedStartLine(targetLineRange, expressionOffsetRef.current),
                lineOffset: lineOffset,
                offset: charOffset,
                codedata: undefined,
                property: { ...property, imports: { ...(property.imports || {}), ...latestImports } },
            },
            signatureHelpContext: {
                isRetrigger: false,
                triggerKind: 1,
            },
        });

        return await convertToFnSignature(signatureHelp);
    };

    const getExpressionTokens = async (expression: string, filePath: string, position: LinePosition): Promise<number[]> => {
        return rpcClient.getBIDiagramRpcClient().getExpressionTokens({
            expression: expression,
            filePath: filePath,
            position: position
        })
    }

    const openRecordConfigPage = (fieldKey: string, currentValue: string, recordTypeField: RecordTypeField, onChangeCallback: (value: string) => void) => {
        setRecordConfigPageState({
            isOpen: true,
            fieldKey,
            currentValue,
            recordTypeField,
            onChangeCallback
        });
    };

    const closeRecordConfigPage = () => {
        setRecordConfigPageState({
            isOpen: false
        });
    };

    const expressionEditor = useMemo(() => {
        return {
            completions: filteredCompletions,
            triggerCharacters: TRIGGER_CHARACTERS,
            retrieveCompletions: handleRetrieveCompletions,
            extractArgsFromFunction: extractArgsFromFunction,
            types: filteredTypes,
            referenceTypes: types,
            rpcManager: {
                getExpressionTokens: getExpressionTokens
            },
            retrieveVisibleTypes: handleGetVisibleTypes,
            getHelperPane: handleGetHelperPane,
            getTypeHelper: handleGetTypeHelper,
            getExpressionFormDiagnostics: handleExpressionFormDiagnostics,
            onCompletionItemSelect: handleCompletionItemSelect,
            onBlur: handleExpressionEditorBlur,
            onCancel: handleExpressionEditorCancel,
            onOpenRecordConfigPage: openRecordConfigPage,
            helperPaneOrigin: "vertical" as const,
            helperPaneHeight: "default" as const,
        } satisfies FormExpressionEditorProps;
    }, [
        filteredCompletions,
        filteredTypes,
        handleRetrieveCompletions,
        extractArgsFromFunction,
        handleGetVisibleTypes,
        handleGetHelperPane,
        handleGetTypeHelper,
        handleExpressionFormDiagnostics,
        handleCompletionItemSelect,
        handleExpressionEditorBlur,
        handleExpressionEditorCancel,
        openRecordConfigPage,
        types,
    ]);

    const handleSubmit = (values: FormValues) => {
        onSubmit(values, formImports, importsCodedataRef.current);
        importsCodedataRef.current = {};
    };

    // default form
    return (
        <EditorContext.Provider value={{ stack, push: pushTypeStack, pop: popTypeStack, peek: peekTypeStack, replaceTop: replaceTop }}>
            {fields && fields.length > 0 && (
                <Form
                    nestedForm={nestedForm}
                    formFields={fieldsValues}
                    projectPath={projectPath}
                    openRecordEditor={handleOpenTypeEditor}
                    openFormTypeEditor={handleOpenFormTypeEditor}
                    onCancelForm={onBack || onCancel}
                    popupManager={popupManager}
                    submitText={submitText}
                    cancelText={cancelText}
                    onSubmit={handleSubmit}
                    isSaving={isSaving}
                    openView={handleOpenView}
                    openSubPanel={openSubPanel}
                    expressionEditor={expressionEditor}
                    targetLineRange={targetLineRange}
                    fileName={fileName}
                    updatedExpressionField={updatedExpressionField}
                    resetUpdatedExpressionField={resetUpdatedExpressionField}
                    selectedNode={selectedNode}
                    compact={compact}
                    recordTypeFields={recordTypeFields}
                    disableSaveButton={disableSaveButton}
                    concertMessage={concertMessage}
                    concertRequired={concertRequired}
                    infoLabel={description}
                    formImports={formImports}
                    preserveOrder={preserveFieldOrder}
                    injectedComponents={injectedComponents}
                    changeOptionalFieldTitle={changeOptionalFieldTitle}
                    onChange={handleFieldChange}
                    hideSaveButton={hideSaveButton}
                    footerActionButton={footerActionButton}
                    onValidityChange={onValidityChange}
                />
            )}
            {
                stack.map((item, i) => <DynamicModal
                    key={i}
                    width={420}
                    height={600}
                    anchorRef={undefined}
                    title="Create New Type"
                    openState={typeEditorState.isOpen}
                    setOpenState={handleTypeEditorStateChange}>
                    {stack.slice(0, i + 1).length > 1 && (
                        <BreadcrumbContainer>
                            {stack.slice(0, i + 1).map((stackItem, index) => (
                                <React.Fragment key={index}>
                                    {index > 0 && <BreadcrumbSeparator>/</BreadcrumbSeparator>}
                                    <BreadcrumbItem>
                                        {stackItem?.type?.name || "NewType"}
                                    </BreadcrumbItem>
                                </React.Fragment>
                            ))}
                        </BreadcrumbContainer>
                    )}
                    <div style={{ height: '560px', overflow: 'auto' }}>
                        <FormTypeEditor
                            type={peekTypeStack() && peekTypeStack().type ? peekTypeStack().type : defaultType()}
                            newType={peekTypeStack() ? peekTypeStack().isDirty : false}
                            newTypeValue={typeEditorState.newTypeValue}
                            isPopupTypeForm={true}
                            isGraphql={isGraphqlEditor}
                            // payloadContext={{protocol: "GRAPHQL"}}
                            onTypeChange={handleTypeChange}
                            onSaveType={onSaveType}
                            onTypeCreate={() => { }}
                            getNewTypeCreateForm={getNewTypeCreateForm}
                            refetchTypes={refetchStates[i]}
                        />
                    </div>
                </DynamicModal>)
            }
            <EntryPointTypeCreator
                isOpen={isTypeEditorOpen}
                onClose={handleTypeEditorClose}
                onTypeCreate={handleTypeCreated}
                initialTypeName={editingTypeName || "WorkflowInput"}
                modalTitle="Define Workflow Input Type"
                modalWidth={650}
                modalHeight={600}
            />
            {recordConfigPageState.isOpen &&
                recordConfigPageState.fieldKey &&
                recordConfigPageState.recordTypeField &&
                recordConfigPageState.onChangeCallback && (
                    <DynamicModal
                        width={800}
                        height={600}
                        anchorRef={undefined}
                        title="Record Configuration"
                        openState={recordConfigPageState.isOpen}
                        setOpenState={(isOpen: boolean) => {
                            if (!isOpen) {
                                closeRecordConfigPage();
                            }
                        }}
                        closeOnBackdropClick={true}
                        closeButtonIcon="minimize"
                    >
                        <ConfigureRecordPage
                            fileName={fileName}
                            targetLineRange={targetLineRange ? updateLineRange(targetLineRange, expressionOffsetRef.current) : undefined}
                            onChange={(value: string, isRecordConfigureChange: boolean) => {
                                recordConfigPageState.onChangeCallback!(value);
                            }}
                            currentValue={recordConfigPageState.currentValue || ""}
                            recordTypeField={recordConfigPageState.recordTypeField}
                            onClose={closeRecordConfigPage}
                            getHelperPane={handleGetHelperPane}
                            field={fieldsValues.find(f => f.key === recordConfigPageState.fieldKey)}
                            triggerCharacters={TRIGGER_CHARACTERS}
                            formContext={{
                                expressionEditor: expressionEditor,
                                popupManager: popupManager,
                                nodeInfo: {
                                    kind: selectedNode || "EXPRESSION"
                                }
                            }}
                        />
                    </DynamicModal>
                )}
        </EditorContext.Provider>
    );
}

export default ArtifactForm;
