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

import { A2A_EXECUTE_CHANGED_WARNING, isA2aExecuteMethod, handlerFlow, handlerSummary } from "../../../../views/BI/DiagramWrapper/a2aHandlerSteps";

const kinds = (method: string) => handlerFlow(method, "get", "tasks/[string id]")!.nodes.map((n) => n.codedata.node);

describe("the default handler's steps as a flow", () => {
    it("starts every operation with an event start and draws the resource's accessor and path", () => {
        const flow = handlerFlow("handleGetTask", "get", "tasks/[string id]")!;
        expect(flow.nodes[0].codedata.node).toBe("EVENT_START");
        expect((flow.nodes[0].metadata as { data?: unknown }).data).toMatchObject({ accessor: "get", label: "tasks/[string id]" });
    });

    it("get task: owner, store read, not-found branch, return", () => {
        expect(kinds("handleGetTask")).toEqual(["EVENT_START", "FUNCTION_CALL", "A2A_TASK_STORE", "IF", "RETURN"]);
    });

    it("cancel task: both checks, then a task update, then the canceled task", () => {
        expect(kinds("handleCancelTask")).toEqual([
            "EVENT_START", "FUNCTION_CALL", "A2A_TASK_STORE", "IF", "IF", "A2A_TASK_UPDATE", "RETURN",
        ]);
    });

    it("list tasks reads the store once and returns the page", () => {
        expect(kinds("handleListTasks")).toEqual(["EVENT_START", "FUNCTION_CALL", "A2A_TASK_STORE", "RETURN"]);
    });

    it("every error branch returns an error type the library has", () => {
        const known = ["TaskNotFoundError", "TaskNotCancelableError", "UnsupportedOperationError",
            "ExtendedAgentCardNotConfiguredError", "InternalError (invalid request)", "an empty list", "nothing"];
        for (const method of ["handleGetTask", "handleCancelTask", "handleSubscribeToTask",
            "handleCreateTaskPushNotificationConfig", "handleGetTaskPushNotificationConfig",
            "handleListTaskPushNotificationConfigs", "handleDeleteTaskPushNotificationConfig",
            "handleGetExtendedAgentCard"]) {
            const flow = handlerFlow(method, "get", "x")!;
            for (const n of flow.nodes.filter((node) => node.codedata.node === "IF")) {
                const returned = n.branches![0].children.map((c) => (c.properties as { expression: { value: string } }).expression.value);
                expect(returned).toHaveLength(1);
                expect(known).toContain(returned[0]);
            }
        }
    });

    it("gives every node a distinct id, as the diagram needs", () => {
        const ids: string[] = [];
        const walk = (nodes: any[]) => nodes.forEach((n) => { ids.push(n.id); (n.branches ?? []).forEach((b: any) => walk(b.children)); });
        walk(handlerFlow("handleCancelTask", "post", "tasks/[string id]/cancel")!.nodes);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("leaves the operations that run the agent to the executor's own flow", () => {
        expect(handlerFlow("handleSendMessage", "post", "message:send")).toBeUndefined();
        expect(handlerSummary("handleSendStreamingMessage")).toBeUndefined();
    });

    it("describes every operation of the default handler that has a resource", () => {
        for (const method of ["handleGetTask", "handleListTasks",
            "handleCancelTask", "handleSubscribeToTask", "handleCreateTaskPushNotificationConfig",
            "handleGetTaskPushNotificationConfig", "handleListTaskPushNotificationConfigs",
            "handleDeleteTaskPushNotificationConfig", "handleGetExtendedAgentCard"]) {
            expect(handlerSummary(method)).toBeTruthy();
        }
        expect(handlerSummary("handleSomethingElse")).toBeUndefined();
    });
});

describe("the execute method of an A2A executor", () => {
    it("is told apart by its task updater parameter", () => {
        expect(isA2aExecuteMethod({ label: "execute", parameters: ["a2a:RequestContext context", "a2a:TaskUpdater updater"] })).toBe(true);
        expect(isA2aExecuteMethod({ label: "execute", sourceCode: "isolated function execute(a2a:RequestContext c, a2a:TaskUpdater u)" })).toBe(true);
    });

    it("is not any other function", () => {
        expect(isA2aExecuteMethod({ label: "execute", parameters: ["string query"] })).toBe(false);
        expect(isA2aExecuteMethod({ label: "run", parameters: ["a2a:TaskUpdater updater"] })).toBe(false);
        expect(isA2aExecuteMethod(undefined)).toBe(false);
    });
});

describe("the warning after a change to an executor's execute flow", () => {
    it("says the change applies to every operation that runs the agent", () => {
        expect(A2A_EXECUTE_CHANGED_WARNING).toContain("execute method");
        expect(A2A_EXECUTE_CHANGED_WARNING).toContain("every A2A operation");
        expect(A2A_EXECUTE_CHANGED_WARNING).toContain("applies to all of them");
    });
});
