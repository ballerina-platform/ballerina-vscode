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

import { extractRequirementsDocument } from "../features/ai/agent/np/requirements";
import { REQ_KEY } from "../rpc-managers/ai-panel/constants";

const pkg = (name: string, isActive: boolean, requirements?: string) => ({
    projectName: name,
    packagePath: name,
    isActive,
    sourceFiles: [
        { filePath: "main.bal", content: "public function main() {}" },
        ...(requirements === undefined ? [] : [{ filePath: REQ_KEY, content: requirements }]),
    ],
}) as any;

describe("extractRequirementsDocument", () => {
    it("returns the requirements of a single package", () => {
        expect(extractRequirementsDocument([pkg("a", false, "Orders must be stored.")])).toBe("Orders must be stored.");
    });

    it("prefers the active package in a workspace", () => {
        const projects = [pkg("a", false, "A's requirements"), pkg("b", true, "B's requirements")];
        expect(extractRequirementsDocument(projects)).toBe("B's requirements");
    });

    it("falls back to another package only when the active one has no entry", () => {
        expect(extractRequirementsDocument([pkg("a", false, "A's requirements"), pkg("b", true)])).toBe("A's requirements");
        expect(extractRequirementsDocument([pkg("a", false, "A's requirements"), pkg("b", true, "")])).toBe("");
    });

    it("returns nothing when no package has requirements", () => {
        expect(extractRequirementsDocument([pkg("a", true)])).toBe("");
        expect(extractRequirementsDocument([])).toBe("");
    });
});
