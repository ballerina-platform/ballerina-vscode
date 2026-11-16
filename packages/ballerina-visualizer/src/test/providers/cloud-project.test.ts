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

import type { PlatformExtState } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { hasCloudProject } from "../../providers/cloud-project";

const state = (selectedContext?: Record<string, unknown>, isLoggedIn = true) =>
    ({ isLoggedIn, selectedContext, integrations: [], session: null }) as unknown as PlatformExtState;

describe("hasCloudProject", () => {
    it("takes a linked project by its name, before its details are known", () => {
        expect(hasCloudProject(state({ projectName: "shop", orgHandle: "acme", contextDirs: [] }))).toBe(true);
    });

    it("needs a sign-in and a project of the signed-in organization that exists", () => {
        expect(hasCloudProject(state({ projectName: "shop" }, false))).toBe(false);
        expect(hasCloudProject(state(undefined))).toBe(false);
        expect(hasCloudProject(state({ projectName: "shop", foreignOrg: true }))).toBe(false);
        expect(hasCloudProject(state({ projectName: "shop", local: true }))).toBe(false);
        expect(hasCloudProject(undefined)).toBe(false);
    });
});
