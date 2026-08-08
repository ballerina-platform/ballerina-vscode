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
import React, { useEffect, useMemo, useState } from 'react';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { AgentTriggerKind, EVENT_TYPE, MACHINE_VIEW, ServiceModel, TriggerModelsResponse } from '@wso2/ballerina-core';
import { View, ViewContent } from '@wso2/ui-toolkit';

import { TopNavigationBar } from '../../../components/TopNavigationBar';
import { TitleBar } from '../../../components/TitleBar';
import { useVisualizerContext } from '../../../Context';
import { AddPanel, CardGrid, Container, PanelViewMore, Title, TitleWrapper } from '../ComponentListView/styles';
import { BodyText } from '../../styles';
import ButtonCard from '../../../components/ButtonCard';
import { RelativeLoader } from '../../../components/RelativeLoader';
import { getEntryNodeIcon } from '../ComponentListView/EventIntegrationPanel';

export interface AddAgentTriggerViewProps {
    agentName: string;
    agentOrgName?: string;
    projectPath?: string;
}

const SECTIONS: { kind: AgentTriggerKind; title: string; description: string }[] = [
    {
        kind: "CHAT",
        title: "Chat Channels",
        description: "Incoming messages are passed to the agent and its reply is sent back.",
    },
    {
        kind: "EVENT",
        title: "Event Sources",
        description: "The agent runs when something happens in another system. "
            + "You describe what it should do, and decide what its answer is for.",
    },
];

export function AddAgentTriggerView(props: AddAgentTriggerViewProps) {
    const { agentName, agentOrgName, projectPath } = props;
    const { rpcClient } = useRpcContext();
    const { cacheTriggers, setCacheTriggers } = useVisualizerContext();
    const [triggers, setTriggers] = useState<TriggerModelsResponse>(cacheTriggers);
    const [isLoading, setIsLoading] = useState(cacheTriggers.local.length === 0);

    useEffect(() => {
        if (cacheTriggers.local.length > 0) {
            setTriggers(cacheTriggers);
            setIsLoading(false);
            return;
        }
        let cancelled = false;
        rpcClient
            .getServiceDesignerRpcClient()
            .getTriggerModels({ query: "" })
            .then((model) => {
                if (cancelled) {
                    return;
                }
                setTriggers(model);
                setCacheTriggers(model);
            })
            .catch((error: unknown) => console.error(">>> Error fetching trigger models", error))
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [rpcClient]);

    const sections = useMemo(
        () => SECTIONS
            .map((section) => ({
                ...section,
                channels: (triggers.local ?? [])
                    .filter((trigger) => trigger.agentTriggerKind === section.kind)
                    .sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .filter((section) => section.channels.length > 0),
        [triggers]
    );

    const handleClick = async (channel: ServiceModel) => {
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIServiceWizard,
                artifactInfo: {
                    org: channel.orgName,
                    packageName: channel.packageName,
                    moduleName: channel.moduleName,
                    version: channel.version,
                    agentName,
                    agentOrgName,
                },
            },
        });
    };

    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar
                title="Add Trigger"
                subtitle={`Connect ${agentName} to a channel that will call it`}
            />
            <ViewContent padding>
                <Container>
                    <AddPanel>
                        {isLoading && <RelativeLoader />}
                        {!isLoading && sections.length === 0 && (
                            <BodyText>No channels are available in this project.</BodyText>
                        )}
                        {sections.map((section) => (
                            <PanelViewMore key={section.kind}>
                                <TitleWrapper>
                                    <Title variant="h2">{section.title}</Title>
                                    <BodyText>{section.description}</BodyText>
                                </TitleWrapper>
                                <CardGrid>
                                    {section.channels.map((channel) => (
                                        <ButtonCard
                                            id={`agent-trigger-${channel.moduleName.replace(/\./g, '-')}`}
                                            key={channel.id}
                                            title={channel.name}
                                            icon={getEntryNodeIcon(channel)}
                                            onClick={() => handleClick(channel)}
                                        />
                                    ))}
                                </CardGrid>
                            </PanelViewMore>
                        ))}
                    </AddPanel>
                </Container>
            </ViewContent>
        </View>
    );
}

export default AddAgentTriggerView;
