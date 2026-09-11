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

import styled from "@emotion/styled";
import { ThemeColors } from "@wso2/ui-toolkit";
import React, { useState } from "react";

type HelperPaneListItemProps = {
    children: React.ReactNode;
    onClick?: () => void;
    endAction?: React.ReactNode;
    onClickEndAction?: () => void;
    className?: string;
    testId?: string;
    endActionTestId?: string;
}

const ItemContainer = styled.div`
    display: flex;
    align-items: center;
    margin: 0 4px;
`;

const MainContent = styled.div<{ isHovered: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 1;
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 6px;
    height: 32px;
    &:hover {
        background-color: ${ThemeColors.SURFACE_DIM_2};
        outline: 1px solid var(--dropdown-border);
        outline-offset: -1px;
    }
`;

const ContentLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
`;

const EndActionContainer = styled.div<{ isHovered: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    cursor: pointer;
    border-radius: 6px;
    
    &:hover {
        background-color: ${ThemeColors.SURFACE_DIM_2};
        outline: 1px solid var(--dropdown-border);
        outline-offset: -1px;
    }
`;

export const HelperPaneListItem: React.FC<HelperPaneListItemProps> = ({
    children,
    onClick,
    endAction,
    onClickEndAction,
    className,
    testId,
    endActionTestId
}) => {
    const [isMainHovered, setIsMainHovered] = useState(false);
    const [isEndActionHovered, setIsEndActionHovered] = useState(false);

    const handleOnClickEndAction = (event: React.MouseEvent) => {
        event.stopPropagation();
        onClickEndAction?.();
    }

    return (
        <ItemContainer className={className}>
            <MainContent
                data-testid={testId}
                onMouseEnter={() => setIsMainHovered(true)}
                onMouseLeave={() => setIsMainHovered(false)}
                onMouseDown={(e) => {
                    e.preventDefault();
                }}
                onClick={onClick}
                isHovered={isMainHovered}
            >
                <ContentLeft>
                    {children}
                </ContentLeft>
            </MainContent>
            {endAction && (
                <EndActionContainer
                    data-testid={endActionTestId}
                    onMouseEnter={() => setIsEndActionHovered(true)}
                    onMouseLeave={() => setIsEndActionHovered(false)}
                    onMouseDown={(e) => {
                        e.preventDefault();
                    }}
                    onClick={handleOnClickEndAction}
                    isHovered={isEndActionHovered}
                >
                    {endAction}
                </EndActionContainer>
            )}
        </ItemContainer>
    );
};

// Export the styled components for custom use cases
export const HelperPaneItemContainer = ItemContainer;
export const HelperPaneMainContent = MainContent;
export const HelperPaneContentLeft = ContentLeft;
export const HelperPaneEndAction = EndActionContainer;
