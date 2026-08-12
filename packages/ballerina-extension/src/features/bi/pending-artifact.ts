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

import * as fs from "fs";
import * as path from "path";
import { ProgressLocation, window } from "vscode";
import {
    EVENT_TYPE,
    INTEGRATION_ARTIFACT_LABELS,
    IntegrationComponentLabel,
    isPathInside,
    isSamePath,
    MACHINE_VIEW,
    PendingIntegrationArtifactPayload,
} from "@wso2/ballerina-core";
import { openView, StateMachine } from "../../stateMachine";
import { claimCreateLanding } from "../../utils/state-machine-utils";
import { ServiceDesignerRpcManager } from "../../rpc-managers/service-designer/rpc-manager";
import { BiDiagramRpcManager } from "../../rpc-managers/bi-diagram/rpc-manager";
import {
    clearPendingIntegrationPointer,
    isPendingPointerFresh,
    PendingIntegrationArtifactPointer,
    readPendingIntegrationPointer,
    writePendingIntegrationPointer,
} from "./startup-progress";

/** Payload file location inside the scaffolded project (target/ is gitignored by the scaffold). */
const PENDING_ARTIFACT_RELATIVE_PATH = path.join("target", ".wizard-pending-artifact.json");

/**
 * Depth rather than a boolean: the in-place and post-reload paths can overlap, and the first
 * one to finish must not clear the flag out from under the other.
 */
let integrationCreateDepth = 0;

/**
 * Whether a Create Integration submit is being finished right now.
 *
 * Scaffolding a package makes the language server publish artifacts for a package the project
 * structure does not know yet, and `updateProjectArtifacts` answers that by navigating to the
 * workspace overview. During a create that is wrong: the create flow decides where to land, and
 * the fallback would replace the new integration's overview a moment after it opened.
 */
export function isFinishingIntegrationCreate(): boolean {
    return integrationCreateDepth > 0;
}

/** Runs `task` with {@link isFinishingIntegrationCreate} reporting true. */
async function whileFinishingIntegrationCreate<T>(task: () => PromiseLike<T>): Promise<T> {
    integrationCreateDepth++;
    try {
        return await task();
    } finally {
        integrationCreateDepth--;
    }
}

/** Human-readable labels for progress and error messages, per artifact kind. */
const ARTIFACT_KIND_LABELS = INTEGRATION_ARTIFACT_LABELS;

function pendingArtifactFilePath(projectRoot: string): string {
    return path.join(projectRoot, PENDING_ARTIFACT_RELATIVE_PATH);
}

/** What a submit hands over to the window that will finish it after the reload. */
export interface PendingIntegrationSchedule {
    /** The new package's own folder. */
    packageRoot: string;
    /** Display name of the integration/library being created. */
    integrationName: string;
    /** Configured first artifact; absent for an empty integration or a library. */
    payload?: PendingIntegrationArtifactPayload;
    /** Display name of the project the package went into; absent for a standalone package. */
    projectName?: string;
    /** True when the same submit created the project too. */
    isNewProject?: boolean;
    /** Defaults to "integration" on read. */
    componentLabel?: IntegrationComponentLabel;
}

/**
 * Records the create so the reloaded window can finish it. Written even for an empty
 * integration or a library — it is also what lets the new window narrate the create.
 * Call right before `openInVSCode(openRoot)`.
 */
export async function schedulePendingIntegration(schedule: PendingIntegrationSchedule): Promise<void> {
    const { packageRoot, payload } = schedule;
    if (payload) {
        const payloadFile = pendingArtifactFilePath(packageRoot);
        fs.mkdirSync(path.dirname(payloadFile), { recursive: true });
        fs.writeFileSync(payloadFile, JSON.stringify(payload), "utf8");
    }

    await writePendingIntegrationPointer({
        projectRoot: packageRoot,
        timestamp: Date.now(),
        integrationName: schedule.integrationName,
        artifactKind: payload?.kind,
        projectName: schedule.projectName,
        isNewProject: schedule.isNewProject,
        componentLabel: schedule.componentLabel,
    });
    console.log(
        `[IntegrationWizard] Scheduled pending ${payload?.kind ?? "empty"} integration for project: ${packageRoot}`
    );
}

/**
 * Finishes a wizard submit that spanned the last folder reload: generates the configured
 * first artifact and lands on the new integration. Consume-immediately — the pointer and
 * payload file are cleared BEFORE generation, so a failure can never loop. Safe on every
 * activation; never throws. No progress toast: the startup screen already narrates the wait.
 */
export async function checkAndRunPendingArtifact(): Promise<void> {
    return whileFinishingIntegrationCreate(runPendingArtifact);
}

async function runPendingArtifact(): Promise<void> {
    try {
        const stored = readPendingIntegrationPointer();
        if (!stored) {
            return;
        }

        // Consume the pointer immediately to avoid re-running on later activations.
        await clearPendingIntegrationPointer();

        const payload = consumePendingArtifactPayload(stored.projectRoot);

        // Discard stale entries (e.g. the user opened an unrelated workspace later).
        if (!isPendingPointerFresh(stored)) {
            const age = Date.now() - stored.timestamp;
            console.log(`[IntegrationWizard] Discarding stale pending artifact (age: ${Math.round(age / 1000)}s)`);
            return;
        }

        // Match the entry to the opened project: a standalone package is the context's
        // projectPath; inside a workspace only workspacePath is set.
        const ctx = StateMachine.context();
        const opensStoredPackage = isSamePath(stored.projectRoot, ctx.projectPath);
        const insideOpenWorkspace = !!ctx.workspacePath && isPathInside(ctx.workspacePath, stored.projectRoot);
        if (!opensStoredPackage && !insideOpenWorkspace) {
            console.log(
                `[IntegrationWizard] Pending artifact project (${stored.projectRoot}) does not match ` +
                `the opened project (projectPath=${ctx.projectPath}, workspacePath=${ctx.workspacePath}) — skipping.`
            );
            return;
        }

        // An empty integration has no payload: there is nothing to generate, only
        // the landing view below to open.
        if (!payload) {
            openPackageOverview(stored.projectRoot);
            return;
        }

        const label = ARTIFACT_KIND_LABELS[payload.kind];
        if (!label || payload.version !== 1) {
            console.error(`[IntegrationWizard] Unsupported pending artifact payload:`, payload);
            openPackageOverview(stored.projectRoot);
            return;
        }

        const addedIntoWorkspace = insideOpenWorkspace && !opensStoredPackage;
        console.log(
            `[IntegrationWizard] Pending artifact: kind=${payload.kind}, projectRoot=${stored.projectRoot}, ` +
            `opensStoredPackage=${opensStoredPackage}, insideOpenWorkspace=${insideOpenWorkspace}, ` +
            `addedIntoWorkspace=${addedIntoWorkspace}`
        );
        let claimedView = false;
        try {
            claimedView = await generatePendingArtifact(payload, stored.projectRoot);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[IntegrationWizard] Failed to generate pending ${payload.kind} artifact:`, error);
            window.showErrorMessage(
                `Couldn't create the ${label}: ${message}. ` +
                `Your integration was created; you can add the artifact from the Artifacts panel.`
            );
        }
        // Unconditional, and it has to be: this runs after awaiting generation, and the
        // project explorer's own startup navigation lands during that await. Standing down
        // because something had already navigated is what left the window on the workspace
        // overview — a create is the last word on where a create ends up.
        if (!claimedView) {
            openPackageOverview(stored.projectRoot);
        }
    } catch (error) {
        console.error("[IntegrationWizard] Unexpected error while checking pending artifact:", error);
    }
}

/** Reads and immediately deletes the payload file; undefined when missing (empty integration) or unreadable. */
function consumePendingArtifactPayload(projectRoot: string): PendingIntegrationArtifactPayload | undefined {
    const payloadFile = pendingArtifactFilePath(projectRoot);
    if (!fs.existsSync(payloadFile)) {
        return undefined;
    }
    let raw: string;
    try {
        raw = fs.readFileSync(payloadFile, "utf8");
    } catch (error) {
        console.warn(`[IntegrationWizard] Could not read pending artifact payload at: ${payloadFile}`, error);
        return undefined;
    }
    try {
        fs.rmSync(payloadFile, { force: true });
    } catch (error) {
        console.warn(`[IntegrationWizard] Failed to delete pending artifact payload: ${payloadFile}`, error);
    }
    try {
        return JSON.parse(raw) as PendingIntegrationArtifactPayload;
    } catch (error) {
        console.error(`[IntegrationWizard] Pending artifact payload is not valid JSON: ${payloadFile}`, error);
        return undefined;
    }
}

/**
 * Generates the first artifact for a package added into a workspace already open in this
 * window — runs in the current session, no pointer and no reload.
 */
export async function generateArtifactInPlace(
    packageRoot: string,
    payload: PendingIntegrationArtifactPayload
): Promise<void> {
    const label = ARTIFACT_KIND_LABELS[payload.kind];
    if (!label || payload.version !== 1) {
        console.error(`[IntegrationWizard] Unsupported artifact payload for in-place generation:`, payload);
        return;
    }

    try {
        const claimedView = await whileFinishingIntegrationCreate(() => window.withProgress(
            { location: ProgressLocation.Notification, title: `Generating your ${label}...` },
            () => generatePendingArtifact(payload, packageRoot)
        ));
        if (!claimedView) {
            openPackageOverview(packageRoot);
        }
        // Silent: a non-silent refresh lands on the workspace overview, which would clobber
        // the package overview navigated to above.
        StateMachine.refreshProjectInfo({ silent: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[IntegrationWizard] Failed to generate ${payload.kind} artifact in place:`, error);
        window.showErrorMessage(
            `Couldn't create the ${label}: ${message}. ` +
            `Your integration was created; you can add the artifact from the Artifacts panel.`
        );
    }
}

/**
 * Runs the kind-specific generation. All files target `projectRoot` (the new package).
 *
 * Returns whether generation claimed the view for a destination of its own, in which case the
 * caller leaves it alone. Only the agent does that — it hands off to a wizard rather than
 * finishing here. Everything else leaves the caller to land on the new integration, which is
 * the thing the user came to see whether it went into a project that already existed or one
 * this same submit created.
 */
async function generatePendingArtifact(
    payload: PendingIntegrationArtifactPayload,
    projectRoot: string
): Promise<boolean> {
    switch (payload.kind) {
        case "SERVICE": {
            if (!payload.serviceInitModel) {
                throw new Error("The service configuration is missing");
            }
            // Target the new package explicitly (`<projectRoot>/main.bal`) so it works
            // both standalone and when the package lives inside an opened workspace.
            await new ServiceDesignerRpcManager().createServiceAndListener({
                filePath: "",
                projectPath: projectRoot,
                serviceInitModel: payload.serviceInitModel,
            });
            return false;
        }
        case "AUTOMATION":
        case "WORKFLOW": {
            if (!payload.flowNode) {
                throw new Error("The function configuration is missing");
            }
            // Same default file the FunctionForm targets (MainPanel's getDefaultFunctionsFile).
            const filePath = path.join(projectRoot, "functions.bal");
            await new BiDiagramRpcManager().getSourceCode({
                filePath,
                flowNode: payload.flowNode,
                isFunctionNodeUpdate: true,
            });
            return false;
        }
        case "AI_CHAT_AGENT": {
            // Pragmatic v1: the agent's multi-RPC orchestration stays webview-side —
            // land on the Chat Agent Service wizard with the chosen name carried on the
            // existing `identifier` field of the visualizer location.
            openView(EVENT_TYPE.OPEN_VIEW, {
                view: MACHINE_VIEW.AIChatAgentWizard,
                identifier: payload.aiAgent?.name,
            });
            return true;
        }
        default:
            throw new Error(`Unsupported artifact kind: ${(payload as PendingIntegrationArtifactPayload).kind}`);
    }
}

/**
 * Lands on the new package's overview; the package root is passed as `projectPath` so it
 * resolves inside a workspace.
 */
export function openPackageOverview(projectRoot: string): void {
    openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.PackageOverview, projectPath: projectRoot });
    // Claimed as well as navigated: the project explorer issues its own Open Overview once its
    // tree finishes loading, which can be after this lands, and would otherwise replace the
    // integration the user just made. Claimed AFTER the navigation above, so that navigation
    // does not consume its own claim.
    claimCreateLanding(projectRoot);
}

