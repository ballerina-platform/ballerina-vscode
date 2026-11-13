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

import React, { ReactNode, useEffect, useState } from "react";
import styled from "@emotion/styled";
import { ExpressionEditorDevantProps, ExpressionFormField, FormField, FormValues } from "@wso2/ballerina-side-panel";
import { EditorConfig, FlowNode, LineRange, SubPanel } from "@wso2/ballerina-core";
import FlowNodeForm from "../../Forms/FlowNodeForm";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { SidePanelView } from "../../FlowDiagram/PanelManager";
import { ConnectionKind } from "../../../../components/ConnectionSelector";
import { FormSubmitOptions } from "../../FlowDiagram";

const Container = styled.div<{ footerActionButton?: boolean }>`
    max-width: 800px;
    ${(props: { footerActionButton?: boolean }) => props.footerActionButton ? `
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    ` : `
        height: calc(100% - 32px);
    `}
`;

export interface SidePanelProps {
    id?: string;
    className?: string;
    isOpen?: boolean;
    overlay?: boolean;
    children?: React.ReactNode;
    alignment?: "left" | "right";
    width?: number;
    sx?: any;
    onClose?: (event?: React.MouseEvent<HTMLElement, MouseEvent>) => void;
    subPanel?: ReactNode;
    subPanelWidth?: number;
    isSubPanelOpen?: boolean;
}

interface ConnectionConfigViewProps {
    fileName: string; // file path of `connection.bal`
    submitText?: string;
    isSaving?: boolean;
    selectedNode: FlowNode;
    onSubmit: (updatedNode?: FlowNode, editorConfig?: EditorConfig, options?: FormSubmitOptions) => void;
    openSubPanel?: (subPanel: SubPanel) => void;
    updatedExpressionField?: ExpressionFormField;
    resetUpdatedExpressionField?: () => void;
    isActiveSubPanel?: boolean;
    isPullingConnector?: boolean;
    navigateToPanel?: (targetPanel: SidePanelView, connectionKind?: ConnectionKind) => void;
    footerActionButton?: boolean; // Render save button as footer action button
    devantExpressionEditor?: ExpressionEditorDevantProps;
    customValidator?: (fieldKey: string, value: any, allValues: FormValues) => string | undefined;
    /** Changes to the generated fields, by field key. */
    fieldOverrides?: Record<string, Partial<FormField>>;
}

export function ConnectionConfigView(props: ConnectionConfigViewProps) {
    const {
        fileName,
        selectedNode,
        onSubmit,
        openSubPanel,
        updatedExpressionField,
        resetUpdatedExpressionField,
        isPullingConnector,
        submitText,
        isSaving,
        navigateToPanel,
        footerActionButton,
        devantExpressionEditor,
        customValidator,
        fieldOverrides,
    } = props;
    const { rpcClient } = useRpcContext();
    const [targetLineRange, setTargetLineRange] = useState<LineRange>();

    useEffect(() => {
        if (selectedNode?.codedata?.lineRange) {
            setTargetLineRange(selectedNode.codedata.lineRange);
            return;
        }

        if (rpcClient && fileName) {
            rpcClient
                .getBIDiagramRpcClient()
                .getEndOfFile({ filePath: fileName })
                .then((res) => {
                    setTargetLineRange({
                        startLine: res,
                        endLine: res,
                    });
                });
        } else {
            setTargetLineRange({
                startLine: { line: 0, offset: 0 },
                endLine: { line: 0, offset: 0 },
            })
        }
    }, [fileName, selectedNode, rpcClient]);

    // The form takes no `onSaveNewVariable`, so its helper panes, record editor included, offer no
    // "+ New Variable": `onSubmit` here would save the variable as the connection and end the form,
    // and a variable declared beside a connection is one BI lists nowhere. Configurables cover that.
    return (
        <Container footerActionButton={footerActionButton}>
            {targetLineRange && (
                <FlowNodeForm
                    showProgressIndicator={isSaving}
                    submitText={submitText}
                    fileName={fileName}
                    node={selectedNode}
                    targetLineRange={targetLineRange}
                    onSubmit={onSubmit}
                    openSubPanel={openSubPanel}
                    updatedExpressionField={updatedExpressionField}
                    resetUpdatedExpressionField={resetUpdatedExpressionField}
                    disableSaveButton={isPullingConnector}
                    footerActionButton={footerActionButton}
                    navigateToPanel={navigateToPanel}
                    devantExpressionEditor={devantExpressionEditor}
                    customValidator={customValidator}
                    fieldOverrides={fieldOverrides}
                />
            )}
        </Container>
    );
}

export default ConnectionConfigView;
