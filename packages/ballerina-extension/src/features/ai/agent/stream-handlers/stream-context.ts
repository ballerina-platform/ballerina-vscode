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

import { ExecutionContext, ProjectSource } from "@wso2/ballerina-core";
import { CopilotEventHandler, ToolModelUsage } from "../../utils/events";
import { StreamTextResult } from 'ai';

/**
 * Context object containing all shared state for stream event handlers.
 * Passed to every handler during stream processing.
 */
export interface StreamContext {
    // Event emission
    eventHandler: CopilotEventHandler;

    // Shared mutable state (accumulated during stream processing)
    modifiedFiles: string[];
    allModifiedFiles: Set<string>;

    // Configuration (immutable during stream)
    projects: ProjectSource[];
    messageId: string;
    userMessageContent: any;

    // Response promise (for message history and abort/finish handling)
    response: StreamTextResult<any, any>['response'];

    // Token usage promise (for telemetry — total across all steps)
    totalUsage: StreamTextResult<any, any>['totalUsage'];

    // Execution context (for workspace integration)
    ctx: ExecutionContext;

    // Telemetry tracking
    generationStartTime: number;
    projectId: string;

    // Mid-stream compaction status
    compactionFailedMidStream?: boolean;
    /** Set to true when a compaction block was detected in this turn's response. */
    wasCompactionTurn?: boolean;

    // Accumulated token usage from tool-internal LLM calls, keyed by model name
    toolModelUsage: ToolModelUsage;
}
