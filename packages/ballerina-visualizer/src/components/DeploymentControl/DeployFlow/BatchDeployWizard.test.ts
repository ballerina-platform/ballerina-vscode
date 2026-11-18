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
jest.mock("@wso2/wso2-platform-core", () => ({ __esModule: true, getIntegrationScopeText: (scope: string) => ({ "mcp-server": "MCP Server" })[scope] ?? "Integration as API" }));
jest.mock("../../../views/BI/PackageOverview/utils", () => ({
    __esModule: true,
    getIntegrationTypes: (project: { http?: boolean; mcp?: boolean }) => [...(project.mcp ? ["mcp-server", "automation"] : []), ...(project.http ? ["integration-as-api"] : [])],
}));
jest.mock("../shared", () => ({ __esModule: true }));
jest.mock("../AgentManagerConfigFields", () => ({ __esModule: true, Muted: "span" }));
jest.mock("./DeployWizard", () => ({ __esModule: true, BUILT_LABELS: {}, NEW_PROJECT: "__new_project__", folderName: (folder: string) => folder.split("/").pop() }));
jest.mock("./deployBackend", () => ({ __esModule: true, isRunning: (status?: { run?: { live: boolean } }) => !!status?.run && !status.run.live }));

import type { ProjectStructureResponse } from "@wso2/ballerina-core";
import type { DeployBackend, DeploySource, DeployStatus } from "./deployBackend";
import type { ConfigureValues } from "./DeployWizard";
import { batchPackages, batchTag, deployEach, mergePrepItems, mergeSources } from "./BatchDeployWizard";

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

describe("mergeSources", () => {
    const pkgs = [{ title: "A", projectPath: "/w/a" }, { title: "B", projectPath: "/w/b" }];
    it("is missing from GitHub when any package is, and keeps the first blocker", () => {
        const blocker = { message: "Not on a branch." };
        expect(mergeSources(pkgs, [source([]), { ...source([]), missingOnRemote: true, blocker }])).toMatchObject({ missingOnRemote: true, blocker });
    });

    it("lists only changes outside every package, and each package's Config.toml notes under its folder", () => {
        const merged = mergeSources(pkgs, [
            { ...source([]), otherChanges: ["Ballerina.toml", "b/extra.bal"], keptOut: ["Config.toml"], changedConfigs: ["tests/Config.toml"] },
            { ...source([]), otherChanges: ["Ballerina.toml", "a/Config.toml"], keptOut: [] },
        ]);
        expect(merged).toMatchObject({ otherChanges: ["Ballerina.toml"], keptOut: ["a/Config.toml"], changedConfigs: ["a/tests/Config.toml"] });
    });
});

describe("deployEach", () => {
    const items = ["a", "b", "c"].map((name) => ({ projectPath: `/w/${name}`, title: name, isAgent: true, typeLabel: "AI Agent" }));
    const input = { values: { project: "__new_project__", newProject: "Orders " } as unknown as ConfigureValues, names: ["a", "b", "c"], types: ["", "", ""] };
    const deployWith = async (projects: { name: string; displayName: string }[]) => {
        const projectsUsed: string[] = [];
        const backend = {
            deploy: async (_target: string, path: string, request: { project: string }) => {
                projectsUsed.push(request.project);
                if (path === "/w/a") {
                    throw new Error("Build failed.");
                }
            },
            getForm: async () => ({ projects }),
        };
        let run = { paths: items.map((item) => item.projectPath), started: [] as string[], done: [] as string[], errors: {} as Record<string, string> };
        await deployEach(backend as unknown as DeployBackend, items, input, (update) => { run = update(run); });
        return { projectsUsed, errors: run.errors };
    };

    it("deploys the rest into the new project when it was created before the first deploy failed", async () => {
        const { projectsUsed, errors } = await deployWith([{ name: "orders-id", displayName: "Orders" }]);
        expect(projectsUsed).toEqual(["Orders", "orders-id", "orders-id"]);
        expect(Object.keys(errors)).toEqual(["/w/a"]);
    });

    it("gives the rest the first deploy's error when the project was not created", async () => {
        const { projectsUsed, errors } = await deployWith([]);
        expect(projectsUsed).toHaveLength(1);
        expect(errors).toEqual({ "/w/a": "Build failed.", "/w/b": "Build failed.", "/w/c": "Build failed." });
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
                project("mcp", { mcp: true }),
                project("empty", {}),
                project("lib", { isLibrary: true, http: true }),
            ],
        } as unknown as ProjectStructureResponse);
        expect(packages.map(({ title, typeLabel, skipReason }) => ({ title, typeLabel, skipReason }))).toEqual([
            { title: "agent", typeLabel: "AI Agent", skipReason: undefined },
            { title: "api", typeLabel: "Integration as API", skipReason: undefined },
            { title: "mcp", typeLabel: "MCP Server", skipReason: undefined },
            { title: "empty", typeLabel: "Integration", skipReason: "Nothing to Deploy" },
            { title: "lib", typeLabel: "Integration as API", skipReason: "Library" },
        ]);
    });
});
