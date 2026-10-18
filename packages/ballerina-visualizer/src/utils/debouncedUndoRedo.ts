/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

interface QueuedRun {
    redo: boolean;
    count: number;
}

class DebouncedUndoRedoManager {
    // Presses in the order made, a run of the same kind merged; one at a time, so an undo and a redo never overlap.
    private runs: QueuedRun[] = [];
    private running = false;

    private appliedListeners = new Set<() => void>();

    private pendingEdits: Promise<unknown> = Promise.resolve();

    // An undo pressed while an edit the user already sees as done is still saving must not undo the one before it.
    public waitFor(edit: Promise<unknown>): void {
        this.pendingEdits = Promise.allSettled([this.pendingEdits, edit]);
    }

    /**
     * Notifies once an undo/redo has been applied and the extension has moved the view to the edited source.
     */
    public onApplied(listener: () => void): () => void {
        this.appliedListeners.add(listener);
        return () => this.appliedListeners.delete(listener);
    }

    /**
     * Undoes after every earlier undo or redo has run; presses made meanwhile are merged into one run.
     */
    public debouncedUndo(rpcClient: BallerinaRpcClient): Promise<void> {
        return this.enqueue(false, rpcClient);
    }

    /**
     * Redoes after every earlier undo or redo has run; presses made meanwhile are merged into one run.
     */
    public debouncedRedo(rpcClient: BallerinaRpcClient): Promise<void> {
        return this.enqueue(true, rpcClient);
    }

    private async enqueue(redo: boolean, rpcClient: BallerinaRpcClient): Promise<void> {
        const last = this.runs[this.runs.length - 1];
        if (last?.redo === redo) {
            last.count++;
        } else {
            this.runs.push({ redo, count: 1 });
        }
        if (this.running) {
            return;
        }
        this.running = true;
        try {
            while (this.runs.length) {
                await this.pendingEdits;
                const run = this.runs.shift();
                await (run.redo ? this.executeRedo(rpcClient, run.count) : this.executeUndo(rpcClient, run.count));
            }
        } finally {
            this.running = false;
        }
    }

    /**
     * Execute undo operation with validation and proper count
     */
    private async executeUndo(rpcClient: BallerinaRpcClient, requestedCount: number): Promise<void> {
        try {
            // Get current undo state to validate
            const undoRedoState = await rpcClient.getVisualizerRpcClient().undoRedoState();

            if (!undoRedoState.canUndo) {
                // Show notification that there's nothing to undo
                this.showNotification("No undo operations available", "info");
                return;
            }

            const availableUndoCount = undoRedoState.undoCount;
            const actualUndoCount = Math.min(requestedCount, availableUndoCount);

            if (actualUndoCount < requestedCount) {
                this.showNotification(
                    `Only ${availableUndoCount} undo operation${availableUndoCount === 1 ? '' : 's'} available. Undoing ${actualUndoCount} step${actualUndoCount === 1 ? '' : 's'}.`,
                    "info"
                );
            }

            // Execute multiple undo operations using the efficient bulk method
            await rpcClient.getVisualizerRpcClient().undo(actualUndoCount);
            this.appliedListeners.forEach((listener) => listener());

        } catch (error) {
            console.error("Error during debounced undo:", error);
            this.showNotification("Error occurred during undo operation", "error");
        }
    }

    /**
     * Execute redo operation with validation and proper count
     */
    private async executeRedo(rpcClient: BallerinaRpcClient, requestedCount: number): Promise<void> {
        try {
            // Get current redo state to validate
            const undoRedoState = await rpcClient.getVisualizerRpcClient().undoRedoState();

            if (!undoRedoState.canRedo) {
                // Show notification that there's nothing to redo
                this.showNotification("No redo operations available", "info");
                return;
            }

            const availableRedoCount = undoRedoState.redoCount;
            const actualRedoCount = Math.min(requestedCount, availableRedoCount);

            if (actualRedoCount < requestedCount) {
                this.showNotification(
                    `Only ${availableRedoCount} redo operation${availableRedoCount === 1 ? '' : 's'} available. Redoing ${actualRedoCount} step${actualRedoCount === 1 ? '' : 's'}.`,
                    "info"
                );
            }

            // Execute multiple redo operations using the efficient bulk method
            await rpcClient.getVisualizerRpcClient().redo(actualRedoCount);
            this.appliedListeners.forEach((listener) => listener());

        } catch (error) {
            console.error("Error during debounced redo:", error);
            this.showNotification("Error occurred during redo operation", "error");
        }
    }

    /**
     * Show notification to user
     */
    private showNotification(message: string, type: "info" | "error"): void {
        // Log to console for debugging
        console.log(`[${type.toUpperCase()}] ${message}`);

        // Note: Notifications are now handled directly in the RPC manager
        // This method is kept for future extensibility
    }

    /**
     * Cancel any pending operations
     */
    public cancelPendingOperations(): void {
        this.runs = [];
    }

    /**
     * Check if any operations are currently processing
     */
    public isProcessing(): boolean {
        return this.running;
    }
}

// Export singleton instance
export const debouncedUndoRedoManager = new DebouncedUndoRedoManager();

// Export the debounced functions for easy use
export const debouncedUndo = (rpcClient: BallerinaRpcClient) => debouncedUndoRedoManager.debouncedUndo(rpcClient);

export const debouncedRedo = (rpcClient: BallerinaRpcClient) => debouncedUndoRedoManager.debouncedRedo(rpcClient);
