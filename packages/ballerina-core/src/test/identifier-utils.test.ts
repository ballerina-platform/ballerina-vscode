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

import { DevantScopes } from "@wso2/wso2-platform-core";
import { SCOPE } from "../interfaces/shared-types";
import { findDevantScope } from "../rpc-types/platform-ext/utils";
import { findScope } from "../utils/identifier-utils";

describe("metadata-driven integration scope", () => {
    it.each([
        ["event", SCOPE.EVENT_INTEGRATION],
        ["file", SCOPE.FILE_INTEGRATION],
        ["http", SCOPE.INTEGRATION_AS_API],
        ["graphql", SCOPE.INTEGRATION_AS_API],
        ["ai", SCOPE.AI_AGENT],
        ["mcp", SCOPE.MCP],
    ])("maps a new %s connector without a module allowlist", (triggerKind, expected) => {
        expect(findScope(triggerKind, "new.connector.not.in.any.allowlist")).toBe(expected);
    });

    it("keeps module fallback behavior for legacy responses", () => {
        expect(findScope(undefined, "kafka")).toBe(SCOPE.EVENT_INTEGRATION);
        expect(findScope(undefined, "ftp")).toBe(SCOPE.FILE_INTEGRATION);
        expect(findScope(undefined, "tcp")).toBe(SCOPE.INTEGRATION_AS_API);
    });

    it.each([
        ["event", DevantScopes.EVENT_INTEGRATION],
        ["file", DevantScopes.FILE_INTEGRATION],
        ["http", DevantScopes.INTEGRATION_AS_API],
    ])("routes a new %s connector for deployment using only triggerKind", (triggerKind, expected) => {
        expect(findDevantScope(triggerKind, "new.connector.not.in.any.allowlist")).toBe(expected);
    });
});
