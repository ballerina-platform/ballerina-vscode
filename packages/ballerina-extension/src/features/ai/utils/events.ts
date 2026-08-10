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

import { ChatNotify, Command } from "@wso2/ballerina-core";
import { ModelUsage } from "./libs/function-registry";
import {
    sendMigrationPanelNotification,
    sendVisualizerMigrationNotification,
    sendAIPanelNotification,
    AIPanelRunContext,
} from "./ai-utils";

export type CopilotEventHandler = (event: ChatNotify) => void;

export type ToolModelUsage = Record<string, { inputTokens: number; outputTokens: number }>;

import { calculateCost } from "./model-pricing";

export { calculateCost };

export function calculateTotalCost(
    mainModel: string,
    mainUsage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number },
    toolModelUsage: ToolModelUsage
): number {
    const mainCost = calculateCost({ model: mainModel, ...mainUsage });
    const toolCost = Object.entries(toolModelUsage).reduce(
        (sum, [model, u]) => sum + calculateCost({ model, inputTokens: u.inputTokens, outputTokens: u.outputTokens }),
        0
    );
    return mainCost + toolCost;
}

export function emitModelUsage(eventHandler: CopilotEventHandler, usages: ModelUsage[], accumulator: ToolModelUsage): void {
    for (const u of usages) {
        if (!accumulator[u.model]) {
            accumulator[u.model] = { inputTokens: 0, outputTokens: 0 };
        }
        accumulator[u.model].inputTokens += u.inputTokens;
        accumulator[u.model].outputTokens += u.outputTokens;

        eventHandler({
            type: "usage_metrics",
            model: u.model,
            usage: {
                inputTokens: u.inputTokens,
                cacheCreationInputTokens: 0,
                cacheReadInputTokens: 0,
                outputTokens: u.outputTokens,
            },
        });
    }
}

/**
 * Updates chat message with model messages and triggers save
 * This is a shared utility used by agent, datamapper, and other AI features
 */
export function updateAndSaveChat(messageId: string, command: Command, eventHandler: CopilotEventHandler): void {
    eventHandler({ type: "save_chat", command, messageId });
}

// Event listener that handles events and sends notifications
export function createWebviewEventHandler(
    command: Command,
    runContext?: AIPanelRunContext
): CopilotEventHandler {
    return (event: ChatNotify) => {
        if (event.type === "evals_tool_result") {
            return;
        }
        if (event.type === "task_approval_request") {
            console.log("[Event Handler] Task approval request received:", event);
        } else if (event.type === "compaction_start") {
            console.log("[Compaction] Context compaction started");
        } else if (event.type === "compaction_end") {
            console.log("[Compaction] Context compaction completed");
        } else if (event.type === "compaction_disabled") {
            console.warn("[Compaction] Compaction disabled — codebase floor exceeds trigger threshold");
        }

        // The executor event is already the public ChatNotify shape. Forward it
        // unchanged so the run identity remains attached end-to-end.
        sendAIPanelNotification(
            event.type === "stop" && event.command === undefined
                ? { ...event, command }
                : event,
            runContext
        );
    };
}

/**
 * Event handler factory that routes agent/executor events to the standalone
 * Migration Enhancement Panel (instead of the AI Chat panel).
 *
 * Uses `sendMigrationPanelNotification` under the hood so the notifications
 * target `MigrationPanelWebview.viewType`.
 */
export function createMigrationEventHandler(command: Command): CopilotEventHandler {
    return (event: ChatNotify) => {
        // Route all events through the migration-panel notification channel
        sendMigrationPanelNotification(event);
    };
}

/**
 * Event handler factory that routes agent/executor events to the AI Chat panel.
 * Used when the user starts migration enhancement directly from AI Chat (static project).
 */
export function createAIPanelMigrationEventHandler(command: Command): CopilotEventHandler {
    return (event: ChatNotify) => {
        sendAIPanelNotification(event);
    };
}

/**
 * Event handler factory that routes agent/executor events to the Visualizer
 * webview.  Used for the wizard-level migration AI enhancement so the
 * ImportIntegration wizard can show live streaming progress before the project
 * is opened in VS Code.
 */
export function createVisualizerMigrationEventHandler(command: Command): CopilotEventHandler {
    return (event: ChatNotify) => {
        sendVisualizerMigrationNotification(event);
    };
}
