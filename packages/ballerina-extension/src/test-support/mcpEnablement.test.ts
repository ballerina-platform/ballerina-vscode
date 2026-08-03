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
import * as vscode from "vscode";

import { isMcpToolsEnabled } from "../features/ai/agent/mcp/enablement";
import { PROJECT_MCP_FILENAME, ADDITIONAL_PROJECT_MCP_RELATIVE_PATHS } from "../features/ai/agent/mcp/configLoader";

const ws = vscode.workspace as any;
const originalGetConfiguration = ws.getConfiguration;
const originalIsTrusted = ws.isTrusted;

function stubEnableSetting(explicit: boolean | undefined): void {
    ws.getConfiguration = () => ({
        get: () => explicit,
        update: () => Promise.resolve(),
        inspect: () => ({ defaultValue: false, globalValue: explicit }),
    });
}

let projectRoot: string;

beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-enablement-"));
    ws.isTrusted = true;
});

afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    ws.getConfiguration = originalGetConfiguration;
    ws.isTrusted = originalIsTrusted;
});

function writeProjectConfig(): void {
    fs.writeFileSync(path.join(projectRoot, PROJECT_MCP_FILENAME), JSON.stringify({ mcpServers: {} }), "utf8");
}

function writeAdditionalProjectConfig(): void {
    const relative = ADDITIONAL_PROJECT_MCP_RELATIVE_PATHS[0];
    const filePath = path.join(projectRoot, relative);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ mcpServers: {} }), "utf8");
}

describe("isMcpToolsEnabled", () => {
    it("turns on for a project carrying .mcp.json while the setting is untouched", () => {
        stubEnableSetting(undefined);
        writeProjectConfig();
        expect(isMcpToolsEnabled(projectRoot)).toBe(true);
    });

    it("stays off without a project .mcp.json", () => {
        stubEnableSetting(undefined);
        expect(isMcpToolsEnabled(projectRoot)).toBe(false);
    });

    it("honours an explicit opt-out even when .mcp.json exists", () => {
        stubEnableSetting(false);
        writeProjectConfig();
        expect(isMcpToolsEnabled(projectRoot)).toBe(false);
    });

    it("honours an explicit opt-in without any .mcp.json", () => {
        stubEnableSetting(true);
        expect(isMcpToolsEnabled(projectRoot)).toBe(true);
    });

    it("ignores .mcp.json in an untrusted workspace", () => {
        stubEnableSetting(undefined);
        writeProjectConfig();
        ws.isTrusted = false;
        expect(isMcpToolsEnabled(projectRoot)).toBe(false);
    });

    it("stays off with no project open", () => {
        stubEnableSetting(undefined);
        expect(isMcpToolsEnabled(undefined)).toBe(false);
    });

    it("turns on for a project carrying only an additional config path (e.g. .wso2/mcp.json)", () => {
        stubEnableSetting(undefined);
        writeAdditionalProjectConfig();
        expect(isMcpToolsEnabled(projectRoot)).toBe(true);
    });
});
