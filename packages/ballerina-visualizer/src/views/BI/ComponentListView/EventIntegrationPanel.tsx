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
import React, { useEffect, useState } from 'react';
import { Icon } from '@wso2/ui-toolkit';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { DIRECTORY_MAP, EVENT_TYPE, MACHINE_VIEW, TriggerModelsResponse, ServiceModel, SCOPE } from '@wso2/ballerina-core';

import { CardGrid, PanelViewMore, Title, TitleWrapper } from './styles';
import { BodyText } from '../../styles';
import ButtonCard from '../../../components/ButtonCard';
import { isBetaModule, OutOfScopeComponentTooltip } from './componentListUtils';
import { RelativeLoader } from '../../../components/RelativeLoader';

interface EventIntegrationPanelProps {
    scope: SCOPE;
    triggers: TriggerModelsResponse;
};

const CHAT_APPS_MODULES = ["telegram", "whatsapp.business", "googleapis.chat"];

export function EventIntegrationPanel(props: EventIntegrationPanelProps) {
    const { rpcClient } = useRpcContext();
    const isDisabled = props.scope && (props.scope !== SCOPE.EVENT_INTEGRATION && props.scope !== SCOPE.ANY);

    const handleClick = async (key: DIRECTORY_MAP, model: ServiceModel) => {
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIServiceWizard,
                artifactInfo: {
                    org: model.orgName,
                    packageName: model.packageName,
                    moduleName: model.moduleName,
                    version: model.version
                }
            },
        });
    };

    return (
        <PanelViewMore disabled={isDisabled}>
            <TitleWrapper>
                <Title variant="h2">Event Integration</Title>
                <BodyText>
                    Create an integration that can be triggered by an event.
                </BodyText>
            </TitleWrapper>
            <CardGrid>
                {props.triggers.local.length === 0 && <RelativeLoader />}
                {
                    props.triggers.local
                        .filter((t) => t.type === "event" && !CHAT_APPS_MODULES.includes(t.moduleName))
                        .map((item, index) => {
                            return (
                                <ButtonCard
                                    id={`trigger-${item.moduleName.replace(/\./g, '-')}`}
                                    key={item.id}
                                    title={item.name}
                                    icon={getEntryNodeIcon(item)}
                                    onClick={() => {
                                        handleClick(DIRECTORY_MAP.SERVICE, item);
                                    }}
                                    disabled={isDisabled}
                                    tooltip={isDisabled ? OutOfScopeComponentTooltip : ""}
                                    isBeta={isBetaModule(item.moduleName)}
                                />
                            );
                        }
                        )
                }
            </CardGrid>
        </PanelViewMore>
    );
};

// TODO: This should be removed once the new icons are added to the BE API.
export function getEntryNodeIcon(item: ServiceModel) {
    return getCustomEntryNodeIcon(item.moduleName) || <img src={item.icon} alt={item.name} style={{ width: "38px" }} />;
}

// INFO: This is a temporary function to get the custom icon for the entry points.
// TODO: This should be removed once the new icons are added to the BE API.
export function getCustomEntryNodeIcon(type: string) {
    switch (type) {
        case "tcp":
            return <Icon name="bi-tcp" />;
        case "kafka":
            return <Icon name="bi-kafka" />;
        case "rabbitmq":
            return <Icon name="bi-rabbitmq" sx={{ color: "#f60" }} />;
        case "nats":
            return <Icon name="bi-nats" />;
        case "mqtt":
            return <Icon name="bi-mqtt" sx={{ color: "#606" }} />;
        case "grpc":
            return <Icon name="bi-grpc" />;
        case "graphql":
            return <Icon name="bi-graphql" sx={{ color: "#e535ab" }} />;
        case "java.jms":
            return <Icon name="bi-java" />;
        case "trigger.github":
            return <Icon name="bi-github" />;
        case "mcp":
            return <Icon name="bi-mcp" />;
        case "solace":
            return <Icon name="bi-solace" sx={{ color: "#00C895" }}/>;
        case "mssql":
            return <Icon name="bi-mssql" sx={{ color: "#b61d1c" }}/>;
        case "postgresql":
            return <Icon name="bi-postgresql" sx={{ color: "#336791" }}/>;
        case "trigger.shopify":
            return <Icon name="bi-shopify" sx={{ color: "#95BF47" }} />;
        case "trigger.hubspot":
            return <Icon name="bi-hubspot" sx={{ color: "#FF7A59" }} />;
        default:
            return null;
    }
}
