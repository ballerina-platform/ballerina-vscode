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

import React, { useState } from "react";
import styled, { CSSObject } from "@emotion/styled";
import { ParameterModel } from "@wso2/ballerina-core";
import { Codicon } from "@wso2/ui-toolkit";
import {
    ActionIconWrapper,
    ContentSection,
    DeleteIconWrapper,
    EditIconWrapper,
    disabledHeaderLabel,
    headerLabelStyles,
} from "../../../styles";
import { ParamEditor } from "./ParamEditor";

export interface ParametersProps {
    parameters: ParameterModel[];
    onChange: (parameters: ParameterModel[]) => void;
    onEditClick?: (param: ParameterModel) => void;
    showPayload: boolean;
    typeLabel?: string;
    /** Hides the parameter name in the card and the editor (e.g. a fixed data-binding param). */
    hideName?: boolean;
}

const ParamLabelContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--vscode-font-family);
    flex: 1;
`;

const ParamName = styled.span`
    color: var(--vscode-editor-foreground, #222);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--vscode-font-family);
`;

const ParamType = styled.span`
    font-size: 13px;
    color: var(--vscode-descriptionForeground, #888);
    background: var(--vscode-editorWidget-background, #f5f5f5);
    border-radius: 4px;
    padding: 2px 8px;
    letter-spacing: 0.1px;
`;

const HeaderLabel = styled.div<CSSObject>`
    display: flex;
    background: var(--vscode-editor-background);
    border: 1px solid ${(props: { haveErrors: boolean; }) => props.haveErrors ? "red" : "var(--vscode-dropdown-border)"};
    margin: 8px 0;
    display: flex;
    width: 100%;
    height: 32px;
    align-items: center;
`;

export function Parameters(props: ParametersProps) {
    const { parameters, onChange, onEditClick, showPayload, typeLabel, hideName } = props;

    const [editModel, setEditModel] = useState<ParameterModel | undefined>(undefined);
    const [editingIndex, setEditingIndex] = useState<number>(-1);

    const onDelete = (param: ParameterModel) => {
        const updatedParameters = parameters.filter(
            (p) => p.metadata.label !== param.metadata.label || p.name.value !== param.name.value
        );
        onChange(updatedParameters);
        setEditModel(undefined);
        setEditingIndex(-1);
    };

    const handleEdit = (param: ParameterModel) => {
        if (param.editable === false) {
            return;
        }

        if (onEditClick) {
            onEditClick(param);
            return;
        }

        setEditModel(param);
        const index = parameters.findIndex(p =>
            p.metadata?.label === param.metadata?.label &&
            p.name?.value === param.name?.value
        );
        setEditingIndex(index);
    };

    const onChangeParam = (param: ParameterModel) => {
        setEditModel(param);
        // Update the parameters array in real-time for existing parameters
        if (editingIndex >= 0) {
            const updatedParameters = [...parameters];
            updatedParameters[editingIndex] = param;
            onChange(updatedParameters);
        }
    };

    const onSaveParam = (param: ParameterModel) => {
        const updatedParam = { ...param, enabled: true };
        if (editingIndex >= 0) {
            const updatedParameters = [...parameters];
            updatedParameters[editingIndex] = updatedParam;
            onChange(updatedParameters);
        }
        setEditModel(undefined);
        setEditingIndex(-1);
    };

    const onParamEditCancel = () => {
        setEditModel(undefined);
        setEditingIndex(-1);
    };

    return (
        <div>
            {showPayload && (
                <>
                    {parameters.map((param: ParameterModel, index) => {
                        const readonly = param.editable === false;
                        const formattedTypeValue = param.type.value;

                        const label = (
                            <ParamLabelContainer>
                                <ParamType>
                                    {formattedTypeValue}
                                </ParamType>
                                {!hideName && param.name?.value && (
                                    <ParamName>{param.name.value}</ParamName>
                                )}
                            </ParamLabelContainer>
                        );

                        return (
                            <HeaderLabel key={index} data-testid={`${param.name.value}-item`}>
                                <ContentSection>
                                    <div
                                        data-test-id={`${param.name.value}-param`}
                                        className={readonly ? disabledHeaderLabel : headerLabelStyles}
                                        onClick={() => handleEdit(param)}
                                    >
                                        {label}
                                    </div>
                                    {!readonly && (
                                        <ActionIconWrapper>
                                            <EditIconWrapper>
                                                <Codicon name="edit" onClick={() => handleEdit(param)} />
                                            </EditIconWrapper>
                                            <DeleteIconWrapper>
                                                <Codicon name="trash" onClick={() => onDelete(param)} />
                                            </DeleteIconWrapper>
                                        </ActionIconWrapper>
                                    )}
                                </ContentSection>
                            </HeaderLabel>
                        );
                    })}
                    {editModel && !onEditClick && (
                        <ParamEditor
                            param={editModel}
                            onChange={onChangeParam}
                            onSave={onSaveParam}
                            onCancel={onParamEditCancel}
                            typeLabel={typeLabel}
                            hideName={hideName}
                        />
                    )}
                </>
            )}
        </div>
    );
}
