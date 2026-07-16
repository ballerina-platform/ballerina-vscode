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
import { AvailableNode, ParentPopupData } from "@wso2/ballerina-core";
import { Codicon, ThemeColors } from "@wso2/ui-toolkit";
import {
    BackButton,
    CloseButton,
    HeaderTitleContainer,
    PopupContainer,
    PopupHeader,
    PopupOverlay,
    PopupTitle,
} from "../../Connection/styles";
import { AddAgentPopupContent, AddAgentView } from "./AddAgentPopupContent";

const AgentModalStep = styled.div<{ $direction: "forward" | "backward" }>`
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    animation: ${(props: { $direction: "forward" | "backward" }) =>
        props.$direction === "forward" ? "agent-step-forward" : "agent-step-backward"}
        150ms ease-out both;

    @keyframes agent-step-forward {
        from {
            opacity: 0;
            transform: translateX(8px);
        }

        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    @keyframes agent-step-backward {
        from {
            opacity: 0;
            transform: translateX(-8px);
        }

        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

export interface AddAgentPopupProps {
    projectPath: string;
    onClose?: (parent?: ParentPopupData) => void;
    onNavigateToOverview: () => void;
    isPopup?: boolean;
    inFlow?: boolean;
    onAgentCreated?: (agentVarName: string) => void;
    dependencyMode?: boolean;
    onAgentSelectedForDependency?: (agent: AvailableNode) => void;
    onGenericAgentSelected?: () => void;
    dependencyToolForm?: ReactNode;
    onDependencyToolFormBack?: () => void;
}

export function AddAgentPopup(props: AddAgentPopupProps) {
    const {
        onClose,
        onNavigateToOverview,
        isPopup,
        inFlow,
        onAgentCreated,
        dependencyMode,
        onAgentSelectedForDependency,
        onGenericAgentSelected,
        dependencyToolForm,
        onDependencyToolFormBack,
    } = props;
    const [view, setView] = useState<AddAgentView>("gallery");
    const [transitionDirection, setTransitionDirection] = useState<"forward" | "backward">("forward");
    // Held in the parent so it survives the AgentModalStep remount (key={view}) on view change.
    const [pendingAgent, setPendingAgent] = useState<AvailableNode>();
    const isDependencyToolForm = Boolean(dependencyToolForm);
    const isForm = isDependencyToolForm || view === "configure" || view === "create" || view === "createDefinition";

    const changeView = (nextView: AddAgentView, direction: "forward" | "backward" = "forward") => {
        setTransitionDirection(direction);
        setView(nextView);
    };

    const handleClosePopup = () => {
        if (isPopup) {
            onClose?.();
        } else {
            onNavigateToOverview();
        }
    };

    return (
        <>
            <PopupOverlay sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5`, zIndex: 2050 }} />
            <PopupContainer style={{ zIndex: 2051 }}>
                <AgentModalStep key={isDependencyToolForm ? "agent-tool-form" : view} $direction={transitionDirection}>
                    <PopupHeader>
                        {isForm && (
                            <BackButton
                                appearance="icon"
                                onClick={() => isDependencyToolForm ? onDependencyToolFormBack?.() : changeView("gallery", "backward")}
                            >
                                <Codicon name="chevron-left" />
                            </BackButton>
                        )}
                        <HeaderTitleContainer>
                            <PopupTitle variant="h2">
                                {isDependencyToolForm ? "Add Agent Tool"
                                    : view === "configure" ? "Configure Agent"
                                    : view === "create" ? "Create Agent"
                                    : view === "createDefinition" ? "Create Agent Definition"
                                        : dependencyMode ? "Use Agent" : "Add Agent"}
                            </PopupTitle>
                        </HeaderTitleContainer>
                        <CloseButton appearance="icon" onClick={handleClosePopup}>
                            <Codicon name="close" />
                        </CloseButton>
                    </PopupHeader>
                    {isDependencyToolForm ? dependencyToolForm : (
                        <AddAgentPopupContent
                            projectPath={props.projectPath}
                            onClose={handleClosePopup}
                            view={view}
                            onViewChange={changeView}
                            pendingAgent={pendingAgent}
                            onPendingAgentChange={setPendingAgent}
                            inFlow={inFlow}
                            onAgentCreated={onAgentCreated}
                            dependencyMode={dependencyMode}
                            onAgentSelectedForDependency={onAgentSelectedForDependency}
                            onGenericAgentSelected={onGenericAgentSelected}
                        />
                    )}
                </AgentModalStep>
            </PopupContainer>
        </>
    );
}

export default AddAgentPopup;
