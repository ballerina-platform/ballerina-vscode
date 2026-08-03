/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { runTests } from './lib/index';
const dotenv = require('dotenv');
const { createEnvDefinePlugin } = require('../../../../common/scripts/env-webpack-helper');

async function go() {
	try {
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');
		const extensionTestsPath = path.resolve(__dirname, '.');

		const envPath = path.resolve(__dirname, '../../.env');
		const env = dotenv.config({ path: envPath }).parsed;
		console.log("Fetching values for environment variables...");
		const { envKeys, missingVars } = createEnvDefinePlugin(env);
		if (missingVars.length > 0) {
			console.warn(
				'\n⚠️  Environment Variable Configuration Warning:\n' +
				`Missing required environment variables: ${missingVars.join(', ')}\n` +
				`Please provide values in either .env file or runtime environment.\n`
			);
		}

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			extensionTestsEnv: {
				...envKeys,
				AI_TEST_ENV: 'true'
			}
		});
	} catch (err) {
		process.exit(1);
	}
}

go();
