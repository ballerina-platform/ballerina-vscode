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
import { commands, ProgressLocation, Range, TextDocument, Uri, window, workspace, WorkspaceEdit } from 'vscode';
import { ConnectorReference, ConnectorUpgradeAdvice } from '@wso2/ballerina-core';
import { StateMachine } from '../../stateMachine';
import { runCommandWithOutput } from '../../utils/runCommand';
import { buildOutputChannel } from '../../utils/logger';
import { quoteShellPath } from '../../utils/config';
import { extension } from '../../BalExtensionContext';

/** {@code CommandConstants.ARG_KEY_DOC_URI} on the LS side -- see PullModuleExecutor.java. */
const ARG_KEY_DOC_URI = 'doc.uri';
/** {@code CommandConstants.ARG_KEY_PACKAGES} on the LS side -- see PullModuleExecutor.java. */
const ARG_KEY_PACKAGES = 'packages';
const PULL_MODULE_COMMAND = 'PULL_MODULE';
const RELOAD_WINDOW_COMMAND = 'workbench.action.reloadWindow';
const DID_CHANGE_WATCHED_FILES = 'workspace/didChangeWatchedFiles';
const FILE_CHANGE_TYPE_CHANGED = 2;
const BALLERINA_TOML = 'Ballerina.toml';
const DEPENDENCIES_TOML = 'Dependencies.toml';
const MAIN_BAL = 'main.bal';

const UPGRADE_PROMPT_MESSAGE = "This project's connectors need an update to work with Service Designer.";
const UPGRADE_PROGRESS_TITLE = 'Updating connectors';
const PULLING_PROGRESS_MESSAGE = 'Pulling the required connector versions...';
const UPDATING_MANIFEST_PROGRESS_MESSAGE = 'Updating Ballerina.toml...';
const REBUILDING_PROGRESS_MESSAGE = 'Rebuilding the project...';
const PULL_FAILED_MESSAGE = "Couldn't pull the required connector versions:";
const MANIFEST_UPDATE_FAILED_MESSAGE = "Couldn't update the connector versions in Ballerina.toml:";
const REBUILD_FAILED_MESSAGE = "Couldn't clean and rebuild the project. See the build output for details.";
const RELOAD_PROMPT_MESSAGE = "This project's connectors are updated. Reload the window to finish.";
const RELOAD_WINDOW_ACTION = 'Reload Window';

enum BalCommand {
    Clean = 'clean',
    Build = 'build'
}

/** Resolve past the lock file without deleting it: SOFT allows minor and patch updates of locked versions. */
const REBUILD_FLAGS = ['--sticky=false', '--locking-mode=soft'];

enum UpgradeAction {
    Update = 'Update',
    NotNow = 'Not Now'
}

const pendingReloadConnectors = new Map<string, Map<string, ConnectorReference>>();

interface PackageCoordinate {
    org: string;
    name: string;
    version: string;
}

export enum TomlTable {
    Dependency = 'dependency',
    Package = 'package'
}

interface VersionEntry {
    start: number;
    version: string;
}

interface OutdatedLock {
    item: ConnectorUpgradeAdvice;
    lockedVersion: string;
}

/**
 * Checks the current project for connectors used as a `service ... on <module>:Listener` whose
 * resolved version predates schema-driven trigger support, and prompts for consent to update.
 */
export async function checkAndPromptConnectorUpgrades(projectPath: string): Promise<void> {
    if (!projectPath) {
        return;
    }
    const advice = await fetchUpgradeAdvice(projectPath);
    if (advice.length === 0) {
        return;
    }
    const selection = await window.showInformationMessage(
        UPGRADE_PROMPT_MESSAGE,
        UpgradeAction.Update,
        UpgradeAction.NotNow
    );
    if (selection === UpgradeAction.Update) {
        await upgradeConnectors(advice, projectPath, true);
    }
}

/** The connectors of {@code projectPath} upgraded in this session that still wait for a window reload. */
export function getPendingReloadConnectors(projectPath: string): ConnectorReference[] {
    return Array.from(pendingReloadConnectors.get(projectPath)?.values() ?? []);
}

/**
 * Upgrades every connector in {@code advice} to its minimum supported version:
 *
 * <ol>
 * <li>Pulls the exact required versions through {@code PULL_MODULE}. A plain re-resolution pulls nothing,
 * since an older bala of each connector is already cached.</li>
 * <li>Raises explicit {@code Ballerina.toml} {@code [[dependency]]} pins to the pulled versions.</li>
 * <li>When {@code Dependencies.toml} locks an advised connector below its required version, runs
 * {@code bal clean} and a {@code bal build} with the soft locking mode, since the default mode only allows patch
 * updates and the locked versions would otherwise keep winning over the pulled ones. The language server is then
 * told the lock file changed, so it resolves the new versions before the next request instead of waiting for the
 * file watcher. A connector locked across a compatibility boundary (a major version, or a minor version below
 * 1.0.0) from its required version has its lock entry dropped first, since no locking mode crosses one. A
 * connector the project doesn't depend on yet needs no rebuild: nothing locks it. A failed rebuild restores
 * {@code Ballerina.toml} and {@code Dependencies.toml}, so neither points at a version the build never took.</li>
 * </ol>
 *
 * With {@code promptReload}, the upgraded connectors are recorded as waiting for a reload and the user is
 * asked to reload the window so every open view is rebuilt against the new versions.
 *
 * @returns whether the upgrade completed
 */
export async function upgradeConnectors(
    advice: ConnectorUpgradeAdvice[],
    projectPath: string,
    promptReload: boolean
): Promise<boolean> {
    if (advice.length === 0) {
        return false;
    }
    const upgraded = await window.withProgress(
        { location: ProgressLocation.Notification, title: UPGRADE_PROGRESS_TITLE },
        async (progress) => {
            progress.report({ message: PULLING_PROGRESS_MESSAGE });
            if (!(await pullExactVersions(advice, projectPath))) {
                reportFailure(PULL_FAILED_MESSAGE, advice);
                return false;
            }

            progress.report({ message: UPDATING_MANIFEST_PROGRESS_MESSAGE });
            const ballerinaToml = path.join(projectPath, BALLERINA_TOML);
            const originalManifest = await readFileOrUndefined(ballerinaToml);
            if (!(await raiseDependencyPins(advice, ballerinaToml))) {
                reportFailure(MANIFEST_UPDATE_FAILED_MESSAGE, advice);
                return false;
            }

            const dependenciesToml = path.join(projectPath, DEPENDENCIES_TOML);
            const originalLocks = await readFileOrUndefined(dependenciesToml);
            const outdated = await findOutdatedLocks(advice, dependenciesToml);
            if (outdated.length > 0) {
                progress.report({ message: REBUILDING_PROGRESS_MESSAGE });
                if (!(await unlockIncompatibleVersions(outdated, dependenciesToml)) ||
                    !(await rebuild(outdated.map(({ item }) => item), dependenciesToml, projectPath))) {
                    await restoreFile(ballerinaToml, originalManifest);
                    await restoreFile(dependenciesToml, originalLocks);
                    window.showErrorMessage(REBUILD_FAILED_MESSAGE);
                    return false;
                }
                await notifyDependenciesTomlChanged(dependenciesToml);
            }

            return true;
        }
    );
    if (upgraded && promptReload) {
        markPendingReload(advice, projectPath);
        promptWindowReload();
    }
    return upgraded;
}

/**
 * Upgrades every connector the project needs to upgrade, along with {@code requested} even if the
 * language server no longer reports it, so a single reload covers them all.
 */
export async function upgradeProjectConnectors(
    requested: ConnectorUpgradeAdvice,
    projectPath: string
): Promise<boolean> {
    const advice = await fetchUpgradeAdvice(projectPath);
    const isRequestedListed = advice.some((item) =>
        connectorKey(item) === connectorKey(requested));
    return upgradeConnectors(isRequestedListed ? advice : [...advice, requested], projectPath, true);
}

function markPendingReload(advice: ConnectorUpgradeAdvice[], projectPath: string): void {
    const pending = pendingReloadConnectors.get(projectPath) ?? new Map<string, ConnectorReference>();
    for (const item of advice) {
        pending.set(connectorKey(item), { orgName: item.orgName, packageName: item.packageName });
    }
    pendingReloadConnectors.set(projectPath, pending);
}

function promptWindowReload(): void {
    window.showInformationMessage(RELOAD_PROMPT_MESSAGE, RELOAD_WINDOW_ACTION).then((selection) => {
        if (selection === RELOAD_WINDOW_ACTION) {
            commands.executeCommand(RELOAD_WINDOW_COMMAND);
        }
    });
}

function connectorKey(connector: ConnectorReference): string {
    return `${connector.orgName}/${connector.packageName}`;
}

async function fetchUpgradeAdvice(projectPath: string): Promise<ConnectorUpgradeAdvice[]> {
    try {
        const response = await StateMachine.langClient().getConnectorUpgradeAdvice({ filePath: projectPath });
        return response?.advice ?? [];
    } catch (error) {
        console.error('>>> Error fetching connector upgrade advice', error);
        return [];
    }
}

async function pullExactVersions(advice: ConnectorUpgradeAdvice[], projectPath: string): Promise<boolean> {
    const targetFile = advice.find((item) => item.usedInFile)?.usedInFile ?? MAIN_BAL;
    const fileUri = Uri.file(path.isAbsolute(targetFile) ? targetFile : path.join(projectPath, targetFile))
        .toString();
    const packages: PackageCoordinate[] = advice.map((item) => ({
        org: item.orgName,
        name: item.packageName,
        version: item.minSupportedVersion
    }));
    try {
        const result = await StateMachine.langClient().executeCommand({
            command: PULL_MODULE_COMMAND,
            arguments: [
                { key: ARG_KEY_DOC_URI, value: fileUri },
                { key: ARG_KEY_PACKAGES, value: packages }
            ]
        });
        return result !== false;
    } catch (error) {
        console.error('>>> Connector upgrade pull failed', error);
        return false;
    }
}

/**
 * Raises every explicit {@code Ballerina.toml} pin of an advised connector to its pulled version. A pin that
 * is already at or above that version is left alone, so an upgrade never downgrades a connector.
 */
async function raiseDependencyPins(advice: ConnectorUpgradeAdvice[], ballerinaToml: string): Promise<boolean> {
    const document: TextDocument | undefined = await workspace.openTextDocument(Uri.file(ballerinaToml))
        .then((opened) => opened, () => undefined);
    if (!document) {
        return true;
    }
    const text = document.getText();
    const pinned = advice
        .map((item) => ({ item, pin: findVersionEntry(text, TomlTable.Dependency, item.orgName, item.packageName) }))
        .filter((entry): entry is { item: ConnectorUpgradeAdvice; pin: VersionEntry } =>
            entry.pin !== undefined && compareVersions(entry.pin.version, entry.item.minSupportedVersion) < 0);
    if (pinned.length === 0) {
        return true;
    }
    const edit = new WorkspaceEdit();
    for (const { item, pin } of pinned) {
        edit.replace(document.uri, new Range(document.positionAt(pin.start),
            document.positionAt(pin.start + pin.version.length)), item.minSupportedVersion);
    }
    if (!(await workspace.applyEdit(edit))) {
        console.error('>>> Failed to apply Ballerina.toml edits for connector upgrade');
        return false;
    }
    return document.save();
}

/**
 * Drops the {@code Dependencies.toml} entry of every outdated connector locked across a compatibility boundary
 * from its required version, since no locking mode moves a locked version across one. The rebuild then resolves
 * that connector afresh, while every other entry stays locked.
 */
async function unlockIncompatibleVersions(outdated: OutdatedLock[], dependenciesToml: string): Promise<boolean> {
    const incompatible = outdated.filter(({ item, lockedVersion }) =>
        !isCompatibleVersion(lockedVersion, item.minSupportedVersion));
    if (incompatible.length === 0) {
        return true;
    }
    try {
        const text = await fs.promises.readFile(dependenciesToml, 'utf8');
        const unlocked = incompatible.reduce((current, { item }) =>
            removeTableEntry(current, TomlTable.Package, item.orgName, item.packageName), text);
        await fs.promises.writeFile(dependenciesToml, unlocked, 'utf8');
        return true;
    } catch (error) {
        console.error('>>> Failed to unlock connectors in Dependencies.toml', error);
        return false;
    }
}

/**
 * Whether {@code left} and {@code right} are within the same compatibility range: the same major version, or the
 * same minor version below 1.0.0. Locking modes only move a locked version within its range.
 */
export function isCompatibleVersion(left: string, right: string): boolean {
    const [a, b] = [left, right].map((version) =>
        version.split(/[-+]/)[0].split('.').map((part) => parseInt(part, 10) || 0));
    return a[0] === b[0] && (a[0] !== 0 || (a[1] ?? 0) === (b[1] ?? 0));
}

/** The advised connectors {@code Dependencies.toml} locks below their required version. */
async function findOutdatedLocks(
    advice: ConnectorUpgradeAdvice[], dependenciesToml: string
): Promise<OutdatedLock[]> {
    const locked = await Promise.all(advice.map((item) =>
        findLockedVersion(dependenciesToml, item.orgName, item.packageName)));
    return advice
        .map((item, i) => ({ item, lockedVersion: locked[i] }))
        .filter((lock): lock is OutdatedLock =>
            lock.lockedVersion !== undefined && compareVersions(lock.lockedVersion, lock.item.minSupportedVersion) < 0);
}

async function readFileOrUndefined(filePath: string): Promise<string | undefined> {
    try {
        return await fs.promises.readFile(filePath, 'utf8');
    } catch {
        return undefined;
    }
}

/** Writes {@code original} back to {@code filePath} if the upgrade changed it. */
async function restoreFile(filePath: string, original: string | undefined): Promise<void> {
    if (original === undefined || (await readFileOrUndefined(filePath)) === original) {
        return;
    }
    try {
        await fs.promises.writeFile(filePath, original, 'utf8');
    } catch (error) {
        console.error(`>>> Failed to restore ${path.basename(filePath)} after a failed connector upgrade`, error);
    }
}

/**
 * Runs {@code bal clean} then a {@code bal build} that updates the lock file in place to the pulled versions.
 * The build counts as successful when the lock file resolves every advised connector to at least its
 * required version, since it can fail on unrelated compile errors after dependency resolution already succeeded.
 */
async function rebuild(
    advice: ConnectorUpgradeAdvice[], dependenciesToml: string, projectPath: string
): Promise<boolean> {
    const ballerinaCmd = quoteShellPath(extension.ballerinaExtInstance.getBallerinaCmd());
    const clean = await runCommandWithOutput(`${ballerinaCmd} ${BalCommand.Clean}`, projectPath, buildOutputChannel);
    if (!clean.success) {
        return false;
    }
    await runCommandWithOutput(
        [ballerinaCmd, BalCommand.Build, ...REBUILD_FLAGS].join(' '), projectPath, buildOutputChannel);
    const locked = await Promise.all(advice.map((item) =>
        findLockedVersion(dependenciesToml, item.orgName, item.packageName)));
    return locked.every((version, i) =>
        version !== undefined && compareVersions(version, advice[i].minSupportedVersion) >= 0);
}

/**
 * Reloads the project in the language server now rather than when the file watcher event arrives, so a view that
 * re-fetches its model right after the upgrade doesn't see the old locked versions.
 */
async function notifyDependenciesTomlChanged(dependenciesToml: string): Promise<void> {
    try {
        await StateMachine.langClient().sendNotification(DID_CHANGE_WATCHED_FILES, {
            changes: [{ uri: Uri.file(dependenciesToml).toString(), type: FILE_CHANGE_TYPE_CHANGED }]
        });
    } catch (error) {
        console.error('>>> Failed to notify the language server of the Dependencies.toml change', error);
    }
}

/**
 * Compares two versions with semver precedence: the numeric major/minor/patch parts first, then the
 * pre-release, which ranks below its own release ("2.0.0-beta" < "2.0.0"). Build metadata is ignored, and a
 * missing or non-numeric core part counts as 0.
 */
export function compareVersions(left: string, right: string): number {
    const parse = (version: string) => {
        const [core, ...preRelease] = version.split('+')[0].split('-');
        return {
            core: core.split('.').map((part) => parseInt(part, 10) || 0),
            preRelease: preRelease.length > 0 ? preRelease.join('-').split('.') : []
        };
    };
    const [a, b] = [parse(left), parse(right)];
    for (let i = 0; i < 3; i++) {
        const diff = (a.core[i] ?? 0) - (b.core[i] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    if (a.preRelease.length === 0 || b.preRelease.length === 0) {
        return b.preRelease.length - a.preRelease.length;
    }
    for (let i = 0; i < Math.min(a.preRelease.length, b.preRelease.length); i++) {
        const diff = comparePreReleaseIdentifiers(a.preRelease[i], b.preRelease[i]);
        if (diff !== 0) {
            return diff;
        }
    }
    return a.preRelease.length - b.preRelease.length;
}

/** Numeric identifiers compare numerically and rank below alphanumeric ones, which compare in ASCII order. */
function comparePreReleaseIdentifiers(left: string, right: string): number {
    const [leftNumeric, rightNumeric] = [/^\d+$/.test(left), /^\d+$/.test(right)];
    if (leftNumeric && rightNumeric) {
        return parseInt(left, 10) - parseInt(right, 10);
    }
    if (leftNumeric !== rightNumeric) {
        return leftNumeric ? -1 : 1;
    }
    return left < right ? -1 : left > right ? 1 : 0;
}

function reportFailure(message: string, advice: ConnectorUpgradeAdvice[]): void {
    window.showErrorMessage(`${message} ${advice.map((item) => item.moduleName).join(', ')}.`);
}

/**
 * Reads the version {@code Dependencies.toml} locks {@code orgName}/{@code packageName} to, straight from disk
 * so an open editor buffer never masks what the build wrote, or {@code undefined} if it is not locked.
 */
async function findLockedVersion(
    dependenciesToml: string, orgName: string, packageName: string
): Promise<string | undefined> {
    try {
        const text = await fs.promises.readFile(dependenciesToml, 'utf8');
        return findVersionEntry(text, TomlTable.Package, orgName, packageName)?.version;
    } catch {
        return undefined;
    }
}

/**
 * Finds the {@code version} value, and its offset in {@code text}, of the {@code [[<table>]]} entry
 * matching {@code orgName}/{@code packageName}.
 */
export function findVersionEntry(
    text: string, table: TomlTable, orgName: string, packageName: string
): VersionEntry | undefined {
    const match = findTableEntry(text, table, orgName, packageName);
    const versionMatch = match?.[0].match(/^\s*version\s*=\s*"([^"]+)"/m);
    if (!match || !versionMatch || versionMatch.index === undefined) {
        return undefined;
    }
    return {
        start: match.index + versionMatch.index + versionMatch[0].indexOf(versionMatch[1]),
        version: versionMatch[1]
    };
}

/**
 * Removes the {@code [[<table>]]} entry matching {@code orgName}/{@code packageName} from {@code text}, along with
 * the blank lines up to the next table.
 */
export function removeTableEntry(text: string, table: TomlTable, orgName: string, packageName: string): string {
    const match = findTableEntry(text, table, orgName, packageName);
    return match ? text.slice(0, match.index) + text.slice(match.index + match[0].length) : text;
}

/** The {@code [[<table>]]} entry matching {@code orgName}/{@code packageName}, up to the next table. */
function findTableEntry(
    text: string, table: TomlTable, orgName: string, packageName: string
): RegExpExecArray | undefined {
    const tableRegex = new RegExp(`\\[\\[${table}\\]\\](?:(?!^[ \\t]*\\[)[\\s\\S])*`, 'gm');
    let match: RegExpExecArray | null;
    while ((match = tableRegex.exec(text)) !== null) {
        const orgMatch = match[0].match(/^\s*org\s*=\s*"([^"]+)"/m);
        const nameMatch = match[0].match(/^\s*name\s*=\s*"([^"]+)"/m);
        if (orgMatch?.[1] === orgName && nameMatch?.[1] === packageName) {
            return match;
        }
    }
    return undefined;
}
