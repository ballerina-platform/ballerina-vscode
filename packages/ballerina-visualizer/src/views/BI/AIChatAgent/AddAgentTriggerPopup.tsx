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
import { AgentTriggerKind, ServiceModel, TriggerModelsResponse, deriveBasePath } from '@wso2/ballerina-core';
import { Codicon, Icon, SearchBox } from '@wso2/ui-toolkit';

import { useVisualizerContext } from '../../../Context';
import { CardGrid, PanelViewMore, Title, TitleWrapper } from '../ComponentListView/styles';
import { BodyText } from '../../styles';
import ButtonCard from '../../../components/ButtonCard';
import { RelativeLoader } from '../../../components/RelativeLoader';
import { getEntryNodeIcon } from '../ComponentListView/EventIntegrationPanel';
import { cardMatchesSearch, isBetaModule } from '../ComponentListView/componentListUtils';
import { CentralSearchPanel } from '../ComponentListView/CentralSearchPanel';
import {
    BackButton,
    CloseButton,
    HeaderTitleContainer,
    PopupContent,
    PopupHeader,
    PopupSubtitle,
    PopupTitle,
} from '../Connection/styles';
import { PopupModal, PopupModalStep, PopupModalStepDirection } from '../../../components/PopupModal';
import { ServiceCreationView } from '../ServiceDesigner/ServiceCreationView';
import { AgentEventChannel, AgentKind } from "@wso2/ballerina-core";

const subtitleFor = (agentName: string, channel: CentralChannel | null, agentEvent?: AgentEventChannel) => {
    if (agentEvent) {
        return channel
            ? `Configure the endpoint that will deliver ${agentEvent.name} data to a running ${agentName} instance`
            : `Deliver ${agentEvent.name} data to a ${agentName} instance that is already running.`;
    }
    return channel
        ? `Configure the trigger that will call ${agentName}`
        : `Connect ${agentName} to a channel that will call it`;
};

export interface AddAgentTriggerPopupProps {
    agentName: string;
    agentOrgName?: string;
    agentKind?: AgentKind;
    agentEvent?: AgentEventChannel;
    projectPath?: string;
    onClose: () => void;
}

const SECTIONS: { kind: AgentTriggerKind; title: string; description: string }[] = [
    {
        kind: "CHAT",
        title: "Chat Channels",
        description: "Incoming messages are passed to the agent and its reply is sent back.",
    },
    {
        kind: "HTTP",
        title: "API Endpoints",
        description: "Expose the agent at a URL. A caller sends a request and gets the agent's answer back.",
    },
    {
        kind: "EVENT",
        title: "Event Sources",
        description: "The agent runs when something happens in another system.",
    },
    {
        kind: "FILE",
        title: "File Source",
        description: "The agent runs when a file becomes available in a location.",
    },
];

// A data event is delivered over HTTP only for now. Chat channels are a conversation with the agent, so they are
// not offered; event and file sources stay listed, greyed out.
const EVENT_TRIGGER_SECTIONS: Partial<Record<AgentTriggerKind, { available: boolean; description: string }>> = {
    HTTP: {
        available: true,
        description: "Expose the channel at a URL. A caller sends data to a running instance and gets the channel's reply back.",
    },
    EVENT: { available: false, description: "Not available for a data event yet." },
    FILE: { available: false, description: "Not available for a data event yet." },
};

type CentralChannel = ServiceModel & { isLocalRepository?: boolean };

const PATH_SEEDED_MODULES = ["ai", "http"];
const FORM_STEP_MAX_WIDTH = 700;

const channelDefaults = (channel: ServiceModel, agentName: string) =>
    PATH_SEEDED_MODULES.includes(channel.moduleName) && agentName
        ? { basePath: deriveBasePath(agentName) }
        : undefined;

const channelIcon = (channel: ServiceModel) =>
    channel.moduleName === "ai"
        ? (
            <Icon
                name="comment-discussion"
                isCodicon
                sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}
                iconSx={{ fontSize: "24px", width: "24px", height: "24px" }}
            />
        )
        : getEntryNodeIcon(channel);

export function AddAgentTriggerPopup(props: AddAgentTriggerPopupProps) {
    const { agentName, agentOrgName, agentKind, agentEvent, projectPath, onClose } = props;
    const { rpcClient } = useRpcContext();
    const { cacheTriggers, setCacheTriggers } = useVisualizerContext();
    const [triggers, setTriggers] = useState<TriggerModelsResponse>(cacheTriggers);
    const [isLoading, setIsLoading] = useState(cacheTriggers.local.length === 0);
    const [channel, setChannel] = useState<CentralChannel>(null);
    const [direction, setDirection] = useState<PopupModalStepDirection>("forward");
    const [query, setQuery] = useState("");

    const showChannel = (next: CentralChannel, to: PopupModalStepDirection) => {
        setDirection(to);
        setChannel(next);
    };

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
                ...(agentEvent ? EVENT_TRIGGER_SECTIONS[section.kind] : { available: true }),
                channels: (triggers.local ?? [])
                    .filter((trigger) => trigger.agentTriggerKind === section.kind
                        && cardMatchesSearch(trigger.name, query, trigger.moduleName))
                    .sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .filter((section) => section.channels.length > 0 && (!agentEvent || section.kind in EVENT_TRIGGER_SECTIONS)),
        [triggers, query, agentEvent]
    );

    return (
        <PopupModal
            onClose={onClose}
            expanded
            maxWidth={channel ? FORM_STEP_MAX_WIDTH : undefined}
            dismissOnBackdropClick={!channel}
            dismissOnEscape={!channel}
        >
            {(close) => (
                <PopupModalStep key={channel ? channel.moduleName : "picker"} $direction={direction}>
                    <PopupHeader>
                        {channel && (
                            <BackButton appearance="icon" onClick={() => showChannel(null, "backward")}>
                                <Codicon name="chevron-left" />
                            </BackButton>
                        )}
                        <HeaderTitleContainer>
                            <PopupTitle variant="h2">{channel ? channel.name : "Add Trigger"}</PopupTitle>
                            <PopupSubtitle variant="body2">{subtitleFor(agentName, channel, agentEvent)}</PopupSubtitle>
                        </HeaderTitleContainer>
                        <CloseButton appearance="icon" onClick={close}>
                            <Codicon name="close" />
                        </CloseButton>
                    </PopupHeader>
                    <PopupContent>
                        {channel ? (
                            <ServiceCreationView
                                isPopup
                                onCreated={close}
                                projectPath={projectPath}
                                orgName={channel.orgName}
                                packageName={channel.packageName}
                                moduleName={channel.moduleName}
                                version={channel.version}
                                isLocalRepository={channel.isLocalRepository}
                                collectEndpointShape={channel.moduleName === "http"}
                                agentName={agentName}
                                agentOrgName={agentOrgName}
                                agentKind={agentKind}
                                agentEvent={agentEvent}
                                defaultValues={channelDefaults(channel, agentName)}
                            />
                        ) : (
                            <>
                                {isLoading && <RelativeLoader />}
                                {!isLoading && (
                                    <SearchBox
                                        value={query}
                                        placeholder="Search channels"
                                        iconPosition="end"
                                        onChange={setQuery}
                                        sx={{ width: "100%", marginBottom: "16px" }}
                                    />
                                )}
                                {!isLoading && sections.length === 0 && (
                                    <BodyText>
                                        {query.trim()
                                            ? `No installed channel matches "${query}".`
                                            : "No channels are available in this project."}
                                    </BodyText>
                                )}
                                <div style={{ gap: 28, display: "flex", flexDirection: "column" }}>
                                    {sections.map((section) => (
                                        <PanelViewMore key={section.kind} disabled={!section.available}>
                                            <TitleWrapper>
                                                <Title variant="h2">{section.title}</Title>
                                                <BodyText>{section.description}</BodyText>
                                            </TitleWrapper>
                                            <CardGrid>
                                                {section.channels.map((option) => (
                                                    <ButtonCard
                                                        id={`agent-trigger-${option.moduleName.replace(/\./g, '-')}`}
                                                        key={option.id}
                                                        title={option.name}
                                                        icon={channelIcon(option)}
                                                        isBeta={isBetaModule(option.moduleName)}
                                                        disabled={!section.available}
                                                        onClick={() => showChannel(option, "forward")}
                                                    />
                                                ))}
                                            </CardGrid>
                                        </PanelViewMore>
                                    ))}
                                </div>
                                {query.trim() && (
                                    <CentralSearchPanel
                                        query={query}
                                        triggers={triggers}
                                        onSelect={(model, isLocalRepository) =>
                                            showChannel({ ...model, isLocalRepository }, "forward")}
                                    />
                                )}
                            </>
                        )}
                    </PopupContent>
                </PopupModalStep>
            )}
        </PopupModal>
    );
}

export default AddAgentTriggerPopup;
