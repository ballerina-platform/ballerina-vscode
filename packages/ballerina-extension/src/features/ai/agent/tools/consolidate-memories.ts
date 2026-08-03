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

import { tool } from 'ai';
import { z } from 'zod';
import { CopilotEventHandler } from '../../utils/events';
import { runConsolidation } from '../../memory/autoDream';

export const CONSOLIDATE_MEMORIES_TOOL_NAME = 'consolidate_memories';

export function createConsolidateMemoriesTool(projectRootPath: string, eventHandler: CopilotEventHandler) {
    return tool({
        description: `Consolidate and deduplicate memory files. Call only when memory files are clearly redundant or disorganized — not during normal usage. Background consolidation already runs automatically based on activity and time.`,
        inputSchema: z.object({}),
        execute: async (): Promise<string> => {
            eventHandler({ type: 'tool_call', toolName: CONSOLIDATE_MEMORIES_TOOL_NAME });
            try {
                await runConsolidation({ workspacePath: projectRootPath });
                eventHandler({ type: 'tool_result', toolName: CONSOLIDATE_MEMORIES_TOOL_NAME, toolOutput: { action: 'consolidated' } });
                return 'Memory consolidation complete.';
            } catch (e) {
                const msg = `Consolidation failed: ${e instanceof Error ? e.message : String(e)}`;
                eventHandler({ type: 'tool_result', toolName: CONSOLIDATE_MEMORIES_TOOL_NAME, toolOutput: { action: 'error', error: msg } });
                return msg;
            }
        },
    });
}
