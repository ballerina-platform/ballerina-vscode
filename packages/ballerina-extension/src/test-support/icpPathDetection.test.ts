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
 */

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
const originalIcpHome = process.env.WSO2_INTEGRATOR_ICP_HOME;

let tmpDir: string;
let installPath: string;
let homePath: string;
let icpPathSetting: string | undefined;
let savedSettings: unknown[];
let errors: string[];

function createIcp(dir: string): string {
    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
    const script = path.join(dir, 'bin', SCRIPT);
    fs.writeFileSync(script, '');
    return script;
}

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icp-path-'));
    const installRoot = path.join(tmpDir, 'install');
    installPath = createIcp(path.join(installRoot, 'components', 'icp'));
    const icpHome = path.join(tmpDir, 'home', 'icp');
    homePath = createIcp(icpHome);
    process.env.WSO2_INTEGRATOR_ICP_HOME = icpHome;

    icpPathSetting = undefined;
    savedSettings = [];
    errors = [];
    jest.spyOn(vscode.workspace, 'getConfiguration').mockImplementation((() => ({
        get: (key: string) => (key === 'icpPath' ? icpPathSetting : undefined),
        update: (_key: string, value: unknown) => {
            savedSettings.push(value);
            return Promise.resolve();
        },
    })) as unknown as typeof vscode.workspace.getConfiguration);
    jest.spyOn(vscode.extensions, 'getExtension').mockImplementation(((id: string) => ({
        id,
        extensionPath: path.join(installRoot, 'resources', 'app', 'extensions', id),
    })) as unknown as typeof vscode.extensions.getExtension);
    jest.spyOn(vscode.window, 'showErrorMessage').mockImplementation((message?: string) => {
        errors.push(message);
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
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('resolveICPPath', () => {
    it('uses WSO2_INTEGRATOR_ICP_HOME when icpPath is not set', async () => {
        expect(await resolveICPPath()).toBe(homePath);
        expect(savedSettings).toHaveLength(0);
    });

    it('uses WSO2_INTEGRATOR_ICP_HOME when icpPath is the install directory ICP', async () => {
        icpPathSetting = installPath;
        expect(await resolveICPPath()).toBe(homePath);
    });

    it('uses WSO2_INTEGRATOR_ICP_HOME when icpPath does not exist', async () => {
        icpPathSetting = path.join(tmpDir, 'missing', 'bin', SCRIPT);
        expect(await resolveICPPath()).toBe(homePath);
        expect(errors).toHaveLength(0);
    });

    it('uses icpPath when it points to another ICP', async () => {
        icpPathSetting = createIcp(path.join(tmpDir, 'custom-icp'));
        expect(await resolveICPPath()).toBe(icpPathSetting);
    });

    it('uses icpPath when WSO2_INTEGRATOR_ICP_HOME has no ICP script', async () => {
        process.env.WSO2_INTEGRATOR_ICP_HOME = path.join(tmpDir, 'empty');
        icpPathSetting = installPath;
        expect(await resolveICPPath()).toBe(installPath);
    });

    it('uses icpPath when WSO2_INTEGRATOR_ICP_HOME is not set', async () => {
        delete process.env.WSO2_INTEGRATOR_ICP_HOME;
        icpPathSetting = installPath;
        expect(await resolveICPPath()).toBe(installPath);
    });
});
