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

import { ExecutionContext, Command, GenerationReviewState } from '@wso2/ballerina-core';
import { CopilotEventHandler } from '../../utils/events';
import { chatStateStorage, ChatStateStorage } from '../../../../views/ai-panel/chatStateStorage';
import { getTempProject, cleanupTempProject } from '../../utils/project/temp-project';
import { buildChatError } from '../../utils/ai-utils';
import { finalizeRevertibleGeneration } from '../../utils/generation-response';
import { runEventStore } from '../../utils/run-event-store';
import { agentStatusManager } from '../../state/AgentStatusManager';
import { MigrationDebugLogger } from '../../migration/debug-logger';
import { clearAiTouchedFiles } from '../../../../rpc-managers/diagram-validity';

/**
 * Unified configuration for all AI command executors
 * Consolidates execution config and command-specific parameters into single object
 */
export interface AICommandConfig<TParams = any> {
    /** Execution context with original workspace paths */
    executionContext: ExecutionContext;
    /** Event handler for communicating with frontend */
    eventHandler: CopilotEventHandler;
    /** Unique message ID for this execution */
    generationId: string;
    /** Abort controller for cancellation */
    abortController: AbortController;
    /** Command-specific parameters */
    params: TParams;

    /**
     * Optional LLM model override.
     * When provided, the executor uses this model instead of the default
     * (Anthropic Sonnet via WSO2/direct key). This enables plugging in
     * models from the VS Code Language Model API or other providers.
     */
    model?: any;

    /** Optional chat storage configuration */
    chatStorage?: {
        projectRootPath: string;
        threadId: string;
        enabled: boolean;
    };

    /**
     * Whether this run's events target the AI chat panel and should be buffered
     * for panel reconnection (`getRunStatus` replay). Set only for the agent
     * chat path; other executors (migration panel, data mapper) leave it unset
     * so they don't register themselves as the buffered "current run".
     */
    trackForReconnection?: boolean;

    /** Optional lifecycle configuration */
    lifecycle?: {
        /**
         * Path to operate on directly instead of having AICommandExecutor create a temp
         * copy. Two distinct callers rely on this: the normal agent flow (agent/index.ts)
         * sets it to the real project/workspace root, since edits already land live there
         * (no copy needed); the migration wizard sets it to a real package path for
         * in-place editing across multiple sequential stages/executions.
         */
        existingTempPath?: string;
        /**
         * Skip seedAiBaselines (the ai:// baseline seed). Set by callers
         * that reuse the same existingTempPath across multiple executions of the same
         * directory (migration's per-stage runs), where the LS already has it open from
         * an earlier execution and re-seeding would overwrite the baseline with
         * already-edited content. The normal agent flow leaves this unset — each chat
         * generation is independent and always needs a fresh baseline.
         */
        skipFreshProjectSetup?: boolean;
        /** Cleanup strategy: 'immediate' (DataMapper) or 'review' (Agent) */
        cleanupStrategy: 'immediate' | 'review';
    };

    /**
     * Optional callback invoked when the full `ModelMessage[]` array becomes
     * available — either on successful completion or on abort (partial messages).
     * Used by the wizard migration flow to persist conversation history to disk
     * so it can be resumed later via AI Chat.
     *
     * @param messages  The conversation messages from the Vercel AI SDK.
     * @param status    How the run ended: `'completed'`, `'aborted'`, or `'error'`.
     */
    onMessagesAvailable?: (messages: any[], status: 'completed' | 'aborted' | 'error') => void;

    /**
     * Optional per-execution tool configuration.
     * Allows the caller to inject context-specific tool options without changing
     * the base executor interface for every new feature.
     */
    toolOptions?: {
        /** Absolute path to the original migration source project (Mule, Tibco, etc.). */
        migrationSourcePath?: string;
    };

    /**
     * Optional overrides for the agent loop limits.
     * Defaults (for normal agent usage): maxSteps = 50, maxOutputTokens = 8192.
     * Migration enhancement should use higher values because the agent needs to
     * read source files, edit many large files, run diagnostics repeatedly, etc.
     */
    agentLimits?: {
        /** Maximum number of LLM ↔ tool roundtrips before the agent stops. */
        maxSteps?: number;
        /** Maximum output tokens per LLM response. */
        maxOutputTokens?: number;
    };

    /**
     * Optional debug logger for migration enhancement runs.
     * When provided, `AgentExecutor` logs individual tool call durations and
     * summaries to `.ballerina-ai-migration/debug.log` via this logger.
     */
    debugLogger?: MigrationDebugLogger;
}

/**
 * Result returned from command execution
 */
export interface AIExecutionResult {
    /** Path to the temporary project */
    tempProjectPath: string;
    /** Array of modified file paths (relative to temp project) */
    modifiedFiles: string[];
    /** Optional source files (for datamapper) */
    sourceFiles?: any[];
    /** Optional error */
    error?: Error;
}

/**
 * Base executor class for all AI commands
 *
 * Provides unified lifecycle management with template method pattern:
 * - run(): Single method that handles full lifecycle (init, execute, cleanup)
 * - Template stages: chat storage → temp project → execute → cleanup
 * - Optional chat storage integration for multi-turn conversations
 * - Configurable cleanup strategies (immediate vs review mode)
 */
export abstract class AICommandExecutor<TParams = any> {
    protected config: AICommandConfig<TParams>;

    constructor(config: AICommandConfig<TParams>) {
        this.config = config;
    }

    /**
     * Main execution method - handles full lifecycle with template pattern
     *
     * Stages:
     * 1. Register active execution for abort support
     * 2. Initialize chat storage (if enabled)
     * 3. Initialize temp project (create or reuse)
     * 4. Execute command logic (abstract method)
     * 5. Perform cleanup (strategy-dependent)
     * 6. Clear active execution
     *
     * @returns Execution result with temp path and modified files
     */
    async run(): Promise<AIExecutionResult> {
        const { projectRootPath, threadId } = this.config.chatStorage || {
            projectRootPath: this.config.executionContext.workspacePath || this.config.executionContext.projectPath || '',
            threadId: 'default'
        };

        try {
            console.log(`[AICommandExecutor] Starting ${this.getCommandType()} execution: ${this.config.generationId}`);

            clearAiTouchedFiles();
            await this.initializeWorkspaceThread();
            await this.prepareForExecution();

            // Stage 1: Register active execution for abort support
            chatStateStorage.setActiveExecution(projectRootPath, threadId, {
                generationId: this.config.generationId,
                abortController: this.config.abortController
            });

            // Start buffering emitted events so a panel that closes/reopens
            // mid-run can reconnect and replay what it missed (agent chat only).
            if (this.config.trackForReconnection) {
                runEventStore.beginRun(projectRootPath, threadId, this.config.generationId);
                agentStatusManager.runStarted(this.config.generationId);
            }

            // Stage 3: Temp project initialization
            await this.initializeTempProject();

            // Stage 4: Command execution
            const result = await this.execute();

            // Stage 5: Cleanup
            await this.performCleanup(result);

            console.log(`[AICommandExecutor] Completed ${this.getCommandType()} execution: ${this.config.generationId}`);
            return result;

        } catch (error) {
            await this.handleExecutionError(error);
            throw error;
        } finally {
            // Stage 6: Always clear active execution on completion (success or error)
            chatStateStorage.clearActiveExecution(projectRootPath, threadId);
            // Mark the run ended (buffer kept so an in-flight poll can still pick
            // up a terminal event).
            if (this.config.trackForReconnection) {
                runEventStore.endRun(projectRootPath, threadId, this.config.generationId);
                agentStatusManager.runEnded();
            }
        }
    }

    /**
     * Hook for subclasses that must persist turn metadata before an execution
     * is exposed through the reconnection store.
     */
    protected async prepareForExecution(): Promise<void> {
        return;
    }

    /**
     * Stage 1: Initialize workspace/thread in chat storage (if enabled)
     */
    protected async initializeWorkspaceThread(): Promise<void> {
        if (!this.config.chatStorage) {
            return;
        }
        try {
            const { projectRootPath, threadId } = this.config.chatStorage;

            // Initialize workspace and thread
            chatStateStorage.getOrCreateThread(projectRootPath, threadId);

            console.log(`[AICommandExecutor] Chat storage initialized: projectRootPath=${projectRootPath}, thread=${threadId}`);
        } catch (error) {
            console.error('[AICommandExecutor] Failed to initialize chat storage:', error);
            // Don't throw - chat storage is optional
        }
    }

    /**
     * Stage 2: Initialize temp project (create new or reuse existing)
     * Sets tempProjectPath and updates execution context
     */
    protected async initializeTempProject(): Promise<void> {
        const lifecycle = this.config.lifecycle;

        // Check if we should reuse existing temp project
        if (lifecycle?.existingTempPath) {
            this.config.executionContext.tempProjectPath = lifecycle.existingTempPath;
            console.log(`[AICommandExecutor] Reusing temp project: ${lifecycle.existingTempPath}`);
            return;
        }

        // Create new temp project
        try {
            const { path: tempPath } = await getTempProject(this.config.executionContext);
            this.config.executionContext.tempProjectPath = tempPath;
            console.log(`[AICommandExecutor] Created temp project: ${tempPath}`);
        } catch (error) {
            console.error('[AICommandExecutor] Failed to create temp project:', error);
            throw error;
        }
    }

    /**
     * Abstract execute method - each command implements its own logic
     * Should use config.executionContext.tempProjectPath for operations
     *
     * @returns Execution result with modified files
     */
    abstract execute(): Promise<AIExecutionResult>;

    /**
     * Get the command type for this executor
     * Used for event notifications
     */
    protected abstract getCommandType(): Command;

    /**
     * Stage 4: Perform cleanup based on strategy
     */
    protected async performCleanup(result: AIExecutionResult): Promise<void> {
        const strategy = this.config.lifecycle?.cleanupStrategy || 'immediate';

        if (strategy === 'immediate') {
            await this.cleanupImmediate();
        } else if (strategy === 'review') {
            await this.cleanupForReview();
        }
    }

    /**
     * Immediate cleanup - removes temp project right away
     * Used by DataMapper executors
     */
    protected async cleanupImmediate(): Promise<void> {
        const tempProjectPath = this.config.executionContext.tempProjectPath;
        if (!tempProjectPath) {
            console.log(`[AICommandExecutor] No temp project to cleanup`);
            return;
        }

        // A caller-supplied existingTempPath (direct-edit mode) is never a temp copy —
        // there's nothing to clean up, and cleanupTempProject must never be pointed at it.
        if (this.config.lifecycle?.existingTempPath === tempProjectPath) {
            return;
        }

        // Skip in test environment
        if (process.env.AI_TEST_ENV) {
            console.log(`[AICommandExecutor] Skipping cleanup (test mode): ${tempProjectPath}`);
            return;
        }

        try {
            console.log(`[AICommandExecutor] Immediate cleanup: ${tempProjectPath}`);
            // Note: cleanupTempProject now handles LS didClose notifications internally
            await cleanupTempProject(tempProjectPath);
            console.log(`[AICommandExecutor] Cleanup completed`);
        } catch (error) {
            console.error('[AICommandExecutor] Cleanup failed:', error);
            // Don't throw - cleanup failure shouldn't break flow
        }
    }

    /**
     * Review mode cleanup - persists temp project for user review
     * Used by AgentExecutor. Subclasses can override for custom behavior.
     */
    protected async cleanupForReview(): Promise<void> {
        console.log(`[AICommandExecutor] Review mode - temp project persisted: ${this.config.executionContext.tempProjectPath}`);
        // No immediate cleanup - temp persists for review
        // Actual cleanup happens when user accepts/declines via RPC
    }

    /**
     * Handle execution errors
     * Emits error or abort event and attempts cleanup
     */
    protected async handleExecutionError(error: any): Promise<void> {
        // Check if this was an abort
        if (error.name === 'AbortError' || this.config.abortController.signal.aborted) {
            console.log(`[AICommandExecutor] Execution aborted by user for ${this.getCommandType()}`);

            // Emit abort event to frontend
            this.config.eventHandler({
                type: "abort",
                command: this.getCommandType()
            });
        } else {
            // Regular error - emit error event
            const chatError = buildChatError(error);
            console.error(`[AICommandExecutor] Error in ${this.getCommandType()}:`, chatError.content, error);

            this.config.eventHandler(chatError);
        }

        // Attempt cleanup on error, but never delete an existingTempPath —
        // that is a real project directory supplied by the caller (e.g. migration
        // enhancement), not a throwaway temp created by this executor.
        const tempProjectPath = this.config.executionContext.tempProjectPath;
        const isExistingPath = this.config.lifecycle?.existingTempPath === tempProjectPath;
        if (tempProjectPath && !isExistingPath && !process.env.AI_TEST_ENV) {
            try {
                await cleanupTempProject(tempProjectPath);
            } catch (cleanupError) {
                console.warn(`[AICommandExecutor] Failed to cleanup after error:`, cleanupError);
            }
        }
    }

    /**
     * Get chat history from storage (helper for executors)
     * @returns Array of chat messages, or empty array if storage disabled
     */
    protected getChatHistory(): any[] {
        if (!this.config.chatStorage) {
            return [];
        }
        const { projectRootPath, threadId } = this.config.chatStorage;
        return chatStateStorage.getChatHistoryForLLM(projectRootPath, threadId);
    }

    /**
     * Add generation to chat storage (helper for executors)
     * @param userPrompt - User's prompt/request
     * @param metadata - Generation metadata (operation type, etc.)
     */
    protected addGeneration(userPrompt: string, metadata: any): any {
        if (!this.config.chatStorage) {
            return undefined;
        }
        const { projectRootPath, threadId } = this.config.chatStorage;
        return chatStateStorage.addGeneration(
            projectRootPath,
            threadId,
            userPrompt,
            metadata,
            this.config.generationId
        );
    }

    /**
     * Implicitly accepts whichever generation is still in the revertible 'done' window.
     * Per-thread on purpose: executors on this path (typecreator, data mapper) work in
     * their own temp copies and do NOT reseed the shared ai:// diff baseline, so another
     * thread's open review stays valid. The agent entry point (generateAgent) finalizes
     * ALL threads instead, because its baseline reseed invalidates every open review.
     */
    protected finalizePreviousGeneration(): void {
        if (!this.config.chatStorage) {
            return;
        }
        const { projectRootPath, threadId } = this.config.chatStorage;
        finalizeRevertibleGeneration(projectRootPath, threadId);
    }

    protected settleGeneration(status: GenerationReviewState['status']): void {
        if (!this.config.chatStorage) {
            return;
        }
        const { projectRootPath, threadId } = this.config.chatStorage;
        chatStateStorage.updateReviewState(projectRootPath, threadId, this.config.generationId, { status });
    }

    /**
     * Check if execution was aborted
     *
     * @returns true if aborted, false otherwise
     */
    protected isAborted(): boolean {
        return this.config.abortController.signal.aborted;
    }
}
