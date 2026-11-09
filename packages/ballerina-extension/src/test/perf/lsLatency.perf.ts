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

// Perf / QA benchmark (orthogonal suite — not a scope level): measures LS request
// latency and emits a trend record. Not a hard pass/fail gate — the assertion is a
// loose guardrail; the value is the logged/append trend (set PERF_TREND_FILE to
// accumulate). See docs/TEST_GUIDE.md (Perf / QA). Skips when no Ballerina distribution is found.

import * as fs from "fs";
import * as path from "path";
import { LsHarness, resolveBalCommand, pathToFileUri } from "@wso2/test-config/ls-harness";

const bal = resolveBalCommand();
const projectRoot = path.join(__dirname, "..", "ls-integration", "fixtures", "hello");
const mainBal = path.join(projectRoot, "main.bal");

const describePerf = bal ? describe : describe.skip;

function percentile(sorted: number[], p: number): number {
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

describePerf("LS latency benchmark", () => {
    let ls: LsHarness;

    beforeAll(async () => {
        ls = new LsHarness(bal!);
        ls.start();
        await ls.initialize(projectRoot);
        ls.didOpen(mainBal, fs.readFileSync(mainBal, "utf8"));
    }, 90_000);

    afterAll(async () => {
        await ls?.shutdown();
    });

    it("documentSymbol latency trend", async () => {
        const uri = pathToFileUri(mainBal);
        const req = () => ls.request("textDocument/documentSymbol", { textDocument: { uri } });

        await req(); // warm up
        const N = 20;
        const times: number[] = [];
        for (let i = 0; i < N; i++) {
            const start = Date.now();
            await req();
            times.push(Date.now() - start);
        }
        times.sort((a, b) => a - b);

        const record = {
            metric: "ls.documentSymbol.ms",
            n: N,
            p50: percentile(times, 0.5),
            p95: percentile(times, 0.95),
            max: times[times.length - 1],
        };
        // eslint-disable-next-line no-console
        console.log("[perf]", JSON.stringify(record));
        if (process.env.PERF_TREND_FILE) {
            fs.appendFileSync(process.env.PERF_TREND_FILE, JSON.stringify(record) + "\n");
        }

        // Loose guardrail so an egregious regression still fails CI.
        expect(record.p95).toBeLessThan(10_000);
    }, 120_000);
});
