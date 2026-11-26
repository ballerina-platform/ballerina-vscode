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

jest.mock("../stateMachine", () => ({ StateMachine: {} }));
jest.mock("../rpc-managers/bi-diagram/rpc-manager", () => ({ BiDiagramRpcManager: class {} }));
jest.mock("../features/ai/expression-assist/context", () => ({}));

import { candidateImports, newLookupState } from "../features/ai/expression-assist/tools";

describe("candidateImports", () => {
    it("imports lang library modules that are not predeclared", () => {
        expect(candidateImports("array:indexOf(xs, 1) + value:toJsonString(xs).length()", newLookupState(), {})).toEqual({
            array: "ballerina/lang.array",
            value: "ballerina/lang.value",
        });
        expect(candidateImports("x", newLookupState(), { runtime: "ballerina/lang.runtime" })).toEqual({ runtime: "ballerina/lang.runtime" });
    });

    it("leaves out predeclared lang library modules", () => {
        expect(candidateImports("string:length(name) + time:utcNow()[0]", newLookupState(), { int: "ballerina/lang.int" })).toEqual({
            time: "ballerina/time",
        });
    });
});
