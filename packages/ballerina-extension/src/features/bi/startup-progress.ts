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

import {
    INTEGRATION_ARTIFACT_LABELS,
    IntegrationComponentLabel,
    isPathInside,
    PendingIntegrationArtifactKind,
} from "@wso2/ballerina-core";
import { extension } from "../../BalExtensionContext";

// Bookkeeping for a wizard submit that spans the `vscode.openFolder` reload. Kept
// dependency-light: the webview reads this while building its first HTML, so importing
// the state machine here would add a startup import cycle.

/** globalState key — only one pending wizard create is allowed at a time. */
export const PENDING_INTEGRATION_ARTIFACT_KEY = "ballerina.pendingIntegrationArtifact";

/** Milliseconds before a stale pending entry is discarded. */
export const PENDING_ARTIFACT_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Where the reloaded window lands once the create finishes. A brand-new project opens on
 * its own overview (the user just made the project, so that is the thing they made);
 * adding into a project that already exists opens the new package instead, since the
 * project itself is not the news.
 */
export type PendingIntegrationLanding = "project" | "package";

/** globalState value written before the reload; the filled artifact model lives in the project's `target/.wizard-pending-artifact.json`. */
export interface PendingIntegrationArtifactPointer {
    projectRoot: string;
    /** epoch ms — used to discard stale entries (> 10 min). */
    timestamp: number;
    /** Display name of the integration, for the startup progress screen. */
    integrationName?: string;
    /** Kind of the configured first artifact; absent for an empty integration. */
    artifactKind?: PendingIntegrationArtifactKind;
    /** Display name of the project the package went into; absent for a standalone package. */
    projectName?: string;
    /** True when the same submit created the project too. */
    isNewProject?: boolean;
    /** Integration vs library — the progress screen names them differently. */
    componentLabel?: IntegrationComponentLabel;
    /** Decided at submit time, where all the routing context is; absent on pointers written by an older build. */
    landing?: PendingIntegrationLanding;
}

/** What the reloaded window narrates while it finishes a create started before the reload. */
export interface StartupIntegrationProgress {
    integrationName: string;
    /** e.g. "service" — absent for an empty integration. */
    artifactLabel?: string;
    /** Kind of the artifact being generated; the webview waits for the matching project-structure entry before leaving the screen. */
    artifactKind?: PendingIntegrationArtifactKind;
    /** The package the artifact is generated into — the one to watch for it. */
    projectRoot: string;
    /** Project the package was created in; absent for a standalone package. */
    projectName?: string;
    /** Whether the project was created by the same submit. */
    isNewProject?: boolean;
    /** Integration vs library. */
    componentLabel?: IntegrationComponentLabel;
}

export function readPendingIntegrationPointer(): PendingIntegrationArtifactPointer | undefined {
    return extension.context?.globalState.get<PendingIntegrationArtifactPointer>(PENDING_INTEGRATION_ARTIFACT_KEY);
}

export async function writePendingIntegrationPointer(pointer: PendingIntegrationArtifactPointer): Promise<void> {
    await extension.context.globalState.update(PENDING_INTEGRATION_ARTIFACT_KEY, pointer);
}

export async function clearPendingIntegrationPointer(): Promise<void> {
    await extension.context.globalState.update(PENDING_INTEGRATION_ARTIFACT_KEY, undefined);
}

/** Whether `pointer` was written recently enough to still be acted on. */
export function isPendingPointerFresh(pointer: PendingIntegrationArtifactPointer): boolean {
    return Date.now() - pointer.timestamp <= PENDING_ARTIFACT_TTL_MS;
}

/** Whether `pointer` belongs to the folder this window opened (`isPathInside` is inclusive of the path itself). */
export function isPendingPointerForOpenedPath(
    pointer: PendingIntegrationArtifactPointer,
    openedPath: string | undefined
): boolean {
    return isPathInside(openedPath, pointer.projectRoot);
}

/**
 * The create-in-progress this window should narrate, or undefined for an ordinary open.
 * Freshness- and path-guarded so a stale or foreign entry never claims a create.
 */
export function getStartupIntegrationProgress(openedPath: string | undefined): StartupIntegrationProgress | undefined {
    const pointer = readPendingIntegrationPointer();
    if (!pointer?.integrationName || !isPendingPointerFresh(pointer)) {
        return undefined;
    }
    if (!isPendingPointerForOpenedPath(pointer, openedPath)) {
        return undefined;
    }
    return {
        integrationName: pointer.integrationName,
        artifactLabel: pointer.artifactKind ? INTEGRATION_ARTIFACT_LABELS[pointer.artifactKind] : undefined,
        artifactKind: pointer.artifactKind,
        projectRoot: pointer.projectRoot,
        projectName: pointer.projectName,
        isNewProject: pointer.isNewProject,
        componentLabel: pointer.componentLabel,
    };
}
