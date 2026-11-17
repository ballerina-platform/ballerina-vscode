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

import * as yaml from "js-yaml";

// The helper is pure; the module around it reaches for the running extension.
jest.mock("../stateMachine", () => ({ StateMachine: {} }));
jest.mock("../BalExtensionContext", () => ({ extension: {} }));
jest.mock("../utils", () => ({ updateSourceCode: jest.fn() }));
jest.mock("@wso2/ballerina-core", () => ({ isSamePath: jest.fn() }));

import { processOpenApiWithApiKeyAuth } from "../rpc-managers/platform-ext/platform-utils";

const spec = "openapi: 3.0.1\ninfo:\n  title: Billing\n  version: 1.0.0\npaths: {}\n";

describe("processOpenApiWithApiKeyAuth", () => {
    it("sends the API key in the header the API takes", () => {
        const out = yaml.load(processOpenApiWithApiKeyAuth(spec, "apikey", "X-Billing-Key")) as Record<string, any>;
        const schemes = Object.values(out.components.securitySchemes) as Record<string, string>[];
        expect(schemes).toEqual([{ type: "apiKey", in: "header", name: "X-Billing-Key", "x-ballerina-name": "apiKey" }]);
    });

    it("refuses an API key with no header rather than guessing one", () => {
        expect(() => processOpenApiWithApiKeyAuth(spec, "apikey")).toThrow();
    });

    it("adds no scheme for an API that takes no key", () => {
        const out = yaml.load(processOpenApiWithApiKeyAuth(spec, "")) as Record<string, any>;
        expect(out.components?.securitySchemes).toBeUndefined();
    });
});
