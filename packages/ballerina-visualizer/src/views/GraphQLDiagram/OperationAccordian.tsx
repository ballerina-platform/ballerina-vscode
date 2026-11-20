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
import { FunctionModel } from '@wso2/ballerina-core';
import { getFieldFormTitle } from './GraphqlServiceEditor';

type MethodProp = {
    color: string;
    hasLeftMargin?: boolean;
};

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

interface Origin {
    vertical: "top" | "center" | "bottom";
    horizontal: "left" | "center" | "right";
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

const MethodPath = styled.span`
    align-self: center;
    margin-left: 10px;
`;

export interface OperationAccordionProps {
    functionModel: FunctionModel;
    goToSource: (resource: FunctionModel) => void;
    onEditFunction: (resource: FunctionModel) => void;
    onDeleteFunction: (resource: FunctionModel) => void;
    onFunctionImplement: (resource: FunctionModel) => void;
}

export function OperationAccordion(params: OperationAccordionProps) {
    const { functionModel, goToSource, onEditFunction, onDeleteFunction, onFunctionImplement } = params;

    const [isConfirmOpen, setConfirmOpen] = useState(false);
    const [confirmEl, setConfirmEl] = React.useState<HTMLElement | null>(null);
    const [anchorOrigin, setAnchorOrigin] = useState<Origin>({ vertical: "bottom", horizontal: "left" });
    const [transformOrigin, setTransformOrigin] = useState<Origin>({ vertical: "top", horizontal: "right" });

    const handleEditFuncrion = (e: Event) => {
        e.stopPropagation();
        onEditFunction(functionModel);
    };

    const handleDeleteFunction = (e: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        setConfirmEl(target);

        const rect = target.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        if (spaceBelow < 200 && spaceAbove > 200) {
            setAnchorOrigin({ vertical: "top", horizontal: "left" });
            setTransformOrigin({ vertical: "bottom", horizontal: "right" });
        } else {
            setAnchorOrigin({ vertical: "bottom", horizontal: "left" });
            setTransformOrigin({ vertical: "top", horizontal: "right" });
        }

        setConfirmOpen(true);
    };

    const handleConfirm = (status: boolean) => {
        if (status) {
            onDeleteFunction && onDeleteFunction(functionModel);
        }
        setConfirmOpen(false);
        setConfirmEl(null);
    };

    const handleFunctionImplement = () => {
        onFunctionImplement(functionModel)
    }

    return (
        <AccordionContainer>
            <AccordionHeader onClick={handleFunctionImplement}>
                <MethodSection>
                    <MethodPath>{functionModel.name.value}</MethodPath>
                </MethodSection>
                <ButtonSection>
                    <>
                        {onEditFunction! && (
                            <VSCodeButton appearance="icon" title={getFieldFormTitle(functionModel.kind, false)} onClick={handleEditFuncrion} data-testid={`edit-button-${functionModel.name.value}`}>
                                <Icon name="bi-edit" sx={{ marginTop: 3.5 }} />
                            </VSCodeButton>
                        )}
                        {onDeleteFunction! && (
                            <VSCodeButton appearance="icon" title="Delete Field" onClick={handleDeleteFunction} data-testid={`delete-button-${functionModel.name.value}`}>
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
                message="Are you sure want to delete this field?"
                anchorEl={confirmEl}
                anchorOrigin={anchorOrigin}
                transformOrigin={transformOrigin}
                sx={{ zIndex: 3002}}
            />
        </AccordionContainer>
    );
};

