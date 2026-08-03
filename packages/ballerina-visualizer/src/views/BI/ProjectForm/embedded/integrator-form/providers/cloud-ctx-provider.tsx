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

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthState, ContextStoreState } from "../shims/wi-core";
import React, { type FC, type ReactNode, useContext, useEffect } from "react";
import { useVisualizerContext } from "../context/WsClientContext";

// ── Cloud projects cache ───────────────────────────────────────────────────────

const CLOUD_PROJECTS_STALE_TIME = 5 * 60 * 1000; // 5 minutes

export const cloudProjectsQueryKey = (orgId: string) => ["cloud_projects", orgId] as const;

/**
 * Returns the cloud project list for the given org from the React Query cache.
 * Data is pre-warmed by CloudContextProvider as soon as organizations are known,
 * so this is typically a cache hit with zero network latency when used in forms.
 */
export function useCloudProjects(orgId: string | undefined, orgHandle: string | undefined) {
    const { wsClient } = useVisualizerContext();
    return useQuery({
        queryKey: cloudProjectsQueryKey(orgId ?? ""),
        queryFn: () => wsClient.getCloudProjects({ orgId: orgId!, orgHandle: orgHandle! }),
        enabled: !!orgId && !!orgHandle,
        staleTime: CLOUD_PROJECTS_STALE_TIME,
    });
}

interface ICloudContext {
    authState: AuthState | undefined;
    contextState: ContextStoreState | undefined;
    authStateLoading: boolean;
    contextStateLoading: boolean;
    consoleUrl?: string;
}

const defaultCloudContext: ICloudContext = {
    authState: undefined,
    contextState: undefined,
    authStateLoading: true,
    contextStateLoading: true,
    consoleUrl: "",
};

const CloudContext = React.createContext<ICloudContext>(defaultCloudContext);

export const useCloudContext = () => {
    return useContext(CloudContext) || defaultCloudContext;
};

interface Props {
    children: ReactNode;
}

export const CloudContextProvider: FC<Props> = ({ children }) => {
    const { wsClient } = useVisualizerContext();
    const queryClient = useQueryClient();

    const { data: authState, isLoading: authStateLoading } = useQuery({
        queryKey: ["cloud_auth_state"],
        queryFn: () => wsClient.getAuthState(),
        refetchOnWindowFocus: true,
        // Poll every 3 s when signed out so login via browser callback is detected promptly.
        // Polling stops as soon as userInfo is populated.
        refetchInterval: (query) => query.state.data?.userInfo ? false : 3000,
    });

    const { data: contextState, isLoading: contextStateLoading } = useQuery({
        queryKey: ["cloud_context_state"],
        queryFn: () => wsClient.getContextState(),
        refetchOnWindowFocus: true,
    });

    const { data: consoleUrl } = useQuery({
        queryKey: ["console_url"],
        queryFn: () => wsClient.getConsoleUrl(),
    });

    useEffect(() => {
        wsClient.onAuthStateChanged((state) => {
            queryClient.setQueryData(["cloud_auth_state"], state);
        });
        wsClient.onContextStateChanged((state) => {
            queryClient.setQueryData(["cloud_context_state"], state);
        });
    }, []);

    return (
        <CloudContext.Provider value={{ authState, contextState, authStateLoading, contextStateLoading, consoleUrl }}>
            {children}
        </CloudContext.Provider>
    );
};
