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
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { EVENT_TYPE, MACHINE_VIEW, SCOPE } from '@wso2/ballerina-core';

import { CardGrid, PanelViewMore, Title, TitleWrapper } from './styles';
import { BodyText } from '../../styles';
import ButtonCard from '../../../components/ButtonCard';
import { ARTIFACT_CATEGORY_META, ArtifactCard, INTEGRATION_API_CARDS } from '../components/artifactCards';
import { cardMatchesSearch, OutOfScopeComponentTooltip } from './componentListUtils';

interface IntegrationAPIPanelProps {
    scope: SCOPE;
    /** Page-level gallery search; when set, only matching cards show. */
    searchQuery?: string;
};

const CATEGORY = ARTIFACT_CATEGORY_META["integration-as-api"];

export function IntegrationAPIPanel(props: IntegrationAPIPanelProps) {
    const { rpcClient } = useRpcContext();
    const isDisabled = props.scope && (props.scope !== SCOPE.INTEGRATION_AS_API && props.scope !== SCOPE.ANY);

    const handleClick = async (card: ArtifactCard) => {
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIServiceWizard,
                artifactInfo: card.artifactInfo,
            },
        });
    };

    const cards = INTEGRATION_API_CARDS.filter((card) => cardMatchesSearch(card.displayName, props.searchQuery));
    if (cards.length === 0) {
        return null;
    }

    return (
        <PanelViewMore disabled={isDisabled}>
            <TitleWrapper>
                <Title variant="h2">{CATEGORY.title}</Title>
                <BodyText>{CATEGORY.description}</BodyText>
            </TitleWrapper>
            <CardGrid>
                {cards.map((card) => (
                    <ButtonCard
                        id={card.id}
                        key={card.id}
                        icon={card.icon}
                        title={card.displayName}
                        onClick={() => handleClick(card)}
                        disabled={isDisabled}
                        tooltip={isDisabled ? OutOfScopeComponentTooltip : ""}
                        isBeta={card.isBeta}
                    />
                ))}
            </CardGrid>
        </PanelViewMore>
    );
};
