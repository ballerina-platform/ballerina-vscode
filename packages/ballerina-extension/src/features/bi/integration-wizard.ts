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

import { randomUUID } from "crypto";
import { promises, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
    AddIntegrationArtifactRequest,
    CreateIntegrationRequest,
    isSamePath,
    ProjectRequest,
    ScaffoldIntegrationProjectResponse,
    WizardCapabilitiesResponse,
    WorkspaceSupportResponse,
} from "@wso2/ballerina-core";
import {
    createBIComponent,
    createBIProjectPure,
    isAlreadyOpenFolder,
    openInVSCode,
    refreshProjectInfoAndWait,
    resolveCreateLandingContext,
} from "../../utils/bi";
import { generateArtifactInPlace, openPackageOverview, schedulePendingIntegration } from "./pending-artifact";
import { extension } from "../../BalExtensionContext";
import { StateMachine } from "../../stateMachine";

/**
 * Bumped whenever the wizard wire contract changes in a way remote hosts must detect.
 * v2: `isWorkspaceSupported` became tri-state (`undefined` = not determined yet) and the
 * `getWorkspaceSupport` RPC was added for the settled answer.
 */
const WIZARD_CAPABILITIES_VERSION = 2;

/**
 * OS-temp home for the wizard's throwaway staging package, scoped to this extension-host
 * process (pid + a module-load session id) so two VS Code windows never race on the same
 * staging directory — a fixed shared name let one window's cleanup delete another's
 * in-progress staging package.
 */
const STAGING_PARENT = join(tmpdir(), `wso2-integration-wizard-${process.pid}-${randomUUID()}`);
/** Package name of the staging package (irrelevant to the artifact models it serves). */
const STAGING_PACKAGE = "integration";

/**
 * Active staging package root for this session. Staging is a throwaway package under the
 * OS temp dir, created only so the LS can compute the Configure-step model; the real
 * project is created at finalize.
 */
let activeStagingRoot: string | undefined;

/** Removes the temp staging package (best-effort). Never touches user paths. */
async function cleanupStaging(): Promise<void> {
    activeStagingRoot = undefined;
    try {
        await promises.rm(STAGING_PARENT, { recursive: true, force: true });
    } catch (error) {
        console.warn("[IntegrationWizard] Failed to remove staging package:", error);
    }
}

/** Creates (or reuses) the staging package the Configure step resolves its LS model against. */
export async function scaffoldIntegrationProject(): Promise<ScaffoldIntegrationProjectResponse> {
    if (activeStagingRoot && existsSync(join(activeStagingRoot, "Ballerina.toml"))) {
        return { projectRoot: activeStagingRoot };
    }

    // Start from a clean slate — discard any stale staging left by a prior run.
    await cleanupStaging();
    mkdirSync(STAGING_PARENT, { recursive: true });

    // Org/version omitted (defaults apply); the name is irrelevant to the models it serves.
    const stagingRequest: ProjectRequest = {
        projectName: "Untitled",
        packageName: STAGING_PACKAGE,
        projectPath: STAGING_PARENT,
        createDirectory: true,
    };
    const projectRoot = await createBIProjectPure(stagingRequest);
    activeStagingRoot = projectRoot;
    return { projectRoot };
}

/**
 * Final submit: creates the real package FRESH at the user's chosen path (the only point
 * that path is ever touched), persists the configured first artifact, discards staging,
 * and opens the project. When the path resolves inside an existing workspace the package
 * is registered there; if that workspace is already open the artifact is generated live
 * with no reload, otherwise it is scheduled for post-reload generation.
 */
export async function createIntegration(params: CreateIntegrationRequest): Promise<void> {
    const projectRequest: ProjectRequest = {
        projectName: params.project.integrationName,
        packageName: params.project.packageName,
        projectPath: params.project.projectPath,
        directoryName: params.project.directoryName,
        createDirectory: true,
        newProject: params.project.newProject,
        workspaceName: params.project.workspaceName,
        convertToWorkspace: params.project.convertToWorkspace,
    };
    const { packageRoot, openRoot } = await createBIComponent(projectRequest);
    await cleanupStaging();

    const landingContext = resolveCreateLandingContext(packageRoot, openRoot, projectRequest);

    // Live path only when the extension has ALREADY activated `openRoot` — a just-converted
    // workspace at the same path is open in VS Code but still needs the reload.
    const addedIntoActiveWorkspace = isAlreadyOpenFolder(openRoot) && isSamePath(StateMachine.context().workspacePath, openRoot);

    if (addedIntoActiveWorkspace) {
        // The project was already open, so it cannot be new: the new integration is the
        // news here and its own overview is where to land.
        if (params.artifact) {
            await generateArtifactInPlace(packageRoot, params.artifact, true);
        } else {
            // Refresh BEFORE navigating: the package overview fetches project structure
            // on mount, so navigating first would show it a spinner instead of the page.
            if (await refreshProjectInfoAndWait()) {
                openPackageOverview(packageRoot);
            }
        }
        return;
    }

    // Scheduled for every create: it also tells the reloading window it is mid-create.
    await schedulePendingIntegration({
        packageRoot,
        integrationName: params.project.integrationName,
        payload: params.artifact,
        projectName: landingContext.projectName,
        isNewProject: landingContext.isNewProject,
        componentLabel: "integration",
        landing: landingContext.landing,
    });
    openInVSCode(openRoot);
}

/**
 * Final submit when the wizard targets an EXISTING package (the "continue where you left
 * off" flow). Nothing is created and no reload is needed; the artifact is generated live
 * and the window lands on that package's own overview.
 */
export async function addIntegrationArtifact(params: AddIntegrationArtifactRequest): Promise<void> {
    await cleanupStaging();
    await generateArtifactInPlace(params.packageRoot, params.artifact, true);
}

/** Discards the session's temp staging package. Called on abandon and, race-free, on every (re)open. */
export async function cancelIntegrationWizard(): Promise<void> {
    await cleanupStaging();
}

/** Alias kept for the mount-time sweep; identical to {@link cancelIntegrationWizard}. */
export async function cleanupAbandonedScaffolds(): Promise<void> {
    await cancelIntegrationWizard();
}

/**
 * Version-skew handshake for embedded hosts (see `WizardCapabilitiesResponse`).
 *
 * Answers immediately, without waiting for initialization: the Create flow's first screen
 * needs no distribution at all, so blocking here would put the whole wizard behind the
 * `bal version` probe. `isWorkspaceSupported` is therefore left `undefined` until the flags
 * are settled — callers that need it await {@link getWorkspaceSupport}.
 */
export function getWizardCapabilities(): WizardCapabilitiesResponse {
    const ballerinaExt = extension.ballerinaExtInstance;
    return {
        threeStepWizard: true,
        version: WIZARD_CAPABILITIES_VERSION,
        isWorkspaceSupported: ballerinaExt.featureSupportResolved ? ballerinaExt.isWorkspaceSupported : undefined,
    };
}

/** Settled workspace support, resolved once the distribution version is known. */
export async function getWorkspaceSupport(): Promise<WorkspaceSupportResponse> {
    await extension.ballerinaExtInstance.featureSupportReady;
    return { isWorkspaceSupported: extension.ballerinaExtInstance.isWorkspaceSupported };
}
