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

// L1 — the project files behind the ICP toggle (`rpc-managers/icp-service/icp-files`).
// The toggle must refuse before writing anything when it could not finish (no Ballerina.toml,
// unsaved main.bal), and ICP counts as enabled only when both the bridge import and the build
// options are in place, so a half-done enable (issue #2817) never reads as enabled.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { addICPBuildOptions } from "../rpc-managers/icp-service/build-options";
import {
    buildAddImportsTextEdits,
    buildRemoveImportsTextEdits,
    checkCanToggleICP,
    ICP_BRIDGE_IMPORT,
    ICP_IMPORTS,
    isICPEnabledOnDisk,
} from "../rpc-managers/icp-service/icp-files";

const MANIFEST = `[package]\norg = "acme"\nname = "orders"\nversion = "0.1.0"\n`;
const MAIN_BAL = `import ballerina/http;\n\nlistener http:Listener l = new (9090);\n`;

let projectDir: string;
beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "icp-files-test-"));
});
afterEach(() => { fs.rmSync(projectDir, { recursive: true, force: true }); });

function write(name: string, content: string): void {
    fs.writeFileSync(path.join(projectDir, name), content);
}

const nothingUnsaved = () => false;

describe("checkCanToggleICP", () => {
    it("refuses a project with no Ballerina.toml", () => {
        write("main.bal", MAIN_BAL);
        expect(() => checkCanToggleICP(projectDir, nothingUnsaved)).toThrow(/Ballerina\.toml not found/);
    });

    it.each(["main.bal", "Ballerina.toml", "Config.toml"])("refuses while %s has unsaved changes", name => {
        write("Ballerina.toml", MANIFEST);
        write("main.bal", MAIN_BAL);
        const unsaved = path.join(projectDir, name);
        expect(() => checkCanToggleICP(projectDir, filePath => filePath === unsaved)).toThrow(/unsaved changes/);
    });

    it("allows a project with a Ballerina.toml and nothing unsaved", () => {
        write("Ballerina.toml", MANIFEST);
        expect(() => checkCanToggleICP(projectDir, nothingUnsaved)).not.toThrow();
    });
});

describe("isICPEnabledOnDisk", () => {
    const enabledMainBal = `${ICP_IMPORTS.join("\n")}\n${MAIN_BAL}`;

    it.each([
        ["neither half", MAIN_BAL, MANIFEST, false],
        ["only the bridge import (issue #2817)", enabledMainBal, MANIFEST, false],
        ["a commented-out bridge import", `// ${ICP_BRIDGE_IMPORT}\n${MAIN_BAL}`, addICPBuildOptions(MANIFEST), false],
        ["only the build options", MAIN_BAL, addICPBuildOptions(MANIFEST), false],
        ["both halves", enabledMainBal, addICPBuildOptions(MANIFEST), true],
    ])("with %s is %s", (_label, mainBal, manifest, expected) => {
        write("main.bal", mainBal);
        write("Ballerina.toml", manifest);
        expect(isICPEnabledOnDisk(projectDir)).toBe(expected);
    });

    it("is false when main.bal or Ballerina.toml is missing", () => {
        write("Ballerina.toml", addICPBuildOptions(MANIFEST));
        expect(isICPEnabledOnDisk(projectDir)).toBe(false);
        fs.rmSync(path.join(projectDir, "Ballerina.toml"));
        write("main.bal", `${ICP_BRIDGE_IMPORT}\n`);
        expect(isICPEnabledOnDisk(projectDir)).toBe(false);
    });
});

describe("buildAddImportsTextEdits", () => {
    it("inserts the imports after the last import", () => {
        write("main.bal", MAIN_BAL);
        const [edit] = buildAddImportsTextEdits(projectDir)[path.join(projectDir, "main.bal")];
        expect(edit.range.start).toEqual({ line: 1, character: 0 });
        expect(edit.newText).toBe(`${ICP_IMPORTS.join("\n")}\n`);
    });

    // An integration with no main.bal still needs the bridge import for ICP to see it.
    it("inserts the imports at the start of a main.bal that does not exist yet", () => {
        const [edit] = buildAddImportsTextEdits(projectDir)[path.join(projectDir, "main.bal")];
        expect(edit.range.start).toEqual({ line: 0, character: 0 });
        expect(edit.newText).toBe(`${ICP_IMPORTS.join("\n")}\n`);
    });

    it("adds an import that is only there commented out", () => {
        write("main.bal", `${ICP_IMPORTS.map(imp => `// ${imp}`).join("\n")}\n${MAIN_BAL}`);
        const [edit] = buildAddImportsTextEdits(projectDir)[path.join(projectDir, "main.bal")];
        expect(edit.newText).toBe(`${ICP_IMPORTS.join("\n")}\n`);
    });

    it("adds nothing when the imports are already there", () => {
        write("main.bal", `${ICP_IMPORTS.join("\n")}\n${MAIN_BAL}`);
        expect(buildAddImportsTextEdits(projectDir)).toEqual({});
    });
});

describe("buildRemoveImportsTextEdits", () => {
    it("removes an import with a trailing comment and leaves a commented-out one", () => {
        write("main.bal", `${ICP_BRIDGE_IMPORT} // icp\n// ${ICP_IMPORTS[1]}\n${MAIN_BAL}`);
        const edits = buildRemoveImportsTextEdits(projectDir)[path.join(projectDir, "main.bal")];
        expect(edits.map(edit => edit.range.start.line)).toEqual([0]);
    });
});
