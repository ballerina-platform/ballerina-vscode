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

// L1 (contract) — `selectProjectRelativeFile`'s host-side helpers: `copyIntoIntegration`
// (the copy-into-`<root>/<targetDir>` behavior backing the RPC, including the traversal
// guard added for a hostile `targetDir`) and `resolveIntegrationRoot` (its walk-up/walk-down
// package-root resolution), plus `isPathInsideProject`, the case/symlink-tolerant containment
// check `selectFileOrDirPath` uses to tell whether a picked file is already in the project.
// The real `@wso2/ballerina-core`/`../../utils` barrels pull in a WebSocket LS client and
// vscode status-bar calls that jest cannot load, so both are stubbed;
// `isPathInside` is re-implemented minimally here (trailing-slash-agnostic prefix check) to
// exercise the real traversal-guard logic under test.

const packageRoots = new Map<string, string>();
const workspacePackages = new Map<string, string[]>();

jest.mock("../stateMachine", () => ({
    StateMachine: { context: jest.fn() },
}));

jest.mock("../utils", () => ({
    checkIsBallerinaPackage: jest.fn(async (uri: { fsPath: string }) => packageRoots.get(uri.fsPath) === uri.fsPath),
    checkIsBallerinaWorkspace: jest.fn(async () => false),
    findBallerinaPackageRoot: jest.fn(async (filePath: string) => packageRoots.get(filePath) ?? null),
    getBallerinaPackages: jest.fn(async (uri: { fsPath: string }) => workspacePackages.get(uri.fsPath) ?? []),
    hasMultipleBallerinaPackages: jest.fn(async () => false),
}));

jest.mock("../rpc-managers/bi-diagram/utils", () => ({
    readOrWriteReadmeContent: jest.fn(),
    resolveReadmePath: jest.fn(),
}));

jest.mock("../utils/bi", () => ({
    README_FILE: "PACKAGE.md",
}));

jest.mock("@wso2/ballerina-core", () => ({
    PROJECT_KIND: {},
    isSamePath: (a?: string | null, b?: string | null) => a === b,
    isPathInside: (parent?: string | null, child?: string | null) => {
        if (!parent || !child) {
            return false;
        }
        const normalize = (p: string) => p.replace(/[\\/]+$/, "");
        const normalizedParent = normalize(parent);
        const normalizedChild = normalize(child);
        if (normalizedChild === normalizedParent) {
            return true;
        }
        return normalizedChild.startsWith(`${normalizedParent}/`) || normalizedChild.startsWith(`${normalizedParent}\\`);
    },
}));

import { loadFixtures } from "@wso2/test-config/fixtures";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { window } from "vscode";
import { StateMachine } from "../stateMachine";
import { copyIntoIntegration, isPathInsideProject, resolveIntegrationRoot } from "../rpc-managers/common/utils";

describe("copyIntoIntegration", () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-into-integration-"));
        jest.clearAllMocks();
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("copies the file into <root>/<targetDir>", async () => {
        const src = path.join(os.tmpdir(), `sapjco3-${Date.now()}.jar`);
        fs.writeFileSync(src, "jar-bytes");
        try {
            const dest = await copyIntoIntegration(root, src, "libs");
            expect(dest).toBe(path.join(root, "libs", path.basename(src)));
            expect(fs.existsSync(dest!)).toBe(true);
        } finally {
            fs.rmSync(src, { force: true });
        }
    });

    it("rejects a targetDir that escapes the integration root", async () => {
        const src = path.join(os.tmpdir(), `sapjco3-${Date.now()}.jar`);
        fs.writeFileSync(src, "jar-bytes");
        const showErrorMessage = jest.spyOn(window, "showErrorMessage");
        try {
            const dest = await copyIntoIntegration(root, src, "../outside");
            expect(dest).toBeUndefined();
            expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("../outside"));
            // Nothing was created outside root.
            expect(fs.existsSync(path.join(path.dirname(root), "outside"))).toBe(false);
        } finally {
            fs.rmSync(src, { force: true });
            showErrorMessage.mockRestore();
        }
    });

    it("accepts a nested targetDir that stays inside the integration root", async () => {
        const src = path.join(os.tmpdir(), `sapjco3-${Date.now()}.jar`);
        fs.writeFileSync(src, "jar-bytes");
        try {
            const dest = await copyIntoIntegration(root, src, "libs/nested");
            expect(dest).toBe(path.join(root, "libs", "nested", path.basename(src)));
            expect(fs.existsSync(dest!)).toBe(true);
        } finally {
            fs.rmSync(src, { force: true });
        }
    });
});

describe("resolveIntegrationRoot", () => {
    beforeEach(() => {
        packageRoots.clear();
        workspacePackages.clear();
        jest.clearAllMocks();
    });

    it("returns the project path directly when it is itself a package root", async () => {
        (StateMachine.context as jest.Mock).mockReturnValue({ projectPath: "/ws/project" });
        packageRoots.set("/ws/project", "/ws/project");
        expect(await resolveIntegrationRoot()).toBe("/ws/project");
    });

    it("walks up to an ancestor package root when projectPath is nested inside one", async () => {
        (StateMachine.context as jest.Mock).mockReturnValue({ projectPath: "/ws/project/modules/foo" });
        packageRoots.set("/ws/project/modules/foo", "/ws/project");
        expect(await resolveIntegrationRoot()).toBe("/ws/project");
    });

    it("walks down to the sole package when projectPath is a multi-package workspace folder", async () => {
        (StateMachine.context as jest.Mock).mockReturnValue({ projectPath: "/ws" });
        workspacePackages.set("/ws", ["/ws/project-a"]);
        expect(await resolveIntegrationRoot()).toBe("/ws/project-a");
    });

    it("returns undefined when the workspace folder contains more than one package", async () => {
        (StateMachine.context as jest.Mock).mockReturnValue({ projectPath: "/ws" });
        workspacePackages.set("/ws", ["/ws/project-a", "/ws/project-b"]);
        expect(await resolveIntegrationRoot()).toBeUndefined();
    });

    it("returns undefined when there is no project path", async () => {
        (StateMachine.context as jest.Mock).mockReturnValue({ projectPath: undefined });
        expect(await resolveIntegrationRoot()).toBeUndefined();
    });
});

// Containment invariant over fixtures/path-containment/: for every layout, `isPathInsideProject`
// gives the expected answer. Seeds `tree` (files) and `symlinks` (link -> target) under a temp
// dir; `spellings` maps an alternate spelling to its on-disk path by stubbing
// `fs.realpathSync.native`, so a case-insensitive filesystem (wso2/product-integrator#1476, where
// a schema already inside the project triggered the "move it inside the project?" prompt) is
// exercised deterministically on case-sensitive CI runners too. Paths are "/"-separated and
// relative to the temp dir.
interface PathContainmentFixture {
    description?: string;
    tree: string[];
    symlinks?: Record<string, string>;
    spellings?: Record<string, string>;
    projectPath: string;
    filePath: string;
    expectedInside: boolean;
}

const containmentFixtures = loadFixtures<PathContainmentFixture>(__dirname, "fixtures", "path-containment");

describe("isPathInsideProject — fixtures", () => {
    let base: string;
    const at = (rel: string): string => path.join(base, ...rel.split("/"));

    beforeEach(() => {
        base = fs.mkdtempSync(path.join(os.tmpdir(), "inside-project-"));
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(base, { recursive: true, force: true });
    });

    it("has fixtures to run", () => {
        expect(containmentFixtures.length).toBeGreaterThan(0);
    });

    it.each(containmentFixtures.map((f) => [f.name, f.data] as [string, PathContainmentFixture]))("%s", (_name, fx) => {
        for (const rel of fx.tree) {
            fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
            fs.writeFileSync(at(rel), "x");
        }
        for (const [link, target] of Object.entries(fx.symlinks ?? {})) {
            // A junction needs no privilege on Windows, where a "dir" symlink throws EPERM.
            fs.symlinkSync(at(target), at(link), process.platform === "win32" ? "junction" : "dir");
        }
        const spellings = Object.entries(fx.spellings ?? {}).map(([alias, onDisk]) => [at(alias), at(onDisk)]);
        if (spellings.length > 0) {
            const realpath = fs.realpathSync.native;
            jest.spyOn(fs.realpathSync, "native").mockImplementation(((p: fs.PathLike) => {
                const match = spellings.find(([alias]) => String(p) === alias || String(p).startsWith(alias + path.sep));
                return realpath(match ? match[1] + String(p).slice(match[0].length) : p);
            }) as typeof fs.realpathSync.native);
        }

        expect(isPathInsideProject(at(fx.projectPath), at(fx.filePath))).toBe(fx.expectedInside);
    });

    // The same #1476 layout against the real filesystem, where the platform folds case itself.
    const caseInsensitive = fs.existsSync(os.tmpdir().toUpperCase());
    (caseInsensitive ? it : it.skip)("treats a project path differing only in letter case as inside", () => {
        fs.mkdirSync(at("graphqlintegration"));
        fs.writeFileSync(at("graphqlintegration/schema.graphql"), "x");
        expect(isPathInsideProject(at("graphQLIntegration"), at("graphqlintegration/schema.graphql"))).toBe(true);
    });
});
