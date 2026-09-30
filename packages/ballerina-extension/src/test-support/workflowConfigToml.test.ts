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
import { parse } from "@iarna/toml";
import { window } from "vscode";

import {
    disableWorkflowManagementConfig,
    enableWorkflowManagementConfig,
} from "../utils/workflow-config-toml";

let projectPath: string;
let configPath: string;

beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-config-"));
    configPath = path.join(projectPath, "Config.toml");
});

afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
});

function write(content: string): void {
    fs.writeFileSync(configPath, content, "utf-8");
}

function read(): string {
    return fs.readFileSync(configPath, "utf-8");
}

interface ManagementRestTable {
    enableManagementApi?: boolean;
    port?: number;
    enableBasicAuth?: boolean;
}

interface WorkflowConfig {
    ballerina?: { workflow?: { mode?: string; management?: { rest?: ManagementRestTable } } };
}

function parsed(): WorkflowConfig {
    return parse(read()) as unknown as WorkflowConfig;
}

function restTable(): ManagementRestTable | undefined {
    return parsed().ballerina?.workflow?.management?.rest;
}

describe("enableWorkflowManagementConfig", () => {
    it("writes the block under workflow.management.rest, the module that owns the listener", () => {
        enableWorkflowManagementConfig(projectPath);

        expect(restTable()).toEqual({ enableManagementApi: true });
    });

    it("writes no setting that already has a module default", () => {
        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe("[ballerina.workflow.management.rest]\nenableManagementApi = true\n");
    });

    it("leaves every other line, comment and number format untouched", () => {
        const original = [
            "# Deployment settings — keep in sync with the chart.",
            "[ballerina.workflow]",
            'mode = "LOCAL"   # in-memory for local runs',
            "port = 8234",
            "",
        ].join("\n");
        write(original);

        enableWorkflowManagementConfig(projectPath);

        expect(read().startsWith(original)).toBe(true);
        expect(read()).toContain("port = 8234");
    });

    it("keeps a port the author already set instead of restating the default", () => {
        write("[ballerina.workflow.management.rest]\nport = 9999\nenableBasicAuth = true\n");

        enableWorkflowManagementConfig(projectPath);

        expect(restTable()).toEqual({ enableManagementApi: true, port: 9999, enableBasicAuth: true });
    });

    it("flips an existing false rather than adding a second key", () => {
        write("[ballerina.workflow.management.rest]\nenableManagementApi = false\nport = 9999\n");

        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe("[ballerina.workflow.management.rest]\nenableManagementApi = true\nport = 9999\n");
    });

    it("does not rewrite the file when the API is already enabled", () => {
        const original = "[ballerina.workflow.management.rest]\nenableManagementApi = true\nport = 9999\n";
        write(original);
        const before = fs.statSync(configPath).mtimeMs;

        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe(original);
        expect(fs.statSync(configPath).mtimeMs).toBe(before);
    });

    it("finds a table header that carries a trailing comment, rather than duplicating it", () => {
        write("[ballerina.workflow.management.rest] # management API\nport = 9999\n");

        enableWorkflowManagementConfig(projectPath);

        expect(read().match(/\[ballerina\.workflow\.management\.rest\]/g)).toHaveLength(1);
        expect(restTable()).toEqual({ enableManagementApi: true, port: 9999 });
    });

    it("keeps a comment sitting beside the key it flips", () => {
        write("[ballerina.workflow.management.rest]\nenableManagementApi = false # off for now\n");

        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe("[ballerina.workflow.management.rest]\nenableManagementApi = true # off for now\n");
    });

    it("does not rewrite an enabled key just because it carries a comment", () => {
        const original = "[ballerina.workflow.management.rest]\nenableManagementApi = true # on\n";
        write(original);

        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe(original);
    });

    it("replaces a whole value, even a string with a space in it", () => {
        write("[ballerina.workflow.management.rest]\nenableManagementApi = \"no thanks\" # hm\n");

        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe("[ballerina.workflow.management.rest]\nenableManagementApi = true # hm\n");
    });

    it("keeps the author's line endings", () => {
        write("[ballerina.workflow]\r\nmode = \"LOCAL\"\r\n");

        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe(
            "[ballerina.workflow]\r\nmode = \"LOCAL\"\r\n\r\n[ballerina.workflow.management.rest]\r\nenableManagementApi = true\r\n"
        );
        expect(read()).not.toMatch(/[^\r]\n/);
    });

    it("does not define the table twice when the author spelled it as dotted keys", () => {
        const original = "[ballerina.workflow.management]\nrest.enableManagementApi = false\n";
        write(original);
        const error = jest.spyOn(console, "error").mockImplementation(() => undefined);

        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe(original);
        expect(() => parse(read())).not.toThrow();
        expect(error).toHaveBeenCalledWith(expect.stringContaining("by hand"));
        error.mockRestore();
    });

    it("leaves a file it cannot parse alone", () => {
        const original = "[ballerina.workflow\nmode = \"LOCAL\"\n";
        write(original);
        const error = jest.spyOn(console, "error").mockImplementation(() => undefined);

        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe(original);
        error.mockRestore();
    });

    it("clears the block an earlier toggle wrote under the wrong table", () => {
        write("[ballerina.workflow.management]\nenableManagementApi = true\nport = 8_234\nenableBasicAuth = false\n");

        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe("[ballerina.workflow.management.rest]\nenableManagementApi = true\n");
    });

    it("keeps the author's own settings in that table while clearing the stale ones", () => {
        write("[ballerina.workflow.management]\nmaxPageSize = 50\nport = 8_234\n\n[ballerina.workflow.management.rest]\nenableManagementApi = true\n");

        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe("[ballerina.workflow.management]\nmaxPageSize = 50\n\n[ballerina.workflow.management.rest]\nenableManagementApi = true\n");
    });

    it("leaves a file alone when the table is valid but something after it is not", () => {
        const original = "[ballerina.workflow.management.rest]\nenableManagementApi = false\n\n[broken\nmode = 1\n";
        write(original);
        const error = jest.spyOn(console, "error").mockImplementation(() => undefined);

        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe(original);
        error.mockRestore();
    });

    it("does not rewrite a key line that sits inside a multiline string", () => {
        const original = "[ballerina.workflow.management.rest]\nnote = \"\"\"\nenableManagementApi = false\n\"\"\"\n";
        write(original);
        const error = jest.spyOn(console, "error").mockImplementation(() => undefined);

        enableWorkflowManagementConfig(projectPath);

        expect(read()).toBe(original);
        expect(error).toHaveBeenCalledWith(expect.stringContaining("by hand"));
        error.mockRestore();
    });

    it("enables in a file that carries a datetime", () => {
        write("[ballerina.workflow]\nstartedAt = 1979-05-27T07:32:00Z\nday = 1979-05-27\n");

        enableWorkflowManagementConfig(projectPath);

        expect(restTable()?.enableManagementApi).toBe(true);
    });

    it("enables in a file that carries an integer too large for a JS number", () => {
        write("[ballerina.workflow]\nbig = 9223372036854775807\n");

        enableWorkflowManagementConfig(projectPath);

        expect(restTable()?.enableManagementApi).toBe(true);
    });

    it("tells the user when it leaves the file alone, since main.bal has already been edited", () => {
        const warn = jest.spyOn(window, "showWarningMessage").mockResolvedValue(undefined);
        write("[ballerina.workflow.management]\nrest.enableManagementApi = false\n");

        enableWorkflowManagementConfig(projectPath);

        expect(warn).toHaveBeenCalledWith(expect.stringContaining("by hand"));
        warn.mockRestore();
    });

    it("appends the table without swallowing a file that has no trailing newline", () => {
        write('[ballerina.workflow]\nmode = "IN_MEMORY"');

        enableWorkflowManagementConfig(projectPath);

        expect(parsed().ballerina?.workflow?.mode).toBe("IN_MEMORY");
        expect(restTable()?.enableManagementApi).toBe(true);
    });
});

describe("disableWorkflowManagementConfig", () => {
    it("removes the table it owns and nothing else", () => {
        write('[ballerina.workflow]\nmode = "LOCAL"\n\n[ballerina.workflow.management.rest]\nenableManagementApi = true\n');

        disableWorkflowManagementConfig(projectPath);

        expect(read()).not.toContain("management.rest");
        expect(parsed()).toEqual({ ballerina: { workflow: { mode: "LOCAL" } } });
    });

    it("keeps the table when the author has other settings in it", () => {
        write("[ballerina.workflow.management.rest]\nenableManagementApi = true\nport = 9999\n");

        disableWorkflowManagementConfig(projectPath);

        expect(read()).toBe("[ballerina.workflow.management.rest]\nport = 9999\n");
    });

    it("clears the stale block an earlier toggle wrote, along with its own", () => {
        write("[ballerina.workflow.management]\nenableManagementApi = true\nport = 8_234\nenableBasicAuth = false\n\n[ballerina.workflow.management.rest]\nenableManagementApi = true\n");

        disableWorkflowManagementConfig(projectPath);

        expect(read()).toBe("");
    });

    it("does nothing when there is no Config.toml", () => {
        disableWorkflowManagementConfig(projectPath);

        expect(fs.existsSync(configPath)).toBe(false);
    });

    it("does not rewrite a file that never had the key", () => {
        const original = '[ballerina.workflow]\nmode = "LOCAL"\n';
        write(original);
        const before = fs.statSync(configPath).mtimeMs;

        disableWorkflowManagementConfig(projectPath);

        expect(read()).toBe(original);
        expect(fs.statSync(configPath).mtimeMs).toBe(before);
    });
});
