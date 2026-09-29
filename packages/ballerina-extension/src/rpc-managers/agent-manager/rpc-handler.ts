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

import {
    AddAgentManagerMcpServersRequest,
    addAgentManagerMcpServers,
    AgentManagerActionRequest,
    AgentManagerStatusRequest,
    getAgentManagerConfigForm,
    getAgentManagerMcpOffer,
    getAgentManagerStatus,
    runAgentManagerAction,
} from "@wso2/ballerina-core";
import { Messenger } from "vscode-messenger";
import { addMcpServers, getMcpOffer } from "../../features/agent-manager/copilot";
import { getConfigForm, getStatus, runAction } from "../../features/agent-manager/flows";

export function registerAgentManagerRpcHandlers(messenger: Messenger) {
    messenger.onRequest(getAgentManagerStatus, (args: AgentManagerStatusRequest) => getStatus(args.projectPath));
    messenger.onRequest(runAgentManagerAction, (args: AgentManagerActionRequest) => runAction(args.projectPath, args.action, args.config));
    messenger.onRequest(getAgentManagerConfigForm, (args: AgentManagerStatusRequest) => getConfigForm(args.projectPath));
    messenger.onRequest(getAgentManagerMcpOffer, () => getMcpOffer());
    messenger.onRequest(addAgentManagerMcpServers, (args: AddAgentManagerMcpServersRequest) => addMcpServers(args.ids));
}
