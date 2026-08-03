#!/usr/bin/env node
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

// Type-checks test code across every package that has a tsconfig.spec.json.
//
// Test files are excluded from the emitting build (tsconfig.json) and babel/ts-jest do
// not type-check at run time, so without this a type error in a test — a wrong prop, a
// removed export, a mis-shaped fixture — ships silently. Each tsconfig.spec.json pulls in
// all of src so production gives the ambient context the tests need; we then report ONLY
// errors whose file is a test file. Pre-existing latent errors in production source (some
// packages build via webpack and never tsc) or in cross-package `src` imports are counted
// and shown as an ignored tally, but do not gate — this job owns test code, not the build.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const PKGS_DIR = path.join(REPO, "packages");

// A reported error path counts as "test code" when it lives in a test file / test dir.
const TEST_PATH = /(\.(test|spec)\.[cm]?[jt]sx?|[\\/]test[\\/]|[\\/]test-support[\\/])/;
const ERROR_LINE = /^(.+?)\((\d+),(\d+)\): error TS\d+:/;

const packages = fs
    .readdirSync(PKGS_DIR)
    .filter((p) => fs.existsSync(path.join(PKGS_DIR, p, "tsconfig.spec.json")))
    .sort();

let testErrors = 0;
let ignored = 0;

for (const pkg of packages) {
    const cwd = path.join(PKGS_DIR, pkg);
    let out = "";
    let failure = null; // set when tsc exited non-zero (type errors OR a run failure)
    try {
        execFileSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.spec.json"], {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });
    } catch (e) {
        out = `${e.stdout || ""}${e.stderr || ""}`;
        failure = e;
    }

    const inTest = [];
    let ignoredHere = 0;
    for (const line of out.split("\n")) {
        const m = ERROR_LINE.exec(line.trim());
        if (!m) continue;
        if (TEST_PATH.test(m[1])) inTest.push(line.trim());
        else ignoredHere++;
    }

    // tsc exited non-zero but produced no file-scoped diagnostics → it couldn't actually run:
    // a failed spawn (ENOENT: npx/tsc missing) or a global/config error (e.g. TS18003 "no
    // inputs", cannot read tsconfig). Fail loudly instead of misreporting the package clean.
    if (failure && inTest.length === 0 && ignoredHere === 0) {
        console.error(`\n✗ ${pkg}: typecheck could not run (${failure.code || `exit ${failure.status}`}): ${(out || failure.message).trim().slice(0, 500)}`);
        testErrors++;
        continue;
    }

    if (inTest.length) {
        console.log(`\n✗ ${pkg}: ${inTest.length} test-code type error(s)` + (ignoredHere ? ` (+${ignoredHere} ignored non-test)` : ""));
        inTest.forEach((l) => console.log(`    ${l}`));
        testErrors += inTest.length;
    } else {
        console.log(`✓ ${pkg}: clean` + (ignoredHere ? ` (${ignoredHere} non-test errors ignored)` : ""));
    }
    ignored += ignoredHere;
}

console.log(`\n${testErrors ? "✗" : "✓"} test typecheck: ${testErrors} test-code error(s) across ${packages.length} package(s); ${ignored} non-test error(s) ignored.`);
process.exit(testErrors ? 1 : 0);
