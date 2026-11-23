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

import {
    FlowNode,
    Branch,
    LineRange,
    SubPanel,
    SubPanelView,
    FormDiagnostics,
    Diagnostic,
    ExpressionProperty
} from "@wso2/ballerina-core";
import { newElseBranch, newIfBranch } from "../form-assist/branches";
import { NodeFormAssist } from "../form-assist/NodeFormAssist";
import {
    FormValues,
    ExpressionEditor,
    AssistMark,
    ExpressionFormField,
    FormExpressionEditorProps,
    isSaveShortcut,
    useFocusOnOpen,
    SAVE_SHORTCUT_LABEL
} from "@wso2/ballerina-side-panel";
import { FormStyles } from "../styles";
import { convertNodePropertyToFormField, removeDuplicateDiagnostics } from "../../../../utils/bi";
import { cloneDeep, debounce } from "lodash";
import { RemoveEmptyNodesVisitor, traverseNode } from "@wso2/bi-diagram";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

interface IfFormProps {
    // Closes the panel once the chat takes the step over.
    onClose?: () => void;
    fileName: string;
    node: FlowNode;
    targetLineRange: LineRange;
    expressionEditor: FormExpressionEditorProps;
    showProgressIndicator?: boolean;
    onSubmit: (node?: FlowNode) => void;
    openSubPanel: (subPanel: SubPanel) => void;
    updatedExpressionField?: ExpressionFormField;
    resetUpdatedExpressionField?: () => void;
    subPanelView?: SubPanelView;
    // Rebuilds the form from a node the form assist filled.
    onReseed?: (node: FlowNode) => void;
}

export function IfForm(props: IfFormProps) {
    const {
        fileName,
        node,
        targetLineRange,
        expressionEditor,
        onSubmit,
        openSubPanel,
        updatedExpressionField,
        showProgressIndicator,
        resetUpdatedExpressionField,
        subPanelView,
        onReseed
    } = props;
    const {
        watch,
        control,
        getValues,
        setValue,
        handleSubmit,
        setError,
        clearErrors,
        formState: { isValidating },
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

    const isElseBranch = (branch: Branch) => {
        return branch.label === "Else"
    }

    const hasElseBranch = branches.find(
        (branch) =>
            isElseBranch(branch) &&
            ((branch.children?.length > 0 &&
                !(branch.children[0].codedata.node === "EMPTY" && branch.children[0].metadata.draft)) ||
                branch.children?.length === 0)
    );

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
            if (branch.properties?.condition) {
                const conditionValue = branch.properties.condition.value;
                setValue(`branch-${index}`, conditionValue || "");
            }
        });

        return () => {
            handleFormClose();
        }
    }, []);

    const handleSetDiagnosticsInfo = (diagnostics: FormDiagnostics) => {
        const otherDiagnostics = diagnosticsInfo?.filter((item) => item.key !== diagnostics.key) || [];
        setDiagnosticsInfo([...otherDiagnostics, diagnostics]);
    }

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

        // Update branches with form values and filter out draft else branches
        const updatedBranches = branches.map((branch, index) => {
            // Skip draft else branches
            if (isElseBranch(branch) &&
                branch.children?.length > 0 &&
                branch.children[0].codedata.node === "EMPTY" &&
                branch.children[0].metadata.draft) {
                return null; // Will be filtered out
            }

            // For non-Else branches, update with form values
            if (branch.label !== "Else") {
                const conditionValue = data[`branch-${index}`]?.trim();
                if (conditionValue) {
                    const branchCopy = cloneDeep(branch);
                    branchCopy.properties.condition.value = conditionValue;
                    if (branchCopy.label !== "Then") {
                        branchCopy.label = "";
                    }
                    return branchCopy;
                }
            }

            return branch;
        }).filter(Boolean) as Branch[];

        updatedNode.branches = updatedBranches;
        return updatedNode;
    };

    const handleOnSave = (data: FormValues) => {
        if (node && targetLineRange) {
            const updatedNode = buildNode(data);

            // check all nodes and remove empty nodes
            const removeEmptyNodeVisitor = new RemoveEmptyNodesVisitor(updatedNode);
            traverseNode(updatedNode, removeEmptyNodeVisitor);
            const updatedNodeWithoutEmptyNodes = removeEmptyNodeVisitor.getNode();

            onSubmit(updatedNodeWithoutEmptyNodes);
        }
    };

    const addNewCondition = () => {
        const newBranch = newIfBranch(branches.length);

        setValue(`branch-${branches.length}`, "");
        // add new branch to end of the current branches
        setBranches([...branches, newBranch]);
    };

    const removeCondition = (index: number) => {
        // Don't remove if it's the first branch (Then) or last branch (Else)
        if (index === 0 || (hasElseBranch && index === branches.length - 1)) {
            return;
        }
        // Remove the branch at the specified index
        const updatedBranches = branches.filter((_, i) => i !== index);
        setBranches(updatedBranches);

        for (let i = index + 1; i < branches.length; i++) {
            const value = getValues(`branch-${i}`);
            setValue(`branch-${i - 1}`, value);
        }
    };

    const addElseBlock = () => {
        if (hasElseBranch) {
            return;
        }
        const elseBranch = newElseBranch();
        // add new branch to end of the current branches
        setBranches([...branches, elseBranch]);
    };

    const removeElseBlock = () => {
        if (!hasElseBranch) {
            return;
        }
        // remove the else branch
        const updatedBranches = branches.filter((branch) => branch.label !== "Else");
        setBranches(updatedBranches);
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
            }
        });

        const uniqueDiagnostics = removeDuplicateDiagnostics(response.diagnostics);
        handleSetDiagnosticsInfo({ key, diagnostics: uniqueDiagnostics });
    }, 250), [rpcClient, fileName, targetLineRange, node, handleSetDiagnosticsInfo]);

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
                const diagnosticsMessage = diagnostics.map(d => d.message).join('\n');
                setError(key, { type: "validate", message: diagnosticsMessage });

                // If the severity is not ERROR, don't invalidate
                const hasErrorDiagnostics = diagnostics.some(d => d.severity === 1);
                if (hasErrorDiagnostics) {
                    hasDiagnostics = false;
                } else {
                    continue;
                }
            }
        }

        return hasDiagnostics;
    }, [diagnosticsInfo])

    const disableSaveButton = !isValid || isValidating || showProgressIndicator;
    const containerRef = useFocusOnOpen(!!onSubmit);

    // TODO: support multiple type fields
    return (
        <FormStyles.Container
            ref={containerRef}
            tabIndex={-1}
            onKeyDown={(event: React.KeyboardEvent) => {
                if (onSubmit && isSaveShortcut(event) && !disableSaveButton) {
                    event.preventDefault();
                    handleSubmit(handleOnSave)();
                }
            }}
        >
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
                if (branch.properties?.condition && branch.label !== "Else") {
                    const field = convertNodePropertyToFormField(`branch-${index}`, branch.properties.condition);
                    return (
                        <div key={field.key}>
                            <FormStyles.Row>
                                <ExpressionEditor
                                    {...expressionEditor}
                                    // ref={exprRef}
                                    fieldInputType={{fieldType: "EXPRESSION", selected: false}}
                                    control={control}
                                    field={field}
                                    watch={watch}
                                    setValue={setValue}
                                    openSubPanel={openSubPanel}
                                    targetLineRange={targetLineRange}
                                    fileName={fileName}
                                    onRemove={index !== 0 ? () => removeCondition(index) : undefined}
                                    completions={activeEditor === index ? expressionEditor.completions : []}
                                    triggerCharacters={expressionEditor.triggerCharacters}
                                    retrieveCompletions={expressionEditor.retrieveCompletions}
                                    extractArgsFromFunction={expressionEditor.extractArgsFromFunction}
                                    getExpressionEditorDiagnostics={handleExpressionEditorDiagnostics}
                                    onFocus={() => handleEditorFocus(index)}
                                    onCompletionItemSelect={expressionEditor.onCompletionItemSelect}
                                    onCancel={expressionEditor.onCancel}
                                    onBlur={expressionEditor.onBlur}
                                />
                            </FormStyles.Row>
                            <AssistMark fieldKey={field.key} />
                        </div>
                    );
                }
            })}

            <LinkButton onClick={addNewCondition} sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}>
                <Codicon name={"add"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                Add Else IF Block
            </LinkButton>

            {!hasElseBranch && (
                <LinkButton onClick={addElseBlock} sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}>
                    <Codicon name={"add"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                    Add Else Block
                </LinkButton>
            )}

            {hasElseBranch && (
                <LinkButton onClick={removeElseBlock} sx={{ fontSize: 12, padding: 8, color: ThemeColors.ERROR, gap: 4 }}>
                    <Codicon name={"chrome-minimize"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                    Remove Else Block
                </LinkButton>
            )}

            {onSubmit && (
                <FormStyles.Footer>
                    <Button appearance="primary" onClick={handleSubmit(handleOnSave)} disabled={disableSaveButton} tooltip={`Save (${SAVE_SHORTCUT_LABEL})`}>
                        {showProgressIndicator ? <Typography variant="progress">Saving...</Typography> : "Save"}
                    </Button>
                </FormStyles.Footer>
            )}
        </FormStyles.Container>
    );
}

export default IfForm;
