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

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AgentManagerSession } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

const SESSION_KEY = ["agentManagerSession"];

/** The Agent Manager sign-in, kept current by the extension's change notifications. */
export function useAgentManagerSession(): AgentManagerSession | undefined {
    const { rpcClient } = useRpcContext();
    const queryClient = useQueryClient();
    const { data } = useQuery({
        queryKey: SESSION_KEY,
        queryFn: () => rpcClient.getAgentManagerRpcClient().getAgentManagerSession(),
    });

    useEffect(() => rpcClient.onAgentManagerSessionChanged((session) => {
        queryClient.setQueryData(SESSION_KEY, session);
        queryClient.invalidateQueries({ queryKey: ["agentManagerStatus"] });
    }), [rpcClient, queryClient]);

    return data;
}
