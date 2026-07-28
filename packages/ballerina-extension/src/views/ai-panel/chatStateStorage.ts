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

import * as path from 'path';
import {
    WorkspaceChatState,
    ChatThread,
    Generation,
    GenerationMetadata,
    GenerationReviewState,
    Checkpoint,
} from '@wso2/ballerina-core/lib/state-machine-types';
import { approvalManager } from '../../features/ai/state/ApprovalManager';
import { generateId } from './idGenerators';
import {
    CopilotPersistenceStore,
    PersistedThread,
    PersistedGeneration,
    PersistedCheckpoint,
    PersistedPlan,
    PersistedCompactionMetadata,
    PersistedCodeContext,
} from '@wso2/copilot-utilities/chat-persistence';

/**
 * Resolve a stable workspace identity for persistence hashing.
 *
 * In the cloud editor, every project is checked out at the same filesystem path
 * inside its container, so hashing the path would collide across projects when
 * a container is reused. When the cloud-assigned project id is available via
 * `CLOUD_INITIAL_PROJECT_ID`, use it directly as the identity. Otherwise fall
 * back to the resolved path (local dev and any non-cloud environment).
 */
function resolveWorkspaceIdentity(projectRootPath: string): string {
    return process.env.CLOUD_INITIAL_PROJECT_ID ?? path.resolve(projectRootPath);
}

/**
 * Active execution handle
 * Tracks running AI operations for abort functionality
 */
export interface ActiveExecution {
    generationId: string;              // For logging and correlation with generation
    abortController: AbortController;  // For actual abort operation
}

// ============================================
// Conversion Helpers
// ============================================

function toPersistedCompactionMetadata(
    cm: NonNullable<GenerationMetadata['compactionMetadata']>
): PersistedCompactionMetadata {
    return {
        compactedAt: cm.compactedAt,
        originalMessageCount: cm.originalMessageCount,
        originalTokenEstimate: cm.originalTokenEstimate,
        compactedTokenEstimate: cm.compactedTokenEstimate,
        retries: cm.retries,
        mode: cm.mode,
        userInstructions: cm.userInstructions,
        backupPath: cm.backupPath,
        compactedGenerationIds: cm.compactedGenerationIds,
        isCompactedGeneration: cm.isCompactedGeneration,
    };
}

function toPersistedPlan(plan: NonNullable<Generation['plan']>): PersistedPlan {
    return {
        id: plan.id,
        tasks: plan.tasks.map(t => ({
            description: t.description,
            status: t.status,
            type: t.type,
        })),
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
    };
}

function toPersistedCodeContext(ctx: NonNullable<Generation['codeContext']>): PersistedCodeContext {
    if (ctx.type === 'addition') {
        return { type: 'addition', position: { line: ctx.position.line, offset: ctx.position.offset }, filePath: ctx.filePath };
    }
    return {
        type: 'selection',
        startPosition: { line: ctx.startPosition.line, offset: ctx.startPosition.offset },
        endPosition: { line: ctx.endPosition.line, offset: ctx.endPosition.offset },
        filePath: ctx.filePath,
    };
}

function toPersistedGeneration(gen: Generation): PersistedGeneration {
    return {
        id: gen.id,
        userPrompt: gen.userPrompt,
        modelMessages: gen.modelMessages,
        uiResponse: gen.uiResponse,
        timestamp: gen.timestamp,
        currentTaskIndex: gen.currentTaskIndex,
        reviewState: {
            status: gen.reviewState.status,
            modifiedFiles: gen.reviewState.modifiedFiles,
            errorMessage: gen.reviewState.errorMessage,
        },
        metadata: {
            isPlanMode: gen.metadata.isPlanMode,
            operationType: gen.metadata.operationType,
            generationType: gen.metadata.generationType,
            commandType: gen.metadata.commandType,
            compactionMetadata: gen.metadata.compactionMetadata
                ? toPersistedCompactionMetadata(gen.metadata.compactionMetadata)
                : undefined,
            agentsMdLastReadHash: gen.metadata.agentsMdLastReadHash,
        },
        hasCheckpoint: !!gen.checkpoint,
        plan: gen.plan ? toPersistedPlan(gen.plan) : undefined,
        fileAttachments: gen.fileAttachments?.map(f => ({ fileName: f.fileName, content: f.content })),
        codeContext: gen.codeContext ? toPersistedCodeContext(gen.codeContext) : undefined,
    };
}

function fromPersistedGeneration(pg: PersistedGeneration): Generation {
    return {
        id: pg.id,
        userPrompt: pg.userPrompt,
        modelMessages: pg.modelMessages as any[],
        uiResponse: pg.uiResponse,
        timestamp: pg.timestamp,
        currentTaskIndex: pg.currentTaskIndex,
        reviewState: {
            status: pg.reviewState.status,
            modifiedFiles: pg.reviewState.modifiedFiles,
            errorMessage: pg.reviewState.errorMessage,
            // tempProjectPath and affectedPackagePaths are runtime-only
        },
        metadata: {
            isPlanMode: pg.metadata.isPlanMode,
            operationType: pg.metadata.operationType as GenerationMetadata['operationType'],
            generationType: pg.metadata.generationType as GenerationMetadata['generationType'],
            commandType: pg.metadata.commandType,
            compactionMetadata: pg.metadata.compactionMetadata
                ? {
                    compactedAt: pg.metadata.compactionMetadata.compactedAt,
                    originalMessageCount: pg.metadata.compactionMetadata.originalMessageCount,
                    originalTokenEstimate: pg.metadata.compactionMetadata.originalTokenEstimate,
                    compactedTokenEstimate: pg.metadata.compactionMetadata.compactedTokenEstimate,
                    retries: pg.metadata.compactionMetadata.retries,
                    mode: pg.metadata.compactionMetadata.mode as 'auto' | 'manual',
                    userInstructions: pg.metadata.compactionMetadata.userInstructions,
                    backupPath: pg.metadata.compactionMetadata.backupPath,
                    compactedGenerationIds: pg.metadata.compactionMetadata.compactedGenerationIds,
                    isCompactedGeneration: pg.metadata.compactionMetadata.isCompactedGeneration,
                }
                : undefined,
            agentsMdLastReadHash: pg.metadata.agentsMdLastReadHash,
        },
        checkpoint: undefined, // Loaded on demand from separate file
        plan: pg.plan
            ? {
                id: pg.plan.id,
                tasks: pg.plan.tasks.map(t => ({
                    description: t.description,
                    status: t.status as any,
                    type: t.type as any,
                })),
                createdAt: pg.plan.createdAt,
                updatedAt: pg.plan.updatedAt,
            }
            : undefined,
        fileAttachments: pg.fileAttachments as Generation['fileAttachments'],
        codeContext: pg.codeContext as Generation['codeContext'],
    };
}

function toPersistedThread(thread: ChatThread): Omit<PersistedThread, 'schemaVersion'> {
    return {
        id: thread.id,
        name: thread.name,
        sessionId: thread.sessionId,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        generations: thread.generations.map(toPersistedGeneration),
    };
}

function fromPersistedThread(pt: PersistedThread): ChatThread {
    return {
        id: pt.id,
        name: pt.name,
        sessionId: pt.sessionId,
        createdAt: pt.createdAt,
        updatedAt: pt.updatedAt,
        generations: pt.generations.map(fromPersistedGeneration),
    };
}

function toPersistedCheckpoint(checkpoint: Checkpoint): Omit<PersistedCheckpoint, 'schemaVersion'> {
    return {
        id: checkpoint.id,
        messageId: checkpoint.messageId,
        timestamp: checkpoint.timestamp,
        fileList: checkpoint.fileList,
        snapshotSize: checkpoint.snapshotSize,
        workspaceSnapshot: checkpoint.workspaceSnapshot,
    };
}

function fromPersistedCheckpoint(pc: PersistedCheckpoint): Checkpoint {
    return {
        id: pc.id,
        messageId: pc.messageId,
        timestamp: pc.timestamp,
        fileList: pc.fileList,
        snapshotSize: pc.snapshotSize,
        workspaceSnapshot: pc.workspaceSnapshot,
    };
}

/**
 * Thread-based ChatStateStorage with file persistence
 *
 * Single source of truth for all copilot chat state.
 * Stores workspace -> threads -> generations hierarchy.
 * Persists to ~/.ballerina/copilot/ — files are the source of truth.
 * Writes to disk after every mutation; reads from disk on initialize/load.
 *
 * Active executions (AbortController) are kept in-memory only.
 * Checkpoint snapshots are stored in separate gzipped files.
 */
export class ChatStateStorage {
    // In-memory cache: projectRootPath -> WorkspaceChatState
    // Loaded from disk on initializeWorkspace, flushed on every mutation
    private storage: Map<string, WorkspaceChatState> = new Map();

    // Track active executions per workspace/thread for abort functionality (runtime-only)
    private activeExecutions: Map<string, Map<string, ActiveExecution>> = new Map();

    // File-based persistence store
    private readonly persistenceStore: CopilotPersistenceStore;

    constructor() {
        this.persistenceStore = new CopilotPersistenceStore({
            workspaceIdResolver: resolveWorkspaceIdentity,
        });
    }

    // ============================================
    // Persistence Helpers
    // ============================================

    /**
     * Flush a thread to disk after mutation.
     * Called after every state change to keep files as the source of truth.
     */
    private flushThread(projectRootPath: string, threadId: string): void {
        const workspace = this.storage.get(projectRootPath);
        if (!workspace) {
            return;
        }
        const thread = workspace.threads.get(threadId);
        if (!thread) {
            return;
        }
        try {
            this.persistenceStore.saveThread(projectRootPath, threadId, toPersistedThread(thread));
        } catch (err) {
            console.error(`[ChatStateStorage] Failed to persist thread ${threadId}:`, err);
        }
    }

    /**
     * Persist a single generation incrementally (append-only).
     * Appends only the changed header and/or the model messages not yet
     * written — instead of rewriting the whole thread. Use for every
     * per-generation mutation. Relies on the store's per-generation tracking,
     * which is primed by loadThread()/saveThread() (thread creation + load).
     */
    private persistGeneration(projectRootPath: string, threadId: string, generation: Generation): void {
        const thread = this.storage.get(projectRootPath)?.threads.get(threadId);
        if (!thread) {
            return;
        }
        try {
            this.persistenceStore.appendGeneration(
                projectRootPath,
                threadId,
                toPersistedGeneration(generation),
                thread.updatedAt
            );
        } catch (err) {
            console.error(`[ChatStateStorage] Failed to append generation ${generation.id}:`, err);
        }
    }

    /** Persist a generation removal (append-only tombstone). */
    private persistGenerationRemoval(projectRootPath: string, threadId: string, generationId: string): void {
        try {
            this.persistenceStore.removeGenerationRecord(projectRootPath, threadId, generationId);
        } catch (err) {
            console.error(`[ChatStateStorage] Failed to persist removal of generation ${generationId}:`, err);
        }
    }

    /** Persist a truncation from a generation onward (append-only). */
    private persistTruncation(projectRootPath: string, threadId: string, fromGenerationId: string): void {
        try {
            this.persistenceStore.truncateFromGeneration(projectRootPath, threadId, fromGenerationId);
        } catch (err) {
            console.error(`[ChatStateStorage] Failed to persist truncation from ${fromGenerationId}:`, err);
        }
    }

    /**
     * Flush workspace metadata to disk.
     */
    private flushWorkspaceMetadata(projectRootPath: string): void {
        const workspace = this.storage.get(projectRootPath);
        if (!workspace) {
            return;
        }
        try {
            const existing = this.persistenceStore.getWorkspaceMetadata(projectRootPath);
            this.persistenceStore.saveWorkspaceMetadata(projectRootPath, {
                workspacePath: projectRootPath,
                activeThreadId: workspace.activeThreadId,
                createdAt: existing?.createdAt ?? Date.now(),
                updatedAt: Date.now(),
            });
        } catch (err) {
            console.error(`[ChatStateStorage] Failed to persist workspace metadata:`, err);
        }
    }

    // ============================================
    // Workspace Management
    // ============================================

    /**
     * Initialize workspace state.
     * Loads from disk if persisted data exists, otherwise creates default thread.
     * @param projectRootPath Workspace identifier
     * @returns Workspace state
     */
    initializeWorkspace(projectRootPath: string): WorkspaceChatState {
        let workspaceState = this.storage.get(projectRootPath);

        if (!workspaceState) {
            // Try to load from disk
            const meta = this.persistenceStore.getWorkspaceMetadata(projectRootPath);
            if (meta) {
                // Restore from disk — load thread directories directly (avoid N+1 from listThreads + loadThread)
                const threadIds = this.persistenceStore.listThreadIds(projectRootPath);
                const threads = new Map<string, ChatThread>();

                for (const threadId of threadIds) {
                    const persisted = this.persistenceStore.loadThread(projectRootPath, threadId);
                    if (persisted) {
                        const thread = fromPersistedThread(persisted);
                        // Restore checkpoint references from disk
                        this.restoreCheckpointReferences(projectRootPath, thread);
                        threads.set(threadId, thread);
                    }
                }

                // Ensure at least the default thread exists
                if (threads.size === 0) {
                    const defaultThread: ChatThread = {
                        id: 'default',
                        name: 'Default Thread',
                        generations: [],
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    };
                    threads.set('default', defaultThread);
                }

                workspaceState = {
                    projectRootPath,
                    threads,
                    activeThreadId: meta.activeThreadId,
                };

                this.storage.set(projectRootPath, workspaceState);
                console.log(`[ChatStateStorage] Restored workspace from disk: ${projectRootPath} with ${threads.size} thread(s)`);
            } else {
                // Create fresh default thread
                const now = Date.now();
                const defaultThread: ChatThread = {
                    id: 'default',
                    name: 'Default Thread',
                    generations: [],
                    createdAt: now,
                    updatedAt: now,
                };

                workspaceState = {
                    projectRootPath,
                    threads: new Map([[defaultThread.id, defaultThread]]),
                    activeThreadId: defaultThread.id,
                };

                this.storage.set(projectRootPath, workspaceState);
                // Persist the new workspace
                this.flushWorkspaceMetadata(projectRootPath);
                this.flushThread(projectRootPath, 'default');
                console.log(`[ChatStateStorage] Initialized workspace: ${projectRootPath} with default thread`);
            }
        }

        return workspaceState;
    }

    /**
     * Restore checkpoint objects from separate gzipped files into generation objects.
     * Loads full checkpoint data (including workspaceSnapshot) so it's available
     * for file diff comparisons during reviews.
     */
    private restoreCheckpointReferences(projectRootPath: string, thread: ChatThread): void {
        const persistedCheckpointGenIds = this.persistenceStore.listCheckpoints(projectRootPath, thread.id);
        const checkpointGenIdSet = new Set(persistedCheckpointGenIds);

        for (const generation of thread.generations) {
            if (checkpointGenIdSet.has(generation.id)) {
                // Load the full checkpoint from disk
                const pc = this.persistenceStore.loadCheckpoint(projectRootPath, thread.id, generation.id);
                if (pc) {
                    generation.checkpoint = fromPersistedCheckpoint(pc);
                }
            }
        }
    }

    /**
     * Get workspace state
     * @param projectRootPath Workspace identifier
     * @returns Workspace state or undefined
     */
    getWorkspaceState(projectRootPath: string): WorkspaceChatState | undefined {
        return this.storage.get(projectRootPath);
    }

    /**
     * Clear workspace state
     * Cleans up any pending review temp projects before clearing.
     * @param projectRootPath Workspace identifier
     */
    async clearWorkspace(projectRootPath: string): Promise<void> {
        // Cleanup pending review temp projects before clearing
        const workspace = this.storage.get(projectRootPath);
        if (workspace) {
            for (const [threadId, thread] of workspace.threads) {
                const pendingReview = this.getPendingReviewGeneration(projectRootPath, threadId);
                if (pendingReview?.reviewState.tempProjectPath) {
                    console.log(`[ChatStateStorage] Cleaning up pending review temp project: ${pendingReview.reviewState.tempProjectPath}`);

                    // Cleanup temp directory
                    if (!process.env.AI_TEST_ENV) {
                        const { cleanupTempProject } = require('../../features/ai/utils/project/temp-project');
                        try {
                            await cleanupTempProject(pendingReview.reviewState.tempProjectPath);
                        } catch (error) {
                            console.error(`[ChatStateStorage] Error cleaning up temp project:`, error);
                        }
                    }
                }
            }
        }

        this.storage.delete(projectRootPath);
        // Also remove persisted data
        this.persistenceStore.deleteWorkspace(projectRootPath);
        console.log(`[ChatStateStorage] Cleared workspace: ${projectRootPath}`);
    }

    /**
     * Clear all workspace states
     * Cleans up temp projects for each workspace before clearing.
     */
    async clearAll(): Promise<void> {
        // Clear each workspace individually to trigger cleanup logic
        const projectRootPaths = Array.from(this.storage.keys());
        await Promise.all(projectRootPaths.map(projectRootPath => this.clearWorkspace(projectRootPath)));
        console.log('[ChatStateStorage] Cleared all workspaces');
    }

    // ============================================
    // Thread Management (Minimal)
    // ============================================

    /**
     * Get or create a thread by ID
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @returns Thread
     */
    getOrCreateThread(projectRootPath: string, threadId: string): ChatThread {
        const workspace = this.initializeWorkspace(projectRootPath);
        let thread = workspace.threads.get(threadId);

        if (!thread) {
            thread = {
                id: threadId,
                name: threadId === 'default' ? 'Default Thread' : `Thread ${threadId}`,
                generations: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            workspace.threads.set(threadId, thread);
            workspace.activeThreadId = threadId;
            // Persist new thread and updated metadata
            this.flushThread(projectRootPath, threadId);
            this.flushWorkspaceMetadata(projectRootPath);
            console.log(`[ChatStateStorage] Created thread: ${threadId} in workspace: ${projectRootPath}`);
        }

        return thread;
    }

    /**
     * Get active thread
     * @param projectRootPath Workspace identifier
     * @returns Active thread or undefined
     */
    getActiveThread(projectRootPath: string): ChatThread | undefined {
        const workspace = this.storage.get(projectRootPath);
        if (!workspace) {
            return undefined;
        }
        return workspace.threads.get(workspace.activeThreadId);
    }

    // ============================================
    // Generation Management
    // ============================================

    /**
     * Add a new generation to a thread
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @param userPrompt User's prompt
     * @param metadata Generation metadata
     * @param id Optional generation ID (if not provided, generates new one)
     * @returns Created generation
     */
    addGeneration(
        projectRootPath: string,
        threadId: string,
        userPrompt: string,
        metadata: Partial<GenerationMetadata>,
        id?: string,
        skipCheckpoint?: boolean
    ): Generation {
        const thread = this.getOrCreateThread(projectRootPath, threadId);

        const generation: Generation = {
            id: id || generateId(),
            userPrompt,
            modelMessages: [],
            uiResponse: '',
            timestamp: Date.now(),
            reviewState: {
                status: 'pending',
                modifiedFiles: [],
            },
            currentTaskIndex: -1,
            metadata: {
                isPlanMode: metadata.isPlanMode || false,
                operationType: metadata.operationType,
                generationType: metadata.generationType || 'agent',
                commandType: metadata.commandType,
                agentsMdLastReadHash: metadata.agentsMdLastReadHash,
            },
        };

        thread.generations.push(generation);
        thread.updatedAt = Date.now();

        // Persist immediately (append-only)
        this.persistGeneration(projectRootPath, threadId, generation);
        console.log(`[ChatStateStorage] Added generation: ${generation.id} to thread: ${threadId}`);

        // Capture checkpoint for this generation asynchronously (skip for synthetic compacted generations)
        if (!skipCheckpoint) {
            this.captureCheckpointForGeneration(projectRootPath, threadId, generation.id).catch(error => {
                console.error('[ChatStateStorage] Failed to capture checkpoint:', error);
            });
        }
        return generation;
    }

    /**
     * Capture checkpoint for a generation asynchronously
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @param generationId Generation identifier
     */
    private async captureCheckpointForGeneration(
        projectRootPath: string,
        threadId: string,
        generationId: string
    ): Promise<void> {
        try {
            // Dynamic import to avoid circular dependencies
            const { captureWorkspaceSnapshot } = await import('../../views/ai-panel/checkpoint/checkpointUtils');
            const { notifyCheckpointCaptured } = await import('../../RPCLayer');

            const checkpoint = await captureWorkspaceSnapshot(generationId);

            if (checkpoint) {
                await this.addCheckpointToGeneration(projectRootPath, threadId, generationId, checkpoint);

                notifyCheckpointCaptured({
                    messageId: generationId,
                    checkpointId: checkpoint.id,
                });
            }
        } catch (error) {
            console.error('[ChatStateStorage] Failed to capture checkpoint:', error);
        }
    }

    /**
     * Update a generation
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @param generationId Generation identifier
     * @param updates Partial updates to generation
     */
    updateGeneration(
        projectRootPath: string,
        threadId: string,
        generationId: string,
        updates: Partial<Generation>
    ): void {
        const thread = this.getOrCreateThread(projectRootPath, threadId);
        const generation = thread.generations.find(g => g.id === generationId);

        if (!generation) {
            console.error(`[ChatStateStorage] Generation not found: ${generationId}`);
            return;
        }

        // Apply updates
        Object.assign(generation, updates);
        thread.updatedAt = Date.now();

        // Persist immediately (append-only: only changed header / new messages)
        this.persistGeneration(projectRootPath, threadId, generation);
        console.log(`[ChatStateStorage] Updated generation: ${generationId}`);
    }

    /**
     * Remove a generation from a thread
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @param generationId Generation identifier
     */
    removeGeneration(projectRootPath: string, threadId: string, generationId: string): void {
        const thread = this.getOrCreateThread(projectRootPath, threadId);
        const index = thread.generations.findIndex(g => g.id === generationId);
        if (index !== -1) {
            thread.generations.splice(index, 1);
            thread.updatedAt = Date.now();
            // Persist immediately (append-only tombstone)
            this.persistGenerationRemoval(projectRootPath, threadId, generationId);
            // Also clean up checkpoint file if it exists
            this.persistenceStore.deleteCheckpoint(projectRootPath, threadId, generationId);
            console.log(`[ChatStateStorage] Removed generation: ${generationId}`);
        }
    }

    /**
     * Get a specific generation
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @param generationId Generation identifier
     * @returns Generation or undefined
     */
    getGeneration(
        projectRootPath: string,
        threadId: string,
        generationId: string
    ): Generation | undefined {
        const thread = this.getOrCreateThread(projectRootPath, threadId);
        return thread.generations.find(g => g.id === generationId);
    }

    /**
     * Get all generations for a thread
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @returns Array of generations
     */
    getGenerations(projectRootPath: string, threadId: string): Generation[] {
        const thread = this.getOrCreateThread(projectRootPath, threadId);
        return thread.generations;
    }

    // ============================================
    // Chat History (for LLM)
    // ============================================

    /**
     * Get chat history for LLM (model messages only)
     * Includes ALL generations (pending, under_review, accepted)
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @returns Array of model messages for LLM context
     */
    getChatHistoryForLLM(projectRootPath: string, threadId: string): any[] {
        const thread = this.getOrCreateThread(projectRootPath, threadId);
        const messages: any[] = [];
        const activeGenerationId = this.getActiveExecution(projectRootPath, threadId)?.generationId;

        for (const generation of thread.generations) {
            if (generation.modelMessages && generation.modelMessages.length > 0) {
                messages.push(...generation.modelMessages);
                continue;
            }
            // Skip the live generation — its prompt is appended separately by the caller.
            if (generation.id === activeGenerationId) {
                continue;
            }
            // Aborted before modelMessages were persisted — synthesize from userPrompt/uiResponse.
            if (!generation.userPrompt) {
                continue;
            }
            if (generation.uiResponse) {
                messages.push({ role: "user", content: generation.userPrompt });
                messages.push({ role: "assistant", content: generation.uiResponse });
                messages.push({
                    role: "user",
                    content:
                        `<system-reminder>\n` +
                        `The previous assistant response was rendered to the user but the request was interrupted before any tool calls, file edits, or tasks were executed. Any actions described were NOT performed — redo them if still required.\n` +
                        `</system-reminder>`,
                });
            } else {
                messages.push({
                    role: "user",
                    content:
                        `${generation.userPrompt}\n\n` +
                        `<system-reminder>\n` +
                        `The previous user message was interrupted before the assistant could respond. No tool calls or file edits were performed.\n` +
                        `</system-reminder>`,
                });
            }
        }

        console.log(`[ChatStateStorage] Retrieved ${messages.length} model messages for thread: ${threadId}`);
        return messages;
    }

    // ============================================
    // Review State Management
    // ============================================

    /**
     * Get pending review generation (latest with 'under_review' status)
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @returns Generation or undefined
     */
    getPendingReviewGeneration(
        projectRootPath: string,
        threadId: string
    ): Generation | undefined {
        const thread = this.getOrCreateThread(projectRootPath, threadId);

        // Find the LATEST generation with 'under_review' status
        // Iterate in reverse to get the most recent one
        for (let i = thread.generations.length - 1; i >= 0; i--) {
            const generation = thread.generations[i];
            if (generation.reviewState.status === 'under_review') {
                console.log(`[ChatStateStorage] Found pending review generation: ${generation.id}`);
                return generation;
            }
        }

        console.log(`[ChatStateStorage] No pending review generation in thread: ${threadId}`);
        return undefined;
    }

    /**
     * Update review state for a generation
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @param generationId Generation identifier
     * @param state Review state updates
     */
    updateReviewState(
        projectRootPath: string,
        threadId: string,
        generationId: string,
        state: Partial<GenerationReviewState>
    ): void {
        const thread = this.getOrCreateThread(projectRootPath, threadId);
        const generation = thread.generations.find(g => g.id === generationId);

        if (!generation) {
            console.error(`[ChatStateStorage] Generation not found for review update: ${generationId}`);
            return;
        }

        Object.assign(generation.reviewState, state);
        thread.updatedAt = Date.now();

        // Persist immediately (append-only: reviewState is part of the header)
        this.persistGeneration(projectRootPath, threadId, generation);
        console.log(`[ChatStateStorage] Updated review state for generation: ${generationId}, status: ${generation.reviewState.status}`);
    }

    /**
     * Accept all reviews in a thread
     * Marks ALL 'under_review' generations as 'accepted' and clears runtime-only
     * review fields (affectedPackagePaths) in a single operation.
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     */
    acceptAllReviews(projectRootPath: string, threadId: string): void {
        const thread = this.getOrCreateThread(projectRootPath, threadId);
        const changed: Generation[] = [];

        for (const generation of thread.generations) {
            if (generation.reviewState.status === 'under_review') {
                generation.reviewState.status = 'accepted';
                generation.reviewState.affectedPackagePaths = [];
                changed.push(generation);
            }
        }

        if (changed.length > 0) {
            thread.updatedAt = Date.now();
            for (const generation of changed) {
                this.persistGeneration(projectRootPath, threadId, generation);
            }
        }
        console.log(`[ChatStateStorage] Accepted ${changed.length} review(s) in thread: ${threadId}`);
    }

    /**
     * Decline all reviews in a thread
     * Marks ALL 'under_review' generations as 'error' and clears runtime-only
     * review fields (affectedPackagePaths) in a single operation.
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     */
    declineAllReviews(projectRootPath: string, threadId: string): void {
        const thread = this.getOrCreateThread(projectRootPath, threadId);
        const changed: Generation[] = [];

        for (const generation of thread.generations) {
            if (generation.reviewState.status === 'under_review') {
                generation.reviewState.status = 'error';
                generation.reviewState.errorMessage = 'Declined by user';
                generation.reviewState.affectedPackagePaths = [];
                changed.push(generation);
            }
        }

        if (changed.length > 0) {
            thread.updatedAt = Date.now();
            for (const generation of changed) {
                this.persistGeneration(projectRootPath, threadId, generation);
            }
        }
        console.log(`[ChatStateStorage] Declined ${changed.length} review(s) in thread: ${threadId}`);
    }

    // ============================================
    // Checkpoint Management
    // ============================================

    /**
     * Get all checkpoints for a thread (across all generations)
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @returns Array of checkpoints in chronological order
     */
    getCheckpoints(projectRootPath: string, threadId: string): Checkpoint[] {
        const thread = this.getOrCreateThread(projectRootPath, threadId);
        return thread.generations
            .filter(g => g.checkpoint && !g.metadata?.compactionMetadata?.isCompactedGeneration)
            .map(g => g.checkpoint!);
    }

    /**
     * Check if the thread contains compacted history
     * @param workspaceId Workspace identifier
     * @param threadId Thread identifier
     * @returns boolean
     */
    hasCompactedHistory(workspaceId: string, threadId: string): boolean {
        const thread = this.getOrCreateThread(workspaceId, threadId);
        return thread.generations.some(
            gen => gen.metadata?.compactionMetadata?.isCompactedGeneration === true
        );
    }

    /**
     * Find checkpoint by ID
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @param checkpointId Checkpoint identifier
     * @returns Checkpoint and its generation, or undefined
     */
    findCheckpoint(
        projectRootPath: string,
        threadId: string,
        checkpointId: string
    ): { checkpoint: Checkpoint; generation: Generation } | undefined {
        const thread = this.getOrCreateThread(projectRootPath, threadId);

        for (const generation of thread.generations) {
            if (generation.checkpoint?.id === checkpointId) {
                return { checkpoint: generation.checkpoint, generation };
            }
        }

        return undefined;
    }

    /**
     * Add checkpoint to a generation
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @param generationId Generation identifier
     * @param checkpoint Checkpoint to add
     */
    async addCheckpointToGeneration(
        projectRootPath: string,
        threadId: string,
        generationId: string,
        checkpoint: Checkpoint
    ): Promise<void> {
        const thread = this.getOrCreateThread(projectRootPath, threadId);
        const generation = thread.generations.find(g => g.id === generationId);

        if (!generation) {
            console.error(`[ChatStateStorage] Generation not found: ${generationId}`);
            return;
        }

        generation.checkpoint = checkpoint;
        thread.updatedAt = Date.now();

        console.log(`[ChatStateStorage] Added checkpoint ${checkpoint.id} to generation ${generationId}`);

        // Persist checkpoint snapshot to separate gzipped file (async)
        try {
            await this.persistenceStore.saveCheckpointAsync(
                projectRootPath,
                threadId,
                generationId,
                toPersistedCheckpoint(checkpoint)
            );
        } catch (err) {
            console.error(`[ChatStateStorage] Failed to persist checkpoint ${checkpoint.id}:`, err);
        }

        // Enforce checkpoint limit (evicts oldest, persisting each evicted generation)
        await this.enforceCheckpointLimit(projectRootPath, threadId);
        // Persist this generation's header (hasCheckpoint flag now reflects the checkpoint)
        this.persistGeneration(projectRootPath, threadId, generation);
    }

    /**
     * Enforce checkpoint limit by removing oldest checkpoints beyond maxCount
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     */
    private async enforceCheckpointLimit(projectRootPath: string, threadId: string): Promise<void> {
        // Dynamic import to avoid circular dependencies
        const { getCheckpointConfig } = await import('../../views/ai-panel/checkpoint/checkpointConfig');
        const config = getCheckpointConfig();

        if (!config.enabled) {
            // Nothing to evict; caller persists the newly-checkpointed generation.
            return;
        }

        const thread = this.getOrCreateThread(projectRootPath, threadId);

        // Collect all generations with checkpoints
        const generationsWithCheckpoints = thread.generations
            .map((gen, index) => ({ generation: gen, index }))
            .filter(item => item.generation.checkpoint !== undefined);

        // If we're within the limit, nothing to evict; caller persists the added generation.
        if (generationsWithCheckpoints.length <= config.maxCount) {
            return;
        }

        // Calculate how many checkpoints to remove
        const checkpointsToRemove = generationsWithCheckpoints.length - config.maxCount;

        // Bump updatedAt before persisting so the appended records carry the new timestamp.
        thread.updatedAt = Date.now();

        // Remove checkpoints from oldest generations (keep the most recent maxCount)
        for (let i = 0; i < checkpointsToRemove; i++) {
            const { generation } = generationsWithCheckpoints[i];
            const checkpointId = generation.checkpoint?.id;

            console.log(`[ChatStateStorage] Removing old checkpoint ${checkpointId} (exceeds maxCount: ${config.maxCount})`);
            generation.checkpoint = undefined;

            // Delete the persisted checkpoint file
            this.persistenceStore.deleteCheckpoint(projectRootPath, threadId, generation.id);

            // Persist the evicted generation's header (hasCheckpoint flips to false)
            this.persistGeneration(projectRootPath, threadId, generation);
        }
    }

    /**
     * Restore thread to a checkpoint (truncate generations after checkpoint)
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @param checkpointId Checkpoint identifier
     * @returns true if restored, false if checkpoint not found
     */
    restoreThreadToCheckpoint(
        projectRootPath: string,
        threadId: string,
        checkpointId: string
    ): boolean {
        const thread = this.getOrCreateThread(projectRootPath, threadId);

        // Find the generation containing this checkpoint
        let checkpointGenerationIndex = -1;
        for (let i = 0; i < thread.generations.length; i++) {
            if (thread.generations[i].checkpoint?.id === checkpointId) {
                checkpointGenerationIndex = i;
                break;
            }
        }

        if (checkpointGenerationIndex === -1) {
            console.error(`[ChatStateStorage][RESTORE] Checkpoint ${checkpointId} not found in thread ${threadId}`);
            return false;
        }

        // Clean up checkpoint files for removed generations
        const fromGenerationId = thread.generations[checkpointGenerationIndex].id;
        for (let i = checkpointGenerationIndex; i < thread.generations.length; i++) {
            this.persistenceStore.deleteCheckpoint(projectRootPath, threadId, thread.generations[i].id);
        }

        // Truncate generations at the checkpoint
        // Remove the generation WITH the checkpoint and everything after it
        // This restores to the state BEFORE the user submitted this message
        thread.generations = thread.generations.slice(0, checkpointGenerationIndex);
        thread.updatedAt = Date.now();

        // Persist truncation (append-only): removes fromGenerationId and everything after it
        this.persistTruncation(projectRootPath, threadId, fromGenerationId);
        return true;
    }

    /**
     * Get storage statistics
     */
    getStats(): {
        workspaceCount: number;
        totalThreads: number;
        totalGenerations: number;
        estimatedSizeMB: number;
    } {
        let totalThreads = 0;
        let totalGenerations = 0;
        let estimatedSize = 0;

        for (const workspace of this.storage.values()) {
            totalThreads += workspace.threads.size;

            for (const thread of workspace.threads.values()) {
                totalGenerations += thread.generations.length;
            }

            // Rough estimate of size (serialize to JSON)
            estimatedSize += JSON.stringify({
                projectRootPath: workspace.projectRootPath,
                threads: Array.from(workspace.threads.values()),
            }).length;
        }

        return {
            workspaceCount: this.storage.size,
            totalThreads,
            totalGenerations,
            estimatedSizeMB: estimatedSize / (1024 * 1024)
        };
    }

    // ============================================
    // Active Execution Management (for abort functionality)
    // ============================================

    /**
     * Register active execution for a thread
     * Auto-aborts existing execution if present
     *
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @param execution Active execution handle
     */
    setActiveExecution(
        projectRootPath: string,
        threadId: string,
        execution: ActiveExecution
    ): void {
        // Abort any existing execution for this thread first
        this.abortActiveExecution(projectRootPath, threadId);

        let threadMap = this.activeExecutions.get(projectRootPath);
        if (!threadMap) {
            threadMap = new Map();
            this.activeExecutions.set(projectRootPath, threadMap);
        }

        threadMap.set(threadId, execution);
        console.log(`[ChatStateStorage] Registered active execution: ${execution.generationId} for thread: ${threadId}`);
    }

    /**
     * Abort active execution for a thread
     * Called by RPC abort handler
     *
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @returns true if execution was aborted, false if no active execution found
     */
    abortActiveExecution(projectRootPath: string, threadId: string): boolean {
        const threadMap = this.activeExecutions.get(projectRootPath);
        if (!threadMap) {
            return false;
        }

        const execution = threadMap.get(threadId);
        if (!execution) {
            return false;
        }

        console.log(`[ChatStateStorage] Aborting execution: ${execution.generationId} for thread: ${threadId}`);
        approvalManager.cancelAllPending("Agent execution aborted by user");
        execution.abortController.abort();

        // Cleanup
        threadMap.delete(threadId);
        if (threadMap.size === 0) {
            this.activeExecutions.delete(projectRootPath);
        }

        return true;
    }

    /**
     * Clear active execution when completed normally
     * Called in finally block of AICommandExecutor.run()
     *
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     */
    clearActiveExecution(projectRootPath: string, threadId: string): void {
        const threadMap = this.activeExecutions.get(projectRootPath);
        if (!threadMap) {
            return;
        }

        threadMap.delete(threadId);
        if (threadMap.size === 0) {
            this.activeExecutions.delete(projectRootPath);
        }

        console.log(`[ChatStateStorage] Cleared active execution for thread: ${threadId}`);
    }

    /**
     * Get active execution (for debugging/inspection)
     *
     * @param projectRootPath Workspace identifier
     * @param threadId Thread identifier
     * @returns Active execution or undefined
     */
    getActiveExecution(projectRootPath: string, threadId: string): ActiveExecution | undefined {
        return this.activeExecutions.get(projectRootPath)?.get(threadId);
    }
}

// Singleton export
export const chatStateStorage = new ChatStateStorage();
