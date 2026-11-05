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
import type { TextEdit } from "@wso2/ballerina-core";
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

const [BRIDGE, METRICS] = ICP_IMPORTS;

// Applies the edits the way a WorkspaceEdit does: every range refers to the original text.
function applyEdits(content: string, edits: TextEdit[] = []): string {
    const lineStarts = [0];
    for (let i = 0; i < content.length; i++) {
        if (content[i] === "\n") {
            lineStarts.push(i + 1);
        }
    }
    const offset = ({ line, character }: { line: number; character: number }) =>
        line < lineStarts.length ? lineStarts[line] + character : content.length;
    return [...edits]
        .sort((a, b) => offset(b.range.start) - offset(a.range.start))
        .reduce((text, edit) =>
            text.slice(0, offset(edit.range.start)) + edit.newText + text.slice(offset(edit.range.end)), content);
}

describe("checkCanToggleICP", () => {
    it("refuses a project with no Ballerina.toml", () => {
        write("main.bal", MAIN_BAL);
        expect(() => checkCanToggleICP(projectDir, nothingUnsaved, true)).toThrow(/Ballerina\.toml not found/);
    });

    it.each(["main.bal", "Ballerina.toml", "Config.toml"])("refuses while %s has unsaved changes", name => {
        write("Ballerina.toml", MANIFEST);
        write("main.bal", MAIN_BAL);
        const unsaved = path.join(projectDir, name);
        expect(() => checkCanToggleICP(projectDir, filePath => filePath === unsaved, true)).toThrow(/unsaved changes/);
    });

    // Both toggles rewrite Config.toml after main.bal and Ballerina.toml, so one that does not
    // parse must stop them before those are touched.
    it.each([true, false])("refuses a Config.toml that does not parse (enabling: %s)", enabling => {
        write("Ballerina.toml", MANIFEST);
        write("Config.toml", "[wso2.icp\nsecret = ");
        expect(() => checkCanToggleICP(projectDir, nothingUnsaved, enabling)).toThrow(/Config\.toml is not valid TOML/);
    });

    it("refuses to enable on a manifest with inline build-options, but still allows disabling", () => {
        write("Ballerina.toml", `build-options = { sticky = true }\n${MANIFEST}`);
        expect(() => checkCanToggleICP(projectDir, nothingUnsaved, true)).toThrow(/inline/);
        expect(() => checkCanToggleICP(projectDir, nothingUnsaved, false)).not.toThrow();
    });

    it.each([true, false])("allows a project with a valid manifest and nothing unsaved (enabling: %s)", enabling => {
        write("Ballerina.toml", MANIFEST);
        write("Config.toml", `[wso2.icp.runtime.bridge]\nenvironment = "dev"\n`);
        expect(() => checkCanToggleICP(projectDir, nothingUnsaved, enabling)).not.toThrow();
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
        ["the bridge import after another import on its line", `import ballerina/io; ${BRIDGE}\n${MAIN_BAL}`,
            addICPBuildOptions(MANIFEST), true],
        ["the bridge import spaced differently", `import  wso2/icp.runtime.bridge as _ ;\n${MAIN_BAL}`,
            addICPBuildOptions(MANIFEST), true],
        ["the bridge import only after a declaration", `${MAIN_BAL}// x\nstring s = "${BRIDGE}";\n`,
            addICPBuildOptions(MANIFEST), false],
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

    it("adds no second copy of an import that follows another import on its line", () => {
        write("main.bal", `import ballerina/io; ${BRIDGE}\n${MAIN_BAL}`);
        const [edit] = buildAddImportsTextEdits(projectDir)[path.join(projectDir, "main.bal")];
        expect(edit.newText).toBe(`${METRICS}\n`);
        expect(edit.range.start).toEqual({ line: 2, character: 0 });
    });

    it("puts the imports on lines of their own when the last import ends the file", () => {
        const mainBal = "import ballerina/http;";
        write("main.bal", mainBal);
        const edits = buildAddImportsTextEdits(projectDir)[path.join(projectDir, "main.bal")];
        expect(applyEdits(mainBal, edits)).toBe(`import ballerina/http;\n${ICP_IMPORTS.join("\n")}`);
    });

    // Imports must precede every other declaration, so they cannot go after source sharing the line.
    it.each([
        ["with a newline after it", "import ballerina/http; function f() {}\n"],
        ["at the end of the file", "import ballerina/http; function f() {}"],
    ])("puts the imports before source on the last import's line %s", (_label, mainBal) => {
        write("main.bal", mainBal);
        const edits = buildAddImportsTextEdits(projectDir)[path.join(projectDir, "main.bal")];
        expect(applyEdits(mainBal, edits))
            .toBe(mainBal.replace("import ballerina/http;", `import ballerina/http;\n${ICP_IMPORTS.join("\n")}\n`));
    });

    it("writes the imports with the CRLF line endings of main.bal", () => {
        const mainBal = MAIN_BAL.replace(/\n/g, "\r\n");
        write("main.bal", mainBal);
        const edits = buildAddImportsTextEdits(projectDir)[path.join(projectDir, "main.bal")];
        expect(applyEdits(mainBal, edits))
            .toBe(`import ballerina/http;\r\n${ICP_IMPORTS.join("\r\n")}\r\n\r\nlistener http:Listener l = new (9090);\r\n`);
    });

    it("adds nothing when the imports are already there", () => {
        write("main.bal", `${ICP_IMPORTS.join("\n")}\n${MAIN_BAL}`);
        expect(buildAddImportsTextEdits(projectDir)).toEqual({});
    });
});

describe("buildRemoveImportsTextEdits", () => {
    const BODY = `\nlistener http:Listener l = new (9090);\n`;

    it.each([
        ["imports on lines of their own", `import ballerina/http;\n${BRIDGE}\n${METRICS}\n${BODY}`,
            `import ballerina/http;\n${BODY}`],
        ["an import with a trailing comment", `import ballerina/http;\n${BRIDGE} // icp\n${BODY}`,
            `import ballerina/http;\n${BODY}`],
        ["both imports on one line", `import ballerina/http;\n${BRIDGE} ${METRICS}\n${BODY}`,
            `import ballerina/http;\n${BODY}`],
        ["an import after another import on its line", `import ballerina/http; ${BRIDGE}\n${METRICS}\n${BODY}`,
            `import ballerina/http;\n${BODY}`],
        ["an import before another import on its line", `${BRIDGE} import ballerina/http;\n${BODY}`,
            `import ballerina/http;\n${BODY}`],
        ["an import between two others", `import ballerina/http; ${BRIDGE} import ballerina/io;\n${BODY}`,
            `import ballerina/http; import ballerina/io;\n${BODY}`],
        ["a commented-out import", `import ballerina/http;\n// ${BRIDGE}\n${BRIDGE}\n${BODY}`,
            `import ballerina/http;\n// ${BRIDGE}\n${BODY}`],
        ["import text after the imports", `${BRIDGE}\nimport ballerina/http;\nstring s = "${METRICS}";\n`,
            `import ballerina/http;\nstring s = "${METRICS}";\n`],
        ["the last line with no newline", `import ballerina/http;\n${BRIDGE}`, `import ballerina/http;\n`],
        ["a CRLF main.bal", `import ballerina/http; ${BRIDGE}\r\n${METRICS}\r\n${BODY.replace(/\n/g, "\r\n")}`,
            `import ballerina/http;\r\n${BODY.replace(/\n/g, "\r\n")}`],
    ])("removes only the ICP imports from %s", (_label, mainBal, expected) => {
        write("main.bal", mainBal);
        const edits = buildRemoveImportsTextEdits(projectDir)[path.join(projectDir, "main.bal")];
        expect(applyEdits(mainBal, edits)).toBe(expected);
    });

    it("removes nothing when there is no ICP import", () => {
        write("main.bal", MAIN_BAL);
        expect(buildRemoveImportsTextEdits(projectDir)).toEqual({});
    });

    it("round-trips: enabling then disabling leaves main.bal as it was", () => {
        const mainBal = `import ballerina/http; import ballerina/io;\n${BODY}`;
        write("main.bal", mainBal);
        const enabled = applyEdits(mainBal, buildAddImportsTextEdits(projectDir)[path.join(projectDir, "main.bal")]);
        write("main.bal", enabled);
        const edits = buildRemoveImportsTextEdits(projectDir)[path.join(projectDir, "main.bal")];
        expect(applyEdits(enabled, edits)).toBe(mainBal);
    });
});
