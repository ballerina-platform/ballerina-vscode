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
import { isSamePath } from '@wso2/ballerina-core';
import { workspace, window, commands, extensions, ConfigurationTarget, env, Uri } from 'vscode';
import { ICP_PATH } from '../../core/preferences';
import { WI_EXTENSION_ID } from '../../utils/config';

const ICP_BIN_RELATIVE = 'components/icp/bin';
const ICP_SCRIPT_UNIX = 'icp.sh';
const ICP_SCRIPT_WIN = 'icp.bat';

/**
 * WSO2 Integrator copies ICP to a writable location in the user's home
 * (~/.wso2-integrator/components/icp/<version>) and sets WSO2_INTEGRATOR_ICP_HOME to it.
 * The ICP inside the install directory may be read-only, which breaks the H2 database.
 */
function getPathFromIntegratorEnv(): string | undefined {
    const icpHome = process.env.WSO2_INTEGRATOR_ICP_HOME;
    if (!icpHome) {
        return undefined;
    }

    const script = process.platform === 'win32' ? ICP_SCRIPT_WIN : ICP_SCRIPT_UNIX;
    const candidatePath = path.join(icpHome, 'bin', script);
    if (existsSync(candidatePath)) {
        return candidatePath;
    }

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
    const candidatePath = getBundledICPPath();
    if (candidatePath && existsSync(candidatePath)) {
        return candidatePath;
    }

    return undefined;
}

function getBundledICPPath(): string | undefined {
    const wiExt = extensions.getExtension(WI_EXTENSION_ID);
    if (!wiExt) {
        return undefined;
    }

    const script = process.platform === 'win32' ? ICP_SCRIPT_WIN : ICP_SCRIPT_UNIX;

    // Walk up from extensionPath to the installation root.
    // extensionPath is typically: <install-root>/resources/app/extensions/<ext-id>
    // We need to go up 4 levels to reach <install-root>.
    let dir = wiExt.extensionPath;
    for (let i = 0; i < 4; i++) {
        dir = path.dirname(dir);
    }

    return path.join(dir, ICP_BIN_RELATIVE, script);
}

// Older versions saved the auto-detected install directory path to settings.
function isBundledICPPath(configuredPath: string): boolean {
    const bundledPath = getBundledICPPath();
    return !!bundledPath && isSamePath(configuredPath, bundledPath);
}

/**
 * Default base directories where WSO2 Integrator is installed per OS.
 * Used as a fallback when the ICP path cannot be derived from the running
 * WSO2 Integrator extension (e.g., standalone VS Code with ICP installed separately).
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

function getDefaultPath(): string | undefined {
    // Try to derive path from the running WSO2 Integrator extension first
    const wiPath = getPathFromWIExtension();
    if (wiPath) {
        return wiPath;
    }

    // Fallback: scan well-known install directories
    const script = process.platform === 'win32' ? ICP_SCRIPT_WIN : ICP_SCRIPT_UNIX;
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
 * 1. Uses WSO2_INTEGRATOR_ICP_HOME, unless `ballerina.icpPath` points to another ICP
 * 2. Checks the `ballerina.icpPath` setting
 * 3. Falls back to OS-specific default locations
 * 4. If auto-detected, persists the path to settings
 * 5. If not found, notifies the user
 *
 * @returns The resolved ICP path, or `undefined` if not found.
 */
export async function resolveICPPath(): Promise<string | undefined> {
    const config = workspace.getConfiguration('ballerina');
    const configuredPath = config.get<string>('icpPath');

    // Not saved to settings since the path changes when ICP is updated.
    const integratorPath = getPathFromIntegratorEnv();
    if (integratorPath && (!configuredPath || !existsSync(configuredPath) || isBundledICPPath(configuredPath))) {
        return integratorPath;
    }

    // 1. Use the configured path if it still exists on disk.
    if (configuredPath && existsSync(configuredPath)) {
        return configuredPath;
    }

    // 2. Configured path is stale — ask the user to re-detect or open settings.
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

        const detected = getDefaultPath();
        if (detected && existsSync(detected)) {
            await config.update('icpPath', detected, ConfigurationTarget.Global);
            return detected;
        }
        // Fall through to the "not installed" prompt below.
    } else {
        // 3. No configured path — auto-detect silently.
        const detected = getDefaultPath();
        if (detected && existsSync(detected)) {
            await config.update('icpPath', detected, ConfigurationTarget.Global);
            return detected;
        }
    }

    // 4. Not found — notify user.
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
