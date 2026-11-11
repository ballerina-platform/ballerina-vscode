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
 * `bal pack` writes more than the bala into target/bala (e.g. a `.cdx.json` SBOM),
 * so the push step must match the bala by extension rather than take the first entry.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getBalaPath } from "../rpc-managers/common/bala";

let projectDir: string;
let balaDir: string;
beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "bala-path-test-"));
    balaDir = path.join(projectDir, "target", "bala");
});
afterEach(() => { fs.rmSync(projectDir, { recursive: true, force: true }); });

function writeFile(name: string): string {
    fs.mkdirSync(balaDir, { recursive: true });
    const filePath = path.join(balaDir, name);
    fs.writeFileSync(filePath, "");
    return filePath;
}

describe("getBalaPath", () => {
    it("skips the SBOM written next to the bala", () => {
        writeFile("alib1-0.1.0.cdx.json");
        const bala = writeFile("madusha-alib1-any-0.1.0.bala");
        expect(getBalaPath(projectDir)).toBe(bala);
    });

    it("ignores directories named like a bala", () => {
        fs.mkdirSync(path.join(balaDir, "extracted.bala"), { recursive: true });
        const bala = writeFile("madusha-alib1-any-0.1.0.bala");
        expect(getBalaPath(projectDir)).toBe(bala);
    });

    it("returns null when there is no bala to push", () => {
        expect(getBalaPath(projectDir)).toBeNull();
        writeFile("alib1-0.1.0.cdx.json");
        expect(getBalaPath(projectDir)).toBeNull();
    });
});
