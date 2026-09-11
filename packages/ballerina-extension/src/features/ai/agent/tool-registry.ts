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
import { getMcpTools } from './mcp';
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
    // TODO(auto-memory): temporarily disabled for this release.
    // /** When true, registers save_memory and consolidate_memories tools in the main agent registry. */
    // autoMemoryEnabled?: boolean;
}

export function createToolRegistry(opts: ToolRegistryOptions) {
    const { eventHandler, toolModelUsage, tempProjectPath, modifiedFiles, allModifiedFiles, projects, generationType, projectRootPath, generationId, threadId, migrationSourcePath, webSearchEnabled, ctx } = opts;
    const resolvedThreadId = threadId || 'default';
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
        [TASK_OUTPUT_TOOL_NAME]: createTaskOutputTool(eventHandler),
        [KILL_TASK_TOOL_NAME]: createKillTaskTool(eventHandler),
        [CONNECTOR_GENERATOR_TOOL]: createConnectorGeneratorTool(
            eventHandler,
            tempProjectPath,
            projects[0]?.projectName,
            modifiedFiles
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
            createWriteExecute(eventHandler, tempProjectPath, modifiedFiles, allModifiedFiles, ctx)
        ),
        [FILE_SINGLE_EDIT_TOOL_NAME]: createEditTool(
            createEditExecute(eventHandler, tempProjectPath, modifiedFiles, allModifiedFiles, ctx)
        ),
        [FILE_BATCH_EDIT_TOOL_NAME]: createBatchEditTool(
            createMultiEditExecute(eventHandler, tempProjectPath, modifiedFiles, allModifiedFiles, ctx)
        ),
        [FILE_READ_TOOL_NAME]: createReadTool(
            createReadExecute(eventHandler, tempProjectPath)
        ),
        [DIAGNOSTICS_TOOL_NAME]: createDiagnosticsTool(tempProjectPath, eventHandler),
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
        ...getMcpTools(eventHandler),
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
    return Object.fromEntries(
        Object.entries(tools).map(([name, t]) => [name, withBackgroundNotifications(t as any, subagentCtx.runKey)])
    ) as typeof tools;
}
