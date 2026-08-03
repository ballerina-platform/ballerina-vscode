// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

/**
 * Memory tool set for the extraction and dream agents.
 *
 * Reuses the execute functions from text-editor.ts (same fs logic, same path
 * validation, same atomic write semantics). Only the tool descriptions are
 * overridden — the originals say "NEVER create .md files" which is the
 * opposite of what the memory agents need to do.
 *
 * sendAiSchemaDidOpen / sendAISchemaDidChange are no-ops for .md files
 * (early return in ls-schema-notifications.ts line 82/140), so passing a
 * no-op eventHandler for non-.bal files is safe.
 */

import { tool } from 'ai';
import { z } from 'zod';
import {
    createReadExecute,
    createWriteExecute,
    createEditExecute,
} from '../agent/tools/text-editor';
import { CopilotEventHandler } from '../utils/events';
import { GLOBAL_MEMORY_TYPES, WORKSPACE_MEMORY_TYPES } from '@wso2/copilot-utilities/auto-memory';

const GLOBAL_TYPES_LABEL    = `${GLOBAL_MEMORY_TYPES.join(', ')} types`;
const WORKSPACE_TYPES_LABEL = `${WORKSPACE_MEMORY_TYPES.join(', ')} types`;

// Log tool failures to the extension console; ignore all other events (no UI wiring needed).
const memoryEventHandler: CopilotEventHandler = (event) => {
    if (event.type === 'tool_result' && event.toolOutput?.success === false) {
        console.error('[memoryAgent] tool failed:', event.toolName, event.toolOutput);
    }
};

/** Creates a set of read/write/edit tools for global and workspace memory directories. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MemoryToolSet = Record<string, any>;

export function createMemoryTools(globalDir: string, workspaceDir: string): MemoryToolSet {
    // Reuse existing execute functions rooted at each memory directory.
    // The LLM passes relative filenames (e.g. "user_expertise.md") and the
    // execute function resolves them against the base directory.
    const globalRead   = createReadExecute(memoryEventHandler, globalDir);
    const globalWrite  = createWriteExecute(memoryEventHandler, globalDir);
    const globalEdit   = createEditExecute(memoryEventHandler, globalDir);

    const wsRead  = createReadExecute(memoryEventHandler, workspaceDir);
    const wsWrite = createWriteExecute(memoryEventHandler, workspaceDir);
    const wsEdit  = createEditExecute(memoryEventHandler, workspaceDir);

    return {
        global_file_read: tool({
            description: `Read a memory file from the global directory (${GLOBAL_TYPES_LABEL}). ` +
                'Pass the filename relative to the global memory directory (e.g. user_expertise.md).',
            inputSchema: z.object({
                file_path: z.string().describe('Filename relative to global memory dir (e.g. user_expertise.md)'),
                offset: z.number().optional().describe('Line to start reading from'),
                limit: z.number().optional().describe('Number of lines to read'),
            }),
            execute: globalRead,
        }),

        global_file_write: tool({
            description: `Write a NEW memory file to the global directory (${GLOBAL_TYPES_LABEL}). ` +
                'Returns an error if the file already has content — use global_file_edit instead.',
            inputSchema: z.object({
                file_path: z.string().describe('Filename relative to global memory dir'),
                content: z.string().describe('Full file content including YAML frontmatter'),
            }),
            execute: globalWrite,
        }),

        global_file_edit: tool({
            description: 'Edit an existing memory file in the global directory by replacing an exact string. ' +
                'Requires a prior global_file_read of the same file.',
            inputSchema: z.object({
                file_path: z.string().describe('Filename relative to global memory dir'),
                old_string: z.string().describe('Exact text to replace (including whitespace)'),
                new_string: z.string().describe('Replacement text'),
                replace_all: z.boolean().default(false).describe('Replace all occurrences'),
            }),
            execute: globalEdit,
        }),

        workspace_file_read: tool({
            description: `Read a memory file from the workspace directory (${WORKSPACE_TYPES_LABEL}). ` +
                'Pass the filename relative to the workspace memory directory (e.g. integration_shopify.md).',
            inputSchema: z.object({
                file_path: z.string().describe('Filename relative to workspace memory dir (e.g. integration_shopify.md)'),
                offset: z.number().optional().describe('Line to start reading from'),
                limit: z.number().optional().describe('Number of lines to read'),
            }),
            execute: wsRead,
        }),

        workspace_file_write: tool({
            description: `Write a NEW memory file to the workspace directory (${WORKSPACE_TYPES_LABEL}). ` +
                'Returns an error if the file already has content — use workspace_file_edit instead.',
            inputSchema: z.object({
                file_path: z.string().describe('Filename relative to workspace memory dir'),
                content: z.string().describe('Full file content including YAML frontmatter'),
            }),
            execute: wsWrite,
        }),

        workspace_file_edit: tool({
            description: 'Edit an existing memory file in the workspace directory by replacing an exact string. ' +
                'Requires a prior workspace_file_read of the same file.',
            inputSchema: z.object({
                file_path: z.string().describe('Filename relative to workspace memory dir'),
                old_string: z.string().describe('Exact text to replace (including whitespace)'),
                new_string: z.string().describe('Replacement text'),
                replace_all: z.boolean().default(false).describe('Replace all occurrences'),
            }),
            execute: wsEdit,
        }),
    };
}
