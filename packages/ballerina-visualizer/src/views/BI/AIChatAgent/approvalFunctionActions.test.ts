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

// FlowDiagram/utils pulls in the ballerina-core barrel (ESM-only deps jest can't load); the lookup
// these actions rely on is a plain name match over project components, stubbed here.
jest.mock("../FlowDiagram/utils", () => ({
    findFunctionByName: (components: { functions: any[] }, name: string) =>
        components.functions.find((fn) => fn.name === name) ?? null,
}));

jest.mock("@wso2/ballerina-core", () => ({
    EVENT_TYPE: { OPEN_VIEW: "OPEN_VIEW" },
    MACHINE_VIEW: { BIDiagram: "BI Diagram" },
}));

import { createApprovalFunctionActions, readFunctionNodeParameters } from "./approvalFunctionActions";

const NAME_LINE_RANGE = {
    fileName: "agents.bal", startLine: { line: 3, offset: 18 }, endLine: { line: 3, offset: 35 },
};

function fakeRpcClient(
    functionNames: () => string[],
    // `approvalFunction` is what the language server reports for a tool's @ai:AgentTool annotation.
    options: { usedBy?: string[]; approvalFunction?: string; referencedElsewhere?: boolean | null } = {}
) {
    const showErrorMessage = jest.fn();
    const openView = jest.fn();
    const deleteByComponentInfo = jest.fn().mockResolvedValue({});
    const getFunctionNode = jest.fn(async ({ functionName }: { functionName: string }) => ({
                functionDefinition: {
                    metadata: {
                        data: {
                            approvalFunctionFor: options.usedBy ?? ["addToCart"],
                            // null leaves the flag out, as a language server that predates it does.
                            ...(options.referencedElsewhere === null
                                ? {} : { referencedOutsideApprovals: options.referencedElsewhere ?? false }),
                            ...(options.approvalFunction
                                ? { requiresApproval: true, approvalFunction: options.approvalFunction } : {}),
                        },
                    },
                    properties: {
                        functionName: { value: functionName, codedata: { lineRange: NAME_LINE_RANGE } },
                        parameters: {
                            value: {
                                ids: { value: { type: { value: "string[]" }, variable: { value: "ids" } } },
                                id: { value: { type: { value: "string" }, variable: { value: functionName } } },
                            },
                        },
                    },
                },
            }));
    const rpcClient: any = {
        getBIDiagramRpcClient: () => ({
            getFunctionNode,
            deleteByComponentInfo,
            getProjectComponents: async () => ({
                components: {
                    functions: functionNames().map((name) => ({
                        name, filePath: "/p/agents.bal", startLine: 3, startColumn: 0, endLine: 5, endColumn: 1,
                    })),
                },
            }),
        }),
        getCommonRpcClient: () => ({ showErrorMessage }),
        getVisualizerRpcClient: () => ({ openView }),
        getVisualizerLocation: async () => ({ projectPath: "/p" }),
    };
    return { rpcClient, showErrorMessage, openView, deleteByComponentInfo, getFunctionNode };
}

describe("approvalFunctionActions.onOpenFunction", () => {
    it("opens the function's flow diagram", async () => {
        const { rpcClient, openView } = fakeRpcClient(() => ["addToCartApproval"]);
        await createApprovalFunctionActions(rpcClient).onOpenFunction("addToCartApproval");
        expect(openView).toHaveBeenCalledWith({
            type: "OPEN_VIEW",
            location: {
                documentUri: "/p/agents.bal",
                identifier: "addToCartApproval",
                position: { startLine: 3, startColumn: 0, endLine: 5, endColumn: 1 },
                view: "BI Diagram",
            },
        });
    });

    it("explains when the function can't be found", async () => {
        const { rpcClient, openView, showErrorMessage } = fakeRpcClient(() => []);
        await createApprovalFunctionActions(rpcClient).onOpenFunction("custApproval");
        expect(openView).not.toHaveBeenCalled();
        expect(showErrorMessage.mock.calls[0][0].message).toContain("'custApproval'");
    });
});

describe("approvalFunctionActions.getFunctionInfo", () => {
    it("reads the function's parameters, the tools that use it and where its name is declared", async () => {
        const { rpcClient } = fakeRpcClient(() => ["addToCartApproval"]);
        expect(await createApprovalFunctionActions(rpcClient).getFunctionInfo("addToCartApproval")).toEqual({
            params: [{ type: "string[]", name: "ids" }, { type: "string", name: "addToCartApproval" }],
            usedBy: ["addToCart"],
            referencedElsewhere: false,
            nameLineRange: NAME_LINE_RANGE,
        });
    });

    it("returns null when the function doesn't exist", async () => {
        const { rpcClient } = fakeRpcClient(() => []);
        expect(await createApprovalFunctionActions(rpcClient).getFunctionInfo("missing")).toBeNull();
    });
});

describe("readFunctionNodeParameters", () => {
    it("skips incomplete entries and tolerates missing values", () => {
        expect(readFunctionNodeParameters({ a: { value: { type: { value: "int" } } } })).toEqual([]);
        expect(readFunctionNodeParameters(undefined)).toEqual([]);
    });
});

describe("approvalFunctionActions orphan cleanup", () => {
    it("deletes an approval function no tool uses any more, at its source range", async () => {
        const { rpcClient, deleteByComponentInfo } = fakeRpcClient(() => ["addToCartApproval"], { usedBy: [] });
        expect(await createApprovalFunctionActions(rpcClient).deleteIfUnused("addToCartApproval")).toBe(true);
        expect(deleteByComponentInfo).toHaveBeenCalledWith({
            filePath: "/p/agents.bal",
            component: {
                name: "addToCartApproval", filePath: "/p/agents.bal",
                startLine: 3, startColumn: 0, endLine: 5, endColumn: 1, resources: [],
            },
        });
    });

    it("keeps an approval function another tool still uses", async () => {
        const { rpcClient, deleteByComponentInfo } = fakeRpcClient(() => ["sharedApproval"], { usedBy: ["refundTool"] });
        expect(await createApprovalFunctionActions(rpcClient).deleteIfUnused("sharedApproval")).toBe(false);
        expect(deleteByComponentInfo).not.toHaveBeenCalled();
    });

    it("keeps an approval function something else still calls", async () => {
        const { rpcClient, deleteByComponentInfo } = fakeRpcClient(() => ["isHighValue"],
            { usedBy: [], referencedElsewhere: true });
        expect(await createApprovalFunctionActions(rpcClient).deleteIfUnused("isHighValue")).toBe(false);
        expect(deleteByComponentInfo).not.toHaveBeenCalled();
    });

    it("keeps the function when the language server can't say what else refers to it", async () => {
        const { rpcClient, deleteByComponentInfo } = fakeRpcClient(() => ["addToCartApproval"],
            { usedBy: [], referencedElsewhere: null });
        expect(await createApprovalFunctionActions(rpcClient).deleteIfUnused("addToCartApproval")).toBe(false);
        expect(deleteByComponentInfo).not.toHaveBeenCalled();
    });

    it("does nothing when the function is already gone", async () => {
        const { rpcClient, deleteByComponentInfo } = fakeRpcClient(() => [], { usedBy: [] });
        expect(await createApprovalFunctionActions(rpcClient).deleteIfUnused("addToCartApproval")).toBe(false);
        expect(deleteByComponentInfo).not.toHaveBeenCalled();
    });

    it("reads a tool's approval function as the language server reports it", async () => {
        const { rpcClient } = fakeRpcClient(() => ["addToCart"], { approvalFunction: "addToCartApproval" });
        const actions = createApprovalFunctionActions(rpcClient);
        expect(await actions.approvalFunctionOfTool("addToCart", "agents.bal", "/p")).toBe("addToCartApproval");
    });

    it("reads the tool from the file it lives in, not the agent's file", async () => {
        const { rpcClient, getFunctionNode } = fakeRpcClient(() => ["addToCart"], {
            approvalFunction: "addToCartApproval",
        });
        const actions = createApprovalFunctionActions(rpcClient);
        expect(await actions.approvalFunctionOfTool("addToCart", "agents.bal", "/p")).toBe("addToCartApproval");
        expect(getFunctionNode).toHaveBeenCalledWith(expect.objectContaining({ fileName: "/p/agents.bal" }));
    });

    it("falls back to the agent's file when the tool can't be located", async () => {
        const { rpcClient, getFunctionNode } = fakeRpcClient(() => [], { approvalFunction: "addToCartApproval" });
        await createApprovalFunctionActions(rpcClient).approvalFunctionOfTool("addToCart", "agents.bal", "/p");
        expect(getFunctionNode).toHaveBeenCalledWith(expect.objectContaining({ fileName: "agents.bal" }));
    });

    it("reads no approval function when the language server reports none", async () => {
        // An unconditional gate, a qualified reference and an inline function are all reported without one.
        const { rpcClient } = fakeRpcClient(() => ["addToCart"]);
        const actions = createApprovalFunctionActions(rpcClient);
        expect(await actions.approvalFunctionOfTool("addToCart", "agents.bal", "/p")).toBeUndefined();
    });
});
