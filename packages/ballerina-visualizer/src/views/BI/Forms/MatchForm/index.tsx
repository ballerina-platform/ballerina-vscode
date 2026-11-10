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
    ExpressionProperty,
    Property,
} from "@wso2/ballerina-core";
import {
    FormValues,
    ExpressionEditor,
    ExpressionFormField,
    FormExpressionEditorProps,
} from "@wso2/ballerina-side-panel";
import { FormStyles } from "../styles";
import { convertNodePropertyToFormField, removeDuplicateDiagnostics } from "../../../../utils/bi";
import { cloneDeep, debounce } from "lodash";
import { RemoveEmptyNodesVisitor, traverseNode } from "@wso2/bi-diagram";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

interface MatchFormProps {
    fileName: string;
    node: FlowNode;
    targetLineRange: LineRange;
    expressionEditor: FormExpressionEditorProps;
    onSubmit: (node?: FlowNode) => void;
    openSubPanel: (subPanel: SubPanel) => void;
    updatedExpressionField?: ExpressionFormField;
    resetUpdatedExpressionField?: () => void;
    subPanelView?: SubPanelView;
    showProgressIndicator?: boolean;
}

export function MatchForm(props: MatchFormProps) {
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
    const [branches, setBranches] = useState<Branch[]>(
        cloneDeep(node.branches.filter((branch) => branch.codedata.node === "CONDITIONAL"))
    );
    const [diagnosticsInfo, setDiagnosticsInfo] = useState<FormDiagnostics[] | undefined>(undefined);

    const exprRef = useRef<FormExpressionEditorRef>(null);

    const TARGET_FIELD_INDEX = -1;
    const DEFAULT_BRANCH_INDEX = 1000; // this is a magic number to avoid conflict with other branches

    const handleFormOpen = () => {
        rpcClient
            .getBIDiagramRpcClient()
            .formDidOpen({ filePath: fileName })
            .then(() => {
                console.log(">>> Match form opened");
            });
    };

    const handleFormClose = () => {
        rpcClient
            .getBIDiagramRpcClient()
            .formDidClose({ filePath: fileName })
            .then(() => {
                console.log(">>> Match form closed");
            });
    };

    const isDefaultBranch = (branch: Branch): boolean => {
        return (branch.properties?.patterns?.value as Property[])?.at(0)?.value === "_";
    };

    const hasDefaultBranch = useMemo(() => {
        for (const branch of branches) {
            if (isDefaultBranch(branch) &&
                (!branch.children?.at(0)?.metadata.draft || branch.children?.length === 0)) {
                return true;
            }
        }
        return false;
    }, [branches]);

    // is new form fill pattern value
    if (
        !branches.at(0)?.properties?.patterns?.value ||
        (branches.at(0)?.properties?.patterns?.value as Property[]).length === 0
    ) {
        branches[0].properties.patterns.value = [
            {
                metadata: {
                    label: "Pattern",
                    description: "Pattern or value to match the target against",
                },
                value: "",
                optional: false,
                editable: true,
                advanced: false,
                types: [{ fieldType: "EXPRESSION", selected: false }],
                hidden: false,
            },
        ];
    }

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
        // set target value
        if (node.properties.matchTarget) {
            setValue(`branch-${TARGET_FIELD_INDEX}`, node.properties.matchTarget.value);
        }
        // set branch values
        branches.forEach((branch, index) => {
            if (branch.properties?.patterns?.value && !isDefaultBranch(branch)) {
                const conditionValue = (branch.properties?.patterns?.value as Property[]).map((p) => p.value).join("|");
                setValue(`branch-${index}`, conditionValue || "");
            }
            if (isDefaultBranch(branch)) {
                setValue(`branch-${DEFAULT_BRANCH_INDEX}`, "_");
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

    const handleOnSave = (data: FormValues) => {
        if (node && targetLineRange) {
            let updatedNode = cloneDeep(node);

            if (!updatedNode.codedata.lineRange) {
                updatedNode.codedata.lineRange = {
                    ...node.codedata.lineRange,
                    startLine: targetLineRange.startLine,
                    endLine: targetLineRange.endLine,
                };
            }

            // update target value
            updatedNode.properties.matchTarget.value = data[`branch-${TARGET_FIELD_INDEX}`]?.trim();

            // Update branches with form values
            const updatedBranches = branches.map((branch, index) => {
                if (isDefaultBranch(branch) && branch.children?.at(0)?.metadata.draft === true) {
                    return null;
                }

                if (!isDefaultBranch(branch)) {
                    const conditionValue = data[`branch-${index}`]?.trim();
                    if (conditionValue) {
                        const branchCopy = cloneDeep(branch);
                        (branchCopy.properties.patterns.value as Property[])[0].value = conditionValue;
                        return branchCopy;
                    }
                }

                return branch;
            }).filter(Boolean) as Branch[];

            updatedNode.branches = updatedBranches;

            // check all nodes and remove empty nodes
            const removeEmptyNodeVisitor = new RemoveEmptyNodesVisitor(updatedNode);
            traverseNode(updatedNode, removeEmptyNodeVisitor);
            const updatedNodeWithoutEmptyNodes = removeEmptyNodeVisitor.getNode();

            onSubmit(updatedNodeWithoutEmptyNodes);
        }
    };

    const addNewCase = () => {
        const existingValues = branches.map((_, idx) => getValues(`branch-${idx}`));

        const lastIndex = branches.length - 1;
        const hasDefaultBranchAtEnd = lastIndex >= 0 && isDefaultBranch(branches[lastIndex]);
        const newBranchIndex = hasDefaultBranchAtEnd ? lastIndex : branches.length;

        const newBranch: Branch = {
            label: "branch-" + newBranchIndex,
            kind: "block",
            codedata: {
                node: "CONDITIONAL",
                lineRange: null,
            },
            repeatable: "ONE_OR_MORE",
            properties: {
                patterns: {
                    metadata: {
                        label: "Patterns",
                        description: "Patterns to match the target against",
                    },
                    value: [
                        {
                            metadata: {
                                label: "Pattern",
                                description: "Pattern or value to match the target against",
                            },
                            value: "",
                            types: [{ fieldType: "EXPRESSION", selected: false }],
                            optional: false,
                            editable: true,
                            advanced: false,
                            hidden: false,
                        },
                    ],
                    types: [{ fieldType: "SINGLE_SELECT", selected: false }],
                    optional: false,
                    editable: true,
                    advanced: false,
                    hidden: false,
                },
            },
            children: [],
        };

        let updatedBranches;
        if (hasDefaultBranchAtEnd) {
            updatedBranches = [
                ...branches.slice(0, lastIndex),
                newBranch,
                branches[lastIndex]
            ];

            setValue(`branch-${DEFAULT_BRANCH_INDEX}`, getValues(`branch-${lastIndex}`));
        } else {
            updatedBranches = [...branches, newBranch];
        }

        setBranches(updatedBranches);
        setValue(`branch-${newBranchIndex}`, "");

        existingValues.forEach((value, idx) => {
            if (value && idx !== lastIndex) {
                setValue(`branch-${idx}`, value);
            }
        });
    };

    const removeCondition = (index: number) => {
        const nonDefaultBranches = branches.filter(branch => !isDefaultBranch(branch));

        // Don't remove if it's the first branch (index 0)
        // Or if it would leave us with zero non-default branches
        if (index === 0 || (nonDefaultBranches.length <= 1 && !isDefaultBranch(branches[index]))) {
            return;
        }

        if (isDefaultBranch(branches[index])) {
            return;
        }

        const fieldKey = `branch-${index}`;
        handleSetDiagnosticsInfo({ key: fieldKey, diagnostics: [] });
        clearErrors(fieldKey);

        // Remove the branch at the specified index
        const updatedBranches = branches.filter((_, i) => i !== index);
        setBranches(updatedBranches);

        for (let i = index + 1; i < branches.length; i++) {
            const value = getValues(`branch-${i}`);
            setValue(`branch-${i - 1}`, value);

            if (diagnosticsInfo) {
                const oldKey = `branch-${i}`;
                const newKey = `branch-${i - 1}`;
                const fieldDiagnostics = diagnosticsInfo.find(d => d.key === oldKey);
                if (fieldDiagnostics) {
                    handleSetDiagnosticsInfo({
                        key: newKey,
                        diagnostics: fieldDiagnostics.diagnostics
                    });
                    handleSetDiagnosticsInfo({
                        key: oldKey,
                        diagnostics: []
                    });
                }
            }
        }
    };

    const addDefaultBlock = () => {
        if (hasDefaultBranch) {
            return;
        }

        const draftDefaultBranchIndex = branches.findIndex(branch =>
            isDefaultBranch(branch) && branch.children?.at(0)?.metadata.draft === true
        );

        if (draftDefaultBranchIndex >= 0) {
            const updatedBranches = [...branches];
            const updatedBranch = cloneDeep(updatedBranches[draftDefaultBranchIndex]);

            if (!updatedBranch.children || updatedBranch.children.length === 0) {
                updatedBranch.children = [];
            } else {
                updatedBranch.children.forEach(child => {
                    if (child.metadata) {
                        child.metadata.draft = false;
                    }
                });
            }

            updatedBranches[draftDefaultBranchIndex] = updatedBranch;
            setBranches(updatedBranches);
        } else {
            // No draft default branch exists, create a new one
            const newDefaultBranch: Branch = {
                label: "_",
                kind: "block",
                codedata: {
                    node: "CONDITIONAL",
                    lineRange: null,
                },
                repeatable: "ONE_OR_MORE",
                properties: {
                    patterns: {
                        metadata: {
                            label: "Patterns",
                            description: "Patterns to match the target against",
                        },
                        types: [{ fieldType: "SINGLE_SELECT", selected: false }],
                        value: [
                            {
                                metadata: {
                                    label: "Pattern",
                                    description: "Pattern or value to match the target against",
                                },
                                types: [{ fieldType: "EXPRESSION", selected: false }],
                                value: "_",
                                optional: false,
                                editable: true,
                                advanced: false,
                                hidden: false,
                            },
                        ],
                        optional: false,
                        editable: true,
                        advanced: false,
                        hidden: false,
                    },
                },
                children: [],
            };

            const updatedBranches = [...branches, newDefaultBranch];
            setBranches(updatedBranches);
        }

        setValue(`branch-${DEFAULT_BRANCH_INDEX}`, "_");
    };

    const removeDefaultBlock = () => {
        if (!hasDefaultBranch) {
            return;
        }

        const defaultBranchIndices = branches
            .map((branch, index) => isDefaultBranch(branch) ? index : -1)
            .filter(index => index !== -1);

        if (defaultBranchIndices.length === 0) {
            return;
        }

        const updatedBranches = branches.filter(branch => !isDefaultBranch(branch));
        setBranches(updatedBranches);

        defaultBranchIndices.forEach(index => {
            const fieldKey = `branch-${index}`;
            handleSetDiagnosticsInfo({ key: fieldKey, diagnostics: [] });
            clearErrors(fieldKey);
        });

        handleSetDiagnosticsInfo({ key: `branch-${DEFAULT_BRANCH_INDEX}`, diagnostics: [] });
        clearErrors(`branch-${DEFAULT_BRANCH_INDEX}`);
    };

    const handleExpressionEditorDiagnostics = useCallback(
        debounce(async (showDiagnostics: boolean, expression: string, key: string, property: ExpressionProperty) => {
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

    console.log(">>> Match node", node);

    const disableSaveButton = !isValid || isValidating || showProgressIndicator;
    const targetField = convertNodePropertyToFormField(`branch-${TARGET_FIELD_INDEX}`, node.properties.matchTarget);
    targetField.label = "Target";

    return (
        <FormStyles.Container>
            <FormStyles.Row>
                <ExpressionEditor
                    {...expressionEditor}
                    control={control}
                    fieldInputType={{ fieldType: "EXPRESSION", selected: false }}
                    field={targetField}
                    setValue={setValue}
                    watch={watch}
                    openSubPanel={openSubPanel}
                    targetLineRange={targetLineRange}
                    fileName={fileName}
                    completions={activeEditor === TARGET_FIELD_INDEX ? expressionEditor.completions : []}
                    triggerCharacters={expressionEditor.triggerCharacters}
                    retrieveCompletions={expressionEditor.retrieveCompletions}
                    extractArgsFromFunction={expressionEditor.extractArgsFromFunction}
                    getExpressionEditorDiagnostics={handleExpressionEditorDiagnostics}
                    onFocus={() => handleEditorFocus(TARGET_FIELD_INDEX)}
                    onCompletionItemSelect={expressionEditor.onCompletionItemSelect}
                    onCancel={expressionEditor.onCancel}
                    onBlur={expressionEditor.onBlur}
                />
            </FormStyles.Row>
            <br />
            {branches.map((branch, index) => {
                const branchValue = (branch.properties?.patterns?.value as Property[])?.at(0);
                if (branchValue && !isDefaultBranch(branch)) {
                    const field = convertNodePropertyToFormField(`branch-${index}`, branchValue);
                    field.label = `${field.label} ${index + 1}`;
                    console.log(`>>> match pattern ${index}`, field);
                    return (
                        <FormStyles.Row key={field.key}>
                            <ExpressionEditor
                                {...expressionEditor}
                                control={control}
                                fieldInputType={{ fieldType: "EXPRESSION", selected: false }}
                                field={field}
                                setValue={setValue}
                                watch={watch}
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
                    );
                }
            })}

            <LinkButton onClick={addNewCase} sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}>
                <Codicon name={"add"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                Add Case Block
            </LinkButton>

            {!hasDefaultBranch && (
                <LinkButton
                    onClick={addDefaultBlock}
                    sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                >
                    <Codicon name={"add"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                    Add Default Case Block
                </LinkButton>
            )}

            {hasDefaultBranch && (
                <LinkButton
                    onClick={removeDefaultBlock}
                    sx={{ fontSize: 12, padding: 8, color: ThemeColors.ERROR, gap: 4 }}
                >
                    <Codicon name={"chrome-minimize"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                    Remove Default Case Block
                </LinkButton>
            )}

            {onSubmit && (
                <FormStyles.Footer>
                    <Button appearance="primary" onClick={handleSubmit(handleOnSave)} disabled={disableSaveButton}>
                        {showProgressIndicator ? <Typography variant="progress">Saving...</Typography> : "Save"}
                    </Button>
                </FormStyles.Footer>
            )}
        </FormStyles.Container>
    );
}

export default MatchForm;
