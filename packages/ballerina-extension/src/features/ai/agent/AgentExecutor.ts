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

import { AICommandExecutor, AICommandConfig, AIExecutionResult } from '../executors/base/AICommandExecutor';
import { Command, GenerateAgentCodeRequest, ProjectSource, ExecutionContext, SemanticDiff, ReviewModeData, PROJECT_KIND, LoginMethod } from '@wso2/ballerina-core';
import { StateMachine } from '../../../stateMachine';
import { ModelMessage, stepCountIs, streamText, TextStreamPart } from 'ai';
import { getAnthropicClient, getProviderCacheControl, getProviderModelOptions, addCacheControlToMessages, ANTHROPIC_SONNET } from '../utils/ai-client';
import { populateHistoryForAgent, getErrorMessage, getErrorCode, buildChatError } from '../utils/ai-utils';
import { seedAiBaselines } from '../utils/project/ls-schema-notifications';
import { mapWithConcurrency } from '../utils/concurrency';
import { getSystemPrompt, getUserPrompt } from './prompts';
import { FollowupSituation, startFollowupSuggestions } from './followups';
import { prepareAgentsMdForTurn } from './agents-md';
// TODO(auto-memory): temporarily disabled for this release.
// import { executeAutoDream, isMemoryEnabled } from '../memory/autoDream';
import { GenerationType } from '../utils/libs/libraries';
import { createToolRegistry } from './tool-registry';
import { loadSkillsContext } from './skills/context';

import { refreshMcpClientManager } from './mcp';
import { getProjectSource } from '../utils/project/temp-project';
import { getWorkspaceTomlValues } from '../../../utils';
import { StreamContext } from './stream-handlers/stream-context';
import { checkCompilationErrors } from './tools/diagnostics-utils';
import { TASK_WRITE_TOOL_NAME } from './tools/task-writer';
import { updateAndSaveChat, calculateTotalCost } from '../utils/events';
import { chatStateStorage } from '../../../views/ai-panel/chatStateStorage';
import * as path from 'path';
import { approvalViewManager } from '../state/ApprovalViewManager';
import {
    buildContextManagementOptions,
    detectAppliedCompaction,
    estimateFloorTokens,
    extractCompactionSummary,
    stripAnalysisFromCompactionBlocks,
    COMPACTION_BLOCK_PREFIX,
} from '@wso2/copilot-utilities/context-management';
import { getLoginMethod } from '../../../utils/ai/auth';
import {
    sendTelemetryEvent,
    sendTelemetryException,
    TM_EVENT_BALLERINA_AI_GENERATION_COMPLETED,
    TM_EVENT_BALLERINA_AI_GENERATION_ABORTED,
    TM_EVENT_BALLERINA_AI_GENERATION_FAILED,
    CMP_BALLERINA_AI_GENERATION
} from "../../telemetry";
import { extension } from "../../../BalExtensionContext";
import { getProjectMetrics } from "../../telemetry/common/project-metrics";
import { getHashedProjectId } from "../../telemetry/common/project-id";
import { workspace } from 'vscode';
import { runningServicesManager } from './tools/running-service-manager';


const RESERVED_OUTPUT_TOKENS = 8_192;

/**
 * Tracks threads that have already received a compaction_disabled warning this session.
 * Keyed by `${projectRootPath}:${threadId}`. Cleared on chat clear.
 */
const compactionDisabledWarnedThreads = new Set<string>();

/** Called by clearChat to reset the warned state for a workspace. */
export function clearCompactionDisabledWarning(projectRootPath: string, threadId: string): void {
    compactionDisabledWarnedThreads.delete(`${projectRootPath}:${threadId}`);
}

function supportsCompaction(loginMethod: LoginMethod): boolean {
    // AWS Bedrock is intentionally excluded: its Converse/ConverseStream APIs do not
    // support the `compact-2026-01-12` beta, so server-side compaction is disabled there.
    return loginMethod === LoginMethod.ANTHROPIC_KEY
        || loginMethod === LoginMethod.BI_INTEL
        || loginMethod === LoginMethod.VERTEX_AI
        || loginMethod === LoginMethod.ANTHROPIC_AWS;
}

function buildCompactionProviderOptions(loginMethod: LoginMethod, floorTokens: number) {
    if (!supportsCompaction(loginMethod)) { return undefined; }
    const options = buildContextManagementOptions({ estimatedFloorTokens: floorTokens });
    return options ?? undefined;
}

function warnCompactionDisabledOnce(projectRootPath: string, eventHandler: (e: any) => void): void {
    const warnKey = `${projectRootPath}:default`;
    if (!compactionDisabledWarnedThreads.has(warnKey)) {
        compactionDisabledWarnedThreads.add(warnKey);
        eventHandler({ type: 'compaction_disabled' });
    }
}

/** Estimate character length of a message's content for proportional token breakdown. */
function msgCharLen(msg: ModelMessage): number {
    return JSON.stringify(msg.content).length;
}

/**
 * Estimates per-category token breakdown by scaling character-based proportions to the
 * actual API-reported inputTokens total. The grand total is always exact; per-category
 * values are ~75-85% accurate.
 *
 * codebaseCharsPerTurn: char length of the codebase structure block injected as the first
 * content block of each user message. Multiplied by user message count to estimate total
 * file content across the full conversation history.
 */
function computeTokenBreakdown(
    baseMessages: ModelMessage[],
    tools: any,
    accToolCallChars: number,
    accToolResultChars: number,
    inputTokens: number,
    codebaseCharsPerTurn: number,
): { systemInstructions: number; toolDefinitions: number; reservedOutput: number; files: number; messages: number; toolResults: number } {
    const systemChars = baseMessages.filter(m => m.role === 'system').reduce((s, m) => s + msgCharLen(m), 0);
    const baseConvChars = baseMessages.filter(m => m.role === 'user' || m.role === 'assistant').reduce((s, m) => s + msgCharLen(m), 0);
    const baseToolChars = baseMessages.filter(m => m.role === 'tool').reduce((s, m) => s + msgCharLen(m), 0);

    const convChars = baseConvChars + accToolCallChars;
    const toolChars = baseToolChars + accToolResultChars;
    const toolDefsChars = JSON.stringify(tools ?? {}).length;
    const totalChars = systemChars + convChars + toolChars + toolDefsChars || 1;

    // Estimate total file content chars: codebase block appears in every user message turn
    const userMsgCount = baseMessages.filter(m => m.role === 'user').length;
    const totalCodebaseChars = Math.min(codebaseCharsPerTurn * userMsgCount, convChars);
    const pureConvChars = convChars - totalCodebaseChars;

    const systemInstructions = Math.round(inputTokens * systemChars / totalChars);
    const files = Math.round(inputTokens * totalCodebaseChars / totalChars);
    const messages = Math.round(inputTokens * pureConvChars / totalChars);
    const toolResults = Math.round(inputTokens * toolChars / totalChars);
    const toolDefinitions = Math.max(0, inputTokens - systemInstructions - files - messages - toolResults);
    return { systemInstructions, toolDefinitions, reservedOutput: RESERVED_OUTPUT_TOKENS, files, messages, toolResults };
}

/**
 * Normalizes a relative path for package-membership comparison: trims, collapses `.`
 * segments, converts backslashes, and strips leading `./` and trailing slashes. The two
 * sides being compared come from different authors (the workspace toml's `packages` list
 * vs the LLM's verbatim tool `file_path` args), so raw string comparison misses trivially
 * equivalent forms like `./orders` vs `orders/main.bal`.
 */
export function normalizeRelativePath(p: string): string {
    const normalized = path.normalize(p.trim()).replace(/\\/g, '/').replace(/\/+$/, '');
    return normalized === '.' ? '' : normalized;
}

/**
 * Determines which packages have been affected by analyzing modified files
 * Returns temp directory package paths for use with Language Server semantic diff API
 * @param modifiedFiles Array of relative file paths that were modified
 * @param projects Array of project sources with package information
 * @param ctx Execution context with project and workspace paths
 * @param tempProjectPath Temp project root path
 * @returns Array of temp package paths that have changes
 */
async function determineAffectedPackages(
    modifiedFiles: string[],
    projects: ProjectSource[],
    ctx: ExecutionContext,
    tempProjectPath: string
): Promise<string[]> {
    const affectedPackages = new Set<string>();

    console.log(`[determineAffectedPackages] Analyzing ${modifiedFiles.length} modified files across ${projects.length} projects`);
    console.log(`[determineAffectedPackages] Temp project path: ${tempProjectPath}`);

    // For non-workspace scenario (single package)
    if (!ctx.workspacePath) {
        console.log(`[determineAffectedPackages] Non-workspace scenario, using temp project path: ${tempProjectPath}`);
        affectedPackages.add(tempProjectPath);
        return Array.from(affectedPackages);
    }

    // Union of the current workspace Ballerina.toml package list (re-read so packages the
    // agent added mid-run are present) and the generation-start ProjectSource packages.
    // An empty toml `packages` array must fall back too — `??` alone doesn't cover it.
    const workspaceToml = await getWorkspaceTomlValues(tempProjectPath);
    const tomlPackages = (workspaceToml?.workspace?.packages ?? []).map(normalizeRelativePath);
    const sourcePackages = projects.map(p => normalizeRelativePath(p.packagePath ?? ''));
    const packagePaths: string[] = Array.from(new Set([...tomlPackages, ...sourcePackages])).filter(p => p !== '');

    // For workspace scenario with multiple packages
    // We need to map modified files to their temp package paths
    const unmatchedFiles: string[] = [];
    for (const modifiedFile of modifiedFiles) {
        const normalizedFile = normalizeRelativePath(modifiedFile);
        let matched = false;

        for (const pkgPath of packagePaths) {
            if (normalizedFile.startsWith(pkgPath + '/') || normalizedFile === pkgPath) {
                const tempPackagePath = path.join(tempProjectPath, pkgPath);
                affectedPackages.add(tempPackagePath);
                matched = true;
                console.log(`[determineAffectedPackages] File '${modifiedFile}' belongs to package '${pkgPath}' (temp): ${tempPackagePath}`);
                break;
            }
        }

        if (!matched) {
            // File at workspace root (e.g. root Ballerina.toml)
            affectedPackages.add(tempProjectPath);
            unmatchedFiles.push(modifiedFile);
            console.log(`[determineAffectedPackages] File '${modifiedFile}' is at workspace root (temp): ${tempProjectPath}`);
        }
    }

    // Unmatched .bal files are a red flag: the workspace root holds no sources, so their
    // package's diff would silently never be computed. Loud log so this is diagnosable.
    const unmatchedBalFiles = unmatchedFiles.filter(f => f.endsWith('.bal'));
    if (unmatchedBalFiles.length > 0) {
        console.error(
            `[determineAffectedPackages] ${unmatchedBalFiles.length} modified .bal file(s) matched no workspace package — their diffs will be missing.`,
            { unmatchedBalFiles, packagePaths }
        );
    }

    const result = Array.from(affectedPackages);
    console.log(`[determineAffectedPackages] Found ${result.length} affected temp package paths:`, result);
    return result;
}

/**
 * AgentExecutor - Executes agent-based code generation with tools and streaming
 *
 * Features:
 * - Multi-turn conversation with LLM using chat storage
 * - Review mode (temp project persists until user accepts/declines)
 * - Tool execution (TaskWrite, FileEdit, Diagnostics, etc.)
 * - Stream event processing
 * - Plan approval workflow (via ApprovalManager in TaskWrite tool)
 */
export class AgentExecutor extends AICommandExecutor<GenerateAgentCodeRequest> {
    /** Tracks in-flight tool-call start times keyed by toolCallId for duration logging. */
    private readonly _pendingToolCalls = new Map<string, number>();

    /** A turn can reach both the finish and abort paths; suggestions must be scheduled once. */
    private _followupsScheduled = false;

    constructor(config: AICommandConfig<GenerateAgentCodeRequest>) {
        super(config);
    }

    protected async prepareForExecution(): Promise<void> {
        if (!this.config.chatStorage) {
            return;
        }
        const { projectRootPath, threadId } = this.config.chatStorage;
        if (chatStateStorage.getGeneration(projectRootPath, threadId, this.config.generationId)) {
            return;
        }
        const params = this.config.params;
        this.addGeneration(params.usecase, {
            isPlanMode: params.isPlanMode,
            operationType: params.operationType,
            generationType: "agent",
        });
    }

    /**
     * Execute agent code generation
     *
     * Flow:
     * 1. Get project sources from temp directory
     * 2. Send didOpen notifications (skip if reusing temp)
     * 3. Add generation to chat storage (if enabled)
     * 4. Get chat history from storage (if enabled)
     * 5. Build LLM messages (system + history + user)
     * 6. Create tools (TaskWrite, FileEdit, Diagnostics, etc.)
     * 7. Stream LLM response and process events
     * 8. Return modified files
     */
    async execute(): Promise<AIExecutionResult> {
        const tempProjectPath = this.config.executionContext.tempProjectPath!;
        const params = this.config.params; // Access params from config
        const modifiedFiles: string[] = [];
        const allModifiedFiles: Set<string> = new Set();
        const generationStartTime = Date.now();
        const projectId = await getHashedProjectId(this.config.executionContext.workspacePath || this.config.executionContext.projectPath);

        try {
            // 1. Get project sources from temp directory
            const projects: ProjectSource[] = await getProjectSource(
                params.operationType,
                this.config.executionContext
            );

            // 2. Seed the ai:// baseline, unless the caller explicitly asked to skip it
            // (migration reusing the same directory across sequential stages). Awaited so
            // the baseline is guaranteed in place before the first edit can touch disk —
            // the LS-side ensureAiBaseline request applies the pre-edit contents before
            // responding, unlike the old fire-and-forget didOpen seed.
            if (!this.config.lifecycle?.skipFreshProjectSetup) {
                await seedAiBaselines(tempProjectPath, projects);
            } else {
                console.log(`[AgentExecutor] Skipping ai:// baseline seed (skipFreshProjectSetup)`);
            }

            // Fire-and-forget: warm the LS module-package caches for each package's
            // dependencies while the generation streams, so the first review-diff diagram
            // does not pay the one-time dependency resolution/compilation cost (seconds)
            // interactively. Failures are irrelevant — the fetch path pays the cost lazily.
            for (const project of projects) {
                const pkgRoot = project.packagePath
                    ? path.join(tempProjectPath, project.packagePath)
                    : tempProjectPath;
                StateMachine.langClient().prewarmDependencies({ projectPath: pkgRoot })
                    .catch(() => { /* best-effort warm-up only */ });
            }

            const workspaceId = this.config.executionContext.workspacePath || this.config.executionContext.projectPath;
            // Use chatStorage.threadId so onStepFinish writes to the same thread that addGeneration created.
            const threadId = this.config.chatStorage?.threadId ?? 'default';
            const projectState = {
                modifiedFiles: modifiedFiles,
                tempProjectPath,
                workingDirectory: workspaceId,
            };

            // Resolve model and login method
            const loginMethod = await getLoginMethod();
            const model = await getAnthropicClient(ANTHROPIC_SONNET);

            const projectRootPath = this.config.executionContext.workspacePath || this.config.executionContext.projectPath || '';
            const agentsMd = await prepareAgentsMdForTurn(workspaceId || '', threadId);
            if (agentsMd.hashToPersist !== undefined) {
                const generation = chatStateStorage.getGeneration(projectRootPath, threadId, this.config.generationId);
                if (generation) {
                    chatStateStorage.updateGeneration(projectRootPath, threadId, this.config.generationId, {
                        metadata: {
                            ...generation.metadata,
                            agentsMdLastReadHash: agentsMd.hashToPersist,
                        },
                    });
                }
            }

            const { allDisabled, projectSkills, userSkills, disabledSkillMetas } =
                loadSkillsContext(projectRootPath || null);

            const userMessageContent = getUserPrompt(params, tempProjectPath, projects, projectSkills, agentsMd.text);

            // Estimate fixed overhead (system prompt + codebase) to decide if compaction is viable
            // TODO(auto-memory): memory-augmented prompt disabled for this release — using base system prompt.
            const systemPromptText = getSystemPrompt(projects, params.operationType, userSkills, allDisabled, disabledSkillMetas);
            const floorTokens = estimateFloorTokens(systemPromptText, JSON.stringify(userMessageContent));


            const compactionOptions = buildCompactionProviderOptions(loginMethod, floorTokens);
            if (supportsCompaction(loginMethod) && compactionOptions === undefined) {
                warnCompactionDisabledOnce(projectRootPath, this.config.eventHandler);
            }
            const modelOptions = await getProviderModelOptions('xhigh');
            const providerOptions = compactionOptions
                ? { anthropic: { ...(modelOptions as { anthropic?: object }).anthropic, ...compactionOptions.anthropic } }
                : modelOptions;

            // Ensure the pre-edit snapshot exists before any tool can run.
            await chatStateStorage.waitForCheckpointCapture(this.config.generationId);

            // 4. Get chat history from storage (if enabled) — AFTER pre-turn compaction
            const chatHistory = this.getChatHistory();
            console.log(`[AgentExecutor] Using ${chatHistory.length} chat history messages`);

            // 5. Build LLM messages with history
            const historyMessages = populateHistoryForAgent(chatHistory);
            const cacheOptions = await getProviderCacheControl();
            
            const allMessages: ModelMessage[] = [
                {
                    role: "system",
                    content: systemPromptText,
                    providerOptions: cacheOptions,
                },
                ...historyMessages,
                {
                    role: "user",
                    content: userMessageContent,
                },
            ];

            // Accumulator for token usage from tool-internal LLM calls (e.g. Haiku filtering)
            // These are separate API calls NOT included in the main agent loop's totalUsage
            const toolModelUsage: Record<string, { inputTokens: number; outputTokens: number }> = {};

            // Refresh before building the tool registry so it picks up mid-session mcp.json edits.
            await refreshMcpClientManager();

            // Create tools
            const tools = createToolRegistry({
                eventHandler: this.config.eventHandler,
                toolModelUsage,
                tempProjectPath,
                modifiedFiles,
                allModifiedFiles,
                projects,
                generationType: GenerationType.CODE_GENERATION,
                projectRootPath: this.config.executionContext.workspacePath || this.config.executionContext.projectPath || '',
                generationId: this.config.generationId,
                threadId,
                migrationSourcePath: this.config.toolOptions?.migrationSourcePath,
                runningServices: runningServicesManager,
                webSearchEnabled: params.webSearchEnabled ?? false,
                ctx: this.config.executionContext,
                // TODO(auto-memory): temporarily disabled for this release.
                // autoMemoryEnabled: isMemoryEnabled(),
            });

            // Accumulate tool call/result character counts across steps for breakdown estimation
            let accToolCallChars = 0;
            let accToolResultChars = 0;

            // === SERVER-SIDE COMPACTION STATE ===
            // Detection: providerMetadata on text-start (Anthropic/BI_INTEL/Vertex).
            // No content-based fallback is needed — AWS Bedrock does not run server-side
            // compaction (its Converse APIs reject the compact beta).
            const useContentBasedDetection = false;
            let isCompactionBlock = false;
            let compactionContent = '';
            let cleanedCompactionSummary: string | undefined;

            // Stream LLM response with server-side context management
            const { fullStream, response, usage, totalUsage } = streamText({
                model,
                maxOutputTokens: 8192,
                messages: allMessages,
                tools,
                abortSignal: this.config.abortController.signal,
                providerOptions: providerOptions as any,

                // Strip <analysis> blocks from compaction entries before each subsequent step
                // to avoid re-sending thousands of reasoning tokens.
                // Also apply incremental cache control to the last message so Anthropic caches the
                // growing conversation history on each step.
                prepareStep: async ({ messages: stepMessages }) => {
                    if (cleanedCompactionSummary) {
                        stripAnalysisFromCompactionBlocks(stepMessages);
                    }
                    return { messages: addCacheControlToMessages({ messages: stepMessages, model }) };
                },

                // Emit per-step token usage for context usage widget + observability
                onStepFinish: (step) => {
                    // Accumulate tool call/result chars for per-category breakdown estimation
                    accToolCallChars += JSON.stringify(step.toolCalls ?? []).length;
                    accToolResultChars += JSON.stringify(step.toolResults ?? []).length;

                    console.log(
                        `[AgentExecutor] Step ${step.stepNumber} complete: ` +
                        `${step.usage?.inputTokens ?? 0} input tokens, ` +
                        `finishReason: ${step.finishReason}`
                    );

                    // Detect tool-use clearing (no mid-stream signal for this edit type)
                    const appliedCompaction = detectAppliedCompaction(step.providerMetadata);
                    if (appliedCompaction?.clearedToolUses) {
                        console.log(`[AgentExecutor] Server cleared ${appliedCompaction.clearedToolUses} tool uses`);
                    }

                    // Persist partial modelMessages after each step so chat is recoverable mid-stream
                    const stepMessages = step.response?.messages ?? [];
                    if (stepMessages.length > 0) {
                        console.log(`[AgentExecutor] Step ${step.stepNumber} saving ${stepMessages.length} message(s) to chat storage`);
                        chatStateStorage.updateGeneration(workspaceId, threadId, this.config.generationId, {
                            modelMessages: [
                                { role: "user", content: userMessageContent },
                                ...stepMessages,
                            ],
                        });
                        updateAndSaveChat(this.config.generationId, Command.Agent, this.config.eventHandler);
                    }

                    if (step.usage) {
                        const inputTokens = step.usage.inputTokens || 0;
                        const cacheReadTokens = step.usage.inputTokenDetails?.cacheReadTokens || 0;
                        const cacheWriteTokens = step.usage.inputTokenDetails?.cacheWriteTokens || 0;
                        const outputTokens = step.usage.outputTokens || 0;
                        const cacheRatio = inputTokens > 0 ? (cacheReadTokens / inputTokens * 100).toFixed(1) : '0';
                        console.log(
                            `[AgentExecutor] Step ${step.stepNumber} complete: ` +
                            `input: ${inputTokens}, output: ${outputTokens}, ` +
                            `cache read: ${cacheReadTokens}, cache write: ${cacheWriteTokens} ` +
                            `(ratio: ${cacheRatio}%), finishReason: ${step.finishReason}`
                        );
                        this.config.eventHandler({
                            type: "usage_metrics",
                            model: ANTHROPIC_SONNET,
                            usage: {
                                inputTokens,
                                cacheCreationInputTokens: cacheWriteTokens,
                                cacheReadInputTokens: cacheReadTokens,
                                outputTokens,
                            },
                            breakdown: computeTokenBreakdown(allMessages, tools, accToolCallChars, accToolResultChars, inputTokens, (userMessageContent[0] as any)?.text?.length ?? 0),
                        });
                    }
                },

                stopWhen: [stepCountIs(50)],
            });

            // Send start event to frontend
            this.config.eventHandler({ type: "start" });

            // Create stream context for handlers
            const streamContext: StreamContext = {
                eventHandler: this.config.eventHandler,
                modifiedFiles,
                allModifiedFiles,
                projects,
                messageId: this.config.generationId,
                userMessageContent,
                response,
                totalUsage,
                ctx: this.config.executionContext,
                generationStartTime,
                projectId,
                toolModelUsage,
            };

            // Process stream events - NATIVE V6 PATTERN
            try {
                for await (const part of fullStream) {
                    // Handle compaction block detection inline (text-start/text-delta)
                    if (part.type === 'text-start') {
                        const isCompaction = (part as any).providerMetadata?.anthropic?.type === 'compaction';
                        if (isCompaction) {
                            isCompactionBlock = true;
                            compactionContent = '';
                            this.config.eventHandler({ type: 'compaction_start' });
                        } else {
                            if (isCompactionBlock) {
                                // Compaction block just ended — flush it
                                isCompactionBlock = false;
                                const summary = extractCompactionSummary(compactionContent);
                                cleanedCompactionSummary = summary || compactionContent;
                                streamContext.wasCompactionTurn = true;
                                this.config.eventHandler({ type: 'compaction_end', summary: summary ?? undefined });
                                // Reset context widget to near-zero after compaction
                                this.config.eventHandler({
                                    type: 'usage_metrics',
                                    usage: { inputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 0 },
                                });
                                // Inline notice before the continuing response
                                this.config.eventHandler({
                                    type: 'content_block',
                                    content: '<compaction>Context compacted — key context preserved, conversation continues below.</compaction>',
                                });
                            }
                            // Normal text-start: emit paragraph break
                            this.config.eventHandler({ type: 'content_block', content: ' \n' });
                        }
                        continue;
                    }

                    if (part.type === 'text-delta') {
                        if (isCompactionBlock) {
                            compactionContent += part.text;
                        } else if (useContentBasedDetection && !isCompactionBlock && compactionContent === '' && part.text.trimStart().startsWith(COMPACTION_BLOCK_PREFIX)) {
                            // Bedrock: no providerMetadata on text-start, detect via content
                            isCompactionBlock = true;
                            compactionContent = part.text;
                            this.config.eventHandler({ type: 'compaction_start' });
                        } else {
                            this.config.eventHandler({ type: 'content_block', content: part.text });
                        }
                        continue;
                    }

                    await this.handleStreamPart(part, streamContext);
                }

                // Flush compaction block if still open at stream end (e.g. compaction was last block)
                if (isCompactionBlock) {
                    isCompactionBlock = false;
                    const summary = extractCompactionSummary(compactionContent);
                    cleanedCompactionSummary = summary || compactionContent;
                    this.config.eventHandler({ type: 'compaction_end', summary: summary ?? undefined });
                    this.config.eventHandler({
                        type: 'usage_metrics',
                        usage: { inputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 0 },
                    });
                    this.config.eventHandler({
                        type: 'content_block',
                        content: '<compaction>Context compacted — key context preserved.</compaction>',
                    });
                }

                // Check if abort was called after stream completed
                // This handles the case where abort happens but doesn't throw an error
                if (this.config.abortController.signal.aborted) {
                    console.log("[AgentExecutor] Detected abort after stream completion");
                    const abortError = new Error('Aborted by user');
                    abortError.name = 'AbortError';
                    throw abortError;
                }
            } catch (error: any) {
                // Handle abort specifically
                if (error.name === 'AbortError' || this.config.abortController.signal.aborted) {
                    console.log("[AgentExecutor] Aborted by user.");

                    // Get partial messages from SDK
                    let partialLLMMessages: any[] = [];
                    try {
                        const partialResponse = await response;
                        partialLLMMessages = partialResponse.messages || [];
                    } catch (e) {
                        console.warn("[AgentExecutor] Could not retrieve partial response messages:", e);
                    }

                    const projectRootPath = this.config.executionContext.workspacePath || this.config.executionContext.projectPath || '';
                    if (partialLLMMessages.length > 0) {
                        chatStateStorage.updateGeneration(projectRootPath, threadId, this.config.generationId, {
                            modelMessages: [
                                { role: "user", content: streamContext.userMessageContent },
                                ...partialLLMMessages,
                                {
                                    role: "user",
                                    content: `<abort_notification>
Generation stopped by user. The last in-progress task was not saved. Any completed edits remain in the workspace and can be reverted if unwanted. Please redo the last task if needed.
</abort_notification>`,
                                },
                            ],
                        });
                    }
                    // Emit save_chat so any pre-step-boundary streamed text is persisted into uiResponse.
                    updateAndSaveChat(this.config.generationId, Command.Agent, this.config.eventHandler);
                    // Leave any live edits in place — the user may want to continue from them.
                    // Only an explicit revert (revertGeneration) restores the checkpoint.
                    const abortedGeneration = chatStateStorage.getGeneration(projectRootPath, threadId, this.config.generationId);
                    if (abortedGeneration && !['accepted', 'reverted', 'error'].includes(abortedGeneration.reviewState.status)) {
                        const generationModifiedFiles = Array.from(new Set([...allModifiedFiles, ...modifiedFiles]));
                        if (generationModifiedFiles.length > 0) {
                            console.log("[AgentExecutor] Generation stopped with partial edits — leaving them in place");
                            chatStateStorage.updateReviewState(projectRootPath, threadId, this.config.generationId, {
                                status: 'done',
                                tempProjectPath,
                                modifiedFiles: generationModifiedFiles,
                            });
                        } else {
                            chatStateStorage.updateReviewState(projectRootPath, threadId, this.config.generationId, {
                                status: 'error',
                                errorMessage: 'Stopped by user before any changes were made',
                            });
                        }
                    }

                    // Send telemetry for generation abort
                    const abortTime = Date.now();
                    sendTelemetryEvent(
                        extension.ballerinaExtInstance,
                        TM_EVENT_BALLERINA_AI_GENERATION_ABORTED,
                        CMP_BALLERINA_AI_GENERATION,
                        {
                            'message.id': this.config.generationId,
                            'project.id': projectId,
                            'generation.start_time': generationStartTime.toString(),
                            'generation.abort_time': abortTime.toString(),
                            'generation.modified_files_count': modifiedFiles.length.toString(),
                        }
                    );

                    // Notify caller with partial messages (wizard migration history persistence)
                    if (this.config.onMessagesAvailable) {
                        this.config.onMessagesAvailable(
                            [{ role: "user", content: streamContext.userMessageContent }, ...partialLLMMessages],
                            'aborted'
                        );
                    }

                    // Only meaningful once the turn produced something to pivot away from.
                    if (partialLLMMessages.length > 0) {
                        this.maybeScheduleFollowups(streamContext, partialLLMMessages, 'aborted');
                    }

                    // Note: Abort event is sent by base class handleExecutionError()
                }

                // Re-throw for base class error handling
                throw error;
            }

            return {
                tempProjectPath,
                modifiedFiles,
            };
        } catch (error) {
            // For abort errors, re-throw so base class can handle them
            if ((error as any).name === 'AbortError' || this.config.abortController.signal.aborted) {
                throw error;
            }

            console.error("[AgentExecutor] Non-abort error in execute():", error);

            // Abort the controller so that any in-flight tool executions
            // managed by the AI SDK are cancelled and stop emitting events.
            if (!this.config.abortController.signal.aborted) {
                this.config.abortController.abort();
            }

            this.config.eventHandler(buildChatError(error));

            // For other errors, return result with error
            return {
                tempProjectPath,
                modifiedFiles,
                error: error as Error,
            };
        }
    }

    /**
     * Handles individual stream events from the AI SDK.
     */
    private async handleStreamPart(
        part: TextStreamPart<any>,
        context: StreamContext
    ): Promise<void> {
        switch (part.type) {
            case "error":
                const error = part.error instanceof Error ? part.error : new Error(String(part.error));
                await this.handleStreamError(error, context);
                throw error;

            case "finish":
                await this.handleStreamFinish(context);
                break;

            case "tool-call":
                if (this.config.debugLogger) {
                    this._pendingToolCalls.set((part as any).toolCallId, Date.now());
                }
                break;

            case "tool-result":
                if (this.config.debugLogger) {
                    const startMs = this._pendingToolCalls.get((part as any).toolCallId);
                    if (startMs !== undefined) {
                        const durationMs = Date.now() - startMs;
                        const rawResult = (part as any).result;
                        const raw = typeof rawResult === "string"
                            ? rawResult
                            : rawResult === undefined
                                ? "<no result>"
                                : JSON.stringify(rawResult) ?? "<no result>";
                        this.config.debugLogger.logToolCall((part as any).toolName, durationMs, raw);
                        this._pendingToolCalls.delete((part as any).toolCallId);
                    }
                }
                break;

            case "tool-error": {
                // A tool whose execute() throws never reaches its own
                // emitFileToolResult/eventHandler call, because tools emit their
                // tool_call/tool_result events from inside execute(). Without a
                // compensating result the UI leaves that tool_call open forever:
                // a spinner stuck in the transcript, and — since the composer's
                // loading indicator reads the same events — a step label that
                // keeps claiming a finished operation is still running.
                //
                // Unlike "error" above, this must not rethrow: the SDK feeds the
                // tool failure back to the model and the run continues.
                const failedToolName = (part as any).toolName;
                const failedToolCallId = (part as any).toolCallId;
                this._pendingToolCalls.delete(failedToolCallId);

                // TaskWrite is deliberately excluded. Its tool_result drives the
                // task rail through applyTaskWriteResult, where an empty task
                // list closes the running task and reopens a floating entry —
                // corrupting the transcript rather than just marking a failure.
                // A failed TaskWrite is left to the turn's own error handling.
                if (failedToolName && failedToolName !== TASK_WRITE_TOOL_NAME) {
                    const reason = (part as any).error;
                    context.eventHandler({
                        type: "tool_result",
                        toolName: failedToolName,
                        toolCallId: failedToolCallId,
                        failed: true,
                        toolOutput: {
                            success: false,
                            error: reason instanceof Error ? reason.message : String(reason ?? "Tool execution failed"),
                        },
                    });
                }
                break;
            }

            default:
                // All other stream part types (step-finish, etc.) are handled by the SDK.
                break;
        }
    }

    /**
     * Handles stream errors with cleanup.
     * Clears review state to prevent stale data.
     */
    private async handleStreamError(error: Error, context: StreamContext): Promise<void> {
        console.error("[Agent] Stream error:", error);

        const tempProjectPath = context.ctx.tempProjectPath!;

        // Leave any live edits in place — the user may want to continue from them. Only an
        // explicit revert (revertGeneration) restores the checkpoint.
        const projectRootPath = context.ctx.workspacePath || context.ctx.projectPath || '';
        const threadId = this.config.chatStorage?.threadId ?? 'default';
        const erroredGeneration = chatStateStorage.getGeneration(projectRootPath, threadId, context.messageId);

        if (erroredGeneration && !['accepted', 'reverted', 'error'].includes(erroredGeneration.reviewState.status)) {
            const generationModifiedFiles = Array.from(new Set([...context.allModifiedFiles, ...context.modifiedFiles]));
            if (generationModifiedFiles.length > 0) {
                console.log("[AgentExecutor] Generation errored with partial edits — leaving them in place");
                chatStateStorage.updateReviewState(projectRootPath, threadId, context.messageId, {
                    status: 'done',
                    tempProjectPath,
                    modifiedFiles: generationModifiedFiles,
                });
            } else {
                chatStateStorage.updateReviewState(projectRootPath, threadId, context.messageId, {
                    status: 'error',
                    errorMessage: getErrorMessage(error),
                });
            }
        }

        // Send telemetry for generation failed
        const errorTime = Date.now();
        sendTelemetryException(
            extension.ballerinaExtInstance,
            error,
            CMP_BALLERINA_AI_GENERATION,
            {
                'event.name': TM_EVENT_BALLERINA_AI_GENERATION_FAILED,
                'message.id': context.messageId,
                'project.id': context.projectId,
                'error.message': getErrorMessage(error),
                'error.type': error.name || 'Unknown',
                'error.code': (error as any)?.code || 'N/A',
                'generation.start_time': context.generationStartTime.toString(),
                'generation.error_time': errorTime.toString(),
                'generation.duration_ms': (errorTime - context.generationStartTime).toString(),
            }
        );

        // Save partial LLM messages to storage and emit save_chat (mirrors abort path)
        let messagesToSave: any[] = [];
        try {
            const partialResponse = await context.response;
            messagesToSave = partialResponse.messages || [];
        } catch (e) {
            console.warn("[AgentExecutor] Could not retrieve partial response messages on error:", e);
        }

        if (messagesToSave.length > 0) {
            chatStateStorage.updateGeneration(projectRootPath, threadId, context.messageId, {
                modelMessages: [
                    { role: "user", content: context.userMessageContent },
                    ...messagesToSave,
                ],
            });
            updateAndSaveChat(context.messageId, Command.Agent, context.eventHandler);
        }

        // A quota failure gets a Continue chip with no model call — the webview keeps it hidden
        // until the limit resets, so the user can pick the work back up then.
        const situation: FollowupSituation = getErrorCode(error) === 'usage_limit' ? 'usage_limit' : 'error';
        this.maybeScheduleFollowups(context, messagesToSave, situation, getErrorMessage(error));
    }

    /**
     * Handles stream completion - runs diagnostics and updates chat state.
     */
    private async handleStreamFinish(context: StreamContext): Promise<void> {
        const finalResponse = await context.response;
        const assistantMessages = finalResponse.messages || [];
        const tempProjectPath = context.ctx.tempProjectPath!;

        // Run final diagnostics
        const finalDiagnostics = await checkCompilationErrors(tempProjectPath);
        context.eventHandler({
            type: "diagnostics",
            diagnostics: finalDiagnostics.diagnostics
        });

        // Send telemetry for generation completion
        const generationEndTime = Date.now();
        const isPlanModeEnabled = workspace.getConfiguration('ballerina.ai').get<boolean>('planMode', false);
        const finalProjectMetrics = await getProjectMetrics(tempProjectPath);

        // Get total token usage across all agent steps (includes cache stats)
        const totalTokenUsage = await context.totalUsage;
        const inputTokens = totalTokenUsage.inputTokens || 0;
        const outputTokens = totalTokenUsage.outputTokens || 0;
        const totalCacheRead = totalTokenUsage.inputTokenDetails?.cacheReadTokens || 0;
        const totalCacheWrite = totalTokenUsage.inputTokenDetails?.cacheWriteTokens || 0;
        // Aggregate tool-internal LLM usage across all models
        const toolTokens = Object.values(context.toolModelUsage).reduce(
            (acc, u) => ({ input: acc.input + u.inputTokens, output: acc.output + u.outputTokens }),
            { input: 0, output: 0 }
        );

        const totalCost = calculateTotalCost(
            ANTHROPIC_SONNET,
            { inputTokens, outputTokens, cacheReadTokens: totalCacheRead, cacheWriteTokens: totalCacheWrite },
            context.toolModelUsage
        );

        console.log('[AgentExecutor] Generation complete — token usage:', {
            input: inputTokens,
            output: outputTokens,
            cacheRead: totalCacheRead,
            cacheWrite: totalCacheWrite,
            cacheRatio: `${inputTokens > 0 ? (totalCacheRead / inputTokens * 100).toFixed(1) : '0'}%`,
            toolModelUsage: context.toolModelUsage,
            cost: `$${totalCost.toFixed(4)}`,
        });

        // Send telemetry for generation complete
        sendTelemetryEvent(
            extension.ballerinaExtInstance,
            TM_EVENT_BALLERINA_AI_GENERATION_COMPLETED,
            CMP_BALLERINA_AI_GENERATION,
            {
                'message.id': context.messageId,
                'project.id': context.projectId,
                'generation.start_time': context.generationStartTime.toString(),
                'generation.end_time': generationEndTime.toString(),
                'plan_mode': isPlanModeEnabled.toString(),
            },
            {
                'tokens.input': inputTokens,
                'tokens.output': outputTokens,
                'tokens.cache_read': totalCacheRead,
                'tokens.cache_creation': totalCacheWrite,
                'tokens.tool.input': toolTokens.input,
                'tokens.tool.output': toolTokens.output,
                'generation.modified_files_count': context.modifiedFiles.length,
                'project.files_after': finalProjectMetrics.fileCount,
                'project.lines_after': finalProjectMetrics.lineCount,
                'cost.total': totalCost,
            }
        );

        // Update chat state storage
        await this.updateChatState(context, assistantMessages, tempProjectPath);

        // Every edit already landed live in the real workspace via persistLiveEdit (see
        // text-editor.ts) — no re-integration needed here. In workspace mode, still resolve the
        // active project path from the generation's modified files if it wasn't already known.
        if (!context.ctx.projectPath && context.ctx.workspacePath) {
            const generationFiles = new Set([...context.allModifiedFiles, ...context.modifiedFiles]);
            const firstBalFile = Array.from(generationFiles).find(f => f.endsWith('.bal'));
            if (firstBalFile) {
                const packageName = firstBalFile.split('/')[0];
                if (packageName) {
                    StateMachine.context().projectPath = path.join(context.ctx.workspacePath, packageName);
                }
            }
        }

        // Emit UI events
        await this.emitReviewActions(context);

        // Follow-up suggestions — best-effort, non-blocking.
        this.maybeScheduleFollowups(context, assistantMessages, 'completed');

        // TODO(auto-memory): auto-dream consolidation temporarily disabled for this release.
        // // autoDream consolidation — skipped on compaction turns (no real user activity)
        // const workspacePath = context.ctx.workspacePath || context.ctx.projectPath || '';
        // if (workspacePath && !context.wasCompactionTurn) {
        //     executeAutoDream({ workspacePath });
        // }
    }

    /** Hands the finished turn to the follow-up suggestion flow; at most once per turn. */
    private maybeScheduleFollowups(
        context: StreamContext,
        assistantMessages: any[],
        situation: FollowupSituation,
        errorMessage?: string
    ): void {
        // Migration and evals drive this executor with their own handlers and no chat storage —
        // suggestions there would burn a call and leak chips into the wrong panel.
        if (this._followupsScheduled || !this.config.chatStorage?.enabled) {
            return;
        }
        this._followupsScheduled = startFollowupSuggestions({
            situation,
            messageId: context.messageId,
            projectRootPath: context.ctx.workspacePath || context.ctx.projectPath || '',
            threadId: this.config.chatStorage.threadId,
            assistantMessages,
            userQuery: this.config.params.usecase ?? '',
            isPlanMode: this.config.params.isPlanMode,
            abortSignal: this.config.abortController.signal,
            errorMessage,
            eventHandler: this.config.eventHandler,
        });
    }

    /**
     * Updates chat state storage with generation results.
     */
    private async updateChatState(
        context: StreamContext,
        assistantMessages: any[],
        tempProjectPath: string
    ): Promise<void> {
        const projectRootPath = context.ctx.workspacePath || context.ctx.projectPath || '';
        const threadId = this.config.chatStorage?.threadId ?? 'default';

        const generationModifiedFiles = Array.from(new Set([...context.allModifiedFiles, ...context.modifiedFiles]));

        // Update chat state storage with user message + assistant messages
        chatStateStorage.updateGeneration(projectRootPath, threadId, context.messageId, {
            modelMessages: [
                { role: "user", content: context.userMessageContent },
                ...assistantMessages,
            ],
        });

        // Skip review mode if no files were modified
        if (generationModifiedFiles.length === 0) {
            console.log("[AgentExecutor] No modified files - skipping review mode");
            chatStateStorage.updateReviewState(projectRootPath, threadId, context.messageId, {
                status: 'accepted',
            });
            return;
        }

        // Determine which packages have been affected by the changes
        // This returns temp package paths for use with Language Server APIs
        const affectedPackagePaths = await determineAffectedPackages(
            generationModifiedFiles,
            context.projects,
            context.ctx,
            tempProjectPath
        );

        // Status stays put here: 'done' means revertible, and it is emitReviewActions that
        // produces the data that makes it so. Announcing it earlier leaves a window where a
        // panel reload reads the generation as settled and never hears otherwise.
        chatStateStorage.updateReviewState(projectRootPath, threadId, context.messageId, {
            tempProjectPath,
            modifiedFiles: generationModifiedFiles,
            affectedPackagePaths: affectedPackagePaths,
        });
    }

    /**
     * Emits review actions and chat save events to UI.
     */
    private async emitReviewActions(context: StreamContext): Promise<void> {
        const workspaceId = context.ctx.workspacePath || context.ctx.projectPath;
        const threadId = this.config.chatStorage?.threadId ?? 'default';

        const currentGeneration = chatStateStorage.getGeneration(workspaceId, threadId, context.messageId);
        const accumulatedModifiedFiles = currentGeneration?.reviewState.modifiedFiles ?? [];
        const cachedAffectedPackages = currentGeneration?.reviewState.affectedPackagePaths ?? [];

        if (accumulatedModifiedFiles.length > 0) {
            const semanticDiffs: SemanticDiff[] = [];
            let loadDesignDiagrams = false;
            let affectedPackages: string[] = [];
            const diffPackageMap: string[] = [];
            const langClient = StateMachine.context().langClient;
            // The execution's working root: the real workspace in direct-edit mode.
            const workingProjectPath = context.ctx.tempProjectPath!;
            affectedPackages = cachedAffectedPackages.length > 0
                ? cachedAffectedPackages
                : await determineAffectedPackages(accumulatedModifiedFiles, context.projects, context.ctx, workingProjectPath);
            const isWorkspace = StateMachine.context().projectInfo?.projectKind === PROJECT_KIND.WORKSPACE_PROJECT;
            let semanticDiffError: string | undefined;
            const appendDiffError = (msg: string) => {
                semanticDiffError = semanticDiffError ? `${semanticDiffError}\n${msg}` : msg;
            };
            let diffedPackageCount = 0;
            // Each package's diff is an independent LS request against its own project root,
            // so fetch them concurrently; results are folded back in affectedPackages order
            // below to keep diffPackageMap/semanticDiffs alignment and error-message order
            // deterministic. Bounded, because each request can trigger two full package
            // compilations and migration turns can touch many packages at once.
            const diffPackages = affectedPackages.filter(
                // Skip workspace root — it only contains Ballerina.toml, not a real package
                pkg => !(isWorkspace && pkg === workingProjectPath));
            const packageResults = await mapWithConcurrency(diffPackages, 3, async pkg => {
                const pkgName = path.basename(pkg);
                try {
                    const res = await langClient.getSemanticDiff({ projectPath: pkg });
                    // errorMsg means the LS could not compute diffs at all (e.g. the package
                    // fails to compile) — semanticDiffs is absent, so treat it as a failure
                    // instead of reading past it.
                    if (res?.errorMsg) {
                        throw new Error(res.errorMsg);
                    }
                    return { pkgName, res, error: undefined as string | undefined };
                } catch (err) {
                    // One package failing must not discard the diffs collected for its
                    // siblings — record the failure and report it alongside them.
                    console.error(`[AgentExecutor] getSemanticDiff failed for package ${pkg}; keeping other packages' diffs`, err);
                    const message = err instanceof Error ? err.message : String(err);
                    return { pkgName, res: undefined, error: isWorkspace ? `${pkgName}: ${message}` : message };
                }
            });
            for (const { pkgName, res, error } of packageResults) {
                if (error !== undefined) {
                    appendDiffError(error);
                    continue;
                }
                if (res) {
                    diffedPackageCount++;
                    diffPackageMap.push(...Array(res.semanticDiffs.length).fill(pkgName));
                    semanticDiffs.push(...res.semanticDiffs);
                    loadDesignDiagrams = loadDesignDiagrams || res.loadDesignDiagrams;
                    // Partial success: diffs are valid but the package failed to compile,
                    // so flow diagrams will likely be unavailable. Keep the diffs and
                    // surface the reason as a warning — appended so no package's reason
                    // is dropped.
                    if (res.compilationError) {
                        appendDiffError(res.compilationError);
                    }
                }
            }

            // Diagnosability guard: files were modified, yet no package produced (or was
            // even asked for) a diff and no error was recorded. Without this, a mapping
            // failure is indistinguishable from a genuine no-op turn.
            // (diffedPackageCount === 0 implies semanticDiffs is empty — diffs are only
            // pushed in the branch that increments it.)
            const modifiedBalFiles = accumulatedModifiedFiles.filter(f => f.endsWith('.bal'));
            if (!semanticDiffError && modifiedBalFiles.length > 0 && diffedPackageCount === 0) {
                semanticDiffError =
                    `The review diff could not be computed: none of the ${modifiedBalFiles.length} modified .bal file(s) ` +
                    `mapped to a reviewable package. The changes are already applied to your files.`;
                console.error('[AgentExecutor] Review diff silently empty — modified files mapped to no package.', {
                    modifiedFiles: accumulatedModifiedFiles,
                    affectedPackages,
                    workingProjectPath,
                });
            }

            const reviewData: ReviewModeData = {
                views: [],
                currentIndex: 0,
                generationId: context.messageId,
                semanticDiffs,
                loadDesignDiagrams,
                affectedPackages,
                modifiedFiles: accumulatedModifiedFiles,
                tempProjectPath: workingProjectPath,
                isWorkspace,
                semanticDiffError,
            };

            approvalViewManager.openReviewMode(context.messageId, reviewData, false);

            // Keep what the diff view needs on the generation itself, so reopening resolves against
            // the thread that owns it rather than a workspace-wide slot.
            // 'done' = finished and revertible, so it lands with the data that makes it revertible.
            chatStateStorage.updateReviewState(workspaceId, threadId, context.messageId, {
                status: 'done',
                tempProjectPath: workingProjectPath,
                modifiedFiles: accumulatedModifiedFiles,
                affectedPackagePaths: affectedPackages,
                reviewView: { semanticDiffs, loadDesignDiagrams, isWorkspace, semanticDiffError },
            });

            context.eventHandler({
                type: "chat_component",
                componentType: "review",
                data: { modifiedFiles: accumulatedModifiedFiles, semanticDiffs, loadDesignDiagrams, affectedPackages, isWorkspace, diffPackageMap, generationId: context.messageId }
            });
        }

        updateAndSaveChat(context.messageId, Command.Agent, context.eventHandler);
        context.eventHandler({ type: "stop", command: Command.Agent });
    }

    protected getCommandType(): Command {
        return Command.Agent;
    }
}
