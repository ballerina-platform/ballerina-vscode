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

/**
 * @jest-environment node
 *
 * Under WSO2 Integrator, ICP must run from the copy the product seeds into the user's data
 * folder (WSO2_INTEGRATOR_ICP_HOME), not from the install tree, where H2 may only be able to
 * open its database read-only (wso2/product-integrator#1711). Real directories, not an fs mock.
 */

// The full @wso2/ballerina-core barrel drags in ESM LS-connection code jest can't transform;
// detect.ts only needs isSamePath, which lives in an import-free module.
jest.mock('@wso2/ballerina-core', () => ({
    isSamePath: jest.requireActual('../../../ballerina-core/src/utils/path-utils').isSamePath,
}));
jest.mock('../utils/config', () => ({ WI_EXTENSION_ID: 'wso2.wso2-integrator' }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolveICPPath } from '../features/icp/detect';

const SCRIPT = process.platform === 'win32' ? 'icp.bat' : 'icp.sh';

let root: string;
let installRoot: string;
let bundledPath: string;
let seededHome: string;
let seededPath: string;
let configuredPath: string | undefined;
let settingWrites: unknown[];
let errorsShown: string[];
const originalIcpHome = process.env.WSO2_INTEGRATOR_ICP_HOME;

/** An ICP distribution at `home`, returning its launcher path. */
function makeIcp(home: string): string {
    fs.mkdirSync(path.join(home, 'bin'), { recursive: true });
    const script = path.join(home, 'bin', SCRIPT);
    fs.writeFileSync(script, '');
    return script;
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'icp-path-'));
    installRoot = path.join(root, 'install');
    bundledPath = makeIcp(path.join(installRoot, 'components', 'icp'));
    seededHome = path.join(root, 'home', '.wso2-integrator', 'components', 'icp', '2.1.0');
    seededPath = makeIcp(seededHome);
    process.env.WSO2_INTEGRATOR_ICP_HOME = seededHome;

    configuredPath = undefined;
    settingWrites = [];
    errorsShown = [];
    jest.spyOn(vscode.workspace, 'getConfiguration').mockImplementation((() => ({
        get: (key: string) => (key === 'icpPath' ? configuredPath : undefined),
        update: (_key: string, value: unknown) => {
            settingWrites.push(value);
            return Promise.resolve();
        },
    })) as unknown as typeof vscode.workspace.getConfiguration);
    jest.spyOn(vscode.extensions, 'getExtension').mockImplementation(((id: string) => ({
        id,
        extensionPath: path.join(installRoot, 'resources', 'app', 'extensions', id),
    })) as unknown as typeof vscode.extensions.getExtension);
    jest.spyOn(vscode.window, 'showErrorMessage').mockImplementation((message?: string) => {
        errorsShown.push(message);
        return Promise.resolve(undefined);
    });
});

afterEach(() => {
    jest.restoreAllMocks();
    if (originalIcpHome === undefined) {
        delete process.env.WSO2_INTEGRATOR_ICP_HOME;
    } else {
        process.env.WSO2_INTEGRATOR_ICP_HOME = originalIcpHome;
    }
    fs.rmSync(root, { recursive: true, force: true });
});

describe('resolveICPPath under WSO2 Integrator', () => {
    it('runs the seeded copy when no path is configured, without persisting it', async () => {
        expect(await resolveICPPath()).toBe(seededPath);
        expect(settingWrites).toHaveLength(0);
    });

    it('runs the seeded copy over the install-tree path an earlier version persisted', async () => {
        configuredPath = bundledPath;
        expect(await resolveICPPath()).toBe(seededPath);
    });

    it('runs the seeded copy when the configured path no longer exists', async () => {
        configuredPath = path.join(root, 'removed', 'bin', SCRIPT);
        expect(await resolveICPPath()).toBe(seededPath);
        expect(errorsShown).toHaveLength(0);
    });

    it('keeps a path the user pointed at another ICP', async () => {
        configuredPath = makeIcp(path.join(root, 'custom-icp'));
        expect(await resolveICPPath()).toBe(configuredPath);
    });

    it('falls back to the configured path when WSO2_INTEGRATOR_ICP_HOME has no launcher', async () => {
        process.env.WSO2_INTEGRATOR_ICP_HOME = path.join(root, 'empty');
        configuredPath = bundledPath;
        expect(await resolveICPPath()).toBe(bundledPath);
    });
});

describe('resolveICPPath outside WSO2 Integrator', () => {
    it('keeps using the configured path when WSO2_INTEGRATOR_ICP_HOME is not set', async () => {
        delete process.env.WSO2_INTEGRATOR_ICP_HOME;
        configuredPath = bundledPath;
        expect(await resolveICPPath()).toBe(bundledPath);
    });
});
