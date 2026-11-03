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

import { Flow, NodeKindEnum, SemanticDiff } from "@wso2/ballerina-core";

// The real barrel pulls in the LS websocket client, which jest can't load; the enum's own
// module has no imports.
jest.mock("@wso2/ballerina-core", () => ({
    NodeKindEnum: jest.requireActual("@wso2/ballerina-core/lib/rpc-types/ai-panel/interfaces").NodeKindEnum,
}));

import { isSameExpectedFunction, metadataMatchesExpected } from "./flowMatch";

// A flow model reduced to the EVENT_START data the matcher reads.
function flowOf(data: { label: string; isServiceFunction: boolean; accessor?: string }): Flow {
    return { nodes: [{ codedata: { node: "EVENT_START" }, metadata: { data } }] } as unknown as Flow;
}

function objectFunction(metadata: SemanticDiff["metadata"]) {
    return { nodeKind: NodeKindEnum.OBJECT_FUNCTION, metadata };
}

const onMessageFlow = flowOf({ label: "onMessage", isServiceFunction: true });
const onErrorFlow = flowOf({ label: "onError", isServiceFunction: true });
const getOrdersFlow = flowOf({ label: "orders", isServiceFunction: true, accessor: "get" });

describe("metadataMatchesExpected", () => {
    it("matches a resource function by accessor and path", () => {
        const expected = objectFunction({
            accessor: "get", servicePath: "/api", resourcePath: "orders", functionKind: "resource",
        });
        expect(metadataMatchesExpected(getOrdersFlow, expected)).toBe(true);
        expect(metadataMatchesExpected(flowOf({ label: "orders", isServiceFunction: true, accessor: "post" }),
            expected)).toBe(false);
    });

    it.each([
        ["remote function", { name: "onMessage", servicePath: "", functionKind: "remote" }],
        ["service method", { name: "onMessage", servicePath: "", functionKind: "method" }],
        ["class method", { name: "QueueClient.onMessage", functionKind: "method" }],
    ] as Array<[string, SemanticDiff["metadata"]]>)("matches a %s by name", (_, metadata) => {
        expect(metadataMatchesExpected(onMessageFlow, objectFunction(metadata))).toBe(true);
        expect(metadataMatchesExpected(onErrorFlow, objectFunction(metadata))).toBe(false);
    });

    it("does not match a remote function against a module function of the same name", () => {
        const expected = objectFunction({ name: "onMessage", servicePath: "", functionKind: "remote" });
        expect(metadataMatchesExpected(flowOf({ label: "onMessage", isServiceFunction: false }), expected))
            .toBe(false);
    });

    it("accepts any flow for an older LS's remote payload, which has no name", () => {
        const expected = objectFunction({ accessor: "onMessage", servicePath: "", resourcePath: "" });
        expect(metadataMatchesExpected(onErrorFlow, expected)).toBe(true);
    });

    it("matches a module function by name", () => {
        const expected = { nodeKind: NodeKindEnum.MODULE_FUNCTION, metadata: { name: "main" } };
        expect(metadataMatchesExpected(flowOf({ label: "main", isServiceFunction: false }), expected)).toBe(true);
        expect(metadataMatchesExpected(flowOf({ label: "main", isServiceFunction: true }), expected)).toBe(false);
    });
});

describe("isSameExpectedFunction", () => {
    it("rejects an old/new pair that resolved to different remote functions", () => {
        const expected = objectFunction({ name: "onMessage", servicePath: "", functionKind: "remote" });
        expect(isSameExpectedFunction(onMessageFlow, onMessageFlow, expected)).toBe(true);
        expect(isSameExpectedFunction(onErrorFlow, onMessageFlow, expected)).toBe(false);
    });
});
