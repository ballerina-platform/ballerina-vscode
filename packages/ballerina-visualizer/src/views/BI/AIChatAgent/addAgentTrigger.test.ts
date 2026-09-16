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

// The core barrel and the rpc client pull in an ES-module LS client jest cannot parse, and utils.ts needs the form
// helpers; only the trigger opener is under test, so every other export is an empty stand-in.
const EVENT_TYPE = { OPEN_VIEW: "OPEN_VIEW" };
const MACHINE_VIEW = { BIAddAgentTrigger: "Add Agent Trigger" };
jest.mock("@wso2/ballerina-core", () =>
    new Proxy({ EVENT_TYPE, MACHINE_VIEW, TRIGGER_CHARACTERS: [], __esModule: true }, { get: (target, key) => (key in target ? target[key as keyof typeof target] : {}) })
);
jest.mock("../../../constants", () => ({ BALLERINA: "ballerina" }));
jest.mock("@wso2/ballerina-rpc-client", () => ({}));
jest.mock("@wso2/ballerina-side-panel", () => ({}));
jest.mock("../../../utils/bi", () => ({ convertNodePropertyToFormField: jest.fn() }));
jest.mock("./toolForm", () => ({ OAUTH_GROUP: "oauth" }));

import { agentKindOf, agentVarNameOf, openAddAgentTrigger, startAddDurableEventTrigger } from "./utils";

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
