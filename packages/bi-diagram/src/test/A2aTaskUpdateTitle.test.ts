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

import { getNodeTitle } from "../utils/node";
import { FlowNode } from "../utils/types";

const update = (label: string) =>
    ({ codedata: { node: "A2A_TASK_UPDATE" }, metadata: { label }, properties: {} } as unknown as FlowNode);

describe("getNodeTitle for an A2A task update", () => {
    it.each(["working", "addArtifact", "complete", "failed", "reject", "requireInput", "requireAuth", "somethingNew"])(
        "titles %s by its method name",
        (method) => {
            expect(getNodeTitle(update(method))).toBe(method);
        }
    );
});

describe("getNodeTitle for an A2A task update made on a named updater", () => {
    const onUpdater = (label: string, receiver: string) =>
        ({
            codedata: { node: "A2A_TASK_UPDATE" },
            metadata: { label },
            properties: { connection: { value: receiver } },
        } as unknown as FlowNode);

    it("names the updater before the method, as the agent call is titled", () => {
        expect(getNodeTitle(onUpdater("working", "updater"))).toBe("updater : working");
        expect(getNodeTitle(onUpdater("addArtifact", "updater"))).toBe("updater : addArtifact");
    });

    it("keeps the method alone when the updater is not known", () => {
        expect(getNodeTitle(onUpdater("complete", ""))).toBe("complete");
    });
});

describe("getNodeTitle for an A2A task store call", () => {
    const store = (label: string) =>
        ({ codedata: { node: "A2A_TASK_STORE" }, metadata: { label }, properties: {} } as unknown as FlowNode);

    const onStore = (label: string, receiver: string) =>
        ({
            codedata: { node: "A2A_TASK_STORE" },
            metadata: { label },
            properties: { connection: { value: receiver } },
        } as unknown as FlowNode);

    it.each(["get", "list"])("titles %s with the store variable from the source before the method", (method) => {
        expect(getNodeTitle(onStore(method, "tripPlannerA2aTaskStore"))).toBe(`tripPlannerA2aTaskStore : ${method}`);
    });

    it.each(["get", "list", "put", "remove"])("falls back to taskStore when the store is not known (%s)", (method) => {
        expect(getNodeTitle(store(method))).toBe(`taskStore : ${method}`);
        expect(getNodeTitle(onStore(method, ""))).toBe(`taskStore : ${method}`);
    });

    it("keeps a title that is already complete, as the handler's read-only steps carry", () => {
        expect(getNodeTitle(store("Task store: get task"))).toBe("Task store: get task");
    });
});

describe("getNodeTitle for the call an A2A resource makes on its handler", () => {
    const handler = (label: string) =>
        ({ codedata: { node: "A2A_HANDLER_CALL" }, metadata: { label }, properties: {} } as unknown as FlowNode);

    it.each([
        ["handleSendMessage", "Handler: send message"],
        ["handleGetTask", "Handler: get task"],
        ["handleCreateTaskPushNotificationConfig", "Handler: create task push notification config"],
    ])("titles %s as %s", (method, title) => {
        expect(getNodeTitle(handler(method))).toBe(title);
    });

    it("has a title when the call has no name", () => {
        expect(getNodeTitle(handler(""))).toBe("Handler");
    });
});
