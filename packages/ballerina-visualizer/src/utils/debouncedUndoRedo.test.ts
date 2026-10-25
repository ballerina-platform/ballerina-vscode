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

import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { debouncedRedo, debouncedUndo, debouncedUndoRedoManager } from "./debouncedUndoRedo";

describe("debouncedUndo", () => {
    it("resolves presses made during a run only after their batched undo has run", async () => {
        const releases: (() => void)[] = [];
        const undo = jest.fn(() => new Promise<void>((resolve) => releases.push(resolve)));
        const rpcClient = {
            getVisualizerRpcClient: () => ({
                undoRedoState: async () => ({ canUndo: true, undoCount: 10 }),
                undo,
            }),
        } as unknown as BallerinaRpcClient;

        const first = debouncedUndo(rpcClient);
        await new Promise((resolve) => setTimeout(resolve));
        let secondDone = false;
        const second = debouncedUndo(rpcClient).then(() => { secondDone = true; });
        const third = debouncedUndo(rpcClient);

        releases[0]();
        await new Promise((resolve) => setTimeout(resolve));
        expect(secondDone).toBe(false);
        expect(undo).toHaveBeenLastCalledWith(2);

        releases[1]();
        await Promise.all([first, second, third]);
        expect(undo).toHaveBeenCalledTimes(2);

        const fourth = debouncedUndo(rpcClient);
        await new Promise((resolve) => setTimeout(resolve));
        releases[2]();
        await fourth;
        expect(undo).toHaveBeenCalledTimes(3);
    });

    it("refreshes after an undo that failed part way", async () => {
        const rpcClient = {
            getVisualizerRpcClient: () => ({
                undoRedoState: async () => ({ canUndo: true, undoCount: 1 }),
                undo: async () => { throw new Error("partly applied"); },
            }),
        } as unknown as BallerinaRpcClient;
        const applied = jest.fn();
        const stop = debouncedUndoRedoManager.onApplied(applied);
        await debouncedUndo(rpcClient);
        stop();
        expect(applied).toHaveBeenCalledTimes(1);
    });

    it("runs every listener after a redo even when one throws", async () => {
        const rpcClient = {
            getVisualizerRpcClient: () => ({
                undoRedoState: async () => ({ canRedo: true, redoCount: 1 }),
                redo: async (): Promise<void> => undefined,
            }),
        } as unknown as BallerinaRpcClient;
        const later = jest.fn();
        const stopFirst = debouncedUndoRedoManager.onApplied(() => { throw new Error("disposed"); });
        const stopLater = debouncedUndoRedoManager.onApplied(later);
        await debouncedRedo(rpcClient);
        stopFirst();
        stopLater();
        expect(later).toHaveBeenCalledTimes(1);
    });
});
