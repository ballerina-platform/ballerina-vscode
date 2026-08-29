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
import { CodeData, FunctionModel, ProjectStructureArtifactResponse } from '@wso2/ballerina-core';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { ResourceAccordionSkeleton } from '../../../../components/Skeletons';

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

const AccordionHeader = styled.div<HeaderProps>`
    padding: 10px;
    cursor: pointer;
    display: grid;
    grid-template-columns: 3fr 1fr;
`;

const LinkButtonWrapper = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    padding: 0 16px;

    :hover {
        outline: 1px solid var(--vscode-inputOption-activeBorder);
    }
`;

const ButtonWrapper = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    font-size: 10px;
    width: 40px;
`;

const MethodBox = styled.div<MethodProp>`
    display: flex;
    justify-content: center;
    height: 25px;
    min-width: 70px;
    width: auto;
    margin-left: ${(p: MethodProp) => p.hasLeftMargin ? "10px" : "0px"};
    text-align: center;
    padding: 3px 5px 3px 5px;
    background-color: ${(p: MethodProp) => p.color};
    color: #FFF;
    align-items: center;
    font-weight: bold;
`;

const MethodSection = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
`;

const verticalIconStyles = {
    transform: "rotate(90deg)",
    ":hover": {
        backgroundColor: "var(--vscode-welcomePage-tileHoverBackground)",
    }
};

const ButtonSection = styled.div<ButtonSectionProps>`
    display: flex;
    align-items: center;
    margin-left: auto;
    gap: ${(p: ButtonSectionProps) => p.isExpanded ? "8px" : "6px"};
`;

const AccordionContent = styled.div`
    padding: 10px;
`;

const MethodPath = styled.span`
    align-self: center;
    margin-left: 10px;
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

const ActionButton = styled(Button)`
    display: flex;
    align-items: center;
    gap: 4px;
    & > vscode-button::part(control) {
        padding: 4px 8px;
    }
`;

export interface ResourceAccordionPropsV2 {
    resource: ProjectStructureArtifactResponse;
    onEditResource: (resource: FunctionModel) => void;
    onDeleteResource: (resource: FunctionModel) => void;
    onResourceImplement: (resource: FunctionModel) => void;
    readOnly?: boolean;
    methodName?: string;
    deletionTypeLabel?: string;
}

export function ResourceAccordionV2(params: ResourceAccordionPropsV2) {
    const { resource, onEditResource, onDeleteResource, onResourceImplement, readOnly, methodName, deletionTypeLabel } = params;

    const [isOpen, setIsOpen] = useState(false);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    const [confirmEl, setConfirmEl] = React.useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const { rpcClient } = useRpcContext();


    const toggleAccordion = () => {
        setIsOpen(!isOpen);
    };

    const getFunctionModel = async () => {
        const codeData: CodeData = {
            lineRange: {
                fileName: resource.path,
                startLine: { line: resource.position.startLine, offset: resource.position.startColumn },
                endLine: { line: resource.position.endLine, offset: resource.position.endColumn },
            }
        }
        const functionModel = await rpcClient.getServiceDesignerRpcClient().getFunctionFromSource({ filePath: resource.path, codedata: codeData });
        return functionModel;
    }

    const handleEditResource = async (e: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        e.stopPropagation(); // Stop the event propagation
        const functionModel = await getFunctionModel();
        onEditResource(functionModel.function);
    };

    const handleOpenConfirm = () => {
        setConfirmOpen(true);
    };

    const handleDeleteResource = (e: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        e.stopPropagation(); // Stop the event propagation
        setConfirmEl(e.currentTarget);
        handleOpenConfirm();
    };

    const handleConfirm = async (status: boolean) => {
        if (status) {
            setIsDeleting(true);
            try {
                const functionModel = await getFunctionModel();
                onDeleteResource && onDeleteResource(functionModel.function);
            } catch (error) {
                setIsDeleting(false);
            }
        }
        setConfirmOpen(false);
        setConfirmEl(null);
    };

    const handleResourceImplement = async () => {
        const functionModel = await getFunctionModel();
        onResourceImplement(functionModel.function);
    }

    function getColorByMethod(method: string) {
        switch (method) {
            case "get-api":
                return colors.GET;
            case "put-api":
                return colors.PUT;
            case "post-api":
                return colors.POST;
            case "delete-api":
                return colors.DELETE;
            case "patch-api":
                return colors.PATCH;
            case "options-api":
                return colors.OPTIONS;
            case "head-api":
                return colors.HEAD;
            default:
                return '#876036'; // Default color
        }
    }

    if (isDeleting) {
        return <ResourceAccordionSkeleton />;
    }

    return (
        <AccordionContainer data-testid="service-agent-view-resource">
            <AccordionHeader onClick={handleResourceImplement}>
                <MethodSection>
                    <MethodBox color={getColorByMethod(resource.icon)}>
                        {methodName ? methodName : resource.icon ? resource.icon.split("-")[0].toUpperCase() : "REMOTE"}
                    </MethodBox>
                    <MethodPath>{resource.name}</MethodPath>
                </MethodSection>
                <ButtonSection>
                    <>
                        <ActionButton id="bi-edit" appearance="secondary" onClick={handleEditResource} disabled={!onEditResource}>
                            <Icon
                                name="bi-settings"
                                sx={{
                                    cursor: !onEditResource ? "not-allowed" : "pointer",
                                    opacity: !onEditResource ? 0.5 : 1,
                                    fontSize: "16px",
                                    width: "16px",
                                }}
                            />
                        </ActionButton >
                        <ActionButton id="bi-delete" appearance="secondary" onClick={handleDeleteResource} disabled={readOnly}>
                            <Codicon
                                name="trash"
                                sx={{
                                    cursor: readOnly ? "not-allowed" : "pointer",
                                    opacity: readOnly ? 0.5 : 1,
                                    width: "16px",
                                }}
                            />
                        </ActionButton >
                    </>
                </ButtonSection>

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
        </AccordionContainer >
    );
};
