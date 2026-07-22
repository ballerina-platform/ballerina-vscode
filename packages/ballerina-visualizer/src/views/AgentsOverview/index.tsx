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

import React, { useEffect, useState } from "react";
import { EVENT_TYPE, MACHINE_VIEW, ProjectStructureArtifactResponse } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Icon, ProgressRing, ThemeColors, View, ViewContent } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { TopNavigationBar } from "../../components/TopNavigationBar";
import { TitleBar } from "../../components/TitleBar";
import ButtonCard from "../../components/ButtonCard";

const Container = styled.div`
    padding: 16px;
`;

const CardGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
    width: 100%;
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 60vh;
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.7;
`;

const SpinnerContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

interface AgentsOverviewProps {
    projectPath?: string;
}

export function AgentsOverview(props: AgentsOverviewProps) {
    const { projectPath } = props;
    const { rpcClient } = useRpcContext();
    const [agents, setAgents] = useState<ProjectStructureArtifactResponse[] | undefined>(undefined);

    const fetchAgents = () => {
        rpcClient
            .getBIDiagramRpcClient()
            .getProjectStructure()
            .then((res) => {
                const project = res.projects.find((p) => p.projectPath === projectPath) ?? res.projects[0];
                setAgents(project?.directoryMap?.agents ?? []);
            });
    };

    useEffect(() => {
        fetchAgents();
    }, [projectPath]);

    // Refresh when an agent is added / deleted elsewhere.
    useEffect(() => {
        if (!rpcClient) return;
        const unsubscribe = rpcClient.onProjectContentUpdated((state: boolean) => {
            if (state) {
                fetchAgents();
            }
        });
        return unsubscribe;
    }, [rpcClient]);

    const handleNewAgent = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.AddAgent,
                projectPath,
            },
        });
    };

    const handleOpenAgent = (agent: ProjectStructureArtifactResponse) => {
        // Pass only documentUri + position and let the extension's getView classify the
        // artifact (ai:Agent -> focus diagram). Setting `view` explicitly drops the focus
        // view on the post-open VIEW_UPDATE recompute.
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                documentUri: agent.path,
                position: agent.position,
            },
        });
    };

    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar
                title="Agents"
                subtitle="View and manage agents in this integration"
                actions={
                    <Button appearance="primary" onClick={handleNewAgent} tooltip="Add New Agent">
                        <Codicon name="add" sx={{ marginRight: 5 }} /> New Agent
                    </Button>
                }
            />
            <ViewContent>
                {!agents ? (
                    <SpinnerContainer>
                        <ProgressRing color={ThemeColors.PRIMARY} />
                    </SpinnerContainer>
                ) : agents.length === 0 ? (
                    <EmptyState>
                        <Icon name="bi-ai-agent" sx={{ width: 32, height: 32 }} iconSx={{ fontSize: "32px" }} />
                        <div>No agents in this integration yet.</div>
                        <Button appearance="primary" onClick={handleNewAgent}>
                            <Codicon name="add" sx={{ marginRight: 5 }} /> New Agent
                        </Button>
                    </EmptyState>
                ) : (
                    <Container>
                        <CardGrid>
                            {agents.map((agent) => (
                                <ButtonCard
                                    key={agent.id ?? agent.name}
                                    title={agent.name}
                                    description="AI Agent"
                                    icon={<Icon name="bi-ai-agent" />}
                                    onClick={() => handleOpenAgent(agent)}
                                />
                            ))}
                        </CardGrid>
                    </Container>
                )}
            </ViewContent>
        </View>
    );
}

export default AgentsOverview;
