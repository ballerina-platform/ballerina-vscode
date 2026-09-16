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

import { ReactNode } from "react";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import { getNodeChartColor } from "@wso2/bi-diagram";
import {
    AgentOptionCard,
    AgentOptionContent,
    AgentOptionDescription,
    AgentOptionIcon,
    AgentOptionIconBadge,
    AgentOptionTitle,
    ArrowIcon,
    CreateOptionsGrid,
    Section,
    SectionTitle,
} from "./styles";

interface OptionCardProps {
    icon: ReactNode;
    title: string;
    description: string;
    onClick?: () => void;
}

function OptionCard({ icon, title, description, onClick }: OptionCardProps) {
    return (
        <AgentOptionCard onClick={onClick}>
            <AgentOptionIcon>{icon}</AgentOptionIcon>
            <AgentOptionContent>
                <AgentOptionTitle>{title}</AgentOptionTitle>
                <AgentOptionDescription>{description}</AgentOptionDescription>
            </AgentOptionContent>
            <ArrowIcon>
                <Codicon name="chevron-right" />
            </ArrowIcon>
        </AgentOptionCard>
    );
}

// The two robots wear the canvas cards' colours: agent cyan, durable bright blue.
const agentIcon = <Icon name="bi-ai-agent" sx={{ fontSize: 24, width: 24, height: 24, color: getNodeChartColor("AGENT") }} />;

const durableAgentIcon = (
    <>
        <Icon
            name="bi-ai-agent"
            sx={{ fontSize: 24, width: 24, height: 24, color: getNodeChartColor("DURABLE_AGENT_RUN"), display: "flex", alignItems: "center", justifyContent: "center" }}
        />
        <AgentOptionIconBadge>
            <Icon name="bi-flowchart" sx={{ width: 11, height: 11, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }} />
        </AgentOptionIconBadge>
    </>
);

const definitionIcon = (
    <Icon
        isCodicon={true}
        name="symbol-class"
        sx={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}
        iconSx={{ fontSize: "24px" }}
    />
);

export interface CreateNewSectionProps {
    dependencyMode?: boolean;
    onCreateAgent: () => void;
    onCreateDurableAgent?: () => void;
    onCreateDefinition: () => void;
    onGenericAgent?: () => void;
}

export function CreateNewSection(props: CreateNewSectionProps) {
    const { dependencyMode, onCreateAgent, onCreateDurableAgent, onCreateDefinition, onGenericAgent } = props;

    if (dependencyMode) {
        return (
            <Section>
                <SectionTitle variant="h4">Generic Agent</SectionTitle>
                <OptionCard
                    icon={agentIcon}
                    title="Generic ai:Agent"
                    description="Use a flexible agent input when the concrete agent is supplied by the caller."
                    onClick={onGenericAgent}
                />
            </Section>
        );
    }

    return (
        <Section>
            <SectionTitle variant="h4">Create New</SectionTitle>
            <Section>
                <CreateOptionsGrid>
                    <OptionCard
                        icon={agentIcon}
                        title="Create Agent"
                        description="Create an agent instance for this integration only."
                        onClick={onCreateAgent}
                    />
                    {onCreateDurableAgent && (
                        <OptionCard
                            icon={durableAgentIcon}
                            title="Create Durable Agent"
                            description="Runs as a workflow. Can wait days for a person or an event and resumes after a restart."
                            onClick={onCreateDurableAgent}
                        />
                    )}
                </CreateOptionsGrid>
                <OptionCard
                    icon={definitionIcon}
                    title="Create Agent Definition"
                    description="Create an agent definition that can be shared and used to create agent instances with the same configuration."
                    onClick={onCreateDefinition}
                />
            </Section>
        </Section>
    );
}
