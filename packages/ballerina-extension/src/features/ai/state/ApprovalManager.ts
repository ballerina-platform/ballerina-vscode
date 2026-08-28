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

import { Task, MACHINE_VIEW, ClarifyQuestion, ManagedConnectionGroup } from "@wso2/ballerina-core/lib/state-machine-types";
import { SkillEnableStage } from "@wso2/ballerina-core";
import { CopilotEventHandler } from "../utils/events";
import { ConfigVariable } from "../../../utils/toml-utils";
import { StateMachine } from "../../../stateMachine";
import { approvalViewManager } from './ApprovalViewManager';

/**
 * Plan approval response
 */
export interface PlanApprovalResponse {
    approved: boolean;
    comment?: string;
}

/**
 * Task approval response
 */
export interface TaskApprovalResponse {
    approved: boolean;
    comment?: string;
    approvedTaskDescription?: string;
}

/**
 * Connector spec response
 */
export interface ConnectorSpecResponse {
    provided: boolean;
    spec?: any;
    comment?: string;
}

/**
 * Clarify tool response
 */
export interface ClarifyResponse {
    answered: boolean;
    answers?: Array<{ question: string; answers: string[] }>;
}

export interface SkillEnableResponse {
    enabled: boolean;
}

/**
 * Configuration response containing actual values (converted to metadata before exposing to agent)
 */
export interface ConfigurationResponse {
    provided: boolean;
    configValues?: Record<string, string>;
    comment?: string;
}

/**
 * Generic promise resolver for approval requests
 */
interface PromiseResolver<T> {
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    timeoutId?: NodeJS.Timeout;
}

interface PlanApprovalResolver extends PromiseResolver<PlanApprovalResponse> {
    eventHandler: CopilotEventHandler;
}

/**
 * A queued approval item — holds the emit function that fires the UI event.
 * The queue processes one item at a time so UI prompts never overlap.
 */
interface ApprovalQueueItem {
    requestId: string;
    emit: () => void;
}

/**
 * ApprovalManager - Global singleton for managing human-in-the-loop approval workflows
 *
 * Replaces XState state machine subscription pattern with promise-based approvals.
 * Supports parallel executions through unique requestId per execution.
 */
//TODO: Migrate this to be part of chat state manager.
export class ApprovalManager {
    private static instance: ApprovalManager;

    private planApprovals = new Map<string, PlanApprovalResolver>();
    private taskApprovals = new Map<string, PromiseResolver<TaskApprovalResponse>>();
    private connectorSpecs = new Map<string, PromiseResolver<ConnectorSpecResponse>>();
    private configurationRequests = new Map<string, PromiseResolver<ConfigurationResponse>>();
    private webToolApprovals = new Map<string, PromiseResolver<{ approved: boolean }>>();
    private clarifyRequests = new Map<string, PromiseResolver<ClarifyResponse>>();
    private skillEnableRequests = new Map<string, PromiseResolver<SkillEnableResponse>>();
    private skillEnableIds = new Map<string, string>();
    private approvalQueue: ApprovalQueueItem[] = [];
    private approvalQueueActive = false;
    private notificationCounters = new Map<string, number>();
    private notificationHandlers = new Map<string, (active: boolean) => void>();

    // Default timeout for abandoned approvals (30 minutes)
    private readonly DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

    private constructor() {
        // Private constructor for singleton pattern
    }

    static getInstance(): ApprovalManager {
        if (!ApprovalManager.instance) {
            ApprovalManager.instance = new ApprovalManager();
        }
        return ApprovalManager.instance;
    }

    // ============================================
    // Plan Approval
    // ============================================

    /**
     * Request plan approval from user
     * Emits task_approval_request event and waits for user response
     *
     * @param requestId - Unique identifier for this approval request
     * @param tasks - Array of tasks in the plan
     * @param eventHandler - Event handler to emit approval request
     * @returns Promise that resolves when user approves/declines
     */
    requestPlanApproval(
        requestId: string,
        tasks: Task[],
        eventHandler: CopilotEventHandler,
    ): Promise<PlanApprovalResponse> {
        console.log(`[ApprovalManager] Requesting plan approval: ${requestId}`);

        // Emit event to frontend
        eventHandler({
            type: "task_approval_request",
            requestId: requestId,
            approvalType: "plan",
            tasks: tasks,
            message: "Please review the implementation plan",
        });

        // Create promise that will be resolved by resolvePlanApproval()
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.planApprovals.delete(requestId);
                reject(new Error(`Plan approval timeout for request ${requestId}`));
            }, this.DEFAULT_TIMEOUT_MS);

            this.planApprovals.set(requestId, { resolve, reject, timeoutId, eventHandler });
        });
    }

    /**
     * Resolve plan approval (called by RPC method when user responds)
     *
     * @param requestId - Unique identifier for this approval request
     * @param approved - Whether the plan was approved
     * @param comment - Optional comment from user
     */
    resolvePlanApproval(requestId: string, approved: boolean, comment?: string): void {
        const resolver = this.planApprovals.get(requestId);
        if (!resolver) {
            console.warn(`[ApprovalManager] No pending plan approval for request: ${requestId}`);
            return;
        }

        console.log(`[ApprovalManager] Resolving plan approval: ${requestId}, approved: ${approved}`);

        // Persist the user's decision in the run event stream. A reopened panel
        // can now reconstruct the final plan card instead of merely hiding the
        // already-resolved approval footer.
        resolver.eventHandler({
            type: "plan_approval_resolved",
            requestId,
            approved,
            comment,
        });

        // Clear timeout
        if (resolver.timeoutId) {
            clearTimeout(resolver.timeoutId);
        }

        // Resolve promise
        resolver.resolve({ approved, comment });

        // Cleanup
        this.planApprovals.delete(requestId);
    }

    // ============================================
    // Task Approval
    // ============================================

    /**
     * Request task completion approval from user
     * Emits task_approval_request event and waits for user response
     *
     * @param requestId - Unique identifier for this approval request
     * @param taskDescription - Description of the completed task
     * @param tasks - Array of all tasks (for UI display)
     * @param eventHandler - Event handler to emit approval request
     * @returns Promise that resolves when user approves/declines
     */
    requestTaskApproval(
        requestId: string,
        taskDescription: string,
        tasks: Task[],
        eventHandler: CopilotEventHandler,
    ): Promise<TaskApprovalResponse> {
        console.log(`[ApprovalManager] Requesting task approval: ${requestId}`);

        // Emit event to frontend
        eventHandler({
            type: "task_approval_request",
            requestId: requestId,
            approvalType: "completion",
            tasks: tasks,
            taskDescription: taskDescription,
            message: `Please verify the completed work for: ${taskDescription}`,
        });

        // Create promise that will be resolved by resolveTaskApproval()
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.taskApprovals.delete(requestId);
                reject(new Error(`Task approval timeout for request ${requestId}`));
            }, this.DEFAULT_TIMEOUT_MS);

            this.taskApprovals.set(requestId, { resolve, reject, timeoutId });
        });
    }

    /**
     * Resolve task approval (called by RPC method when user responds)
     *
     * @param requestId - Unique identifier for this approval request
     * @param approved - Whether the task was approved
     * @param comment - Optional comment from user
     * @param approvedTaskDescription - Description of approved task
     */
    resolveTaskApproval(
        requestId: string,
        approved: boolean,
        comment?: string,
        approvedTaskDescription?: string,
    ): void {
        const resolver = this.taskApprovals.get(requestId);
        if (!resolver) {
            console.warn(`[ApprovalManager] No pending task approval for request: ${requestId}`);
            return;
        }

        console.log(`[ApprovalManager] Resolving task approval: ${requestId}, approved: ${approved}`);

        // Clear timeout
        if (resolver.timeoutId) {
            clearTimeout(resolver.timeoutId);
        }

        // Resolve promise
        resolver.resolve({ approved, comment, approvedTaskDescription });

        // Cleanup
        this.taskApprovals.delete(requestId);
    }

    // ============================================
    // Connector Spec Request
    // ============================================

    /**
     * Request connector spec from user
     * Emits connector_generation_notification event and waits for user response
     *
     * @param requestId - Unique identifier for this approval request
     * @param eventHandler - Event handler to emit spec request
     * @returns Promise that resolves when user provides/cancels spec
     */
    requestConnectorSpec(requestId: string, eventHandler: CopilotEventHandler): Promise<ConnectorSpecResponse> {
        console.log(`[ApprovalManager] Requesting connector spec: ${requestId}`);

        // Emit event to frontend
        eventHandler({
            type: "connector_generation_notification",
            requestId: requestId,
            stage: "requesting_input",
            message: "Please provide the OpenAPI specification",
        });

        // Create promise that will be resolved by resolveConnectorSpec()
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.connectorSpecs.delete(requestId);
                reject(new Error(`Connector spec request timeout for request ${requestId}`));
            }, this.DEFAULT_TIMEOUT_MS);

            this.connectorSpecs.set(requestId, { resolve, reject, timeoutId });
        });
    }

    /**
     * Resolve connector spec request (called by RPC method when user responds)
     *
     * @param requestId - Unique identifier for this approval request
     * @param provided - Whether the spec was provided
     * @param spec - The OpenAPI spec (if provided)
     * @param comment - Optional comment from user
     */
    resolveConnectorSpec(requestId: string, provided: boolean, spec?: any, comment?: string): void {
        const resolver = this.connectorSpecs.get(requestId);
        if (!resolver) {
            console.warn(`[ApprovalManager] No pending connector spec request for: ${requestId}`);
            return;
        }

        console.log(`[ApprovalManager] Resolving connector spec: ${requestId}, provided: ${provided}`);

        // Clear timeout
        if (resolver.timeoutId) {
            clearTimeout(resolver.timeoutId);
        }

        // Resolve promise
        resolver.resolve({ provided, spec, comment });

        // Cleanup
        this.connectorSpecs.delete(requestId);
    }

    // ============================================
    // Configuration Collection
    // ============================================

    /**
     * Request configuration values from user
     * Returns actual configuration values to tool (tool converts to metadata for agent)
     * Opens a popup in the BI Visualizer for user input
     *
     * @param isTestConfig - Flag to indicate this is for test configuration (affects UI messaging)
     * @param message - Custom message from configuration collector (includes smart analysis for test mode)
     */
    requestConfiguration(
        requestId: string,
        variables: ConfigVariable[],
        existingValues: Record<string, string>,
        eventHandler: CopilotEventHandler,
        isTestConfig?: boolean,
        message?: string,
        managedConnections?: ManagedConnectionGroup[]
    ): Promise<ConfigurationResponse> {
        console.log(`[ApprovalManager] Requesting ${isTestConfig ? 'test ' : ''}configuration: ${requestId}${managedConnections?.length ? ` (OAuth vendors: ${managedConnections.map(g => g.vendor).join(', ')})` : ''}`);

        // Use provided message or generate default
        const displayMessage = message || `Please provide ${variables.length} configuration value(s)`;

        // Emit collecting stage to AI Panel
        eventHandler({
            type: "configuration_collection_event",
            requestId,
            stage: "collecting",
            variables,
            existingValues,
            message: displayMessage,
            isTestConfig,
        });

        const { projectPath } = StateMachine.context();

        // Open configuration collector view
        approvalViewManager.openApprovalViewPopup(
            requestId,
            'configuration',
            {
                view: MACHINE_VIEW.ConfigurationCollector,
                projectPath,
                agentMetadata: {
                    configurationCollector: {
                        requestId,
                        variables,
                        existingValues,
                        message: displayMessage,
                        isTestConfig,
                        managedConnections,
                    },
                },
            }
        );

        // Create promise that will be resolved by resolveConfiguration()
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.configurationRequests.delete(requestId);
                reject(new Error(`Configuration request timeout for request ${requestId}`));
            }, this.DEFAULT_TIMEOUT_MS);

            this.configurationRequests.set(requestId, { resolve, reject, timeoutId });
        });
    }

    /**
     * Resolve configuration request (called by RPC method when user responds)
     * Contains actual configuration values - tool will convert to metadata for agent
     */
    resolveConfiguration(
        requestId: string,
        provided: boolean,
        configValues?: Record<string, string>,
        comment?: string,
    ): void {
        const resolver = this.configurationRequests.get(requestId);
        if (!resolver) {
            console.warn(`[ApprovalManager] No pending configuration request for: ${requestId}`);
            return;
        }

        console.log(`[ApprovalManager] Resolving configuration request: ${requestId}, provided: ${provided}`);

        // Clear timeout
        if (resolver.timeoutId) {
            clearTimeout(resolver.timeoutId);
        }

        // Resolve promise with actual configuration values (tool will sanitize before returning to agent)
        resolver.resolve({ provided, configValues, comment });

        // Cleanup
        this.configurationRequests.delete(requestId);

        // Cleanup view and clear state machine metadata
        approvalViewManager.cleanupView(requestId, true);
    }

    // ============================================
    // Web Tool Approval
    // ============================================

    /**
     * Request user approval before executing a web tool.
     * Requests are serialised through the approval queue so UI prompts never overlap.
     */
    requestWebToolApproval(
        requestId: string,
        toolName: "web_search" | "web_fetch",
        content: string,
        eventHandler: CopilotEventHandler,
    ): Promise<{ approved: boolean }> {
        console.log(`[ApprovalManager] Queuing web tool approval: ${requestId} (${toolName})`);

        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                this.webToolApprovals.delete(requestId);
                this._advanceApprovalQueue(requestId);
                resolve({ approved: false });
            }, this.DEFAULT_TIMEOUT_MS);

            this.webToolApprovals.set(requestId, { resolve, reject: () => resolve({ approved: false }), timeoutId });

            this.approvalQueue.push({
                requestId,
                emit: () => {
                    console.log(`[ApprovalManager] Emitting web tool approval: ${requestId} (${toolName})`);
                    eventHandler({ type: "web_tool_approval_request", requestId, toolName, content });
                },
            });

            this._flushApprovalQueue();
        });
    }

    /**
     * Emit the next queued approval request if none is currently active.
     */
    private _flushApprovalQueue(): void {
        if (this.approvalQueueActive || this.approvalQueue.length === 0) {
            return;
        }
        this.approvalQueueActive = true;
        this.approvalQueue[0].emit();
    }

    /**
     * Mark the current approval as done and flush the next one.
     */
    private _advanceApprovalQueue(requestId: string): void {
        const idx = this.approvalQueue.findIndex(item => item.requestId === requestId);
        if (idx !== -1) {
            this.approvalQueue.splice(idx, 1);
        }
        this.approvalQueueActive = false;
        // Defer the next emit so the current IPC response finishes delivering
        // and the webview re-registers its listener before the next notification fires.
        setImmediate(() => this._flushApprovalQueue());
    }

    /** Resolve a pending web tool approval (called by RPC handler when user responds). */
    resolveWebToolApproval(requestId: string, approved: boolean): void {
        const resolver = this.webToolApprovals.get(requestId);
        if (!resolver) {
            console.warn(`[ApprovalManager] No pending web tool approval for request: ${requestId}`);
            return;
        }

        console.log(`[ApprovalManager] Resolving web tool approval: ${requestId}, approved: ${approved}`);

        if (resolver.timeoutId) { clearTimeout(resolver.timeoutId); }
        resolver.resolve({ approved });
        this.webToolApprovals.delete(requestId);
        this._advanceApprovalQueue(requestId);
    }

    // ============================================
    // Clarify Tool
    // ============================================

    /**
     * Request clarification from user
     * Emits clarify_event and waits for user to select answer(s)
     */
    requestClarify(
        requestId: string,
        params: { questions: ClarifyQuestion[] },
        eventHandler: CopilotEventHandler,
    ): Promise<ClarifyResponse> {
        console.log(`[ApprovalManager] Requesting clarification: ${requestId}`);

        eventHandler({
            type: "clarify_event",
            requestId,
            stage: "asking",
            questions: params.questions,
        });

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.clarifyRequests.delete(requestId);
                reject(new Error(`Clarify request timeout for request ${requestId}`));
            }, this.DEFAULT_TIMEOUT_MS);

            this.clarifyRequests.set(requestId, { resolve, reject, timeoutId });
        });
    }

    /**
     * Resolve a pending clarify request (called by RPC handler when user responds)
     */
    resolveClarify(requestId: string, answered: boolean, answers?: Array<{ question: string; answers: string[] }>): void {
        const resolver = this.clarifyRequests.get(requestId);
        if (!resolver) {
            console.warn(`[ApprovalManager] No pending clarify request for: ${requestId}`);
            return;
        }

        console.log(`[ApprovalManager] Resolving clarify request: ${requestId}, answered: ${answered}`);

        if (resolver.timeoutId) { clearTimeout(resolver.timeoutId); }
        resolver.resolve({ answered, answers });
        this.clarifyRequests.delete(requestId);
    }

    requestSkillEnable(
        requestId: string,
        skillName: string,
        skillId: string,
        eventHandler: CopilotEventHandler,
    ): Promise<SkillEnableResponse> {
        this.skillEnableIds.set(requestId, skillId);

        eventHandler({
            type: "skill_enable_event",
            requestId,
            stage: SkillEnableStage.PROMPTING,
            skillName,
            skillId,
        } as any);

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.skillEnableRequests.delete(requestId);
                this.skillEnableIds.delete(requestId);
                reject(new Error(`Skill enable request timeout for request ${requestId}`));
            }, this.DEFAULT_TIMEOUT_MS);

            this.skillEnableRequests.set(requestId, { resolve, reject, timeoutId });
        });
    }

    getSkillEnableId(requestId: string): string | undefined {
        return this.skillEnableIds.get(requestId);
    }

    resolveSkillEnable(requestId: string, enabled: boolean): void {
        const resolver = this.skillEnableRequests.get(requestId);
        if (!resolver) { return; }
        if (resolver.timeoutId) { clearTimeout(resolver.timeoutId); }
        resolver.resolve({ enabled });
        this.skillEnableRequests.delete(requestId);
        this.skillEnableIds.delete(requestId);
    }

    // ============================================
    // Notification Counter
    // ============================================

    /** Register a callback fired when a type transitions between idle (0) and active (>0). */
    registerNotificationHandler(type: string, handler: (active: boolean) => void): void {
        this.notificationHandlers.set(type, handler);
    }

    /** Increment active count for type. Fires handler(true) on 0 → 1. */
    trackNotificationStart(type: string): void {
        const count = (this.notificationCounters.get(type) ?? 0) + 1;
        this.notificationCounters.set(type, count);
        if (count === 1) {
            this.notificationHandlers.get(type)?.(true);
        }
    }

    /** Decrement active count for type. Fires handler(false) on 1 → 0. */
    trackNotificationEnd(type: string): void {
        const count = Math.max(0, (this.notificationCounters.get(type) ?? 0) - 1);
        this.notificationCounters.set(type, count);
        if (count === 0) {
            this.notificationHandlers.get(type)?.(false);
        }
    }

    // ============================================
    // Cleanup
    // ============================================

    /**
     * Cancel all pending approvals (useful for abort scenarios)
     *
     * @param reason - Reason for cancellation
     */
    cancelAllPending(reason: string): void {
        console.log(`[ApprovalManager] Cancelling all pending approvals: ${reason}`);

        // Cleanup all approval views
        approvalViewManager.cleanupAllViews();

        const error = new Error(reason);
        error.name = 'AbortError';

        // Cancel plan approvals
        for (const [requestId, resolver] of this.planApprovals.entries()) {
            if (resolver.timeoutId) {
                clearTimeout(resolver.timeoutId);
            }
            resolver.reject(error);
        }
        this.planApprovals.clear();

        // Cancel task approvals
        for (const [requestId, resolver] of this.taskApprovals.entries()) {
            if (resolver.timeoutId) {
                clearTimeout(resolver.timeoutId);
            }
            resolver.reject(error);
        }
        this.taskApprovals.clear();

        // Cancel connector specs
        for (const [requestId, resolver] of this.connectorSpecs.entries()) {
            if (resolver.timeoutId) {
                clearTimeout(resolver.timeoutId);
            }
            resolver.reject(error);
        }
        this.connectorSpecs.clear();

        // Resolve configuration requests as skipped so callers handle it as a normal skip
        for (const [, resolver] of this.configurationRequests.entries()) {
            if (resolver.timeoutId) {
                clearTimeout(resolver.timeoutId);
            }
            resolver.resolve({ provided: false, comment: reason });
        }
        this.configurationRequests.clear();

        // Auto-deny all pending web tool approvals and clear the queue
        for (const [, resolver] of this.webToolApprovals.entries()) {
            if (resolver.timeoutId) {
                clearTimeout(resolver.timeoutId);
            }
            resolver.resolve({ approved: false });
        }
        this.webToolApprovals.clear();
        this.approvalQueue = [];
        this.approvalQueueActive = false;

        // Resolve clarify requests as skipped
        for (const [, resolver] of this.clarifyRequests.entries()) {
            if (resolver.timeoutId) {
                clearTimeout(resolver.timeoutId);
            }
            resolver.resolve({ answered: false });
        }
        this.clarifyRequests.clear();

        for (const [, resolver] of this.skillEnableRequests.entries()) {
            if (resolver.timeoutId) { clearTimeout(resolver.timeoutId); }
            resolver.resolve({ enabled: false });
        }
        this.skillEnableRequests.clear();
        this.skillEnableIds.clear();

        // Reset all notification counters and fire handlers (e.g. turn off globe)
        for (const [type, count] of this.notificationCounters.entries()) {
            if (count > 0) {
                this.notificationCounters.set(type, 0);
                this.notificationHandlers.get(type)?.(false);
            }
        }
    }

    /**
     * Cancel only the interactive requests that cannot be recovered after the AI panel is closed
     * and reopened, and tear down transient UI. Called when the panel is *disposed* (not aborted).
     *
     * Popup-based requests (the configuration collector, whose popup view is torn down here) are
     * resolved as skipped because they cannot be replayed into the reopened chat — leaving them
     * pending would strand the run. In-chat prompts (plan/task/connector/web-tool/clarify/skill)
     * are intentionally LEFT PENDING: the agent run survives the panel in the extension host, and
     * these prompts are re-surfaced from the event buffer on reopen so the user can still answer
     * them. (Full cancellation still happens on explicit abort via cancelAllPending.)
     */
    cancelOnPanelClose(reason: string): void {
        console.log(`[ApprovalManager] Panel closed — preserving in-chat prompts, cancelling popup-based ones: ${reason}`);

        // Close popup approval views (currently only the configuration collector).
        approvalViewManager.cleanupAllViews();

        // Resolve configuration requests as skipped — popup-based, not replayable into the chat.
        for (const [, resolver] of this.configurationRequests.entries()) {
            if (resolver.timeoutId) {
                clearTimeout(resolver.timeoutId);
            }
            resolver.resolve({ provided: false, comment: reason });
        }
        this.configurationRequests.clear();

        // Reset notification counters and fire handlers (e.g. turn off the web-search globe).
        for (const [type, count] of this.notificationCounters.entries()) {
            if (count > 0) {
                this.notificationCounters.set(type, 0);
                this.notificationHandlers.get(type)?.(false);
            }
        }
    }

    /**
     * All request ids that are currently awaiting a user response, across every interactive type.
     * Used on reopen to decide which buffered prompt to re-surface (still pending) vs. skip
     * (already resolved earlier in the run).
     */
    getPendingRequestIds(): string[] {
        return [
            ...this.planApprovals.keys(),
            ...this.taskApprovals.keys(),
            ...this.connectorSpecs.keys(),
            ...this.configurationRequests.keys(),
            ...this.webToolApprovals.keys(),
            ...this.clarifyRequests.keys(),
            ...this.skillEnableRequests.keys(),
        ];
    }

    /**
     * Get count of pending approvals (useful for debugging)
     */
    getPendingCount(): { plans: number; tasks: number; connectorSpecs: number; configurations: number; webTools: number; clarify: number } {
        return {
            plans: this.planApprovals.size,
            tasks: this.taskApprovals.size,
            connectorSpecs: this.connectorSpecs.size,
            configurations: this.configurationRequests.size,
            webTools: this.webToolApprovals.size,
            clarify: this.clarifyRequests.size,
        };
    }
}

// Export singleton instance for convenience
export const approvalManager = ApprovalManager.getInstance();
