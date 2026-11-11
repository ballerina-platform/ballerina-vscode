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
// package-root resolution). The real `@wso2/ballerina-core`/`../../utils` barrels pull in a
// WebSocket LS client and vscode status-bar calls that jest cannot load, so both are stubbed;
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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { window } from "vscode";
import { StateMachine } from "../stateMachine";
import { copyIntoIntegration, resolveIntegrationRoot } from "../rpc-managers/common/utils";

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
