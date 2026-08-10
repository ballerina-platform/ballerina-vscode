/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { ChatNotify, DownloadProgress } from "../../state-machine-types";
import { ProjectMigrationResult } from "../../interfaces/extended-lang-client";
import { ServiceInitModel } from "../../interfaces/service";
import { FlowNode } from "../../interfaces/bi";

/**
 * Shared wire contract for the BI "migrated forms" webview-communication layer
 * (project-creation form + import-integration wizard). Used by BOTH the webview
 * client (`ballerina-visualizer` `BiWsClient`) and the extension server
 * (`ballerina-extension` `DefaultServer`) over the `@wso2/webview-giga-bridge`
 * transport, in proxy (postMessage) and websocket modes.
 */
export const WEBVIEW_WS_EVENTS = {
    /** Correlated reply to a `request()`/`notify()`. */
    WS_RESPONSE: "bi.ws.response",
    /** Migration-tool download progress stream. */
    DOWNLOAD_PROGRESS: "bi.download.progress",
    /** Migration-tool state-change stream. */
    MIGRATION_TOOL_STATE_CHANGED: "bi.migration.state",
    /** Migration-tool log stream. */
    MIGRATION_TOOL_LOGS: "bi.migration.logs",
    /** Per-project migration-completed stream (multi-project migrations). */
    MIGRATED_PROJECT: "bi.migrated.project",
    /** AI-enhancement chat stream. */
    CHAT_NOTIFY: "bi.chat.notify",
} as const;

/** Request envelope the form sends; the bridge unwraps it. Authentication is
 *  handled once during the websocket handshake, so requests carry no token. */
export interface WebviewWsRequest {
    action: string;
    params?: unknown;
}

export interface WebviewWsResponseMessage {
    type: typeof WEBVIEW_WS_EVENTS.WS_RESPONSE;
    action: string;
    success: boolean;
    result?: unknown;
    error?: string;
}

export interface WebviewWsDownloadProgressMessage {
    type: typeof WEBVIEW_WS_EVENTS.DOWNLOAD_PROGRESS;
    progress: DownloadProgress;
}

export interface WebviewWsMigrationStateMessage {
    type: typeof WEBVIEW_WS_EVENTS.MIGRATION_TOOL_STATE_CHANGED;
    state: string;
}

export interface WebviewWsMigrationLogMessage {
    type: typeof WEBVIEW_WS_EVENTS.MIGRATION_TOOL_LOGS;
    log: string;
}

export interface WebviewWsMigratedProjectMessage {
    type: typeof WEBVIEW_WS_EVENTS.MIGRATED_PROJECT;
    project: ProjectMigrationResult;
}

export interface WebviewWsChatNotifyMessage {
    type: typeof WEBVIEW_WS_EVENTS.CHAT_NOTIFY;
    event: ChatNotify;
}

export type WebviewWsResponse =
    | WebviewWsResponseMessage
    | WebviewWsDownloadProgressMessage
    | WebviewWsMigrationStateMessage
    | WebviewWsMigrationLogMessage
    | WebviewWsMigratedProjectMessage
    | WebviewWsChatNotifyMessage;

/** Connection coordinates resolved at form load. `proxy` talks to the Ballerina
 *  visualizer host over postMessage; `websocket` connects to the Ballerina
 *  extension's giga-bridge server (used for the integrator embed). */
export interface WebviewTransportBootstrap {
    mode: "proxy" | "websocket";
    wsServer: string;
    wsPort: number;
    /** Per-session token required by the websocket server. */
    token?: string;
}

/** Coordinates the extension relays to the embedded form so it can connect over
 *  websocket (host + OS-allocated port + per-session token). */
export interface WebviewWsBootstrap {
    host: string;
    port: number;
    token: string;
}

/** Result of an AI-provider sign-in attempt. */
export interface SignInResult {
    success: boolean;
    error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Integration wizard (3-step) wire contract — shared between the
// `ballerina-visualizer` wizard (`BiWsClient`) and the extension server
// (`DefaultServer` → `features/bi/integration-wizard.ts`).
// ─────────────────────────────────────────────────────────────────────────────

/** Artifact kinds the Create Integration wizard can pre-configure in the Configure step. */
export type PendingIntegrationArtifactKind = "SERVICE" | "AUTOMATION" | "WORKFLOW" | "AI_CHAT_AGENT";

/**
 * Human-readable labels per artifact kind, shared so the wizard's "Creating …"
 * screen and the post-reload startup screen word the same artifact identically —
 * the two are meant to read as one continuous progress screen across the
 * `vscode.openFolder` reload, which any wording drift would give away.
 */
export const INTEGRATION_ARTIFACT_LABELS: Record<PendingIntegrationArtifactKind, string> = {
    SERVICE: "service",
    AUTOMATION: "automation",
    WORKFLOW: "workflow",
    AI_CHAT_AGENT: "AI chat agent",
};

/** What the create is producing inside the project — an integration or a library. */
export type IntegrationComponentLabel = "integration" | "library";

/** Everything the creation progress screens need to name what is being created and where. */
export interface IntegrationCreationCopyParams {
    /** Name of the integration/library being created. */
    integrationName: string;
    /** e.g. "service"; absent for an integration created without a first artifact. */
    artifactLabel?: string;
    /** Display name of the project the package is created in; absent for a standalone package. */
    projectName?: string;
    /** True when this same submit also creates the project itself. */
    isNewProject?: boolean;
    /** Defaults to "integration". */
    componentLabel?: IntegrationComponentLabel;
}

/**
 * Wording for the create-in-progress screens. The three variants mirror the three
 * things a submit can actually be doing, so the screen never claims a project is
 * being created when the package is only being added to one that already exists.
 */
export function getIntegrationCreationCopy({
    integrationName,
    artifactLabel,
    projectName,
    isNewProject,
    componentLabel = "integration",
}: IntegrationCreationCopyParams): { title: string; subtitle: string } {
    // What finally opens: the configured first artifact when there is one, else the
    // integration/library itself (an empty integration is still something to open).
    const opening = artifactLabel ?? componentLabel;

    if (projectName && isNewProject) {
        return {
            title: `Creating project ${projectName} with ${componentLabel} ${integrationName}`,
            subtitle: `Your new ${opening} will open once the project is ready.`,
        };
    }
    if (projectName) {
        return {
            title: `Adding ${componentLabel} ${integrationName} to project ${projectName}`,
            subtitle: `Your new ${opening} will open once it has been created.`,
        };
    }
    // Standalone package — there is no project to name.
    return {
        title: `Creating ${integrationName}`,
        subtitle: `Your new ${opening} will open once the project is ready.`,
    };
}

/**
 * The filled artifact model persisted by the wizard right before the terminal
 * `vscode.openFolder` reload (at `<projectRoot>/target/.wizard-pending-artifact.json`)
 * and consumed post-reload by `checkAndRunPendingArtifact`.
 */
export interface PendingIntegrationArtifactPayload {
    version: 1;
    kind: PendingIntegrationArtifactKind;
    /** Filled service-init model — required when `kind` is `SERVICE`. */
    serviceInitModel?: ServiceInitModel;
    /** Filled function node template — required when `kind` is `AUTOMATION` or `WORKFLOW`. */
    flowNode?: FlowNode;
    /** Agent details — required when `kind` is `AI_CHAT_AGENT`. */
    aiAgent?: { name: string };
}

/** The final integration package parameters (step 1). */
export interface IntegrationProjectParams {
    integrationName: string;
    packageName: string;
    /** Parent directory the integration folder is created under. */
    projectPath: string;
    /** Editable folder name (last path segment), decoupled from the package name. */
    directoryName: string;
    /**
     * When true, `projectPath` is a brand-new Ballerina workspace root: the
     * workspace is scaffolded there and the integration package created inside it
     * (always-workspace model of the unified Create flow). When false/absent, the
     * legacy standalone / add-into-existing-workspace routing applies.
     */
    newProject?: boolean;
    /** Display name (title) for the new workspace when `newProject` is true. */
    workspaceName?: string;
    /**
     * When true, the currently open standalone integration is converted into a new
     * workspace at `projectPath` (the existing package is moved inside it) before
     * the new integration package is created — used by the "Convert to Project &
     * add a new integration" flow so it goes through the same wizard as the initial
     * Create experience. Implies a new workspace, so `projectPath` must not already
     * be a project.
     */
    convertToWorkspace?: boolean;
}

/**
 * Response to the request for the throwaway staging package the Configure-step artifact
 * form resolves its language-server model against. The staging package lives in
 * the OS temp dir — NOT at the user's chosen path — so an abandoned wizard can
 * never occupy (and later collide with) the final location. The real project is
 * created only at finalize (`createIntegration`).
 */
export interface ScaffoldIntegrationProjectResponse {
    /** Absolute path of the temp staging package (used only for model fetching). */
    projectRoot: string;
}

/** Final-submit request of the Create Integration wizard. */
export interface CreateIntegrationRequest {
    /** Final name/path; the real project is created here, fresh, at finalize. */
    project: IntegrationProjectParams;
    /** Configured first artifact; absent for an empty integration. */
    artifact?: PendingIntegrationArtifactPayload;
}

/**
 * Final-submit request of the wizard when it runs against an ALREADY-created
 * package (the "continue where you left off" flow for an empty integration).
 *
 * No package is created here — only the configured artifact is generated into
 * the existing package, in the current session, so the user never leaves the
 * package overview they started from.
 */
export interface AddIntegrationArtifactRequest {
    /** Root of the existing package the artifact is generated into. */
    packageRoot: string;
    /** Configured artifact; unlike `CreateIntegrationRequest` this is required —
     *  there is nothing to do without it, the package already exists. */
    artifact: PendingIntegrationArtifactPayload;
}

/** Version-skew handshake: embedded hosts call this first and fall back to the
 *  legacy single-step form when it fails or `threeStepWizard` is false. */
export interface WizardCapabilitiesResponse {
    threeStepWizard: boolean;
    version: number;
    /** Whether the connected Ballerina distribution supports projects/workspaces
     *  (2201.13.0+). When false, the unified Create flow must fall back to
     *  standalone integration/library creation instead of the project chooser.
     *
     *  `undefined` means NOT YET KNOWN — the probe is answered before the
     *  extension has resolved the distribution version, so the flow can render
     *  without waiting on it. Treating `undefined` as `false` silently degrades
     *  the user to the standalone flow; await {@link WorkspaceSupportResponse}
     *  (the `getWorkspaceSupport` RPC) for the settled answer instead. */
    isWorkspaceSupported?: boolean;
}

/** Settled answer to "does this distribution support projects/workspaces?".
 *  The `getWorkspaceSupport` RPC resolves only once the extension has determined
 *  it, so callers never observe the pre-init default. */
export interface WorkspaceSupportResponse {
    isWorkspaceSupported: boolean;
}

/** Resolves the file the wizard's Configure-step artifact form should target. */
export interface WizardFormTargetRequest {
    projectRoot: string;
}

export interface WizardFormTargetResponse {
    filePath: string;
}
