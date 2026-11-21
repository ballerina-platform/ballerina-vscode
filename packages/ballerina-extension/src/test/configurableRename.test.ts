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

/**
 * @jest-environment node
 *
 * Renaming a configurable renames its Config.toml key too. The language server works the edits out from the files as
 * saved, so an open Config.toml with unsaved changes is saved first; and when the key can't be renamed, the caller is
 * told why and renames nothing, so a configurable never ends up renamed without its value.
 */

import { workspace } from "vscode";
import type { ConfigurableRenameEditsRequest, ConfigurableRenameEditsResponse } from "@wso2/ballerina-core";
import { configTomlRenameEdits, saveOpenConfigTomls } from "../rpc-managers/bi-diagram/configurable-rename";

type OpenDocument = { fileName: string; isDirty: boolean; save: jest.Mock<Promise<boolean>, []> };

const REQUEST: ConfigurableRenameEditsRequest = {
    filePath: "/project/config.bal", name: "sfToken", newName: "salesforceToken"
};
const EDIT = {
    range: { start: { line: 3, character: 0 }, end: { line: 3, character: 7 } }, newText: "salesforceToken"
};

function open(fileName: string, isDirty: boolean, saves = true): OpenDocument {
    return { fileName, isDirty, save: jest.fn(async () => saves) };
}

function setOpenDocuments(documents: OpenDocument[]) {
    (workspace as unknown as { textDocuments: OpenDocument[] }).textDocuments = documents;
}

afterEach(() => setOpenDocuments([]));

describe("configTomlRenameEdits", () => {
    it("returns the language server's Config.toml edits, by file", async () => {
        const fetchEdits = jest.fn(async (): Promise<ConfigurableRenameEditsResponse> =>
            ({ textEdits: { "/project/Config.toml": [EDIT] } }));
        expect(await configTomlRenameEdits(REQUEST, fetchEdits)).toEqual({ edits: { "/project/Config.toml": [EDIT] } });
        expect(fetchEdits).toHaveBeenCalledWith(REQUEST);
    });

    it("has nothing to rename when Config.toml has no value for the configurable", async () => {
        expect(await configTomlRenameEdits(REQUEST, async () => ({ textEdits: {} }))).toEqual({ edits: {} });
    });

    it("saves an open Config.toml with unsaved changes before the edits are worked out from disk", async () => {
        const configToml = open("/project/Config.toml", true);
        const testsConfigToml = open("/project/tests/Config.toml", true);
        const source = open("/project/main.bal", true);
        const clean = open("/other/Config.toml", false);
        setOpenDocuments([configToml, testsConfigToml, source, clean]);
        const order: string[] = [];
        configToml.save.mockImplementation(async () => { order.push("save"); return true; });
        await configTomlRenameEdits(REQUEST, async () => { order.push("edits"); return { textEdits: {} }; });

        expect(order).toEqual(["save", "edits"]);
        expect(testsConfigToml.save).toHaveBeenCalled();
        expect(source.save).not.toHaveBeenCalled();
        expect(clean.save).not.toHaveBeenCalled();
    });

    it("INVARIANT: refuses, without asking for edits, when an open Config.toml can't be saved", async () => {
        setOpenDocuments([open("/project/Config.toml", true, false)]);
        const fetchEdits = jest.fn(async (): Promise<ConfigurableRenameEditsResponse> => ({ textEdits: {} }));
        expect(await configTomlRenameEdits(REQUEST, fetchEdits))
            .toEqual({ error: "Config.toml has unsaved changes that could not be saved." });
        expect(fetchEdits).not.toHaveBeenCalled();
    });

    it("INVARIANT: refuses when the language server can't rename the key, saying why", async () => {
        const refused = "Config.toml already has a value for 'salesforceToken'. Choose another name, or remove that "
            + "value from Config.toml.";
        expect(await configTomlRenameEdits(REQUEST, async () => ({ errorMsg: refused }))).toEqual({ error: refused });
        expect(await configTomlRenameEdits(REQUEST, async () => undefined as unknown as ConfigurableRenameEditsResponse))
            .toEqual({ error: "The language server did not answer." });
    });
});

describe("saveOpenConfigTomls", () => {
    it("saves only the given project's Config.toml files", async () => {
        const own = open("/project/Config.toml", true);
        const ownTests = open("/project/tests/Config.toml", true);
        const other = open("/other/Config.toml", true, false);
        const sibling = open("/project-b/Config.toml", true);
        setOpenDocuments([own, ownTests, other, sibling]);

        expect(await saveOpenConfigTomls("/project")).toBeUndefined();
        expect(own.save).toHaveBeenCalled();
        expect(ownTests.save).toHaveBeenCalled();
        expect(other.save).not.toHaveBeenCalled();
        expect(sibling.save).not.toHaveBeenCalled();
    });

    it("takes a Config.toml saved in the meantime as saved", async () => {
        const savedMeanwhile = open("/project/Config.toml", true, false);
        savedMeanwhile.save.mockImplementation(async () => { savedMeanwhile.isDirty = false; return false; });
        setOpenDocuments([savedMeanwhile]);
        expect(await saveOpenConfigTomls("/project")).toBeUndefined();
    });
});
