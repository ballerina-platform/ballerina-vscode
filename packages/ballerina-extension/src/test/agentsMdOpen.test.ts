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

// L3 (headless host) — `openOrCreateAgentsMd`, behind the Agent instructions row in Copilot
// settings. `workspace.fs` works on a real temp dir; `window` records what the user would see.

jest.mock("../RPCLayer", () => ({ notifyAgentsMdFileInfoChanged: jest.fn() }));
jest.mock("../views/ai-panel/chatStateStorage", () => ({ chatStateStorage: {} }));
jest.mock("../features/ai/agent/tools/text-editor", () => ({ FILE_READ_TOOL_NAME: "file_read" }));
jest.mock("../utils/config", () => ({ copilotName: () => "WSO2 Integrator Copilot" }));

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
// The module jest maps `vscode` to, imported by path so the stubs tests reassign stay mutable.
import { Uri, window, workspace } from "./__mocks__/vscode";
import { openOrCreateAgentsMd } from "../features/ai/agent/agents-md";

describe("openOrCreateAgentsMd", () => {
    let root: string;
    let agentsMd: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-md-open-"));
        agentsMd = path.join(root, "AGENTS.md");
        workspace.workspaceFolders = [{ uri: Uri.file(root) }];
    });

    afterEach(() => {
        jest.restoreAllMocks();
        workspace.workspaceFolders = [];
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("creates and opens a missing AGENTS.md once for concurrent calls", async () => {
        const writeFile = jest.spyOn(workspace.fs, "writeFile");
        const showTextDocument = jest.spyOn(window, "showTextDocument");

        await Promise.all([openOrCreateAgentsMd(), openOrCreateAgentsMd(), openOrCreateAgentsMd()]);

        expect(writeFile).toHaveBeenCalledTimes(1);
        expect(showTextDocument).toHaveBeenCalledTimes(1);
        expect(fs.readFileSync(agentsMd, "utf8")).toContain("# Project instructions");
    });

    it("opens AGENTS.md again on a later call without rewriting it", async () => {
        await openOrCreateAgentsMd();
        const writeFile = jest.spyOn(workspace.fs, "writeFile");
        const showTextDocument = jest.spyOn(window, "showTextDocument");

        await openOrCreateAgentsMd();

        expect(writeFile).not.toHaveBeenCalled();
        expect(showTextDocument).toHaveBeenCalledTimes(1);
    });

    it("shows an error when AGENTS.md can't be created, and tries again on the next call", async () => {
        const writeFile = jest.spyOn(workspace.fs, "writeFile")
            .mockRejectedValueOnce(new Error("EACCES: permission denied"));
        const showErrorMessage = jest.spyOn(window, "showErrorMessage");
        const showTextDocument = jest.spyOn(window, "showTextDocument");

        await expect(openOrCreateAgentsMd()).resolves.toBeUndefined();
        expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("EACCES: permission denied"));
        expect(showTextDocument).not.toHaveBeenCalled();

        await openOrCreateAgentsMd();
        expect(writeFile).toHaveBeenCalledTimes(2);
        expect(showTextDocument).toHaveBeenCalledTimes(1);
    });

    it("shows an error when AGENTS.md can't be opened", async () => {
        fs.mkdirSync(agentsMd);
        const writeFile = jest.spyOn(workspace.fs, "writeFile");
        const showErrorMessage = jest.spyOn(window, "showErrorMessage");
        jest.spyOn(window, "showTextDocument").mockRejectedValueOnce(new Error("AGENTS.md is a directory"));

        await expect(openOrCreateAgentsMd()).resolves.toBeUndefined();

        expect(writeFile).not.toHaveBeenCalled();
        expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("AGENTS.md is a directory"));
    });

    it("asks for a workspace folder when none is open", async () => {
        workspace.workspaceFolders = [];
        const showWarningMessage = jest.spyOn(window, "showWarningMessage");
        const writeFile = jest.spyOn(workspace.fs, "writeFile");

        await openOrCreateAgentsMd();

        expect(showWarningMessage).toHaveBeenCalledWith("Open a workspace folder to create AGENTS.md.");
        expect(writeFile).not.toHaveBeenCalled();
    });
});
