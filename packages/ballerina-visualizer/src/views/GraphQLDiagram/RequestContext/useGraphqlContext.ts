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

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraphqlContextRequest, GraphqlContextResponse, NodePosition } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

export const GRAPHQL_CONTEXT_QUERY_KEY = "graphqlContext";

/** The request that locates a GraphQL service: its file and line range. */
export function contextRequest(filePath: string, position: NodePosition): GraphqlContextRequest {
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

/**
 * A failed read reported over the last context read successfully, so a configured context keeps its indicator, menu
 * item and unsaved panel edits instead of looking like no context. With nothing read before, the failure stands:
 * the service is still reported as supporting a context, so the panel opens and shows why it could not be read.
 */
export function withLastKnownContext(response: GraphqlContextResponse,
                                     previous?: GraphqlContextResponse): GraphqlContextResponse {
    if (!response?.errorMsg || !previous) {
        return response;
    }
    return { ...previous, errorMsg: response.errorMsg };
}

/** The service's request context. A failed read carries its `errorMsg`, which the panel shows. */
export function useGraphqlContext(filePath: string, position: NodePosition) {
    const { rpcClient } = useRpcContext();
    const queryClient = useQueryClient();
    const queryKey = [GRAPHQL_CONTEXT_QUERY_KEY, filePath, position];
    return useQuery<GraphqlContextResponse>({
        queryKey,
        queryFn: async () => withLastKnownContext(
            await rpcClient.getServiceDesignerRpcClient().getGraphqlContext(contextRequest(filePath, position)),
            queryClient.getQueryData<GraphqlContextResponse>(queryKey)),
        enabled: !!filePath && !!position && !!rpcClient,
        // Keep the indicator and the panel steady while a moved service's context reloads.
        placeholderData: keepPreviousData,
    });
}
