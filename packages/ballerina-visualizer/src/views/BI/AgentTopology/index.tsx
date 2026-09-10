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

import React, { useEffect } from "react";
import styled from "@emotion/styled";
import { ProjectStructureArtifactResponse } from "@wso2/ballerina-core";
import { AgentSelection, AgentTopologyDiagram, TriggerSelection } from "@wso2/component-diagram";
import { ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { useAgentTopology } from "./useAgentTopology";

const CenteredSlot = styled.div`
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
`;

export interface AgentTopologyProps {
    projectPath: string;
    agents: ProjectStructureArtifactResponse[];
    agentDefinitions?: ProjectStructureArtifactResponse[];
    onOpenAgent: (agent: AgentSelection) => void;
    onOpenTrigger: (trigger: TriggerSelection) => void;
    onAddTrigger?: (agent: AgentSelection) => void;
    onReady?: () => void;
}

export default function AgentTopology(props: AgentTopologyProps) {
    const { projectPath, agents, agentDefinitions, onOpenAgent, onOpenTrigger, onAddTrigger, onReady } = props;
    const input = useAgentTopology(projectPath, agents, agentDefinitions);

    useEffect(() => {
        if (input) {
            onReady?.();
        }
    }, [input, onReady]);

    if (!input) {
        return (
            <CenteredSlot>
                <ProgressRing color={ThemeColors.PRIMARY} />
            </CenteredSlot>
        );
    }

    return <AgentTopologyDiagram input={input} onAgentSelect={onOpenAgent} onTriggerSelect={onOpenTrigger} onAddTrigger={onAddTrigger} />;
}
