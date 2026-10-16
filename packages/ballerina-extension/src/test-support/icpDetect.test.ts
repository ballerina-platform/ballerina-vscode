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

// L1 contract tests for ICP binary resolution: the precedence between the
// `ballerina.icpPath` setting, `WSO2_INTEGRATOR_ICP_HOME`, the running WSO2
// Integrator extension and the well-known install directories, and the rule
// that auto-detected paths are never written back to settings.

// `utils/config` drags in core/extension.ts; only the extension id is needed here.
jest.mock("../utils/config", () => ({ WI_EXTENSION_ID: "wso2.wso2-integrator" }));
jest.mock("../utils/logger", () => ({ log: jest.fn() }));

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import { resolveICPPath, detectICPPath, ICP_HOME_ENV } from "../features/icp/detect";
import { log } from "../utils/logger";

const win = vscode.window as any;
const ws = vscode.workspace as any;
const ext = vscode.extensions as any;
const cmds = vscode.commands as any;
const originals = {
    showErrorMessage: win.showErrorMessage,
    getConfiguration: ws.getConfiguration,
    getExtension: ext.getExtension,
    executeCommand: cmds.executeCommand,
    platform: Object.getOwnPropertyDescriptor(process, "platform")!,
    icpHome: process.env[ICP_HOME_ENV],
};

const scriptName = () => (process.platform === "win32" ? "icp.bat" : "icp.sh");

/** Creates `<root>/<...segments>/bin/<script>` and returns the script path. */
function makeIcpBin(root: string, ...segments: string[]): string {
    const bin = path.join(root, ...segments, "bin");
    fs.mkdirSync(bin, { recursive: true });
    const script = path.join(bin, scriptName());
    fs.writeFileSync(script, "");
    return script;
}

function setPlatform(platform: string): void {
    Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

let root: string;
let settingValue: string | undefined;
let settingUpdates: unknown[][];
let prompts: string[];
let promptAnswer: string | undefined;
let executedCommands: unknown[][];

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "icp-detect-"));
    settingValue = undefined;
    settingUpdates = [];
    prompts = [];
    promptAnswer = undefined;
    executedCommands = [];
    delete process.env[ICP_HOME_ENV];
    // A platform with no well-known install directories, so the scan can't find a
    // real install on the machine running the tests.
    setPlatform("freebsd");

    ws.getConfiguration = () => ({
        get: () => settingValue,
        update: (...args: unknown[]) => {
            settingUpdates.push(args);
            return Promise.resolve();
        },
        inspect: () => undefined,
    });
    win.showErrorMessage = (message: string) => {
        prompts.push(message);
        return Promise.resolve(promptAnswer);
    };
    ext.getExtension = () => undefined;
    cmds.executeCommand = (...args: unknown[]) => {
        executedCommands.push(args);
        return Promise.resolve();
    };
    (log as jest.Mock).mockClear();
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    ws.getConfiguration = originals.getConfiguration;
    win.showErrorMessage = originals.showErrorMessage;
    ext.getExtension = originals.getExtension;
    cmds.executeCommand = originals.executeCommand;
    Object.defineProperty(process, "platform", originals.platform);
    if (originals.icpHome === undefined) {
        delete process.env[ICP_HOME_ENV];
    } else {
        process.env[ICP_HOME_ENV] = originals.icpHome;
    }
});

/** Lays out `<root>/<install>/resources/app/extensions/<id>` as the running WI extension. */
function installWiExtension(install: string): string {
    const extensionPath = path.join(root, install, "resources", "app", "extensions", "wso2.wso2-integrator");
    fs.mkdirSync(extensionPath, { recursive: true });
    ext.getExtension = (id: string) => (id === "wso2.wso2-integrator" ? { id, extensionPath } : undefined);
    return makeIcpBin(root, install, "components", "icp");
}

function setIcpHome(home: string): void {
    process.env[ICP_HOME_ENV] = home;
}

describe("resolveICPPath precedence", () => {
    it("uses a configured path that exists even when WSO2_INTEGRATOR_ICP_HOME is valid", async () => {
        settingValue = makeIcpBin(root, "configured");
        setIcpHome(path.dirname(path.dirname(makeIcpBin(root, "env-home"))));

        await expect(resolveICPPath()).resolves.toBe(settingValue);
        expect(prompts).toEqual([]);
        expect(settingUpdates).toEqual([]);
    });

    it("uses WSO2_INTEGRATOR_ICP_HOME/bin/<script> without writing it to settings", async () => {
        const envScript = makeIcpBin(root, "env-home");
        setIcpHome(path.join(root, "env-home"));

        await expect(resolveICPPath()).resolves.toBe(envScript);
        expect(prompts).toEqual([]);
        expect(settingUpdates).toEqual([]);
    });

    it("prefers WSO2_INTEGRATOR_ICP_HOME over the running WSO2 Integrator extension", async () => {
        installWiExtension("wi-install");
        const envScript = makeIcpBin(root, "env-home");
        setIcpHome(path.join(root, "env-home"));

        await expect(resolveICPPath()).resolves.toBe(envScript);
    });

    it("follows WSO2_INTEGRATOR_ICP_HOME to a new install while the old one is still on disk", async () => {
        const first = makeIcpBin(root, "icp-1.0");
        const second = makeIcpBin(root, "icp-1.1");

        setIcpHome(path.join(root, "icp-1.0"));
        await expect(resolveICPPath()).resolves.toBe(first);

        setIcpHome(path.join(root, "icp-1.1"));
        await expect(resolveICPPath()).resolves.toBe(second);
        expect(prompts).toEqual([]);
        expect(settingUpdates).toEqual([]);
    });

    it("falls back to the running WSO2 Integrator extension's install when the env var is unset", async () => {
        const wiScript = installWiExtension("wi-install");

        await expect(resolveICPPath()).resolves.toBe(wiScript);
        expect(settingUpdates).toEqual([]);
    });

    it("logs and skips a WSO2_INTEGRATOR_ICP_HOME that has no bin/<script>", async () => {
        const wiScript = installWiExtension("wi-install");
        const emptyHome = path.join(root, "empty-home");
        fs.mkdirSync(emptyHome);
        setIcpHome(emptyHome);

        await expect(resolveICPPath()).resolves.toBe(wiScript);
        expect(log).toHaveBeenCalledTimes(1);
        const message = (log as jest.Mock).mock.calls[0][0] as string;
        expect(message).toContain(ICP_HOME_ENV);
        expect(message).toContain(path.join(emptyHome, "bin", scriptName()));
    });

    it("shows the not-installed prompt when nothing is found", async () => {
        setIcpHome(path.join(root, "missing-home"));

        await expect(resolveICPPath()).resolves.toBeUndefined();
        expect(prompts).toHaveLength(1);
        expect(prompts[0]).toContain("not installed");
        expect(settingUpdates).toEqual([]);
    });
});

describe("resolveICPPath with a stale configured path", () => {
    beforeEach(() => {
        settingValue = path.join(root, "gone", "bin", scriptName());
    });

    it("Auto Detect clears the stale setting and returns the detected path", async () => {
        const envScript = makeIcpBin(root, "env-home");
        setIcpHome(path.join(root, "env-home"));
        promptAnswer = "Auto Detect";

        await expect(resolveICPPath()).resolves.toBe(envScript);
        expect(prompts).toHaveLength(1);
        expect(prompts[0]).toContain(settingValue);
        expect(settingUpdates).toEqual([["icpPath", undefined, vscode.ConfigurationTarget.Global]]);
    });

    it("Auto Detect with nothing installed falls through to the not-installed prompt", async () => {
        promptAnswer = "Auto Detect";

        await expect(resolveICPPath()).resolves.toBeUndefined();
        expect(prompts).toHaveLength(2);
        expect(prompts[1]).toContain("not installed");
    });

    it("dismissing the prompt returns nothing and leaves the setting alone", async () => {
        makeIcpBin(root, "env-home");
        setIcpHome(path.join(root, "env-home"));
        promptAnswer = undefined;

        await expect(resolveICPPath()).resolves.toBeUndefined();
        expect(prompts).toHaveLength(1);
        expect(settingUpdates).toEqual([]);
    });

    it("Open Settings opens the icpPath setting", async () => {
        promptAnswer = "Open Settings";

        await expect(resolveICPPath()).resolves.toBeUndefined();
        expect(executedCommands).toEqual([["workbench.action.openSettings", "ballerina.icpPath"]]);
        expect(settingUpdates).toEqual([]);
    });
});

describe("detectICPPath scans the well-known install directories", () => {
    // The base directories are computed when the module loads, so load a fresh copy
    // with the platform and its base-dir env vars pointing into the temp root.
    function loadDetectForWindows(): typeof import("../features/icp/detect") {
        const saved = { APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA, PROGRAMFILES: process.env.PROGRAMFILES };
        setPlatform("win32");
        process.env.APPDATA = path.join(root, "appdata");
        process.env.LOCALAPPDATA = path.join(root, "localappdata");
        process.env.PROGRAMFILES = path.join(root, "programfiles");
        let mod: typeof import("../features/icp/detect");
        jest.isolateModules(() => {
            mod = require("../features/icp/detect");
        });
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        return mod!;
    }

    it.each([
        ["a direct components/icp layout", ["components", "icp"]],
        ["a wso2-integrator-* directory", ["wso2-integrator-1.2.0", "components", "icp"]],
        ["a WSO2 Integrator*.app bundle", ["WSO2 Integrator 1.2.app", "Contents", "components", "icp"]],
    ])("finds %s under a base directory", (_label, segments) => {
        const detect = loadDetectForWindows();
        const script = makeIcpBin(root, "localappdata", "WSO2", "Integrator", ...segments);

        expect(detect.detectICPPath()).toBe(script);
    });

    it("returns nothing when the base directories hold no install", () => {
        const detect = loadDetectForWindows();
        fs.mkdirSync(path.join(root, "localappdata", "WSO2", "Integrator", "unrelated"), { recursive: true });

        expect(detect.detectICPPath()).toBeUndefined();
    });
});

describe("detectICPPath on the current platform", () => {
    it("returns nothing when no source yields a path", () => {
        expect(detectICPPath()).toBeUndefined();
    });
});
