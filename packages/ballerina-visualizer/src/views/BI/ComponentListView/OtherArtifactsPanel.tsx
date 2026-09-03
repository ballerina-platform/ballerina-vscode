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
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { DIRECTORY_MAP, EVENT_TYPE, MACHINE_VIEW } from '@wso2/ballerina-core';

import { CardGrid, PanelViewMore, Title, TitleWrapper } from './styles';
import { BodyText } from '../../styles';
import ButtonCard from '../../../components/ButtonCard';
import { useVisualizerContext } from '../../../Context';
import { OTHER_ARTIFACT_CARDS } from '../components/artifactCards';
import { cardMatchesSearch } from './componentListUtils';

interface OtherArtifactsPanelProps {
    isNPSupported: boolean;
    isLibrary?: boolean;
    /** Page-level gallery search; when set, only matching cards show. */
    searchQuery?: string;
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
        } else if (key === DIRECTORY_MAP.AGENT_DEFINITION) {
            await rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.AddAgentDefinition,
                },
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

    const q = props.searchQuery;
    const cards = OTHER_ARTIFACT_CARDS.filter(
        (card) =>
            (showNaturalFunctions || !card.requiresNaturalFunctions) &&
            (isLibrary || !card.requiresLibrary) &&
            cardMatchesSearch(card.displayName, q)
    );
    if (cards.length === 0) {
        return null;
    }

    return (
        <PanelViewMore>
            <TitleWrapper>
                <Title variant="h2">{panelTitle}</Title>
                <BodyText>
                    {panelDescription}
                </BodyText>
            </TitleWrapper>
            <CardGrid>
                {cards.map((card) => (
                    <ButtonCard
                        id={card.id}
                        key={card.id}
                        icon={card.icon}
                        title={card.displayName}
                        onClick={() => handleClick(card.directoryKey)}
                        isBeta={card.isBeta}
                    />
                ))}
            </CardGrid>
        </PanelViewMore>
    );
};
