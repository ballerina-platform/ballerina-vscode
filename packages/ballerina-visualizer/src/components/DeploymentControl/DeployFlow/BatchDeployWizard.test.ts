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

jest.mock("@wso2/ballerina-core", () => ({ __esModule: true, DIRECTORY_MAP: { AGENT: "AGENT" } }));
jest.mock("@wso2/ballerina-rpc-client", () => ({ __esModule: true }));
jest.mock("@wso2/ui-toolkit", () => ({ __esModule: true }));
jest.mock("@vscode/webview-ui-toolkit/react", () => ({ __esModule: true }));
jest.mock("../../../views/BI/PackageOverview/utils", () => ({
    __esModule: true,
    getIntegrationTypes: (project: { http?: boolean }) => (project.http ? ["integration-as-api"] : []),
}));
jest.mock("../shared", () => ({ __esModule: true }));
jest.mock("../AgentManagerConfigFields", () => ({ __esModule: true, Muted: "span" }));
jest.mock("./DeployWizard", () => ({ __esModule: true, BUILT_LABELS: {} }));
jest.mock("./deployBackend", () => ({ __esModule: true, isRunning: (status?: { run?: { live: boolean } }) => !!status?.run && !status.run.live }));

import type { DeploySource, DeployStatus } from "./deployBackend";
import { batchPackages, batchTag, mergePrepItems } from "./BatchDeployWizard";

const source = (prepItems: DeploySource["prepItems"]): DeploySource => ({ branches: [], branch: "main", prepItems, changedFiles: 0, unpushedCommits: 0 });
const prep = (id: string, done: boolean) => ({ id, label: id, detail: "", done });

describe("mergePrepItems", () => {
    it("lists each change once with the packages that need it", () => {
        const merged = mergePrepItems(["A", "B"], [
            source([prep("openapi", false), prep("gitignore", false), prep("tracing", true)]),
            source([prep("openapi", false), prep("gitignore", true), prep("tracing", true)]),
        ]);
        expect(merged.map(({ id, done, for: needs }) => ({ id, done, needs }))).toEqual([
            { id: "openapi", done: false, needs: ["A", "B"] },
            { id: "gitignore", done: false, needs: ["A"] },
            { id: "tracing", done: true, needs: [] },
        ]);
    });
});

describe("batchTag", () => {
    const deployed = { signedIn: true, deployed: {} } as DeployStatus;
    const running = { signedIn: true, run: { live: false, steps: [] } } as DeployStatus;
    const idle = { signedIn: true } as DeployStatus;

    it("names the deploy state across packages", () => {
        expect(batchTag(new Map([["a", running], ["b", deployed]]))).toBe("Deploying");
        expect(batchTag(new Map([["a", deployed], ["b", idle]]))).toBe("1 of 2 Deployed");
        expect(batchTag(new Map([["a", deployed]]))).toBe("Deployed");
        expect(batchTag(new Map([["a", idle]]))).toBeUndefined();
    });
});

describe("batchPackages", () => {
    it("skips libraries and packages with nothing to deploy", () => {
        const project = (name: string, extra: object) => ({ projectName: name, projectPath: `/w/${name}`, directoryMap: {}, ...extra });
        const packages = batchPackages({
            projects: [
                project("agent", { directoryMap: { AGENT: [{}] } }),
                project("api", { http: true }),
                project("empty", {}),
                project("lib", { isLibrary: true, http: true }),
            ],
        } as never);
        expect(packages.map(({ title, isAgent, skipReason }) => ({ title, isAgent, skipReason }))).toEqual([
            { title: "agent", isAgent: true, skipReason: undefined },
            { title: "api", isAgent: false, skipReason: undefined },
            { title: "empty", isAgent: false, skipReason: "No Agents" },
            { title: "lib", isAgent: false, skipReason: "Library" },
        ]);
    });
});
