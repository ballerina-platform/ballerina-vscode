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
import { Codicon } from "@wso2/ui-toolkit";
import { CreateNewSection, OptionCard } from "./CreateNewSection";
import { PrebuiltAgentsView } from "./PrebuiltAgentsView";
import { PopupContent, Section, SectionTitle } from "./styles";

export interface AddAgentPopupContentProps {
    projectPath: string;
    onOpenAgentForm: (agent?: AvailableNode) => void;
    onOpenPackage: (agent: AvailableNode) => void;
    onBrowseDefinitions: () => void;
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
        onBrowseDefinitions,
        onOpenDurable,
        inFlow,
        dependencyMode,
        onAgentSelectedForDependency,
        onGenericAgentSelected,
        isAgentHidden,
    } = props;

    return (
        <PopupContent>
            <CreateNewSection
                dependencyMode={dependencyMode}
                onCreateAgent={() => onOpenAgentForm()}
                onCreateDurableAgent={inFlow ? undefined : onOpenDurable}
                onGenericAgent={onGenericAgentSelected}
            />

            {dependencyMode ? (
                <PrebuiltAgentsView
                    projectPath={projectPath}
                    heading={<SectionTitle variant="h4">Agent Types</SectionTitle>}
                    dependencyMode={dependencyMode}
                    onOpenAgentForm={onOpenAgentForm}
                    onOpenPackage={onOpenPackage}
                    onAgentSelectedForDependency={onAgentSelectedForDependency}
                    isAgentHidden={isAgentHidden}
                />
            ) : (
                <Section>
                    <SectionTitle variant="h4">Start from a Definition</SectionTitle>
                    <OptionCard
                        icon={<Codicon name="library" sx={{ width: 20, height: 20, display: "flex" }} iconSx={{ fontSize: 20 }} />}
                        title="Browse Agent Definitions"
                        description="Reuse an agent published in this project or your organization."
                        onClick={onBrowseDefinitions}
                    />
                </Section>
            )}
        </PopupContent>
    );
}
