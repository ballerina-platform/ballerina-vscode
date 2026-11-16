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

import { A2A_EXECUTE_CHANGED_WARNING, isA2aExecuteMethod } from "../../../../views/BI/DiagramWrapper/a2aHandlerSteps";

describe("the execute method of an A2A executor", () => {
    it("is told apart by its task updater parameter", () => {
        expect(isA2aExecuteMethod({ label: "execute", parameters: ["a2a:RequestContext context", "a2a:TaskUpdater updater"] })).toBe(true);
        expect(isA2aExecuteMethod({ label: "execute", sourceCode: "isolated function execute(a2a:RequestContext c, a2a:TaskUpdater u)" })).toBe(true);
    });

    it("is not any other function", () => {
        expect(isA2aExecuteMethod({ label: "execute", parameters: ["string query"] })).toBe(false);
        expect(isA2aExecuteMethod({ label: "execute", parameters: ["RequestContext c", "MyTaskUpdater updater"] })).toBe(false);
        expect(isA2aExecuteMethod({ label: "execute", parameters: ["a2a:RequestContext c", "jobs:MyTaskUpdater u"] })).toBe(false);
        expect(isA2aExecuteMethod({ label: "execute", sourceCode: "function execute(string s) { // a2a:TaskUpdater" })).toBe(false);
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
