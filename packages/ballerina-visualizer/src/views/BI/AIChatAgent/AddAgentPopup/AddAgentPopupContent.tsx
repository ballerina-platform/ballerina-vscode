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

import React from "react";
import { AvailableNode } from "@wso2/ballerina-core";
import { CreateNewSection } from "./CreateNewSection";
import { PrebuiltAgentsView } from "./PrebuiltAgentsView";
import { IntroText, PopupContent } from "./styles";

export interface AddAgentPopupContentProps {
    projectPath: string;
    onOpenAgentForm: (agent?: AvailableNode) => void;
    onOpenPackage: (agent: AvailableNode) => void;
    onOpenDefinition: () => void;
    onOpenDurable: () => void;
    inFlow?: boolean;
    dependencyMode?: boolean;
    onAgentSelectedForDependency?: (agent: AvailableNode) => void;
    onGenericAgentSelected?: () => void;
    isAgentHidden?: (agent: AvailableNode) => boolean;
}

export function AddAgentPopupContent(props: AddAgentPopupContentProps) {
    const {
        projectPath,
        onOpenAgentForm,
        onOpenPackage,
        onOpenDefinition,
        onOpenDurable,
        inFlow,
        dependencyMode,
        onAgentSelectedForDependency,
        onGenericAgentSelected,
        isAgentHidden,
    } = props;

    return (
        <PopupContent>
            <IntroText>
                {dependencyMode
                    ? "Choose the agent this definition should delegate to. The selected agent will be passed into this definition when it is created."
                    : "Create an agent for this integration, or start from a reusable agent definition."}
            </IntroText>

            <CreateNewSection
                dependencyMode={dependencyMode}
                onCreateAgent={() => onOpenAgentForm()}
                onCreateDurableAgent={inFlow ? undefined : onOpenDurable}
                onGenericAgent={onGenericAgentSelected}
            />

            <PrebuiltAgentsView
                projectPath={projectPath}
                title={dependencyMode ? "Agent Types" : "Agent Definitions"}
                dependencyMode={dependencyMode}
                onCreateDefinition={dependencyMode ? undefined : onOpenDefinition}
                onOpenAgentForm={onOpenAgentForm}
                onOpenPackage={onOpenPackage}
                onAgentSelectedForDependency={onAgentSelectedForDependency}
                isAgentHidden={isAgentHidden}
            />
        </PopupContent>
    );
}
