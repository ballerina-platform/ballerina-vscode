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
import { DIRECTORY_MAP, EVENT_TYPE, MACHINE_VIEW } from '@wso2/ballerina-core';

import { CardGrid, PanelViewMore, Title, TitleWrapper } from './styles';
import { BodyText } from '../../styles';
import ButtonCard from '../../../components/ButtonCard';
import { useVisualizerContext } from '../../../Context';

interface OtherArtifactsPanelProps {
    isNPSupported: boolean;
    isLibrary?: boolean;
}

export function OtherArtifactsPanel(props: OtherArtifactsPanelProps) {
    const { isNPSupported, isLibrary = false } = props;
    const { rpcClient } = useRpcContext();
    const { setPopupMessage } = useVisualizerContext();
    const [experimentalEnabled, setExperimentalEnabled] = useState(false);

    useEffect(() => {
        rpcClient.getCommonRpcClient().experimentalEnabled().then(setExperimentalEnabled);
    }, [rpcClient]);

    const showNaturalFunctions = isNPSupported && experimentalEnabled;

    const panelTitle = isLibrary ? "Library Artifacts" : "Other Artifacts";
    const panelDescription = isLibrary
        ? "Create reusable artifacts for your library."
        : "Create supportive artifacts for your integration.";

    const handleClick = async (key: DIRECTORY_MAP) => {
        if (key === DIRECTORY_MAP.CONNECTION) {
            await rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.AddConnectionWizard,
                },
                isPopup: true,
            });
        } else if (key === DIRECTORY_MAP.AGENT) {
            await rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.AddAgent,
                },
                isPopup: true,
            });
        } else if (key === DIRECTORY_MAP.DATA_MAPPER) {
            await rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.BIDataMapperForm,
                },
            });
        } else if (key === DIRECTORY_MAP.TYPE) {
            await rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.TypeDiagram,
                    addType: true
                },
            });
        } else if (key === DIRECTORY_MAP.CONFIGURABLE) {
            await rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.AddConfigVariables,
                },
            });
        } else if (key === DIRECTORY_MAP.FUNCTION) {
            await rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.BIFunctionForm,
                },
            });
        } else if (key === DIRECTORY_MAP.NP_FUNCTION) {
            await rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.BINPFunctionForm,
                },
            });
        } else {
            setPopupMessage(true);
        }
    };

    return (
        <PanelViewMore>
            <TitleWrapper>
                <Title variant="h2">{panelTitle}</Title>
                <BodyText>
                    {panelDescription}
                </BodyText>
            </TitleWrapper>
            <CardGrid>
                <ButtonCard
                    id="bi-function"
                    data-testid="function"
                    icon={<Icon name="bi-function" />}
                    title="Function"
                    onClick={() => handleClick(DIRECTORY_MAP.FUNCTION)}
                />
                {showNaturalFunctions &&
                    <ButtonCard
                        id="bi-ai-function"
                        icon={<Icon name="bi-ai-function" />}
                        title="Natural Function"
                        onClick={() => handleClick(DIRECTORY_MAP.NP_FUNCTION)}
                        isBeta
                    />
                }
                <ButtonCard
                    id="data-mapper"
                    icon={<Icon name="dataMapper" />}
                    title="Data Mapper"
                    onClick={() => handleClick(DIRECTORY_MAP.DATA_MAPPER)}
                />
                <ButtonCard
                    id="type"
                    icon={<Icon name="bi-type" />}
                    title="Type"
                    onClick={() => handleClick(DIRECTORY_MAP.TYPE)}
                />
                <ButtonCard
                    id="connection"
                    icon={<Icon name="bi-connection" />}
                    title="Connection"
                    onClick={() => handleClick(DIRECTORY_MAP.CONNECTION)}
                />
                {isLibrary &&
                    <ButtonCard
                        id="agent"
                        icon={<Icon name="bi-ai-agent" />}
                        title="Agent"
                        onClick={() => handleClick(DIRECTORY_MAP.AGENT)}
                    />
                }
                <ButtonCard
                    id="configurable"
                    icon={<Icon name="bi-config" />}
                    title="Configuration"
                    onClick={() => handleClick(DIRECTORY_MAP.CONFIGURABLE)}
                />
            </CardGrid>
        </PanelViewMore>
    );
};
