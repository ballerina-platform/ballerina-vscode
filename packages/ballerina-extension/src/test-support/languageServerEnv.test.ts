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

// The environment the bundled language server's `java` is spawned with. A DYLD_LIBRARY_PATH
// holding <jdk-21>/lib/server made the bundled JRE 25 run a Java 21 VM, which then rejected the
// class-file-69 server jar while the extension's own log reported Java 25.

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
import { Executable } from 'vscode-languageclient/node';
import { BallerinaExtension } from '../core';
import { JVM_OVERRIDING_ENV_VARS, getJavaLanguageServerEnv, getServerOptions } from '../utils/server/server';

let root: string;
let savedEnv: NodeJS.ProcessEnv;

/** A distribution with a bundled JRE, plus the extension's `ls/` jar: enough for the java launch path. */
function makeExtension(): BallerinaExtension {
    const home = path.join(root, 'ballerina-runtime');
    fs.mkdirSync(path.join(home, 'dependencies', 'jdk-25.0.3+9-jre', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(root, 'ls'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ls', 'ballerina-language-server-6.0.0.jar'), '');
    return {
        getBallerinaHome: () => home,
        useDistributionLanguageServer: () => false,
        getConfiguredLangServerPath: () => '',
        enableLSDebug: () => false,
        context: { asAbsolutePath: (relative: string) => path.join(root, relative) },
    } as unknown as BallerinaExtension;
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-env-'));
    savedEnv = { ...process.env };
});

afterEach(() => {
    process.env = savedEnv;
    fs.rmSync(root, { recursive: true, force: true });
});

describe('bundled language server environment', () => {
    it('drops every JVM-overriding variable from the java spawn', () => {
        for (const name of JVM_OVERRIDING_ENV_VARS) {
            process.env[name] = '/Users/someone/jdk-21.0.2.jdk/Contents/Home/lib/server';
        }

        const options = getServerOptions(makeExtension()) as Executable;

        expect(options.command).toBe(path.join(root, 'ballerina-runtime', 'dependencies', 'jdk-25.0.3+9-jre', 'bin', 'java'));
        for (const name of JVM_OVERRIDING_ENV_VARS) {
            expect(options.options.env).not.toHaveProperty(name);
        }
    });

    it('keeps the rest of the environment', () => {
        process.env.DYLD_LIBRARY_PATH = '/Users/someone/jdk-21.0.2.jdk/Contents/Home/lib/server';
        process.env.JAVA_HOME = '/Users/someone/jdk-21.0.2.jdk/Contents/Home';
        process.env.BALLERINA_HOME = '/Users/someone/ballerina';

        const env = (getServerOptions(makeExtension()) as Executable).options.env;

        expect(env.JAVA_HOME).toBe(process.env.JAVA_HOME);
        expect(env.BALLERINA_HOME).toBe(process.env.BALLERINA_HOME);
        expect(env.PATH).toBe(process.env.PATH);
    });

    it('leaves the extension host environment untouched', () => {
        const hostEnv = { DYLD_LIBRARY_PATH: '/jdk-21/lib/server', HOME: '/Users/someone' };

        const serverEnv = getJavaLanguageServerEnv(hostEnv);

        expect(serverEnv).toEqual({ HOME: '/Users/someone' });
        expect(hostEnv.DYLD_LIBRARY_PATH).toBe('/jdk-21/lib/server');
    });
});
