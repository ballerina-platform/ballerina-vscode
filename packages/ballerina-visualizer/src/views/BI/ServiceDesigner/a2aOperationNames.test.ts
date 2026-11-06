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

import { a2aPathOf, describeA2aOperation } from "./a2aOperationNames";

describe("A2A operations", () => {
    it("writes path parameters as {name} and drops escapes", () => {
        expect(a2aPathOf("message\\:send")).toBe("message:send");
        expect(a2aPathOf("tasks/[string id]/pushNotificationConfigs/[string configId]"))
            .toBe("tasks/{id}/pushNotificationConfigs/{configId}");
    });

    it("names and groups every operation the generated service has", () => {
        const described = (accessor: string, name: string) => {
            const { group, title, method } = describeA2aOperation(accessor, name);
            return `${group} | ${title} | ${method}`;
        };
        expect(described("post", "message\\:send")).toBe("Core | Send message | POST");
        expect(described("post", "message\\:stream")).toBe("Streaming | Stream message | POST");
        expect(described("get", "tasks")).toBe("Core | List tasks | GET");
        expect(described("get", "tasks/[string id]")).toBe("Core | Get task | GET");
        expect(described("post", "tasks/[string id]/cancel")).toBe("Core | Cancel task | POST");
        expect(described("get", "tasks/[string id]/subscribe")).toBe("Streaming | Subscribe to task | GET");
        expect(described("post", "tasks/[string id]/pushNotificationConfigs"))
            .toBe("Push notifications | Create push notification config | POST");
        expect(described("get", "tasks/[string id]/pushNotificationConfigs/[string configId]"))
            .toBe("Push notifications | Get push notification config | GET");
        expect(described("delete", "tasks/[string id]/pushNotificationConfigs/[string configId]"))
            .toBe("Push notifications | Delete push notification config | DELETE");
    });

    it("keeps an operation it does not know under Other, with its own path", () => {
        expect(describeA2aOperation("put", "things/[string id]")).toMatchObject({ group: "Other", title: "things/{id}", method: "PUT" });
    });

    it("orders a group the same way whatever order the source has them in", () => {
        const order = (accessor: string, name: string) => describeA2aOperation(accessor, name).order;
        expect(order("post", "message\\:send")).toBeLessThan(order("get", "tasks/[string id]"));
        expect(order("get", "tasks/[string id]")).toBeLessThan(order("post", "tasks/[string id]/cancel"));
        expect(order("post", "tasks/[string id]/cancel")).toBeLessThan(order("get", "tasks"));
        expect(order("post", "message\\:stream")).toBeLessThan(order("get", "tasks/[string id]/subscribe"));
    });

    it("puts the core operations in one Core group, and nothing else", () => {
        const core = (accessor: string, name: string) => describeA2aOperation(accessor, name).core;
        expect(core("post", "message\\:send")).toBe(true);
        expect(core("get", "tasks/[string id]")).toBe(true);
        expect(core("post", "tasks/[string id]/cancel")).toBe(true);
        expect(core("get", "tasks")).toBe(true);
        expect(core("post", "message\\:stream")).toBe(false);
        expect(core("get", "tasks/[string id]/subscribe")).toBe(false);
        expect(core("post", "tasks/[string id]/pushNotificationConfigs")).toBe(false);
    });
});
