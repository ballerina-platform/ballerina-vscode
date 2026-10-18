/**
 * @jest-environment node
 */
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

import type { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";

jest.mock("@wso2/ballerina-rpc-client", () => ({}));

import { debouncedUndoRedoManager } from "./debouncedUndoRedo";

test("presses run one at a time in the order made, a run of the same kind merged", async () => {
    const calls: string[] = [];
    let inFlight = 0;
    const call = (name: string) => async (count: number) => {
        expect(inFlight).toBe(0);
        inFlight++;
        calls.push(`${name} ${count}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
    };
    const rpcClient = {
        getVisualizerRpcClient: () => ({
            undoRedoState: async () => ({ canUndo: true, canRedo: true, undoCount: 10, redoCount: 10 }),
            undo: call("undo"),
            redo: call("redo"),
        }),
    } as unknown as BallerinaRpcClient;

    const presses = [false, false, false, true, true, false].map((redo) =>
        redo ? debouncedUndoRedoManager.debouncedRedo(rpcClient) : debouncedUndoRedoManager.debouncedUndo(rpcClient)
    );
    await Promise.all(presses);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(calls).toEqual(["undo 3", "redo 2", "undo 1"]);
    expect(debouncedUndoRedoManager.isProcessing()).toBe(false);
});
