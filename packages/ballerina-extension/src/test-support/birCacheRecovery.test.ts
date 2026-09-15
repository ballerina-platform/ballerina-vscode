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
 * `projectService/corruptBirCache` notification with the affected *package's* coordinates and the
 * running distribution version; the client clears that package's compiled cache under
 * cache-<distVersion>. (The cache is keyed by package, not module: a package's submodule BIRs all
 * live under `cache-<dist>/<org>/<packageName>/<version>/bir/` — see the submodule fixture.) These
 * L1 tests pin two invariants: (1) only a well-formed package coordinate is accepted (a
 * malformed/hostile payload can never become an fs path); (2) the clear removes ONLY the affected
 * package's compiled cache and only under the active distribution's cache-<distVersion> — never
 * other distributions, the pulled bala/, other packages or versions, or the distribution itself.
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

// The full @wso2/ballerina-core barrel drags in ESM LS-connection code jest can't transform, so mock
// the one constant bir-cache-recovery imports (matches how other test-support suites mock this package).
jest.mock("@wso2/ballerina-core", () => ({
    PRODUCT_INTEGRATOR_ISSUES_URL: "https://github.com/wso2/product-integrator/issues",
}));
import {
    CorruptPackage,
    isValidPackage,
    resolvePackageCacheDirs,
    clearPackageBirCache,
    clearPackageDistCache,
    buildCorruptBirIssueUrl,
    planCorruptBirClear,
} from "../utils/bir-cache-recovery";

describe("isValidPackage", () => {
    it("accepts a well-formed coordinate", () => {
        expect(isValidPackage({ org: "ballerina", packageName: "ai", version: "1.14.1" })).toBe(true);
        expect(isValidPackage({ org: "ballerinax", packageName: "aws.s3", version: "2.1.0" })).toBe(true);
    });

    it("rejects missing or empty segments", () => {
        expect(isValidPackage(null)).toBe(false);
        expect(isValidPackage(undefined)).toBe(false);
        expect(isValidPackage({ org: "ballerina", packageName: "ai" })).toBe(false);
        expect(isValidPackage({ org: "ballerina", packageName: "ai", version: "" })).toBe(false);
    });

    it("rejects path-traversal / unsafe segments", () => {
        expect(isValidPackage({ org: "ballerina", packageName: "ai", version: ".." })).toBe(false);
        expect(isValidPackage({ org: "..", packageName: "ai", version: "1.0.0" })).toBe(false);
        expect(isValidPackage({ org: "ballerina", packageName: "a/i", version: "1.0.0" })).toBe(false);
        expect(isValidPackage({ org: "ballerina", packageName: "ai", version: "1.0.0/../../etc" })).toBe(false);
    });
});

describe("planCorruptBirClear", () => {
    it("targets the package and displays the module coordinate for a valid payload", () => {
        const plan = planCorruptBirClear({
            org: "ballerinax",
            packageName: "hubspot.crm",
            version: "4.0.2",
            moduleName: "hubspot.crm.import",
            distVersion: "2201.13.4",
            reposPath: "/home/u/.ballerina/repositories",
        });

        expect(plan.target).toEqual({ org: "ballerinax", packageName: "hubspot.crm", version: "4.0.2" });
        expect(plan.distVersion).toBe("2201.13.4");
        expect(plan.reposDir).toBe("/home/u/.ballerina/repositories");
        // Display prefers the failing module name over the package name.
        expect(plan.coordinate).toBe("ballerinax/hubspot.crm.import:4.0.2");
        expect(plan.message).toContain("hubspot.crm.import:4.0.2");
    });

    it("falls back to whole-cache (no target) when the package can't be identified", () => {
        const plan = planCorruptBirClear({ distVersion: "2201.13.4" });

        expect(plan.target).toBeNull();
        expect(plan.coordinate).toBeUndefined();
        expect(plan.message).toContain("A module cache is corrupted");
    });

    it("drops an unsafe distVersion / reposPath rather than trusting them", () => {
        const plan = planCorruptBirClear({
            org: "ballerina",
            packageName: "ai",
            version: "1.14.1",
            distVersion: "../evil",
            reposPath: "",
        });

        expect(plan.distVersion).toBeUndefined();
        expect(plan.reposDir).toBeUndefined();
        expect(plan.target).toEqual({ org: "ballerina", packageName: "ai", version: "1.14.1" });
    });

    it("carries the distribution cache root when the LS supplies it", () => {
        const plan = planCorruptBirClear({
            org: "ballerina",
            packageName: "ai",
            version: "1.14.1",
            distCachePath: "/opt/ballerina/repo/cache",
        });

        expect(plan.distCacheRoot).toBe("/opt/ballerina/repo/cache");
    });

    it("drops an empty distribution cache root", () => {
        expect(planCorruptBirClear({ org: "ballerina", packageName: "ai", version: "1.14.1" }).distCacheRoot)
            .toBeUndefined();
        expect(
            planCorruptBirClear({ org: "ballerina", packageName: "ai", version: "1.14.1", distCachePath: "" })
                .distCacheRoot
        ).toBeUndefined();
    });
});

// A single clear scenario: seed `tree` under a temp ~/.ballerina, clear `pkg` (optionally scoped to
// `distVersion`), then assert the resolved/removed/kept paths. All paths are relative to the
// .ballerina root and use "/" separators (normalized per-OS below).
interface BirCacheFixture {
    description?: string;
    pkg: CorruptPackage;
    distVersion?: string;
    tree: string[];
    expectedResolved?: string[];
    expectedRemoved: string[];
    expectedKept: string[];
}

const fixtures = loadFixtures<BirCacheFixture>(__dirname, "fixtures", "bir-cache");

describe("clearPackageBirCache (targeted, cache-only) — fixtures", () => {
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
                const resolved = await resolvePackageCacheDirs(reposDir, fx.pkg, fx.distVersion);
                expect(resolved.map(relToBallerina).sort()).toEqual(fx.expectedResolved.map(toOsPath).sort());
            }

            const removed = await clearPackageBirCache(fx.pkg, { distVersion: fx.distVersion, homeDir: home });
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

describe("clearPackageBirCache — symlink containment", () => {
    it("does not delete through a symlinked path component that escapes the repositories root", async () => {
        const home = await fs.mkdtemp(path.join(os.tmpdir(), "bir-cache-home-"));
        const outside = await fs.mkdtemp(path.join(os.tmpdir(), "bir-cache-outside-"));
        try {
            const cacheDir = path.join(home, ".ballerina", "repositories", "central.ballerina.io", "cache-1.0.0");
            await fs.mkdir(cacheDir, { recursive: true });

            // Victim data lives OUTSIDE the repositories root.
            const victim = path.join(outside, "myorg", "mypkg", "1.0.0");
            await fs.mkdir(victim, { recursive: true });
            const sentinel = path.join(victim, "sentinel.txt");
            await fs.writeFile(sentinel, "keep");

            // Plant a symlink so <cache>/myorg resolves outside the root. The coordinate is a valid
            // segment, so the lexical path is in-root; only realpath containment catches the escape.
            await fs.symlink(path.join(outside, "myorg"), path.join(cacheDir, "myorg"), "dir");

            const removed = await clearPackageBirCache(
                { org: "myorg", packageName: "mypkg", version: "1.0.0" },
                { distVersion: "1.0.0", homeDir: home }
            );

            expect(removed).toEqual([]); // escaping target must not be reported as removed
            await expect(fs.stat(sentinel)).resolves.toBeDefined(); // victim outside the root is preserved
        } finally {
            await fs.rm(home, { recursive: true, force: true });
            await fs.rm(outside, { recursive: true, force: true });
        }
    });
});

describe("clearPackageDistCache", () => {
    it("removes only the package's dir under the (unversioned) distribution cache root", async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "dist-cache-"));
        try {
            const pkgDir = path.join(root, "ballerina", "ai", "1.14.1");
            const otherVersion = path.join(root, "ballerina", "ai", "1.13.0");
            const otherPkg = path.join(root, "ballerina", "io", "1.6.0");
            for (const d of [pkgDir, otherVersion, otherPkg]) {
                await fs.mkdir(path.join(d, "bir"), { recursive: true });
            }

            const removed = await clearPackageDistCache({ org: "ballerina", packageName: "ai", version: "1.14.1" }, root);

            expect(removed).toEqual([pkgDir]);
            await expect(fs.stat(pkgDir)).rejects.toBeDefined(); // removed
            await expect(fs.stat(otherVersion)).resolves.toBeDefined(); // other version kept
            await expect(fs.stat(otherPkg)).resolves.toBeDefined(); // other package kept
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it("returns empty when the package isn't in the distribution cache", async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "dist-cache-"));
        try {
            expect(await clearPackageDistCache({ org: "ballerina", packageName: "ai", version: "1.14.1" }, root))
                .toEqual([]);
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it("does not delete through a symlinked segment that escapes the distribution cache root", async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "dist-cache-root-"));
        const outside = await fs.mkdtemp(path.join(os.tmpdir(), "dist-cache-outside-"));
        try {
            const victim = path.join(outside, "ai", "1.14.1");
            await fs.mkdir(victim, { recursive: true });
            const sentinel = path.join(victim, "sentinel.txt");
            await fs.writeFile(sentinel, "keep");

            // <root>/ballerina -> outside, so <root>/ballerina/ai/1.14.1 resolves out of the root.
            await fs.mkdir(root, { recursive: true });
            await fs.symlink(outside, path.join(root, "ballerina"), "dir");

            const removed = await clearPackageDistCache({ org: "ballerina", packageName: "ai", version: "1.14.1" }, root);

            expect(removed).toEqual([]);
            await expect(fs.stat(sentinel)).resolves.toBeDefined();
        } finally {
            await fs.rm(root, { recursive: true, force: true });
            await fs.rm(outside, { recursive: true, force: true });
        }
    });
});

describe("buildCorruptBirIssueUrl", () => {
    const decodeBody = (url: string): string => {
        const body = new URL(url).searchParams.get("body");
        return body ?? "";
    };

    it("targets the prefilled new-issue form with the coordinate in title and body", () => {
        const url = buildCorruptBirIssueUrl(
            { distVersion: "2201.13.0", stackTrace: "at foo.bar(Foo.java:1)" },
            "ballerina/ai.observe:1.14.1"
        );
        expect(url.startsWith("https://github.com/wso2/product-integrator/issues/new?")).toBe(true);

        const parsed = new URL(url);
        expect(parsed.searchParams.get("title")).toBe("Corrupt BIR cache: ballerina/ai.observe:1.14.1");

        const body = decodeBody(url);
        expect(body).toContain("ballerina/ai.observe:1.14.1");
        expect(body).toContain("2201.13.0");
        expect(body).toContain("at foo.bar(Foo.java:1)");
    });

    it("stays usable without a coordinate or stack trace", () => {
        const body = decodeBody(buildCorruptBirIssueUrl({}, undefined));
        expect(body).toContain("(unknown)");
        expect(body).toContain("Not available");
    });

    it("truncates an over-long stack trace", () => {
        const url = buildCorruptBirIssueUrl({ stackTrace: "x".repeat(10000) }, "org/pkg:1.0.0");
        const body = decodeBody(url);
        expect(body).toContain("… (truncated)");
        // The 10k-char trace must not survive in full.
        expect(body).not.toContain("x".repeat(6000));
    });
});
