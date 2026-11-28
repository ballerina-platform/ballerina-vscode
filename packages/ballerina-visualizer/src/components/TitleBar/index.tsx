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
import { Icon, View } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AssistHeaderButton, AssistHostProvider, HandedOffContext } from "@wso2/ballerina-side-panel";
import { BetaSVG } from "../../views/Connectors/Marketplace/BetaSVG";
import { UndoRedoGroup } from "../UndoRedoGroup";
import { MACHINE_VIEW } from "@wso2/ballerina-core";
import { EditableTitle } from "../EditableTitle";

const TitleBarContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    min-height: 56px;
    background-color: var(--vscode-editorWidget-background);
    z-index: 1000;
`;

const LeftContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    width: 100%;
`;

const RightContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const TitleSection = styled.div`
    display: flex;
    align-items: baseline;
    gap: 12px;
`;

const Title = styled.h2`
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--vscode-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: fit-content;
`;

const SubTitle = styled.span`
    font-size: 14px;
    color: var(--vscode-descriptionForeground);
`;

const ActionsContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const IconButton = styled.div`
    padding: 4px;
    cursor: pointer;
    border-radius: 4px;

    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
    }

    & > div:first-child {
        width: 20px;
        height: 20px;
        font-size: 20px;
    }
`;

const BetaSVGWrapper = styled.span`
    display: inline-flex;
    align-items: center;
    margin-top: 2px;
`;

interface TitleBarProps {
    title: string;
    subtitle?: string;
    subtitleElement?: ReactNode;
    actions?: ReactNode;
    hideBack?: boolean;
    hideUndoRedo?: boolean;
    onBack?: () => void; // Override back functionality
    isBetaFeature?: boolean;
    onTitleEdit?: (newTitle: string) => Promise<void>;
    validateTitle?: (value: string) => string;
}

// Input style overrides to match the TitleBar's Title styled component (20px, 600 weight).
const TITLE_BAR_INPUT_STYLE: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    margin: 0,
};

export function TitleBar(props: TitleBarProps) {
    const { title, subtitle, subtitleElement, actions, hideBack, hideUndoRedo, onBack, isBetaFeature, onTitleEdit, validateTitle } = props;
    const { rpcClient } = useRpcContext();

    const [isDiagramView, setIsDiagramView] = useState(false);

    useEffect(() => {
        rpcClient.getVisualizerLocation().then((res) => {
            if (res.view === MACHINE_VIEW.BIDiagram) {
                setIsDiagramView(true);
            } else {
                setIsDiagramView(false);
            }
        });
    }, [title]);

    const handleBackButtonClick = () => {
        if (onBack) {
            onBack();
        } else {
            rpcClient.getVisualizerRpcClient().goBack();
        }
    };

    return (
        <TitleBarContainer data-testid="title-bar-container">
            <LeftContainer>
                {!hideBack && (
                    <IconButton data-testid="back-button" onClick={handleBackButtonClick}>
                        <Icon name="bi-arrow-back" iconSx={{ fontSize: "20px", color: "var(--vscode-foreground)" }} />
                    </IconButton>
                )}
                <TitleSection>
                    {onTitleEdit ? (
                        <EditableTitle
                            title={title}
                            onCommit={onTitleEdit}
                            validate={validateTitle}
                            inputStyle={TITLE_BAR_INPUT_STYLE}
                        >
                            <Title>{title}</Title>
                        </EditableTitle>
                    ) : (
                        <Title>{title}</Title>
                    )}
                    {subtitle && <SubTitle>{subtitle}</SubTitle>}
                    {subtitleElement && subtitleElement}
                </TitleSection>
                {isBetaFeature && (
                    <BetaSVGWrapper>
                        <BetaSVG width={45} height={18} />
                    </BetaSVGWrapper>
                )}
            </LeftContainer>
            <RightContainer>
                {(!hideUndoRedo && (actions || isDiagramView)) && <UndoRedoGroup key={Date.now()} />}
                {actions && <ActionsContainer>{actions}</ActionsContainer>}
                <AssistHeaderButton />
            </RightContainer>
        </TitleBarContainer>
    );
}

// A full-page view whose TitleBar offers the Copilot for the form inside it; onHandedOff means the view reloads on source changes, so its forms may hand requests to the chat.
export function AssistView({ children, onHandedOff }: { children: ReactNode; onHandedOff?: () => void }) {
    return (
        <AssistHostProvider review="end">
            <HandedOffContext.Provider value={onHandedOff}><View>{children}</View></HandedOffContext.Provider>
        </AssistHostProvider>
    );
}
