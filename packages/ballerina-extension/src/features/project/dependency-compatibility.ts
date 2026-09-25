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
import * as os from 'os';
import * as path from 'path';
import { commands, env, ProgressLocation, Range, TextDocument, Uri, window, workspace, WorkspaceEdit } from 'vscode';
import { EVENT_TYPE, MACHINE_VIEW, isSamePath } from '@wso2/ballerina-core';
import { StateMachine, openView, reloadVisualizerApp } from '../../stateMachine';
import { VisualizerWebview } from '../../views/visualizer/webview';
import { runCommandWithOutput } from '../../utils/runCommand';
import { buildOutputChannel } from '../../utils/logger';
import { isInWI, quoteShellPath, WI_EXTENSION_ID } from '../../utils/config';
import { extension } from '../../BalExtensionContext';
import { EXTENSION_ID } from '../../core';
import {
    BALLERINA_TOML,
    OutdatedPackage,
    REQUIRED_BALLERINA_VERSION,
    assessDependencyLock,
    findManifestDistribution,
    findOutdatedPackages,
    findPackageRoot,
    findPinnedDependencies,
    getWorkspacePackagePaths,
    isRuntimeOnRequiredDistribution,
    parseDistributionVersion,
    pickRollbackDistribution,
    readManifestDistribution
} from './dependency-lock';

/**
 * Integrations are created with `sticky = true`, so a project written on a Java 21 distribution keeps its locked
 * package versions after moving to 2201.14.0, and never picks up the releases that fixed them for Java 25. This
 * detects such a lock from Dependencies.toml and offers to re-resolve it, or to go back to a matching version.
 *
 * A root is a package or a workspace; a workspace is checked and updated as a whole, one lock per member.
 */
export type DependencyCheckResult = 'compatible' | 'updated' | 'blocked';

const WI_RELEASES_URL = 'https://github.com/wso2/product-integrator/releases';
const UPDATE_DEPENDENCIES = 'Update Dependencies';
const USE_EARLIER_VERSION = 'Use an Earlier Version';

/** Roots already prompted this session; later visits block the panel without another modal. */
const promptedRoots = new Set<string>();
const updatesInFlight = new Map<string, Promise<boolean>>();

/** The Integrator app bundles its own distribution, so going back means an older app. */
function isInIntegratorApp(): boolean {
    return !!process.env.WSO2_INTEGRATOR_RUNTIME;
}

function productName(): string {
    if (isInIntegratorApp()) {
        return 'WSO2 Integrator';
    }
    return isInWI() ? 'the WSO2 Integrator extension' : 'the Ballerina extension';
}

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
 * Prompts when a package under `root` has a Dependencies.toml older than {@link REQUIRED_BALLERINA_VERSION}. With
 * `promptOnce`, a root already prompted this session is blocked without asking again. Fails open.
 */
export async function checkDependencyCompatibility(
    root: string | undefined,
    options: { promptOnce: boolean }
): Promise<DependencyCheckResult> {
    try {
        const outdated = findOutdated(root);
        if (outdated.length === 0) {
            return 'compatible';
        }
        if (options.promptOnce && promptedRoots.has(root)) {
            blockPanel(root, outdated);
            return 'blocked';
        }
        promptedRoots.add(root);

        const selection = await window.showWarningMessage(
            outdated.length > 1 || isWorkspace(root)
                ? "Some packages' dependencies need to be updated."
                : "This integration's dependencies need to be updated.",
            { modal: true, detail: `${describeOutdated(root, outdated)} ${describeChoice()}` },
            UPDATE_DEPENDENCIES,
            USE_EARLIER_VERSION
        );
        if (selection === UPDATE_DEPENDENCIES && await updateDependencies(root, outdated)) {
            return 'updated';
        }
        blockPanel(root, findOutdated(root)); // a partial update leaves fewer to list
        if (selection === USE_EARLIER_VERSION) {
            await showEarlierVersionGuide(findOutdated(root));
        }
        return 'blocked';
    } catch (error) {
        console.error('>>> Error checking dependency compatibility', error);
        return 'compatible';
    }
}

/** Run/Debug gate for the package or workspace being launched: false when left outdated. */
export async function ensureDependenciesCompatible(filePath: string | undefined): Promise<boolean> {
    const root = filePath ? findPackageRoot(filePath) : undefined;
    if (!root) {
        return true;
    }
    const result = await checkDependencyCompatibility(root, { promptOnce: false });
    if (result === 'updated') {
        await refreshBlockedPanel();
    }
    return result !== 'blocked';
}

export async function updateDependenciesFromPanel(): Promise<void> {
    const info = VisualizerWebview.dependencyUpdateRequired;
    if (!info) {
        return;
    }
    await updateDependencies(info.rootPath, findOutdated(info.rootPath));
    await refreshBlockedPanel(); // restores the app, or lists what is left and re-enables the button
}

export async function showEarlierVersionGuideFromPanel(): Promise<void> {
    const info = VisualizerWebview.dependencyUpdateRequired;
    if (info) {
        await showEarlierVersionGuide(findOutdated(info.rootPath));
    }
}

function isWorkspace(root: string): boolean {
    return !!getWorkspacePackagePaths(root);
}

function describeOutdated(root: string, outdated: OutdatedPackage[]): string {
    const required = `Ballerina ${REQUIRED_BALLERINA_VERSION} (Java 25)`;
    if (outdated.length === 1 && !isWorkspace(root)) {
        return `Its dependencies were locked by Ballerina ${outdated[0].lockedVersion ?? 'an earlier version'} and `
            + `cannot run on ${required}.`;
    }
    const names = outdated.map((item) => `${item.name} (${item.lockedVersion ?? 'an earlier version'})`).join(', ');
    return `These packages' dependencies were locked by an earlier Ballerina version and cannot run on ${required}: `
        + `${names}.`;
}

function describeChoice(): string {
    return 'Update them to the latest compatible versions, or keep them by going back to an earlier version of '
        + `${productName()}.`;
}

/** The root the visualizer is showing: its workspace when there is one, so every member is covered. */
export function getVisualizerCheckRoot(context: { workspacePath?: string; projectPath?: string }): string | undefined {
    return context.workspacePath || context.projectPath;
}

/** Only the root the panel is showing; a panel that does not exist yet loads the app as usual. */
function blockPanel(root: string, outdated: OutdatedPackage[]): void {
    if (!VisualizerWebview.currentPanel || !isSamePath(getVisualizerCheckRoot(StateMachine.context()), root)) {
        return;
    }
    VisualizerWebview.showDependencyUpdateRequired({
        rootPath: root,
        summary: describeOutdated(root, outdated),
        choice: describeChoice()
    });
}

/** After an update outside the state machine's own check: restore a panel with nothing left, else re-list. */
async function refreshBlockedPanel(): Promise<void> {
    const info = VisualizerWebview.dependencyUpdateRequired;
    if (!info) {
        return;
    }
    const outdated = findOutdated(info.rootPath);
    if (outdated.length > 0) {
        blockPanel(info.rootPath, outdated);
        return;
    }
    await reloadVisualizerApp();
    const context = StateMachine.context();
    openView(EVENT_TYPE.OPEN_VIEW, context.projectPath
        ? { view: MACHINE_VIEW.PackageOverview, projectPath: context.projectPath }
        : { view: MACHINE_VIEW.WorkspaceOverview });
}

/** True when every package in `outdated` ended up current. */
function updateDependencies(root: string, outdated: OutdatedPackage[]): Promise<boolean> {
    const inFlight = updatesInFlight.get(root);
    if (inFlight) {
        return inFlight;
    }
    const update = runDependencyUpdate(outdated).finally(() => updatesInFlight.delete(root));
    updatesInFlight.set(root, update);
    return update;
}

async function runDependencyUpdate(outdated: OutdatedPackage[]): Promise<boolean> {
    const failed: { item: OutdatedPackage; output: string }[] = [];
    const updated: OutdatedPackage[] = [];
    await window.withProgress(
        { location: ProgressLocation.Notification, title: 'Updating dependencies' },
        async (progress) => {
            // One member at a time, from its own folder, so one member's compile errors do not hold back the rest.
            for (const item of outdated) {
                progress.report({ message: outdated.length > 1 ? item.name : undefined });
                const output = await rebuildWithoutSticky(item.path);
                // The lock is only rewritten when the build succeeds; the exit code cannot say it moved forward.
                const after = assessDependencyLock(item.path);
                if (after.kind === 'current') {
                    await syncManifestDistribution(item.path, after.lockedVersion);
                    updated.push(item);
                } else {
                    failed.push({ item, output });
                }
            }
        }
    );

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

    if (failed.length > 0) {
        reportUpdateFailure(failed, outdated.length);
        return false;
    }
    reportUpdateSuccess(updated);
    return true;
}

/**
 * Not `--locking-mode=soft`: under sticky it keeps the locked versions yet restamps distribution-version, hiding
 * the problem from this check. With sticky off the compiler re-resolves a lock from an older update. A fresh
 * target directory, because an up-to-date build cache skips resolution entirely, and it leaves the user's own
 * `target` alone.
 */
async function rebuildWithoutSticky(packagePath: string): Promise<string> {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bal-dependency-update-'));
    try {
        const command = `${quoteShellPath(extension.ballerinaExtInstance.getBallerinaCmd())} build --sticky=false `
            + `--target-dir ${quoteShellPath(targetDir)}`;
        return (await runCommandWithOutput(command, packagePath, buildOutputChannel)).output;
    } finally {
        fs.rmSync(targetDir, { recursive: true, force: true });
    }
}

/** Keeps Ballerina.toml's `distribution` in step with the lock; `bal build` never rewrites it. */
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
    const field = findManifestDistribution(document.getText());
    if (!field || field.value === value) {
        return; // a removed field is not added back
    }
    const edit = new WorkspaceEdit();
    edit.replace(uri, new Range(document.positionAt(field.start), document.positionAt(field.end)), value);
    if (await workspace.applyEdit(edit)) {
        await document.save();
    }
}

async function reportUpdateSuccess(updated: OutdatedPackage[]): Promise<void> {
    const pins: string[] = [];
    for (const item of updated) {
        try {
            const document = await workspace.openTextDocument(Uri.file(path.join(item.path, BALLERINA_TOML)));
            pins.push(...findPinnedDependencies(document.getText()));
        } catch {
            // No Ballerina.toml to read pins from.
        }
    }
    if (pins.length === 0) {
        window.showInformationMessage('Dependencies updated.');
        return;
    }
    // An explicit [[dependency]] version is a hard constraint that re-resolution cannot move.
    window.showWarningMessage(
        `Dependencies updated, except those pinned in ${BALLERINA_TOML}: ${pins.join(', ')}. `
        + 'Update their versions there if they fail on Java 25.'
    );
}

async function reportUpdateFailure(failed: { item: OutdatedPackage; output: string }[], total: number): Promise<void> {
    const subject = total > 1
        ? `The dependencies of ${failed.map(({ item }) => item.name).join(', ')} couldn't be updated`
        : "The integration's dependencies couldn't be updated";
    const outputs = failed.map(({ output }) => output).join('\n');
    let message = `${subject}.`;
    if (/compilation contains errors/i.test(outputs)) {
        message = `${subject} because of compile errors. Fix them and try again.`;
    } else if (/unknown ?host|connection refused|connect timed out|failed to connect|unable to connect|network is unreachable/i.test(outputs)) {
        message = `${subject}: Ballerina Central couldn't be reached. Check your internet connection and try again.`;
    }
    const SHOW_OUTPUT = 'Show Output';
    if (await window.showErrorMessage(message, SHOW_OUTPUT) === SHOW_OUTPUT) {
        buildOutputChannel.show();
    }
}

async function showEarlierVersionGuide(outdated: OutdatedPackage[]): Promise<void> {
    if (isInIntegratorApp()) {
        const OPEN_RELEASES = 'Open Releases';
        const selection = await window.showInformationMessage(
            'Install an earlier version of WSO2 Integrator.',
            {
                modal: true,
                detail: 'Earlier versions bundle the Ballerina version these dependencies were locked with, so the '
                    + 'integration opens unchanged. Update the dependencies when you move to this version again.'
            },
            OPEN_RELEASES
        );
        if (selection === OPEN_RELEASES) {
            await env.openExternal(Uri.parse(WI_RELEASES_URL));
        }
        return;
    }

    // Downgrading the extension alone leaves the Java 25 distribution in place, and an older distribution alone is
    // refused by this extension's JDK check, so both go back.
    const distribution = pickRollbackDistribution(outdated.map((item) => ({
        lockedVersion: item.lockedVersion,
        manifestDistribution: readManifestDistribution(item.path)
    })));
    const pullCommand = distribution ? `bal dist pull ${distribution}` : undefined;
    const extensionId = isInWI() ? WI_EXTENSION_ID : EXTENSION_ID;
    const extensions = isInWI() ? 'the WSO2 Integrator and Ballerina extensions' : 'the Ballerina extension';
    const step1 = pullCommand
        ? `1. Run \`${pullCommand}\` to switch to the Ballerina version they were locked with.`
        : `1. Switch to a Ballerina version earlier than ${REQUIRED_BALLERINA_VERSION} with \`bal dist pull <version>\` `
            + '(`bal dist list` shows them).';
    const detail = `To keep this integration's current dependencies:\n\n${step1}\n`
        + `2. Install the previous version of ${extensions}: expand the dropdown next to Uninstall and pick `
        + '"Install Specific Version...".\n\n'
        + 'Turn off auto-update for the extension, or VS Code will reinstall this version.';

    const COPY_COMMAND = 'Copy Command';
    const OPEN_EXTENSION_PAGE = 'Open Extension Page';
    const actions = pullCommand ? [COPY_COMMAND, OPEN_EXTENSION_PAGE] : [OPEN_EXTENSION_PAGE];
    let selection = await window.showInformationMessage(
        'Go back to an earlier Ballerina and extension version.', { modal: true, detail }, ...actions
    );
    if (selection === COPY_COMMAND) {
        await env.clipboard.writeText(pullCommand);
        selection = await window.showInformationMessage(
            `Copied \`${pullCommand}\`. Run it in a terminal, then install the previous extension version.`,
            OPEN_EXTENSION_PAGE
        );
    }
    if (selection === OPEN_EXTENSION_PAGE) {
        await commands.executeCommand('extension.open', extensionId);
    }
}
