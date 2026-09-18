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

import type { FlowNode } from "@wso2/ballerina-core";
import type { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";

const EVENT_TYPE = { OPEN_VIEW: "OPEN_VIEW" };
const MACHINE_VIEW = { BIAddAgentTrigger: "Add Agent Trigger" };
const isAgentDeclarationNode = (kind?: string) => kind === "AGENT" || kind === "TYPED_AGENT";
jest.mock("@wso2/ballerina-core", () =>
    new Proxy(
        { EVENT_TYPE, MACHINE_VIEW, TRIGGER_CHARACTERS: [], isAgentDeclarationNode, __esModule: true },
        { get: (target, key) => (key in target ? target[key as keyof typeof target] : {}) }
    )
);
jest.mock("../../../constants", () => ({ BALLERINA: "ballerina" }));
jest.mock("@wso2/ballerina-rpc-client", () => ({}));
jest.mock("@wso2/ballerina-side-panel", () => ({}));
jest.mock("../../../utils/bi", () => ({ convertNodePropertyToFormField: jest.fn() }));
jest.mock("./toolForm", () => ({ OAUTH_GROUP: "oauth" }));

import { agentKindOf, agentVarNameOf, openAddAgentTrigger, startAddAgentTrigger, startAddDurableEventTrigger } from "./utils";

function rpcWithOpenView() {
    const openView = jest.fn();
    const rpcClient = { getVisualizerRpcClient: () => ({ openView }) } as unknown as BallerinaRpcClient;
    return { rpcClient, openView };
}

describe("openAddAgentTrigger", () => {
    it("tells the trigger form which kind of agent it is wiring, so a durable agent gets the instance call shape", () => {
        const { rpcClient, openView } = rpcWithOpenView();
        openAddAgentTrigger(rpcClient, "claimAgent", "ballerina", "durable");
        expect(openView).toHaveBeenCalledWith({
            type: EVENT_TYPE.OPEN_VIEW,
            isPopup: true,
            location: { view: MACHINE_VIEW.BIAddAgentTrigger, artifactInfo: { agentName: "claimAgent", agentOrgName: "ballerina", agentKind: "durable" } },
        });
    });

    it("leaves the kind out for an AI agent, whose org already decides the call operator", () => {
        const { rpcClient, openView } = rpcWithOpenView();
        openAddAgentTrigger(rpcClient, "faqAgent", "ballerina");
        expect(openView.mock.calls[0][0].location.artifactInfo).toEqual({ agentName: "faqAgent", agentOrgName: "ballerina", agentKind: undefined });
    });

    it("reads the kind off the flow node: only the durable agent box is durable", () => {
        expect(agentKindOf({ codedata: { node: "DURABLE_AGENT_RUN" } } as unknown as FlowNode)).toBe("durable");
        expect(agentKindOf({ codedata: { node: "AGENT" } } as unknown as FlowNode)).toBeUndefined();
    });

    it("carries the data event's channel and declared types, so the endpoint form can seed a sendData turn", () => {
        const { rpcClient, openView } = rpcWithOpenView();
        const box = { codedata: { node: "DURABLE_AGENT_RUN" }, metadata: { data: { agentBox: true, agentName: "claimAgent" } } } as unknown as FlowNode;
        startAddDurableEventTrigger(box, { name: "chat", values: { requestType: "string", responseType: "string" } } as any, rpcClient);
        expect(openView.mock.calls[0][0].location.artifactInfo).toEqual({
            agentName: "claimAgent",
            agentOrgName: "ballerina",
            agentKind: "durable",
            agentEvent: { name: "chat", request: "string", response: "string" },
        });
    });

    it("names a durable agent from its box metadata, where the declaration form keeps it", () => {
        const box = { codedata: { node: "DURABLE_AGENT_RUN" }, metadata: { data: { agentBox: true, agentName: "claimAgent" } } } as unknown as FlowNode;
        expect(agentVarNameOf(box)).toBe("claimAgent");
        expect(agentVarNameOf({ codedata: { node: "DURABLE_AGENT_RUN" }, metadata: { data: {} } } as unknown as FlowNode)).toBe("");
    });
});

describe("startAddAgentTrigger", () => {
    it("forces the durable agent's org to ballerina, ignoring the node's own org", () => {
        const { rpcClient, openView } = rpcWithOpenView();
        const box = {
            codedata: { node: "DURABLE_AGENT_RUN", org: "someOtherOrg" },
            metadata: { data: { agentBox: true, agentName: "claimAgent" } },
        } as unknown as FlowNode;
        startAddAgentTrigger(box, rpcClient);
        expect(openView.mock.calls[0][0].location.artifactInfo).toEqual({
            agentName: "claimAgent",
            agentOrgName: "ballerina",
            agentKind: "durable",
            agentEvent: undefined,
        });
    });

    it("uses the node's own org for a non-durable agent", () => {
        const { rpcClient, openView } = rpcWithOpenView();
        const node = {
            codedata: { node: "AGENT", org: "wso2" },
            properties: { variable: { value: "faqAgent" } },
        } as unknown as FlowNode;
        startAddAgentTrigger(node, rpcClient);
        expect(openView.mock.calls[0][0].location.artifactInfo).toEqual({
            agentName: "faqAgent",
            agentOrgName: "wso2",
            agentKind: undefined,
            agentEvent: undefined,
        });
    });

    it("does nothing when the agent variable name can't be resolved", () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        const { rpcClient, openView } = rpcWithOpenView();
        const node = { codedata: { node: "AGENT", org: "wso2" }, properties: {} } as unknown as FlowNode;
        startAddAgentTrigger(node, rpcClient);
        expect(openView).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
