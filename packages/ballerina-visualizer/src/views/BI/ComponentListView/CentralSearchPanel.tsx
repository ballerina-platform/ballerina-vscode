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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { EVENT_TYPE, MACHINE_VIEW, ServiceModel, TriggerModelsResponse } from '@wso2/ballerina-core';
import debounce from 'lodash.debounce';

import { CardGrid, PanelViewMore, Title, TitleWrapper } from './styles';
import { BodyText } from '../../styles';
import ButtonCard from '../../../components/ButtonCard';
import { isBetaModule } from './componentListUtils';
import { RelativeLoader } from '../../../components/RelativeLoader';
import { getEntryNodeIcon } from './EventIntegrationPanel';

interface CentralSearchPanelProps {
    /** The page-level search query; the panel is expected to be rendered only when non-empty. */
    query: string;
    /** Locally available triggers, used to hide Central results already installed. */
    triggers: TriggerModelsResponse;
}

const SEARCH_DEBOUNCE_MS = 700;

/**
 * "More on Ballerina Central" — the remote half of the artifact gallery's page-level search.
 * Central packages are not tied to one gallery section (a result may be an event, file, or other
 * integration), so they surface in this dedicated section rather than inside a category. Connectors
 * that ship their trigger models are addable from here with no language-server release.
 */
export function CentralSearchPanel(props: CentralSearchPanelProps) {
    const { rpcClient } = useRpcContext();
    const [searching, setSearching] = useState<boolean>(true);
    const [results, setResults] = useState<ServiceModel[]>([]);
    const [localRepositoryResults, setLocalRepositoryResults] = useState<ServiceModel[]>([]);
    const [additionalTriggerSearchEnabled, setAdditionalTriggerSearchEnabled] = useState<boolean>(false);

    const isMountedRef = useRef(true);
    // The most recently *dispatched* search query. Debounce only coalesces rapid keystrokes into
    // one call per pause — it does nothing once two calls are genuinely in flight together (e.g. a
    // slow response for an older query outlasting a newer one). Comparing against this before
    // applying a response is what stops a stale result from overwriting a fresher one purely
    // because of network timing.
    const latestQueryRef = useRef<string>("");

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        rpcClient
            .getCommonRpcClient()
            .additionalTriggerSearchEnabled()
            .then((enabled) => {
                if (isMountedRef.current) {
                    setAdditionalTriggerSearchEnabled(enabled);
                }
            });
    }, [rpcClient]);

    // Debounced so we don't hit Central on every keystroke.
    const runSearch = useMemo(
        () =>
            debounce((searchQuery: string) => {
                latestQueryRef.current = searchQuery;
                setSearching(true);
                rpcClient
                    .getServiceDesignerRpcClient()
                    .searchTriggers({ query: searchQuery, includeLocalRepository: additionalTriggerSearchEnabled })
                    .then((res) => {
                        if (!isMountedRef.current || latestQueryRef.current !== searchQuery) {
                            return;
                        }
                        setResults(res?.local ?? []);
                        setLocalRepositoryResults(res?.localRepositoryResults ?? []);
                    })
                    .finally(() => {
                        if (isMountedRef.current && latestQueryRef.current === searchQuery) {
                            setSearching(false);
                        }
                    });
            }, SEARCH_DEBOUNCE_MS),
        [rpcClient, additionalTriggerSearchEnabled]
    );

    useEffect(() => {
        if (!additionalTriggerSearchEnabled) {
            return;
        }
        runSearch(props.query);
        return () => runSearch.cancel();
    }, [props.query, runSearch, additionalTriggerSearchEnabled]);

    if (!additionalTriggerSearchEnabled) {
        return null;
    }

    const handleSelect = async (model: ServiceModel, isLocalRepository: boolean) => {
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIServiceWizard,
                artifactInfo: {
                    org: model.orgName,
                    packageName: model.packageName,
                    moduleName: model.moduleName,
                    version: model.version,
                    isLocalRepository
                }
            },
        });
    };

    // Central may echo a package already available locally; the local sections already show those.
    const localTriggerIds = new Set(props.triggers.local.map((t) => `${t.orgName}/${t.packageName}`));
    const visibleResults = results.filter((item) => !localTriggerIds.has(`${item.orgName}/${item.packageName}`));

    return (
        <>
            <PanelViewMore>
                <TitleWrapper>
                    <Title variant="h2">More on Ballerina Central</Title>
                    <BodyText>
                        Integrations published on Ballerina Central that match your search.
                    </BodyText>
                </TitleWrapper>
                <CardGrid>
                    {searching && <RelativeLoader />}
                    {!searching && visibleResults.length === 0 && (
                        <BodyText>No matching integrations found on Ballerina Central.</BodyText>
                    )}
                    {!searching &&
                        visibleResults.map((item) => (
                            <ButtonCard
                                id={`central-trigger-${item.moduleName.replace(/\./g, '-')}`}
                                key={`${item.orgName}/${item.packageName}`}
                                title={item.name}
                                icon={getEntryNodeIcon(item)}
                                onClick={() => handleSelect(item, false)}
                                isBeta={isBetaModule(item.moduleName)}
                            />
                        ))}
                </CardGrid>
            </PanelViewMore>
            {!searching && localRepositoryResults.length > 0 && (
                <PanelViewMore>
                    <TitleWrapper>
                        <Title variant="h2">Local Central Search Results</Title>
                        <BodyText>
                            Packages found in your local Ballerina repository (~/.ballerina/repositories/local)
                            that match your search.
                        </BodyText>
                    </TitleWrapper>
                    <CardGrid>
                        {localRepositoryResults.map((item) => (
                            <ButtonCard
                                id={`local-repo-trigger-${item.moduleName.replace(/\./g, '-')}`}
                                key={`local/${item.orgName}/${item.packageName}`}
                                title={item.name}
                                icon={getEntryNodeIcon(item)}
                                onClick={() => handleSelect(item, true)}
                                isBeta={isBetaModule(item.moduleName)}
                            />
                        ))}
                    </CardGrid>
                </PanelViewMore>
            )}
        </>
    );
}

export default CentralSearchPanel;
