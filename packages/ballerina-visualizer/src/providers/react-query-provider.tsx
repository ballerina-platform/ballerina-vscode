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

import { QueryClient, DehydratedState } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import React from "react";

interface PersistedClient {
    timestamp: number;
    buster: string;
    clientState: DehydratedState;
}

const webviewStatePersister = (queryBaseKey: string) => {
    const { rpcClient } = useRpcContext();
    return {
        persistClient: async (client: PersistedClient) => {
            await rpcClient.getCommonRpcClient().setWebviewCache({ cacheKey: queryBaseKey, data: client });
        },
        restoreClient: async () => {
            const cache = await rpcClient.getCommonRpcClient().restoreWebviewCache(queryBaseKey);
            return cache;
        },
        removeClient: async () => {
            await rpcClient.getCommonRpcClient().clearWebviewCache(queryBaseKey);
        },
    };
};

export const ReactQueryProvider = ({ children }: { children: React.ReactNode }) => {
    return (
        <PersistQueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: {
                        queries: {
                            gcTime: 1000 * 60 * 60 * 24 * 7, // 1 week
                            retry: false,
                            refetchOnWindowFocus: false,
                        },
                    },
                })
            }
            persistOptions={{
                persister: webviewStatePersister(`ballerina-react-query-cache`),
                // Bumped whenever cached results change shape, so a restored cache never serves the old one (v2: WSO2 Cloud's services and connections).
                buster: "ballerina-cache-v2",
            }}
        >
            {children}
        </PersistQueryClientProvider>
    );
};
