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

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { defaultCachePath } from '@vscode/test-electron/out/download';
import { TestOptions } from '@vscode/test-electron/out/runTest';
import { killTree } from '@vscode/test-electron/out/util';
import * as cp from 'child_process';
import * as path from 'path';
const packageJson = require('../../../package.json')

/**
 * Run VS Code extension test
 *
 * @returns The exit code of the command to launch VS Code extension test
 */
export async function runTests(options: TestOptions): Promise<number> {
	if (!options.vscodeExecutablePath) {
		options.vscodeExecutablePath = await downloadAndUnzipVSCode();
		const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(options.vscodeExecutablePath)
		if (packageJson.extensionDependencies && packageJson.extensionDependencies.length > 0) {
			console.log(`Installing ${packageJson.extensionDependencies.length} extension dependencies...`);
			for (const extensionId of packageJson.extensionDependencies) {
				console.log(`Installing extension: ${extensionId}`);
				// Install into the same extensions dir the test instance is launched with
				// (see getProfileArguments), so the dependency is visible at activation time
				cp.spawnSync(cli, [...args, '--extensions-dir', path.join(defaultCachePath, 'extensions'),
					'--install-extension', extensionId], {
					encoding: 'utf-8',
					stdio: 'inherit',
				})
			}
			console.log('Extension dependencies installed successfully');
		} else {
			console.log('No extension dependencies found in package.json');
		}
	}
	if (!options.vscodeExecutablePath) {
		options.vscodeExecutablePath = await downloadAndUnzipVSCode(options);
	}

	let args = [
		// https://github.com/microsoft/vscode/issues/84238
		'--no-sandbox',
		// https://github.com/microsoft/vscode-test/issues/221
		'--disable-gpu-sandbox',
		// https://github.com/microsoft/vscode-test/issues/120
		'--disable-updates',
		'--skip-welcome',
		'--skip-release-notes',
		'--disable-workspace-trust',
		'--extensionTestsPath=' + options.extensionTestsPath,
	];

	if (Array.isArray(options.extensionDevelopmentPath)) {
		args.push(...options.extensionDevelopmentPath.map((devPath) => `--extensionDevelopmentPath=${devPath}`));
	} else {
		args.push(`--extensionDevelopmentPath=${options.extensionDevelopmentPath}`);
	}

	if (options.launchArgs) {
		args = options.launchArgs.concat(args);
	}

	if (!options.reuseMachineInstall) {
		args.push(...getProfileArguments(args));
	}

	return innerRunTests(options.vscodeExecutablePath, args, options.extensionTestsEnv);
}

/** Adds the extensions and user data dir to the arguments for the VS Code CLI */
export function getProfileArguments(args: readonly string[]) {
	const out: string[] = [];
	if (!hasArg('extensions-dir', args)) {
		out.push(`--extensions-dir=${path.join(defaultCachePath, 'extensions')}`);
	}

	if (!hasArg('user-data-dir', args)) {
		out.push(`--user-data-dir=${path.join('/tmp', 'vscode-user-data')}`);
		// out.push(`--user-data-dir=${path.join(defaultCachePath, 'user-data')}`);
	}

	return out;
}

function hasArg(argName: string, argList: readonly string[]) {
	return argList.some(a => a === `--${argName}` || a.startsWith(`--${argName}=`));
}

const SIGINT = 'SIGINT';

async function innerRunTests(
	executable: string,
	args: string[],
	testRunnerEnv?: {
		[key: string]: string | undefined;
	}
): Promise<number> {
	const fullEnv = Object.assign({}, process.env, testRunnerEnv);
	const shell = process.platform === 'win32';
	const cmd = cp.spawn(shell ? `"${executable}"` : executable, args, { env: fullEnv, shell });

	let exitRequested = false;
	const ctrlc1 = () => {
		process.removeListener(SIGINT, ctrlc1);
		process.on(SIGINT, ctrlc2);
		console.log('Closing VS Code gracefully. Press Ctrl+C to force close.');
		exitRequested = true;
		cmd.kill(SIGINT); // this should cause the returned promise to resolve
	};

	const ctrlc2 = () => {
		console.log('Closing VS Code forcefully.');
		process.removeListener(SIGINT, ctrlc2);
		exitRequested = true;
		killTree(cmd.pid!, true);
	};

	const prom = new Promise<number>((resolve, reject) => {
		if (cmd.pid) {
			process.on(SIGINT, ctrlc1);
		}

		cmd.stdout.on('data', (d) => process.stdout.write(d));
		cmd.stderr.on('data', (d) => process.stderr.write(d));

		cmd.on('error', function (data) {
			console.log('Test error: ' + data.toString());
		});

		let finished = false;
		function onProcessClosed(code: number | null, signal: NodeJS.Signals | null): void {
			if (finished) {
				return;
			}
			finished = true;
			console.log(`Exit code:   ${code ?? signal}`);

			// fix: on windows, it seems like these descriptors can linger for an
			// indeterminate amount of time, causing the process to hang.
			cmd.stdout.destroy();
			cmd.stderr.destroy();

			if (code !== 0) {
				reject(new TestRunFailedError(code ?? undefined, signal ?? undefined));
			} else {
				resolve(0);
			}
		}

		cmd.on('close', onProcessClosed);
		cmd.on('exit', onProcessClosed);
	});

	let code: number;
	try {
		code = await prom;
	} finally {
		process.removeListener(SIGINT, ctrlc1);
		process.removeListener(SIGINT, ctrlc2);
	}

	// exit immediately if we handled a SIGINT and no one else did
	if (exitRequested && process.listenerCount(SIGINT) === 0) {
		process.exit(1);
	}

	return code;
}

export class TestRunFailedError extends Error {
	constructor(public readonly code: number | undefined, public readonly signal: string | undefined) {
		super(signal ? `Test run terminated with signal ${signal}` : `Test run failed with code ${code}`);
	}
}
