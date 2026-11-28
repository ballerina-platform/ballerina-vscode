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
jest.mock("vscode", () => ({}), { virtual: true });
jest.mock("../features/project/dependency-lock", () => ({}));
jest.mock("../utils/config", () => ({}));

import { candidateImports, lookupTools, newLookupState } from "../features/ai/expression-assist/tools";

describe("candidateImports", () => {
    it("imports lang library modules that are not predeclared", () => {
        expect(candidateImports("array:indexOf(xs, 1) + value:toJsonString(xs).length()", newLookupState(), {})).toEqual({
            array: "ballerina/lang.array",
            value: "ballerina/lang.value",
        });
        expect(candidateImports("runtime:getStackTrace()", newLookupState(), { runtime: "ballerina/lang.runtime" })).toEqual({ runtime: "ballerina/lang.runtime" });
    });

    it("leaves out predeclared lang library modules", () => {
        expect(candidateImports("string:length(name) + time:utcNow()[0]", newLookupState(), { int: "ballerina/lang.int" })).toEqual({
            time: "ballerina/time",
        });
    });
});

describe("lookupTools", () => {
    it("imports the modules of the field's own types when a value names them", () => {
        const run = newLookupState();
        const site = {
            filePath: "main.bal",
            context: { property: { types: [{ fieldType: "RECORD_MAP_EXPRESSION", ballerinaType: "http:ClientAuthConfig|v2:OAuth2DiscoveryConfig", selected: true, typeMembers: [
                { type: "OAuth2DiscoveryConfig", kind: "RECORD_TYPE", packageInfo: "ballerina:mcp.v2:1.5.0", selected: false },
                { type: "ClientAuthConfig", kind: "RECORD_TYPE", packageInfo: "ballerina:http:2.14.0", selected: true },
            ] }] } },
        } as unknown as Parameters<typeof lookupTools>[0];
        lookupTools(site, run);
        expect(candidateImports("<http:CredentialsConfig>{username: \"a\", password: \"b\"}", run, {})).toEqual({ http: "ballerina/http" });
        expect(candidateImports("<v2:OAuth2DiscoveryConfig>{}", run, {})).toEqual({ v2: "ballerina/mcp.v2" });
        // A wrong guess for a prefix the field's type defines, and an import the value never uses, are both dropped.
        expect(candidateImports("<v2:OAuth2DiscoveryConfig>{}", run, { v2: "ballerina/http", io: "ballerina/io" })).toEqual({ v2: "ballerina/mcp.v2" });
    });
});
