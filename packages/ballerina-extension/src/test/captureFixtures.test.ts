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

// Unit tests for the capture script's fixture-organizing logic (the VSCode run step is
// validated on a machine with the distro; this covers the dedupe/manifest logic).

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { organizeFixtures } = require("../../scripts/capture-fixtures");

function writeFixture(dir: string, kind: string, slug: string, idx: number, payload: any) {
    const d = path.join(dir, kind, slug);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, `${String(idx).padStart(4, "0")}.json`), JSON.stringify(payload));
}

describe("organizeFixtures", () => {
    let raw: string;

    beforeEach(() => {
        raw = fs.mkdtempSync(path.join(os.tmpdir(), "capfix-"));
    });
    afterEach(() => {
        fs.rmSync(raw, { recursive: true, force: true });
    });

    it("dedupes fixtures with identical (request, response) and counts total vs unique", () => {
        const method = "flowDesignService/getFlowModel";
        const slug = "flowDesignService.getFlowModel";
        // two identical + one distinct response
        writeFixture(raw, "ls", slug, 1, { kind: "ls", method, request: { a: 1 }, response: { nodes: [] } });
        writeFixture(raw, "ls", slug, 2, { kind: "ls", method, request: { a: 1 }, response: { nodes: [] } });
        writeFixture(raw, "ls", slug, 3, { kind: "ls", method, request: { a: 2 }, response: { nodes: [1] } });

        const manifest = organizeFixtures(raw);
        expect(manifest).toHaveLength(1);
        expect(manifest[0]).toMatchObject({ kind: "ls", method, slug, total: 3, unique: 2 });
        expect(manifest[0].samples).toHaveLength(2);
    });

    it("covers both ls and rpc kinds and sorts the manifest", () => {
        writeFixture(raw, "rpc", "getFlowModel", 1, { kind: "rpc", method: "getFlowModel", request: {}, response: {} });
        writeFixture(raw, "ls", "textDocument.documentSymbol", 1, {
            kind: "ls",
            method: "textDocument/documentSymbol",
            request: {},
            response: [],
        });

        const manifest = organizeFixtures(raw);
        expect(manifest.map((m: any) => `${m.kind}/${m.method}`)).toEqual([
            "ls/textDocument/documentSymbol",
            "rpc/getFlowModel",
        ]);
    });

    it("returns an empty manifest for a dir with no fixtures", () => {
        expect(organizeFixtures(raw)).toEqual([]);
    });

    it("skips unparseable JSON without throwing", () => {
        const d = path.join(raw, "rpc", "broken");
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, "0001.json"), "{ not json");
        writeFixture(raw, "rpc", "broken", 2, { kind: "rpc", method: "x", request: {}, response: { ok: true } });

        const manifest = organizeFixtures(raw);
        expect(manifest[0]).toMatchObject({ kind: "rpc", total: 2, unique: 1 });
    });
});
