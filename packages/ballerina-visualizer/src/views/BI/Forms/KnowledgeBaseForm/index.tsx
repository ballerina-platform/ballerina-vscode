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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Codicon } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";

import { EditorConfig, FlowNode, getPrimaryInputType, LineRange, RecordTypeField, SubPanel, SubPanelView } from "@wso2/ballerina-core";
import {
    FormValues,
    ExpressionFormField,
    FormExpressionEditorProps,
    Form,
    FormField,
    FormImports,
} from "@wso2/ballerina-side-panel";
import { convertNodePropertiesToFormFields, getFormProperties, getImportsForFormFields } from "../../../../utils/bi";
import { cloneDeep } from "lodash";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import {
    createNodeWithUpdatedLineRange,
    processFormData,
    removeEmptyNodes,
    updateNodeWithProperties,
} from "../form-utils";
import { SidePanelView } from "../../FlowDiagram/PanelManager";
import { ConnectionKind } from "../../../../components/ConnectionSelector";
import { useModalStack } from "../../../../Context";
import DynamicModal from "../../../../components/Modal";
import { ConfigureRecordPage } from "../../HelperPaneNew/Views/RecordConfigModal";

const DEFAULT_CHUNKER_VALUE = "ai:AUTO";

namespace S {
    export const Container = styled.div<{ footerActionButton?: boolean }>`
        display: flex;
        flex-direction: column;
        height: ${(props: { footerActionButton?: boolean }) => props.footerActionButton ? "100%" : "calc(100vh - 60px)"};
        min-height: ${(props: { footerActionButton?: boolean }) => props.footerActionButton ? "0" : "600px"};
        max-height: ${(props: { footerActionButton?: boolean }) => props.footerActionButton ? "100%" : "none"};
        overflow: ${(props: { footerActionButton?: boolean }) => props.footerActionButton ? "hidden" : "auto"};
    `;

    export const ScrollableContent = styled.div`
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
    `;

    export const Content = styled.div`
        display: flex;
        flex-direction: column;
        flex: 1;
    `;

    export const FormWrapper = styled.div`
        & > div:first-child {
            padding: 0px;
        }
    `;
}

interface KnowledgeBaseFormProps {
    fileName: string;
    node: FlowNode;
    targetLineRange: LineRange;
    expressionEditor: FormExpressionEditorProps;
    showProgressIndicator?: boolean;
    onSubmit: (
        node?: FlowNode,
        editorConfig?: EditorConfig,
        formImports?: FormImports,
        rawFormValues?: FormValues
    ) => void;
    openSubPanel?: (subPanel: SubPanel) => void;
    updatedExpressionField?: ExpressionFormField;
    resetUpdatedExpressionField?: () => void;
    subPanelView?: SubPanelView;
    disableSaveButton?: boolean;
    navigateToPanel?: (panel: SidePanelView, connectionKind?: ConnectionKind) => void;
    footerActionButton?: boolean;
}

export function KnowledgeBaseForm(props: KnowledgeBaseFormProps) {
    const {
        fileName,
        node,
        targetLineRange,
        expressionEditor,
        onSubmit,
        openSubPanel,
        updatedExpressionField,
        resetUpdatedExpressionField,
        subPanelView,
        showProgressIndicator,
        footerActionButton
    } = props;

    const { rpcClient } = useRpcContext();
    const { addModal, closeModal, popModal } = useModalStack();
    const [knowledgeBaseFields, setKnowledgeBaseFields] = useState<FormField[]>([]);
    const [formImports, setFormImports] = useState<FormImports>({});
    const [isFormValid, setIsFormValid] = useState(true);
    const [knowledgeBaseFormValues, setKnowledgeBaseFormValues] = useState<FormValues>({});
    const [saving, setSaving] = useState<boolean>(false);
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const [recordConfigPageState, setRecordConfigPageState] = useState<{
        isOpen: boolean;
        fieldKey?: string;
        currentValue?: string;
        recordTypeField?: RecordTypeField;
        onChangeCallback?: (value: string) => void;
    }>({ isOpen: false });

    useEffect(() => {
        initializeForm();
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
                console.log(">>> Knowledge Base form opened");
            });
    };

    const handleFormClose = () => {
        rpcClient
            .getBIDiagramRpcClient()
            .formDidClose({ filePath: fileName })
            .then(() => {
                console.log(">>> Knowledge Base form closed");
            });
    };

    const getConnectionKind = (fieldName: string): ConnectionKind | undefined => {
        switch (fieldName) {
            case "vectorStore":
                return "VECTOR_STORE";
            case "embeddingModel":
                return "EMBEDDING_PROVIDER";
            case "chunker":
                return "CHUNKER";
            default:
                return undefined;
        }
    };

    const searchNodesKindMap: Record<string, string> = {
        vectorStore: "VECTOR_STORE",
        embeddingModel: "EMBEDDING_PROVIDER",
        chunker: "CHUNKER",
    };

    const initializeForm = async () => {
        const formProperties = getFormProperties(node);

        const recordFields = Object.entries(formProperties)
            .filter(([_, property]) => {
                const primaryInputType = getPrimaryInputType(property?.types);
                return primaryInputType?.typeMembers?.some((member) => member.kind === "RECORD_TYPE");
            })
            .map(([key, property]) => {
                const primaryInputType = getPrimaryInputType(property?.types);
                return {
                    key,
                    property,
                    recordTypeMembers:
                        primaryInputType?.typeMembers?.filter((member) => member.kind === "RECORD_TYPE") ?? [],
                };
            });
        setRecordTypeFields(recordFields);

        const fields = convertNodePropertiesToFormFields(formProperties);
        const actionFields = ["vectorStore", "embeddingModel", "chunker"];
        fields.forEach((field) => {
            const originalName = field?.codedata?.originalName;
            if (actionFields.includes(originalName)) {
                field.type = "ACTION_EXPRESSION";
                field.types = [{ fieldType: "ACTION_EXPRESSION", selected: true }, { fieldType: "EXPRESSION", selected: false }];
                field.advanced = false;
                field.actionCallback = () => {
                    props.navigateToPanel?.(SidePanelView.CONNECTION_SELECT, getConnectionKind(originalName));
                };
                field.actionLabel = <><Codicon name="add" />{`Create New ${field?.label}`}</>;
                field.imports = node?.properties?.type?.imports;
                field.codedata = { ...field.codedata, searchNodesKind: searchNodesKindMap[originalName] };
            }
            if (originalName === "chunker") {
                field.defaultValue = DEFAULT_CHUNKER_VALUE;
                if (!field.value) {
                    field.value = DEFAULT_CHUNKER_VALUE;
                }
                field.advanced = false;
                field.codedata = {
                    ...field.codedata,
                    staticItems: [
                        { id: "auto", label: "AUTO", value: "ai:AUTO" },
                        { id: "disable", label: "DISABLE", value: "ai:DISABLE" },
                    ],
                };
            }
        });
        setKnowledgeBaseFields(fields);
        setFormImports(getImportsForFormFields(fields));
    };

    const updateNodePropertyValue = (fieldKey: string, value: any): void => {
        if (node.properties && node.properties[fieldKey as keyof typeof node.properties]) {
            node.properties[fieldKey as keyof typeof node.properties].value = value;
        }
    };

    const mergeFormDataWithFlowNode = (data: FormValues, targetLineRange: LineRange): FlowNode => {
        const clonedNode = cloneDeep(node);
        const updatedNode = createNodeWithUpdatedLineRange(clonedNode, targetLineRange);
        const processedData = processFormData(data);
        const nodeWithUpdatedProps = updateNodeWithProperties(clonedNode, updatedNode, processedData, formImports);
        return removeEmptyNodes(nodeWithUpdatedProps);
    };

    const handleSubmit = async () => {
        try {
            setSaving(true);
            const knowledgeBaseNode = mergeFormDataWithFlowNode(knowledgeBaseFormValues, targetLineRange);
            onSubmit(knowledgeBaseNode, undefined, formImports);
        } catch (error) {
            console.error("Error creating vector knowledge base:", error);
        } finally {
            setSaving(false);
        }
    };

    const openRecordConfigPage = useCallback((
        fieldKey: string,
        currentValue: string,
        recordTypeField: RecordTypeField,
        onChangeCallback: (value: string) => void
    ) => {
        setRecordConfigPageState({ isOpen: true, fieldKey, currentValue, recordTypeField, onChangeCallback });
    }, []);

    const closeRecordConfigPage = () => {
        setRecordConfigPageState({ isOpen: false });
    };

    const popupManager = {
        addPopup: addModal,
        removeLastPopup: popModal,
        closePopup: closeModal,
    };

    const formExpressionEditor = useMemo(
        () => ({ ...expressionEditor, onOpenRecordConfigPage: openRecordConfigPage }),
        [expressionEditor, openRecordConfigPage]
    );

    return (
        <>
        <S.Container footerActionButton={footerActionButton}>
            <S.ScrollableContent>
                <S.Content>
                    {knowledgeBaseFields.length > 0 && (
                        <S.FormWrapper>
                            <Form
                                formFields={knowledgeBaseFields}
                                fileName={fileName}
                                targetLineRange={targetLineRange}
                                selectedNode={node.codedata.node}
                                expressionEditor={formExpressionEditor}
                                recordTypeFields={recordTypeFields}
                                openSubPanel={openSubPanel}
                                subPanelView={subPanelView}
                                updatedExpressionField={updatedExpressionField}
                                resetUpdatedExpressionField={resetUpdatedExpressionField}
                                hideSaveButton={false}
                                nestedForm={!footerActionButton}
                                footerActionButton={footerActionButton}
                                onSubmit={handleSubmit}
                                disableSaveButton={!isFormValid}
                                isSaving={showProgressIndicator || saving}
                                onChange={(fieldKey, value, allValues) => {
                                    updateNodePropertyValue(fieldKey, value);
                                    const isValid = allValues["vectorStore"] !== "" && allValues["embeddingModel"] !== "";
                                    setIsFormValid(isValid);
                                    setKnowledgeBaseFormValues(allValues);
                                }}
                            />
                        </S.FormWrapper>
                    )}
                </S.Content>
            </S.ScrollableContent>
        </S.Container>
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
                        targetLineRange={targetLineRange}
                        onChange={(value: string) => {
                            recordConfigPageState.onChangeCallback!(value);
                        }}
                        currentValue={recordConfigPageState.currentValue || ""}
                        recordTypeField={recordConfigPageState.recordTypeField}
                        onClose={closeRecordConfigPage}
                        getHelperPane={expressionEditor.getHelperPane}
                        field={knowledgeBaseFields.find((f) => f.key === recordConfigPageState.fieldKey)}
                        triggerCharacters={expressionEditor.triggerCharacters}
                        formContext={{
                            expressionEditor: formExpressionEditor,
                            popupManager: popupManager,
                            nodeInfo: { kind: node.codedata.node },
                        }}
                    />
                </DynamicModal>
            )}
        </>
    );
}

export default KnowledgeBaseForm;
