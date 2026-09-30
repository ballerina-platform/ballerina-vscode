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

import * as fs from 'fs';
import * as path from 'path';
import { Range, TextDocument, Uri, window, workspace, WorkspaceEdit } from 'vscode';
import { EVENT_TYPE, MACHINE_VIEW, isSamePath, normalizeProjectPath } from '@wso2/ballerina-core';
import { StateMachine, openView, reloadVisualizerApp } from '../../stateMachine';
import { VisualizerWebview } from '../../views/visualizer/webview';
import { runCommandWithOutput } from '../../utils/runCommand';
import { buildOutputChannel } from '../../utils/logger';
import { quoteShellPath } from '../../utils/config';
import { extension } from '../../BalExtensionContext';
import {
    BALLERINA_TOML,
    DEPENDENCIES_TOML,
    compareDistributionVersions,
    OutdatedPackage,
    REQUIRED_BALLERINA_VERSION,
    assessDependencyLock,
    findManifestDistribution,
    findOutdatedPackages,
    findPackageRoot,
    getWorkspacePackagePaths,
    isRuntimeOnRequiredDistribution,
    parseDistributionVersion
} from './dependency-lock';
import { DependencyCheckResult, getVisualizerCheckRoot } from './dependency-check-transitions';

// Integrations are created with `sticky = true`, so a project written on a Java 21 distribution keeps its locked
// package versions after moving to 2201.14.0, and never picks up the releases that fixed them for Java 25. This
// detects such a lock from Dependencies.toml and, on the visualizer screen, offers to re-resolve it or points to the
// docs for going back to a matching version. No VS Code popups: the screen carries the choice, progress and outcome.
// A root is a package or a workspace; a workspace is checked and updated as a whole, one lock per member.

const OUTDATED_TITLE = 'Your project dependencies need to be updated';
const STATUS_BAR_MESSAGE_MS = 8000;

/** Normalized keys, so repeated clicks on one root reached by different spellings share one update. */
const updatesInFlight = new Map<string, Promise<string | undefined>>();
/** Normalized root -> packages whose last update build failed; retried even if their lock already moved. */
const failedBuilds = new Map<string, OutdatedPackage[]>();

/** The packages under `root` whose locks need updating; empty when none do or the check does not apply. */
function findOutdated(root: string | undefined): OutdatedPackage[] {
    if (!root) {
        return [];
    }
    // #1089's JDK check fails open, so the runtime may still be older; re-resolving on it cannot help.
    if (!isRuntimeOnRequiredDistribution(extension.ballerinaExtInstance?.ballerinaVersion)) {
        return [];
    }
    return findOutdatedPackages(root);
}

/**
 * Blocks the visualizer on the update screen when a package under `root` has a Dependencies.toml older than
 * {@link REQUIRED_BALLERINA_VERSION}, and brings the app back once none does. Detection fails open; once an
 * outdated lock is known, a failure blocks.
 */
export async function checkDependencyCompatibility(root: string | undefined): Promise<DependencyCheckResult> {
    let outdated: OutdatedPackage[] = [];
    try {
        outdated = findOutdated(root);
        if (outdated.length === 0) {
            // A lock fixed outside the screen, or a compatible root in a multi-root window: no-op unless blocked.
            await reloadVisualizerApp();
            return 'compatible';
        }
        blockPanel(root);
        return 'blocked';
    } catch (error) {
        console.error('>>> Error checking dependency compatibility', error);
        return outdated.length > 0 ? 'blocked' : 'compatible';
    }
}

/** Run/Debug gate: an outdated package or workspace cancels the launch and shows the update screen instead. */
export function ensureDependenciesCompatible(filePath: string | undefined): boolean {
    const root = filePath ? findPackageRoot(filePath) : undefined;
    if (!root || findOutdated(root).length === 0) {
        return true;
    }
    if (VisualizerWebview.currentPanel && isSamePath(getVisualizerCheckRoot(StateMachine.context()), root)) {
        blockPanel(root);
        VisualizerWebview.currentPanel.getWebview()?.reveal();
    } else {
        // The state machine's own check blocks the view it opens.
        openView(EVENT_TYPE.OPEN_VIEW, getWorkspacePackagePaths(root)
            ? { view: MACHINE_VIEW.WorkspaceOverview }
            : { view: MACHINE_VIEW.PackageOverview, projectPath: root });
    }
    // So the cancelled launch doesn't read as a debugger failure.
    window.setStatusBarMessage('Run cancelled: update the project dependencies first', STATUS_BAR_MESSAGE_MS);
    return false;
}

export async function updateDependenciesFromPanel(): Promise<void> {
    const info = VisualizerWebview.dependencyUpdateRequired;
    if (!info || info.status?.kind === 'updating') {
        return;
    }
    const root = info.rootPath;
    let failure: string | undefined;
    try {
        failure = await updateDependencies(root, withFailedBuilds(root, findOutdated(root)));
    } catch (error) {
        // An escaped rejection would leave the screen on its spinner, which also ignores Update clicks.
        console.error('>>> Error updating dependencies', error);
        failure = "The dependencies couldn't be updated.";
    }
    if (failure) {
        blockPanel(root, { kind: 'failed', message: failure });
        return;
    }
    await reloadVisualizerApp();
    window.setStatusBarMessage('$(check) Dependencies updated', STATUS_BAR_MESSAGE_MS); // not a popup
    const context = StateMachine.context();
    openView(EVENT_TYPE.OPEN_VIEW, context.projectPath
        ? { view: MACHINE_VIEW.PackageOverview, projectPath: context.projectPath }
        : { view: MACHINE_VIEW.WorkspaceOverview });
}

export function showUpdateOutput(): void {
    buildOutputChannel.show();
}

/** The why, the two ways out (details live in the docs), and what updating touches, naming packages in a workspace. */
function describeOutdated(root: string, outdated: OutdatedPackage[]): { paragraphs: string[]; note: string[] } {
    const packages = getWorkspacePackagePaths(root) && outdated.length > 0
        ? [`Packages to update: ${outdated.map((item) => item.name).join(', ')}.`]
        : [];
    return {
        paragraphs: [
            'Your project dependencies were set up with an earlier Ballerina version, and some of the dependencies are '
                + `incompatible with Ballerina ${REQUIRED_BALLERINA_VERSION}.`,
            'Update the dependencies, or keep them as they are by going back to earlier versions.'
        ],
        note: [`Updating changes ${DEPENDENCIES_TOML} and ${BALLERINA_TOML} and needs network access.`, ...packages]
    };
}

/** Only the root the panel is showing; a panel that does not exist yet loads the app as usual. Keeps a status. */
function blockPanel(
    root: string,
    status?: { kind: 'updating'; message: string } | { kind: 'failed'; message: string }
): void {
    if (!VisualizerWebview.currentPanel || !isSamePath(getVisualizerCheckRoot(StateMachine.context()), root)) {
        return;
    }
    // A re-check (navigation, Run) keeps the progress or failure already showing for this root.
    const showing = VisualizerWebview.dependencyUpdateRequired;
    const kept = status ?? (showing && isSamePath(showing.rootPath, root) ? showing.status : undefined);
    VisualizerWebview.showDependencyUpdateRequired({
        rootPath: root, title: OUTDATED_TITLE, ...describeOutdated(root, findOutdated(root)), status: kept
    });
}

/** `outdated` plus the packages whose last build failed, if still members of `root` and not already listed. */
function withFailedBuilds(root: string, outdated: OutdatedPackage[]): OutdatedPackage[] {
    const members = getWorkspacePackagePaths(root) ?? [root];
    const retries = (failedBuilds.get(normalizeProjectPath(root)) ?? [])
        .filter((item) => members.some((member) => isSamePath(member, item.path)) && fs.existsSync(item.path))
        .filter((item) => !outdated.some((pending) => isSamePath(pending.path, item.path)));
    return [...outdated, ...retries];
}

/** Resolves to a failure message, or `undefined` when every package in `outdated` built and ended up current. */
function updateDependencies(root: string, outdated: OutdatedPackage[]): Promise<string | undefined> {
    const key = normalizeProjectPath(root);
    const inFlight = updatesInFlight.get(key);
    if (inFlight) {
        return inFlight;
    }
    const update = runDependencyUpdate(root, outdated).finally(() => updatesInFlight.delete(key));
    updatesInFlight.set(key, update);
    return update;
}

async function runDependencyUpdate(root: string, outdated: OutdatedPackage[]): Promise<string | undefined> {
    const failed: { item: OutdatedPackage; output: string }[] = [];
    const updated: OutdatedPackage[] = [];
    // One member at a time, from its own folder, so one member's compile errors do not hold back the rest.
    for (const item of outdated) {
        blockPanel(root, {
            kind: 'updating',
            message: outdated.length > 1 ? `Updating dependencies of ${item.name}...` : 'Updating dependencies...'
        });
        try {
            const build = await cleanBuildWithoutSticky(item.path);
            // Both must hold: the exit code cannot say the lock moved forward, and a build can fail after it did.
            const after = assessDependencyLock(item.path);
            if (after.kind === 'current') {
                await syncManifestDistribution(item.path, after.lockedVersion);
                updated.push(item);
            }
            if (!build.success || after.kind !== 'current') {
                failed.push({ item, output: build.output });
            }
        } catch (error) {
            console.error(`>>> Error updating the dependencies of ${item.name}`, error);
            failed.push({ item, output: String(error) });
        }
    }
    const key = normalizeProjectPath(root);
    if (failed.length > 0) {
        failedBuilds.set(key, failed.map(({ item }) => item));
    } else {
        failedBuilds.delete(key);
    }

    // The LS reloads each project on its Dependencies.toml change; this pulls anything still missing into it.
    for (const item of updated) {
        try {
            await StateMachine.langClient()?.resolveMissingDependencies({
                documentIdentifier: { uri: Uri.file(item.path).toString() }
            });
        } catch (error) {
            console.error(`>>> Error resolving dependencies of ${item.name} after the update`, error);
        }
    }
    return failed.length > 0 ? describeFailure(failed, outdated.length) : undefined;
}

/**
 * Not `--locking-mode=soft`: under sticky it keeps the locked versions yet restamps distribution-version, hiding
 * the problem from this check. With sticky off the compiler re-resolves a lock from an older update. `bal clean`
 * first, because an up-to-date build cache skips resolution entirely.
 */
async function cleanBuildWithoutSticky(packagePath: string): Promise<{ success: boolean; output: string }> {
    const bal = quoteShellPath(extension.ballerinaExtInstance.getBallerinaCmd());
    return runCommandWithOutput(`${bal} clean && ${bal} build --sticky=false`, packagePath, buildOutputChannel);
}

/**
 * Moves Ballerina.toml's `distribution` forward to the lock's; `bal build` never rewrites it. Only ever advances it,
 * skips a manifest with unsaved edits, and never throws.
 */
async function syncManifestDistribution(packagePath: string, lockedVersion: string): Promise<void> {
    const version = parseDistributionVersion(lockedVersion);
    if (!version) {
        return;
    }
    const value = `${version.major}.${version.minor}.${version.patch}`;
    const uri = Uri.file(path.join(packagePath, BALLERINA_TOML));
    let document: TextDocument;
    try {
        document = await workspace.openTextDocument(uri);
    } catch {
        return;
    }
    // An edit to a buffer with unsaved changes gets saved with them, here or by the visualizer's change listener.
    if (document.isDirty) {
        return;
    }
    const field = findManifestDistribution(document.getText());
    // A removed field is not added back, and one already naming a newer distribution is not moved back.
    if (!field || !(compareDistributionVersions(field.value, value) < 0)) {
        return;
    }
    const edit = new WorkspaceEdit();
    edit.replace(uri, new Range(document.positionAt(field.start), document.positionAt(field.end)), value);
    try {
        if (await workspace.applyEdit(edit)) {
            await document.save();
        }
    } catch (error) {
        // Best effort: the lock is what moved the dependencies, so a read-only manifest does not fail the update.
        console.error(`>>> Error syncing the distribution in ${uri.fsPath}`, error);
    }
}

function describeFailure(failed: { item: OutdatedPackage; output: string }[], total: number): string {
    const subject = total > 1
        ? `The dependencies of ${failed.map(({ item }) => item.name).join(', ')} couldn't be updated`
        : "The dependencies couldn't be updated";
    const outputs = failed.map(({ output }) => output).join('\n');
    if (/compilation contains errors/i.test(outputs)) {
        return `${subject} because of compile errors. Fix them and try again.`;
    }
    if (/unknown ?host|connection refused|connect timed out|failed to connect|unable to connect|network is unreachable/i.test(outputs)) {
        return `${subject}: Ballerina Central couldn't be reached. Check your internet connection and try again.`;
    }
    return `${subject}.`;
}
