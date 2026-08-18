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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { ServiceModel } from '@wso2/ballerina-core';
import debounce from 'lodash.debounce';

const SEARCH_DEBOUNCE_MS = 700;

export interface CentralTriggerSearch {
    enabled: boolean;
    searching: boolean;
    results: ServiceModel[];
    localRepositoryResults: ServiceModel[];
}

export function useCentralTriggerSearch(query: string): CentralTriggerSearch {
    const { rpcClient } = useRpcContext();
    const [searching, setSearching] = useState<boolean>(true);
    const [results, setResults] = useState<ServiceModel[]>([]);
    const [localRepositoryResults, setLocalRepositoryResults] = useState<ServiceModel[]>([]);
    const [enabled, setEnabled] = useState<boolean>(false);

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
            .then((isEnabled) => {
                if (isMountedRef.current) {
                    setEnabled(isEnabled);
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
                    .searchTriggers({ query: searchQuery, includeLocalRepository: enabled })
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
        [rpcClient, enabled]
    );

    useEffect(() => {
        if (!enabled) {
            return;
        }
        runSearch(query);
        return () => runSearch.cancel();
    }, [query, runSearch, enabled]);

    return { enabled, searching, results, localRepositoryResults };
}
