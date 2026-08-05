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

import React, { useState } from "react";
import { ParentPopupData } from "@wso2/ballerina-core";
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

export interface AddAgentPopupProps {
    projectPath: string;
    onClose?: (parent?: ParentPopupData) => void;
    onNavigateToOverview: () => void;
    isPopup?: boolean;
    inFlow?: boolean;
    onAgentCreated?: (agentVarName: string) => void;
}

export function AddAgentPopup(props: AddAgentPopupProps) {
    const { onClose, onNavigateToOverview, isPopup, inFlow, onAgentCreated } = props;
    const [view, setView] = useState<AddAgentView>("gallery");
    const isForm = view === "configure" || view === "create";

    const handleClosePopup = () => {
        if (isPopup) {
            onClose?.();
        } else {
            onNavigateToOverview();
        }
    };

    return (
        <>
            <PopupOverlay sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5` }} />
            <PopupContainer>
                <PopupHeader>
                    {isForm && (
                        <BackButton appearance="icon" onClick={() => setView("gallery")}>
                            <Codicon name="chevron-left" />
                        </BackButton>
                    )}
                    <HeaderTitleContainer>
                        <PopupTitle variant="h2">
                            {view === "configure" ? "Configure Agent" : view === "create" ? "Create Agent" : "Add Agent"}
                        </PopupTitle>
                    </HeaderTitleContainer>
                    <CloseButton appearance="icon" onClick={handleClosePopup}>
                        <Codicon name="close" />
                    </CloseButton>
                </PopupHeader>
                <AddAgentPopupContent
                    projectPath={props.projectPath}
                    onClose={handleClosePopup}
                    view={view}
                    onViewChange={setView}
                    inFlow={inFlow}
                    onAgentCreated={onAgentCreated}
                />
            </PopupContainer>
        </>
    );
}

export default AddAgentPopup;
