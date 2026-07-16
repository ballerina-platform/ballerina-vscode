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

import { WebviewView, WebviewPanel, window } from 'vscode';
import { Messenger } from 'vscode-messenger';
import { StateMachine } from './stateMachine';
import { stateChanged, getVisualizerLocation, VisualizerLocation, projectContentUpdated, aiStateChanged, sendAIStateEvent, popupStateChanged, getPopupVisualizerState, PopupVisualizerLocation, breakpointChanged, AIMachineEventType, ArtifactData, onArtifactUpdatedNotification, onArtifactUpdatedRequest, currentThemeChanged, AIMachineSendableEvent, checkpointCaptured, CheckpointCapturedPayload, promptUpdated, approvalOverlayState, ApprovalOverlayState, onIdentifierUpdated, ProjectStructureArtifactResponse, runningServicesChanged, RunningServiceInfo, evaluationHistoryUpdated, mcpServersChanged, McpServerStatusDTO, mcpLoadErrorsChanged, McpLoadErrorsDTO, agentsMdFileInfoChanged, AgentsMdFileInfoDTO } from '@wso2/ballerina-core';
import { EvaluationHistoryWebview } from './views/evaluation-history/webview';
import { VisualizerWebview } from './views/visualizer/webview';
import { registerVisualizerRpcHandlers } from './rpc-managers/visualizer/rpc-handler';
import { registerLangClientRpcHandlers } from './rpc-managers/lang-client/rpc-handler';
import { registerLibraryBrowserRpcHandlers } from './rpc-managers/library-browser/rpc-handler';
import { registerServiceDesignerRpcHandlers } from './rpc-managers/service-designer/rpc-handler';
import { registerCommonRpcHandlers } from './rpc-managers/common/rpc-handler';
import { registerPersistDiagramRpcHandlers } from './rpc-managers/persist-diagram/rpc-handler';
import { registerGraphqlDesignerRpcHandlers } from './rpc-managers/graphql-designer/rpc-handler';
import { registerRecordCreatorRpcHandlers } from './rpc-managers/record-creator/rpc-handler';
import { registerBiDiagramRpcHandlers } from './rpc-managers/bi-diagram/rpc-handler';
import { registerAiPanelRpcHandlers } from './rpc-managers/ai-panel/rpc-handler';
import { AiPanelWebview } from './views/ai-panel/webview';
import { AIStateMachine } from './views/ai-panel/aiMachine';
import path from 'path';
import { StateMachinePopup } from './stateMachinePopup';
import { registerAiAgentRpcHandlers } from './rpc-managers/ai-agent/rpc-handler';
import { registerConnectorWizardRpcHandlers } from './rpc-managers/connector-wizard/rpc-handler';
import { registerSequenceDiagramRpcHandlers } from './rpc-managers/sequence-diagram/rpc-handler';
import { registerDataMapperRpcHandlers } from './rpc-managers/data-mapper/rpc-handler';
import { registerTestManagerRpcHandlers } from './rpc-managers/test-manager/rpc-handler';
import { registerIcpServiceRpcHandlers } from './rpc-managers/icp-service/rpc-handler';
import { registerWorkflowManagementServiceRpcHandlers } from './rpc-managers/workflow-management-service/rpc-handler';
import { extension } from './BalExtensionContext';
import { registerAgentChatRpcHandlers } from './rpc-managers/agent-chat/rpc-handler';
import { ChatPanel } from './views/agent-chat/webview';
import { activeAgentChanged, tracingStatusChanged, TraceStatus } from '@wso2/ballerina-core';
import { ArtifactsUpdated, ArtifactNotificationHandler } from './utils/project-artifacts-handler';
import { registerMigrateIntegrationRpcHandlers } from './rpc-managers/migrate-integration/rpc-handler';
import { registerPlatformExtRpcHandlers } from './rpc-managers/platform-ext/rpc-handler';
import { MigrationPanelWebview } from './views/migration-panel/webview';
import { isRecording, recordRpc } from './test-support/fixtureRecorder';

export class RPCLayer {
    static _messenger: Messenger = new Messenger({ ignoreHiddenViews: false });

    constructor(webViewPanel: WebviewPanel | WebviewView) {
        if (isWebviewPanel(webViewPanel)) {
            RPCLayer._messenger.registerWebviewPanel(webViewPanel as WebviewPanel);
            StateMachine.service().onTransition((state) => {
                RPCLayer._messenger.sendNotification(stateChanged, { type: 'webview', webviewType: VisualizerWebview.viewType }, state.value);
            });
            // Popup machine transition
            StateMachinePopup.service().onTransition((state) => {
                RPCLayer._messenger.sendNotification(popupStateChanged, { type: 'webview', webviewType: VisualizerWebview.viewType }, state.value);
            });
            window.onDidChangeActiveColorTheme((theme) => {
                RPCLayer._messenger.sendNotification(currentThemeChanged, { type: 'webview', webviewType: VisualizerWebview.viewType }, theme.kind);
            });
        } else if (isMigrationPanel(webViewPanel)) {
            // Migration panel is a WebviewPanel but does not use the AI state machine.
            RPCLayer._messenger.registerWebviewPanel(webViewPanel as WebviewPanel);
        } else {
            RPCLayer._messenger.registerWebviewView(webViewPanel as WebviewView);
            AIStateMachine.service().onTransition((state) => {
                RPCLayer._messenger.sendNotification(aiStateChanged, { type: 'webview', webviewType: AiPanelWebview.viewType }, state.value);
            });
        }
    }

    static create(webViewPanel: WebviewPanel | WebviewView) {
        return new RPCLayer(webViewPanel);
    }

    static init() {
        // Records webview RPC traffic to fixtures when BAL_RECORD_FIXTURES is set.
        // Wraps onRequest before any handler is registered so all handlers are covered.
        if (isRecording()) {
            const messenger = RPCLayer._messenger as any;
            if (!messenger.__fixtureRecorderInstalled) {
                messenger.__fixtureRecorderInstalled = true;
                const originalOnRequest = messenger.onRequest.bind(messenger);
                messenger.onRequest = (type: any, handler: any, ...rest: any[]) =>
                    originalOnRequest(
                        type,
                        async (params: any, sender: any) => {
                            const response = await handler(params, sender);
                            try {
                                recordRpc(type && type.method ? type.method : String(type), params, response);
                            } catch { /* recording must never break handling */ }
                            return response;
                        },
                        ...rest
                    );
            }
        }

        // ----- Main Webview RPC Methods
        RPCLayer._messenger.onRequest(getVisualizerLocation, () => getContext());
        registerVisualizerRpcHandlers(RPCLayer._messenger);
        registerLangClientRpcHandlers(RPCLayer._messenger);
        registerLibraryBrowserRpcHandlers(RPCLayer._messenger);
        registerServiceDesignerRpcHandlers(RPCLayer._messenger);
        registerCommonRpcHandlers(RPCLayer._messenger);
        registerPersistDiagramRpcHandlers(RPCLayer._messenger);
        registerGraphqlDesignerRpcHandlers(RPCLayer._messenger);
        registerRecordCreatorRpcHandlers(RPCLayer._messenger);
        registerBiDiagramRpcHandlers(RPCLayer._messenger);
        registerSequenceDiagramRpcHandlers(RPCLayer._messenger);
        registerConnectorWizardRpcHandlers(RPCLayer._messenger);
        registerTestManagerRpcHandlers(RPCLayer._messenger);
        registerAiAgentRpcHandlers(RPCLayer._messenger);
        registerIcpServiceRpcHandlers(RPCLayer._messenger);
        registerWorkflowManagementServiceRpcHandlers(RPCLayer._messenger);
        registerAgentChatRpcHandlers(RPCLayer._messenger);
        registerPlatformExtRpcHandlers(RPCLayer._messenger);

        // ----- AI Webview RPC Methods
        registerAiPanelRpcHandlers(RPCLayer._messenger);
        RPCLayer._messenger.onRequest(sendAIStateEvent, (event: AIMachineEventType | AIMachineSendableEvent) => AIStateMachine.sendEvent(event));

        // ----- Data Mapper Webview RPC Methods
        registerDataMapperRpcHandlers(RPCLayer._messenger);

        // ----- Popup Views RPC Methods
        RPCLayer._messenger.onRequest(getPopupVisualizerState, () => getPopupContext());

        // ----- Register Integration Migration RPC Methods
        registerMigrateIntegrationRpcHandlers(RPCLayer._messenger);

        // ----- Artifact Updated Common Notification
        RPCLayer._messenger.onRequest(onArtifactUpdatedRequest, (artifactData: ArtifactData) => {
            // Get the notification handler instance
            const notificationHandler = ArtifactNotificationHandler.getInstance();
            // Subscribe to notifications
            notificationHandler.subscribe(ArtifactsUpdated.method, artifactData, (payload) => {
                RPCLayer._messenger.sendNotification(onArtifactUpdatedNotification, { type: 'webview', webviewType: VisualizerWebview.viewType }, payload.data);
            });
        });
    }

}

async function getContext(): Promise<VisualizerLocation> {
    const context = StateMachine.context();
    return new Promise((resolve) => {
        resolve({
            documentUri: context.documentUri,
            view: context.view,
            identifier: context.identifier,
            parentIdentifier: context.parentIdentifier,
            artifactType: context.artifactType,
            position: context.position,
            syntaxTree: context.syntaxTree,
            isBI: context.isBI,
            isInDevant: context.isInDevant,
            projectPath: context.projectPath,
            workspacePath: context.workspacePath,
            serviceType: context.serviceType,
            type: context.type,
            isGraphql: context.isGraphql,
            addType: context.addType,
            focusFlowDiagramView: context.focusFlowDiagramView,
            rootDiagramId: context.rootDiagramId,
            metadata: {
                isBISupported: context.isBISupported,
                haveLS: StateMachine.langClient() && true,
                recordFilePath: context.projectPath ? path.join(context.projectPath, "types.bal") : undefined,
                enableSequenceDiagram: extension.ballerinaExtInstance.enableSequenceDiagramView(),
                target: context.metadata?.target,
                featureSupport: context.metadata?.featureSupport
            },
            scope: context.scope,
            org: context.org,
            package: context.package,
            dataMapperMetadata: context.dataMapperMetadata,
            artifactInfo: context.artifactInfo,
            reviewData: context.reviewData,
            agentMetadata: context.agentMetadata,
            evalsetData: context.evalsetData
        });
    });
}

async function getPopupContext(): Promise<PopupVisualizerLocation> {
    const context = StateMachinePopup.context();
    return new Promise((resolve) => {
        resolve({
            documentUri: context.documentUri,
            view: context.view,
            recentIdentifier: context.recentIdentifier,
            identifier: context.identifier,
            metadata: context.metadata,
            agentMetadata: context.agentMetadata,
            dataMapperMetadata: context.dataMapperMetadata
        });
    });
}

function isWebviewPanel(webview: WebviewPanel | WebviewView): boolean {
    const title = webview.title;
    return title === VisualizerWebview.webviewTitle;
}

function isMigrationPanel(webview: WebviewPanel | WebviewView): boolean {
    return 'reveal' in webview && webview.title === "Migration Assistant";
}

let _suppressWebviewNotifyCount = 0;

// Returns a release function; safe to call multiple times (no-op after first).
export function suppressWebviewNotifications(): () => void {
    _suppressWebviewNotifyCount++;
    let released = false;
    return () => {
        if (released) { return; }
        released = true;
        _suppressWebviewNotifyCount = Math.max(0, _suppressWebviewNotifyCount - 1);
    };
}

export function notifyCurrentWebview() {
    if (_suppressWebviewNotifyCount > 0) { return; }
    RPCLayer._messenger.sendNotification(projectContentUpdated, { type: 'webview', webviewType: VisualizerWebview.viewType }, true);
}

export function notifyAiWebview() {
    RPCLayer._messenger.sendNotification(projectContentUpdated, { type: 'webview', webviewType: AiPanelWebview.viewType }, true);
}

export function notifyAiPromptUpdated() {
    RPCLayer._messenger.sendNotification(promptUpdated, { type: 'webview', webviewType: AiPanelWebview.viewType });
}

export function notifyBreakpointChange() {
    RPCLayer._messenger.sendNotification(breakpointChanged, { type: 'webview', webviewType: VisualizerWebview.viewType }, true);
}

export function notifyCheckpointCaptured(payload: CheckpointCapturedPayload) {
    RPCLayer._messenger.sendNotification(checkpointCaptured, { type: 'webview', webviewType: AiPanelWebview.viewType }, payload);
}

export function notifyApprovalOverlayState(state: ApprovalOverlayState) {
    RPCLayer._messenger.sendNotification(approvalOverlayState, { type: 'webview', webviewType: AiPanelWebview.viewType }, state);
}

export function notifyRunningServicesChanged(services: RunningServiceInfo[]) {
    RPCLayer._messenger.sendNotification(runningServicesChanged, { type: 'webview', webviewType: AiPanelWebview.viewType }, services);
}

export function notifyMcpServersChanged(servers: McpServerStatusDTO[]) {
    RPCLayer._messenger.sendNotification(mcpServersChanged, { type: 'webview', webviewType: AiPanelWebview.viewType }, servers);
}

export function notifyMcpLoadErrorsChanged(errors: McpLoadErrorsDTO) {
    RPCLayer._messenger.sendNotification(mcpLoadErrorsChanged, { type: 'webview', webviewType: AiPanelWebview.viewType }, errors);
}

export function notifyAgentsMdFileInfoChanged(state: AgentsMdFileInfoDTO) {
    RPCLayer._messenger.sendNotification(agentsMdFileInfoChanged, { type: 'webview', webviewType: AiPanelWebview.viewType }, state);
}

export function notifyOnIdentifierUpdated(artifacts: ProjectStructureArtifactResponse[]) {
    RPCLayer._messenger.sendNotification(onIdentifierUpdated, { type: 'webview', webviewType: VisualizerWebview.viewType }, artifacts);
}

export function sendAgentChangedNotification(agentName: string) {
    RPCLayer._messenger.sendNotification(activeAgentChanged, { type: 'webview', webviewType: ChatPanel.viewType }, agentName);
}

export function sendTracingStatusChangedNotification(status: TraceStatus) {
    for (const webviewType of [ChatPanel.viewType, VisualizerWebview.viewType]) {
        RPCLayer._messenger.sendNotification(tracingStatusChanged, { type: 'webview', webviewType }, status);
    }
}

export function notifyEvaluationHistoryUpdated() {
    RPCLayer._messenger.sendNotification(evaluationHistoryUpdated, { type: 'webview', webviewType: EvaluationHistoryWebview.viewType });
}
