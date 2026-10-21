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
import { workspace, window, commands, extensions, ConfigurationTarget, env, Uri, WorkspaceConfiguration } from 'vscode';
import { ICP_PATH } from '../../core/preferences';
import { WI_EXTENSION_ID } from '../../utils/config';
import { log } from '../../utils/logger';

const ICP_BIN_RELATIVE = 'components/icp/bin';
const ICP_SCRIPT_UNIX = 'icp.sh';
const ICP_SCRIPT_WIN = 'icp.bat';
export const ICP_HOME_ENV = 'WSO2_INTEGRATOR_ICP_HOME';

function getICPScriptName(): string {
    return process.platform === 'win32' ? ICP_SCRIPT_WIN : ICP_SCRIPT_UNIX;
}

/**
 * True when the path points at the ICP bundled inside a WSO2 Integrator install
 * (`<install-root>/components/icp/bin/icp.sh`). Earlier versions wrote auto-detected paths of
 * this shape to `ballerina.icpPath`, so such a value is product-managed rather than a user choice.
 */
function isBundledICPPath(icpPath: string): boolean {
    const bundledSuffix = path.join(ICP_BIN_RELATIVE, getICPScriptName()).toLowerCase();
    return path.normalize(icpPath).toLowerCase().endsWith(bundledSuffix);
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
 * Derives the ICP binary path from the WSO2 Integrator extension's install location.
 * When running inside WSO2 Integrator, the extension is bundled within the installation,
 * so we can walk up from its extensionPath to find the ICP binary — regardless of where
 * the user installed the product.
 *
 * Expected layout:
 *   <install-root>/resources/app/extensions/<ext-id>/  ← extensionPath
 *   <install-root>/components/icp/bin/icp.sh           ← what we want
 *
 * On macOS the install root is inside the .app bundle:
 *   <...>/WSO2 Integrator.app/Contents/resources/app/extensions/<ext-id>/
 *   <...>/WSO2 Integrator.app/Contents/components/icp/bin/icp.sh
 */
function getPathFromWIExtension(): string | undefined {
    const wiExt = extensions.getExtension(WI_EXTENSION_ID);
    if (!wiExt) {
        return undefined;
    }

    const script = getICPScriptName();

    // Walk up from extensionPath to the installation root.
    // extensionPath is typically: <install-root>/resources/app/extensions/<ext-id>
    // We need to go up 4 levels to reach <install-root>.
    let dir = wiExt.extensionPath;
    for (let i = 0; i < 4; i++) {
        dir = path.dirname(dir);
    }

    const candidatePath = path.join(dir, ICP_BIN_RELATIVE, script);
    if (existsSync(candidatePath)) {
        return candidatePath;
    }

    return undefined;
}

/**
 * Default base directories where WSO2 Integrator is installed per OS.
 * Used as the last fallback when neither `WSO2_INTEGRATOR_ICP_HOME` nor the running
 * WSO2 Integrator extension yields the path (e.g., standalone VS Code with ICP installed separately).
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
 * Auto-detects the ICP binary without consulting settings, most specific source first:
 * the launcher-provided `WSO2_INTEGRATOR_ICP_HOME`, then the running WSO2 Integrator
 * extension's install location, then the well-known install directories per OS.
 */
export function detectICPPath(): string | undefined {
    return getPathFromEnv() ?? getPathFromWIExtension() ?? scanDefaultInstallDirs();
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
 * 1. Clears a `ballerina.icpPath` value that points at the ICP bundled with a WSO2 Integrator
 *    install: earlier versions cached auto-detected paths there, and they go stale on upgrade.
 * 2. Uses the remaining `ballerina.icpPath` setting if it still exists on disk.
 * 3. If the setting is stale, asks the user to re-detect or open settings. Re-detecting
 *    clears the stale value so later calls auto-detect silently.
 * 4. Auto-detects via `WSO2_INTEGRATOR_ICP_HOME`, the running WSO2 Integrator extension's
 *    install location, then the well-known install directories. Detected paths are not
 *    persisted, so an upgraded or relocated install is picked up on the next call.
 * 5. If nothing is found, notifies the user.
 *
 * @returns The resolved ICP path, or `undefined` if not found.
 */
export async function resolveICPPath(): Promise<string | undefined> {
    const config = workspace.getConfiguration('ballerina');
    let configuredPath = config.get<string>('icpPath');

    // 1. A path inside a WSO2 Integrator install was written by our own auto-detection, not the
    //    user. Drop it and detect afresh so the current install wins over the cached one.
    if (configuredPath && isBundledICPPath(configuredPath)) {
        await clearICPPathSetting(config);
        configuredPath = undefined;
    }

    // 2. An explicitly configured path wins while it exists on disk.
    if (configuredPath && existsSync(configuredPath)) {
        return configuredPath;
    }

    // 3. Configured path is stale — ask the user to re-detect or open settings.
    if (configuredPath) {
        const action = await window.showErrorMessage(
            `ICP binary not found at the configured path: ${configuredPath}. The product may have been moved, uninstalled, or upgraded.`,
            'Auto Detect',
            'Open Settings'
        );

        if (action === 'Open Settings') {
            openICPSettings();
            return undefined;
        }

        if (action !== 'Auto Detect') {
            return undefined;
        }

        // The user opted out of the stale value: drop it so future calls auto-detect without prompting.
        await clearICPPathSetting(config);
    }

    // 4. Auto-detect silently.
    const detected = detectICPPath();
    if (detected) {
        return detected;
    }

    // 5. Not found — notify user.
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

/**
 * Clears `ballerina.icpPath` at the scope that supplies its effective value. Clearing only the
 * global value would leave a workspace-level value in place and bring the same path back next time.
 */
async function clearICPPathSetting(config: WorkspaceConfiguration): Promise<void> {
    const target = config.inspect<string>('icpPath')?.workspaceValue !== undefined
        ? ConfigurationTarget.Workspace
        : ConfigurationTarget.Global;
    await config.update('icpPath', undefined, target);
}

function openICPSettings(): void {
    commands.executeCommand('workbench.action.openSettings', ICP_PATH);
}
