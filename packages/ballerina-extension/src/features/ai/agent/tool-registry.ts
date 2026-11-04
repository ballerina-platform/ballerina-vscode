// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

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

/**
 * Tool registry factory extracted from AgentExecutor.
 */
import { ExecutionContext, ProjectSource } from '@wso2/ballerina-core';
import { CopilotEventHandler } from '../utils/events';
import { createTaskWriteTool, TASK_WRITE_TOOL_NAME } from './tools/task-writer';
import { createDiagnosticsTool, DIAGNOSTICS_TOOL_NAME } from './tools/diagnostics';
import { createEditDiagnosticsReporter, withEditDiagnostics } from './tools/edit-diagnostics';
import {
    createBatchEditTool,
    createEditExecute,
    createEditTool,
    createMultiEditExecute,
    createReadExecute,
    createReadTool,
    createWriteExecute,
    createWriteTool,
    FILE_BATCH_EDIT_TOOL_NAME,
    FILE_READ_TOOL_NAME,
    FILE_SINGLE_EDIT_TOOL_NAME,
    FILE_WRITE_TOOL_NAME
} from './tools/text-editor';
import { GenerationType } from '../utils/libs/libraries';
import { createConnectorGeneratorTool, CONNECTOR_GENERATOR_TOOL } from './tools/connector-generator';
import { SpecContext } from './tools/connector-spec-source';
import { createSubagentTool } from './tools/subagent-tool';
import { createKillTaskTool, createTaskOutputTool } from './tools/task-tools';
import { buildRunKey, KILL_TASK_TOOL_NAME, SUBAGENT_TOOL_NAME, SubagentRunContext, TASK_OUTPUT_TOOL_NAME } from './subagents/types';
import { withBackgroundNotifications } from './subagents/background';
import { chatStateStorage } from '../../../views/ai-panel/chatStateStorage';
import { createConfigCollectorTool, CONFIG_COLLECTOR_TOOL } from './tools/config-collector';
import { createTestRunnerTool, TEST_RUNNER_TOOL_NAME } from './tools/test-runner';
import {
    createMigrationSourceListTool,
    createMigrationSourceReadTool,
    MIGRATION_SOURCE_LIST_TOOL,
    MIGRATION_SOURCE_READ_TOOL,
} from './tools/migration-source-reader';
import { createBallerinaRunTool, BALLERINA_RUN_TOOL_NAME } from './tools/ballerina-run';
import { createBallerinaGetLogsTool, BALLERINA_GET_LOGS_TOOL_NAME } from './tools/ballerina-get-logs';
import { createBallerinaStopTool, BALLERINA_STOP_TOOL_NAME } from './tools/ballerina-stop';
import { RunningServicesManager } from './tools/running-service-manager';
import { createHurlTool, HURL_TOOL_NAME } from './tools/hurl-tool';
import { createWebSearchTool, WEB_SEARCH_TOOL_NAME, createWebFetchTool, WEB_FETCH_TOOL_NAME } from './tools/web-tools';
import { createClarifyTool, CLARIFY_TOOL } from './tools/clarify';
import { createSkillTool, SKILL_TOOL_NAME } from './tools/skill-tool';
import { REGISTERED_SKILLS } from './skills';
import { bridgeMcpToolDefinitions } from './mcp';
import { createToolSearchTool, SearchableTool, TOOL_SEARCH_TOOL_NAME } from './tools/tool-search';
import type { FrozenToolDefinition } from '@wso2/ballerina-core/lib/state-machine-types';
import { byName, type ToolDescription } from './prefix-state';
import { asSchema, type Tool } from 'ai';
// TODO(auto-memory): temporarily disabled for this release — restore once the memory feature is refined.
// import { createSaveMemoryTool, SAVE_MEMORY_TOOL_NAME } from './tools/save-memory';
// import { createDeleteMemoryTool, DELETE_MEMORY_TOOL_NAME } from './tools/delete-memory';
// import { createConsolidateMemoriesTool, CONSOLIDATE_MEMORIES_TOOL_NAME } from './tools/consolidate-memories';

export interface ToolRegistryOptions {
    eventHandler: CopilotEventHandler;
    toolModelUsage: Record<string, { inputTokens: number; outputTokens: number }>;
    tempProjectPath: string;
    modifiedFiles: string[];
    allModifiedFiles: Set<string>;
    projects: ProjectSource[];
    generationType: GenerationType;
    projectRootPath: string;
    generationId: string;
    threadId?: string;
    /** Absolute path to the original migration source project (Mule, Tibco, etc.). */
    migrationSourcePath?: string;
    runningServices: RunningServicesManager;
    webSearchEnabled: boolean;
    ctx: ExecutionContext;
    /** The thread's attachments and user text; the connector generator reads a supplied spec from them. */
    specContext?: SpecContext;
    // TODO(auto-memory): temporarily disabled for this release.
    // /** When true, registers save_memory and consolidate_memories tools in the main agent registry. */
    // autoMemoryEnabled?: boolean;
}

/**
 * Built-in tools sent with `deferLoading`: rarely used, so the model sees only their names until it
 * loads one with `tool_search`. Tools the system prompt tells the model to use routinely stay eager.
 */
const DEFERRED_BUILT_IN_TOOLS: ReadonlySet<string> = new Set([
    WEB_SEARCH_TOOL_NAME,
    WEB_FETCH_TOOL_NAME,
    HURL_TOOL_NAME,
    BALLERINA_GET_LOGS_TOOL_NAME,
    BALLERINA_STOP_TOOL_NAME,
    KILL_TASK_TOOL_NAME,
]);

export function isDeferredTool(t: Tool): boolean {
    return (t.providerOptions?.anthropic as { deferLoading?: boolean } | undefined)?.deferLoading === true;
}

function deferTool(t: Tool): Tool {
    const anthropic = (t.providerOptions?.anthropic ?? {}) as Record<string, unknown>;
    return { ...t, providerOptions: { ...t.providerOptions, anthropic: { ...anthropic, deferLoading: true } } } as Tool;
}

/** Eager tools first, in registration order, then the deferred ones by name. */
function orderTools(tools: Record<string, Tool>): Record<string, Tool> {
    const entries = Object.entries(tools);
    const eager = entries.filter(([, t]) => !isDeferredTool(t));
    const deferred = entries.filter(([, t]) => isDeferredTool(t)).sort(([a], [b]) => byName({ name: a }, { name: b }));
    return Object.fromEntries([...eager, ...deferred]);
}

/** Each tool as the request sends it: name, description, JSON input schema and provider options. */
export async function describeTools(tools: Record<string, Tool>): Promise<ToolDescription[]> {
    return Promise.all(Object.entries(tools).map(async ([name, t]) => ({
        name,
        description: t.description,
        inputSchema: await asSchema(t.inputSchema as any).jsonSchema,
        providerOptions: t.providerOptions,
    })));
}

export interface ToolRegistryParts {
    /** The built-in tools, `tool_search` included, without any MCP tool. */
    builtIns: Record<string, Tool>;
    /** The whole tool set: the built-ins plus these MCP definitions, every one deferred. */
    withMcpTools(definitions: readonly FrozenToolDefinition[], disconnected?: ReadonlySet<string>): Record<string, Tool>;
}

/**
 * The tool set in two steps, because which MCP definitions a turn sends depends on a hash of the
 * built-in ones (see prefix-state.ts).
 */
export function createToolRegistryParts(opts: ToolRegistryOptions): ToolRegistryParts {
    const { eventHandler, toolModelUsage, tempProjectPath, modifiedFiles, allModifiedFiles, projects, generationType, projectRootPath, generationId, threadId, migrationSourcePath, webSearchEnabled, ctx, specContext } = opts;
    const resolvedThreadId = threadId || 'default';
    // Which compiler errors this run has shown the model, shared by the edit tools and the
    // diagnostics tool. Only with an ExecutionContext do edits go through the document model, so
    // only then does the language server see them.
    const editDiagnostics = ctx ? createEditDiagnosticsReporter(tempProjectPath) : undefined;
    // Library lookups happen only inside subagents; their histories live next to the thread.
    const subagentCtx: SubagentRunContext = {
        eventHandler,
        toolModelUsage,
        generationType,
        projectRootPath,
        threadId: resolvedThreadId,
        threadDir: chatStateStorage.getThreadDir(projectRootPath, resolvedThreadId),
        runKey: buildRunKey(projectRootPath, resolvedThreadId),
    };
    // In a workspace project, generated code goes into the package the user is working in.
    const activeProject = projects.find(project => project.isActive) ?? projects[0];
    const tools = {
        [TASK_WRITE_TOOL_NAME]: createTaskWriteTool(
            eventHandler,
            tempProjectPath,
            modifiedFiles,
            projectRootPath,
            generationId,
            threadId || 'default'
        ),
        [SUBAGENT_TOOL_NAME]: createSubagentTool(subagentCtx),
        [TASK_OUTPUT_TOOL_NAME]: createTaskOutputTool(eventHandler, subagentCtx.runKey),
        [KILL_TASK_TOOL_NAME]: createKillTaskTool(eventHandler, subagentCtx.runKey),
        [CONNECTOR_GENERATOR_TOOL]: createConnectorGeneratorTool(
            eventHandler,
            tempProjectPath,
            activeProject?.projectName,
            modifiedFiles,
            specContext,
            activeProject?.packagePath
        ),
        [CONFIG_COLLECTOR_TOOL]: createConfigCollectorTool(
            eventHandler,
            {
                tempPath: tempProjectPath,
                workspacePath: projectRootPath
            },
            modifiedFiles
        ),
        [FILE_WRITE_TOOL_NAME]: createWriteTool(
            withEditDiagnostics(editDiagnostics, createWriteExecute(eventHandler, tempProjectPath, modifiedFiles, allModifiedFiles, ctx))
        ),
        [FILE_SINGLE_EDIT_TOOL_NAME]: createEditTool(
            withEditDiagnostics(editDiagnostics, createEditExecute(eventHandler, tempProjectPath, modifiedFiles, allModifiedFiles, ctx))
        ),
        [FILE_BATCH_EDIT_TOOL_NAME]: createBatchEditTool(
            withEditDiagnostics(editDiagnostics, createMultiEditExecute(eventHandler, tempProjectPath, modifiedFiles, allModifiedFiles, ctx))
        ),
        [FILE_READ_TOOL_NAME]: createReadTool(
            createReadExecute(eventHandler, tempProjectPath)
        ),
        [DIAGNOSTICS_TOOL_NAME]: createDiagnosticsTool(tempProjectPath, eventHandler, editDiagnostics),
        [TEST_RUNNER_TOOL_NAME]: createTestRunnerTool(tempProjectPath, eventHandler),
        // Migration source tools — registered only when a source project path is available
        ...(migrationSourcePath ? {
            [MIGRATION_SOURCE_LIST_TOOL]: createMigrationSourceListTool(eventHandler, migrationSourcePath),
            [MIGRATION_SOURCE_READ_TOOL]: createMigrationSourceReadTool(eventHandler, migrationSourcePath),
        } : {}),
        [HURL_TOOL_NAME]: createHurlTool(eventHandler),
        [BALLERINA_RUN_TOOL_NAME]: createBallerinaRunTool(tempProjectPath, opts.runningServices, eventHandler),
        [BALLERINA_GET_LOGS_TOOL_NAME]: createBallerinaGetLogsTool(opts.runningServices, eventHandler),
        [BALLERINA_STOP_TOOL_NAME]: createBallerinaStopTool(opts.runningServices, eventHandler),
        [WEB_SEARCH_TOOL_NAME]: createWebSearchTool(eventHandler, webSearchEnabled),
        [WEB_FETCH_TOOL_NAME]: createWebFetchTool(eventHandler, webSearchEnabled),
        [CLARIFY_TOOL]: createClarifyTool(eventHandler),
        [SKILL_TOOL_NAME]: createSkillTool(REGISTERED_SKILLS, projectRootPath, eventHandler),
        [TOOL_SEARCH_TOOL_NAME]: createToolSearchTool(() => deferredCatalog(), eventHandler),
        // TODO(auto-memory): memory tools temporarily disabled for this release — restore once the memory feature is refined.
        // // Memory tools — registered only when auto-memory is enabled and a workspace root is known
        // ...(autoMemoryEnabled && projectRootPath ? {
        //     [SAVE_MEMORY_TOOL_NAME]:          createSaveMemoryTool(projectRootPath, eventHandler),
        //     [DELETE_MEMORY_TOOL_NAME]:        createDeleteMemoryTool(projectRootPath, eventHandler),
        //     [CONSOLIDATE_MEMORIES_TOOL_NAME]: createConsolidateMemoriesTool(projectRootPath, eventHandler),
        // } : {}),
    };
    // Every tool result of this run carries a <system-reminder> for background subagents that have
    // finished since the last one, so the main agent learns of completion without polling.
    // `tool_search` is left out: a result that loads tools can hold nothing but the tool references,
    // so a notice drained into it would be lost; it rides the next tool result instead.
    const wrap = (set: Record<string, Tool>) => Object.fromEntries(
        Object.entries(set).map(([name, t]) => [name, name === TOOL_SEARCH_TOOL_NAME ? t : withBackgroundNotifications(t as any, subagentCtx.runKey)])
    ) as Record<string, Tool>;
    const builtIns = orderTools(wrap(Object.fromEntries(
        Object.entries(tools as Record<string, Tool>).map(([name, t]) => [name, DEFERRED_BUILT_IN_TOOLS.has(name) ? deferTool(t) : t])
    )));

    // What `tool_search` searches: the deferred tools of the set last built, without the MCP
    // tools whose server is not connected.
    let all = builtIns;
    let unavailable: ReadonlySet<string> = new Set();
    const deferredCatalog = (): SearchableTool[] => Object.entries(all)
        .filter(([name, t]) => isDeferredTool(t) && !unavailable.has(name))
        .map(([name, t]) => ({ name, description: t.description ?? '' }));

    return {
        builtIns,
        withMcpTools(definitions, disconnected = new Set()) {
            unavailable = disconnected;
            const mcpTools = Object.fromEntries(Object.entries(bridgeMcpToolDefinitions(definitions, eventHandler)).map(([name, t]) => [name, deferTool(t)]));
            all = orderTools({ ...builtIns, ...wrap(mcpTools) });
            return all;
        },
    };
}
