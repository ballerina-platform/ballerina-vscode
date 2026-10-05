/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.org).
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

// The durable agent's declaration forms open straight from the agent box with nothing behind them
const DURABLE_AGENT_DECLARATION_NODES = new Set(["DURABLE_AGENT_HUMAN_TASK", "DURABLE_AGENT_REGISTER_EVENT"]);

// Only the node kind is read, so any node-shaped value (a FlowNode, a fixture entry) will do
export type NodeKindCarrier = { codedata?: { node?: string } };

export const isDurableAgentDeclarationForm = (node?: NodeKindCarrier): boolean =>
    node?.codedata?.node !== undefined && DURABLE_AGENT_DECLARATION_NODES.has(node.codedata.node);

// Whether the FORM view offers Back: never while editing an existing node; otherwise whenever the
// navigation stack has an entry, or the form is not a durable agent declaration (those would land
// on a stale node list aimed at the wrong line when the stack is empty).
export const formBackAvailable = (
    showEditForm: boolean,
    canGoBack: boolean,
    selectedNode?: NodeKindCarrier
): boolean => !showEditForm && (canGoBack || !isDurableAgentDeclarationForm(selectedNode));
