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
// `ballerina.icpPath` setting, `WSO2_INTEGRATOR_ICP_HOME`, the ICP bundled with the
// running WSO2 Integrator app and the well-known install directories; the one-time
// cleanup of paths cached inside the app; and the rule that auto-detected paths are
// never written back to settings.

jest.mock("../utils/logger", () => ({ log: jest.fn() }));

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import { resolveICPPath, detectICPPath, ICP_HOME_ENV, WI_RUNTIME_ENV } from "../features/icp/detect";
import { log } from "../utils/logger";

const win = vscode.window as any;
const ws = vscode.workspace as any;
const vsEnv = vscode.env as any;
const cmds = vscode.commands as any;
const originals = {
    showErrorMessage: win.showErrorMessage,
    getConfiguration: ws.getConfiguration,
    appRoot: vsEnv.appRoot,
    executeCommand: cmds.executeCommand,
    platform: Object.getOwnPropertyDescriptor(process, "platform")!,
    icpHome: process.env[ICP_HOME_ENV],
    wiRuntime: process.env[WI_RUNTIME_ENV],
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

function restoreEnv(key: string, value: string | undefined): void {
    if (value === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = value;
    }
}

let root: string;
let settingValue: string | undefined;
let settingScope: "global" | "workspace";
/** A user-level value sitting under a workspace-level `settingValue`. */
let userLevelValue: string | undefined;
let updateError: Error | undefined;
let settingUpdates: unknown[][];
let prompts: { message: string; items: string[] }[];
let promptAnswer: string | undefined;
let executedCommands: unknown[][];

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "icp-detect-"));
    settingValue = undefined;
    settingScope = "global";
    userLevelValue = undefined;
    updateError = undefined;
    settingUpdates = [];
    prompts = [];
    promptAnswer = undefined;
    executedCommands = [];
    delete process.env[ICP_HOME_ENV];
    delete process.env[WI_RUNTIME_ENV];
    vsEnv.appRoot = "";
    // A platform with no well-known install directories, so the scan can't find a
    // real install on the machine running the tests.
    setPlatform("freebsd");

    ws.getConfiguration = () => ({
        get: () => settingValue ?? userLevelValue,
        update: (...args: unknown[]) => {
            settingUpdates.push(args);
            return updateError ? Promise.reject(updateError) : Promise.resolve();
        },
        inspect: () =>
            settingScope === "workspace"
                ? { workspaceValue: settingValue, globalValue: userLevelValue }
                : { globalValue: settingValue },
    });
    win.showErrorMessage = (message: string, ...items: string[]) => {
        prompts.push({ message, items });
        return Promise.resolve(promptAnswer);
    };
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
    vsEnv.appRoot = originals.appRoot;
    cmds.executeCommand = originals.executeCommand;
    Object.defineProperty(process, "platform", originals.platform);
    restoreEnv(ICP_HOME_ENV, originals.icpHome);
    restoreEnv(WI_RUNTIME_ENV, originals.wiRuntime);
});

/** Makes `<root>/<install>` the running editor's install root and returns it. */
function runFromApp(install: string): string {
    const appRoot = path.join(root, install, "resources", "app");
    fs.mkdirSync(appRoot, { recursive: true });
    vsEnv.appRoot = appRoot;
    return path.join(root, install);
}

/** Runs inside WSO2 Integrator installed at `<root>/<install>`, as its launcher would set up. */
function runInsideWI(install: string): string {
    process.env[WI_RUNTIME_ENV] = "true";
    return runFromApp(install);
}

/** Points `WSO2_INTEGRATOR_ICP_HOME` at a fresh ICP under `<root>/<dir>` and returns its script. */
function useIcpHome(dir: string): string {
    const script = makeIcpBin(root, dir);
    process.env[ICP_HOME_ENV] = path.join(root, dir);
    return script;
}

const cleared = (target: vscode.ConfigurationTarget) => ["icpPath", undefined, target];

describe("resolveICPPath precedence", () => {
    it("uses a configured path that exists even when WSO2_INTEGRATOR_ICP_HOME is valid", async () => {
        settingValue = makeIcpBin(root, "configured");
        useIcpHome("env-home");

        await expect(resolveICPPath()).resolves.toBe(settingValue);
        expect(prompts).toEqual([]);
        expect(settingUpdates).toEqual([]);
    });

    it("uses WSO2_INTEGRATOR_ICP_HOME/bin/<script> without writing it to settings", async () => {
        const envScript = useIcpHome("env-home");

        await expect(resolveICPPath()).resolves.toBe(envScript);
        expect(prompts).toEqual([]);
        expect(settingUpdates).toEqual([]);
    });

    it("prefers WSO2_INTEGRATOR_ICP_HOME over the ICP bundled with the running app", async () => {
        makeIcpBin(runInsideWI("wi-install"), "components", "icp");
        const envScript = useIcpHome("env-home");

        await expect(resolveICPPath()).resolves.toBe(envScript);
    });

    it("follows WSO2_INTEGRATOR_ICP_HOME to a new install while the old one is still on disk", async () => {
        const first = useIcpHome("icp-1.0");
        await expect(resolveICPPath()).resolves.toBe(first);

        const second = useIcpHome("icp-1.1");
        await expect(resolveICPPath()).resolves.toBe(second);
        expect(prompts).toEqual([]);
        expect(settingUpdates).toEqual([]);
    });

    it("falls back to the ICP bundled with the running app when the env var is unset", async () => {
        const appScript = makeIcpBin(runInsideWI("wi-install"), "components", "icp");

        await expect(resolveICPPath()).resolves.toBe(appScript);
        expect(settingUpdates).toEqual([]);
    });

    it("finds the bundled ICP from the app root, not from where extensions are installed", async () => {
        // Extensions updated into the user's data folder don't move the app itself.
        const appScript = makeIcpBin(runFromApp("wi-install"), "components", "icp");
        fs.mkdirSync(path.join(root, "home", ".wso2-integrator", "extensions"), { recursive: true });

        expect(detectICPPath()).toBe(appScript);
    });

    it("logs and skips a WSO2_INTEGRATOR_ICP_HOME that has no bin/<script>", async () => {
        const appScript = makeIcpBin(runInsideWI("wi-install"), "components", "icp");
        const emptyHome = path.join(root, "empty-home");
        fs.mkdirSync(emptyHome);
        process.env[ICP_HOME_ENV] = emptyHome;

        await expect(resolveICPPath()).resolves.toBe(appScript);
        expect(log).toHaveBeenCalledTimes(1);
        const message = (log as jest.Mock).mock.calls[0][0] as string;
        expect(message).toContain(ICP_HOME_ENV);
        expect(message).toContain(path.join(emptyHome, "bin", scriptName()));
    });

    it("shows the not-installed prompt when nothing is found", async () => {
        process.env[ICP_HOME_ENV] = path.join(root, "missing-home");

        await expect(resolveICPPath()).resolves.toBeUndefined();
        expect(prompts).toHaveLength(1);
        expect(prompts[0].message).toContain("not installed");
        expect(settingUpdates).toEqual([]);
    });
});

describe("one-time cleanup of a setting inside the running WSO2 Integrator app", () => {
    it("clears a cached path inside the app even though it still exists, and detects afresh", async () => {
        settingValue = makeIcpBin(runInsideWI("wi-install"), "components", "icp");
        const envScript = useIcpHome(path.join("data", "components", "icp"));

        await expect(resolveICPPath()).resolves.toBe(envScript);
        expect(settingUpdates).toEqual([cleared(vscode.ConfigurationTarget.Global)]);
        expect(prompts).toEqual([]);
    });

    it("clears a cached path inside the app that is gone, without the missing-path prompt", async () => {
        const installRoot = runInsideWI("wi-install");
        settingValue = path.join(installRoot, "components", "icp", "bin", scriptName());

        await expect(resolveICPPath()).resolves.toBeUndefined();
        expect(settingUpdates).toEqual([cleared(vscode.ConfigurationTarget.Global)]);
        expect(prompts).toHaveLength(1);
        expect(prompts[0].message).toContain("not installed");
    });

    it("clears cached paths in both workspace and user settings", async () => {
        const installRoot = runInsideWI("wi-install");
        settingScope = "workspace";
        settingValue = path.join(installRoot, "components", "icp", "bin", scriptName());
        userLevelValue = makeIcpBin(installRoot, "components", "icp");
        const envScript = useIcpHome("env-home");

        await expect(resolveICPPath()).resolves.toBe(envScript);
        expect(settingUpdates).toEqual([
            cleared(vscode.ConfigurationTarget.Workspace),
            cleared(vscode.ConfigurationTarget.Global),
        ]);
    });

    it("clears a cached workspace value and falls back to a custom user-level one", async () => {
        const installRoot = runInsideWI("wi-install");
        settingScope = "workspace";
        settingValue = path.join(installRoot, "components", "icp", "bin", scriptName());
        userLevelValue = makeIcpBin(root, "custom");

        await expect(resolveICPPath()).resolves.toBe(userLevelValue);
        expect(settingUpdates).toEqual([cleared(vscode.ConfigurationTarget.Workspace)]);
    });

    it("keeps a path in another WSO2 Integrator install outside the running app", async () => {
        runInsideWI("wi-install");
        settingValue = makeIcpBin(root, "opt", "wso2-integrator-1.2.0", "components", "icp");
        useIcpHome("env-home");

        await expect(resolveICPPath()).resolves.toBe(settingValue);
        expect(settingUpdates).toEqual([]);
    });

    it("keeps a path in a sibling folder that merely shares the app's name prefix", async () => {
        runInsideWI("wi-install");
        settingValue = makeIcpBin(root, "wi-install-old", "components", "icp");

        await expect(resolveICPPath()).resolves.toBe(settingValue);
        expect(settingUpdates).toEqual([]);
    });

    it("leaves the setting alone outside WSO2 Integrator, even under the editor's app root", async () => {
        settingValue = makeIcpBin(runFromApp("vscode-install"), "components", "icp");

        await expect(resolveICPPath()).resolves.toBe(settingValue);
        expect(settingUpdates).toEqual([]);
    });

    it("still returns the detected path when clearing the setting fails", async () => {
        settingValue = makeIcpBin(runInsideWI("wi-install"), "components", "icp");
        const envScript = useIcpHome("env-home");
        updateError = new Error("settings.json has errors");

        await expect(resolveICPPath()).resolves.toBe(envScript);
        expect(log).toHaveBeenCalledWith(expect.stringContaining("settings.json has errors"));
    });
});

describe("resolveICPPath with a configured path that is missing", () => {
    beforeEach(() => {
        settingValue = path.join(root, "gone", "bin", scriptName());
    });

    it("tells the user the path is missing and offers Auto Detect in plain VS Code", async () => {
        await resolveICPPath();

        expect(prompts[0].message).toContain(settingValue);
        expect(prompts[0].items).toEqual(["Auto Detect", "Open Settings"]);
    });

    it("offers Use Default ICP inside WSO2 Integrator", async () => {
        runInsideWI("wi-install");

        await resolveICPPath();

        expect(prompts[0].message).toContain(settingValue);
        expect(prompts[0].items).toEqual(["Use Default ICP", "Open Settings"]);
    });

    it("Use Default ICP clears the setting and starts the launcher's ICP", async () => {
        runInsideWI("wi-install");
        const envScript = useIcpHome("data-icp");
        promptAnswer = "Use Default ICP";

        await expect(resolveICPPath()).resolves.toBe(envScript);
        expect(settingUpdates).toEqual([cleared(vscode.ConfigurationTarget.Global)]);
    });

    it("Auto Detect clears the setting and returns the detected path", async () => {
        const envScript = useIcpHome("env-home");
        promptAnswer = "Auto Detect";

        await expect(resolveICPPath()).resolves.toBe(envScript);
        expect(prompts).toHaveLength(1);
        expect(settingUpdates).toEqual([cleared(vscode.ConfigurationTarget.Global)]);
    });

    it("clears a workspace-level value at the workspace scope", async () => {
        settingScope = "workspace";
        useIcpHome("env-home");
        promptAnswer = "Auto Detect";

        await resolveICPPath();
        expect(settingUpdates).toEqual([cleared(vscode.ConfigurationTarget.Workspace)]);
    });

    it("uses a valid user-level path left behind the cleared workspace value", async () => {
        settingScope = "workspace";
        userLevelValue = makeIcpBin(root, "custom");
        useIcpHome("env-home");
        promptAnswer = "Auto Detect";

        await expect(resolveICPPath()).resolves.toBe(userLevelValue);
        expect(settingUpdates).toEqual([cleared(vscode.ConfigurationTarget.Workspace)]);
    });

    it("with nothing installed falls through to the not-installed prompt", async () => {
        promptAnswer = "Auto Detect";

        await expect(resolveICPPath()).resolves.toBeUndefined();
        expect(prompts).toHaveLength(2);
        expect(prompts[1].message).toContain("not installed");
    });

    it("dismissing the prompt returns nothing and leaves the setting alone", async () => {
        useIcpHome("env-home");

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
            restoreEnv(key, value);
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

describe("detectICPPath on a platform with no install directories", () => {
    it("returns nothing when neither the env var nor the app root yields a path", () => {
        expect(detectICPPath()).toBeUndefined();
    });
});
