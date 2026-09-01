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
import React, { useMemo } from 'react';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { EVENT_TYPE, MACHINE_VIEW, SCOPE, ServiceModel, TriggerModelsResponse } from '@wso2/ballerina-core';

import { CardGrid, PanelViewMore, Title, TitleWrapper } from './styles';
import { BodyText } from '../../styles';
import ButtonCard from '../../../components/ButtonCard';
import { ARTIFACT_CATEGORY_META } from '../components/artifactCards';
import { cardMatchesSearch, OutOfScopeComponentTooltip } from './componentListUtils';
import { RelativeLoader } from '../../../components/RelativeLoader';
import { ArtifactIcon } from '../../../components/ArtifactIcon';
import { effectiveTriggerKind } from './triggerKind';

interface FileIntegrationPanelProps {
    scope: SCOPE;
    triggers: TriggerModelsResponse;
    /** True only while the trigger models are still being fetched. */
    isLoadingTriggers?: boolean;
    /** Page-level gallery search; when set, only matching cards show. */
    searchQuery?: string;
};

const CATEGORY = ARTIFACT_CATEGORY_META["file-integration"];

export function FileIntegrationPanel(props: FileIntegrationPanelProps) {
    const { rpcClient } = useRpcContext();

    const isDisabled = props.scope && (props.scope !== SCOPE.FILE_INTEGRATION && props.scope !== SCOPE.ANY);
    const q = props.searchQuery;
    const matched = useMemo(
        () => props.triggers.local.filter((t) => effectiveTriggerKind(t) === "file" && cardMatchesSearch(t.name, q)),
        [props.triggers, q]
    );

    const handleOnSelect = async (model: ServiceModel) => {
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

    // While searching, hide the whole panel when no file trigger matches.
    if (q?.trim() && matched.length === 0) {
        return null;
    }

    return (
        <PanelViewMore disabled={isDisabled}>
            <TitleWrapper>
                <Title variant="h2">{CATEGORY.title}</Title>
                <BodyText>{CATEGORY.description}</BodyText>
            </TitleWrapper>
            <CardGrid>
                {!q?.trim() && props.isLoadingTriggers && matched.length === 0 && <RelativeLoader />}
                {matched
                    .map((item, index) => {
                        return (
                            <ButtonCard
                                id={`trigger-${item.moduleName}`}
                                key={item.id}
                                title={item.name}
                                icon={getFileIntegrationIcon(item)}
                                onClick={() => {
                                    handleOnSelect(item);
                                }}
                                disabled={isDisabled}
                                tooltip={isDisabled ? OutOfScopeComponentTooltip : ""}
                            />
                        );
                    })}
            </CardGrid>
        </PanelViewMore>
    );
};

export function getFileIntegrationIcon(item: ServiceModel) {
    return <ArtifactIcon icon={item.icon} kind={effectiveTriggerKind(item)} />;
}
