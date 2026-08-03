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

// NIGHTLY: capture + drift-check the real flow model that the fast render test snapshots.
// Calls the real LS (flowDesignService/getFlowModel) for the realdata .bal project and:
//   - writes fixtures/realdata/flowModel.json if missing or BAL_UPDATE_FIXTURES is set, else
//   - asserts the live LS response still equals the committed fixture (drift check — the
//     rpc-contract assertion, run nightly, not on the fast PR path).
// So the fast Diagram render/snapshot test never touches the LS; drift is caught here.
//
// L3-tier: spawns the LS (needs Java + a Ballerina distribution); auto-skips otherwise;
// runs via jest.realdata.config.js, never the fast PR job.

import * as fs from "fs";
import * as path from "path";
import { LsHarness, resolveBalCommand } from "@wso2/test-config/ls-harness";

const bal = resolveBalCommand();
const projectRoot = path.join(__dirname, "fixtures", "realdata");
const mainBal = path.join(projectRoot, "main.bal");
const FIXTURE = path.join(projectRoot, "flowModel.json");
const REQUEST = { filePath: mainBal, startLine: { line: 2, offset: 0 }, endLine: { line: 8, offset: 1 } };

(bal ? describe : describe.skip)("bi-diagram flow-model fixture — capture / drift (real LS)", () => {
    let harness: LsHarness;

    beforeAll(async () => {
        harness = new LsHarness(bal as string, { timeoutMs: 60_000 });
        harness.start();
        await harness.initialize(projectRoot);
        harness.didOpen(mainBal, fs.readFileSync(mainBal, "utf8"));
        await new Promise((r) => setTimeout(r, 1500));
    }, 120_000);

    afterAll(async () => {
        await harness?.shutdown();
    });

    it("captures the flow model (first run / BAL_UPDATE_FIXTURES) or asserts no drift", async () => {
        const resp: any = await harness.request("flowDesignService/getFlowModel", REQUEST);
        const flow = resp?.flowModel ?? resp;
        expect(Array.isArray(flow?.nodes)).toBe(true);

        if (!fs.existsSync(FIXTURE) || process.env.BAL_UPDATE_FIXTURES) {
            fs.writeFileSync(FIXTURE, JSON.stringify(flow, null, 2) + "\n");
        }

        const committed = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
        // drift: the render test snapshots `committed`; assert the live LS still matches it
        expect(flow).toEqual(committed);
    }, 60_000);
});
