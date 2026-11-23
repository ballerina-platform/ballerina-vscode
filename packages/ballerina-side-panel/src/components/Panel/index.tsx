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
import { BrowserSlotContext, useBrowserSlotHost, useDataBrowserWidth } from "../../context/insertTarget";
import { DataBrowserResizeHandle } from "../DataBrowserResizeHandle";

// Matches the sub panel's outer corners, so whichever panel faces the canvas is rounded.
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
    const { children, title, show, onClose, onBack, width, overlay = false } = props;
    const { slot: browserSlot, claimed, ref } = useBrowserSlotHost(!props.subPanel, false);
    const browserWidth = useDataBrowserWidth();
    const subPanel = claimed ? (
        <div style={{ position: "relative", height: "100%", borderRadius: "inherit" }}>
            <DataBrowserResizeHandle />
            <div ref={ref} style={{ height: "100%", borderRadius: "inherit" }} />
        </div>
    ) : props.subPanel;
    const subPanelWidth = claimed ? browserWidth : props.subPanelWidth;

    return (
        <SidePanel
            isOpen={show}
            alignment="right"
            overlay={overlay}
            width={width || 400}
            sx={{
                fontFamily: "GilmerRegular",
                backgroundColor: ThemeColors.SURFACE_DIM,
                display: "flex",
                flexDirection: "column",
                // Side by side, a shadow would fall across the sub panel; a hairline border separates them.
                ...(subPanel
                    ? { boxShadow: "none", borderLeft: "1px solid var(--vscode-panel-border)" }
                    : {
                        boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
                        borderTopLeftRadius: OUTER_RADIUS,
                        borderBottomLeftRadius: OUTER_RADIUS,
                    }),
            }}
            subPanel={subPanel}
            subPanelWidth={subPanelWidth}
        >
            <AssistHostProvider review="start">
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
                <div style={{ flex: 1, minHeight: 0 }}>
                    <BrowserSlotContext.Provider value={browserSlot}>{children}</BrowserSlotContext.Provider>
                </div>
            </AssistHostProvider>
        </SidePanel>
    );
}

export default PanelContainer;
