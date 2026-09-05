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
 *  A corrupt cached BIR makes projects load empty. The LS sends a
 * `projectService/corruptBirCache` notification with the affected module's coordinates and the
 * running distribution version; the client clears that module's compiled cache under
 * cache-<distVersion>. These L1 tests pin three invariants: (1) only a well-formed module
 * coordinate is accepted (a malformed/hostile payload can never become an fs path); (2) the clear
 * removes ONLY the affected module's compiled cache and only under the active distribution's
 * cache-<distVersion> — never other distributions, the pulled bala/, other modules or versions, or
 * the distribution itself.
 */

import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { isValidModule, resolveModuleCacheDirs, clearModuleBirCache } from "../utils/bir-cache-recovery";

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

describe("clearModuleBirCache (targeted, cache-only)", () => {
    let home: string;
    const reposFor = (h: string) => path.join(h, ".ballerina", "repositories");

    // Build a realistic ~/.ballerina tree under a temp home.
    async function seed(h: string): Promise<void> {
        const files = [
            // target: two distribution caches for the corrupt module+version
            "repositories/central.ballerina.io/cache-2201.13.5/ballerina/ai/1.14.1/bir/ai.bir",
            "repositories/central.ballerina.io/cache-2201.13.4/ballerina/ai/1.14.1/bir/ai.bir",
            // keep: other version of same module
            "repositories/central.ballerina.io/cache-2201.13.5/ballerina/ai/1.13.0/bir/ai.bir",
            // keep: other module
            "repositories/central.ballerina.io/cache-2201.13.5/ballerina/io/1.6.0/bir/io.bir",
            // keep: pulled bala source (never cleared)
            "repositories/central.ballerina.io/bala/ballerina/ai/1.14.1/java21/pkg.json",
            // keep: the distribution itself
            "distributions/ballerina-2201.13.5/bin/bal",
        ];
        for (const rel of files) {
            const full = path.join(h, ".ballerina", rel);
            await fs.mkdir(path.dirname(full), { recursive: true });
            await fs.writeFile(full, "x");
        }
    }

    const exists = async (rel: string): Promise<boolean> => {
        try {
            await fs.stat(path.join(home, ".ballerina", rel));
            return true;
        } catch {
            return false;
        }
    };

    beforeEach(async () => {
        home = await fs.mkdtemp(path.join(os.tmpdir(), "bir-cache-test-"));
        await seed(home);
    });

    afterEach(async () => {
        await fs.rm(home, { recursive: true, force: true });
    });

    it("scopes to the active distribution's cache-<distVersion> only", async () => {
        const dirs = await resolveModuleCacheDirs(
            reposFor(home),
            { org: "ballerina", name: "ai", version: "1.14.1" },
            "2201.13.5"
        );
        const rels = dirs.map((d) => path.relative(reposFor(home), d));
        expect(rels).toEqual([path.join("central.ballerina.io", "cache-2201.13.5", "ballerina", "ai", "1.14.1")]);
    });

    it("considers every cache-* dir when no distVersion is given", async () => {
        const dirs = await resolveModuleCacheDirs(reposFor(home), { org: "ballerina", name: "ai", version: "1.14.1" });
        const rels = dirs.map((d) => path.relative(reposFor(home), d)).sort();
        expect(rels).toEqual([
            path.join("central.ballerina.io", "cache-2201.13.4", "ballerina", "ai", "1.14.1"),
            path.join("central.ballerina.io", "cache-2201.13.5", "ballerina", "ai", "1.14.1"),
        ]);
    });

    it("removes the corrupt module's cache only under the active distribution, nothing else", async () => {
        const removed = await clearModuleBirCache(
            { org: "ballerina", name: "ai", version: "1.14.1" },
            { distVersion: "2201.13.5", homeDir: home }
        );

        expect(removed).toHaveLength(1);
        // target gone from the active distribution's cache
        expect(await exists("repositories/central.ballerina.io/cache-2201.13.5/ballerina/ai/1.14.1")).toBe(false);
        // OTHER distribution's cache for the same module is left intact
        expect(await exists("repositories/central.ballerina.io/cache-2201.13.4/ballerina/ai/1.14.1/bir/ai.bir")).toBe(true);
        // everything else intact
        expect(await exists("repositories/central.ballerina.io/cache-2201.13.5/ballerina/ai/1.13.0/bir/ai.bir")).toBe(true);
        expect(await exists("repositories/central.ballerina.io/cache-2201.13.5/ballerina/io/1.6.0/bir/io.bir")).toBe(true);
        expect(await exists("repositories/central.ballerina.io/bala/ballerina/ai/1.14.1/java21/pkg.json")).toBe(true);
        expect(await exists("distributions/ballerina-2201.13.5/bin/bal")).toBe(true);
    });

    it("removes nothing when the module is not cached", async () => {
        const removed = await clearModuleBirCache(
            { org: "ballerina", name: "nope", version: "9.9.9" },
            { distVersion: "2201.13.5", homeDir: home }
        );
        expect(removed).toEqual([]);
        expect(await exists("repositories/central.ballerina.io/cache-2201.13.5/ballerina/ai/1.14.1/bir/ai.bir")).toBe(true);
    });
});
