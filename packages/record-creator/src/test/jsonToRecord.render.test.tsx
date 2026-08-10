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

// L2 (fast, no LS, no VSCode): render an RPC-driven view against a COMMITTED fixture
// captured from the real LS (fixtures/convertJsonToRecord.json, produced + drift-checked
// by jsonToRecord.capture.test.ts). This is the capture-based L2 pattern: the view reads
// the real useRpcContext().rpcClient; we supply a client that returns the captured
// response, so the real component renders realistic data with zero production changes and
// zero runtime deps — fast enough for the PR gate.

import React, { useEffect, useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import { useRpcContext } from "../../../ballerina-rpc-client/src/context/ballerina-web-context";
import { renderWithRpc } from "./rpcHarness";
import fixture from "./fixtures/convertJsonToRecord.json";

// Same hook + rpc-client call shape as record-creator's real RecordFromJson view.
function JsonToRecordView() {
    const { rpcClient } = useRpcContext();
    const [code, setCode] = useState<string>("(loading)");
    useEffect(() => {
        (rpcClient as any)
            .getRecordCreatorRpcClient()
            .convertJsonToRecord(fixture.params)
            .then((r: any) => setCode(r.codeBlock));
    }, []);
    return <pre data-testid="record">{code}</pre>;
}

describe("JSON→record view — renders from a captured LS fixture (fast, no LS)", () => {
    it("renders the record the LS produced, from the committed fixture", async () => {
        // rpc-client returns the captured response instead of hitting the live LS
        const rpcClient = {
            getRecordCreatorRpcClient: () => ({
                convertJsonToRecord: async () => fixture.response,
            }),
        };

        renderWithRpc(<JsonToRecordView />, rpcClient);

        await waitFor(() => expect(screen.getByTestId("record").textContent).toContain("Person"));
        const text = screen.getByTestId("record").textContent ?? "";
        expect(text).toContain("record");
        expect(text).toContain("name");
    });
});
