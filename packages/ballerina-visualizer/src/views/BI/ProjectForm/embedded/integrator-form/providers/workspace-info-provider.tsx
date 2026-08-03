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

import { useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { DEFAULT_PROFILE, SELECTED_PROFILE_CONFIG_SECTION } from "../shims/wi-core";
import { useVisualizerContext } from "../context/WsClientContext";

export const WORKSPACE_INFO_QUERY_KEYS = {
    projectModeSupported: ["project_mode_supported"] as const,
    workspaceRoot: ["workspace_root"] as const,
    selectedProfile: ["selected_profile"] as const,
} as const;

const PROJECT_MODE_MIN_VERSION = { major: 2201, minor: 13, patch: 0 };

/**
 * Returns whether the current Ballerina SL version supports project mode.
 * - Returns `true` optimistically while the check is in flight.
 * - Result is cached for the entire session (version never changes mid-session).
 */
export function useProjectModeSupported(): boolean {
    const { wsClient } = useVisualizerContext();
    const { data } = useQuery({
        queryKey: WORKSPACE_INFO_QUERY_KEYS.projectModeSupported,
        queryFn: () => wsClient.isSupportedSLVersion(PROJECT_MODE_MIN_VERSION),
        staleTime: Infinity,
        placeholderData: true,
    });
    return data ?? true;
}

/**
 * Like {@link useProjectModeSupported} but also reports whether the version check
 * has actually resolved. Use this when a decision must not act on the optimistic
 * placeholder (e.g. before mutating form state), so it waits for the confirmed value.
 * Shares the same query cache key, so it never fires a second request.
 */
export function useProjectModeSupportedStatus(): { supported: boolean; isResolved: boolean } {
    const { wsClient } = useVisualizerContext();
    const { data, isSuccess } = useQuery({
        queryKey: WORKSPACE_INFO_QUERY_KEYS.projectModeSupported,
        queryFn: () => wsClient.isSupportedSLVersion(PROJECT_MODE_MIN_VERSION),
        staleTime: Infinity,
        placeholderData: true,
    });
    return { supported: data ?? true, isResolved: isSuccess };
}

/**
 * Returns the current VS Code workspace root path and a ready flag.
 * - `path`: the workspace root (empty string if none is open).
 * - `isReady`: false while the initial fetch is in flight.
 *
 * Uses stale-while-revalidate so callers get cached data instantly on
 * subsequent renders while a background refresh confirms the value.
 */
export function useWorkspaceRoot(): { path: string; isReady: boolean } {
    const { wsClient } = useVisualizerContext();
    const { data, isSuccess } = useQuery({
        queryKey: WORKSPACE_INFO_QUERY_KEYS.workspaceRoot,
        queryFn: () => wsClient.getWorkspaceRoot().then(r => r.path ?? ""),
        staleTime: 0, // always stale — revalidates in background, serves cache instantly
    });
    return { path: data ?? "", isReady: isSuccess };
}

/**
 * Inner component that performs the actual cache warm-up.
 * Only mounted when the active runtime profile is the default profile, because
 * the queries it fires (`isSupportedSLVersion`, `getWorkspaceRoot`) are
 * Ballerina-specific and are meaningless — and potentially error-prone — under
 * other profiles such as MI or SI.
 */
function DefaultProfilePrefetcher({ children }: { children: ReactNode }) {
    useProjectModeSupported();
    useWorkspaceRoot();
    return <>{children}</>;
}

/**
 * It pre-warms the Ballerina workspace info queries at app startup so that any
 * form rendering later receives cached values immediately — but only when the
 * active runtime profile is `DEFAULT_PROFILE`. Under MI or SI profiles the
 * children are rendered directly without firing any Ballerina-specific requests.
 */
export function WorkspaceInfoPrefetcher({ children }: { children: ReactNode }) {
    const { wsClient } = useVisualizerContext();
    const { data: selectedProfile } = useQuery({
        queryKey: WORKSPACE_INFO_QUERY_KEYS.selectedProfile,
        queryFn: () =>
            wsClient
                .getConfiguration({ section: SELECTED_PROFILE_CONFIG_SECTION })
                .then(response => response.value as string),
        staleTime: Infinity, // profile does not change mid-session
    });

    // While the profile is loading we default to not prefetching so we never
    // fire Ballerina requests unnecessarily. Once resolved, only mount the
    // inner prefetcher when the default profile is active.
    if (selectedProfile !== DEFAULT_PROFILE) {
        return <>{children}</>;
    }

    return <DefaultProfilePrefetcher>{children}</DefaultProfilePrefetcher>;
}
