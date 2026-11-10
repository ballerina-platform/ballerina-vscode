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

// The [package] edits behind Publish to Central, on LF and CRLF Ballerina.toml text.

jest.mock("@wso2/ballerina-core", () => ({}));
jest.mock("unzipper", () => ({}));
jest.mock("../features/ai/state/AgentStatusManager", () => ({ agentStatusManager: {} }));
jest.mock("../BalExtensionContext", () => ({ extension: {} }));
jest.mock("../stateMachine", () => ({ StateMachine: {} }));
jest.mock("../utils", () => ({}));
jest.mock("../utils/bi", () => ({}));
jest.mock("../rpc-managers/common/utils", () => ({}));
jest.mock("../views/visualizer/webview", () => ({}));

import { CommonRpcManager } from "../rpc-managers/common/rpc-manager";

const manager = Object.create(CommonRpcManager.prototype) as any;
const details = (visibility: string) => ({ orgName: "a", packageName: "b", version: "1.0.0", visibility });
const crlf = (text: string) => text.replace(/\n/g, "\r\n");

const TOML = '# comment\n\n[package]\norg = "a"\nname = "b"\nversion = "0.1.0"\nvisibility = "private"\n\n[build-options]\nobservabilityIncluded = true\n';

describe.each([["LF", (text: string) => text], ["CRLF", crlf]])("[package] edits on %s text", (_, eol) => {
    it("updates a field in place", () => {
        expect(manager.updatePackageDetails(eol(TOML), details("private")))
            .toBe(eol(TOML.replace('version = "0.1.0"', 'version = "1.0.0"')));
    });

    it("removes a field with its line break", () => {
        expect(manager.updatePackageDetails(eol(TOML), details("public")))
            .toBe(eol(TOML.replace('version = "0.1.0"\nvisibility = "private"\n', 'version = "1.0.0"\n')));
    });

    it("inserts a field under the header when lines sit above [package]", () => {
        const before = TOML.replace('visibility = "private"\n', "");
        expect(manager.updatePackageDetails(eol(before), details("private")))
            .toBe(eol(before.replace("[package]\n", '[package]\nvisibility = "private"\n').replace("0.1.0", "1.0.0")));
    });

    it("adds the Type/Agent keyword without touching the next line", () => {
        const before = TOML.replace("[package]\n", '[package]\nkeywords = ["ai"]\n');
        expect(manager.updateAgentDefinitionKeyword(eol(before), true))
            .toBe(eol(before.replace('["ai"]', '["ai", "Type/Agent"]')));
    });

    it("inserts the keywords field under the header", () => {
        expect(manager.updateAgentDefinitionKeyword(eol(TOML), true))
            .toBe(eol(TOML.replace("[package]\n", '[package]\nkeywords = ["Type/Agent"]\n')));
    });
});
