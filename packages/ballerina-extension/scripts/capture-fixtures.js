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

// Headless-VSCode fixture capture.
//
// Runs the E2E suite (which launches VSCode headless via extest + Playwright and drives
// the real extension) with the F2 fixture recorder enabled, so every LS request and
// webview-RPC response the scenarios trigger is written to disk — no production changes,
// the recorder taps are dormant unless BAL_RECORD_FIXTURES is set. Then dedupes and
// summarizes the dump so the useful fixtures can be curated into package test dirs and
// fed to the fast capture-based L2 render tests (see docs/TEST_GUIDE.md).
//
// Prereqs for the run step: a built vsix installed (pnpm run e2e-test-setup) + Java + a
// Ballerina distribution. On Linux/CI it wraps the run in xvfb-run if available.
//
// Usage:
//   node scripts/capture-fixtures.js [--grep <pattern>] [--out <dir>] [--workspace <path>]
//   node scripts/capture-fixtures.js --organize-only --out <dir>   # just dedupe/summarize an existing dump
//
// Output layout (from the recorder): <out>/<kind>/<method-slug>/NNNN.json  (kind = ls | rpc)

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const KINDS = ["ls", "rpc"];

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

function hashOf(value) {
    // Content fingerprint for dedup only — not a security primitive. sha256 avoids
    // repeated static-analysis flags on the legacy sha1.
    return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Walk a recorder dump and produce a per-method manifest, deduping fixtures whose
 * (request, response) are identical. Pure/testable — no VSCode, no side effects.
 * @param {string} rawDir  a BAL_FIXTURES_DIR the recorder wrote to
 * @returns {Array<{kind,method,slug,total,unique,samples:string[]}>}
 */
function organizeFixtures(rawDir) {
    const manifest = [];
    for (const kind of KINDS) {
        const kindDir = path.join(rawDir, kind);
        if (!fs.existsSync(kindDir)) {
            continue;
        }
        for (const slug of fs.readdirSync(kindDir).sort()) {
            const methodDir = path.join(kindDir, slug);
            if (!fs.statSync(methodDir).isDirectory()) {
                continue;
            }
            const files = fs.readdirSync(methodDir).filter((f) => f.endsWith(".json")).sort();
            const uniqueByPayload = new Map(); // hash -> filename
            let method = slug;
            for (const f of files) {
                const payload = readJson(path.join(methodDir, f));
                if (!payload) {
                    continue;
                }
                method = payload.method || method;
                const key = hashOf({ request: payload.request, response: payload.response });
                if (!uniqueByPayload.has(key)) {
                    uniqueByPayload.set(key, f);
                }
            }
            manifest.push({
                kind,
                method,
                slug,
                total: files.length,
                unique: uniqueByPayload.size,
                samples: [...uniqueByPayload.values()],
            });
        }
    }
    return manifest.sort((a, b) => `${a.kind}/${a.method}`.localeCompare(`${b.kind}/${b.method}`));
}

function printSummary(manifest, rawDir) {
    if (manifest.length === 0) {
        console.log(`No fixtures found under ${rawDir}. Did the run trigger any LS/RPC traffic?`);
        return;
    }
    const totalUnique = manifest.reduce((n, m) => n + m.unique, 0);
    const totalRaw = manifest.reduce((n, m) => n + m.total, 0);
    console.log(`\nCaptured ${totalRaw} fixtures across ${manifest.length} methods → ${totalUnique} unique:\n`);
    for (const m of manifest) {
        console.log(`  [${m.kind}] ${m.method.padEnd(48)} ${String(m.unique).padStart(3)} unique / ${m.total}`);
    }
    console.log(`\nRaw dump: ${rawDir}`);
    console.log(`Manifest: ${path.join(rawDir, "manifest.json")}`);
    console.log(`Curate the ones you need into <package>/src/test/fixtures/ and render them via renderWithRpc.`);
}

function hasXvfb() {
    return process.platform === "linux" && spawnSync("which", ["xvfb-run"]).status === 0;
}

function runE2EWithRecording({ grep, outDir, workspace }) {
    fs.mkdirSync(outDir, { recursive: true });
    const env = { ...process.env, BAL_RECORD_FIXTURES: "1", BAL_FIXTURES_DIR: outDir };
    if (workspace) {
        env.BAL_FIXTURES_WORKSPACE = workspace;
    }
    const playwright = ["exec", "playwright", "test", "-c", "e2e-test/playwright.config.js"];
    if (grep) {
        playwright.push("--grep", grep);
    }
    // xvfb-run pnpm exec playwright ...  (Linux/CI) | pnpm exec playwright ... (local w/ display)
    const [cmd, args] = hasXvfb()
        ? ["xvfb-run", ["--auto-servernum", "pnpm", ...playwright]]
        : ["pnpm", playwright];
    console.log(`Recording fixtures to ${outDir} …`);
    return spawnSync(cmd, args, { stdio: "inherit", env }).status ?? 1;
}

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--organize-only") out.organizeOnly = true;
        else if (a === "--grep") out.grep = argv[++i];
        else if (a === "--out") out.out = argv[++i];
        else if (a === "--workspace") out.workspace = argv[++i];
    }
    return out;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const outDir = args.out || path.join(os.tmpdir(), "bal-fixtures");

    let status = 0;
    if (!args.organizeOnly) {
        status = runE2EWithRecording({ grep: args.grep, outDir, workspace: args.workspace });
    }

    const manifest = organizeFixtures(outDir);
    try {
        fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    } catch {
        /* best effort */
    }
    printSummary(manifest, outDir);
    process.exit(status);
}

if (require.main === module) {
    main();
}

module.exports = { organizeFixtures };
