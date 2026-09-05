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
 * A corrupt cached BIR makes projects load empty. The LS sends a
 * `projectService/corruptBirCache` notification with the affected module's coordinates and the
 * running distribution version; the client clears that module's compiled cache under
 * cache-<distVersion>. These L1 tests pin two invariants: (1) only a well-formed module coordinate
 * is accepted (a malformed/hostile payload can never become an fs path); (2) the clear removes ONLY
 * the affected module's compiled cache and only under the active distribution's cache-<distVersion>
 * — never other distributions, the pulled bala/, other modules or versions, or the distribution
 * itself.
 *
 * The clear invariant is table-driven from JSON fixtures under fixtures/bir-cache/ (see
 * docs/TEST_PLAN.md §5). Each fixture materializes a realistic ~/.ballerina tree in a temp home,
 * runs the real clear against it, and asserts what is resolved, removed, and kept. Add a fixture
 * (e.g. issue-2251.json) to guard a new case.
 */

import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { loadFixtures } from "@wso2/test-config/fixtures";
import { CorruptModule, isValidModule, resolveModuleCacheDirs, clearModuleBirCache } from "../utils/bir-cache-recovery";

describe("isValidModule", () => {
    it("accepts a well-formed coordinate", () => {
        expect(isValidModule({ org: "ballerina", name: "ai", version: "1.14.1" })).toBe(true);
        expect(isValidModule({ org: "ballerinax", name: "aws.s3", version: "2.1.0" })).toBe(true);
    });

    it("rejects missing or empty segments", () => {
        expect(isValidModule(null)).toBe(false);
        expect(isValidModule(undefined)).toBe(false);
        expect(isValidModule({ org: "ballerina", name: "ai" })).toBe(false);
        expect(isValidModule({ org: "ballerina", name: "ai", version: "" })).toBe(false);
    });

    it("rejects path-traversal / unsafe segments", () => {
        expect(isValidModule({ org: "ballerina", name: "ai", version: ".." })).toBe(false);
        expect(isValidModule({ org: "..", name: "ai", version: "1.0.0" })).toBe(false);
        expect(isValidModule({ org: "ballerina", name: "a/i", version: "1.0.0" })).toBe(false);
        expect(isValidModule({ org: "ballerina", name: "ai", version: "1.0.0/../../etc" })).toBe(false);
    });
});

// A single clear scenario: seed `tree` under a temp ~/.ballerina, clear `module` (optionally scoped
// to `distVersion`), then assert the resolved/removed/kept paths. All paths are relative to the
// .ballerina root and use "/" separators (normalized per-OS below).
interface BirCacheFixture {
    description?: string;
    module: CorruptModule;
    distVersion?: string;
    tree: string[];
    expectedResolved?: string[];
    expectedRemoved: string[];
    expectedKept: string[];
}

const fixtures = loadFixtures<BirCacheFixture>(__dirname, "fixtures", "bir-cache");

describe("clearModuleBirCache (targeted, cache-only) — fixtures", () => {
    const toOsPath = (rel: string): string => path.join(...rel.split("/"));

    it("has fixtures to run", () => {
        expect(fixtures.length).toBeGreaterThan(0);
    });

    it.each(fixtures.map((f) => [f.name, f.data] as [string, BirCacheFixture]))("%s", async (_name, fx) => {
        const home = await fs.mkdtemp(path.join(os.tmpdir(), "bir-cache-test-"));
        const ballerinaDir = path.join(home, ".ballerina");
        const reposDir = path.join(ballerinaDir, "repositories");
        const relToBallerina = (abs: string): string => path.relative(ballerinaDir, abs);
        const exists = async (rel: string): Promise<boolean> => {
            try {
                await fs.stat(path.join(ballerinaDir, toOsPath(rel)));
                return true;
            } catch {
                return false;
            }
        };

        try {
            // Seed the realistic ~/.ballerina tree.
            for (const rel of fx.tree) {
                const full = path.join(ballerinaDir, toOsPath(rel));
                await fs.mkdir(path.dirname(full), { recursive: true });
                await fs.writeFile(full, "x");
            }

            if (fx.expectedResolved) {
                const resolved = await resolveModuleCacheDirs(reposDir, fx.module, fx.distVersion);
                expect(resolved.map(relToBallerina).sort()).toEqual(fx.expectedResolved.map(toOsPath).sort());
            }

            const removed = await clearModuleBirCache(fx.module, { distVersion: fx.distVersion, homeDir: home });
            expect(removed.map(relToBallerina).sort()).toEqual(fx.expectedRemoved.map(toOsPath).sort());

            for (const rel of fx.expectedRemoved) {
                expect(await exists(rel)).toBe(false);
            }
            for (const rel of fx.expectedKept) {
                expect(await exists(rel)).toBe(true);
            }
        } finally {
            await fs.rm(home, { recursive: true, force: true });
        }
    });
});
