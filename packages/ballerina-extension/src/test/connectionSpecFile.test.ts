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

// L1: a connection's API definition stays in the folder it is kept in, whatever the connection is named.

import * as path from "path";

// The helper is pure; the module around it reaches for the running extension.
jest.mock("../stateMachine", () => ({ StateMachine: {} }));
jest.mock("../BalExtensionContext", () => ({ extension: {} }));
jest.mock("../utils", () => ({ updateSourceCode: jest.fn() }));
jest.mock("@wso2/ballerina-core", () => ({ isSamePath: jest.fn() }));

import { specFileIn } from "../rpc-managers/platform-ext/platform-utils";

const dir = path.join(path.sep, "ws", "shop", ".wso2");

describe("specFileIn", () => {
    it("names the file after the connection, in the folder", () => {
        expect(specFileIn(dir, "ordersapi")).toBe(path.join(dir, "ordersapi-spec.yaml"));
        expect(specFileIn(dir, "my.api")).toBe(path.join(dir, "my.api-spec.yaml"));
    });

    it("refuses a name that would put the file anywhere else", () => {
        expect(() => specFileIn(dir, "../../x")).toThrow();
        expect(() => specFileIn(dir, path.join("nested", "x"))).toThrow();
        expect(() => specFileIn(dir, path.join(path.sep, "etc", "x"))).toThrow();
    });
});
