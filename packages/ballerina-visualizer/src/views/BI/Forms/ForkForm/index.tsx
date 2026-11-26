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
import { useForm } from "react-hook-form";
import { Button, Codicon, FormExpressionEditorRef, LinkButton, ThemeColors, Typography } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";

import {
    FlowNode,
    Branch,
    LineRange,
    SubPanel,
    SubPanelView,
    FormDiagnostics,
    Diagnostic,
    ExpressionProperty,
    Property,
    NodeProperties
} from "@wso2/ballerina-core";
import { BRANCH_MARKS, newForkWorker } from "../form-assist/branches";
import { NodeFormAssist } from "../form-assist/NodeFormAssist";
import {
    FormValues,
    ExpressionEditor,
    ExpressionFormField,
    FormExpressionEditorProps,
    Form,
    TypeEditor,
    EditorFactory,
    AssistMark,
    Provider,
    FormField,
} from "@wso2/ballerina-side-panel";
import { FormStyles } from "../styles";

const Worker = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    & + & {
        padding-top: 18px;
        border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    }
`;

const WorkerHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 22px;
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;
import { convertNodePropertyToFormField, removeDuplicateDiagnostics } from "../../../../utils/bi";
import { cloneDeep, debounce } from "lodash";
import { RemoveEmptyNodesVisitor, traverseNode } from "@wso2/bi-diagram";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

interface ForkFormProps {
    // Closes the panel once the chat takes the step over.
    onClose?: () => void;
    fileName: string;
    node: FlowNode;
    openRecordEditor: (isOpen: boolean, f: FormValues, editingField?: FormField, newType?: string | NodeProperties) => void;
    targetLineRange: LineRange;
    expressionEditor: FormExpressionEditorProps;
    onSubmit: (node?: FlowNode) => void;
    openSubPanel: (subPanel: SubPanel) => void;
    updatedExpressionField?: ExpressionFormField;
    resetUpdatedExpressionField?: () => void;
    subPanelView?: SubPanelView;
    showProgressIndicator?: boolean;
    // Rebuilds the form from a node the form assist filled.
    onReseed?: (node: FlowNode) => void;
}

export function ForkForm(props: ForkFormProps) {
    const {
        fileName,
        node,
        targetLineRange,
        expressionEditor,
        openRecordEditor,
        onSubmit,
        openSubPanel,
        updatedExpressionField,
        resetUpdatedExpressionField,
        subPanelView,
        showProgressIndicator,
        onReseed,
    } = props;
    const {
        watch,
        control,
        getValues,
        setValue,
        handleSubmit,
        setError,
        clearErrors,
        register,
        unregister,
        formState: { isValidating, errors },
    } = useForm<FormValues>();

    const { rpcClient } = useRpcContext();
    const [activeEditor, setActiveEditor] = useState<number>(0);
    const [branches, setBranches] = useState<Branch[]>(cloneDeep(node.branches));
    const [diagnosticsInfo, setDiagnosticsInfo] = useState<FormDiagnostics[] | undefined>(undefined);

    const exprRef = useRef<FormExpressionEditorRef>(null);

    const handleFormOpen = () => {
        rpcClient
            .getBIDiagramRpcClient()
            .formDidOpen({ filePath: fileName })
            .then(() => {
                console.log(">>> If form opened");
            });
    };

    const handleFormClose = () => {
        rpcClient
            .getBIDiagramRpcClient()
            .formDidClose({ filePath: fileName })
            .then(() => {
                console.log(">>> If form closed");
            });
    };

    useEffect(() => {
        if (updatedExpressionField) {
            const currentValue = getValues(updatedExpressionField.key);

            if (currentValue !== undefined) {
                const cursorPosition =
                    exprRef.current?.shadowRoot?.querySelector("textarea")?.selectionStart ?? currentValue.length;
                const newValue =
                    currentValue.slice(0, cursorPosition) +
                    updatedExpressionField.value +
                    currentValue.slice(cursorPosition);

                setValue(updatedExpressionField.key, newValue);
                resetUpdatedExpressionField && resetUpdatedExpressionField();
            }
        }
    }, [updatedExpressionField]);

    useEffect(() => {
        handleFormOpen();
        branches.forEach((branch, index) => {
            if (branch.properties?.variable) {
                const variableValue = branch.properties.variable.value;
                setValue(`branch-${index}`, variableValue || "");
            }
            if (branch.properties?.type) {
                const typeValue = branch.properties.type.value;
                setValue(`branch-${index}-type`, typeValue || "");
            }
        });

        return () => {
            handleFormClose();
        };
    }, []);

    const handleSetDiagnosticsInfo = (diagnostics: FormDiagnostics) => {
        const otherDiagnostics = diagnosticsInfo?.filter((item) => item.key !== diagnostics.key) || [];
        setDiagnosticsInfo([...otherDiagnostics, diagnostics]);
    };

    // The node with the form's values, as Save sends it and the form assist reads it.
    const buildNode = (data: FormValues): FlowNode => {
        const updatedNode = cloneDeep(node);

        if (!updatedNode.codedata.lineRange) {
            updatedNode.codedata.lineRange = {
                ...node.codedata.lineRange,
                startLine: targetLineRange.startLine,
                endLine: targetLineRange.endLine,
            };
        }

        const workers = cloneDeep(branches);
        workers.forEach((branch, index) => {
            const variableValue = data[`branch-${index}`]?.trim();
            if (variableValue) {
                branch.properties.variable.value = variableValue;
            }
            const typeValue = data[`branch-${index}-type`]?.trim();
            if (typeValue !== undefined) {
                branch.properties.type.value = typeValue;
            }
        });

        updatedNode.branches = workers;
        return updatedNode;
    };

    const handleOnSave = (data: FormValues) => {
        if (node && targetLineRange) {
            const updatedNode = buildNode(data);

            // check all nodes and remove empty nodes
            const removeEmptyNodeVisitor = new RemoveEmptyNodesVisitor(updatedNode);
            traverseNode(updatedNode, removeEmptyNodeVisitor);
            const updatedNodeWithoutEmptyNodes = removeEmptyNodeVisitor.getNode();

            console.log(">>> updatedNodeWithoutEmptyNodes", updatedNodeWithoutEmptyNodes);

            onSubmit(updatedNodeWithoutEmptyNodes);
        }
    };

    const addNewWorker = () => {
        const newBranch = newForkWorker(branches.length);

        setValue(`branch-${branches.length}`, "worker" + (branches.length + 1));
        setValue(`branch-${branches.length}-type`, "");
        // add new branch to end of the current branches
        setBranches([...branches, newBranch]);
    };

    const removeWorker = (index: number) => {
        // Prevent removal if this is the last branch
        if (branches.length <= 2) {
            return;
        }

        // Remove the branch at the specified index
        const updatedBranches = branches.filter((_, i) => i !== index);
        setBranches(updatedBranches);

        for (let i = index + 1; i < branches.length; i++) {
            const value = getValues(`branch-${i}`);
            setValue(`branch-${i - 1}`, value);
            const typeValue = getValues(`branch-${i}-type`);
            setValue(`branch-${i - 1}-type`, typeValue);
        }
    };

    const handleExpressionEditorDiagnostics = useCallback(debounce(async (
        showDiagnostics: boolean,
        expression: string,
        key: string,
        property: ExpressionProperty
    ) => {
        if (!showDiagnostics) {
            handleSetDiagnosticsInfo({ key, diagnostics: [] });
            return;
        }

        const response = await rpcClient.getBIDiagramRpcClient().getExpressionDiagnostics({
            filePath: fileName,
            context: {
                expression: expression,
                startLine: targetLineRange.startLine,
                lineOffset: 0,
                offset: 0,
                codedata: undefined,
                property: property,
            },
        });

        const uniqueDiagnostics = removeDuplicateDiagnostics(response.diagnostics);
        handleSetDiagnosticsInfo({ key, diagnostics: uniqueDiagnostics });
    }, 250),
        [rpcClient, fileName, targetLineRange, node, handleSetDiagnosticsInfo]
    );

    const handleEditorFocus = (currentActive: number) => {
        const isActiveSubPanel = subPanelView !== SubPanelView.UNDEFINED;
        if (isActiveSubPanel && activeEditor !== currentActive) {
            openSubPanel && openSubPanel({ view: SubPanelView.UNDEFINED });
        }
        setActiveEditor(currentActive);
    };

    const isValid = useMemo(() => {
        if (!diagnosticsInfo) {
            return true;
        }

        let hasDiagnostics: boolean = true;
        for (const diagnosticsInfoItem of diagnosticsInfo) {
            const key = diagnosticsInfoItem.key;
            if (!key) {
                continue;
            }

            const diagnostics: Diagnostic[] = diagnosticsInfoItem.diagnostics || [];
            if (diagnostics.length === 0) {
                clearErrors(key);
                continue;
            } else {
                const diagnosticsMessage = diagnostics.map((d) => d.message).join("\n");
                setError(key, { type: "validate", message: diagnosticsMessage });

                // If the severity is not ERROR, don't invalidate
                const hasErrorDiagnostics = diagnostics.some((d) => d.severity === 1);
                if (hasErrorDiagnostics) {
                    hasDiagnostics = false;
                } else {
                    continue;
                }
            }
        }

        return hasDiagnostics;
    }, [diagnosticsInfo]);

    const handleGetExpressionDiagnostics = async (
        showDiagnostics: boolean,
        expression: string,
        key: string,
        property: ExpressionProperty
    ) => {
        await expressionEditor?.getExpressionFormDiagnostics?.(
            showDiagnostics,
            expression,
            key,
            property,
            handleSetDiagnosticsInfo
        );
    };

    const getFormValues = useCallback(() => {
        const formValues: FormValues = { ...getValues() };
        branches.forEach((branch, index) => {
            formValues[`branch-${index}`] = getValues(`branch-${index}`);
            formValues[`branch-${index}-type`] = getValues(`branch-${index}-type`);
        });
        return formValues;
    }, [getValues, branches]);

    const disableSaveButton = !isValid || isValidating || showProgressIndicator;

    // TODO: support multiple type fields
    return (
        <Provider
            form={{
                control,
                getValues,
                setValue,
                watch,
                register,
                unregister,
                setError,
                clearErrors,
                formState: { isValidating, errors },
            }}
            expressionEditor={{
                ...expressionEditor,
                getExpressionEditorDiagnostics: handleGetExpressionDiagnostics,
            }}
            targetLineRange={targetLineRange}
            fileName={fileName}
            popupManager={{
                addPopup: () => { },
                removeLastPopup: () => { },
                closePopup: () => { },
            }}
            nodeInfo={{ kind: node.codedata.node }}
        >
            <FormStyles.Container>
                {onReseed && (
                    <NodeFormAssist
                        node={node}
                        location={{ fileName, startLine: targetLineRange.startLine, codedata: node.codedata }}
                        toNode={() => buildNode(getValues())}
                        reseed={onReseed}
                        onClose={props.onClose}
                    />
                )}
                {branches.map((branch, index) => {
                    if (branch.properties?.variable) {
                        const variableField = convertNodePropertyToFormField(`branch-${index}`, branch.properties.variable);
                        variableField.types = [{ fieldType: "IDENTIFIER", selected: false }]
                        const typeField = convertNodePropertyToFormField(`branch-${index}-type`, branch.properties.type);
                        typeField.types = [{ fieldType: "TYPE", selected: false }]
                        variableField.label = "Name";
                        return (
                            <Worker key={variableField.key}>
                                <WorkerHeader>
                                    {`Worker ${index + 1}`}
                                    {branches.length > 2 && (
                                        <Button appearance="icon" tooltip="Remove Worker" onClick={() => removeWorker(index)}>
                                            <Codicon name="trash" sx={{ color: ThemeColors.ERROR }} />
                                        </Button>
                                    )}
                                </WorkerHeader>
                                <EditorFactory fieldInputType={{ fieldType: "IDENTIFIER", selected: false }} field={variableField} />
                                <AssistMark fieldKey={variableField.key} />
                                <TypeEditor
                                    field={typeField}
                                    openRecordEditor={(open: boolean, newType?: string | NodeProperties) =>
                                        openRecordEditor && openRecordEditor(open, getFormValues(), typeField, newType)
                                    }
                                />
                            </Worker>
                        );
                    }
                })}

                <div>
                    <LinkButton onClick={addNewWorker} sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}>
                        <Codicon name={"add"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                        Add Worker
                    </LinkButton>
                    <AssistMark fieldKey={BRANCH_MARKS.workers} />
                </div>

                {onSubmit && (
                    <FormStyles.Footer>
                        <Button appearance="primary" onClick={handleSubmit(handleOnSave)} disabled={disableSaveButton}>
                            {showProgressIndicator ? <Typography variant="progress">Saving...</Typography> : "Save"}
                        </Button>
                    </FormStyles.Footer>
                )}
            </FormStyles.Container>
        </Provider>
    );
}

export default ForkForm;
