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

import type { GraphqlContextResponse } from "@wso2/ballerina-core";
import { withLastKnownContext } from "./useGraphqlContext";

jest.mock("@wso2/ballerina-rpc-client", () => ({ __esModule: true, useRpcContext: jest.fn() }));

const configured: GraphqlContextResponse = {
    supported: true,
    configured: true,
    functionName: "graphqlContextInit",
    signatureValid: true,
    candidates: [],
    entries: [{ key: "scope", source: "header", value: "scope", required: true }],
    editable: true,
};

const notConfigured: GraphqlContextResponse = {
    supported: true,
    configured: false,
    signatureValid: false,
    candidates: ["other"],
    entries: [],
    editable: false,
};

// What the language server and the rpc-manager send for a read that failed.
const failed: GraphqlContextResponse = {
    supported: true,
    configured: false,
    signatureValid: false,
    candidates: [],
    entries: [],
    editable: false,
    errorMsg: "boom",
};

describe("withLastKnownContext", () => {
    it.each([
        ["a configured context", configured],
        ["a service without a context", notConfigured],
        ["an earlier failure", failed],
    ])("a failed read over %s keeps what was known and reports the failure", (_, previous) => {
        expect(withLastKnownContext({ ...failed, errorMsg: "later" }, previous))
            .toEqual({ ...previous, errorMsg: "later" });
    });

    it("a failed read with nothing known before stands, and still reads as supported", () => {
        const merged = withLastKnownContext(failed, undefined);
        expect(merged).toEqual(failed);
        expect(merged.supported).toBe(true);
    });

    it.each([configured, notConfigured])("a successful read replaces what was known", (response) => {
        expect(withLastKnownContext(response, { ...configured, errorMsg: "earlier" })).toEqual(response);
    });
});
