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
jest.mock("../features/agent-manager/client", () => ({ __esModule: true, api: {}, MANIFEST_FILE: ".wso2/agent-manager.yaml" }));

import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { changesOutside, checkPushed, defaultRemote, githubRemotes, pushBlocker, readFacts, SourceFacts } from "../features/agent-manager/github";

const facts = (overrides: Partial<SourceFacts>): SourceFacts => ({ ahead: 0, dirty: 0, buildChanges: 0, changedConfigs: [], hasRemotes: true, gitMissing: false, ...overrides });

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

describe("A package folder the remote doesn't have", () => {
    const GITHUB_URL = "https://github.com/acme/agents.git";
    const run = (cwd: string, ...args: string[]) => cp.execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    let root: string;
    let repo: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "missing-on-remote-"));
        repo = path.join(root, "agents");
        run(root, "init", "-q", "--bare", path.join(root, "remote.git"));
        fs.mkdirSync(path.join(repo, "first"), { recursive: true });
        run(repo, "init", "-q", "-b", "main");
        run(repo, "config", "user.email", "test@example.com");
        run(repo, "config", "user.name", "Test");
        run(repo, "config", `url.${path.join(root, "remote.git")}.pushInsteadOf`, GITHUB_URL);
        run(repo, "config", `url.${path.join(root, "remote.git")}.insteadOf`, GITHUB_URL);
        run(repo, "remote", "add", "origin", GITHUB_URL);
        fs.writeFileSync(path.join(repo, "first", "main.bal"), "public function main() {}\n");
        run(repo, "add", "-A");
        run(repo, "commit", "-q", "-m", "First package");
    });

    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it("is missing while the branch has no upstream, and found once pushed", async () => {
        expect((await readFacts(path.join(repo, "first"))).missingOnRemote).toBe(true);
        run(repo, "push", "-q", "-u", "origin", "main");
        expect((await readFacts(path.join(repo, "first"))).missingOnRemote).toBe(false);
    });

    it("counts only the package folder's changes and lists the rest of the repository apart", async () => {
        fs.writeFileSync(path.join(repo, "Ballerina.toml"), "[workspace]\npackages = []\n");
        run(repo, "add", "-A");
        run(repo, "commit", "-q", "-m", "Workspace");
        // A modified tracked file is listed first, as " M <path>", with a leading space.
        fs.writeFileSync(path.join(repo, "Ballerina.toml"), "[workspace]\npackages = [\"first\"]\n");
        fs.mkdirSync(path.join(repo, ".wso2"));
        fs.writeFileSync(path.join(repo, ".wso2", "context.yaml"), "version: 2\n");
        fs.writeFileSync(path.join(repo, "first", "agent.bal"), "public function run() {}\n");
        const facts = await readFacts(path.join(repo, "first"));
        const { dirty } = facts;
        const otherChanges = await changesOutside(path.join(repo, "first"), facts);
        expect(dirty).toBe(1);
        expect(otherChanges.sort()).toEqual([".wso2/context.yaml", "Ballerina.toml"]);
    });

    it("doesn't count the Agent Manager link file as a change a build uses", async () => {
        fs.mkdirSync(path.join(repo, "first", ".wso2"));
        fs.writeFileSync(path.join(repo, "first", ".wso2", "agent-manager.yaml"), "agent: first\n");
        const linkOnly = await readFacts(path.join(repo, "first"));
        expect([linkOnly.dirty, linkOnly.buildChanges]).toEqual([1, 0]);
        fs.writeFileSync(path.join(repo, "first", "agent.bal"), "public function run() {}\n");
        const withSource = await readFacts(path.join(repo, "first"));
        expect([withSource.dirty, withSource.buildChanges]).toEqual([2, 1]);
    });

    it("lists nothing apart for a package at the repository's root", async () => {
        fs.writeFileSync(path.join(repo, "Ballerina.toml"), "[package]\n");
        expect(await changesOutside(repo, await readFacts(repo))).toEqual([]);
    });

    it("is missing when only committed locally after the last push", async () => {
        run(repo, "push", "-q", "-u", "origin", "main");
        fs.mkdirSync(path.join(repo, "second"));
        fs.writeFileSync(path.join(repo, "second", "main.bal"), "public function main() {}\n");
        expect((await readFacts(path.join(repo, "second"))).missingOnRemote).toBe(true);
        run(repo, "add", "-A");
        run(repo, "commit", "-q", "-m", "Second package");
        expect((await readFacts(path.join(repo, "second"))).missingOnRemote).toBe(true);
        run(repo, "push", "-q");
        expect((await readFacts(path.join(repo, "second"))).missingOnRemote).toBe(false);
    });
});

describe("A fork whose package is pushed only to its own remote", () => {
    const run = (cwd: string, ...args: string[]) => cp.execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    let root: string;
    let repo: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "fork-remotes-"));
        repo = path.join(root, "agents");
        fs.mkdirSync(path.join(repo, "agent"), { recursive: true });
        run(repo, "init", "-q", "-b", "main");
        run(repo, "config", "user.email", "test@example.com");
        run(repo, "config", "user.name", "Test");
        // `git remote -v` prints insteadOf rewrites, so the remotes keep GitHub SSH URLs and a local "ssh" serves them.
        const ssh = path.join(root, "ssh.sh");
        fs.writeFileSync(ssh, `#!/bin/sh\nshift\ncd "${root}" && eval "$@"\n`, { mode: 0o755 });
        run(repo, "config", "core.sshCommand", ssh);
        for (const [name, owner] of [["origin", "me"], ["upstream", "acme"]]) {
            run(root, "init", "-q", "--bare", path.join(root, owner, "agents.git"));
            run(repo, "remote", "add", name, `git@github.com:${owner}/agents.git`);
        }
        fs.writeFileSync(path.join(repo, "README.md"), "agents\n");
        run(repo, "add", "-A");
        run(repo, "commit", "-q", "-m", "Parent");
        run(repo, "push", "-q", "upstream", "main");
        fs.writeFileSync(path.join(repo, "agent", "Ballerina.toml"), "[package]\n");
        run(repo, "add", "-A");
        run(repo, "commit", "-q", "-m", "Agent");
        run(repo, "push", "-q", "-u", "origin", "main");
    });

    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it("preselects the tracked remote over upstream", async () => {
        expect(await defaultRemote(repo, await githubRemotes(repo))).toBe("origin");
    });

    it("names the checked repository and the one that has the package", async () => {
        expect(await checkPushed(repo, "upstream", "main", "/agent", [])).toEqual({
            ok: false,
            message: "Project not found on acme/agents · main. It is on me/agents · main. Select that repository.",
        });
        expect(await checkPushed(repo, "origin", "main", "/agent", ["Dependencies.toml"])).toEqual({
            ok: false,
            message: "Dependencies.toml not found on me/agents · main. Push the project to this branch.",
        });
    });
});
