/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { Button, Codicon, Confirm, Icon } from '@wso2/ui-toolkit';
import { FunctionModel } from '@wso2/ballerina-core';
import { ResourceAccordionSkeleton } from '../../../../components/Skeletons';
import { canDataBind } from '../utils';


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
    background-color: var(--vscode-editorHoverWidget-background);
    &:hover {
        background-color: var(--vscode-list-hoverBackground);
        cursor: pointer;
    }
    border: ${(p: ContainerProps) => p.haveErrors ? "1px solid red" : "none"};
`;

const ActionButton = styled(Button)`
    display: flex;
    align-items: center;
    gap: 4px;
    & > vscode-button::part(control) {
        padding: 4px 8px;
    }
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

const MethodBox = styled.div`
    display: flex;
    justify-content: center;
    height: 25px;
    min-width: 70px;
    width: auto;
    margin-left: 0px;
    text-align: center;
    padding: 3px 5px 3px 5px;
    background-color: #876036;
    color: #FFF;
    align-items: center;
    font-weight: bold;
`;

const colors = {
    "GET": '#3d7eff',
    "PUT": '#fca130',
    "POST": '#49cc90',
    "DELETE": '#f93e3e',
    "PATCH": '#986ee2',
    "OPTIONS": '#0d5aa7',
    "HEAD": '#9012fe'
}

export function getColorByMethod(method: string) {
    switch (method.toUpperCase()) {
        case "GET":
            return colors.GET;
        case "PUT":
            return colors.PUT;
        case "POST":
            return colors.POST;
        case "DELETE":
            return colors.DELETE;
        case "PATCH":
            return colors.PATCH;
        case "OPTIONS":
            return colors.OPTIONS;
        case "HEAD":
            return colors.HEAD;
        default:
            return '#876036'; // Default color
    }
}

export interface ResourceAccordionProps {
    functionModel: FunctionModel;
    method?: string;
    goToSource: (resource: FunctionModel) => void;
    onEditResource: (resource: FunctionModel) => void;
    onDeleteResource: (resource: FunctionModel) => void;
    onResourceImplement: (resource: FunctionModel) => void;
    deletionTypeLabel?: string;
    /** Grays out the edit button even when the resource is otherwise editable (nothing to configure). */
    editDisabled?: boolean;
}

export function ResourceAccordion(params: ResourceAccordionProps) {
    const { functionModel, method, goToSource, onEditResource, onDeleteResource, onResourceImplement, deletionTypeLabel, editDisabled } = params;

    const [isOpen, setIsOpen] = useState(false);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    const [confirmEl, setConfirmEl] = React.useState(null);
    const [isDeleting, setIsDeleting] = useState(false);


    const toggleAccordion = () => {
        setIsOpen(!isOpen);
    };

    const handleShowDiagram = (e: Event) => {
        e.stopPropagation(); // Stop the event propagation
        goToSource(functionModel);
    };

    const handleEditResource = (e: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        e.stopPropagation(); // Stop the event propagation
        onEditResource(functionModel);
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
            setIsDeleting(true);
            try {
                onDeleteResource && onDeleteResource(functionModel);
            } catch (error) {
                setIsDeleting(false);
            }
        }
        setConfirmOpen(false);
        setConfirmEl(null);
    };

    const handleResourceImplement = () => {
        onResourceImplement(functionModel)
    }

    if (isDeleting) {
        return <ResourceAccordionSkeleton />;
    }

    return (
        <AccordionContainer data-testid="service-agent-view-resource">
            <AccordionHeader onClick={handleResourceImplement}>
                <MethodSection>
                    <MethodBox>
                        {functionModel.metadata?.badge || method || "Event"}
                    </MethodBox>
                    <MethodPath>{functionModel.name.value}</MethodPath>
                </MethodSection>
                {functionModel &&
                    <ButtonSection>
                        <>
                            {onEditResource && (
                                <ActionButton
                                    id="bi-edit"
                                    appearance="secondary"
                                    onClick={handleEditResource}
                                    disabled={editDisabled || (!functionModel.editable && !canDataBind(functionModel))}
                                >
                                    <Icon
                                        name="bi-settings"
                                        sx={{
                                            cursor: editDisabled || !functionModel.editable ? "not-allowed" : "pointer",
                                            opacity: editDisabled || !functionModel.editable ? 0.5 : 1,
                                            fontSize: "16px",
                                            width: "16px",
                                        }}
                                    />
                                </ActionButton >
                            )}
                            {onDeleteResource && (
                                <ActionButton id="bi-delete" appearance="secondary" onClick={handleDeleteResource} disabled={!functionModel.optional}>
                                    <Codicon
                                        name="trash"
                                        sx={{
                                            cursor: !functionModel.optional ? "not-allowed" : "pointer",
                                            opacity: !functionModel.optional ? 0.5 : 1,
                                            width: "16px",
                                        }}
                                    />
                                </ActionButton >
                            )}
                        </>
                    </ButtonSection>
                }
            </AccordionHeader>
            <Confirm
                isOpen={isConfirmOpen}
                onConfirm={handleConfirm}
                confirmText="Delete"
                message={`Are you sure you want to delete this ${deletionTypeLabel || "resource"}?`}
                anchorEl={confirmEl}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
            />
        </AccordionContainer>
    );
};
