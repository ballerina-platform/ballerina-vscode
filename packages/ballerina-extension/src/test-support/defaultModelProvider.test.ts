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

/**
 * @jest-environment node
 *
 * The webview writes the WSO2 default provider's Config.toml entries exactly when the language
 * server declared that provider. Getting this wrong is silent in both directions: skip the write
 * and running the agent fails with "ballerina.ai.wso2ProviderConfig is not configured correctly";
 * do it needlessly and the user is asked to sign in for a provider nothing uses.
 */

import { declaresDefaultModelProvider } from "../rpc-managers/bi-diagram/defaultModelProvider";

const edit = (newText: string) => ({
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    newText,
});

describe("declaresDefaultModelProvider", () => {
    it("reports the declaration the LS writes for the shared default provider", () => {
        expect(
            declaresDefaultModelProvider({
                "workflow.bal": [
                    edit(
                        "final ai:Wso2ModelProvider wso2ModelProvider = check ai:getDefaultModelProvider();\n" +
                            "final workflow:DurableAgent expenseAgent = check new ({});"
                    ),
                ],
            })
        ).toBe(true);
    });

    it("does not depend on the ai module's import prefix", () => {
        expect(
            declaresDefaultModelProvider({
                "workflow.bal": [
                    edit("final wso2ai:Wso2ModelProvider p = check wso2ai:getDefaultModelProvider();"),
                ],
            })
        ).toBe(true);
    });

    it("reports nothing when the agent reuses an existing provider", () => {
        expect(
            declaresDefaultModelProvider({
                "workflow.bal": [
                    edit("import ballerina/workflow;"),
                    edit("final workflow:DurableAgent expenseAgent = check new ({\n    model: claimModel\n});"),
                ],
            })
        ).toBe(false);
    });

    it("reports nothing for a provider built against the user's own endpoint", () => {
        // Same type, but no getDefaultModelProvider() call: it carries its own URL and token, so
        // Config.toml has nothing to supply.
        expect(
            declaresDefaultModelProvider({
                "agent.bal": [
                    edit('final ai:Wso2ModelProvider claimModel = check new ("http://localhost:9099", "tok");'),
                ],
            })
        ).toBe(false);
    });

    it("finds the declaration whichever file it lands in", () => {
        expect(
            declaresDefaultModelProvider({
                "main.bal": [edit("import ballerina/workflow;")],
                "providers.bal": [edit("final ai:Wso2ModelProvider p = check ai:getDefaultModelProvider();")],
            })
        ).toBe(true);
    });

    it("treats missing or empty edits as no declaration", () => {
        expect(declaresDefaultModelProvider(undefined)).toBe(false);
        expect(declaresDefaultModelProvider({})).toBe(false);
        expect(declaresDefaultModelProvider({ "main.bal": [] })).toBe(false);
    });
});
