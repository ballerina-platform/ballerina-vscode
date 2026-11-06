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

import type { Branch, Flow, FlowNode } from "@wso2/ballerina-core";

const LINE = { line: 0, offset: 0 };
const RANGE = { fileName: "", startLine: LINE, endLine: LINE };

let counter = 0;
const nextId = () => `a2a-handler-${++counter}`;

function node(kind: string, label: string, description: string, extra: Record<string, unknown> = {}): FlowNode {
    return {
        id: nextId(),
        metadata: { label, description },
        codedata: { node: kind, lineRange: RANGE },
        returning: kind === "RETURN",
        properties: {},
        flags: 0,
        ...extra,
    } as unknown as FlowNode;
}

const start = (accessor: string, path: string) =>
    node("EVENT_START", "Start", "", {
        metadata: { label: "Start", data: { kind: "Resource", accessor, label: path, isServiceFunction: true } },
    });

const owner = () =>
    node("FUNCTION_CALL", "Resolve owner",
        "Works out whose tasks the caller may see: the task owner resolver you configured, or else the authenticated caller.");
const getTask = () =>
    node("A2A_TASK_STORE", "Task store: get task", "Reads the task from the task store, for this owner only.");
const listTasks = () =>
    node("A2A_TASK_STORE", "Task store: list tasks", "Lists this owner's tasks, filtered and paged as the request asks.");

function returns(value: string, description = ""): FlowNode {
    return node("RETURN", "Return", description, {
        properties: { expression: { metadata: { label: "Expression", description: "" }, valueType: "EXPRESSION", value: value } },
    });
}

function when(condition: string, children: FlowNode[]): FlowNode {
    const branch = {
        label: "Then",
        kind: "BLOCK",
        codedata: { node: "CONDITIONAL", lineRange: RANGE },
        repeatable: "ONE_OR_MORE",
        properties: { condition: { metadata: { label: "Condition", description: "" }, valueType: "EXPRESSION", value: condition } },
        children,
    } as unknown as Branch;
    return node("IF", "If", "", { branches: [branch] });
}

const notFound = (error: string) => when("the task is not found", [returns(error)]);

type Steps = () => FlowNode[];

const OPERATIONS: Record<string, { summary: string; steps: Steps }> = {
    handleGetTask: {
        summary: "Reads the task and returns it, trimmed to the history length the caller asked for.",
        steps: () => [owner(), getTask(), notFound("TaskNotFoundError"), returns("the task")],
    },
    handleListTasks: {
        summary: "Lists the caller's tasks from the task store.",
        steps: () => [owner(), listTasks(), returns("the page of tasks")],
    },
    handleCancelTask: {
        summary: "Cancels a task that has not finished, through the running task's updater when there is one.",
        steps: () => [
            owner(),
            getTask(),
            notFound("TaskNotFoundError"),
            when("the task has already finished", [returns("TaskNotCancelableError")]),
            node("A2A_TASK_UPDATE", "cancel",
                "Marks the task CANCELED: through the updater of the task that is running, or directly in the task store."),
            returns("the canceled task"),
        ],
    },
    handleSubscribeToTask: {
        summary: "Attaches the caller to a running task's live updates.",
        steps: () => [
            owner(),
            getTask(),
            notFound("TaskNotFoundError"),
            when("the task has already finished", [returns("UnsupportedOperationError")]),
            node("FUNCTION_CALL", "Attach to live updates",
                "Subscribes to the task's event stream; the first event is the task's current state."),
            returns("the stream of updates"),
        ],
    },
    handleCreateTaskPushNotificationConfig: {
        summary: "Registers a webhook for a task's updates.",
        steps: () => [
            owner(),
            node("FUNCTION_CALL", "Validate config id", "Checks the webhook id the caller chose, if any."),
            when("the request has no task id", [returns("InternalError (invalid request)")]),
            getTask(),
            notFound("TaskNotFoundError"),
            node("FUNCTION_CALL", "Push configs: save", "Stores the webhook for the task, with an id of its own when none was given."),
            returns("the stored config"),
        ],
    },
    handleGetTaskPushNotificationConfig: {
        summary: "Reads one webhook registered for a task.",
        steps: () => [
            owner(),
            getTask(),
            notFound("TaskNotFoundError"),
            node("FUNCTION_CALL", "Push configs: get", "Looks the webhook up among the task's registered webhooks."),
            when("the webhook is not registered", [returns("TaskNotFoundError")]),
            returns("the config"),
        ],
    },
    handleListTaskPushNotificationConfigs: {
        summary: "Lists the webhooks registered for a task.",
        steps: () => [
            owner(),
            getTask(),
            when("the task is not found", [returns("an empty list")]),
            node("FUNCTION_CALL", "Push configs: list", "Collects the webhooks registered for the task."),
            returns("the configs"),
        ],
    },
    handleDeleteTaskPushNotificationConfig: {
        summary: "Removes a webhook registered for a task.",
        steps: () => [
            owner(),
            getTask(),
            when("the task is not found", [returns("nothing")]),
            node("FUNCTION_CALL", "Push configs: delete", "Removes the webhook from the task's registered webhooks."),
            returns("nothing"),
        ],
    },
    handleGetExtendedAgentCard: {
        summary: "Returns the richer agent card, when one is configured.",
        steps: () => [
            when("no extended card is configured", [returns("ExtendedAgentCardNotConfiguredError")]),
            returns("the extended agent card"),
        ],
    },
};

export function handlerSummary(handlerMethod: string): string | undefined {
    return OPERATIONS[handlerMethod]?.summary;
}

export function handlerFlow(handlerMethod: string, accessor: string, path: string): Flow | undefined {
    const operation = OPERATIONS[handlerMethod];
    if (!operation) {
        return undefined;
    }
    counter = 0;
    return {
        fileName: "",
        nodes: [start(accessor, path), ...operation.steps()],
        connections: [],
    } as unknown as Flow;
}

export function isA2aExecuteMethod(meta?: { label?: string; parameters?: string[]; sourceCode?: string }): boolean {
    if (meta?.label !== "execute") {
        return false;
    }
    return Boolean(meta.parameters?.some((p) => p.includes("TaskUpdater")) || meta.sourceCode?.includes("TaskUpdater"));
}

export const A2A_EXECUTE_CHANGED_WARNING =
    "You changed the execute method. The same method runs for every A2A operation that runs the agent, "
    + "send message and streaming, so the change applies to all of them.";
