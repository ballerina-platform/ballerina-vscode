// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { Command, ExecutionContext, GenerateAgentCodeRequest } from "@wso2/ballerina-core";
import { StateMachine } from "../../../stateMachine";
import { chatStateStorage } from '../../../views/ai-panel/chatStateStorage';
import { AICommandConfig } from "../executors/base/AICommandExecutor";
import { createWebviewEventHandler } from "../utils/events";
import { AgentExecutor } from './AgentExecutor';
import { getMigrationSourcePathForProject } from "../migration/orchestrator";
import {
    sendTelemetryEvent,
    TM_EVENT_BALLERINA_AI_GENERATION_SUBMITTED,
    CMP_BALLERINA_AI_GENERATION
} from "../../telemetry";
import { extension } from "../../../BalExtensionContext";
import { getProjectMetrics } from "../../telemetry/common/project-metrics";
import { getHashedProjectId } from "../../telemetry/common/project-id";
import { runEventStore } from "../utils/run-event-store";
import { sendSaveChatNotification } from "../utils/ai-utils";
import { finalizeRevertibleGeneration, finalizeRevertibleGenerationsAllThreads } from "../utils/generation-response";

// ==================================
// Agent Generation Functions
// ==================================

/**
 * Resolves the project root path for chat storage and telemetry.
 * - Multi-package workspace: returns workspacePath (workspace root)
 * - Single package: returns projectPath (package root)
 * - Workspace view (no active package): returns workspacePath
 */
export function resolveProjectRootPath(): string {
    const ctx = StateMachine.context();
    return ctx.workspacePath || ctx.projectPath || '';
}

/**
 * Factory function to create unified executor configuration
 * Eliminates repetitive config creation in RPC methods
 */
export function createExecutorConfig<TParams>(
    params: TParams,
    options: {
        command: Command;
        chatStorageEnabled?: boolean;
        cleanupStrategy: 'immediate' | 'review';
        existingTempPath?: string;
        projectRootPath?: string;
        threadId?: string;
        generationId?: string;
    }
): AICommandConfig<TParams> {
    const projectRootPath = options.projectRootPath ?? resolveProjectRootPath();
    // Always use the active thread so new generations go to the correct thread
    // after the user has switched sessions via the history dropdown.
    const threadId = options.threadId ?? chatStateStorage.getActiveThread(projectRootPath)?.id ?? 'default';
    const generationId = options.generationId
        ?? `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    return {
        executionContext: createExecutionContextFromStateMachine(),
        eventHandler: createWebviewEventHandler(options.command, {
            projectRootPath,
            threadId,
            generationId,
        }),
        generationId,
        abortController: new AbortController(),
        params,
        chatStorage: options.chatStorageEnabled ? {
            projectRootPath,
            threadId,
            enabled: true,
        } : undefined,
        lifecycle: {
            cleanupStrategy: options.cleanupStrategy,
            existingTempPath: options.existingTempPath,
        }
    };
}

/**
 * Finalizes the thread's open generation and reports it. The reporting lives outside
 * `chatStateStorage`, which is storage and has no business sending notifications or telemetry.
 *
 * @returns true if a generation was finalized
 */
export function finalizeLastGeneration(projectRootPath: string, threadId: string): boolean {
    return finalizeRevertibleGeneration(projectRootPath, threadId);
}

/**
 * Generates agent code based on user request
 * Handles plan mode configuration and review state management
 */
export async function generateAgent(params: GenerateAgentCodeRequest): Promise<boolean> {
    let preparedRun: {
        projectRootPath: string;
        threadId: string;
        generationId: string;
        eventHandler: AICommandConfig<GenerateAgentCodeRequest>["eventHandler"];
    } | undefined;
    let executorStarted = false;
    try {
        // Always use the active thread — params.threadId is legacy/unused
        const projectRootPath = resolveProjectRootPath();
        const threadId = chatStateStorage.getActiveThread(projectRootPath)?.id ?? 'default';

        // Only one generation may be in flight per thread at a time.
        if (
            chatStateStorage.getActiveExecution(projectRootPath, threadId)
            || runEventStore.getRunStatus(projectRootPath, threadId).isRunning
        ) {
            throw new Error('A generation is already in progress. Please wait for it to finish before starting a new one.');
        }

        // Moving on to a new generation implicitly accepts a still-open previous one —
        // on EVERY thread of the project, not just this one: the upcoming ai:// baseline
        // reseed is a per-package LS slot shared by all threads, so any other thread's
        // still-open review would be silently invalidated (and its decline would restore
        // stale content over this run's edits). Nothing to clean up beyond that: edits
        // already land directly in the real workspace, and there's no separate temp copy
        // anymore (see existingTempPath below).
        finalizeRevertibleGenerationsAllThreads(projectRootPath);

        // Create config using factory function. existingTempPath makes the agent operate
        // directly on the real project root instead of AICommandExecutor creating a
        // throwaway temp copy — file edits land live in the real workspace (M1+), so there's
        // nothing left for a temp copy to buy us.
        const config = createExecutorConfig(params, {
            command: Command.Agent,
            chatStorageEnabled: true,  // Agent uses chat storage for multi-turn conversations
            cleanupStrategy: 'review', // Review mode - revert available until the user moves on
            existingTempPath: projectRootPath,
            projectRootPath,
            threadId,
            generationId: params.generationId,
        });

        // Buffer this run's events so a closed/reopened panel can reconnect.
        config.trackForReconnection = true;

        // Inject migration source tools for projects that have been AI-enhanced
        const migrationSourcePath = getMigrationSourcePathForProject(projectRootPath);
        if (migrationSourcePath) {
            config.toolOptions = { ...config.toolOptions, migrationSourcePath };
        }

        // Persist the user turn and expose its run identity before any awaited
        // telemetry/preflight work. A panel reopened during startup therefore
        // loads the correct user message and cannot attach output to the prior turn.
        chatStateStorage.addGeneration(
            projectRootPath,
            threadId,
            params.usecase,
            {
                isPlanMode: params.isPlanMode,
                operationType: params.operationType,
                generationType: "agent",
            },
            config.generationId
        );
        chatStateStorage.setActiveExecution(projectRootPath, threadId, {
            generationId: config.generationId,
            abortController: config.abortController,
        });
        runEventStore.beginRun(projectRootPath, threadId, config.generationId);
        preparedRun = {
            projectRootPath,
            threadId,
            generationId: config.generationId,
            eventHandler: config.eventHandler,
        };

        // Get project metrics, project ID, and chat history for telemetry
        const projectMetrics = await getProjectMetrics(projectRootPath);
        const projectId = await getHashedProjectId(projectRootPath);
        const chatHistory = chatStateStorage.getChatHistoryForLLM(projectRootPath, threadId);

        // Send telemetry event for query submission
        sendTelemetryEvent(
            extension.ballerinaExtInstance,
            TM_EVENT_BALLERINA_AI_GENERATION_SUBMITTED,
            CMP_BALLERINA_AI_GENERATION,
            {
                'message.id': config.generationId,
                'command': Command.Agent,
                'project.id': projectId,
                'plan_mode': (params.isPlanMode ?? false).toString(),
                'project.files_before': projectMetrics.fileCount.toString(),
                'project.lines_before': projectMetrics.lineCount.toString(),
                'file_attachments': (params.fileAttachmentContents?.length > 0).toString(),
                'chat.has_history': (chatHistory.length > 0).toString(),
                'chat.history_length': chatHistory.length.toString(),
            }
        );

        executorStarted = true;
        await new AgentExecutor(config).run();

        return true;
    } catch (error) {
        if (preparedRun) {
            if (!executorStarted) {
                preparedRun.eventHandler({
                    type: "error",
                    content: error instanceof Error ? error.message : String(error),
                });
                preparedRun.eventHandler({
                    type: "save_chat",
                    command: Command.Agent,
                    messageId: preparedRun.generationId,
                });
            }
            runEventStore.endRun(
                preparedRun.projectRootPath,
                preparedRun.threadId,
                preparedRun.generationId
            );
            chatStateStorage.clearActiveExecution(
                preparedRun.projectRootPath,
                preparedRun.threadId
            );
        }
        console.error('[Agent] Error in generateAgent:', error);
        throw error;
    }
}


// ==================================
// ExecutionContext Factory Functions
// ==================================

/**
 * Creates an ExecutionContext from StateMachine's current state.
 * Used by tests to create context from current UI state.
 *
 * @returns ExecutionContext with paths from StateMachine
 */
export function createExecutionContextFromStateMachine(): ExecutionContext {
    const context = StateMachine.context();
    return {
        projectPath: context.projectPath,
        workspacePath: context.workspacePath
    };
}
