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

import {
    AgentChatAPI,
    ChatReqMessage,
    ChatRespMessage,
    ExecutionStep,
    TraceInput,
    TraceStatus,
    TraceStatusRequest,
    ChatHistoryMessage,
    ChatHistoryResponse,
    AgentStatusResponse,
    ClearChatResponse,
    SessionInput,
    SessionInfoResponse,
    AvailableAgentsResponse,
    SwitchAgentRequest,
    SwitchAgentResponse,
    SubmitDecisionRequest,
    DecisionMessage,
    HumanResponse,
    PendingApprovalInfo
} from "@wso2/ballerina-core";
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { extension } from '../../BalExtensionContext';
import { TracerMachine, TraceServer } from "../../features/tracing";
import { TraceDetailsWebview } from "../../features/tracing/trace-details-webview";
import { Trace } from "../../features/tracing/trace-server";
import { v4 as uuidv4 } from "uuid";
import { updateChatSessionId } from "../../features/tryit/activator";

export class AgentChatRpcManager implements AgentChatAPI {
    // Shared by getChatMessage and submitDecision. Safe only because the UI serializes them -
    // input stays disabled while an approval is pending, so the two never overlap. If that
    // ever changes, give each operation its own controller.
    private currentAbortController: AbortController | null = null;
    // Store chat history per session ID
    private static chatHistoryMap: Map<string, ChatHistoryMessage[]> = new Map();
    // Track active sessions
    private static activeSessions: Set<string> = new Set();

    async getChatMessage(params: ChatReqMessage): Promise<ChatRespMessage> {
        return new Promise(async (resolve, reject) => {
            try {
                if (
                    !extension.agentChatContext.chatEp || typeof extension.agentChatContext.chatEp !== 'string' ||
                    !extension.agentChatContext.chatSessionId || typeof extension.agentChatContext.chatSessionId !== 'string'
                ) {
                    throw new Error('Invalid Agent Chat Context: Missing or incorrect ChatEP or ChatSessionID!');
                }

                // Store user message in history
                const sessionId = extension.agentChatContext.chatSessionId;
                // Mark session as active when first message is sent
                AgentChatRpcManager.activeSessions.add(sessionId);

                this.addMessageToHistory(sessionId, {
                    type: 'message',
                    text: params.message,
                    isUser: true
                });

                this.currentAbortController = new AbortController();

                const payload = { sessionId: extension.agentChatContext.chatSessionId, ...params };

                const response = await this.fetchTestData(
                    extension.agentChatContext.chatEp,
                    payload,
                    this.currentAbortController.signal
                );
                if (response && response.pendingApproval) {
                    const pendingApproval: PendingApprovalInfo = response.pendingApproval;

                    this.addMessageToHistory(sessionId, {
                        type: 'approval',
                        text: '',
                        isUser: false,
                        pendingApproval
                    });

                    resolve({ message: '', pendingApproval } as ChatRespMessage);
                } else if (response && response.message) {
                    // Find trace and extract tool calls and execution steps
                    const trace = this.findTraceForMessage(extension.agentChatContext.chatSessionId, params.message, response.message);
                    const executionSteps = trace ? this.extractExecutionSteps(trace) : undefined;

                    // Store agent response in history
                    this.addMessageToHistory(sessionId, {
                        type: 'message',
                        text: response.message,
                        isUser: false,
                        traceId: trace?.traceId,
                        executionSteps
                    });

                    resolve({
                        message: response.message,
                        traceId: trace?.traceId,
                        executionSteps
                    } as ChatRespMessage);
                } else {
                    reject(new Error("Invalid response format:", response));
                }
            } catch (error) {
                // Store error message in history
                const errorMessage =
                    error && typeof error === "object" && "message" in error
                        ? String(error.message)
                        : "An unknown error occurred";

                const sessionId = extension.agentChatContext?.chatSessionId;
                let traceId: string | undefined;
                let executionSteps: ExecutionStep[] | undefined;

                if (sessionId) {
                    const trace = this.findTraceForMessage(extension.agentChatContext.chatSessionId, params.message);
                    traceId = trace?.traceId;
                    executionSteps = trace ? this.extractExecutionSteps(trace) : undefined;

                    this.addMessageToHistory(sessionId, {
                        type: 'error',
                        text: errorMessage,
                        isUser: false,
                        traceId,
                        executionSteps
                    });
                }

                // Embed trace information in the error for RPC transmission
                const traceInfo = { traceId, executionSteps };
                const errorWithTrace = new Error(JSON.stringify({
                    message: errorMessage,
                    traceInfo: traceInfo
                }));

                reject(errorWithTrace);
            } finally {
                this.currentAbortController = null;
            }
        });
    }

    private addMessageToHistory(sessionId: string, message: ChatHistoryMessage): void {
        if (!AgentChatRpcManager.chatHistoryMap.has(sessionId)) {
            AgentChatRpcManager.chatHistoryMap.set(sessionId, []);
        }
        AgentChatRpcManager.chatHistoryMap.get(sessionId)!.push(message);
    }

    // Merges the decisions just submitted into whichever 'approval' history entry they belong
    // to (a batch may be resolved across several submitDecision calls, one request at a time),
    // so a later getChatHistory()/switchChatAgent() replay renders resolved requests collapsed
    // rather than as if still pending.
    private resolvePendingApprovalInHistory(sessionId: string, decisions: Record<string, HumanResponse>): void {
        const decidedIds = Object.keys(decisions);
        const history = AgentChatRpcManager.chatHistoryMap.get(sessionId);
        if (!history) {
            return;
        }
        for (let i = history.length - 1; i >= 0; i--) {
            const entry = history[i];
            if (entry.type !== 'approval' || !entry.pendingApproval) {
                continue;
            }
            if (entry.pendingApproval.requests.some(r => decidedIds.includes(r.id))) {
                entry.decisions = { ...(entry.decisions || {}), ...decisions };
                break;
            }
        }
    }

    // The dispatcher attaches `chat` and `decision` as sibling resources under the same
    // service base path (see ai:Listener's ChatDispatcherService), and `chatEp` is always
    // built ending in `/chat` (see buildChatEndpoint in features/tryit/activator.ts). Assert
    // the invariant rather than silently posting to the wrong resource if it's ever violated.
    private toDecisionEndpoint(chatEp: string): string {
        if (!chatEp.endsWith('/chat')) {
            throw new Error(`Unexpected chat endpoint shape: ${chatEp}`);
        }
        return chatEp.replace(/\/chat$/, '/decision');
    }

    async submitDecision(params: SubmitDecisionRequest): Promise<ChatRespMessage> {
        return new Promise(async (resolve, reject) => {
            try {
                if (
                    !extension.agentChatContext.chatEp || typeof extension.agentChatContext.chatEp !== 'string' ||
                    !extension.agentChatContext.chatSessionId || typeof extension.agentChatContext.chatSessionId !== 'string'
                ) {
                    throw new Error('Invalid Agent Chat Context: Missing or incorrect ChatEP or ChatSessionID!');
                }

                const sessionId = extension.agentChatContext.chatSessionId;
                const decisionEp = this.toDecisionEndpoint(extension.agentChatContext.chatEp);
                const payload: DecisionMessage = { sessionId, decisions: params.decisions };

                this.currentAbortController = new AbortController();
                const response = await this.fetchTestData(decisionEp, payload, this.currentAbortController.signal);

                if (response && response.pendingApproval) {
                    // The run resumed only to pause again (e.g. a further gated call surfaced
                    // in the same turn), so this is a fresh batch, not a resolution of the last one.
                    this.resolvePendingApprovalInHistory(sessionId, params.decisions);

                    const pendingApproval: PendingApprovalInfo = response.pendingApproval;

                    this.addMessageToHistory(sessionId, {
                        type: 'approval',
                        text: '',
                        isUser: false,
                        pendingApproval
                    });

                    resolve({ message: '', pendingApproval } as ChatRespMessage);
                } else if (response && response.message) {
                    this.resolvePendingApprovalInHistory(sessionId, params.decisions);

                    const trace = this.findTraceForMessage(sessionId, '', response.message);
                    const executionSteps = trace ? this.extractExecutionSteps(trace) : undefined;

                    this.addMessageToHistory(sessionId, {
                        type: 'message',
                        text: response.message,
                        isUser: false,
                        traceId: trace?.traceId,
                        executionSteps
                    });

                    resolve({
                        message: response.message,
                        traceId: trace?.traceId,
                        executionSteps
                    } as ChatRespMessage);
                } else {
                    // Response shape didn't match either known case - the batch was never
                    // actually resolved, so history must keep showing it pending.
                    reject(new Error("Invalid response format from the decision endpoint."));
                }
            } catch (error) {
                const errorMessage =
                    error && typeof error === "object" && "message" in error
                        ? String(error.message)
                        : "An unknown error occurred";

                const sessionId = extension.agentChatContext?.chatSessionId;
                if (sessionId) {
                    this.addMessageToHistory(sessionId, {
                        type: 'error',
                        text: errorMessage,
                        isUser: false
                    });
                }

                // A failed decision leaves the batch exactly as it was (see the comment on
                // the `else` branch above) - the card stays interactive so the user can retry,
                // possibly with a fuller decision set, rather than being forced to Clear Chat.
                const errorWithTrace = new Error(JSON.stringify({
                    message: errorMessage,
                    traceInfo: {}
                }));

                reject(errorWithTrace);
            } finally {
                this.currentAbortController = null;
            }
        });
    }

    abortChatRequest(): void {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
    }

    private isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch (_) {
            return false;
        }
    }

    private async fetchTestData(url: string, payload: Record<string, any>, signal: AbortSignal): Promise<Record<string, any>> {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal,
            });

            if (!response.ok) {
                const errorData: any = await response.json().catch(() => undefined);

                // The dispatcher maps a paused run (ai:ApprovalRequiredError) to HTTP 403 with a
                // structured `{ requests: ApprovalRequest[] }` body - not a real error, so surface
                // it to the caller instead of throwing.
                if (response.status === 403 && errorData && Array.isArray(errorData.requests)) {
                    return { pendingApproval: { requests: errorData.requests } };
                }

                // A `decision` resume naming a session/id with nothing pending maps to 404/400
                // with a stable `errorType` discriminator (ApprovalNotFoundError/UnknownApprovalIdError).
                if (errorData?.errorType === 'ApprovalNotFoundError' || errorData?.errorType === 'UnknownApprovalIdError') {
                    throw new Error(errorData.message || 'The pending approval could not be resumed.');
                }

                switch (response.status) {
                    case 400:
                        throw new Error("Bad Request: The server could not understand the request.");
                    case 401:
                        throw new Error("Unauthorized: Authentication is required.");
                    case 403:
                        throw new Error("Forbidden: You do not have permission to access this resource.");
                    case 404:
                        throw new Error("Not Found: The requested resource could not be found.");
                    case 408:
                        throw new Error("Request Timeout: The server took too long to respond.");
                    case 500:
                        throw new Error("Internal Server Error: Something went wrong on the server.");
                    case 502:
                        throw new Error("Bad Gateway: Received an invalid response from the upstream server.");
                    case 503:
                        throw new Error("Service Unavailable: The server is temporarily unavailable.");
                    case 504:
                        throw new Error("Gateway Timeout: The server took too long to respond.");
                    default:
                        throw new Error(`HTTP error! Status: ${response.status}`);
                }
            }

            return await response.json();
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                // Provide a custom message for aborted request
                throw new Error("Request aborted by the user.");
            }

            let errorMessage = "An unknown error occurred";
            if (error instanceof Error) {
                errorMessage = error.message;
            }
            throw new Error(errorMessage);
        }
    }

    async getTracingStatus(params?: TraceStatusRequest): Promise<TraceStatus> {
        if (params?.projectPath) {
            const enabled = fs.existsSync(path.join(params.projectPath, 'trace_enabled.bal'));
            return { enabled };
        }
        return { enabled: TracerMachine.isEnabled() };
    }


    /**
     * Find the trace that corresponds to a chat message by matching span attributes
     * @param sessionId The chat session ID
     * @param userMessage The user's input message
     * @returns The matching trace or undefined if not found
     */
    findTraceForMessage(sessionId: string, userMessage: string, agentResponse?: string): Trace | undefined {
        const traces = TraceServer.getTraces();

        // Sort traces from most recent to least recent based on lastSeen timestamp
        traces.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());

        const extractValue = (value: any): string => {
            if (typeof value === 'string') { return value; }
            if (value && typeof value === 'object' && 'stringValue' in value) {
                return String(value.stringValue);
            }
            return '';
        };

        for (const trace of traces) {
            for (const span of trace.spans || []) {
                const attributes = span.attributes || [];

                let spanType: string | undefined;
                let operationName: string | undefined;
                let inputMessages: string | undefined;
                let outputMessages: string | undefined;
                let conversationId: string | undefined;

                for (const attr of attributes) {
                    const attrValue = extractValue(attr.value);

                    if (attr.key === 'span.type') {
                        spanType = attrValue;
                    } else if (attr.key === 'gen_ai.operation.name') {
                        operationName = attrValue;
                    } else if (attr.key === 'gen_ai.input.messages') {
                        inputMessages = attrValue;
                    } else if (attr.key === 'gen_ai.output.messages') {
                        outputMessages = attrValue;
                    } else if (attr.key === 'gen_ai.conversation.id') {
                        conversationId = attrValue;
                    }
                }

                if (spanType !== 'ai' || operationName !== 'invoke_agent' || conversationId != sessionId) {
                    continue;
                }

                // Guard on a non-empty userMessage: String.prototype.includes('') is always
                // true, which would otherwise match the first same-session span regardless
                // of whether it's actually the one this response came from.
                const inputMatches = userMessage && inputMessages && inputMessages.includes(userMessage);
                const outputMatches = agentResponse && outputMessages && outputMessages.includes(agentResponse);

                if (inputMatches || outputMatches) {
                    return trace;
                }
            }
        }

        return undefined;
    }

    /**
     * Remove operation prefixes from span names
     * @param name The span name to clean
     * @returns The cleaned span name
     */
    private stripSpanPrefix(name: string): string {
        const prefixes = ['invoke_agent ', 'execute_tool ', 'chat '];
        for (const prefix of prefixes) {
            if (name.startsWith(prefix)) {
                return name.substring(prefix.length);
            }
        }
        return name;
    }

    /**
     * Extract execution steps from a trace
     * @param trace The trace to extract execution steps from
     * @returns Array of execution steps sorted chronologically
     */
    private extractExecutionSteps(trace: Trace): ExecutionStep[] {
        const steps: ExecutionStep[] = [];

        // Helper function to extract string value from attribute value
        const extractValue = (value: any): string => {
            if (typeof value === 'string') {
                return value;
            }
            if (value && typeof value === 'object' && 'stringValue' in value) {
                return String(value.stringValue);
            }
            return '';
        };

        // Iterate through all spans in the trace
        for (const span of trace.spans || []) {
            const attributes = span.attributes || [];

            let operationName = '';
            let toolName = '';
            let hasError = false;

            // Extract relevant attributes
            for (const attr of attributes) {
                const value = extractValue(attr.value);

                if (attr.key === 'gen_ai.operation.name') {
                    operationName = value;
                } else if (attr.key === 'gen_ai.tool.name') {
                    toolName = value;
                } else if (attr.key === 'error.message') {
                    hasError = true;
                }
            }

            // Determine operation type based on operation name
            let operationType: 'invoke' | 'chat' | 'tool' | 'other' = 'other';
            let displayName = operationName;

            if (operationName.startsWith('invoke_agent')) {
                operationType = 'invoke';
                displayName = this.stripSpanPrefix(span.name);
            } else if (operationName.startsWith('chat')) {
                operationType = 'chat';
                displayName = this.stripSpanPrefix(span.name);
            } else if (operationName.startsWith('execute_tool')) {
                operationType = 'tool';
                displayName = toolName || this.stripSpanPrefix(span.name);
            } else {
                // Skip spans that don't match our criteria
                continue;
            }

            // Calculate duration from ISO timestamps
            const startTimeISO = span.startTime;
            const endTimeISO = span.endTime;
            let duration = 0;

            if (startTimeISO && endTimeISO) {
                const startMs = new Date(startTimeISO).getTime();
                const endMs = new Date(endTimeISO).getTime();
                duration = endMs - startMs;
            }

            steps.push({
                spanId: span.spanId,
                operationType,
                name: displayName,
                fullName: operationName,
                duration,
                startTime: startTimeISO,
                endTime: endTimeISO,
                hasError
            });
        }

        // Sort by start time chronologically
        steps.sort((a, b) => {
            if (!a.startTime || !b.startTime) { return 0; }
            return a.startTime.localeCompare(b.startTime);
        });

        return steps;
    }

    async showTraceView(params: TraceInput): Promise<void> {
        try {
            let trace: Trace | undefined;

            // Support direct trace lookup by traceId
            if (params.traceId) {
                const traces = TraceServer.getTraces();
                trace = traces.find(t => t.traceId === params.traceId);
            }

            if (!trace) {
                const errorMessage = 'No trace found. Make sure tracing is enabled and the agent has processed this message.';
                vscode.window.showErrorMessage(errorMessage);
                throw new Error(errorMessage);
            }

            // Open the trace details webview with isAgentChat=true and optional focusSpanId
            TraceDetailsWebview.show(trace, true, params.focusSpanId, extension.agentChatContext?.chatSessionId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to show trace details';
            vscode.window.showErrorMessage(`Error: ${errorMessage}`);
            throw error;
        }
    }

    async showSessionOverview(params: SessionInput): Promise<void> {
        try {
            // Use provided sessionId or fall back to current session
            const sessionId = params.sessionId || extension.agentChatContext?.chatSessionId;

            if (!sessionId) {
                const errorMessage = 'No active session found';
                vscode.window.showErrorMessage(errorMessage);
                throw new Error(errorMessage);
            }

            await TraceDetailsWebview.showSessionOverview(sessionId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to show session overview';
            vscode.window.showErrorMessage(`Error: ${errorMessage}`);
            throw error;
        }
    }

    async getChatHistory(): Promise<ChatHistoryResponse> {
        return new Promise(async (resolve) => {
            const sessionId = extension.agentChatContext?.chatSessionId;

            if (!sessionId) {
                resolve({
                    messages: [],
                    isAgentRunning: false
                });
                return;
            }

            // Session is considered "running" if it's in the active sessions set
            const isAgentRunning = AgentChatRpcManager.activeSessions.has(sessionId);
            const messages = AgentChatRpcManager.chatHistoryMap.get(sessionId) || [];

            resolve({
                messages,
                isAgentRunning
            });
        });
    }

    async clearChatHistory(): Promise<ClearChatResponse> {
        return new Promise(async (resolve) => {
            const oldSessionId = extension.agentChatContext?.chatSessionId;
            if (oldSessionId) {
                // Clear the old session's history and mark it as inactive
                AgentChatRpcManager.chatHistoryMap.delete(oldSessionId);
                AgentChatRpcManager.activeSessions.delete(oldSessionId);
            }

            // Generate a new session ID
            const newSessionId = uuidv4();

            // Update the agent chat context with the new session ID
            if (extension.agentChatContext) {
                extension.agentChatContext.chatSessionId = newSessionId;

                // Sync the new session ID to the active agent in the agents array
                const activeAgentName = extension.agentChatContext.activeAgentName;
                const activeAgent = extension.agentChatContext.agents?.find(a => a.name === activeAgentName);
                if (activeAgent) {
                    activeAgent.chatSessionId = newSessionId;
                }

                // Mark the new session as active
                AgentChatRpcManager.activeSessions.add(newSessionId);

                // Update the activator's chatSessionMap with the new session ID
                const chatEp = extension.agentChatContext.chatEp;
                if (chatEp) {
                    updateChatSessionId(chatEp, newSessionId);
                }
            }

            resolve({
                newSessionId
            });
        });
    }

    async getAgentStatus(): Promise<AgentStatusResponse> {
        return new Promise(async (resolve) => {
            const sessionId = extension.agentChatContext?.chatSessionId;
            const isRunning = sessionId ? AgentChatRpcManager.activeSessions.has(sessionId) : false;
            resolve({
                isRunning
            });
        });
    }

    async getSessionInfo(): Promise<SessionInfoResponse> {
        return {
            sessionId: extension.agentChatContext?.chatSessionId || '',
            chatEndpoint: extension.agentChatContext?.chatEp || '',
        };
    }

    async getAvailableChatAgents(): Promise<AvailableAgentsResponse> {
        const ctx = extension.agentChatContext;
        if (!ctx || !ctx.agents || ctx.agents.length === 0) {
            return {
                agents: ctx ? [{
                    name: 'default',
                    basePath: '/',
                    chatEp: ctx.chatEp,
                    chatSessionId: ctx.chatSessionId,
                }] : [],
                activeAgentName: ctx?.activeAgentName || 'default',
            };
        }

        return {
            agents: ctx.agents.map(a => ({
                name: a.name,
                basePath: a.basePath,
                chatEp: a.chatEp,
                chatSessionId: a.chatSessionId,
            })),
            activeAgentName: ctx.activeAgentName,
        };
    }

    async switchChatAgent(params: SwitchAgentRequest): Promise<SwitchAgentResponse> {
        const ctx = extension.agentChatContext;
        if (!ctx || !ctx.agents) {
            throw new Error('No agents available to switch to');
        }

        const targetAgent = ctx.agents.find(a => a.name === params.agentName);
        if (!targetAgent) {
            throw new Error(`Agent "${params.agentName}" not found`);
        }

        // Update the active agent
        ctx.activeAgentName = targetAgent.name;
        ctx.chatEp = targetAgent.chatEp;
        ctx.chatSessionId = targetAgent.chatSessionId;

        // Update the activator's session map
        updateChatSessionId(targetAgent.chatEp, targetAgent.chatSessionId);

        // Return the agent info and its chat history
        const chatHistory = AgentChatRpcManager.chatHistoryMap.get(targetAgent.chatSessionId) || [];

        return {
            agent: {
                name: targetAgent.name,
                basePath: targetAgent.basePath,
                chatEp: targetAgent.chatEp,
                chatSessionId: targetAgent.chatSessionId,
            },
            chatHistory,
        };
    }
}
