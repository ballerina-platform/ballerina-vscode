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

import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    findLauncherDirOnPath,
    formatVersion,
    resolveDistributionFromFiles,
} from '../utils/ballerina-distribution';

// Lays out an installation the way the installers do: <root>/bin/bal(.bat) and <root>/distributions/<dist>.
function install(root: string, dists: Record<string, Record<string, string>>, defaultDist: string): string {
    fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(root, 'bin', 'bal.bat'), '@echo off');
    fs.writeFileSync(path.join(root, 'bin', 'bal'), '#!/bin/sh');
    const distributions = path.join(root, 'distributions');
    fs.mkdirSync(distributions, { recursive: true });
    fs.writeFileSync(path.join(distributions, 'ballerina-version'), `${defaultDist}\r\n`);
    for (const [name, props] of Object.entries(dists)) {
        const lib = path.join(distributions, name, 'bre', 'lib');
        fs.mkdirSync(lib, { recursive: true });
        fs.mkdirSync(path.join(distributions, name, 'bin'), { recursive: true });
        const jar = new AdmZip();
        const text = Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n');
        jar.addFile('META-INF/tool.properties', Buffer.from(`# tool\n${text}\n`));
        jar.writeZip(path.join(lib, `ballerina-lang-${props['ballerina.packVersion'] ?? 'x'}.jar`));
        // A jar whose name merely starts the same must not be picked.
        new AdmZip().writeZip(path.join(lib, 'ballerina-lang-spec.jar'));
    }
    return path.join(root, 'bin');
}

const props = (version: string, channel = 'Swan Lake') => ({
    'ballerina.channel': channel,
    'ballerina.version': version,
    'ballerina.packVersion': version,
    'spec.version': '2024R1',
});

describe('ballerina distribution from files', () => {
    let tmp: string;
    let userHome: string;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bal-dist-'));
        userHome = path.join(tmp, 'home');
        fs.mkdirSync(userHome);
    });

    afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

    // Same strings `bal version` prints (io.ballerina.cli.launcher.Main#printVersionInfo).
    it('formats the version like the launcher', () => {
        expect(formatVersion(props('2201.14.0'))).toBe('2201.14.0 (Swan Lake Update 14)');
        expect(formatVersion(props('2201.0.4'))).toBe('2201.0.4 (Swan Lake)');
        expect(formatVersion({ ...props('2201.15.0'), 'ballerina.packVersion': '2201.15.0-SNAPSHOT' }))
            .toBe('2201.15.0 (Swan Lake Update 15)');
        expect(formatVersion({ 'ballerina.channel': 'Swan Lake' })).toBeUndefined();
    });

    it('uses the installation default when the user has not picked a distribution', async () => {
        const bin = install(path.join(tmp, 'ballerina'), {
            'ballerina-2201.14.1': props('2201.14.1'),
        }, 'ballerina-2201.14.1');
        expect(await resolveDistributionFromFiles(bin, userHome)).toEqual({
            home: path.join(tmp, 'ballerina', 'distributions', 'ballerina-2201.14.1'),
            version: '2201.14.1 (Swan Lake Update 14)',
        });
    });

    it('follows `bal dist use` (~/.ballerina/ballerina-version) when that distribution is installed', async () => {
        const bin = install(path.join(tmp, 'ballerina'), {
            'ballerina-2201.14.0': props('2201.14.0'),
            'ballerina-2201.14.1': props('2201.14.1'),
        }, 'ballerina-2201.14.1');
        fs.mkdirSync(path.join(userHome, '.ballerina'));
        fs.writeFileSync(path.join(userHome, '.ballerina', 'ballerina-version'), 'ballerina-2201.14.0\n');
        const resolved = await resolveDistributionFromFiles(bin, userHome);
        expect(resolved?.home).toBe(path.join(tmp, 'ballerina', 'distributions', 'ballerina-2201.14.0'));
        expect(resolved?.version).toBe('2201.14.0 (Swan Lake Update 14)');
    });

    it('ignores a user choice that is not installed, like the launcher', async () => {
        const bin = install(path.join(tmp, 'ballerina'), { 'ballerina-2201.14.1': props('2201.14.1') }, 'ballerina-2201.14.1');
        fs.mkdirSync(path.join(userHome, '.ballerina'));
        fs.writeFileSync(path.join(userHome, '.ballerina', 'ballerina-version'), 'ballerina-2201.99.0');
        expect((await resolveDistributionFromFiles(bin, userHome))?.home)
            .toBe(path.join(tmp, 'ballerina', 'distributions', 'ballerina-2201.14.1'));
    });

    it("resolves a distribution's own bin (ballerina.home configured) to that distribution", async () => {
        install(path.join(tmp, 'ballerina'), { 'ballerina-2201.14.0': props('2201.14.0') }, 'ballerina-2201.14.0');
        const home = path.join(tmp, 'ballerina', 'distributions', 'ballerina-2201.14.0');
        expect(await resolveDistributionFromFiles(path.join(home, 'bin'), userHome))
            .toEqual({ home, version: '2201.14.0 (Swan Lake Update 14)' });
    });

    it('returns undefined for an unknown layout so the caller falls back to the CLI', async () => {
        const bin = path.join(tmp, 'elsewhere', 'bin');
        fs.mkdirSync(bin, { recursive: true });
        expect(await resolveDistributionFromFiles(bin, userHome)).toBeUndefined();

        const noJar = install(path.join(tmp, 'broken'), { 'ballerina-2201.14.0': props('2201.14.0') }, 'ballerina-2201.14.0');
        fs.rmSync(path.join(tmp, 'broken', 'distributions', 'ballerina-2201.14.0', 'bre', 'lib'), { recursive: true });
        fs.mkdirSync(path.join(tmp, 'broken', 'distributions', 'ballerina-2201.14.0', 'bre', 'lib'));
        expect(await resolveDistributionFromFiles(noJar, userHome)).toBeUndefined();
    });

    it('finds the launcher on the PATH and follows symlinks', () => {
        const bin = install(path.join(tmp, 'ballerina'), { 'ballerina-2201.14.0': props('2201.14.0') }, 'ballerina-2201.14.0');
        const empty = path.join(tmp, 'empty');
        fs.mkdirSync(empty);
        expect(findLauncherDirOnPath('bal.bat', [empty, bin].join(path.delimiter))).toBe(fs.realpathSync(bin));
        expect(findLauncherDirOnPath('bal.bat', empty)).toBeUndefined();

        if (process.platform !== 'win32') {
            const links = path.join(tmp, 'usr-local-bin');
            fs.mkdirSync(links);
            fs.symlinkSync(path.join(bin, 'bal'), path.join(links, 'bal'));
            expect(findLauncherDirOnPath('bal', links)).toBe(fs.realpathSync(bin));
        }
    });
});
