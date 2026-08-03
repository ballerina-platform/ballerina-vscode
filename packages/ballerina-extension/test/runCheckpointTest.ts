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

import * as path from 'path';
import * as cp from 'child_process';
import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
const dotenv = require('dotenv');
const { createEnvDefinePlugin } = require('../../../../common/scripts/env-webpack-helper');

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './checkpoint');

        const envPath = path.resolve(__dirname, '../../.env');
        const env = dotenv.config({ path: envPath }).parsed;
        const { envKeys, missingVars } = createEnvDefinePlugin(env);

        if (missingVars.length > 0) {
            console.warn(
                '\n⚠️  Environment Variable Configuration Warning:\n' +
                `Missing required environment variables: ${missingVars.join(', ')}\n` +
                `Please provide values in either .env file or runtime environment.\n`
            );
        }

        // package.json declares extensionDependencies: ["wso2.hurl-client"], and VS Code won't
        // activate us without it — the test VS Code instance starts with no extensions installed.
        const vscodeExecutablePath = await downloadAndUnzipVSCode();
        const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
        cp.spawnSync(cli, [...cliArgs, '--install-extension', 'wso2.hurl-client'], {
            encoding: 'utf-8',
            stdio: 'inherit',
        });

        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                path.resolve(__dirname, '../../test/data/checkpoint_fixture'),
                // Unix socket paths are capped at ~104 chars; this repo's path is long enough
                // that the default .vscode-test/user-data path overflows that limit.
                '--user-data-dir=/tmp/bal-vscode-test-checkpoint'
            ],
            extensionTestsEnv: {
                ...envKeys,
                AI_TEST_ENV: 'true',
                LS_EXTENSIONS_PATH: '',
                LSDEBUG: 'false',
                WEB_VIEW_WATCH_MODE: 'false'
            }
        });

        console.log('\n✅ Checkpoint tests completed successfully!\n');
    } catch (err) {
        console.error('\n❌ Checkpoint tests failed:', err);
        process.exit(1);
    }
}

main();
