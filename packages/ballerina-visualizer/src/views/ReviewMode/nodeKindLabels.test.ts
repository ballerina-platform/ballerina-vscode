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

import { NodeKindEnum, SemanticDiff } from "@wso2/ballerina-core";

// The real barrel pulls in the LS websocket client, which jest can't load; the enum's own
// module has no imports.
jest.mock("@wso2/ballerina-core", () => ({
    NodeKindEnum: jest.requireActual("@wso2/ballerina-core/lib/rpc-types/ai-panel/interfaces").NodeKindEnum,
}));

import { getNodeKindLabel, getObjectFunctionKind } from "./nodeKindLabels";

// Each OBJECT_FUNCTION metadata shape the LS sends, with its expected kind and label.
const OBJECT_FUNCTION_CASES: Array<{ shape: string; metadata: SemanticDiff["metadata"]; label: string }> = [
    {
        shape: "resource function",
        metadata: { accessor: "get", servicePath: "/api", resourcePath: "data", functionKind: "resource" },
        label: "resource",
    },
    {
        shape: "remote function",
        metadata: { name: "onMessage", servicePath: "", functionKind: "remote" },
        label: "remote",
    },
    {
        shape: "plain service method",
        metadata: { name: "format", servicePath: "", functionKind: "method" },
        label: "method",
    },
    {
        shape: "class init",
        metadata: { name: "OrderClient.init", functionKind: "init" },
        label: "init",
    },
    {
        shape: "class remote method",
        metadata: { name: "OrderClient.send", functionKind: "remote" },
        label: "remote",
    },
    {
        shape: "class method",
        metadata: { name: "OrderClient.validate", functionKind: "method" },
        label: "method",
    },
    // An older LS sends no functionKind, so the kind is inferred.
    {
        shape: "resource function from an older LS",
        metadata: { accessor: "get", servicePath: "/api", resourcePath: "." },
        label: "resource",
    },
    {
        // issue-2263: an older LS sent the function name as the accessor.
        shape: "remote function from an older LS",
        metadata: { accessor: "onMessage", servicePath: "", resourcePath: "" },
        label: "remote",
    },
    {
        shape: "class method from an older LS",
        metadata: { name: "OrderClient.validate" },
        label: "method",
    },
];

describe("getNodeKindLabel", () => {
    it.each(OBJECT_FUNCTION_CASES)("labels a $shape as '$label'", ({ metadata, label }) => {
        expect(getNodeKindLabel(NodeKindEnum.OBJECT_FUNCTION, metadata)).toBe(label);
    });

    it("labels an OBJECT_FUNCTION without metadata as a method", () => {
        expect(getNodeKindLabel(NodeKindEnum.OBJECT_FUNCTION)).toBe("method");
        expect(getObjectFunctionKind(undefined)).toBe("method");
    });

    it("labels other node kinds by kind", () => {
        expect(getNodeKindLabel(NodeKindEnum.MODULE_FUNCTION)).toBe("function");
        expect(getNodeKindLabel(NodeKindEnum.LISTENER)).toBe("listener");
    });

    it("falls back to 'component' for an unknown node kind", () => {
        expect(getNodeKindLabel(999)).toBe("component");
    });
});
