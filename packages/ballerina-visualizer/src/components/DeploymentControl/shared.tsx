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

// Layout pieces and the popup frame shared by the Deploy panel's Agent Manager cards.

import React, { ReactNode } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { Codicon } from "@wso2/ui-toolkit";
import { PopupModal, PopupModalStep } from "../PopupModal";
import { CloseButton, HeaderTitleContainer, PopupHeader, PopupSubtitle, PopupTitle } from "../../views/BI/Connection/styles";

export const Stack = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

export const Actions = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
`;

export const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow-wrap: anywhere;
`;

export const Dot = styled.span<{ color: string }>`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: ${(props: { color: string }) => props.color};
`;

interface DeployPopupProps {
    title: string;
    subtitle?: string;
    onClose: () => void;
    maxWidth: number;
    height?: string;
    children: (close: () => void) => ReactNode;
}

export function DeployPopup({ title, subtitle, onClose, maxWidth, height, children }: DeployPopupProps) {
    return createPortal(
        <PopupModal onClose={onClose} autoHeight={!height} height={height} maxWidth={maxWidth} dismissOnEscape>
            {(close) => (
                <PopupModalStep>
                    <PopupHeader>
                        <HeaderTitleContainer>
                            <PopupTitle variant="h2">{title}</PopupTitle>
                            {subtitle && <PopupSubtitle variant="body2">{subtitle}</PopupSubtitle>}
                        </HeaderTitleContainer>
                        <CloseButton appearance="icon" onClick={close}>
                            <Codicon name="close" />
                        </CloseButton>
                    </PopupHeader>
                    {children(close)}
                </PopupModalStep>
            )}
        </PopupModal>,
        document.body
    );
}
