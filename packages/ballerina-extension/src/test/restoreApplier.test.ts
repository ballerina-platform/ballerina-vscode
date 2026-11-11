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
import { Uri, window, workspace } from "./__mocks__/vscode";

jest.mock("../rpc-managers/visualizer/rpc-manager", () => ({
    VisualizerRpcManager: class {
        updateCurrentArtifactLocation() {}
    },
}));
jest.mock("../stateMachine", () => ({
    StateMachine: { context: () => ({}) },
    updateView: () => {},
}));
jest.mock("../rpc-managers/data-mapper/utils", () => ({
    refreshDataMapper: () => Promise.resolve(),
}));
jest.mock("../RPCLayer", () => ({
    notifyCurrentWebview: () => {},
    suppressWebviewNotifications: () => () => {},
}));

import { applyRestorePlan } from "../views/ai-panel/checkpoint/restoreApplier";
import type { RestorePlan } from "../views/ai-panel/checkpoint/types";

const RAW_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x80]);

describe("applyRestorePlan", () => {
    let root: string;
    let warnings: string[];
    let infos: string[];
    let modalPrompts: string[];
    let applied: unknown[];

    const at = (name: string) => path.join(root, name);
    const plan = (overrides: Partial<RestorePlan> = {}): RestorePlan => ({
        root: Uri.file(root) as never,
        writes: new Map(),
        deletes: [],
        notRestored: [],
        ...overrides,
    });

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "restore-applier-"));
        warnings = [];
        infos = [];
        modalPrompts = [];
        applied = [];
        workspace.textDocuments = [];
        workspace.workspaceFolders = [{ uri: Uri.file(root) }];
        workspace.applyEdit = (edit: unknown) => {
            applied.push(...(edit as { entries: unknown[] }).entries);
            return Promise.resolve(true);
        };
        workspace.saveAll = () => Promise.resolve(true);
        window.showWarningMessage = ((message: string, ...rest: unknown[]) => {
            const isModal = typeof rest[0] === "object" && rest[0] !== null;
            if (isModal) {
                modalPrompts.push(message);
            } else {
                warnings.push(message);
            }
            return Promise.resolve(isModal ? (rest[1] as string) : undefined);
        }) as never;
        window.showInformationMessage = ((message: string) => {
            infos.push(message);
            return Promise.resolve(undefined);
        }) as never;
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("writes a non-.bal Buffer back byte for byte", async () => {
        fs.writeFileSync(at("logo.png"), "changed by the generation");

        await expect(applyRestorePlan(plan({ writes: new Map([["logo.png", RAW_BYTES]]) }), { skipArtifactWait: true }))
            .resolves.toBe(true);

        expect(fs.readFileSync(at("logo.png")).equals(RAW_BYTES)).toBe(true);
        expect(warnings).toEqual([]);
    });

    it("does not rewrite a non-.bal Buffer that already matches the disk", async () => {
        fs.writeFileSync(at("logo.png"), RAW_BYTES);
        const past = new Date(2020, 0, 1);
        fs.utimesSync(at("logo.png"), past, past);

        await expect(applyRestorePlan(plan({ writes: new Map([["logo.png", RAW_BYTES]]) }), { skipArtifactWait: true }))
            .resolves.toBe(true);

        expect(fs.statSync(at("logo.png")).mtimeMs).toBe(past.getTime());
        expect(fs.readFileSync(at("logo.png")).equals(RAW_BYTES)).toBe(true);
    });

    it("refuses a .bal Buffer that is not lossless UTF-8 and names it as not restored", async () => {
        fs.writeFileSync(at("main.bal"), "// the generation's edit\n");

        await expect(applyRestorePlan(plan({ writes: new Map([["main.bal", RAW_BYTES]]) }), { skipArtifactWait: true }))
            .resolves.toBe(true);

        expect(applied).toEqual([]);
        expect(fs.readFileSync(at("main.bal"), "utf8")).toBe("// the generation's edit\n");
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("main.bal");
    });

    it("names the plan's own not-restored paths in the final message", async () => {
        await expect(applyRestorePlan(plan({ notRestored: ["big/dataset.csv"] }), { skipArtifactWait: true }))
            .resolves.toBe(true);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("big/dataset.csv");
    });

    it("succeeds on an empty plan without prompting", async () => {
        await expect(applyRestorePlan(plan(), { skipArtifactWait: true })).resolves.toBe(true);

        expect(modalPrompts).toEqual([]);
        expect(warnings).toEqual([]);
        expect(infos).toEqual(["Checkpoint restored successfully"]);
    });
});
