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
import React, { useState } from 'react';
import styled from '@emotion/styled';
import { Codicon, Confirm, Icon } from '@wso2/ui-toolkit';
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { FieldType } from '@wso2/ballerina-core';

const COLORS = {
    METHOD_BOX_BACKGROUND: '#845a23ff'
} as const;

type ContainerProps = {
    borderColor?: string;
    haveErrors?: boolean;
};

type ButtonSectionProps = {
    isExpanded?: boolean;
};

type HeaderProps = {
    expandable?: boolean;
}

const AccordionContainer = styled.div<ContainerProps>`
    margin-top: 10px;
    overflow: hidden;
    background-color: var(--vscode-editorHoverWidget-statusBarBackground);
    &:hover {
        background-color: var(--vscode-editorHoverWidget-border);
        cursor: pointer;
    }
    border: ${(p: ContainerProps) => p.haveErrors ? "1px solid red" : "none"};
`;

const AccordionHeader = styled.div<HeaderProps>`
    padding: 10px;
    cursor: pointer;
    display: grid;
    grid-template-columns: 3fr 1fr;
`;

const MethodSection = styled.div`
    display: flex;
    gap: 4px;
`;

const ButtonSection = styled.div<ButtonSectionProps>`
    display: flex;
    align-items: center;
    margin-left: auto;
    gap: ${(p: ButtonSectionProps) => p.isExpanded ? "8px" : "6px"};
`;

const VariableLabel = styled.span`
    align-self: center;
    margin-left: 5px;
`;

const MethodBox = styled.div`
    display: flex;
    justify-content: center;
    height: 25px;
    min-width: 70px;
    width: auto;
    text-align: center;
    padding: 3px 5px 3px 5px;
    background-color: ${COLORS.METHOD_BOX_BACKGROUND};
    color: var(--vscode-button-foreground);
    align-items: center;
    font-weight: bold;
    border-radius: 3px;
`;

export interface VariableCardProps {
    fieldModel: Pick<FieldType, "type" | "name">;
    goToSource?: (fieldModel: FieldType) => void;
    onEditVariable?: (fieldModel: FieldType) => void;
    onDeleteVariable?: (fieldModel: FieldType) => void;
    onVariableImplement?: (fieldModel: FieldType) => void;
}

export function VariableCard(params: VariableCardProps) {
    const { fieldModel, goToSource, onEditVariable, onDeleteVariable, onVariableImplement } = params;

    const [isConfirmOpen, setConfirmOpen] = useState(false);
    const [confirmEl, setConfirmEl] = React.useState(null);


    const handleEditResource = (e: Event) => {
        e.stopPropagation(); // Stop the event propagation
        onEditVariable?.(fieldModel as FieldType);
    };

    const handleOpenConfirm = () => {
        setConfirmOpen(true);
    };

    const handleDeleteResource = (e: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        e.stopPropagation(); // Stop the event propagation
        setConfirmEl(e.currentTarget);
        handleOpenConfirm();
    };

    const handleConfirm = (status: boolean) => {
        if (status) {
            onDeleteVariable?.(fieldModel as FieldType);
        }
        setConfirmOpen(false);
        setConfirmEl(null);
    };

    const handleVariableImplement = () => {
        onVariableImplement?.(fieldModel as FieldType)
    }

    return (
        <AccordionContainer>
            <AccordionHeader onClick={handleVariableImplement}>
                <MethodSection>
                    <MethodBox>
                        {fieldModel.type.value}
                    </MethodBox>
                    <VariableLabel>{fieldModel.name.value}</VariableLabel>
                </MethodSection>
                <ButtonSection>
                    <>
                        {onEditVariable && (
                            <VSCodeButton
                                data-testid={`edit-variable-button-${fieldModel.name.value}`}
                                appearance="icon"
                                title="Edit Variable"
                                onClick={handleEditResource}>
                                <Icon name="bi-edit" sx={{ marginTop: 3.5 }} />
                            </VSCodeButton>
                        )}
                        {onDeleteVariable && (
                            <VSCodeButton
                                data-testid={`delete-variable-button-${fieldModel.name.value}`}
                                appearance="icon"
                                title="Delete Variable"
                                onClick={handleDeleteResource}>
                                <Codicon name="trash" />
                            </VSCodeButton>
                        )}
                    </>
                </ButtonSection>
            </AccordionHeader>
            <Confirm
                isOpen={isConfirmOpen}
                onConfirm={handleConfirm}
                confirmText="Okay"
                message="Are you sure want to delete this variable?"
                anchorEl={confirmEl}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                sx={{ zIndex: 3002 }}
            />
        </AccordionContainer>
    );
};
