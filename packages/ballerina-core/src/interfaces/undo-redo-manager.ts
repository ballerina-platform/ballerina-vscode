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

export interface FileChange {
    path: string;
    beforeContent: string;
    afterContent: string;
}

export interface BatchOperation {
    id: string;
    timestamp: number;
    changes: FileChange[];
    description?: string;
}

export interface UndoRedoOperationInfo {
    id: string;
    timestamp: number;
    description?: string;
    fileCount: number;
}

export interface UndoRedoUIState {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
    nextUndoDescription: string | null;
    nextRedoDescription: string | null;
    batchInProgress: boolean;
}

/**
 * Interface for UndoRedoManager with Batch Operation Support
 */
export interface IUndoRedoManager {
    // ========== BATCH OPERATION METHODS ==========

    /**
     * Open a group: every batch committed until endGroup merges into one undo entry
     */
    beginGroup(): void;

    /**
     * Close the current group, optionally naming its undo entry
     */
    endGroup(description?: string): void;

    /**
     * Start a new batch transaction for multiple file operations
     */
    startBatchOperation(): string;

    /**
     * Add a file change to the current batch operation
     * @param filePath Path to the file being changed
     * @param beforeContent Current content of the file (before the change)
     * @param afterContent New content of the file (after the change)
     */
    addFileToBatch(filePath: string, beforeContent: string, afterContent: string): void;

    /**
     * Commit the current batch operation to the undo stack
     * Returns the file changes that were committed
     */
    commitBatchOperation(description?: string): Map<string, string>;

    /**
     * Cancel the current batch operation and return the original file states
     */
    cancelBatchOperation(): Map<string, string>;

    /**
     * Undo the last batch operation
     * Returns a map of file paths to their restored content
     */
    undo(count: number): Map<string, string> | null;

    /**
     * Redo the last undone batch operation
     * Returns a map of file paths to their restored content
     */
    redo(count: number): Map<string, string> | null;

    /**
     * Check if a batch operation is in progress
     */
    isBatchInProgress(): boolean;

    /**
     * Get information about available undo operations
     */
    getUndoInfo(): UndoRedoOperationInfo[];

    /**
     * Get information about available redo operations
     */
    getRedoInfo(): UndoRedoOperationInfo[];

    /**
     * Check if undo operation is available (for enabling/disabling undo button)
     */
    canUndo(): boolean;

    /**
     * Check if redo operation is available (for enabling/disabling redo button)
     */
    canRedo(): boolean;

    /**
     * Get the total count of available undo operations
     */
    getUndoCount(): number;

    /**
     * Get the total count of available redo operations
     */
    getRedoCount(): number;

    /**
     * Get the description of the next undo operation (useful for button tooltips)
     */
    getNextUndoDescription(): string | null;

    /**
     * Get the description of the next redo operation (useful for button tooltips)
     */
    getNextRedoDescription(): string | null;

    /**
     * Reset the undo-redo stack
     */
    reset(): void;

    /**
     * Get comprehensive state for UI button management
     */
    getUIState(): UndoRedoUIState;

}

