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

import {
    ChatEntry,
    ChatError,
    ChatErrorCode,
    ChatNotify,
    ChatStart,
    DiagnosticEntry,
    IntermidaryState,
    onChatNotify,
    ProjectSource,
    SourceFile,
    ToolCall,
    ToolResult,
    Command,
    DocumentationGeneratorIntermediaryState,
    PayloadContext,
    HttpPayloadContext,
    MessageQueuePayloadContext,
    FileAttatchment,
    OperationType,
    Protocol,
    webToolToggle,
    onCopilotChatNotify,
    GenerationReviewState
} from "@wso2/ballerina-core";
import { ModelMessage } from "ai";
import { MessageRole } from "./ai-types";
import { USAGE_LIMIT_EXCEEDED_MESSAGE } from "./ai-client";
import { RPCLayer } from "../../../RPCLayer";
import { AiPanelWebview } from "../../../views/ai-panel/webview";
import { MigrationPanelWebview } from "../../../views/migration-panel/webview";
import { VisualizerWebview } from "../../../views/visualizer/webview";
import { GenerationType } from "./libs/libraries";
import { runEventStore } from "./run-event-store";
import { agentStatusManager } from "../state/AgentStatusManager";
// import { REQUIREMENTS_DOCUMENT_KEY } from "./code/np_prompts";

export function populateHistory(chatHistory: ChatEntry[]): ModelMessage[] {
    if (!chatHistory || chatHistory.length === 0) {
        return [];
    }

    const messages: ModelMessage[] = [];
    for (const history of chatHistory) {
        // Map actor to role, defaulting to "user" if not "assistant"
        const role: MessageRole = history.actor === "assistant" ? "assistant" : "user";

        messages.push({
            role: role,
            content: history.message,
        });
    }
    return messages;
}

export function populateHistoryForAgent(chatHistory: any[]): ModelMessage[] {
    if (!chatHistory || chatHistory.length === 0) {
        return [];
    }
    const messages: ModelMessage[] = [];
    for (const entry of chatHistory) {
        if ('role' in entry) {
            messages.push({
                role: entry.role,
                content: entry.content,
            });
        }
    }
    return messages;
}

/**
 * Builds file paths for project files with workspace-aware prefixing.
 * Returns structured data including file path, content, package name, and active status.
 *
 * @param projects - Array of project sources to process
 * @param fileFilter - Optional filter function to include/exclude files
 * @returns Array of file objects with path, content, and metadata
 */
export function buildFilePaths(
    projects: ProjectSource[],
    fileFilter?: (filePath: string) => boolean
): Array<{ filePath: string; content: string; packageName?: string; isActive: boolean }> {
    const usePackagePrefix = projects.length > 1;
    const result: Array<{ filePath: string; content: string; packageName?: string; isActive: boolean }> = [];

    for (const project of projects) {
        const packagePrefix = usePackagePrefix && project.packagePath ? `${project.packagePath}/` : "";
        const packageName = project.projectName;
        const isActive = project.isActive;

        // Process root files
        for (const file of project.sourceFiles) {
            const filePath = packagePrefix + file.filePath;
            if (!fileFilter || fileFilter(filePath)) {
                result.push({ filePath, content: file.content, packageName, isActive });
            }
        }

        // Process module files
        project.projectModules?.forEach((module) => {
            let basePath = packagePrefix;
            basePath += module.isGenerated ? "generated/" : "modules/";
            basePath += module.moduleName + "/";

            for (const file of module.sourceFiles) {
                const filePath = basePath + file.filePath;
                if (!fileFilter || fileFilter(filePath)) {
                    result.push({ filePath, content: file.content, packageName, isActive });
                }
            }
        });
    }

    return result;
}

export function flattenProjectToFiles(projects: ProjectSource[]): SourceFile[] {
    return buildFilePaths(projects).map(({ filePath, content }) => ({
        filePath,
        content
    }));
}

/**
 * Formats file upload contents for AI prompts.
 * Returns empty string if no files are uploaded.
 *
 * @param fileUploadContents - Array of file attachments
 * @returns Formatted string with file names and contents
 */
export function formatFileUploadContents(fileUploadContents: FileAttatchment[]): string {
    if (fileUploadContents.length === 0) {
        return "";
    }

    const formattedFiles = fileUploadContents
        .map(file => `File Name: ${file.fileName}
Content: ${file.content}`)
        .join("\n");

    return `4. File Upload Contents. : Contents of the file which the user uploaded as additional information for the query.

${formattedFiles}`;
}

export function extractResourceDocumentContent(sourceFiles: readonly SourceFile[]): string {
    const requirementFiles = sourceFiles
        .filter(sourceFile => sourceFile.filePath.toLowerCase().endsWith("Requirements.md"))
        .slice(0, 1)
        .map(sourceFile => sourceFile.content);

    if (requirementFiles.length === 0) {
        return "";
    }
    return requirementFiles[0];
}

export function sendMessagesNotification(messages: any[]): void {
    const msg: ChatNotify = {
        type: "messages",
        messages: messages,
    };
    sendAIPanelNotification(msg);
}

export function sendDiagnosticMessageNotification(diags: DiagnosticEntry[]): void {
    const msg: ChatNotify = {
        type: "diagnostics",
        diagnostics: diags,
    };
    sendAIPanelNotification(msg);
}

export function sendChatComponentNotification(componentType: string, data: Record<string, any>, id?: string): void {
    const msg: ChatNotify = { type: "chat_component", id, componentType, data };
    sendAIPanelNotification(msg);
}

export function sendContentReplaceNotification(content: string): void {
    const msg: ChatNotify = {
        type: "content_replace",
        content: content,
    };
    sendAIPanelNotification(msg);
}

export function sendContentAppendNotification(chunk: string): void {
    const msg: ChatNotify = {
        type: "content_block",
        content: chunk,
    };
    sendAIPanelNotification(msg);
}

export function sendMessageStopNotification(command: Command): void {
    const msg: ChatNotify = {
        type: "stop",
        command
    };
    sendAIPanelNotification(msg);
}

export function sendErrorNotification(error: ChatError): void {
    sendAIPanelNotification(error);
}

export function sendMessageStartNotification(): void {
    const msg: ChatStart = {
        type: "start",
    };
    sendAIPanelNotification(msg);
}

export function sendIntermidateStateNotification(intermediaryState: DocumentationGeneratorIntermediaryState): void {
    const msg: IntermidaryState = {
        type: "intermediary_state",
        state: intermediaryState,
    };
    sendAIPanelNotification(msg);
}

export function sendToolCallNotification(toolName: string, toolInput?: any, toolCallId?: string): void {
    const msg: ToolCall = {
        type: "tool_call",
        toolName: toolName,
        toolInput: toolInput,
        toolCallId: toolCallId,
    };
    sendAIPanelNotification(msg);
}

export function sendToolResultNotification(toolName: string, toolOutput?: any, toolCallId?: string, failed?: boolean): void {
    const msg: ToolResult = {
        type: "tool_result",
        toolName,
        toolOutput,
        toolCallId,
        failed,
    };
    sendAIPanelNotification(msg);
}

export function sendTaskApprovalRequestNotification(approvalType: "plan" | "completion", tasks: any[], taskDescription?: string, message?: string, requestId?: string, autoApproved?: boolean): void {
    const msg: ChatNotify = {
        type: "task_approval_request",
        requestId: requestId || `approval-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        approvalType: approvalType,
        tasks: tasks,
        taskDescription: taskDescription,
        message: message,
        autoApproved: autoApproved,
    };
    sendAIPanelNotification(msg);
}

export function sendWebToolApprovalNotification(requestId: string, toolName: "web_search" | "web_fetch", content: string): void {
    const msg: ChatNotify = {
        type: "web_tool_approval_request",
        requestId,
        toolName,
        content,
    };
    sendAIPanelNotification(msg);
}

export function sendAbortNotification(command: Command): void {
    const msg: ChatNotify = {
        type: "abort",
        command
    };
    sendAIPanelNotification(msg);
}

export function sendSaveChatNotification(command: Command, messageId: string): void {
    const msg: ChatNotify = {
        type: "save_chat",
        command,
        messageId
    };
    sendAIPanelNotification(msg);
}

export function sendGeneratedSourcesNotification(fileArray: SourceFile[]): void {
    const msg: ChatNotify = {
        type: "generated_sources",
        fileArray: fileArray,
    };
    sendAIPanelNotification(msg);
}

export function sendConnectorGenerationNotification(event: ChatNotify & { type: "connector_generation_notification" }): void {
    sendAIPanelNotification(event);
}

export function sendConfigurationCollectionNotification(event: ChatNotify & { type: "configuration_collection_event" }): void {
    sendAIPanelNotification(event);
}

export function sendClarifyNotification(event: ChatNotify & { type: "clarify_event" }): void {
    sendAIPanelNotification(event);
}

export function sendSkillEnableNotification(event: ChatNotify & { type: "skill_enable_event" }): void {
    sendAIPanelNotification(event);
}

export function sendGenerationStatusNotification(generationId: string, status: GenerationReviewState["status"]): void {
    const msg: ChatNotify = {
        type: "generation_status",
        generationId,
        status,
    };
    sendAIPanelNotification(msg);
}

export function sendWebToolToggleNotification(active: boolean): void {
    RPCLayer._messenger.sendNotification(
        webToolToggle,
        { type: "webview", webviewType: AiPanelWebview.viewType },
        { active }
    );
}

export interface AIPanelRunContext {
    projectRootPath: string;
    threadId: string;
    generationId: string;
}

export function sendAIPanelNotification(msg: ChatNotify, runContext?: AIPanelRunContext): void {
    // Only executor-owned handlers provide a run context. Unrelated AI-panel
    // notifications must never be captured by another concurrently running turn.
    const stamped = runContext
        ? runEventStore.stamp(
            runContext.projectRootPath,
            runContext.threadId,
            runContext.generationId,
            msg
        )
        : msg;

    // Feed the ambient indicators (status bar + visualizer orb); ignores events
    // outside the explicitly scoped agent run.
    if (runContext) {
        agentStatusManager.onChatNotify(stamped);
    }
    // The agent keeps running after the panel is closed (by design). The event is
    // already buffered above, so skipping the post loses nothing — reconnect replays
    // it on reopen. Guard on the live panel and swallow any late-dispose race.
    if (AiPanelWebview.currentPanel) {
        try {
            RPCLayer._messenger.sendNotification(onChatNotify, { type: "webview", webviewType: AiPanelWebview.viewType }, stamped);
            return;
        } catch (e) {
            // Panel was disposed between the guard and the send — fall through and
            // mirror to the visualizer instead (the panel is effectively gone; the
            // buffer also has the event for replay).
        }
    }
    // Panel closed: mirror the stream to the visualizer webview so its mini-chat
    // overlay can render live. Best-effort — the buffer above remains the source
    // of truth for replay. Sent on a dedicated method (onCopilotChatNotify)
    // because the visualizer's onChatNotify belongs to the migration wizard.
    if (VisualizerWebview.currentPanel) {
        try {
            RPCLayer._messenger.sendNotification(onCopilotChatNotify, { type: "webview", webviewType: VisualizerWebview.viewType }, stamped);
        } catch (e) {
            // Visualizer disposed between the guard and the send — safe to ignore.
        }
    }
}

/**
 * Sends a chat notification to the standalone Migration Enhancement Panel.
 * Mirrors `sendAIPanelNotification` but targets `MigrationPanelWebview.viewType`.
 */
export function sendMigrationPanelNotification(msg: ChatNotify): void {
    RPCLayer._messenger.sendNotification(onChatNotify, { type: "webview", webviewType: MigrationPanelWebview.viewType }, msg);
}

/**
 * Sends a chat notification to the Visualizer webview.
 * Used by the wizard-level migration AI enhancement to stream progress
 * back to the ImportIntegration wizard before the project is opened.
 */
export function sendVisualizerMigrationNotification(msg: ChatNotify): void {
    RPCLayer._messenger.sendNotification(onChatNotify, { type: "webview", webviewType: VisualizerWebview.viewType }, msg);
}

export function sendUsageMetricsNotification(
    usage: { inputTokens: number; cacheCreationInputTokens: number; cacheReadInputTokens: number; outputTokens: number },
    breakdown?: { systemInstructions: number; toolDefinitions: number; reservedOutput: number; files: number; messages: number; toolResults: number },
): void {
    sendAIPanelNotification({ type: "usage_metrics", usage, breakdown });
}

export function sendConfigChangeNotification(key: 'showContextUsage' | 'mcpToolsEnabled', value: boolean): void {
    sendAIPanelNotification({ type: 'config_change', key, value });
}

export function getGenerationMode(generationType: GenerationType) {
    return generationType === GenerationType.CODE_GENERATION ? "CORE" : "HEALTHCARE";
}

/**
 * Normalize any thrown value into a string message.
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        // Standard Error objects have a .message property
        if (error.name === "UsageLimitError") {
            return USAGE_LIMIT_EXCEEDED_MESSAGE;
        }
        if (error.name === "AI_RetryError") {
            return "An error occurred connecting with the AI service. Please try again later.";
        }
        if (error.name === "AbortError") {
            return "Generation stopped by the user.";
        }

        // Friendly message for connection / stream interruption errors
        const msg = error.message;
        if (
            msg.includes("Remote host closed the connection") ||
            msg.includes("reading stream") ||
            msg.includes("inbound response body") ||
            msg.includes("ECONNRESET") ||
            msg.includes("socket hang up")
        ) {
            return "The AI service connection was interrupted. Please try again.";
        }
        if (msg.includes("JSON parsing failed")) {
            return "The AI service returned an invalid response. Please try again.";
        }
        if (msg.includes("Unsupported login method")) {
            return "Please sign in to WSO2 Integrator Copilot to use AI features.";
        }

        return msg;
    }
    // If it's an object with a .message field, use that
    if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as Record<string, unknown>).message === "string"
    ) {
        // Check if it has a statusCode property indicating 429
        if ("statusCode" in error && (error as any).statusCode === 429) {
            return USAGE_LIMIT_EXCEEDED_MESSAGE;
        }
        return (error as { message: string }).message;
    }
    // Fallback: try to JSON-stringify, otherwise call toString()
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

export function getErrorCode(error: unknown): ChatErrorCode | undefined {
    if (
        typeof error === "object" &&
        error !== null &&
        ((error as any).name === "UsageLimitError" || (error as any).statusCode === 429)
    ) {
        return "usage_limit";
    }
    return undefined;
}

/**
 * Build a ChatError event from a thrown value, tagging it with a code so the
 * frontend can route it (e.g. usage_limit -> persistent banner, not inline box).
 */
export function buildChatError(error: unknown): ChatError {
    return {
        type: "error",
        content: getErrorMessage(error),
        code: getErrorCode(error),
    };
}

export function isHttpPayloadContext(context: PayloadContext): context is HttpPayloadContext {
    return context.protocol === Protocol.HTTP;
}

export function isMessageQueuePayloadContext(context: PayloadContext): context is MessageQueuePayloadContext {
    return context.protocol === Protocol.MESSAGE_BROKER;
}
