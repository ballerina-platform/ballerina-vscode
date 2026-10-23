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

import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import * as path from 'path';
import { workspace, window, commands, ConfigurationTarget, env, Uri, WorkspaceConfiguration } from 'vscode';
import { ICP_PATH } from '../../core/preferences';
import { log } from '../../utils/logger';

const ICP_BIN_RELATIVE = 'components/icp/bin';
const ICP_SCRIPT_UNIX = 'icp.sh';
const ICP_SCRIPT_WIN = 'icp.bat';
export const ICP_HOME_ENV = 'WSO2_INTEGRATOR_ICP_HOME';
/** Set to `true` by the WSO2 Integrator launcher; absent in plain VS Code. */
export const WI_RUNTIME_ENV = 'WSO2_INTEGRATOR_RUNTIME';

function getICPScriptName(): string {
    return process.platform === 'win32' ? ICP_SCRIPT_WIN : ICP_SCRIPT_UNIX;
}

function isWIRuntime(): boolean {
    return process.env[WI_RUNTIME_ENV] === 'true';
}

/**
 * The install root of the running editor, derived from `env.appRoot`. It reflects where the
 * app itself is installed, independent of where extensions live. Earlier releases bundled ICP
 * under it, which is where they cached the auto-detected path:
 *   <install-root>/resources/app              ← env.appRoot
 *   <install-root>/components/icp/bin/icp.sh  ← cached by earlier releases
 *
 * On macOS the install root is the .app bundle's Contents folder:
 *   <...>/WSO2 Integrator.app/Contents/Resources/app
 *
 * Returns `undefined` where the editor has no application root folder (e.g. on the web).
 */
function getAppInstallRoot(): string | undefined {
    return env.appRoot ? path.resolve(env.appRoot, '..', '..') : undefined;
}

/**
 * Derives the ICP binary path from `WSO2_INTEGRATOR_ICP_HOME`.
 * The WSO2 Integrator launcher sets it when the product is installed or upgraded with the
 * update tool, which may relocate the ICP component outside the install root (e.g. under
 * the user's data folder), where the scans below would never find it.
 *
 * The variable points at the ICP component directory itself, not the install root:
 *   $WSO2_INTEGRATOR_ICP_HOME              = <install-root>/components/icp (or relocated)
 *   $WSO2_INTEGRATOR_ICP_HOME/bin/icp.sh   ← what we want
 */
function getPathFromEnv(): string | undefined {
    const icpHome = process.env[ICP_HOME_ENV];
    if (!icpHome) {
        return undefined;
    }

    const candidatePath = path.join(icpHome, 'bin', getICPScriptName());
    if (existsSync(candidatePath)) {
        return candidatePath;
    }

    log(`${ICP_HOME_ENV} is set but no ICP script was found at ${candidatePath}; ignoring it.`);
    return undefined;
}

/**
 * True when the path is inside the running WSO2 Integrator app's install root.
 * Only meaningful inside WSO2 Integrator, so it is always false in plain VS Code.
 */
function isInsideWIApp(icpPath: string): boolean {
    const installRoot = isWIRuntime() ? getAppInstallRoot() : undefined;
    if (!installRoot) {
        return false;
    }

    const relative = path.relative(installRoot, path.resolve(icpPath));
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Default base directories where WSO2 Integrator is installed per OS.
 * Used as the fallback when `WSO2_INTEGRATOR_ICP_HOME` is not set or not valid
 * (e.g., standalone VS Code with WSO2 Integrator installed separately).
 */
const BASE_DIRS: Record<string, string[]> = {
    linux: ['/usr/share'],
    darwin: ['/Applications', path.join(homedir(), 'Applications')],
    win32: [
        path.join(process.env.APPDATA || '', 'WSO2', 'Integrator'),
        path.join(process.env.LOCALAPPDATA || '', 'WSO2', 'Integrator'),
        path.join(process.env.PROGRAMFILES || '', 'WSO2', 'Integrator'),
    ],
};

/**
 * Auto-detects the ICP binary without consulting settings: the launcher-provided
 * `WSO2_INTEGRATOR_ICP_HOME` (the default ICP inside WSO2 Integrator), then the well-known
 * install directories per OS.
 */
export function detectICPPath(): string | undefined {
    return getPathFromEnv() ?? scanDefaultInstallDirs();
}

function scanDefaultInstallDirs(): string | undefined {
    const script = getICPScriptName();
    const baseDirs = BASE_DIRS[process.platform];
    if (!baseDirs) {
        return undefined;
    }

    for (const baseDir of baseDirs) {
        if (!existsSync(baseDir)) {
            continue;
        }

        // Direct check: baseDir/components/icp/bin/icp.sh
        const directPath = path.join(baseDir, ICP_BIN_RELATIVE, script);
        if (existsSync(directPath)) {
            return directPath;
        }

        // Search for matching directories within baseDir
        try {
            const entries = readdirSync(baseDir);
            for (const entry of entries) {
                // Match wso2-integrator* directories (Linux/Windows)
                if (entry.startsWith('wso2-integrator')) {
                    const candidatePath = path.join(baseDir, entry, ICP_BIN_RELATIVE, script);
                    if (existsSync(candidatePath)) {
                        return candidatePath;
                    }
                }

                // Match WSO2 Integrator*.app bundles (macOS)
                if (entry.startsWith('WSO2 Integrator') && entry.endsWith('.app')) {
                    const candidatePath = path.join(baseDir, entry, 'Contents', ICP_BIN_RELATIVE, script);
                    if (existsSync(candidatePath)) {
                        return candidatePath;
                    }
                }
            }
        } catch {
            // Permission denied or other error, skip this base dir
        }
    }

    return undefined;
}

/**
 * Resolves the ICP executable path.
 * 1. Drops a `ballerina.icpPath` value inside the running WSO2 Integrator app (one-time cleanup,
 *    see `dropICPPathsInsideWIApp`).
 * 2. Uses the remaining `ballerina.icpPath` setting if it exists on disk.
 * 3. If the setting points at a missing file, tells the user and offers to fall back to the
 *    default ICP (inside WSO2 Integrator) or to auto-detect (in plain VS Code). Either choice
 *    clears the setting in every scope, so no other configured value takes over.
 * 4. Auto-detects via `WSO2_INTEGRATOR_ICP_HOME`, then the well-known install directories.
 *    Detected paths are not persisted, so an upgraded or relocated install is picked up on
 *    the next call.
 * 5. If nothing is found, notifies the user.
 *
 * @returns The resolved ICP path, or `undefined` if not found.
 */
export async function resolveICPPath(): Promise<string | undefined> {
    const config = workspace.getConfiguration('ballerina');

    // 1. One-time cleanup of paths cached inside the app by earlier versions.
    const scopes = await dropICPPathsInsideWIApp(config);
    const configuredPath = scopes[0]?.value;

    // 2. A configured path wins while it exists on disk.
    if (configuredPath && existsSync(configuredPath)) {
        return configuredPath;
    }

    // 3. Configured path is missing — tell the user and offer the default instead.
    if (configuredPath) {
        const useDefault = isWIRuntime() ? 'Use Default ICP' : 'Auto Detect';
        const action = await window.showErrorMessage(
            `ICP binary not found at the configured path: ${configuredPath}. The product may have been moved, uninstalled, or upgraded.`,
            useDefault,
            'Open Settings'
        );

        if (action === 'Open Settings') {
            openICPSettings();
            return undefined;
        }

        if (action !== useDefault) {
            return undefined;
        }

        // The user chose the default over any configured path: clear every scope, so a value
        // in another scope (e.g. user settings under a workspace value) doesn't take over.
        for (const scope of scopes) {
            await clearICPPathSetting(config, scope.target);
        }
    }

    // 4. Auto-detect silently.
    return detectICPPath() ?? notifyICPNotFound();
}

interface ConfiguredICPPath {
    target: ConfigurationTarget;
    value: string;
}

/**
 * Reads `ballerina.icpPath` per scope, the effective one first (workspace before user).
 */
function getConfiguredICPPaths(config: WorkspaceConfiguration): ConfiguredICPPath[] {
    const inspected = config.inspect<string>('icpPath');
    if (!inspected) {
        const value = config.get<string>('icpPath');
        return value ? [{ target: ConfigurationTarget.Global, value }] : [];
    }

    const scopes: ConfiguredICPPath[] = [];
    if (inspected.workspaceValue) {
        scopes.push({ target: ConfigurationTarget.Workspace, value: inspected.workspaceValue });
    }
    if (inspected.globalValue) {
        scopes.push({ target: ConfigurationTarget.Global, value: inspected.globalValue });
    }
    return scopes;
}

/**
 * One-time cleanup: earlier versions wrote the auto-detected ICP path into `ballerina.icpPath`.
 * Inside WSO2 Integrator that path is inside the app, which the update tool replaces, so the
 * cached value goes stale and shadows the ICP the launcher now points at. Drop such values in
 * every scope so detection takes over. Paths outside the app are the user's choice and are kept.
 *
 * TODO: Remove once releases that cached the path are no longer in use.
 *
 * @returns The values left in effect, effective scope first.
 */
async function dropICPPathsInsideWIApp(config: WorkspaceConfiguration): Promise<ConfiguredICPPath[]> {
    const remaining: ConfiguredICPPath[] = [];
    for (const scope of getConfiguredICPPaths(config)) {
        if (isInsideWIApp(scope.value)) {
            await clearICPPathSetting(config, scope.target);
        } else {
            remaining.push(scope);
        }
    }
    return remaining;
}

/**
 * Clears `ballerina.icpPath` at the given scope. Best effort: a failed settings write is logged
 * and never blocks starting ICP, since the value is already ignored for this call.
 */
async function clearICPPathSetting(config: WorkspaceConfiguration, target: ConfigurationTarget): Promise<void> {
    try {
        await config.update('icpPath', undefined, target);
    } catch (error) {
        log(`Could not clear ${ICP_PATH}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/** 5. Nothing found — tell the user how to install ICP or point the setting at it. */
async function notifyICPNotFound(): Promise<undefined> {
    const action = await window.showErrorMessage(
        'Integration Control Plane (ICP) is not installed. Please install ICP or set the path manually in settings.',
        'Download ICP',
        'Set Path'
    );
    if (action === 'Download ICP') {
        env.openExternal(Uri.parse('https://wso2.com/products/downloads/?product=wso2integrator&package=icp'));
    } else if (action === 'Set Path') {
        openICPSettings();
    }
    return undefined;
}

function openICPSettings(): void {
    commands.executeCommand('workbench.action.openSettings', ICP_PATH);
}
