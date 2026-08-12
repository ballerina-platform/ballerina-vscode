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
import styled from '@emotion/styled';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { AgentTriggerKind, ServiceModel, TriggerModelsResponse, deriveBasePath } from '@wso2/ballerina-core';
import { Codicon, Icon, SearchBox, ThemeColors } from '@wso2/ui-toolkit';

import { useVisualizerContext } from '../../../Context';
import { CardGrid, ClearSearchButton, EmptyState, PanelViewMore, Title, TitleWrapper } from '../ComponentListView/styles';
import { cardMatchesSearch } from '../ComponentListView/componentListUtils';
import { BodyText } from '../../styles';
import ButtonCard from '../../../components/ButtonCard';
import { RelativeLoader } from '../../../components/RelativeLoader';
import { getEntryNodeIcon } from '../ComponentListView/EventIntegrationPanel';
import { getFileIntegrationIcon } from '../ComponentListView/FileIntegrationPanel';
import { INTEGRATION_API_CARDS } from '../components/artifactCards';
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

const SectionList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 28px;
`;

const SectionHeading = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const ComingSoonBadge = styled.span`
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 11px;
    font-weight: 500;
`;

const ComingSoonGrid = styled(CardGrid)`
    opacity: 0.6;
    pointer-events: none;
`;

export interface AddAgentTriggerPopupProps {
    agentName: string;
    agentOrgName?: string;
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
        kind: "EVENT",
        title: "Event Sources",
        description: "The agent runs when something happens in another system. "
            + "You describe what it should do, and decide what its answer is for.",
    },
];

const COMING_SOON_SECTIONS: { key: string; title: string; description: string }[] = [
    {
        key: "api",
        title: "APIs",
        description: "Reach the agent over an API endpoint.",
    },
    {
        key: "file",
        title: "File Sources",
        description: "The agent runs when a file lands in a watched location.",
    },
];

const channelDefaults = (channel: ServiceModel, agentName: string) =>
    channel.moduleName === "ai" && agentName ? { basePath: deriveBasePath(agentName) } : undefined;

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
    const { agentName, agentOrgName, projectPath, onClose } = props;
    const { rpcClient } = useRpcContext();
    const { cacheTriggers, setCacheTriggers } = useVisualizerContext();
    const [triggers, setTriggers] = useState<TriggerModelsResponse>(cacheTriggers);
    const [isLoading, setIsLoading] = useState(cacheTriggers.local.length === 0);
    const [channel, setChannel] = useState<ServiceModel>(null);
    const [direction, setDirection] = useState<PopupModalStepDirection>("forward");
    const [searchQuery, setSearchQuery] = useState("");

    const showChannel = (next: ServiceModel, to: PopupModalStepDirection) => {
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
                channels: (triggers.local ?? [])
                    .filter((trigger) => trigger.agentTriggerKind === section.kind
                        && cardMatchesSearch(trigger.name, searchQuery, trigger.moduleName))
                    .sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .filter((section) => section.channels.length > 0),
        [triggers, searchQuery]
    );

    const comingSoon = useMemo(
        () => {
            const cards: Record<string, { id: string; name: string; icon: React.ReactNode }[]> = {
                api: INTEGRATION_API_CARDS.map((card) => ({
                    id: card.id,
                    name: card.displayName,
                    icon: card.icon,
                })),
                file: (triggers.local ?? [])
                    .filter((trigger) => trigger.type === "file")
                    .map((trigger) => ({
                        id: trigger.moduleName,
                        name: trigger.name,
                        icon: getFileIntegrationIcon(trigger),
                    })),
            };
            return COMING_SOON_SECTIONS
                .map((section) => ({
                    ...section,
                    cards: (cards[section.key] ?? []).filter((card) => cardMatchesSearch(card.name, searchQuery)),
                }))
                .filter((section) => section.cards.length > 0);
        },
        [triggers, searchQuery]
    );

    return (
        <PopupModal onClose={onClose} expanded dismissOnBackdropClick={!channel} dismissOnEscape={!channel}>
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
                            <PopupSubtitle variant="body2">
                                {channel
                                    ? `Configure the trigger that will call ${agentName}`
                                    : `Connect ${agentName} to a channel that will call it`}
                            </PopupSubtitle>
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
                                agentName={agentName}
                                agentOrgName={agentOrgName}
                                defaultValues={channelDefaults(channel, agentName)}
                            />
                        ) : (
                            <>
                                {!isLoading && (
                                    <SearchBox
                                        value={searchQuery}
                                        placeholder="Search triggers"
                                        iconPosition="start"
                                        autoFocus
                                        onChange={setSearchQuery}
                                        sx={{ width: "100%" }}
                                    />
                                )}
                                {isLoading && <RelativeLoader />}
                                {!isLoading && sections.length === 0 && comingSoon.length === 0 && !searchQuery.trim() && (
                                    <BodyText>No channels are available in this project.</BodyText>
                                )}
                                {!isLoading && sections.length === 0 && comingSoon.length === 0 && searchQuery.trim() && (
                                    <EmptyState>
                                        <span>No channels match &ldquo;{searchQuery.trim()}&rdquo;.</span>
                                        <ClearSearchButton onClick={() => setSearchQuery("")}>Clear search</ClearSearchButton>
                                    </EmptyState>
                                )}
                                <SectionList>
                                    {sections.map((section) => (
                                        <PanelViewMore key={section.kind}>
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
                                                        onClick={() => showChannel(option, "forward")}
                                                    />
                                                ))}
                                            </CardGrid>
                                        </PanelViewMore>
                                    ))}
                                    {!isLoading && comingSoon.map((section) => (
                                        <PanelViewMore key={section.key}>
                                            <TitleWrapper>
                                                <SectionHeading>
                                                    <Title variant="h2">{section.title}</Title>
                                                    <ComingSoonBadge>Coming soon</ComingSoonBadge>
                                                </SectionHeading>
                                                <BodyText>{section.description}</BodyText>
                                            </TitleWrapper>
                                            <ComingSoonGrid>
                                                {section.cards.map((card) => (
                                                    <ButtonCard
                                                        key={card.id}
                                                        title={card.name}
                                                        icon={card.icon}
                                                        onClick={() => undefined}
                                                        disabled
                                                    />
                                                ))}
                                            </ComingSoonGrid>
                                        </PanelViewMore>
                                    ))}
                                </SectionList>
                            </>
                        )}
                    </PopupContent>
                </PopupModalStep>
            )}
        </PopupModal>
    );
}

export default AddAgentTriggerPopup;
