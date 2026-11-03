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

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    GraphqlContextResponse,
    NodePosition,
    ServiceSettingsResponse,
    ServiceSettingsTarget,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

export const SERVICE_SETTINGS_QUERY_KEY = "serviceSettings";
export const GRAPHQL_CONTEXT_QUERY_KEY = "graphqlContext";

/** The request target of a service: its file and line range. */
export function serviceTarget(filePath: string, position: NodePosition): ServiceSettingsTarget {
    return {
        filePath,
        codedata: {
            lineRange: {
                startLine: { line: position?.startLine, offset: position?.startColumn },
                endLine: { line: position?.endLine, offset: position?.endColumn },
            },
        },
    };
}

/** The service's settings. A failure reads as "no settings", so the diagram never breaks over them. */
export function useServiceSettings(filePath: string, position: NodePosition) {
    const { rpcClient } = useRpcContext();
    return useQuery<ServiceSettingsResponse>({
        queryKey: [SERVICE_SETTINGS_QUERY_KEY, filePath, position],
        queryFn: () => rpcClient.getServiceDesignerRpcClient().getServiceSettings(serviceTarget(filePath, position)),
        enabled: !!filePath && !!position && !!rpcClient,
    });
}

/** The service's request context. */
export function useGraphqlContext(filePath: string, position: NodePosition, enabled: boolean) {
    const { rpcClient } = useRpcContext();
    return useQuery<GraphqlContextResponse>({
        queryKey: [GRAPHQL_CONTEXT_QUERY_KEY, filePath, position],
        queryFn: () => rpcClient.getServiceDesignerRpcClient().getGraphqlContext(serviceTarget(filePath, position)),
        enabled: enabled && !!filePath && !!position && !!rpcClient,
    });
}

/** Refetches everything the settings panel shows, after an edit. */
export function useInvalidateServiceSettings() {
    const queryClient = useQueryClient();
    return () => Promise.all([
        queryClient.invalidateQueries({ queryKey: [SERVICE_SETTINGS_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [GRAPHQL_CONTEXT_QUERY_KEY] }),
    ]);
}
