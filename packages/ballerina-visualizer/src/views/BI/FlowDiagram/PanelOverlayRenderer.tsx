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
import { PanelContainer } from "@wso2/ballerina-side-panel";
import { ThemeColors } from "@wso2/ui-toolkit";
import { usePanelOverlay } from "./hooks/usePanelOverlay";
import { AgentScopeProvider, nestedScope, useAgentScope } from "../AIChatAgent/agentScope";

const OverlayBackdrop = styled.div<{ zIndex: number }>`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: ${(props: { zIndex: number }) => props.zIndex};
    background-color: color-mix(in srgb, ${ThemeColors.SECONDARY_CONTAINER} 30%, transparent);
    display: flex;
    justify-content: flex-end;
`;

const OverlayPanelWrapper = styled.div<{ zIndex: number }>`
    position: relative;
    z-index: ${(props: { zIndex: number }) => props.zIndex + 1};
`;

export function PanelOverlayRenderer() {
    const { overlays, closeOverlay } = usePanelOverlay();
    const scope = nestedScope(useAgentScope());

    if (overlays.length === 0) {
        return null;
    }

    // Above the ui-toolkit SidePanel (z-index 2000) but below DynamicModal (2100)
    // so record-config and similar modals continue to render on top of overlays.
    const BASE_Z_INDEX = 2010;

    return (
        <>
            {overlays.map((overlay, index) => {
                const zIndex = BASE_Z_INDEX + index * 2;

                return (
                    <OverlayBackdrop
                        key={overlay.id}
                        zIndex={zIndex}
                        onClick={() => closeOverlay(overlay.id)}
                    >
                        <OverlayPanelWrapper zIndex={zIndex} onClick={(e) => e.stopPropagation()}>
                            <PanelContainer
                                title={overlay.title}
                                show={true}
                                onClose={() => closeOverlay(overlay.id)}
                                onBack={overlay.onBack}
                                width={overlay.width || 400}
                            >
                                <AgentScopeProvider value={scope}>{overlay.content}</AgentScopeProvider>
                            </PanelContainer>
                        </OverlayPanelWrapper>
                    </OverlayBackdrop>
                );
            })}
        </>
    );
}
