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

import * as vscode from 'vscode';
import { AgentRunStatus, AgentRunState, ChatNotify, agentRunStatusChanged, SHARED_COMMANDS } from '@wso2/ballerina-core';
import { RPCLayer } from '../../../RPCLayer';
import { VisualizerWebview } from '../../../views/visualizer/webview';
import { describeToolCall } from './toolLabels';

/** How long a terminal (completed/error) status stays visible before resetting to idle. */
const TERMINAL_STATE_RESET_MS = 20000;
/** Max length of the label rendered in the status bar (tooltip shows the full label). */
const STATUS_BAR_LABEL_MAX = 40;

/**
 * Derives a compact, ambient-UI-friendly status for the Copilot agent's
 * background run and fans it out to:
 *  - a right-aligned status bar item (always visible, click opens the AI panel),
 *  - the visualizer webview (drives the floating orb overlay).
 *
 * Fed from two places:
 *  - `AICommandExecutor.run()` lifecycle (`runStarted`/`runEnded`) — only for
 *    runs with `trackForReconnection` (the agent chat path), so data mapper /
 *    migration executions never drive the ambient indicators.
 *  - `sendAIPanelNotification()` — every `ChatNotify` event, used to derive the
 *    live label ("Editing service.bal…") and approval-pending states. Events are
 *    ignored unless a tracked run is active.
 */
class AgentStatusManager {
    private statusBarItem: vscode.StatusBarItem | undefined;
    private status: AgentRunStatus = { state: 'idle', aiPanelOpen: false, timestamp: Date.now() };
    private runActive = false;
    private resetTimer: NodeJS.Timeout | undefined;
    /** Panel on screen right now, as opposed to `status.aiPanelOpen`, which is merely alive. */
    private aiPanelVisible = false;
    /** An in-view surface (the overview composer) is already reporting the status inline. */
    private inlineStatusVisible = false;
    // retainContextWhenHidden keeps the composer mounted (and its inline flag set) while the
    // visualizer tab is buried, so the flag only counts while the panel is actually on screen.
    private visualizerVisible = false;

    init(context: vscode.ExtensionContext): void {
        if (this.statusBarItem) {
            return;
        }
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
        this.statusBarItem.name = 'WSO2 Integration Intelligence';
        this.statusBarItem.command = SHARED_COMMANDS.OPEN_AI_PANEL;
        context.subscriptions.push(this.statusBarItem, new vscode.Disposable(() => this.clearResetTimer()));
        this.render();
    }

    runStarted(generationId: string): void {
        this.runActive = true;
        this.clearResetTimer();
        this.update({ state: 'running', label: 'Thinking', generationId });
    }

    runEnded(): void {
        this.runActive = false;
        // Terminal ChatNotify events (stop/error/abort) normally set the final state
        // before the executor's finally block runs; this is the fallback for runs
        // that end without one.
        if (this.status.state === 'running' || this.status.state === 'awaiting-input') {
            this.update({ state: 'completed', label: 'Finished' });
        }
    }

    onChatNotify(msg: ChatNotify): void {
        if (!this.runActive) {
            return;
        }
        switch (msg.type) {
            case 'start':
                this.update({ state: 'running', label: 'Thinking' });
                break;
            case 'content_block':
            case 'content_replace':
                this.update({ state: 'running', label: 'Writing a response' });
                break;
            case 'tool_call':
                this.update({ state: 'running', label: describeToolCall(msg.toolName, msg.toolInput) });
                break;
            case 'compaction_start':
                this.update({ state: 'running', label: 'Compacting conversation' });
                break;
            case 'compaction_end':
                this.update({ state: 'running', label: 'Thinking' });
                break;
            case 'task_approval_request':
                if (!msg.autoApproved) {
                    this.update({ state: 'awaiting-input', label: 'Waiting for your approval' });
                }
                break;
            case 'clarify_event':
            case 'web_tool_approval_request':
            case 'configuration_collection_event':
            case 'skill_enable_event':
                this.update({ state: 'awaiting-input', label: 'Waiting for your input' });
                break;
            case 'error':
                this.update({ state: 'error', label: 'Something went wrong' });
                break;
            case 'abort':
                this.update({ state: 'idle', label: undefined });
                break;
            case 'stop':
                this.update({ state: 'completed', label: 'Finished' });
                break;
            default:
                break;
        }
    }

    setAiPanelOpen(open: boolean): void {
        if (this.status.aiPanelOpen === open) {
            return;
        }
        this.status = { ...this.status, aiPanelOpen: open, timestamp: Date.now() };
        this.render();
        this.broadcast();
    }

    /** The overview composer sets this while mounted so the status bar doesn't double-report. */
    setInlineStatusVisible(visible: boolean): void {
        if (this.inlineStatusVisible === visible) {
            return;
        }
        this.inlineStatusVisible = visible;
        this.render();
    }

    setVisualizerVisible(visible: boolean): void {
        if (this.visualizerVisible === visible) {
            return;
        }
        this.visualizerVisible = visible;
        this.render();
    }

    setAiPanelVisible(visible: boolean): void {
        if (this.aiPanelVisible === visible) {
            return;
        }
        this.aiPanelVisible = visible;
        // Either direction means the panel has been on screen: becoming visible
        // shows the outcome, and going hidden means it was visible until now.
        const acknowledged = this.acknowledgeTerminalState();
        this.render();
        if (acknowledged) {
            this.broadcast();
        }
    }

    /**
     * Seeing the panel acknowledges a finished/failed run — reset to idle so the
     * 'Done — click to open' nudge doesn't reappear once the panel is closed or
     * hidden again within the terminal-state window.
     */
    private acknowledgeTerminalState(): boolean {
        if (this.runActive || (this.status.state !== 'completed' && this.status.state !== 'error')) {
            return false;
        }
        this.clearResetTimer();
        this.status = { ...this.status, state: 'idle', label: undefined };
        return true;
    }

    getStatus(): AgentRunStatus {
        return { ...this.status };
    }

    private update(partial: { state: AgentRunState; label?: string; generationId?: string }): void {
        if (this.status.state === partial.state && this.status.label === partial.label) {
            return;
        }
        this.status = {
            ...this.status,
            state: partial.state,
            label: partial.label,
            generationId: partial.generationId ?? this.status.generationId,
            timestamp: Date.now(),
        };
        this.render();
        this.broadcast();

        if (partial.state === 'completed' || partial.state === 'error') {
            this.scheduleIdleReset();
        }
    }

    private render(): void {
        if (!this.statusBarItem) {
            return;
        }
        // Only worth a slot in the status bar when there is live status to report
        // and nothing on screen already reporting it — a visible panel, or the
        // overview composer's inline status. A panel open but hidden behind another
        // tab still needs the status bar.
        if (this.status.state === 'idle' || this.aiPanelVisible || (this.inlineStatusVisible && this.visualizerVisible)) {
            this.statusBarItem.hide();
            return;
        }
        const label = truncate(this.status.label, STATUS_BAR_LABEL_MAX);
        switch (this.status.state) {
            case 'running':
                this.statusBarItem.text = `$(loading~spin) ${label ?? 'WSO2 Integration Intelligence'}`;
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'awaiting-input':
                this.statusBarItem.text = `$(bi-ai-chat) WSO2 Integration Intelligence needs your input`;
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case 'completed':
                this.statusBarItem.text = `$(check) WSO2 Integration Intelligence finished`;
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'error':
                this.statusBarItem.text = `$(error) WSO2 Integration Intelligence error`;
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;
        }
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**WSO2 Integration Intelligence**${this.status.label ? ` — ${this.status.label}` : ''}\n\n`);
        tooltip.appendMarkdown('Click to open the WSO2 Integration Intelligence chat.');
        this.statusBarItem.tooltip = tooltip;
        this.statusBarItem.show();
    }

    private broadcast(): void {
        try {
            RPCLayer._messenger.sendNotification(
                agentRunStatusChanged,
                { type: 'webview', webviewType: VisualizerWebview.viewType },
                this.getStatus()
            );
        } catch (e) {
            // Visualizer webview not open — nothing to update; it pulls the
            // current status via getAgentRunStatus on mount.
        }
    }

    private scheduleIdleReset(): void {
        this.clearResetTimer();
        this.resetTimer = setTimeout(() => {
            this.resetTimer = undefined;
            // A new run may have started while the terminal state was showing.
            if (!this.runActive) {
                this.update({ state: 'idle', label: undefined });
            }
        }, TERMINAL_STATE_RESET_MS);
    }

    private clearResetTimer(): void {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = undefined;
        }
    }
}

function truncate(text: string | undefined, max: number): string | undefined {
    if (!text) {
        return text;
    }
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const agentStatusManager = new AgentStatusManager();
