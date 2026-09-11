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
    PendingIntegrationArtifactKind,
    PendingIntegrationArtifactPayload,
} from "@wso2/ballerina-core";
import { openView, StateMachine } from "../../stateMachine";
import { claimCreateLanding } from "../../utils/state-machine-utils";
import { ServiceDesignerRpcManager } from "../../rpc-managers/service-designer/rpc-manager";
import { BiDiagramRpcManager } from "../../rpc-managers/bi-diagram/rpc-manager";
import { extension } from "../../BalExtensionContext";
import { addConfigFile, getConfigFilePath } from "../ai/utils";
import { isAIAuthenticated } from "../ai/migration/orchestrator";
import {
    clearPendingIntegrationPointer,
    isPendingPointerFresh,
    readPendingIntegrationPointer,
    writePendingIntegrationPointer,
} from "./startup-progress";

/** Payload file location inside the scaffolded project (target/ is gitignored by the scaffold). */
const PENDING_ARTIFACT_RELATIVE_PATH = path.join("target", ".wizard-pending-artifact.json");

/** Human-readable labels for progress and error messages, per artifact kind. */
const ARTIFACT_KIND_LABELS = INTEGRATION_ARTIFACT_LABELS;

/**
 * Kinds whose generation navigates somewhere of its own, so the landing below must leave them
 * alone — the agent hands off to its wizard rather than finishing on an overview.
 *
 * They must also not be pre-landed. `KINDS_WRITING_AN_ARTIFACT` in `Visualizer.tsx` holds the
 * create's progress screen for the other three only, so for these a pre-landing would be visible
 * as a flash on the way to the wizard, and would leave a spare history entry behind.
 */
const KINDS_NAVIGATING_THEMSELVES: PendingIntegrationArtifactKind[] = ["AI_CHAT_AGENT"];

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
 * The post-reload landing: claims as well as navigates.
 *
 * Startup issues navigations of its own whose order relative to this one varies run to run, so
 * a workspace overview arriving behind it would otherwise replace the new integration. Claimed
 * AFTER navigating, so this navigation does not spend its own claim.
 *
 * The in-place path deliberately uses {@link openPackageOverview} instead. It runs in a settled
 * window with no startup navigation to race, and the one navigation that can follow it — the
 * untracked-package fallback in `updateProjectArtifacts` — is already covered there by that
 * function's own `alreadyViewingAddedPackage` check. A claim planted there would be one nothing
 * ever spends, and the project explorer's Show Overview would walk into it.
 */
function landOnNewIntegrationAfterReload(projectRoot: string): void {
    openPackageOverview(projectRoot);
    claimCreateLanding(projectRoot);
}

/**
 * Finishes a wizard submit that spanned the last folder reload: generates the configured
 * first artifact and lands on the new integration. Consume-immediately — the pointer and
 * payload file are cleared BEFORE generation, so a failure can never loop. Safe on every
 * activation; never throws. No progress toast: the startup screen already narrates the wait.
 */
export async function checkAndRunPendingArtifact(): Promise<void> {
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
            landOnNewIntegrationAfterReload(stored.projectRoot);
            return;
        }

        const label = ARTIFACT_KIND_LABELS[payload.kind];
        if (!label || payload.version !== 1) {
            console.error(`[IntegrationWizard] Unsupported pending artifact payload:`, payload);
            landOnNewIntegrationAfterReload(stored.projectRoot);
            return;
        }

        const addedIntoWorkspace = insideOpenWorkspace && !opensStoredPackage;
        console.log(
            `[IntegrationWizard] Pending artifact: kind=${payload.kind}, projectRoot=${stored.projectRoot}, ` +
            `opensStoredPackage=${opensStoredPackage}, insideOpenWorkspace=${insideOpenWorkspace}, ` +
            `addedIntoWorkspace=${addedIntoWorkspace}`
        );
        // Land BEFORE generating, not only after. `OPEN_VIEW` is handled in `extensionReady` and
        // `viewActive.viewReady` only, and this runs from the `extensionReady` subscription, so a
        // navigation sent here is very likely to be acted on — and free if it is not, since the
        // `deliverable` guard keeps a dropped one from spending the claim and the re-assert below
        // follows. Not a guarantee: `clearPendingIntegrationPointer` above is awaited, so a startup
        // navigation can land in that gap. Generation is asynchronous and startup navigates while
        // it runs, so a landing sent only afterwards is the one likely to arrive somewhere that
        // drops it.
        //
        // Invisible to the user, for the kinds this covers: the webview holds the create's progress
        // screen until the artifact appears in the project structure.
        const generationNavigatesItself = KINDS_NAVIGATING_THEMSELVES.includes(payload.kind);
        if (!generationNavigatesItself) {
            landOnNewIntegrationAfterReload(stored.projectRoot);
        }

        try {
            await generatePendingArtifact(payload, stored.projectRoot);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[IntegrationWizard] Failed to generate pending ${payload.kind} artifact:`, error);
            window.showErrorMessage(
                `Couldn't create the ${label}: ${message}. ` +
                `Your integration was created; you can add the artifact from the Artifacts panel.`
            );
        }
        // Re-assert, in case startup navigated away while generation ran. Best-effort by design:
        // if this one is dropped the landing above already happened, and the claim it refreshes
        // still answers a workspace overview arriving later.
        if (!generationNavigatesItself) {
            landOnNewIntegrationAfterReload(stored.projectRoot);
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
        await window.withProgress(
            { location: ProgressLocation.Notification, title: `Generating your ${label}...` },
            () => generatePendingArtifact(payload, packageRoot)
        );
        if (!KINDS_NAVIGATING_THEMSELVES.includes(payload.kind)) {
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
 * Landing is the caller's business, not this function's — see {@link KINDS_NAVIGATING_THEMSELVES}
 * for the one kind that navigates itself. Keeping that distinction in a single list rather than a
 * value returned from here is what lets the caller act on it BEFORE generation as well as after.
 */
async function generatePendingArtifact(
    payload: PendingIntegrationArtifactPayload,
    projectRoot: string
): Promise<void> {
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
            return;
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
            if (payload.flowNode.codedata?.node === "DURABLE_AGENT") {
                await configureDurableAgentModelProvider(projectRoot);
            }
            return;
        }
        case "AI_CHAT_AGENT": {
            // Pragmatic v1: the agent's multi-RPC orchestration stays webview-side —
            // land on the Chat Agent Service wizard with the chosen name carried on the
            // existing `identifier` field of the visualizer location.
            openView(EVENT_TYPE.OPEN_VIEW, {
                view: MACHINE_VIEW.AIChatAgentWizard,
                identifier: payload.aiAgent?.name,
            });
            return;
        }
        default:
            throw new Error(`Unsupported artifact kind: ${(payload as PendingIntegrationArtifactPayload).kind}`);
    }
}

/**
 * Writes the WSO2 default model provider's Config.toml entry for a durable agent generated
 * into a fresh package. The generation itself declares the `wso2ModelProvider` variable, but
 * without the `[ballerina.ai.wso2ProviderConfig]` values the agent fails at startup. The
 * package root is already known here, so the config file is targeted directly (no project
 * quick-pick). Failures are non-fatal: the agent exists and the provider can be configured
 * from the agent's model circle.
 *
 * Only attempted while the user is signed in to the AI features, and with `signOutOnFailure` off:
 * a failed token fetch signs the user out by default, and ending their AI session because a
 * background config write hit a network blip is a far larger consequence than the write itself.
 */
async function configureDurableAgentModelProvider(projectRoot: string): Promise<void> {
    if (!isAIAuthenticated()) {
        return;
    }
    try {
        const configPath = await getConfigFilePath(extension.ballerinaExtInstance, projectRoot);
        if (configPath) {
            await addConfigFile(configPath, "model", { signOutOnFailure: false });
        }
    } catch (error) {
        console.error("[IntegrationWizard] Failed to configure the default model provider:", error);
    }
}

/**
 * Lands on the new package's overview; the package root is passed as `projectPath` so it
 * resolves inside a workspace.
 */
export function openPackageOverview(projectRoot: string): void {
    openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.PackageOverview, projectPath: projectRoot });
}

