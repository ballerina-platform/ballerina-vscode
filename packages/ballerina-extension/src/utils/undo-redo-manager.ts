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

import {
    IUndoRedoManager,
    FileChange,
    BatchOperation,
    UndoRedoOperationInfo,
    UndoRedoUIState
} from "@wso2/ballerina-core";


export class UndoRedoManager implements IUndoRedoManager {
    private undoStack: BatchOperation[];
    private redoStack: BatchOperation[];
    private currentTransaction: FileChange[] | null;
    private transactionId: string | null;
    // While open, every commit merges into one undo entry so a multi-edit action undoes in one step.
    private group: { entry?: BatchOperation } | null = null;
    private readonly MAX_STACK_SIZE = 20;

    constructor() {
        this.undoStack = [];
        this.redoStack = [];
        this.currentTransaction = null;
        this.transactionId = null;
    }

    /**
     * Start a new batch transaction with extension-specific logging
     */
    public beginGroup(): void {
        this.group = {};
    }

    public endGroup(description?: string): void {
        if (description && this.group?.entry) {
            this.group.entry.description = description;
        }
        this.group = null;
    }

    public startBatchOperation(): string {
        if (this.currentTransaction) {
            throw new Error('A batch operation is already in progress. Complete it before starting a new one.');
        }
        // Use a simple timestamp-based id for batch operations.
        this.transactionId = `batch_${Date.now()}`;
        this.currentTransaction = [];

        // Extension-specific: Enhanced logging for debugging
        console.log(`[Extension UndoRedoManager] Started batch operation: ${this.transactionId}`);

        return this.transactionId;
    }

    /**
     * Add a file change to the current batch operation with enhanced logging
     */
    public addFileToBatch(filePath: string, beforeContent: string, afterContent: string): void {
        if (!this.currentTransaction) {
            throw new Error('No batch operation in progress. Call startBatchOperation() first.');
        }

        // Check if this file is already in the transaction
        const existingChange = this.currentTransaction.find(f => f.path === filePath);
        if (existingChange) {
            // Update the afterContent, but keep the original beforeContent
            existingChange.afterContent = afterContent;
            console.log(`[Extension UndoRedoManager] Updated existing change for: ${filePath}`);
        } else {
            // Add new file change to the transaction
            this.currentTransaction.push({
                path: filePath,
                beforeContent,
                afterContent
            });
            console.log(`[Extension UndoRedoManager] Added new change for: ${filePath}`);
        }
    }

    /**
     * Commit the current batch operation to the undo stack
     * Returns the file changes that were committed
     */
    public commitBatchOperation(description?: string): Map<string, string> {
        if (!this.currentTransaction || !this.transactionId) {
            throw new Error('No batch operation in progress.');
        }

        if (this.currentTransaction.length === 0) {
            // No changes were made, just clean up
            console.log(`[UndoRedoManager] Committing empty batch operation: ${this.transactionId}`);
            this.currentTransaction = null;
            this.transactionId = null;
            return new Map();
        }

        const batchOperation: BatchOperation = {
            id: this.transactionId,
            timestamp: Date.now(),
            changes: [...this.currentTransaction],
            description
        };

        const groupEntry = this.group?.entry;
        if (groupEntry && this.undoStack[this.undoStack.length - 1] === groupEntry) {
            for (const change of this.currentTransaction) {
                const existing = groupEntry.changes.find(c => c.path === change.path);
                if (existing) {
                    existing.afterContent = change.afterContent;
                } else {
                    groupEntry.changes.push({ ...change });
                }
            }
        } else {
            this.undoStack.push(batchOperation);
            if (this.group) {
                this.group.entry = batchOperation;
            }
        }

        // Limit stack size
        if (this.undoStack.length > this.MAX_STACK_SIZE) {
            this.undoStack.shift();
        }

        // Clear redo stack as new operation invalidates it
        this.redoStack = [];

        // Extension-specific: Log the commit for debugging and telemetry
        console.log(`[Extension UndoRedoManager] Committed batch operation: ${this.transactionId} with ${this.currentTransaction.length} file(s)`);

        // Return the committed changes for external application
        const committedChanges = new Map<string, string>();
        for (const change of this.currentTransaction) {
            committedChanges.set(change.path, change.afterContent);
        }

        // Clean up transaction
        this.currentTransaction = null;
        this.transactionId = null;

        return committedChanges;
    }

    /**
     * Cancel the current batch operation and return the original file states
     */
    public cancelBatchOperation(): Map<string, string> {
        if (!this.currentTransaction) {
            throw new Error('No batch operation in progress.');
        }

        console.log(`[Extension UndoRedoManager] Cancelling batch operation: ${this.transactionId}`);

        // Return the original content for external restoration if needed
        const originalStates = new Map<string, string>();
        for (const change of this.currentTransaction) {
            originalStates.set(change.path, change.beforeContent);
        }

        // Clean up transaction
        this.currentTransaction = null;
        this.transactionId = null;

        return originalStates;
    }

    /**
     * Undo the last batch operation(s)
     * @param count Number of operations to undo (default: 1)
     * Returns a map of file paths to their restored content from the last operation
     */
    public undo(count: number = 1): Map<string, string> | null {
        if (this.undoStack.length === 0 || count <= 0) {
            console.log(`[Extension UndoRedoManager] No operations to undo or invalid count: ${count}`);
            return null;
        }

        const actualCount = Math.min(count, this.undoStack.length);
        console.log(`[Extension UndoRedoManager] Undoing ${actualCount} operations`);

        // Collect all operations to undo
        const operationsToUndo: BatchOperation[] = [];
        for (let i = 0; i < actualCount; i++) {
            const operation = this.undoStack.pop()!;
            operationsToUndo.push(operation);
        }

        // Create redo operations for all undone operations
        const redoOperations: BatchOperation[] = [];
        for (const operation of operationsToUndo) {
            const redoChanges: FileChange[] = operation.changes.map(change => ({
                path: change.path,
                beforeContent: change.afterContent, // What we're changing from (current state)
                afterContent: change.beforeContent  // What we're changing to (original state)
            }));

            const redoOperation: BatchOperation = {
                id: `redo_${operation.id}`,
                timestamp: Date.now(),
                changes: redoChanges,
                description: `${operation.description || 'Batch operation'}`
            };

            redoOperations.push(redoOperation);
        }

        // Pushed newest-first so the oldest undone operation is redone first
        redoOperations.forEach(operation => {
            this.redoStack.push(operation);
        });

        // Limit redo stack size
        while (this.redoStack.length > this.MAX_STACK_SIZE) {
            this.redoStack.shift();
        }

        // Each file returns to its content before the oldest undone operation that touched it
        const restoredFiles = new Map<string, string>();
        for (const operation of operationsToUndo) {
            for (const change of operation.changes) {
                restoredFiles.set(change.path, change.beforeContent);
            }
        }

        return restoredFiles;
    }

    /**
     * Redo the last undone batch operation(s)
     * @param count Number of operations to redo (default: 1)
     * Returns a map of file paths to their restored content from the last operation
     */
    public redo(count: number = 1): Map<string, string> | null {
        if (this.redoStack.length === 0 || count <= 0) {
            console.log(`[UndoRedoManager] No operations to redo or invalid count: ${count}`);
            return null;
        }

        const actualCount = Math.min(count, this.redoStack.length);
        console.log(`[UndoRedoManager] Redoing ${actualCount} operations`);

        // Collect all operations to redo
        const operationsToRedo: BatchOperation[] = [];
        for (let i = 0; i < actualCount; i++) {
            const operation = this.redoStack.pop()!;
            operationsToRedo.push(operation);
        }

        // Create undo operations for all redone operations
        const undoOperations: BatchOperation[] = [];
        for (const operation of operationsToRedo) {
            const undoChanges: FileChange[] = operation.changes.map(change => ({
                path: change.path,
                beforeContent: change.afterContent, // What we're changing from
                afterContent: change.beforeContent  // What we're changing to
            }));

            const undoOperation: BatchOperation = {
                id: operation.id.replace('redo_', ''),
                timestamp: Date.now(),
                changes: undoChanges,
                description: operation.description?.replace('Redo: ', '') || 'Batch operation'
            };

            undoOperations.push(undoOperation);
        }

        // Pushed in redo order so the newest redone operation is undone first
        undoOperations.forEach(operation => {
            this.undoStack.push(operation);
        });

        // Each file takes its content after the newest redone operation that touched it
        const redoneFiles = new Map<string, string>();
        for (const operation of operationsToRedo) {
            for (const change of operation.changes) {
                redoneFiles.set(change.path, change.beforeContent);
            }
        }

        return redoneFiles;
    }

    /**
     * Check if a batch operation is in progress
     */
    public isBatchInProgress(): boolean {
        return this.currentTransaction !== null;
    }

    /**
     * Get information about available undo operations
     */
    public getUndoInfo(): UndoRedoOperationInfo[] {
        return this.undoStack.map(op => ({
            id: op.id,
            timestamp: op.timestamp,
            description: op.description,
            fileCount: op.changes.length
        }));
    }

    /**
     * Get information about available redo operations
     */
    public getRedoInfo(): UndoRedoOperationInfo[] {
        return this.redoStack.map(op => ({
            id: op.id,
            timestamp: op.timestamp,
            description: op.description,
            fileCount: op.changes.length
        }));
    }

    /**
     * Check if undo operation is available (for enabling/disabling undo button)
     */
    public canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo operation is available (for enabling/disabling redo button)
     */
    public canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /**
     * Get the total count of available undo operations
     */
    public getUndoCount(): number {
        return this.undoStack.length;
    }

    /**
     * Get the total count of available redo operations
     */
    public getRedoCount(): number {
        return this.redoStack.length;
    }

    /**
     * Get the description of the next undo operation (useful for button tooltips)
     */
    public getNextUndoDescription(): string | null {
        if (this.undoStack.length > 0) {
            const lastOp = this.undoStack[this.undoStack.length - 1];
            return lastOp.description || `Batch operation (${lastOp.changes.length} files)`;
        }

        return null;
    }

    /**
     * Get the description of the next redo operation (useful for button tooltips)
     */
    public getNextRedoDescription(): string | null {
        if (this.redoStack.length > 0) {
            const lastOp = this.redoStack[this.redoStack.length - 1];
            return lastOp.description || `Batch operation (${lastOp.changes.length} files)`;
        }

        return null;
    }

    /**
     * Reset the undo-redo stack
     */
    public reset(): void {
        console.log(`[UndoRedoManager] Resetting undo/redo stacks`);
        this.undoStack = [];
        this.redoStack = [];
        this.currentTransaction = null;
        this.transactionId = null;
        this.group = null;
    }

    /**
     * Get comprehensive state for UI button management
     */
    public getUIState(): UndoRedoUIState {
        return {
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            undoCount: this.getUndoCount(),
            redoCount: this.getRedoCount(),
            nextUndoDescription: this.getNextUndoDescription(),
            nextRedoDescription: this.getNextRedoDescription(),
            batchInProgress: this.isBatchInProgress()
        };
    }

}
