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

import { QueryClient, DehydratedState, Query, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useVisualizerContext } from "../context/WsClientContext";
import React, { useState } from "react";

// These queries reflect live extension state and must never be restored from the
// persisted cache – they should always be fetched fresh on mount.
const NON_PERSISTENT_QUERY_KEYS = ["cloud_auth_state", "cloud_context_state", "console_url", "project_mode_supported"];

interface PersistedClient {
    timestamp: number;
    buster: string;
    clientState: DehydratedState;
}

const webviewStatePersister = (queryBaseKey: string) => {
    const { wsClient } = useVisualizerContext();
    return {
        persistClient: async (client: PersistedClient) => {
            await wsClient.setWebviewCache({ cacheKey: queryBaseKey, data: client });
        },
        restoreClient: async () => {
            const cache = await wsClient.restoreWebviewCache(queryBaseKey);
            return cache;
        },
        removeClient: async () => {
            await wsClient.clearWebviewCache(queryBaseKey);
        },
    };
};

export const WIWebviewQueryClientProvider = ({ children }: { children: React.ReactNode }) => {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        gcTime: 1000 * 60 * 60 * 24 * 7, // 1 week
                        retry: false,
                        refetchOnWindowFocus: false,
                    },
                },
            })
    );

    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
                persister: webviewStatePersister(`wi-react-query-cache`),
                buster: "wi-cache-v1",
                dehydrateOptions: {
                    shouldDehydrateQuery: (query: Query) =>
                        defaultShouldDehydrateQuery(query) &&
                        !NON_PERSISTENT_QUERY_KEYS.some((key) => query.queryKey.includes(key)),
                },
            }}
        >
            {children}
        </PersistQueryClientProvider>
    );
};
