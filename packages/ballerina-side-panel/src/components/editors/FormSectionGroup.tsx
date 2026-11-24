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

import React, { ReactNode, useState } from "react";
import styled from "@emotion/styled";
import { Codicon } from "@wso2/ui-toolkit";

interface FormSectionGroupProps {
    title: string;
    children: ReactNode;
    defaultExpanded?: boolean;
}

const Wrapper = styled.div<{ isExpanded: boolean }>`
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: ${(props: { isExpanded: boolean }) => (props.isExpanded ? "visible" : "hidden")};
    transition: border-color 0.2s ease;

    &:hover {
        border-color: var(--vscode-focusBorder);
    }
`;

const Header = styled.div<{ isExpanded: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    cursor: pointer;
    user-select: none;
    background-color: ${(props: { isExpanded: boolean }) =>
        props.isExpanded ? "var(--vscode-sideBar-background)" : "transparent"};
    transition: background-color 0.2s ease;

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
`;

const HeaderLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const HeaderTitle = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-foreground);
`;

const ChevronIcon = styled.div<{ isExpanded: boolean }>`
    display: flex;
    align-items: center;
    transition: transform 0.2s ease;
    transform: ${(props: { isExpanded: boolean }) =>
        props.isExpanded ? "rotate(180deg)" : "rotate(0deg)"};
    color: var(--vscode-descriptionForeground);
`;

const Content = styled.div<{ isExpanded: boolean }>`
    display: grid;
    gap: 24px;
    max-height: ${(props: { isExpanded: boolean }) => (props.isExpanded ? "none" : "0")};
    opacity: ${(props: { isExpanded: boolean }) => (props.isExpanded ? 1 : 0)};
    overflow: ${(props: { isExpanded: boolean }) => (props.isExpanded ? "visible" : "hidden")};
    transition: opacity 0.2s ease;
    padding: ${(props: { isExpanded: boolean }) => (props.isExpanded ? "16px" : "0 16px")};
    border-top: ${(props: { isExpanded: boolean }) =>
        props.isExpanded ? "1px solid var(--vscode-panel-border)" : "none"};
`;

export function FormSectionGroup({ title, children, defaultExpanded = true }: FormSectionGroupProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <Wrapper isExpanded={isExpanded}>
            <Header isExpanded={isExpanded} onClick={() => setIsExpanded((prev) => !prev)}>
                <HeaderLeft>
                    <Codicon name="settings-gear" iconSx={{ fontSize: 14 }} />
                    <HeaderTitle>{title}</HeaderTitle>
                </HeaderLeft>
                <ChevronIcon isExpanded={isExpanded}>
                    <Codicon name="chevron-down" iconSx={{ fontSize: 14 }} />
                </ChevronIcon>
            </Header>
            <Content isExpanded={isExpanded}>{children}</Content>
        </Wrapper>
    );
}
