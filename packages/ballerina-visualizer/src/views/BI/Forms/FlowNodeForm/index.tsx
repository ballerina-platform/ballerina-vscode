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

import { RefObject, useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import {
    EVENT_TYPE,
    FlowNode,
    LineRange,
    NodePosition,
    SubPanel,
    VisualizerLocation,
    TRIGGER_CHARACTERS,
    TriggerCharacter,
    FormDiagnostics,
    TextEdit,
    SubPanelView,
    LinePosition,
    ExpressionProperty,
    Type,
    RecordTypeField,
    Imports,
    CodeData,
    VisualizableField,
    Member,
    TypeNodeKind,
    NodeKind,
    EditorConfig,
    InputType,
    getPrimaryInputType,
    functionKinds,
    NodeProperties,
    DiagnosticMessage,
    AvailableNode,
    ParentPopupData,
} from "@wso2/ballerina-core";
import {
    FieldDerivation,
    FormField,
    FormValues,
    Form,
    ExpressionFormField,
    FormExpressionEditorProps,
    PanelContainer,
    FormImports,
    HelperpaneOnChangeOptions,
    InputMode,
    ExpressionEditorDevantProps,
    getTypeCompletionSearchText,
    getInputModeFromTypes,
} from "@wso2/ballerina-side-panel";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import {
    Button,
    CompletionItem,
    FormExpressionEditorRef,
    HelperPaneHeight,
    Icon,
    LabelInfo,
    ThemeColors,
    Tooltip,
} from "@wso2/ui-toolkit";
import styled from "@emotion/styled";

import {
    convertBalCompletion,
    convertNodePropertiesToFormFields,
    convertToFnSignature,
    convertToVisibleTypes,
    enrichFormTemplatePropertiesWithValues,
    filterUnsupportedDiagnostics,
    getFormProperties,
    getImportsForFormFields,
    calculateExpressionOffsets,
    injectHighlightTheme,
    removeDuplicateDiagnostics,
    updateLineRange,
    convertRecordTypeToCompletionItem,
    convertItemsToCompletionItems,
} from "../../../../utils/bi";
import IfForm from "../IfForm";
import { ConnectionConfigurationPopup } from "../../Connection/ConnectionConfigurationPopup";
import { createPortal } from "react-dom";
import { cloneDeep, debounce } from "lodash";
import {
    createNodeWithUpdatedLineRange,
    deserializeForDiagnosticsAPI,
    processFormData,
    removeEmptyNodes,
    updateNodeWithProperties,
} from "../form-utils";
import ForkForm from "../ForkForm";
import { FormTypeEditor } from "../../TypeEditor";
import { getTypeHelper } from "../../TypeHelper";
import { EXPRESSION_EXTRACTION_REGEX, TypeHelperContext } from "../../../../constants";
import MatchForm from "../MatchForm";
import { FormSubmitOptions } from "../../FlowDiagram";
import { AI_PROMPT_TYPE, getHelperPaneNew } from "../../HelperPaneNew";
import { ConfigureRecordPage } from "../../HelperPaneNew/Views/RecordConfigModal";
import { VariableForm } from "../DeclareVariableForm";
import KnowledgeBaseForm from "../KnowledgeBaseForm";
import SendEventForm from "../SendEventForm";
import { EditorContext, StackItem, TypeHelperItem } from "@wso2/type-editor";
import DynamicModal from "../../../../components/Modal";
import { EntryPointTypeCreator } from "../../../../components/EntryPointTypeCreator";
import React from "react";
import { SidePanelView } from "../../FlowDiagram/PanelManager";
import { ConnectionKind, useCreateConnection } from "../../../../components/ConnectionSelector";
import { getFilteredTypesByKind } from "../../TypeEditor/utils";
import { useModalStack } from "../../../../Context";
import { getArraySubFormFieldFromTypes, stringToRawArrayElements, stringToRawObjectEntries } from "@wso2/ballerina-side-panel/lib/components/editors/utils";

interface FlowNodeTypeEditorState {
    isOpen: boolean;
    fieldKey?: string; // Optional, to store the key of the field being edited
    newTypeValue?: string;
}

export interface ResolvedType {
    name: string;
    value: string;
    sortText?: string;
    codeData?: CodeData;
    labelDetails?: LabelInfo;
}

export interface ResolvedType {
    name: string;
    value: string;
    sortText?: string;
    codeData?: CodeData;
    labelDetails?: LabelInfo;
}

interface FlowNodeFormProps {
    fileName: string;
    node: FlowNode;
    nodeFormTemplate?: FlowNode; // used in edit forms
    connections?: FlowNode[];
    clientName?: string;
    targetLineRange: LineRange;
    projectPath?: string;
    editForm?: boolean;
    isGraphql?: boolean;
    submitText?: string;
    onSubmit: (node?: FlowNode, editorConfig?: EditorConfig, formImports?: FormImports, rawFormValues?: FormValues) => void;
    showProgressIndicator?: boolean;
    subPanelView?: SubPanelView;
    openSubPanel?: (subPanel: SubPanel) => void;
    updatedExpressionField?: ExpressionFormField;
    resetUpdatedExpressionField?: () => void;
    disableSaveButton?: boolean;
    actionButtonConfig?: {
        actionLabel: string;
        description?: string; // Optional description explaining what the action button does
        callback: () => void;
    };
    handleOnFormSubmit?: (updatedNode?: FlowNode, editorConfig?: EditorConfig, options?: FormSubmitOptions) => void;
    isInModal?: boolean;
    scopeFieldAddon?: React.ReactNode;
    onChange?: (fieldKey: string, value: any, allValues: FormValues) => void;
    injectedComponents?: {
        component: React.ReactNode;
        index: number;
        advanced?: boolean;
    }[];
    navigateToPanel?: (panel: SidePanelView, connectionKind?: ConnectionKind) => void;
    fieldPriority?: Record<string, number>; // Map of field keys to priority numbers (lower = rendered first)
    fieldOverrides?: Record<string, Partial<FormField>>;
    footerActionButton?: boolean; // Render save button as footer action button
    hideInfoBanner?: boolean; // Hide the auto-generated "no required parameters" info banner
    derivedFields?: FieldDerivation[]; // Configuration for auto-deriving field values from other fields
    bottomFields?: string[];
    devantExpressionEditor?: ExpressionEditorDevantProps;
    customValidator?: (fieldKey: string, value: any, allValues: FormValues) => string | undefined; // Custom validation function for form fields
    defaultExpandAdvanced?: boolean;
    onConnectionCreated?: () => void; // Notified when a connection (e.g. model provider) is created from a field
}

const EXPRESSION_FIELD_TYPES = new Set([
    "EXPRESSION",
    "ACTION_OR_EXPRESSION",
    "LV_EXPRESSION",
    "ACTION_EXPRESSION",
    "EXPRESSION_SET",
]);

type RepeatableMapEntry = {
    key: string;
    value: string;
};

const getRepeatableMapEntriesFromValue = (value: unknown): RepeatableMapEntry[] => {
    if (typeof value === "string") {
        return stringToRawObjectEntries(value);
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.entries(value as Record<string, any>).map(([entryKey, entryValue]) => ({
            key: entryKey,
            value: typeof entryValue === "object" && entryValue !== null
                ? String((entryValue as any).value ?? "")
                : String(entryValue ?? "")
        }));
    }

    return [];
};

const getRepeatableMapDiagnosticsByKey = (value: unknown): Record<string, any> | undefined => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, any>;
    }

    return undefined;
};

// Styled component for the action button description
const ActionButtonDescription = styled.div`
    font-size: var(--vscode-font-size);
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin-bottom: 8px;
    line-height: 1.4;
`;

// Styled component for the action button container
const ActionButtonContainer = styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
`;

// Styled component for the action button
const StyledActionButton = styled(Button)`
    width: 100%;
    & > vscode-button {
        width: 100%;
    }
`;

const ActionButton = styled(Button)`
    display: flex;
    align-items: center;
    gap: 4px;
`;

const DiagnosticsActionContent = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    white-space: nowrap;
    width: 100%;
`;

export const BreadcrumbContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 20px;
    background: ${ThemeColors.SURFACE_CONTAINER};
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

export const BreadcrumbItem = styled.span`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: var(--vscode-font-size);
    
    &:last-child {
        color: ${ThemeColors.ON_SURFACE};
        font-weight: 500;
    }
`;

export const BreadcrumbSeparator = styled.span`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: var(--vscode-font-size);
`;

export const FlowNodeForm = forwardRef<FormExpressionEditorRef, FlowNodeFormProps>(function FlowNodeForm(props: FlowNodeFormProps, ref: React.ForwardedRef<FormExpressionEditorRef>) {
    const {
        fileName,
        node,
        nodeFormTemplate,
        connections,
        clientName,
        targetLineRange,
        projectPath,
        showProgressIndicator,
        isGraphql,
        onSubmit,
        subPanelView,
        openSubPanel,
        updatedExpressionField,
        resetUpdatedExpressionField,
        disableSaveButton,
        actionButtonConfig,
        submitText,
        handleOnFormSubmit,
        isInModal,
        scopeFieldAddon,
        onChange,
        injectedComponents,
        fieldPriority,
        footerActionButton,
        hideInfoBanner,
        customValidator,
    } = props;

    const { rpcClient } = useRpcContext();

    const [baseFields, setBaseFields] = useState<FormField[]>([]);
    const [formDiagnostics, setFormDiagnostics] = useState<DiagnosticMessage[]>([]);
    const [isAiUserAuthenticated, setIsAiUserAuthenticated] = useState(false);
    const formImportsRef = useRef<FormImports>({});
    const [typeEditorState, setTypeEditorState] = useState<FlowNodeTypeEditorState>({ isOpen: false, newTypeValue: "" });
     const [isTypeEditorOpen, setIsTypeEditorOpen] = useState<boolean>(false);
    const [editingTypeName, setEditingTypeName] = useState<string>("");
    const [visualizableField, setVisualizableField] = useState<VisualizableField>();
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);

    const fields = useMemo(() => {
        if (!props.fieldOverrides || baseFields.length === 0) {
            return baseFields;
        }
        return baseFields.map(field => {
            const override = props.fieldOverrides[field.key];
            if (override) {
                return { ...field, ...override };
            }
            return field;
        });
    }, [baseFields, props.fieldOverrides]);

    /* Expression editor related state and ref variables */
    const prevCompletionFetchText = useRef<string>("");
    const [completions, setCompletions] = useState<CompletionItem[]>([]);
    const completionsRef = useRef<CompletionItem[]>([]);
    const [filteredCompletions, setFilteredCompletions] = useState<CompletionItem[]>([]);
    const [types, setTypes] = useState<CompletionItem[]>([]);
    const typesRef = useRef<CompletionItem[]>([]);
    const [filteredTypes, setFilteredTypes] = useState<CompletionItem[]>([]);
    const expressionOffsetRef = useRef<number>(0); // To track the expression offset on adding import statements

    const [pendingConnectionPopup, setPendingConnectionPopup] = useState<{
        selectedConnector: AvailableNode;
        onSaved: (variableName: string) => void;
    } | null>(null);

    const handleRequestCreateConnection = (params: {
        selectedConnector: AvailableNode;
        onSaved: (variableName: string) => void;
    }) => {
        setPendingConnectionPopup(params);
    };

    const handleCloseConnectionPopup = (parent?: ParentPopupData) => {
        if (parent?.recentIdentifier && pendingConnectionPopup?.onSaved) {
            pendingConnectionPopup.onSaved(parent.recentIdentifier);
        }
        setPendingConnectionPopup(null);
    };

    useEffect(() => { completionsRef.current = completions; }, [completions]);
    useEffect(() => { typesRef.current = types; }, [types]);

    const { addModal, closeModal, popModal } = useModalStack()

    const [selectedType, setSelectedType] = useState<ResolvedType | null>(null);

    const skipFormValidation = useMemo(() => {
        const isAgentNode = node && (
            (node.codedata.node === "AGENT_CALL" || node.codedata.node === "AGENT_RUN") &&
            node.codedata.org === "ballerina" &&
            node.codedata.module === "ai" &&
            node.codedata.packageName === "ai" &&
            node.codedata.object === "Agent" &&
            node.codedata.symbol === "run"
        );
        const isDataMapperCreationNode = node && node.codedata.node === "DATA_MAPPER_CREATION";
        const isFunctionCreationNode = node && node.codedata.node === "FUNCTION_CREATION";

        return isAgentNode || isDataMapperCreationNode || isFunctionCreationNode;
    }, [node]);

    const importsCodedataRef = useRef<any>(null); // To store codeData for getVisualizableFields
    const formOpenedRef = useRef(false); // Tracks whether the expr:// form document has been opened (lazy)
    const typeResolutionId = useRef(0);

    //stack for recursive type creation
    const [stack, setStack] = useState<StackItem[]>([{
        isDirty: false,
        type: undefined
    }]);
    const [refetchStates, setRefetchStates] = useState<boolean[]>([false]);

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

    const resetStack = () => {
        setStack([getDefaultValue()]);
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

            rpcClient.getAiPanelRpcClient().isUserAuthenticated()
                .then((isAuth) => {
                    setIsAiUserAuthenticated(isAuth);
                })
                .catch(() => {
                    setIsAiUserAuthenticated(false);
                });
        }
    }, [rpcClient]);

    useEffect(() => {
        if (showProgressIndicator) {
            return;
        }
        if (!node) {
            return;
        }

        if ((node.codedata.node === "VARIABLE" || node.codedata.node === "CONFIG_VARIABLE") &&
            node.properties?.type?.value &&
            (node.properties.type.value as string).length > 0) {
            handleValueTypeConstChange(node.properties.type.value as string);
        }
        if (node.codedata.node === "IF") {
            return;
        }
        formOpenedRef.current = false;
        initForm(node);

        return () => {
            if (formOpenedRef.current) {
                handleFormClose();
            }
        };
    }, [node, showProgressIndicator]);


    const handleFormOpen = () => {
        rpcClient
            .getBIDiagramRpcClient()
            .formDidOpen({ filePath: fileName })
            .then(() => {
                console.log(">>> Form opened");
            });
    };

    const handleFormClose = () => {
        rpcClient
            .getBIDiagramRpcClient()
            .formDidClose({ filePath: fileName })
            .then(() => {
                console.log(">>> Form closed");
            });
    };

    const ensureFormOpened = () => {
        if (!formOpenedRef.current) {
            formOpenedRef.current = true;
            handleFormOpen();
        }
    };

    // Sorts form fields based on the fieldPriority prop.
    //  Fields with lower priority numbers are rendered first.
    const sortFieldsByPriority = (fields: FormField[]): FormField[] => {
        if (!fieldPriority || Object.keys(fieldPriority).length === 0) {
            return fields;
        }

        return [...fields].sort((a, b) => {
            const priorityA = fieldPriority[a.key] ?? Number.MAX_SAFE_INTEGER;
            const priorityB = fieldPriority[b.key] ?? Number.MAX_SAFE_INTEGER;

            // If priorities are equal, maintain original order
            if (priorityA === priorityB) {
                return 0;
            }

            return priorityA - priorityB;
        });
    };

    const normalizeTextFields = (fields: FormField[]): FormField[] => {
        return fields.map((field) => {
            const primaryInputType = getPrimaryInputType(field.types);
            const isTextField = field.type === "TEXT" || primaryInputType?.fieldType === "TEXT";
            const normalizedLabel = `${field.metadata?.label ?? field.label ?? ""}`.toLowerCase();
            const isDescriptionField = normalizedLabel.includes("description") || normalizedLabel.includes("discription");

            if (isTextField && isDescriptionField) {
                return {
                    ...field,
                    type: "TEXTAREA",
                };
            }
            return field;
        });
    };

    const hideTypeDescriptionField = (fields: FormField[]): FormField[] => {
        return fields.map((field) => {
            if (field.key === "typeDescription") {
                return {
                    ...field,
                    hidden: true,
                };
            }
            return field;
        });
    };

    const initForm = (node: FlowNode) => {
        setFormDiagnostics(node.diagnostics?.diagnostics ?? []);
        const formProperties = getFormProperties(node);
        let enrichedNodeProperties;
        if (nodeFormTemplate) {
            const formTemplateProperties = getFormProperties(nodeFormTemplate);
            enrichedNodeProperties = enrichFormTemplatePropertiesWithValues(formProperties, formTemplateProperties);
        }

        const nodeProperties = enrichedNodeProperties || formProperties;

        if (node.codedata.node === "WORKFLOW" && nodeProperties?.inputType) {
            const inputTypeProperty = nodeProperties.inputType;
            const typeModelName = (getPrimaryInputType(inputTypeProperty.types) as any)?.typeModel?.name;
            nodeProperties.inputType = {
                ...inputTypeProperty,
                editable: true,
                value: inputTypeProperty.value || typeModelName || "",
            };
        }

        // hide connection property if node is a REMOTE_ACTION_CALL or RESOURCE_ACTION_CALL node
        if (node.codedata.node === "REMOTE_ACTION_CALL" || node.codedata.node === "RESOURCE_ACTION_CALL") {
            if (enrichedNodeProperties?.connection) {
                enrichedNodeProperties.connection.optional = true;
            } else if (formProperties?.connection) {
                formProperties.connection.optional = true;
            }
        }

        if (node.codedata.node === "VARIABLE") {
            const codedata = importsCodedataRef.current || { symbol: formProperties?.type.value };
            rpcClient
                .getDataMapperRpcClient()
                .getVisualizableFields({ filePath: fileName, codedata })
                .then((res) => {
                    setVisualizableField(res.visualizableProperties);
                });
        }

        // Extract fields with typeMembers where kind is RECORD_TYPE
        const recordTypeFields = Object.entries(formProperties)
            .filter(([_, property]) => {
                const primaryInputType = getPrimaryInputType(property?.types);

                return primaryInputType?.typeMembers &&
                    primaryInputType?.typeMembers.some(member => member.kind === "RECORD_TYPE");
            })
            .map(([key, property]) => ({
                key,
                property,
                recordTypeMembers: getPrimaryInputType(property?.types)?.typeMembers.filter(member => member.kind === "RECORD_TYPE")
            }));

        setRecordTypeFields(recordTypeFields);

        // get node properties
        let fields = convertNodePropertiesToFormFields(nodeProperties, connections, clientName);

        if (node.codedata.node === "WORKFLOW") {
            fields = fields.map((field) => {
                if (field.key !== "inputType") {
                    return field;
                }
                return {
                    ...field,
                    editable: true,
                    isContextTypeSupported: true,
                };
            });
        }

        fields = normalizeTextFields(fields);
        fields = hideTypeDescriptionField(fields);

        const sortedFields = sortFieldsByPriority(fields);
        setBaseFields(sortedFields);
        formImportsRef.current = getImportsForFormFields(sortedFields);
    };

    const setDiagnosticsToFields = (data: FormValues, nodeWithDiagnostics: FlowNode) => {
        setFormDiagnostics(nodeWithDiagnostics?.diagnostics?.diagnostics ?? []);
        const updatedFields = fields.map((field) => {
            const updatedField = { ...field };

            const isRepeatableList = field.types?.length === 1 && getPrimaryInputType(field.types)?.fieldType === "REPEATABLE_LIST";
            const selectedInputType = isRepeatableList ? getPrimaryInputType(field.types) : field.types?.find(t => t.selected);
            const isContainingRepeatableList = field.types?.some(t => t.fieldType === "REPEATABLE_LIST");
            const isContainingRepeatableMap = field.types?.some(t => t.fieldType === "REPEATABLE_MAP");


            const nodeProperties = nodeWithDiagnostics?.properties as any;
            let propertyDiagnostics: any = nodeProperties?.[field.key]?.diagnostics?.diagnostics;

            // Update value from current form data and update diagnostics
            if (data[field.key] !== undefined) {
                if (isContainingRepeatableList && Array.isArray(nodeProperties?.[field.key]?.value)) {
                    if (selectedInputType?.fieldType === "REPEATABLE_LIST") {
                        let initialValues: string[];
                        if (typeof data[field.key] === 'string') {
                            initialValues = stringToRawArrayElements(data[field.key]);
                        } else {
                            // When the value is an array (from FormArrayEditor), extract values directly
                            initialValues = (data[field.key] as any[]).map((val: any) =>
                                typeof val === 'string' ? val : String(val?.value ?? '')
                            );
                        }
                        const initialFields = initialValues.map((val, index) => {
                            const key = crypto.randomUUID();
                            return {
                                ...getArraySubFormFieldFromTypes(key, (field.types[0] as any).template.types as InputType[]),
                                value: val,
                                diagnostics: nodeProperties?.[field.key]?.value?.[index]?.diagnostics?.diagnostics ?? []
                            };
                        });
                        updatedField.value = initialFields;
                    }
                    else {
                        updatedField.value = data[field.key];
                        propertyDiagnostics = nodeProperties?.[field.key]?.value?.map((val: any) => val?.diagnostics?.diagnostics ?? []).flat() ?? [];
                    }
                }

                else if (isContainingRepeatableMap) {
                    // Diagnostics responses do not preserve a single map shape consistently.
                    // Optional maps may omit `value`, while populated maps can come back either
                    // as editor-friendly objects or as serialized source strings.
                    const repeatableMapDiagnostics = getRepeatableMapDiagnosticsByKey(nodeProperties?.[field.key]?.value);
                    if (selectedInputType?.fieldType === "REPEATABLE_MAP") {
                        const initialValues = getRepeatableMapEntriesFromValue(data[field.key]);
                        // Keep value as a Record to match processToOutputFormat shape expected by FormMapEditorNew
                        const outputRecord: Record<string, unknown> = {};
                        initialValues.forEach((val) => {
                            const key = crypto.randomUUID();
                            outputRecord[val.key] = {
                                ...getArraySubFormFieldFromTypes(key, (field.types[0] as any).template.types as InputType[]),
                                key: `mp-val-${key}`,
                                value: val.value,
                                diagnostics: repeatableMapDiagnostics?.[val.key]?.diagnostics?.diagnostics ?? []
                            };
                        });
                        updatedField.value = outputRecord;
                    }
                    else {
                        updatedField.value = data[field.key];
                    }
                }
                else {
                    updatedField.value = data[field.key];
                }
            }


            // If the field is a repeatable list, store a copy of collected diagnostics for each element in the root
            // level so that the exp mode also can show the diagnostics. Property-level diagnostics don't have a
            // `range`, so use a simple message-based dedupe and provide explicit typing to satisfy TypeScript.
            if (isRepeatableList && !(Array.isArray(propertyDiagnostics) && propertyDiagnostics.length > 0)) {
                const collectedDiagnostics = (
                    nodeProperties?.[field.key]?.value?.map((val: any) => val?.diagnostics?.diagnostics) ?? []
                ).flat().filter(Boolean) as Array<{ message?: string; severity?: string }>;

                propertyDiagnostics = collectedDiagnostics.filter((d, i, arr) =>
                    arr.findIndex(x => x.message === d.message) === i
                );
            }

            if (isContainingRepeatableMap && !(Array.isArray(propertyDiagnostics) && propertyDiagnostics.length > 0)) {
                const collectedDiagnostics = Object.values(
                    getRepeatableMapDiagnosticsByKey(nodeProperties?.[field.key]?.value) ?? {}
                )
                    .map((value: any) => value?.diagnostics?.diagnostics)
                    .flat()
                    .filter(Boolean) as Array<{ message?: string; severity?: string }>;

                propertyDiagnostics = collectedDiagnostics.filter((d, i, arr) =>
                    arr.findIndex(x => x.message === d.message) === i
                );
            }

            if (propertyDiagnostics && Array.isArray(propertyDiagnostics)) {
                updatedField.diagnostics = propertyDiagnostics;
            } else {
                updatedField.diagnostics = [];
            }
            if (customValidator) {
                const customValidationMessage = customValidator(field.key, data[field.key], data);
                if (customValidationMessage) {
                    updatedField.diagnostics = [...updatedField.diagnostics, {
                        message: customValidationMessage,
                        severity: "ERROR"
                    }]
                }
            }
            return updatedField;
        });
        setBaseFields(updatedFields);
    }

    const handleOnSubmit = (data: FormValues, dirtyFields: any) => {
        console.log(">>> FlowNodeForm handleOnSubmit", data);
        if (node && targetLineRange) {
            const updatedNode = mergeFormDataWithFlowNode(data, targetLineRange, dirtyFields);
            const editorConfig = data["editorConfig"];
            onSubmit(updatedNode, editorConfig, formImportsRef.current);
        }
    };

    const diagnosticsTargetRange = useMemo(
        () => node?.codedata?.lineRange || nodeFormTemplate?.codedata?.lineRange || targetLineRange,
        [node, nodeFormTemplate, targetLineRange]
    );

    const canFixFormDiagnostics = useMemo(
        () => formDiagnostics.length > 0 && !!diagnosticsTargetRange && !showProgressIndicator && isAiUserAuthenticated,
        [diagnosticsTargetRange, formDiagnostics, isAiUserAuthenticated, showProgressIndicator]
    );

    const formDiagnosticsFixTooltip = !isAiUserAuthenticated
        ? "You need to be logged into BI Copilot to fix diagnostics"
        : !diagnosticsTargetRange
            ? "No source location available for diagnostics"
            : formDiagnostics.length === 0
                ? "No diagnostics found to fix"
                : undefined;

    const handleFixFormDiagnostics = useCallback(() => {
        if (!canFixFormDiagnostics || !diagnosticsTargetRange) {
            return;
        }

        const filePath = diagnosticsTargetRange.fileName || fileName;
        const fixPrompt = [
            "Fix the following diagnostics at this code location:",
            ...formDiagnostics.map((diagnostic, index) => `${index + 1}. [${diagnostic.severity}] ${diagnostic.message}`),
            "",
            "Apply the minimum required code changes to resolve these diagnostics.",
        ].join("\n");

        rpcClient.getAiPanelRpcClient().openAIPanel({
            type: "text",
            text: fixPrompt,
            planMode: false,
            codeContext: {
                type: "addition",
                position: {
                    line: diagnosticsTargetRange.startLine.line,
                    offset: diagnosticsTargetRange.startLine.offset,
                },
                filePath,
            },
            autoSubmit: true,
        });
    }, [canFixFormDiagnostics, diagnosticsTargetRange, fileName, formDiagnostics, rpcClient]);

    const buildValidationData = (data: FormValues): FormValues => {
        const expressionFieldKeys = fields
            .filter(field => field.types?.some(t => EXPRESSION_FIELD_TYPES.has(t.fieldType))).map(field => field.key);
        return {
            ...data,
            ...Object.fromEntries(
                expressionFieldKeys
                    .filter(key => typeof data[key] === "string")
                    .map(key => [key, deserializeForDiagnosticsAPI(data[key] as string)])
            ),
        };
    };

    const handleOnBlur = async (data: FormValues, dirtyFields: any) => {
        if (node && targetLineRange && !skipFormValidation) {
            const validationData = buildValidationData(data);

            const updatedNode = mergeFormDataWithFlowNode(validationData, targetLineRange, dirtyFields);
            const nodeWithDiagnostics = await getFormWithDiagnostics(updatedNode);
            setDiagnosticsToFields(data, nodeWithDiagnostics!);
        }
    };

    const handleFormChange = useCallback(
        (fieldKey: string, value: any, allValues: FormValues) => {
            setFormDiagnostics(prev => prev.length > 0 ? [] : prev);
            onChange?.(fieldKey, value, allValues);
        },
        [onChange]
    );


    const mergeFormDataWithFlowNode = (data: FormValues, targetLineRange: LineRange, dirtyFields?: any): FlowNode => {
        const clonedNode = cloneDeep(node);

        // When a template is available, enrich the cloned node's properties with the
        // template's property structure before saving. This ensures that properties
        // with null values (e.g. the expression on a bare `return;`) are replaced with
        // fully-formed Property objects so that updateNodeProperties can set their values.
        if (nodeFormTemplate) {
            const formProperties = getFormProperties(clonedNode);
            const formTemplateProperties = getFormProperties(nodeFormTemplate);
            const enrichedProperties = enrichFormTemplatePropertiesWithValues(formProperties, formTemplateProperties);

            if (clonedNode.branches?.at(0)?.properties) {
                clonedNode.branches[0].properties = enrichedProperties;
            } else {
                clonedNode.properties = enrichedProperties;
            }
        }

        // Create updated node with new line range
        const updatedNode = createNodeWithUpdatedLineRange(clonedNode, targetLineRange);

        // assign to a existing variable
        const processedData = processFormData(data);

        // Update node properties
        const nodeWithUpdatedProps = updateNodeWithProperties(clonedNode, updatedNode, processedData, formImportsRef.current, dirtyFields);

        // check all nodes and remove empty nodes
        return removeEmptyNodes(nodeWithUpdatedProps);
    };

    const handleOpenView = async (location: VisualizerLocation) => {
        const context: VisualizerLocation = {
            documentUri: location.documentUri,
            position: location.position,
        };
        await rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.OPEN_VIEW, location: context });
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
        setBaseFields(updatedFields);
        const newTypeValue = typeof newType === 'string' ? newType : f[editingField?.key];
        setTypeEditorState({ isOpen, fieldKey: editingField?.key, newTypeValue });
    };

    const handleOpenFormTypeEditor = (open: boolean, typeName?: string, editingField?: FormField) => {
        setTypeEditorState((prevState) => ({
            ...prevState,
            fieldKey: editingField?.key,
            newTypeValue: typeName || "",
        }));
        setIsTypeEditorOpen(open);
        setEditingTypeName(typeName || "");
    };

    const handleTypeEditorClose = () => {
        setIsTypeEditorOpen(false);
        setEditingTypeName("");
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

    const handleUpdateImports = (key: string, imports: Imports, codedata?: CodeData) => {
        importsCodedataRef.current = codedata;
        const importKey = Object.keys(imports)?.[0];

        const prevImports = formImportsRef.current;
        if (key in prevImports) {
            if (importKey && importKey in prevImports[key]) {
                formImportsRef.current = { ...prevImports, [key]: { ...prevImports[key], ...imports } };
            }
        } else {
            formImportsRef.current = { ...prevImports, [key]: imports };
        }
    }

    const handleTypeCreated = (type: Type | string, imports?: Imports) => {
        const typeName = typeof type === "string" ? type : type?.name;
        if (typeName) {
            const targetFieldKey = typeEditorState.fieldKey || "type";
            const updatedFields = fields.map((field) => {
                if (field.key === targetFieldKey) {
                    return { ...field, value: typeName };
                }
                return field;
            });
            setBaseFields(updatedFields);
            if (imports) {
                handleUpdateImports(targetFieldKey, imports);
            }
        }
        // handleTypeEditorClose();
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
                const cachedCompletions = completionsRef.current;
                if (
                    cachedCompletions.length > 0 &&
                    !triggerCharacter &&
                    parentContent !== undefined &&
                    parentContent === prevCompletionFetchText.current
                ) {
                    expressionCompletions = cachedCompletions
                        .filter((completion) => {
                            const lowerCaseText = currentContent.toLowerCase();
                            const lowerCaseLabel = completion.label.toLowerCase();

                            return lowerCaseLabel.includes(lowerCaseText);
                        })
                        .sort((a, b) => a.sortText.localeCompare(b.sortText));
                } else {
                    const { lineOffset, charOffset } = calculateExpressionOffsets(value, offset);
                    let completions = await rpcClient.getBIDiagramRpcClient().getExpressionCompletions({
                        filePath: fileName,
                        context: {
                            expression: value,
                            startLine: updateLineRange(targetLineRange, expressionOffsetRef.current).startLine,
                            lineOffset: lineOffset,
                            offset: charOffset,
                            codedata: node.codedata,
                            property: property
                        },
                        completionContext: {
                            triggerKind: triggerCharacter ? 2 : 1,
                            triggerCharacter: triggerCharacter as TriggerCharacter
                        }
                    });

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
        [rpcClient, fileName, targetLineRange, node]
    );

    const handleRetrieveCompletions = useCallback(
        async (
            value: string,
            property: ExpressionProperty,
            offset: number,
            triggerCharacter?: string
        ) => {
            await debouncedRetrieveCompletions(value, property, offset, triggerCharacter);

            if (triggerCharacter) {
                await debouncedRetrieveCompletions.flush();
            }
        },
        [debouncedRetrieveCompletions]
    );

    const debouncedGetVisibleTypes = useCallback(
        debounce(
            async (
                value: string,
                cursorPosition: number,
                fetchReferenceTypes: boolean,
                valueTypeConstraint?: string
            ) => {
                let visibleTypes: CompletionItem[] = typesRef.current;
                if (!visibleTypes.length) {
                    const searchResponse = await rpcClient.getBIDiagramRpcClient().search({
                        filePath: fileName,
                        position: targetLineRange,
                        queryMap: {
                            q: '',
                            offset: 0,
                            limit: 1000
                        },
                        searchKind: 'TYPE'
                    });

                    const rawAllItems = searchResponse.categories.flatMap(category =>
                        category.items.flatMap(item => {
                            if ('codedata' in item) {
                                return [item];
                            } else if ('items' in item) {
                                return item.items;
                            }
                            return [];
                        })
                    );

                    // Deduplicate search items by org+module+symbol to avoid showing the same
                    // type multiple times when it appears in both "Current Integration" and "Imported" categories
                    const seenKeys = new Set<string>();
                    const allItems = rawAllItems.filter(Boolean).filter(item => {
                        const cd = (item as { codedata?: CodeData }).codedata;
                        const key =
                            cd?.org && cd?.module && cd?.symbol
                                ? `${cd.org}:${cd.module}:${cd.symbol}`
                                : item?.metadata?.label;

                        if (!key) {
                            return true;
                        }
                        if (seenKeys.has(key)) return false;
                        seenKeys.add(key);
                        return true;
                    });

                    const basicTypes = await rpcClient.getBIDiagramRpcClient().getVisibleTypes({
                        filePath: fileName,
                        position: updateLineRange(targetLineRange, expressionOffsetRef.current).startLine,
                        ...(valueTypeConstraint && { typeConstraint: valueTypeConstraint })
                    });

                    const isFetchingTypesForDM = valueTypeConstraint === "json";
                    const visibleSearchTypes = convertItemsToCompletionItems(allItems);
                    // Filter out basic types already covered by search results to avoid duplicates
                    const searchLabels = new Set(visibleSearchTypes.map(t => t.label));
                    const visibleBasicTypes = convertToVisibleTypes(basicTypes, isFetchingTypesForDM)
                        .filter(t => !searchLabels.has(t.label));
                    visibleTypes = [...visibleSearchTypes, ...visibleBasicTypes];
                    setTypes(visibleTypes);
                }

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
        [rpcClient, fileName, targetLineRange]
    );

    const handleGetVisibleTypes = useCallback(
        async (value: string, cursorPosition: number, fetchReferenceTypes?: boolean, types?: InputType[]) => {
            await debouncedGetVisibleTypes(value, cursorPosition, fetchReferenceTypes, getPrimaryInputType(types)?.ballerinaType);
        },
        [debouncedGetVisibleTypes]
    );

    const debouncedRetrieveCompletionsRef = useRef(debouncedRetrieveCompletions);
    const debouncedGetVisibleTypesRef = useRef(debouncedGetVisibleTypes);
    useEffect(() => {
        debouncedRetrieveCompletionsRef.current = debouncedRetrieveCompletions;
    }, [debouncedRetrieveCompletions]);
    useEffect(() => {
        debouncedGetVisibleTypesRef.current = debouncedGetVisibleTypes;
    }, [debouncedGetVisibleTypes]);
    useEffect(() => () => {
        debouncedRetrieveCompletionsRef.current.cancel();
        debouncedGetVisibleTypesRef.current.cancel();
    }, []);

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
                startLine: updateLineRange(targetLineRange, expressionOffsetRef.current).startLine,
                lineOffset: lineOffset,
                offset: charOffset,
                codedata: node.codedata,
                property: { ...property, imports: { ...(property.imports || {}), ...latestImports } },
            },
            signatureHelpContext: {
                isRetrigger: false,
                triggerKind: 1,
            },
        });

        return await convertToFnSignature(signatureHelp);
    };

    const getFormWithDiagnostics = async (node: FlowNode): Promise<FlowNode | null> => {
        // Update node with new line range only for creation forms (not edit forms)
        const nodeToProcess = props.editForm
            ? node
            : createNodeWithUpdatedLineRange(node, targetLineRange);

        const issueRequest = () =>
            rpcClient.getBIDiagramRpcClient().getFormDiagnostics({
                flowNode: nodeToProcess,
                filePath: fileName
            });

        const isDebounceCancellation = (resp: any) =>
            !resp?.flowNode &&
            typeof resp?.errorMsg === "string" &&
            resp.errorMsg.includes("Debounced");

        try {
            let response = await issueRequest();
            // The backend debounces concurrent diagnostics requests; the older one resolves
            // with a cancellation envelope. Retry past the debounce window so save sees the
            // real verdict instead of treating cancellation as "no diagnostics".
            let retries = 2;
            while (isDebounceCancellation(response) && retries-- > 0) {
                await new Promise(resolve => setTimeout(resolve, 300));
                response = await issueRequest();
            }

            if (response.flowNode) {
                return response.flowNode as FlowNode;
            }
            return node;
        } catch (error) {
            console.error(">>> Error getting form diagnostics", error);
            return null;
        }
    };

    const hasPropertyDiagnosticMessages = (nodeWithDiagnostics: FlowNode | null): boolean => {
        const nodeProperties = nodeWithDiagnostics?.properties;
        if (!nodeProperties) {
            return false;
        }

        return Object.values(nodeProperties).some((property) => {
            let diagnostics: DiagnosticMessage[] = [];
            if (property?.types?.length === 1 && getPrimaryInputType(property.types)?.fieldType === "REPEATABLE_LIST") {
                // For repeatable list, check diagnostics for each element in the list
                const valueDiagnostics = (property.value as any[])?.map((val) => val?.diagnostics?.diagnostics ?? []).flat() ?? [];
                diagnostics = [...diagnostics, ...valueDiagnostics];
            } else if (property?.types?.some(t => t.fieldType === "REPEATABLE_MAP") && typeof property.value === 'object' && property.value !== null && !Array.isArray(property.value)) {
                // For repeatable map, check diagnostics for each entry in the map
                const valueDiagnostics = Object.values(property.value as Record<string, any>)?.map((val) => val?.diagnostics?.diagnostics ?? []).flat() ?? [];
                diagnostics = [...diagnostics, ...valueDiagnostics];
            } else {
                diagnostics = property.diagnostics?.diagnostics ?? [];
            }
            return Array.isArray(diagnostics) && diagnostics.some((diagnostic) => Boolean(diagnostic?.message?.trim()));
        });
    };

    const handleFormValidation = async (data: FormValues, dirtyFields?: any): Promise<boolean> => {
        if (node && targetLineRange && !skipFormValidation) {
            const validationData = buildValidationData(data);
            const updatedNode = mergeFormDataWithFlowNode(validationData, targetLineRange, dirtyFields);
            const nodeWithDiagnostics = await getFormWithDiagnostics(updatedNode);
            setDiagnosticsToFields(data, nodeWithDiagnostics!);

            // HACK: Ignore top-level hasDiagnostics when LS does not send property-level diagnostic messages.
            if (nodeWithDiagnostics?.diagnostics?.hasDiagnostics && hasPropertyDiagnosticMessages(nodeWithDiagnostics)) {
                return false
            }
        }
        return true;
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

                // HACK: For variable nodes, update the type value in the node
                if (shouldUpdateNode) {
                    node.properties["type"].value = variableType || "any";
                }

                // Add form imports
                const existingImports = property.imports ?? undefined;
                const newImports = formImportsRef.current[key];
                const mergedImports = newImports
                    ? { ...(existingImports || {}), ...newImports }
                    : existingImports;
                const updatedProperty = mergedImports !== undefined
                    ? { ...property, imports: mergedImports, types: property.types.map(t => ({ ...t })) }
                    : { ...property, types: property.types.map(t => ({ ...t })) };

                try {
                    const response = await rpcClient.getBIDiagramRpcClient().getExpressionDiagnostics({
                        filePath: fileName,
                        context: {
                            expression: deserializeForDiagnosticsAPI(expression),
                            startLine: updateLineRange(targetLineRange, expressionOffsetRef.current).startLine,
                            lineOffset: 0,
                            offset: 0,
                            codedata: node.codedata,
                            property: updatedProperty,
                        },
                    });

                    let uniqueDiagnostics = removeDuplicateDiagnostics(response.diagnostics);

                    // HACK: filter unknown module and undefined type diagnostics for local connections
                    uniqueDiagnostics = filterUnsupportedDiagnostics(uniqueDiagnostics);

                    setDiagnosticsInfo({ key, diagnostics: uniqueDiagnostics });
                } catch (error) {
                    // Remove diagnostics if LS crashes
                    console.error(">>> Error getting expression diagnostics", error);
                    setDiagnosticsInfo({ key, diagnostics: [] });
                }

            },
            250
        ),
        [rpcClient, fileName, targetLineRange, node, formImportsRef.current]
    );

    const handleCompletionItemSelect = async (
        value: string,
        fieldKey: string,
        additionalTextEdits?: TextEdit[]
    ) => {
        if (additionalTextEdits?.[0]?.newText) {
            const response = await rpcClient.getBIDiagramRpcClient().updateImports({
                filePath: fileName,
                importStatement: additionalTextEdits[0].newText,
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

    const onTypeChange = async (type: Type) => {
        const updatedFields = fields.map((field) => {
            if (field.key === typeEditorState.fieldKey) {
                return { ...field, value: type.name };
            }
            return field;
        });
        if (type.codedata.node === "RECORD") {
            handleSelectedTypeChange(convertRecordTypeToCompletionItem(type));
        }
        setBaseFields(updatedFields);
    };

    const handleValueTypeConstChange = async (valueTypeConstraint: string) => {
        const newTypes = await rpcClient.getBIDiagramRpcClient().getVisibleTypes({
            filePath: fileName,
            position: updateLineRange(targetLineRange, expressionOffsetRef.current).startLine
        });
        const matchedReferenceType = newTypes.find(t => t.label === valueTypeConstraint);
        if (matchedReferenceType) {
            updateRecordTypeFields({
                value: matchedReferenceType.insertText,
                name: matchedReferenceType.label,
                labelDetails: matchedReferenceType.labelDetails,
            })
            return;
        }
        const type = await searchImportedTypeByName(valueTypeConstraint);
        if (!type) return;

        updateRecordTypeFields({
            value: type.name,
            name: type.name,
            codeData: type.codedata,
            labelDetails: type.labelDetails,
        });
    }

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
        defaultTypes?: InputType[],
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
            targetLineRange: updateLineRange(targetLineRange, expressionOffsetRef.current),
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
            handleOnFormSubmit: handleOnFormSubmit,
            selectedType: selectedType,
            filteredCompletions: filteredCompletions,
            isInModal: isInModal,
            types: defaultTypes,
            handleRetrieveCompletions: handleRetrieveCompletions,
            inputMode: inputMode,
            devantExpressionEditor: props.devantExpressionEditor,
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
        exprRef?: RefObject<FormExpressionEditorRef>,
    ) => {
        const formField = fields.find(f => f.key === fieldKey);
        const handleCreateNewType = (typeName: string) => {
            onTypeCreate();
            setTypeEditorState({ isOpen: true, newTypeValue: typeName, fieldKey: fieldKey });
        }

        const handleCloseCompletions = () => {
            debouncedGetVisibleTypes.cancel();
            handleExpressionEditorCancel();
        }

        const typeHelperContext = TypeHelperContext.HTTP_STATUS_CODE;

        return getTypeHelper({
            fieldKey: fieldKey,
            types: types,
            typeBrowserRef: typeBrowserRef,
            filePath: fileName,
            targetLineRange: updateLineRange(targetLineRange, expressionOffsetRef.current),
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
            typeHelperContext,
        });
    }

    const getExpressionTokens = async (expression: string, filePath: string, position: LinePosition): Promise<number[]> => {
        return rpcClient.getBIDiagramRpcClient().getExpressionTokens({
            expression: expression,
            filePath: filePath,
            position: position
        })
    }

    const popupManager = {
        addPopup: addModal,
        removeLastPopup: popModal,
        closePopup: closeModal
    }

    const handleCreateConnection = useCreateConnection(fileName, targetLineRange, props.onConnectionCreated);


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
            completions: completions,
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
            getExpressionFormDiagnostics: (...args: Parameters<typeof handleExpressionFormDiagnostics>) => {
                ensureFormOpened();
                return handleExpressionFormDiagnostics(...args);
            },
            onCompletionItemSelect: handleCompletionItemSelect,
            onFocus: ensureFormOpened,
            onBlur: handleExpressionEditorBlur,
            onCancel: handleExpressionEditorCancel,
            onOpenRecordConfigPage: openRecordConfigPage,
            helperPaneOrigin: "vertical" as const,
            helperPaneHeight: "default" as const,
        } satisfies FormExpressionEditorProps;
    }, [
        filteredCompletions,
        types,
        filteredTypes,
        handleRetrieveCompletions,
        extractArgsFromFunction,
        handleGetVisibleTypes,
        handleGetHelperPane,
        handleExpressionFormDiagnostics,
        handleCompletionItemSelect,
        handleExpressionEditorBlur,
        handleExpressionEditorCancel,
        openRecordConfigPage,
    ]);

    const fetchVisualizableFields = async (filePath: string, typeName?: string) => {
        if (node.codedata.node === "AGENT_TYPE" || node.codedata.node === "AGENT") {
            return;
        }
        const codedata = importsCodedataRef.current || { symbol: typeName };
        const res = await rpcClient
            .getDataMapperRpcClient()
            .getVisualizableFields({ filePath, codedata });
        setVisualizableField(res.visualizableProperties);
        importsCodedataRef.current = null;
    };

    const onSaveType = (type: Type | string) => {
        handleValueTypeConstChange(typeof type === 'string' ? type : (type as Type).name);
        if (stack.length > 0) {
            if (stack.length > 1) {
                const newStack = [...stack]
                const currentTop = newStack[newStack.length - 1];
                const newTop = newStack[newStack.length - 2];
                const fieldIndex = newTop.fieldIndex;
                if (fieldIndex === undefined) {
                    return;
                }
                if (newTop.type.codedata.node === "CLASS") {
                    const fn = newTop.type.functions?.[fieldIndex];
                    if (!fn) { return; }
                    fn.returnType = currentTop!.type.name;
                } else {
                    const member = newTop.type.members?.[fieldIndex];
                    if (!member) { return; }
                    member.type = currentTop!.type.name;
                }
                newStack[newStack.length - 2] = newTop;
                newStack.pop();
                setStack(newStack);
            }
            setRefetchForCurrentModal(true);
        }
        handleSelectedTypeChange(typeof type === 'string' ? type : (type as Type).name);
        setTypeEditorState({ ...typeEditorState, isOpen: stack.length !== 1 });
    }

    /**
     * Creates a record type field for the expression property
     */
    const createExpressionRecordTypeField = (
        key: string,
        property: any,
        packageInfo: string,
        type: { name: string; labelDetails?: { description?: string } },
        packageName?: string,
    ) => {
        return {
            key,
            property,
            recordTypeMembers: [{
                kind: "RECORD_TYPE",
                type: type.name || "",
                packageInfo: packageInfo,
                packageName: packageName,
                selected: false
            }]
        };
    };


    /**
     * Updates record type fields and value type constraints when a type is selected.
     * This is used in variable declaration forms where the variable type dynamically changes.
     */
    const updateRecordTypeFields = (type?: { value: string, codeData?: CodeData, name: string; labelDetails?: { description?: string, detail?: string } }) => {
        // Create the record type field for expression
        const expressionEntry = Object.entries(getFormProperties(node))
            .find(([_, property]) => {
                if (node.codedata.node === "VARIABLE") {
                    return property.metadata?.label === "Expression";
                } else if (node.codedata.node === "CONFIG_VARIABLE") {
                    return property.metadata?.label === "Default Value";
                }
                return false;
            });

        if (!expressionEntry) return;
        const [key, property] = expressionEntry;
        if (!type) {
            setRecordTypeFields(prevFields => prevFields.filter(f => f.key !== key));
            setBaseFields(prevFields => prevFields.map(field => {
                if (field.key === key) {
                    return {
                        ...field,
                        types: [
                            { fieldType: "EXPRESSION", selected: false },
                        ]
                    };
                }
                return field;
            }));
            return;
        }

        // If not a Record, remove the 'expression' entry from recordTypeFields and return
        if (type?.labelDetails?.description?.toLocaleLowerCase() !== "record" && type.codeData?.node !== "RECORD") {
            setRecordTypeFields(prevFields => prevFields.filter(f => f.key !== key));
            setBaseFields(prevFields => prevFields.map(field => {
                if (field.key === key) {
                    return {
                        ...field,
                        types: [
                            { fieldType: "EXPRESSION", selected: false },
                        ]
                    };
                }
                return field;
            }));
            return;
        }
        const packageInfo = type.codeData ? `${type.codeData.org}:${type.codeData.module}:${type.codeData.version}` : '';
        const recordTypeField = createExpressionRecordTypeField(key, property, packageInfo, type, type.codeData?.module);
        if (!recordTypeField) return;

        setBaseFields(prevFields => prevFields.map(field => {
            if (field.key === key) {
                return {
                    ...field,
                    types: [
                        { fieldType: "RECORD_MAP_EXPRESSION", selected: true },
                        { fieldType: "EXPRESSION", selected: false },
                    ]
                };
            }
            return field;
        }));
        setRecordTypeFields(prevFields => {
            const prevIndex = prevFields.findIndex(f => f.key === recordTypeField.key);
            if (prevIndex !== -1) {
                const updated = [...prevFields];
                updated[prevIndex] = recordTypeField;
                return updated;
            } else {
                return [...prevFields, recordTypeField];
            }
        });
    };


    /**
     * Handles type selection from completion items (used in type editor)
     */
    const handleSelectedTypeChange = async (type: CompletionItem | string) => {
        const resolutionId = ++typeResolutionId.current;
        if (!type) {
            setSelectedType(null);
            updateRecordTypeFields(undefined);
            return;
        }
        let matchedType: ResolvedType | undefined;
        if (typeof type === "string") {
            matchedType = await findTypeByName(type);
        }
        else {
            matchedType = await findTypeByName(type.value);
        }
        if (resolutionId !== typeResolutionId.current) {
            return;
        }
        setSelectedType(matchedType ?? null);
        updateRecordTypeFields(matchedType);
    };

    const findMatchedType = (items: TypeHelperItem[], typeName: string) => {
        return items?.find(item => {
            const moduleName = item.codedata.module?.split(".").pop() ?? item.codedata.module;
            return `${moduleName}:${item.insertText}` === typeName;
        });
    }

    /**
     * Searches for a type by name from the available types
     */
    const searchImportedTypeByName = async (typeName: string): Promise<TypeHelperItem | undefined> => {
        // Return early if required data is not available
        if (!fileName || !typeName) {
            return undefined;
        }

        const newTypes = await rpcClient
            .getBIDiagramRpcClient()
            .search({
                filePath: fileName,
                position: targetLineRange,
                queryMap: {
                    q: '',
                    offset: 0,
                    limit: 60
                },
                searchKind: 'TYPE'
            })
            .then((response) => {
                return getFilteredTypesByKind(response.categories, [functionKinds.IMPORTED, functionKinds.CURRENT]);
            })
            .finally(() => {

            });

        let type: TypeHelperItem | undefined;
        if (!newTypes.length || !newTypes[0].subCategory) {
            return undefined;
        }
        for (const category of newTypes[0].subCategory) {
            const matchedType = findMatchedType(category.items, typeName);
            if (matchedType) {
                type = matchedType;
                break;
            }
        }
        return type;
    };

    const findTypeByName = async (typeName: string): Promise<ResolvedType | undefined> => {
        if (!typeName || typeName.length === 0) {
            return undefined;
        }
        let matchedOtherTypes = await searchImportedTypeByName(typeName);
        if (matchedOtherTypes) {
            return ({
                name: matchedOtherTypes.name,
                value: matchedOtherTypes.insertText,
                codeData: matchedOtherTypes.codedata,
                sortText: matchedOtherTypes.sortText,
                labelDetails: matchedOtherTypes.labelDetails
            });
        }
        let matchedReferenceType = types.find(t => t.label === typeName);
        if (matchedReferenceType) {
            return ({
                name: matchedReferenceType.label,
                value: matchedReferenceType.value,
                sortText: matchedReferenceType.sortText,
                labelDetails: matchedReferenceType.labelDetails
            });
        }
        return undefined;
    }

    const getDefaultValue = (typeName?: string) => {
        return ({
            type: {
                name: typeName || "MyType",
                members: [] as Member[],
                editable: true,
                metadata: {
                    description: "",
                    label: ""
                },
                properties: {},
                codedata: {
                    node: "RECORD" as TypeNodeKind
                },
                includes: [] as string[],
                allowAdditionalFields: false
            },
            isDirty: false
        })
    }

    const getNewTypeCreateForm = (fieldIndex?: number, typeName?: string) => {
        const currentTopItem = peekTypeStack();
        if (currentTopItem) {
            currentTopItem.fieldIndex = fieldIndex;
            replaceTop(currentTopItem);
        }
        pushTypeStack(getDefaultValue(typeName));
    }

    // handle if node form
    if (node?.codedata.node === "IF") {
        return (
            <IfForm
                fileName={fileName}
                node={node}
                targetLineRange={targetLineRange}
                expressionEditor={expressionEditor}
                showProgressIndicator={showProgressIndicator}
                onSubmit={onSubmit}
                openSubPanel={openSubPanel}
                updatedExpressionField={updatedExpressionField}
                subPanelView={subPanelView}
                resetUpdatedExpressionField={resetUpdatedExpressionField}
            />
        );
    }

    // handle match node form
    if (node?.codedata.node === "MATCH") {
        return (
            <MatchForm
                fileName={fileName}
                node={node}
                targetLineRange={targetLineRange}
                expressionEditor={expressionEditor}
                onSubmit={onSubmit}
                showProgressIndicator={showProgressIndicator}
                openSubPanel={openSubPanel}
                updatedExpressionField={updatedExpressionField}
                subPanelView={subPanelView}
                resetUpdatedExpressionField={resetUpdatedExpressionField}
            />
        );
    }

    // handle fork node form
    if (node?.codedata.node === "FORK") {
        return (
            <EditorContext.Provider value={{ stack, push: pushTypeStack, pop: popTypeStack, peek: peekTypeStack, replaceTop: replaceTop }}>
                <ForkForm
                    fileName={fileName}
                    node={node}
                    targetLineRange={targetLineRange}
                    openRecordEditor={handleOpenTypeEditor}
                    expressionEditor={expressionEditor}
                    showProgressIndicator={showProgressIndicator}
                    onSubmit={onSubmit}
                    openSubPanel={openSubPanel}
                    updatedExpressionField={updatedExpressionField}
                    resetUpdatedExpressionField={resetUpdatedExpressionField}
                    subPanelView={subPanelView}
                />
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
                                            {stackItem?.type?.name || "New Type"}
                                        </BreadcrumbItem>
                                    </React.Fragment>
                                ))}
                            </BreadcrumbContainer>
                        )}
                        <div style={{ height: '560px', overflow: 'auto' }}>
                            <FormTypeEditor
                                type={peekTypeStack()?.type}
                                newType={peekTypeStack() ? peekTypeStack().isDirty : false}
                                newTypeValue={typeEditorState.newTypeValue}
                                isGraphql={isGraphql}
                                onTypeChange={onTypeChange}
                                onSaveType={onSaveType}
                                onTypeCreate={() => { }}
                                isPopupTypeForm={true}
                                getNewTypeCreateForm={getNewTypeCreateForm}
                                refetchTypes={refetchStates[i]}
                            />
                        </div>
                    </DynamicModal>)
                }
            </EditorContext.Provider>
        );
    }

    // handle vector knowledge base form
    if (node?.codedata.node === "KNOWLEDGE_BASE") {
        return (
            <KnowledgeBaseForm
                fileName={fileName}
                node={node}
                targetLineRange={targetLineRange}
                expressionEditor={expressionEditor}
                showProgressIndicator={showProgressIndicator}
                onSubmit={onSubmit}
                openSubPanel={openSubPanel}
                updatedExpressionField={updatedExpressionField}
                resetUpdatedExpressionField={resetUpdatedExpressionField}
                subPanelView={subPanelView}
                disableSaveButton={disableSaveButton}
                navigateToPanel={props.navigateToPanel}
                footerActionButton={footerActionButton}
            />
        );
    }

    if (!node) {
        console.log(">>> Node is undefined");
        return null;
    }

    // customize info label based on the node type
    const notSupportedLabel =
        "This statement is not supported in low-code yet. Please use the Ballerina source code to modify it accordingly.";
    const infoLabel = node.codedata.node === "EXPRESSION" ? notSupportedLabel : node.metadata.description;

    // Create action button from config if provided
    const actionButton = actionButtonConfig ? (
        <ActionButtonContainer>
            {actionButtonConfig.description && (
                <ActionButtonDescription>{actionButtonConfig.description}</ActionButtonDescription>
            )}
            <StyledActionButton appearance="secondary" onClick={actionButtonConfig.callback}>
                {actionButtonConfig.actionLabel}
            </StyledActionButton>
        </ActionButtonContainer>
    ) : undefined;

    // handle declare variable node form
    if (node?.codedata.node === "VARIABLE") {
        // HACK: make the type field optional for variable declaration form
        const typeField = fields.find(field => getPrimaryInputType(field.types)?.fieldType === "TYPE");
        if (typeField) {
            typeField.optional = true;
        }

        return (
            <EditorContext.Provider value={{ stack, push: pushTypeStack, pop: popTypeStack, peek: peekTypeStack, replaceTop: replaceTop }}>
                <VariableForm
                    formFields={fields}
                    projectPath={projectPath}
                    selectedNode={node.codedata.node}
                    openRecordEditor={handleOpenTypeEditor}
                    onSubmit={handleOnSubmit}
                    onBlur={handleOnBlur}
                    openView={handleOpenView}
                    openSubPanel={openSubPanel}
                    subPanelView={subPanelView}
                    expressionEditor={expressionEditor}
                    targetLineRange={targetLineRange}
                    fileName={fileName}
                    isSaving={showProgressIndicator}
                    onFormValidation={handleFormValidation}
                    submitText={submitText}
                    updatedExpressionField={updatedExpressionField}
                    resetUpdatedExpressionField={resetUpdatedExpressionField}
                    mergeFormDataWithFlowNode={mergeFormDataWithFlowNode}
                    handleVisualizableFields={fetchVisualizableFields}
                    visualizableField={visualizableField}
                    infoLabel={infoLabel}
                    hideInfoBanner={hideInfoBanner}
                    disableSaveButton={disableSaveButton}
                    footerActionButton={footerActionButton}
                    actionButton={actionButton}
                    recordTypeFields={recordTypeFields}
                    isInferredReturnType={!!node.codedata?.inferredReturnType}
                    formImports={formImportsRef.current}
                    handleSelectedTypeChange={handleSelectedTypeChange}
                    preserveOrder={node.codedata.node === "VARIABLE" as NodeKind || node.codedata.node === "CONFIG_VARIABLE" as NodeKind}
                />
                <EntryPointTypeCreator
                    isOpen={isTypeEditorOpen}
                    onClose={handleTypeEditorClose}
                    onTypeCreate={handleTypeCreated}
                    initialTypeName={editingTypeName || "WorkflowInput"}
                    modalTitle="Define Workflow Input Type"
                    modalWidth={650}
                    modalHeight={600}
                />
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
                                            {stackItem?.type?.name || "New Type"}
                                        </BreadcrumbItem>
                                    </React.Fragment>
                                ))}
                            </BreadcrumbContainer>
                        )}
                        <div style={{ height: '560px', overflow: 'auto' }}>
                            <FormTypeEditor
                                type={peekTypeStack()?.type}
                                newType={peekTypeStack() ? peekTypeStack().isDirty : false}
                                newTypeValue={typeEditorState.newTypeValue}
                                isGraphql={isGraphql}
                                onTypeChange={onTypeChange}
                                onSaveType={onSaveType}
                                onTypeCreate={() => { }}
                                isPopupTypeForm={true}
                                getNewTypeCreateForm={getNewTypeCreateForm}
                                refetchTypes={refetchStates[i]}
                            />
                        </div>
                    </DynamicModal>)
                }
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
                                targetLineRange={updateLineRange(targetLineRange, expressionOffsetRef.current)}
                                onChange={(value: string, isRecordConfigureChange: boolean) => {
                                    recordConfigPageState.onChangeCallback!(value);
                                }}
                                currentValue={recordConfigPageState.currentValue || ""}
                                recordTypeField={recordConfigPageState.recordTypeField}
                                onClose={closeRecordConfigPage}
                                getHelperPane={handleGetHelperPane}
                                field={fields.find(f => f.key === recordConfigPageState.fieldKey)}
                                triggerCharacters={TRIGGER_CHARACTERS}
                                formContext={{
                                    expressionEditor: expressionEditor,
                                    popupManager: popupManager,
                                    nodeInfo: {
                                        kind: node.codedata.node
                                    }
                                }}
                            />
                        </DynamicModal>
                    )}
            </EditorContext.Provider>
        );
    }

    if (node?.codedata.node === "SEND_DATA") {
        return (
            <SendEventForm
                fileName={fileName}
                node={node}
                targetLineRange={targetLineRange}
                expressionEditor={expressionEditor}
                formFields={fields}
                showProgressIndicator={showProgressIndicator}
                onSubmit={onSubmit}
                openSubPanel={openSubPanel}
                updatedExpressionField={updatedExpressionField}
                resetUpdatedExpressionField={resetUpdatedExpressionField}
                subPanelView={subPanelView}
                disableSaveButton={disableSaveButton}
                submitText={submitText}
                footerActionButton={footerActionButton}
                scopeFieldAddon={scopeFieldAddon}
                onChange={onChange}
                projectPath={projectPath}
                injectedComponents={injectedComponents}
            />
        );
    }

    // default form
    return (
        <EditorContext.Provider
            value={{ stack, push: pushTypeStack, pop: popTypeStack, peek: peekTypeStack, replaceTop: replaceTop }}
        >
            {fields && (
                <Form
                    ref={ref}
                    formFields={fields}
                    formDiagnostics={formDiagnostics}
                    formDiagnosticsAction={formDiagnostics.length > 0 ? (
                        <Tooltip content={formDiagnosticsFixTooltip}>
                            <span style={{ display: "block" }}>
                                <ActionButton onClick={handleFixFormDiagnostics} disabled={!canFixFormDiagnostics} appearance='primary'>
                                <Icon name="bi-ai-agent" sx={{ width: 16, height: 16, fontSize: 16, marginRight: 8 }} />
                                Fix with AI
                            </ActionButton>
                            </span>
                        </Tooltip>
                    ) : undefined}
                    projectPath={projectPath}
                    selectedNode={node.codedata.node}
                    openRecordEditor={handleOpenTypeEditor}
                    openFormTypeEditor={handleOpenFormTypeEditor}
                    popupManager={popupManager}
                    onSubmit={handleOnSubmit}
                    onBlur={handleOnBlur}
                    openView={handleOpenView}
                    openSubPanel={openSubPanel}
                    subPanelView={subPanelView}
                    onCreateConnection={handleCreateConnection}
                    expressionEditor={expressionEditor}
                    targetLineRange={targetLineRange}
                    fileName={fileName}
                    isSaving={showProgressIndicator}
                    onFormValidation={handleFormValidation}
                    submitText={submitText}
                    updatedExpressionField={updatedExpressionField}
                    resetUpdatedExpressionField={resetUpdatedExpressionField}
                    mergeFormDataWithFlowNode={mergeFormDataWithFlowNode}
                    handleVisualizableFields={fetchVisualizableFields}
                    visualizableField={visualizableField}
                    infoLabel={infoLabel}
                    hideInfoBanner={hideInfoBanner}
                    disableSaveButton={disableSaveButton}
                    footerActionButton={footerActionButton}
                    actionButton={actionButton}
                    recordTypeFields={recordTypeFields}
                    isInferredReturnType={!!node.codedata?.inferredReturnType}
                    formImports={formImportsRef.current}
                    handleSelectedTypeChange={handleSelectedTypeChange}
                    preserveOrder={
                        node.codedata.node === ("VARIABLE" as NodeKind) ||
                        node.codedata.node === ("CONFIG_VARIABLE" as NodeKind) ||
                        node.codedata.node === ("ASSIGN" as NodeKind) ||
                        node.codedata.node === ("FUNCTION_CREATION" as NodeKind) ||
                        node.codedata.node === ("DATA_MAPPER_CREATION" as NodeKind)
                    }
                    scopeFieldAddon={scopeFieldAddon}
                    onChange={handleFormChange}
                    injectedComponents={injectedComponents}
                    derivedFields={props.derivedFields}
                    bottomFields={props.bottomFields}
                    updateImports={handleUpdateImports}
                    defaultExpandAdvanced={props.defaultExpandAdvanced}
                    onRequestCreateConnection={handleRequestCreateConnection}
                />
            )}
            {pendingConnectionPopup && createPortal(
                <ConnectionConfigurationPopup
                    selectedConnector={pendingConnectionPopup.selectedConnector}
                    fileName={fileName}
                    target={targetLineRange?.startLine}
                    onClose={handleCloseConnectionPopup}
                    onBack={() => setPendingConnectionPopup(null)}
                />,
                document.body
            )}
            <EntryPointTypeCreator
                isOpen={isTypeEditorOpen}
                onClose={handleTypeEditorClose}
                onTypeCreate={handleTypeCreated}
                initialTypeName={editingTypeName || "WorkflowInput"}
                modalTitle="Define Workflow Input Type"
                modalWidth={650}
                modalHeight={600}
            />
            {stack.map((item, i) => (
                <DynamicModal
                    key={i}
                    width={420}
                    height={600}
                    anchorRef={undefined}
                    title="Create New Type"
                    openState={typeEditorState.isOpen}
                    setOpenState={handleTypeEditorStateChange}
                >
                    {stack.slice(0, i + 1).length > 2 && (
                        <BreadcrumbContainer>
                            {stack.slice(0, i + 1).map((stackItem, index) => (
                                <React.Fragment key={index}>
                                    {index > 0 && <BreadcrumbSeparator>/</BreadcrumbSeparator>}
                                    <BreadcrumbItem>{stackItem?.type?.name || "NewType"}</BreadcrumbItem>
                                </React.Fragment>
                            ))}
                        </BreadcrumbContainer>
                    )}
                    <div style={{ height: '560px', overflow: 'auto' }}>
                        <FormTypeEditor
                            type={peekTypeStack()?.type}
                            newType={peekTypeStack() ? peekTypeStack().isDirty : false}
                            newTypeValue={typeEditorState.newTypeValue}
                            isPopupTypeForm={true}
                            isGraphql={isGraphql}
                            onTypeChange={onTypeChange}
                            onSaveType={onSaveType}
                            onTypeCreate={() => { }}
                            getNewTypeCreateForm={getNewTypeCreateForm}
                            refetchTypes={refetchStates[i]}
                        />
                    </div>
                </DynamicModal>
            ))}
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
                            targetLineRange={updateLineRange(targetLineRange, expressionOffsetRef.current)}
                            onChange={(value: string, isRecordConfigureChange: boolean) => {
                                recordConfigPageState.onChangeCallback!(value);
                            }}
                            currentValue={recordConfigPageState.currentValue || ""}
                            recordTypeField={recordConfigPageState.recordTypeField}
                            onClose={closeRecordConfigPage}
                            getHelperPane={handleGetHelperPane}
                            field={fields.find(f => f.key === recordConfigPageState.fieldKey)}
                            triggerCharacters={TRIGGER_CHARACTERS}
                            formContext={{
                                expressionEditor: expressionEditor,
                                popupManager: popupManager,
                                nodeInfo: {
                                    kind: node.codedata.node
                                }
                            }}
                        />
                    </DynamicModal>
                )}
        </EditorContext.Provider>
    );
});

export default FlowNodeForm;
