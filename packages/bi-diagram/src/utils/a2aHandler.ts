/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// What the ballerina/a2a DefaultHandler does for the operations that do not run the agent. Their logic lives in the
// library, so the handler block describes it in one line instead of opening a flow.
const SUMMARIES: Record<string, string> = {
    handleGetTask: "Reads the task and returns it, trimmed to the history length the caller asked for.",
    handleListTasks: "Lists the caller's tasks from the task store.",
    handleCancelTask: "Cancels a task that has not finished.",
    handleSubscribeToTask: "Attaches the caller to a running task's live updates.",
    handleCreateTaskPushNotificationConfig: "Registers a webhook for a task's updates.",
    handleGetTaskPushNotificationConfig: "Reads one webhook registered for a task.",
    handleListTaskPushNotificationConfigs: "Lists the webhooks registered for a task.",
    handleDeleteTaskPushNotificationConfig: "Removes a webhook registered for a task.",
    handleGetExtendedAgentCard: "Returns the richer agent card, when one is configured.",
};

/** The one-line description of a default handler operation that does not run the agent. */
export function a2aHandlerSummary(handlerMethod?: string): string | undefined {
    return handlerMethod ? SUMMARIES[handlerMethod] : undefined;
}
