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

// L3-tier fixture generator + drift check for the JSON→record view's data.
//
// This is how the L2 render fixture (fixtures/convertJsonToRecord.json) is produced
// and kept honest — WITHOUT touching production code. It calls the real LS (the same
// jsonToRecord/convert request the record-creator rpc-manager makes; that manager is a
// pure pass-through) and:
//   - writes the fixture if it is missing or BAL_UPDATE_FIXTURES is set (capture), and
//   - otherwise asserts the live response still equals the committed fixture (drift).
// Run in CI nightly so a changed LS/response surfaces as a red diff, not a stale test.
//
// Spawns the real LS (Java + distro); auto-skips otherwise; kept out of the fast PR job
// by the config filename + the `.capture.` suffix.

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { LsHarness, resolveBalCommand } from "@wso2/test-config/ls-harness";

const bal = resolveBalCommand();
const FIXTURE = path.join(__dirname, "fixtures", "convertJsonToRecord.json");
const PARAMS = {
    jsonString: JSON.stringify({ id: 1, name: "Ballerina" }),
    recordName: "Person",
    isRecordTypeDesc: false,
    isClosed: false,
};

(bal ? describe : describe.skip)("fixture capture — convertJsonToRecord (real LS)", () => {
    let harness: LsHarness;

    beforeAll(async () => {
        harness = new LsHarness(bal as string, { timeoutMs: 60_000 });
        harness.start();
        await harness.initialize(os.tmpdir());
    }, 120_000);

    afterAll(async () => {
        await harness?.shutdown();
    });

    it("captures the fixture (first run / BAL_UPDATE_FIXTURES) or asserts no drift", async () => {
        const response = await harness.request("jsonToRecord/convert", PARAMS);
        expect(response).toBeTruthy();

        if (!fs.existsSync(FIXTURE) || process.env.BAL_UPDATE_FIXTURES) {
            fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
            fs.writeFileSync(FIXTURE, JSON.stringify({ params: PARAMS, response }, null, 2) + "\n");
        }

        const committed = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
        // drift check: the live LS response still matches what the L2 test renders from
        expect(response).toEqual(committed.response);
    }, 60_000);
});
