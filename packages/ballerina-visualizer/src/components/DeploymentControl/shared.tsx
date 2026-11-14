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
import { keyframes } from "@emotion/react";
import { Icon } from "@wso2/ui-toolkit";
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

// A wso2-font icon in a square box, centred so it lines up with the text beside it.
export function DeployIcon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
    return (
        <Icon name={name}
            sx={{ width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "inherit" }}
            iconSx={{ fontSize: size, width: size, height: size, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", color }} />
    );
}

export const SUCCESS = "var(--vscode-testing-iconPassed)";

// A fixed-width slot for a status dot, spinner or icon, so the labels after it line up.
export const MarkBox = styled.span<{ size?: number }>`
    width: ${(props: { size?: number }) => props.size ?? 16}px;
    height: ${(props: { size?: number }) => props.size ?? 16}px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const spin = keyframes`
    to { transform: rotate(360deg); }
`;

const SpinBox = styled(MarkBox)`
    @media (prefers-reduced-motion: no-preference) {
        animation: ${spin} 1s linear infinite;
    }
`;

export function Spinner({ size = 16 }: { size?: number }) {
    return <SpinBox size={size} role="img" aria-label="In progress"><DeployIcon name="bi-retry" size={size} /></SpinBox>;
}

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
                            <DeployIcon name="bi-close" />
                        </CloseButton>
                    </PopupHeader>
                    {children(close)}
                </PopupModalStep>
            )}
        </PopupModal>,
        document.body
    );
}
