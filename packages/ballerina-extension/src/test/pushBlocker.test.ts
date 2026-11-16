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

jest.mock("@wso2/ballerina-core", () => ({ __esModule: true }));
jest.mock("../features/agent-manager/client", () => ({ __esModule: true, api: {} }));

import { pushBlocker, SourceFacts } from "../features/agent-manager/github";

const facts = (overrides: Partial<SourceFacts>): SourceFacts => ({ ahead: 0, dirty: 0, hasRemotes: true, gitMissing: false, ...overrides });

describe("What keeps the source from being pushed", () => {
    it("names the first thing to resolve, with its action", () => {
        expect(pushBlocker(facts({ gitMissing: true }))?.id).toBe("gitMissing");
        expect(pushBlocker(facts({ hasRemotes: false }))).toMatchObject({ id: "publishRepo", actionLabel: "Publish to GitHub" });
        expect(pushBlocker(facts({ hasRemotes: true }))?.id).toBe("nonGitHub");
        expect(pushBlocker(facts({ repository: "acme/agent" }))?.id).toBe("detached");
    });

    it("is nothing for a branch of a GitHub repository, pushed or not", () => {
        expect(pushBlocker(facts({ repository: "acme/agent", branch: "main", dirty: 3, ahead: 1 }))).toBeUndefined();
    });
});
