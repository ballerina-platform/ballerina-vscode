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

// PROOF OF CONCEPT — "headless host".
//
// Runs a REAL rpc-manager handler against the REAL language server with no VSCode.
// The seam is StateMachine: rpc-managers reach the LS via `StateMachine.langClient()`,
// and every ExtendedLangClient method is a thin `sendRequest(<LS method>, params)`
// wrapper. So we mock StateMachine to return a client whose methods route to the L4
// headless LS harness — faithful to production — while the manager's own transform
// (path munging, defaults, request assembly) runs for real.
//
// This proves the pattern end-to-end: host handler + real LS, driven from a plain
// test. It is the foundation the RPC-driven webview VIEWS need — feed a view an
// rpc-client whose methods delegate to a manager wired this way, and the view renders
// against live LS data with no captured fixtures. record-creator is used because it is
// a tiny manager (its only host dependency is StateMachine), which keeps the PoC's
// import graph minimal; the god-manager (bi-diagram, ~36 imports) needs more mocking
// but the mechanism is identical.
//
// L4-tier: spawns the real LS (needs Java + a Ballerina distribution) — auto-skips
// otherwise, and never runs in the fast PR job (config filename is not jest.config.js).

import * as os from "os";
import { LsHarness, resolveBalCommand } from "@wso2/test-config/ls-harness";
import type { JsonToRecord } from "@wso2/ballerina-core";

// Holder is `mock`-prefixed so the jest.mock factory (hoisted) may reference it.
const mockHost: { harness: LsHarness | null; projectPath: string } = {
    harness: null,
    projectPath: os.tmpdir(),
};

jest.mock("../../stateMachine", () => ({
    StateMachine: {
        // headless langClient: route each thin wrapper to the real LS over the harness
        langClient: () => ({
            convertJsonToRecord: (params: any) => mockHost.harness!.request("jsonToRecord/convert", params),
        }),
        context: () => ({ projectPath: mockHost.projectPath }),
    },
}));

// Imported AFTER the mock so the manager binds to the headless StateMachine.
import { RecordCreatorRpcManager } from "../../rpc-managers/record-creator/rpc-manager";

const bal = resolveBalCommand();

(bal ? describe : describe.skip)("headless host — real rpc-manager against the real LS", () => {
    let manager: RecordCreatorRpcManager;

    beforeAll(async () => {
        const harness = new LsHarness(bal as string, { timeoutMs: 60_000 });
        harness.start();
        await harness.initialize(mockHost.projectPath);
        mockHost.harness = harness;
        manager = new RecordCreatorRpcManager();
    }, 120_000);

    afterAll(async () => {
        await mockHost.harness?.shutdown();
    });

    it("runs the real convertJsonToRecord handler end-to-end (manager transform + LS)", async () => {
        const result: JsonToRecord = await manager.convertJsonToRecord({
            jsonString: JSON.stringify({ id: 1, name: "Ballerina", active: true }),
            recordName: "Person",
            isRecordTypeDesc: false,
            isClosed: false,
            forceFormatRecordFields: false,
        });

        expect(result).toBeTruthy();
        expect(typeof result.codeBlock).toBe("string");
        // the LS turned the JSON into a Ballerina record type for the requested name
        expect(result.codeBlock).toContain("Person");
        expect(result.codeBlock).toContain("record");
        expect(result.codeBlock).toContain("name");
    }, 60_000);
});
