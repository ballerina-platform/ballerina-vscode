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

/** The service's request context. A failure reads as "no context", so the diagram never breaks over it. */
export function useGraphqlContext(filePath: string, position: NodePosition) {
    const { rpcClient } = useRpcContext();
    return useQuery<GraphqlContextResponse>({
        queryKey: [GRAPHQL_CONTEXT_QUERY_KEY, filePath, position],
        queryFn: () => rpcClient.getServiceDesignerRpcClient().getGraphqlContext(contextRequest(filePath, position)),
        enabled: !!filePath && !!position && !!rpcClient,
        // Keep the indicator and the panel steady while a moved service's context reloads.
        placeholderData: keepPreviousData,
    });
}

/** Refetches the request context, after an edit. */
export function useInvalidateGraphqlContext() {
    const queryClient = useQueryClient();
    return () => queryClient.invalidateQueries({ queryKey: [GRAPHQL_CONTEXT_QUERY_KEY] });
}
