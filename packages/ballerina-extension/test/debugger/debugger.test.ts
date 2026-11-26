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

// The module 'assert' provides assertion methods from node
import assert = require('assert');
import tcpPortUsed = require('tcp-port-used');
import * as path from 'path';
import * as child_process from "child_process";
import * as http from 'http';

import { getBallerinaHome, isWindows } from '../test-util';
import { DebugClient } from "vscode-debugadapter-testsupport";
import { ExecutableOptions } from 'vscode-languageclient/node';

suite('Ballerina Debug Adapter', () => {

    const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');
    const DATA_ROOT = path.join(PROJECT_ROOT, 'test', 'data');
    const BALLERINA_HOME = getBallerinaHome();
    const DEBUG_PORT = 4711;

    let dc: DebugClient;
    let serverProcess: any;

    setup(async () => {
        const cwd = path.join(BALLERINA_HOME, "bin");

        let opt: ExecutableOptions = { cwd: cwd };
        opt.env = Object.assign({}, process.env);

        let cmd = '';
        let args: string[] = [];
        if (isWindows()) {
            cmd = path.join(cwd, 'bal.bat');
        } else {
            cmd = path.join(cwd, 'bal');
        }
        args.push('start-debugger-adapter');
        args.push(DEBUG_PORT.toString());
        serverProcess = child_process.spawn(cmd, args, opt);
        dc = new DebugClient("", "", 'ballerina', { cwd: PROJECT_ROOT });
        dc.defaultTimeout = 60000;

        await new Promise<void>((resolve) => {
            serverProcess.stdout.on('data', (data: any) => {
                if (data.toString().includes('Debug server started')) {
                    resolve();
                }
            });
            serverProcess.stderr.on('data', (data_1: any) => {
                console.error(`${data_1}`);
            });
        });
        return await dc.start(DEBUG_PORT);
    });

    teardown(() => {
        if (isWindows()) {
            dc.stop();
            if (serverProcess) {
                serverProcess.kill();
            }
            return Promise.resolve();
        } else {
            dc.terminateRequest({}).then(() => {
                if (serverProcess) {
                    serverProcess.kill();
                }
            });
        }
        return new Promise<void>((resolve) => {
            serverProcess.on('close', (code: any) => {
                resolve();
                console.log(`child process exited with code ${code}`);
            });
        });
    });

    suite('vscode debugger integration tests', () => {
        test('Initialize request', async () => {
            const response = await dc.initializeRequest();
            response.body = response.body || {};
            assert.equal(response.body.supportsConfigurationDoneRequest, true, 'Invalid config done rquest.');
        });

        test('launch request', async () => {
            const program = path.join(DATA_ROOT, 'hello_world.bal');
            const debuggeePort = await getAvailablePort(5005);
            const response = await dc.launch({
                script: program,
                "ballerina.home": BALLERINA_HOME,
                request: "launch",
                name: "Ballerina Debug",
                "debugServer": DEBUG_PORT,
                "debuggeePort": debuggeePort
            });

            assert.equal(response.success, true, 'Invalid response state.');
            assert.equal(response.command, 'launch', 'Invalid response command.');
        });

        test('should stop on a breakpoint, main function', async () => {
            const program = path.join(DATA_ROOT, 'hello_world.bal');
            const debuggeePort = await getAvailablePort(5006);
            const launchArgs = {
                script: program,
                "ballerina.home": BALLERINA_HOME,
                request: "launch",
                name: "Ballerina Debug",
                "debugServer": DEBUG_PORT,
                "debuggeePort": debuggeePort
            };
            return await dc.hitBreakpoint(launchArgs, { path: program, line: 5, verified: true },
                { path: `file://${program}`, line: 5, verified: true });
        });

        test('should stop on a breakpoint, hello world service', async () => {
            const program = path.join(DATA_ROOT, 'hello_world_service.bal');
            const debuggeePort = await getAvailablePort(5007);
            const launchArgs = {
                script: program,
                "ballerina.home": BALLERINA_HOME,
                request: "launch",
                name: "Ballerina Debug",
                "debugServer": DEBUG_PORT,
                "debuggeePort": debuggeePort
            };

            dc.on('output', (res) => {
                console.log(res.body.output);
                if (res.body.output.indexOf("Running executable") > -1) {
                    setInterval(function () {
                        http.get('http://0.0.0.0:9090/hello/sayHello');
                    }, 1000);
                }
            });
            return await dc.hitBreakpoint(launchArgs, { path: program, line: 10, verified: true },
                { path: `file://${program}`, line: 10, verified: true });
        });

        test('should stop on a breakpoint, hello world service - package', async () => {
            const program = path.join(DATA_ROOT, 'helloServicePackage', 'hello_service.bal');
            const debuggeePort = await getAvailablePort(5008);
            const launchArgs = {
                script: program,
                "ballerina.home": BALLERINA_HOME,
                request: "launch",
                name: "Ballerina Debug",
                "debugServer": DEBUG_PORT,
                "debuggeePort": debuggeePort
            };

            dc.on('output', (res) => {
                if (res.body.output.indexOf("Running executable") > -1) {
                    setInterval(function () {
                        http.get('http://0.0.0.0:9091/hello/sayHello');
                    }, 1000);
                }
            });
            return await dc.hitBreakpoint(launchArgs, { path: program, line: 11, verified: true },
                { path: `file://${program}`, line: 11, verified: true });
        });

        test('step In, hello world service - package', async () => {
            const program = path.join(DATA_ROOT, 'helloPackage', 'modules', 'hello', 'hello_service.bal');
            const debuggeePort = await getAvailablePort(5009);
            const launchArgs = {
                script: program,
                "ballerina.home": BALLERINA_HOME,
                request: "launch",
                name: "Ballerina Debug",
                "debugServer": DEBUG_PORT,
                "debuggeePort": debuggeePort
            };

            const location = { path: program, line: 17, column: undefined };
            return await Promise.all([
                dc.waitForEvent('initialized').then(_event => {
                    return dc.setBreakpointsRequest({
                        lines: [location.line],
                        breakpoints: [{ line: location.line, column: location.column }],
                        source: { path: location.path }
                    });
                }).then(response => {
                    const bp = response.body.breakpoints[0];
                    assert.equal(bp.verified, true, 'breakpoint verification mismatch: verified');
                    const actualLocation = {
                        column: bp.column,
                        line: bp.line,
                        path: bp.source && bp.source.path
                    };
                    if (actualLocation.path) {
                        assert.equal(actualLocation.path, location.path, 'breakpoint verification mismatch: path');
                    }
                    if (typeof actualLocation.line === 'number') {
                        assert.equal(actualLocation.line, location.line, 'breakpoint verification mismatch: line');
                    }
                    if (typeof location.column === 'number' && typeof actualLocation.column === 'number') {
                        assert.equal(actualLocation.column, location.column, 'breakpoint verification mismatch: column');
                    }
                    return dc.configurationDoneRequest();
                }),
                dc.launch(launchArgs),
                dc.waitForEvent('stopped').then(async event => {
                    assert.equal(event.body.reason, 'breakpoint', 'Invalid \'breakpoint\' stopped event.');
                    dc.stepInRequest({
                        threadId: event.body.threadId
                    });
                    const stepInEvent = await dc.waitForEvent('stopped', 25000);
                    assert.equal(stepInEvent.body.reason, "step", 'Invalid \'step\' stopped event.');
                    return await dc.stackTraceRequest({
                        threadId: stepInEvent.body.threadId,
                    });
                })
            ]);
        });
    });
});

/**
 * Returns an avaialble port
 * @param port expected port
 */
async function getAvailablePort(port: number): Promise<string> {
    const inUse = await tcpPortUsed.check(port, '127.0.0.1');
    if (inUse) {
        return getAvailablePort(port + 1);
    }
    return Promise.resolve(port.toString());
}
