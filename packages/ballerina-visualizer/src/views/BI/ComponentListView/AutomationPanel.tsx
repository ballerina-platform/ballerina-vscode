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
import { DIRECTORY_MAP, EVENT_TYPE, isSamePath, MACHINE_VIEW, SCOPE } from '@wso2/ballerina-core';

import { CardGrid, PanelViewMore, Title, TitleWrapper } from './styles';
import { BodyText } from '../../styles';
import ButtonCard from '../../../components/ButtonCard';
import { ARTIFACT_CATEGORY_META, AUTOMATION_CARD } from '../components/artifactCards';
import { AutomationAlreadyExistsTooltip, cardMatchesSearch, OutOfScopeComponentTooltip } from './componentListUtils';

interface AutomationPanelProps {
    scope: SCOPE;
    /** Page-level gallery search; when set, only matching cards show. */
    searchQuery?: string;
};

const CATEGORY = ARTIFACT_CATEGORY_META.automation;

export function AutomationPanel(props: AutomationPanelProps) {
    const [automationExists, setAutomationExists] = useState(false);
    const { rpcClient } = useRpcContext();

    useEffect(() => {
        rpcClient.getVisualizerLocation().then((location) => {
            const projectPath = location.projectPath;
            rpcClient.getBIDiagramRpcClient().getProjectStructure().then((res) => {
                const project = res.projects.find(project => isSamePath(project.projectPath, projectPath));
                setAutomationExists(project?.directoryMap[DIRECTORY_MAP.AUTOMATION].length > 0);
            });
        });
    }, []);

    const outOfScope = props.scope && (props.scope !== SCOPE.AUTOMATION && props.scope !== SCOPE.ANY);
    const isDisabled = outOfScope || automationExists;

    const tooltip = outOfScope
        ? OutOfScopeComponentTooltip
        : automationExists
            ? AutomationAlreadyExistsTooltip
            : "";

    const handleClick = async () => {
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIMainFunctionForm,
            },
        });
    };

    if (!cardMatchesSearch(AUTOMATION_CARD.displayName, props.searchQuery)) {
        return null;
    }

    return (
        <PanelViewMore disabled={isDisabled}>
            <TitleWrapper>
                <Title variant="h2">{CATEGORY.title}</Title>
                <BodyText>{CATEGORY.description}</BodyText>
            </TitleWrapper>
            <CardGrid>
                <ButtonCard
                    id={AUTOMATION_CARD.id}
                    icon={AUTOMATION_CARD.icon}
                    title={AUTOMATION_CARD.displayName}
                    onClick={handleClick}
                    disabled={isDisabled}
                    tooltip={tooltip}
                />
            </CardGrid>
        </PanelViewMore>
    );
};
