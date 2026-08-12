/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { ReactNode } from "react";
import styled from "@emotion/styled";
import { EditableTitle } from "../../../components/EditableTitle";
import { UndoRedoGroup } from "../../../components/UndoRedoGroup";

interface HeaderRowProps {
    isBallerinaWorkspace?: boolean;
    hideDivider?: boolean;
    hasTopNavigationBar?: boolean;
}

const HeaderRow = styled.div<HeaderRowProps>`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0 16px 16px;
    background: var(--vscode-editor-background);
    border-bottom: ${(props: HeaderRowProps) =>
        props.hideDivider ? "none" : "1px solid var(--vscode-dropdown-border)"
    };
    margin: ${(props: HeaderRowProps) =>
        props.isBallerinaWorkspace
            ? "0 16px 0 16px"
            : props.hideDivider
                ? props.hasTopNavigationBar ? "0 12px 0 16px" : "16px 12px 0 16px"
                : "16px 16px 0 16px"};
`;

const TitleContainer = styled.div`
    display: flex;
    align-items: flex-end;
    gap: 8px;
    min-width: 0;
`;

const ProjectTitle = styled.h1`
    font-weight: bold;
    font-size: 1.5rem;
    margin-bottom: 0;
    margin-top: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    @media (min-width: 768px) {
        font-size: 1.875rem;
    }
`;

const ProjectSubtitle = styled.h2`
    display: none;
    font-weight: 200;
    font-size: 1.5rem;
    opacity: 0.3;
    margin-bottom: 0;
    margin-top: 0;
    white-space: nowrap;

    @media (min-width: 640px) {
        display: block;
    }

    @media (min-width: 768px) {
        font-size: 1.875rem;
    }
`;

const HeaderControls = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;

    vscode-button[appearance="icon"] {
        transition: background-color 150ms ease, color 150ms ease;
    }

    vscode-button[appearance="icon"]:active {
        background: var(--vscode-toolbar-activeBackground, rgba(90, 93, 94, 0.5));
    }

    vscode-button[appearance="icon"]:active::part(control) {
        background: transparent;
    }
`;

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    onTitleEdit?: (newTitle: string) => Promise<void>;
    validateTitle?: (value: string) => string;
    isBallerinaWorkspace?: boolean;
    hideUndoRedo?: boolean;
    hideDivider?: boolean;
    hasTopNavigationBar?: boolean;
}

export function PageHeader(props: PageHeaderProps) {
    const { title, subtitle, actions, onTitleEdit, validateTitle, isBallerinaWorkspace, hideUndoRedo, hideDivider, hasTopNavigationBar } = props;

    return (
        <HeaderRow
            isBallerinaWorkspace={isBallerinaWorkspace}
            hideDivider={hideDivider}
            hasTopNavigationBar={hasTopNavigationBar}
        >
            <TitleContainer>
                {onTitleEdit ? (
                    <EditableTitle title={title} onCommit={onTitleEdit} validate={validateTitle}>
                        <ProjectTitle>{title}</ProjectTitle>
                    </EditableTitle>
                ) : (
                    <ProjectTitle>{title}</ProjectTitle>
                )}
                {subtitle && <ProjectSubtitle>{subtitle}</ProjectSubtitle>}
            </TitleContainer>
            <HeaderControls>
                {!hideUndoRedo && <UndoRedoGroup key={Date.now()} />}
                {actions}
            </HeaderControls>
        </HeaderRow>
    );
}
