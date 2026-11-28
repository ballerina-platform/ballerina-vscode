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

import React from "react";
import { Button, SidePanel, SidePanelTitleContainer, ThemeColors } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { BackIcon, CloseIcon } from "../../resources";
import { AssistHeaderButton, AssistHostProvider } from "../editors/FieldAssist/AssistHost";

const OUTER_RADIUS = "var(--vscode-cornerRadius-large, 8px)";

export interface PanelContainerProps {
    children?: React.ReactNode;
    title?: string;
    width?: number;
    show: boolean;
    subPanel?: React.ReactNode;
    subPanelWidth?: number;
    onClose: () => void;
    onBack?: () => void;
    overlay?: boolean;
}

namespace S {
    export const StyledButton = styled(Button)`
        border-radius: 5px;
    `;

    export const HeaderEnd = styled.div`
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    export const TitleContainer = styled.div`
        display: flex;
        align-items: center;
        gap: 10px;
    `;
}

export function PanelContainer(props: PanelContainerProps) {
    const { children, title, show, onClose, onBack, width, subPanel, subPanelWidth, overlay = false } = props;

    return (
        <SidePanel
            isOpen={show}
            alignment="right"
            overlay={overlay}
            width={width || 400}
            sx={{
                fontFamily: "GilmerRegular",
                backgroundColor: ThemeColors.SURFACE_DIM,
                boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
                display: "flex",
                flexDirection: "column",
                // The sub panel, when present, faces the canvas instead.
                ...(!subPanel && { borderTopLeftRadius: OUTER_RADIUS, borderBottomLeftRadius: OUTER_RADIUS }),
            }}
            subPanel={subPanel}
            subPanelWidth={subPanelWidth}
        >
            <AssistHostProvider review="start">
                <PanelBody title={title} onBack={onBack} onClose={onClose}>{children}</PanelBody>
            </AssistHostProvider>
        </SidePanel>
    );
}

function PanelBody({ children, title, onBack, onClose }: Pick<PanelContainerProps, "children" | "title" | "onBack" | "onClose">) {
    return (
        <>
            {title && (
                <SidePanelTitleContainer>
                    <S.TitleContainer>
                        {onBack && (
                            <S.StyledButton appearance="icon" onClick={onBack}>
                                <BackIcon />
                            </S.StyledButton>
                        )}
                        {title}
                    </S.TitleContainer>
                    <S.HeaderEnd>
                        <AssistHeaderButton />
                        <S.StyledButton data-testid="close-panel-btn" appearance="icon" onClick={onClose}>
                            <CloseIcon />
                        </S.StyledButton>
                    </S.HeaderEnd>
                </SidePanelTitleContainer>
            )}
            {/* The body takes the height left under the title, so a form's 100% height ends at the panel's bottom. */}
            <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
        </>
    );
}

export default PanelContainer;
