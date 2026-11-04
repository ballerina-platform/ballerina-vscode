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

// The three functions the pre-flight JDK gate decides on. Real directories, not an fs mock.

// server.ts reaches an ESM-only transitive dep through src/utils; stub the edges it does not need.
jest.mock('../utils', () => ({ isWindows: () => false }));
jest.mock('../utils/config', () => ({
    isSupportedSLVersion: () => true,
    createVersionNumber: () => 0,
    isWSL: () => false,
}));
jest.mock('../core', () => ({}));
jest.mock('vscode-languageclient/node', () => ({}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    REQUIRED_JDK_MAJOR_VERSION,
    findHighestVersionJdk,
    getJdkMajorVersion,
    resolveLanguageServerJdkDir,
} from '../utils/server/server';

let root: string;

/** A JDK directory, optionally with a `release` file carrying the given JAVA_VERSION line. */
function makeJdk(name: string, javaVersionLine?: string): string {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    if (javaVersionLine !== undefined) {
        fs.writeFileSync(path.join(dir, 'release'), `${javaVersionLine}\nOS_ARCH="aarch64"\n`);
    }
    return dir;
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-jdk-'));
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe('getJdkMajorVersion', () => {
    it('reads the major version out of the release file', () => {
        expect(getJdkMajorVersion(makeJdk('jdk', 'JAVA_VERSION="25.0.3"'))).toBe(25);
    });

    it('accepts an unquoted JAVA_VERSION', () => {
        expect(getJdkMajorVersion(makeJdk('jdk', 'JAVA_VERSION=21.0.5'))).toBe(21);
    });

    it('prefers the release file over the directory name', () => {
        expect(getJdkMajorVersion(makeJdk('jdk-21.0.5+11-jre', 'JAVA_VERSION="25.0.3"'))).toBe(25);
    });

    it('falls back to the directory name when there is no release file', () => {
        expect(getJdkMajorVersion(makeJdk('jdk-25.0.3+9-jre'))).toBe(25);
    });

    it('returns null when neither source gives a version', () => {
        expect(getJdkMajorVersion(makeJdk('some-jre'))).toBeNull();
    });

    it('returns null for a directory that does not exist', () => {
        expect(getJdkMajorVersion(path.join(root, 'absent'))).toBeNull();
    });

    it('returns null rather than guessing from a malformed release file', () => {
        expect(getJdkMajorVersion(makeJdk('jre', 'JAVA_VERSION="not-a-number"'))).toBeNull();
    });
});

describe('the version boundary the gate enforces', () => {
    it('requires Java 25', () => {
        expect(REQUIRED_JDK_MAJOR_VERSION).toBe(25);
    });

    it('blocks the JRE a pre-2201.14.0 distribution ships', () => {
        const major = getJdkMajorVersion(makeJdk('jdk-21.0.5+11-jre', 'JAVA_VERSION="21.0.5"'));
        expect(major).not.toBeNull();
        expect(major! >= REQUIRED_JDK_MAJOR_VERSION).toBe(false);
    });

    it('blocks Java 24, one short of the requirement', () => {
        const major = getJdkMajorVersion(makeJdk('jdk-24.0.1+9-jre', 'JAVA_VERSION="24.0.1"'));
        expect(major! >= REQUIRED_JDK_MAJOR_VERSION).toBe(false);
    });

    it('proceeds on the JRE 2201.14.0 ships', () => {
        const major = getJdkMajorVersion(makeJdk('jdk-25.0.3+9-jre', 'JAVA_VERSION="25.0.3"'));
        expect(major! >= REQUIRED_JDK_MAJOR_VERSION).toBe(true);
    });

    it('proceeds on a JRE newer than the requirement', () => {
        const major = getJdkMajorVersion(makeJdk('jdk-26+1-jre', 'JAVA_VERSION="26"'));
        expect(major! >= REQUIRED_JDK_MAJOR_VERSION).toBe(true);
    });
});

describe('findHighestVersionJdk', () => {
    it('picks the highest version present, not the first listed', () => {
        makeJdk('jdk-21.0.5+11-jre');
        makeJdk('jdk-25.0.3+9-jre');
        makeJdk('jdk-17.0.9+8-jre');
        expect(path.basename(findHighestVersionJdk(root)!)).toBe('jdk-25.0.3+9-jre');
    });

    it('returns null for a directory that does not exist', () => {
        expect(findHighestVersionJdk(path.join(root, 'absent'))).toBeNull();
    });
});

describe('resolveLanguageServerJdkDir', () => {
    /** A distribution laid out as the installers produce it. */
    function makeDistribution(version: string, jdkName: string | null): string {
        const home = path.join(root, 'Ballerina');
        fs.mkdirSync(path.join(home, 'distributions', `ballerina-${version}`), { recursive: true });
        if (jdkName) {
            const jdk = path.join(home, 'dependencies', jdkName);
            fs.mkdirSync(jdk, { recursive: true });
            fs.writeFileSync(path.join(jdk, 'release'), 'JAVA_VERSION="25.0.3"\n');
        }
        return path.join(home, 'distributions', `ballerina-${version}`);
    }

    it('truncates the home at "distributions" to find the sibling dependencies dir', () => {
        const ballerinaHome = makeDistribution('2201.14.0', 'jdk-25.0.3+9-jre');
        const resolved = resolveLanguageServerJdkDir(
            { getBallerinaHome: () => ballerinaHome } as never);
        expect(resolved).not.toBeNull();
        expect(path.basename(resolved!)).toBe('jdk-25.0.3+9-jre');
        expect(getJdkMajorVersion(resolved!)).toBe(25);
    });

    it('returns null when no home is configured, so the caller can fail open', () => {
        expect(resolveLanguageServerJdkDir({ getBallerinaHome: () => undefined } as never)).toBeNull();
    });
});
