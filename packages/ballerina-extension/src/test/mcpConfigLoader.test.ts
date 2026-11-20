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

import {
    loadMcpConfig,
    PROJECT_MCP_FILENAME,
    ADDITIONAL_PROJECT_MCP_RELATIVE_PATHS,
} from "../features/ai/agent/mcp/configLoader";

let projectRoot: string;

beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-configloader-"));
});

afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
});

function writePrimary(mcpServers: Record<string, unknown>): void {
    fs.writeFileSync(path.join(projectRoot, PROJECT_MCP_FILENAME), JSON.stringify({ mcpServers }), "utf8");
}

function writeAdditionalRaw(content: string): void {
    const filePath = path.join(projectRoot, ADDITIONAL_PROJECT_MCP_RELATIVE_PATHS[0]);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
}

function writeAdditional(mcpServers: Record<string, unknown>): void {
    writeAdditionalRaw(JSON.stringify({ mcpServers }));
}

function workspaceEntries(workspacePath: string) {
    return loadMcpConfig(workspacePath, true).entries.filter(e => e.scope === "workspace");
}

describe("loadMcpConfig — project-scope multi-path merge", () => {
    it("reads entries from only the additional path when the primary file is absent", () => {
        writeAdditional({ fromWso2: { command: "wso2-server" } });
        const entries = workspaceEntries(projectRoot);
        expect(entries.map(e => e.name)).toEqual(["fromWso2"]);
    });

    it("unions distinctly named entries from the primary and additional files", () => {
        writePrimary({ fromPrimary: { command: "primary-server" } });
        writeAdditional({ fromWso2: { command: "wso2-server" } });
        const names = workspaceEntries(projectRoot).map(e => e.name).sort();
        expect(names).toEqual(["fromPrimary", "fromWso2"]);
    });

    it("lets the primary file win a same-named collision with an additional file", () => {
        writePrimary({ shared: { command: "primary-wins" } });
        writeAdditional({ shared: { command: "wso2-loses" } });
        const entries = workspaceEntries(projectRoot);
        expect(entries).toHaveLength(1);
        expect((entries[0].config as { command: string }).command).toBe("primary-wins");
    });

    it("still loads the primary's entries when the additional file is malformed", () => {
        writePrimary({ fromPrimary: { command: "primary-server" } });
        writeAdditionalRaw("{ not valid json");
        const { entries, errors } = loadMcpConfig(projectRoot, true);
        expect(entries.filter(e => e.scope === "workspace").map(e => e.name)).toEqual(["fromPrimary"]);
        expect(errors.workspace).toContain("Invalid JSON");
    });

    it("returns no workspace entries or errors with no project files at all", () => {
        const { entries, errors } = loadMcpConfig(projectRoot, true);
        expect(entries.filter(e => e.scope === "workspace")).toEqual([]);
        expect(errors.workspace).toBeUndefined();
    });
});
