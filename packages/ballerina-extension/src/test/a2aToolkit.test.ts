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

jest.mock("../rpc-managers/bi-diagram/rpc-manager", () => ({ BiDiagramRpcManager: class {} }));
jest.mock("../utils/config", () => ({ getProjectTomlValues: jest.fn() }));

import { addToolToList, toolNames } from "../rpc-managers/ai-agent/a2a-toolkit";

describe("a2a toolkit helpers", () => {
    it("reads the entries of a list's source text", () => {
        expect(toolNames("[a, b ,c]")).toEqual(["a", "b", "c"]);
        expect(toolNames("[]")).toEqual([]);
        expect(toolNames("")).toEqual([]);
    });

    it("adds a toolkit to a list given as source text, once", () => {
        expect(addToolToList("[sumTool]", "weatherAgent")).toBe("[sumTool, weatherAgent]");
        expect(addToolToList("[sumTool, weatherAgent]", "weatherAgent")).toBe("[sumTool, weatherAgent]");
        expect(addToolToList("", "weatherAgent")).toBe("[weatherAgent]");
        expect(addToolToList(undefined, "weatherAgent")).toBe("[weatherAgent]");
    });

    it("adds a toolkit to a list given as form entries, once", () => {
        const entries: any[] = [{ value: "sumTool" }];
        const updated = addToolToList(entries, "weatherAgent") as any[];
        expect(updated.map((e) => e.value)).toEqual(["sumTool", "weatherAgent"]);
        expect(addToolToList(updated, "weatherAgent")).toHaveLength(2);
    });
});
