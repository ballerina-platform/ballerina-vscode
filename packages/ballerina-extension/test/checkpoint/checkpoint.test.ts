// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

// These tests drive the checkpoint/integration logic through the real, activated extension
// instance via its AI_TEST_ENV-only test commands (registered in features/ai/activator.ts),
// rather than re-importing the source modules directly — that path re-evaluates a large,
// activation-order-dependent chunk of the extension's module graph outside its normal
// activation sequence and fails on unrelated eager side effects.
//
// Only non-.bal files are used so restoreWorkspaceSnapshot/integrateCodeToWorkspace take their
// fast paths (no Language Server artifact-update wait), keeping the suite deterministic and
// independent of a configured Ballerina distribution.

function workspaceRoot(): string {
    const folders = vscode.workspace.workspaceFolders;
    assert.ok(folders && folders.length > 0, "Expected a workspace folder to be open for this test suite");
    return folders[0].uri.fsPath;
}

async function writeFile(relPath: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(path.join(workspaceRoot(), relPath));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
}

function readFile(relPath: string): string {
    return fs.readFileSync(path.join(workspaceRoot(), relPath), "utf8");
}

function fileExists(relPath: string): boolean {
    return fs.existsSync(path.join(workspaceRoot(), relPath));
}

suite("Checkpoint capture/restore Tests Suite", function () {
    const ORIGINAL: Record<string, string> = {
        "a.txt": "original-a\n",
        "sub/b.txt": "original-b\n",
    };

    suiteSetup(async function () {
        this.timeout(120000);
        // Wait for the extension to finish activating (LS startup, project detection, etc.)
        // and register its AI_TEST_ENV-only test commands.
        const deadline = Date.now() + 90000;
        while (Date.now() < deadline) {
            const cmds = await vscode.commands.getCommands(true);
            if (cmds.includes("ballerina.test.ai.captureCheckpoint")) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        assert.fail("Timed out waiting for ballerina.test.ai.captureCheckpoint to be registered");
    });

    // Restore fixture files to their checked-in content so repeated local runs are idempotent.
    teardown(async () => {
        for (const [relPath, content] of Object.entries(ORIGINAL)) {
            await writeFile(relPath, content);
        }
        const extra = path.join(workspaceRoot(), "extra.txt");
        if (fs.existsSync(extra)) {
            fs.unlinkSync(extra);
        }
    });

    test("captureWorkspaceSnapshot captures all workspace files with their content", async () => {
        const checkpoint: any = await vscode.commands.executeCommand("ballerina.test.ai.captureCheckpoint", "test-msg-1");
        assert.ok(checkpoint, "Expected a checkpoint to be captured");
        assert.strictEqual(checkpoint.workspaceSnapshot["a.txt"], ORIGINAL["a.txt"]);
        assert.strictEqual(checkpoint.workspaceSnapshot["sub/b.txt"], ORIGINAL["sub/b.txt"]);
        assert.ok(checkpoint.fileList.includes("a.txt"));
        assert.ok(checkpoint.fileList.includes("sub/b.txt"));
    });

    test("restoreWorkspaceSnapshot reverts modified files and deletes files added after the snapshot", async () => {
        const checkpoint: any = await vscode.commands.executeCommand("ballerina.test.ai.captureCheckpoint", "test-msg-2");
        assert.ok(checkpoint, "Expected a checkpoint to be captured");

        // Simulate a generation's edits: modify an existing file and add a new one.
        await writeFile("a.txt", "modified-a\n");
        await writeFile("extra.txt", "should be removed on revert\n");

        await vscode.commands.executeCommand("ballerina.test.ai.restoreCheckpoint", checkpoint, /* skipArtifactWait */ true);

        assert.strictEqual(readFile("a.txt"), ORIGINAL["a.txt"], "a.txt should be reverted to its original content");
        assert.strictEqual(readFile("sub/b.txt"), ORIGINAL["sub/b.txt"], "untouched files should be unaffected");
        assert.strictEqual(fileExists("extra.txt"), false, "files added after the snapshot should be deleted on revert");
    });

    test("integrateCodeToWorkspace writes modified temp-project files into the real workspace", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bal-integration-test-"));
        try {
            fs.writeFileSync(path.join(tempDir, "notes.txt"), "from temp project\n", "utf8");

            const ctx = {
                workspacePath: workspaceRoot(),
                projectPath: workspaceRoot(),
            };

            await vscode.commands.executeCommand("ballerina.test.ai.integrateCodeToWorkspace", tempDir, ["notes.txt"], ctx);

            assert.strictEqual(readFile("notes.txt"), "from temp project\n");
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
            const written = path.join(workspaceRoot(), "notes.txt");
            if (fs.existsSync(written)) {
                fs.unlinkSync(written);
            }
        }
    });
});
