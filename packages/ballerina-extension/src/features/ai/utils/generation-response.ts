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

import { extension } from "../../../BalExtensionContext";
import { StateMachine } from "../../../stateMachine";
import {
    sendTelemetryEvent,
    TM_EVENT_BALLERINA_AI_GENERATION_KEPT,
    TM_EVENT_BALLERINA_AI_GENERATION_DISCARD,
    CMP_BALLERINA_AI_GENERATION
} from "../../telemetry";
import { getHashedProjectId } from "../../telemetry/common/project-id";
import { Command } from "@wso2/ballerina-core";
import { chatStateStorage } from "../../../views/ai-panel/chatStateStorage";
import { sendSaveChatNotification } from "./ai-utils";
import { approvalViewManager } from "../state/ApprovalViewManager";

/**
 * Implicitly accept whichever generation is still revertible, with the reporting that goes with
 * it. Lives here rather than in agent/index.ts so executors can share it without importing the
 * module that imports them.
 *
 * @returns true if a generation was finalized
 */
export function finalizeRevertibleGeneration(projectRootPath: string, threadId: string): boolean {
    // Runs before the early return: the open review belongs to the previous turn either way.
    approvalViewManager.closeReviewModeIfOpen();

    const finalized = chatStateStorage.finalizeLastGenerationIfDone(projectRootPath, threadId);
    if (!finalized) {
        return false;
    }

    sendGenerationKeptTelemetry(finalized.id).catch((error) =>
        console.error('[Agent] Failed to send generation-kept telemetry:', error));
    sendSaveChatNotification(Command.Agent, finalized.id);
    console.log(`[Agent] Accepted generation: ${finalized.id}`);
    return true;
}

/**
 * Finalizes revertible generations across EVERY thread of the project, not just the one
 * about to run. The ai:// diff baseline is a single per-package slot in the Language
 * Server — reseeding it at generation start silently invalidates any other thread's
 * still-open review, whose decline would then restore stale content over the new run's
 * edits. Same policy as the same-thread implicit accept, applied project-wide.
 *
 * @returns true if any generation was finalized
 */
export function finalizeRevertibleGenerationsAllThreads(projectRootPath: string): boolean {
    let finalizedAny = false;
    for (const thread of chatStateStorage.listThreadsSummary(projectRootPath)) {
        finalizedAny = finalizeRevertibleGeneration(projectRootPath, thread.id) || finalizedAny;
    }
    return finalizedAny;
}

/**
 * Sends a telemetry event when the user keeps an AI-generated response.
 *
 * @param messageId - The message identifier for the kept generation
 */
export async function sendGenerationKeptTelemetry(messageId: string): Promise<void> {
    const projectPath = StateMachine.context()?.projectPath || '';
    const projectId = await getHashedProjectId(projectPath);

    sendTelemetryEvent(
        extension.ballerinaExtInstance,
        TM_EVENT_BALLERINA_AI_GENERATION_KEPT,
        CMP_BALLERINA_AI_GENERATION,
        {
            'message.id': messageId,
            'project.id': projectId,
        }
    );
}

/**
 * Sends a telemetry event when the user discard an AI-generated response.
 *
 * @param messageId - The message identifier for the discarded generation
 */
export async function sendGenerationDiscardTelemetry(messageId: string): Promise<void> {
    const projectPath = StateMachine.context()?.projectPath || '';
    const projectId = await getHashedProjectId(projectPath);

    sendTelemetryEvent(
        extension.ballerinaExtInstance,
        TM_EVENT_BALLERINA_AI_GENERATION_DISCARD,
        CMP_BALLERINA_AI_GENERATION,
        {
            'message.id': messageId,
            'project.id': projectId,
        }
    );
}
