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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { isAllowedProjectPath, isReadableProjectFile, listProjectFiles } from "../features/ai/agent/tools/project-files";

let root: string;
let outside: string;

function write(rel: string, content = "x"): void {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "project-files-"));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), "project-files-outside-"));
    for (const rel of [
        "Ballerina.toml", "main.bal", "Config.toml", "tests/Config.toml", "tests/main_test.bal",
        "modules/db/db.bal", "resources/openapi.yaml", "data.csv", ".env", ".mcp.json", ".wso2/mcp.json",
        ".git/config.toml", "target/bin/out.bal", ".history/main.bal",
        ".agents/skills/x/SKILL.md", ".agents/.env.json",
    ]) {
        write(rel);
    }
    fs.writeFileSync(path.join(outside, "secret.bal"), "x");
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
});

describe("listProjectFiles", () => {
    it("lists only files the agent may read", async () => {
        expect(await listProjectFiles(root, { pattern: "**" })).toEqual([
            "Ballerina.toml",
            "main.bal",
            "modules/db/db.bal",
            "resources/openapi.yaml",
            "tests/main_test.bal",
        ]);
    });

    it("reaches project skills through an explicit .agents pattern", async () => {
        expect(await listProjectFiles(root, { pattern: ".agents/**" })).toEqual([".agents/skills/x/SKILL.md"]);
        expect(await listProjectFiles(root, { path: ".agents" })).toEqual([".agents/skills/x/SKILL.md"]);
    });

    it("keeps dotfiles out even when named outright", async () => {
        expect(await listProjectFiles(root, { pattern: ".*" })).toEqual([]);
        expect(await listProjectFiles(root, { pattern: "{main.bal,.env,.mcp.json}" })).toEqual(["main.bal"]);
        expect(await listProjectFiles(root, { pattern: ".wso2/*" })).toEqual([]);
    });

    it("puts the path back in front of results", async () => {
        expect(await listProjectFiles(root, { path: "modules", pattern: "**/*.bal" })).toEqual(["modules/db/db.bal"]);
    });

    it("applies the standard glob rules unless matchBase is set", async () => {
        expect(await listProjectFiles(root, { pattern: "*.bal" })).toEqual(["main.bal"]);
        expect(await listProjectFiles(root, { pattern: "*.bal", matchBase: true })).toEqual([
            "main.bal", "modules/db/db.bal", "tests/main_test.bal",
        ]);
    });

    it("returns a single readable file and rejects a restricted one", async () => {
        expect(await listProjectFiles(root, { path: "main.bal" })).toEqual(["main.bal"]);
        await expect(listProjectFiles(root, { path: "Config.toml" })).rejects.toThrow(/not permitted/);
        await expect(listProjectFiles(root, { path: "tests/Config.toml" })).rejects.toThrow(/not permitted/);
        await expect(listProjectFiles(root, { path: ".git" })).rejects.toThrow(/not permitted/);
        await expect(listProjectFiles(root, { path: "target" })).rejects.toThrow(/not permitted/);
    });

    it("gives the same answer for a blocked path whether it exists or not", async () => {
        await expect(listProjectFiles(root, { path: ".env" })).rejects.toThrow(/not permitted/);
        await expect(listProjectFiles(root, { path: ".envx" })).rejects.toThrow(/not permitted/);
        await expect(listProjectFiles(root, { path: "target/none" })).rejects.toThrow(/not permitted/);
    });

    it("refuses a new file under a symlinked folder that leads out", () => {
        fs.symlinkSync(outside, path.join(root, "linkdir"));
        expect(isReadableProjectFile(root, "linkdir/new.bal")).toBe(false);
        expect(isReadableProjectFile(root, "linkdir/a/b/new.bal")).toBe(false);
        expect(isReadableProjectFile(root, "modules/new/x.bal")).toBe(true);
        expect(isReadableProjectFile(root, "new.bal")).toBe(true);
    });

    it("refuses a new file whose folder is a symlink into a blocked folder", () => {
        fs.symlinkSync(path.join(root, ".wso2"), path.join(root, "cfg"));
        fs.symlinkSync(path.join(root, "target"), path.join(root, "out"));
        expect(isReadableProjectFile(root, "cfg/new.json")).toBe(false);
        expect(isReadableProjectFile(root, "out/new.bal")).toBe(false);
    });

    it("allows a new file when the project folder is not created yet", () => {
        expect(isReadableProjectFile(path.join(root, "not", "yet"), "notes.md")).toBe(true);
    });

    it("refuses a dangling symlink and anything under a dangling symlinked folder", () => {
        fs.symlinkSync(path.join(outside, "missing.bal"), path.join(root, "ghost.bal"));
        fs.symlinkSync(path.join(outside, "missing"), path.join(root, "ghostdir"));
        expect(isReadableProjectFile(root, "ghost.bal")).toBe(false);
        expect(isReadableProjectFile(root, "ghostdir/x.bal")).toBe(false);
    });

    it("rejects paths and patterns that leave the project", async () => {
        await expect(listProjectFiles(root, { path: "../" })).rejects.toThrow(/Invalid path/);
        await expect(listProjectFiles(root, { pattern: "{..,x}/a.bal" })).rejects.toThrow(/Invalid pattern/);
        await expect(listProjectFiles(root, { pattern: outside + "/*.bal" })).rejects.toThrow(/Invalid pattern/);
        await expect(listProjectFiles(root, { path: "missing" })).rejects.toThrow(/does not exist/);
    });

    it("drops matches that brace expansion sends outside the project", async () => {
        const result = await listProjectFiles(root, { pattern: `{${outside}/secret.bal,main.bal}` });
        expect(result).toEqual(["main.bal"]);
    });

    it("applies the name rule to a symlink's target", async () => {
        fs.symlinkSync(path.join(root, "Config.toml"), path.join(root, "alias.bal"));
        fs.symlinkSync(path.join(root, ".env"), path.join(root, "env.txt"));
        expect(isReadableProjectFile(root, "alias.bal")).toBe(false);
        expect(isReadableProjectFile(root, "env.txt")).toBe(false);
        expect(await listProjectFiles(root, { pattern: "*.{bal,txt}" })).toEqual(["main.bal"]);
    });

    it("drops a symlink that points out of the project", async () => {
        fs.symlinkSync(path.join(outside, "secret.bal"), path.join(root, "link.bal"));
        fs.symlinkSync(outside, path.join(root, "linkdir"));
        expect(await listProjectFiles(root, { pattern: "**/*.bal" })).toEqual([
            "main.bal", "modules/db/db.bal", "tests/main_test.bal",
        ]);
        expect(await listProjectFiles(root, { pattern: "linkdir/*.bal" })).toEqual([]);
        expect(isReadableProjectFile(root, "link.bal")).toBe(false);
        expect(isReadableProjectFile(root, "linkdir/secret.bal")).toBe(false);
    });

    it("works when the root is opened with a different case than on disk", async () => {
        const project = path.join(root, "MyProj");
        fs.mkdirSync(project);
        fs.writeFileSync(path.join(project, "main.bal"), "x");
        const variant = path.join(root, "myproj");
        if (!fs.existsSync(variant)) {
            return; // case-sensitive file system
        }
        expect(await listProjectFiles(variant, { pattern: "*.bal" })).toEqual(["main.bal"]);
        expect(isReadableProjectFile(variant, "main.bal")).toBe(true);
    });

    it("works when the root itself is reached through a symlink", async () => {
        const alias = `${root}-alias`;
        fs.symlinkSync(root, alias);
        try {
            expect(await listProjectFiles(alias, { pattern: "*.bal" })).toEqual(["main.bal"]);
            expect(isReadableProjectFile(alias, "main.bal")).toBe(true);
        } finally {
            fs.unlinkSync(alias);
        }
    });
});

describe("isAllowedProjectPath", () => {
    it.each([
        ["main.bal", true],
        ["pkg1/modules/db/db.bal", true],
        [".agents/skills/x/SKILL.md", true],
        ["./main.bal", true],
        ["CONFIG.TOML", false],
        ["pkg1/tests/Config.toml", false],
        [".agents/.env.json", false],
        ["pkg1/.agents/skills/x/SKILL.md", false],
        [".env", false],
        ["target/bin/a.bal", false],
        ["Target/cache/x.json", false],
        ["pkg1/TARGET/a.bal", false],
        ["data.csv", false],
        ["../main.bal", false],
    ])("%s → %s", (rel, allowed) => {
        expect(isAllowedProjectPath(rel)).toBe(allowed);
    });
});
