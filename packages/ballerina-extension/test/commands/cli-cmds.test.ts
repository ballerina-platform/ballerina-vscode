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

import * as fs from "fs";
import * as rimraf from "rimraf";
import * as path from 'path';
import axios from "axios";
import { expect } from "chai";
import { BallerinaProject } from "@wso2/ballerina-core";
import { runCommand, BALLERINA_COMMANDS } from '../../src/features/project/cmds/cmd-runner';
import { TracerMachine } from '../../src/features/tracing';
import { getBallerinaHome, killPort } from '../test-util';
import { wait } from "../../ui-test/util";
import { PROJECT_RUN_TIME } from "../../ui-test/constants";

const PROJECT_ROOT = path.join(__dirname, '..', '..', '..', 'test', 'data');
const HELLO_PACKAGE_TARGET_PATH = path.join(PROJECT_ROOT, 'helloPackage', 'target');
const HELLO_SERVICE_TARGET_PATH = path.join(PROJECT_ROOT, 'helloServicePackage', 'target');
const JAR_FILE_PATH = path.join(PROJECT_ROOT, 'hello_world.jar');
const BALLERINA_CMD = path.join(getBallerinaHome(), 'bin', 'bal');

suite("Ballerina Extension CLI Command Tests", () => {
    // runCommand comes from a separate copy of the module, not the running extension,
    // so its TracerMachine has to be started here.
    suiteSetup(() => {
        TracerMachine.initialize();
    });

    setup(done => {
        if (fs.existsSync(HELLO_PACKAGE_TARGET_PATH)) {
            rimraf.sync(HELLO_PACKAGE_TARGET_PATH);
        }
        if (fs.existsSync(HELLO_SERVICE_TARGET_PATH)) {
            rimraf.sync(HELLO_SERVICE_TARGET_PATH);
        }
        if (fs.existsSync(JAR_FILE_PATH)) {
            rimraf.sync(JAR_FILE_PATH);
        }
        done();
    });

    test("Test Doc - Ballerina project", done => {
        const projectPath = path.join(PROJECT_ROOT, 'helloPackage');
        const balProject: BallerinaProject = {
            path: projectPath,
            version: '0.0.1',
            packageName: 'helloproject',
            kind: 'BUILD_PROJECT'
        };
        let changeCount = 0;
        fs.watch(projectPath, () => {
            changeCount++;
            if (changeCount === 1) {
                fs.unwatchFile(projectPath);
                done();
            }
        });
        runCommand(balProject, BALLERINA_CMD, BALLERINA_COMMANDS.DOC, projectPath);
    });

    test("Test Build - Ballerina project", done => {
        const projectPath = path.join(PROJECT_ROOT, 'helloServicePackage');
        const balProject: BallerinaProject = {
            path: projectPath,
            version: '0.0.1',
            packageName: 'helloserviceproject',
            kind: 'BUILD_PROJECT'
        };

        let changeCount = 0;
        fs.watch(projectPath, () => {
            changeCount++;
            if (changeCount === 1) {
                fs.unwatchFile(projectPath);
                done();
            }
        });
        runCommand(balProject, BALLERINA_CMD, BALLERINA_COMMANDS.BUILD, projectPath);
    });

    test("Test Build - Single file", done => {
        const filePath = path.join(PROJECT_ROOT, 'hello_world.bal');
        let changeCount = 0;
        fs.watch(PROJECT_ROOT, () => {
            changeCount++;
            if (changeCount === 1) {
                fs.unwatchFile(PROJECT_ROOT);
                done();
            }
        });
        runCommand(PROJECT_ROOT, BALLERINA_CMD, BALLERINA_COMMANDS.BUILD, filePath);
    });

    test("Test Run - Ballerina project", async () => {
        const projectPath = path.join(PROJECT_ROOT, 'helloService9093Package');
        const balProject: BallerinaProject = {
            path: projectPath,
            version: '0.0.1',
            packageName: 'helloservice9093project',
            kind: 'BUILD_PROJECT'
        };

        runCommand(balProject, BALLERINA_CMD, BALLERINA_COMMANDS.RUN, projectPath);
        await wait(PROJECT_RUN_TIME)
        const response = await axios.get('http://0.0.0.0:9093/hello/sayHello')
        expect(response.data).to.eql("Hello, World!");
        killPort(9093);
    });

    test("Test Run - Single file", async () => {
        const filePath = path.join(PROJECT_ROOT, 'hello_world_service_9092.bal');
        runCommand(PROJECT_ROOT, BALLERINA_CMD, BALLERINA_COMMANDS.RUN, filePath);
        await wait(PROJECT_RUN_TIME)
        const response = await axios.get('http://0.0.0.0:9092/hello/sayHello');
        expect(response.data).to.eql("Hello, World!");
        killPort(9092);
    });

    test("Test Run - Ballerina project", async () => {
        const projectPath = path.join(PROJECT_ROOT, 'helloService9093Package');
        const balProject: BallerinaProject = {
            path: projectPath,
            version: '0.0.1',
            packageName: 'helloservice9093project',
            kind: 'BUILD_PROJECT'
        };

        runCommand(balProject, BALLERINA_CMD, BALLERINA_COMMANDS.RUN_WITH_WATCH, projectPath);
        await wait(PROJECT_RUN_TIME)
        const response = await axios.get('http://0.0.0.0:9093/hello/sayHello')
        expect(response.data).to.eql("Hello, World!");
        killPort(9093);
    });

    test("Test Run - Single file", async () => {
        const filePath = path.join(PROJECT_ROOT, 'hello_world_service_9092.bal');
        runCommand(PROJECT_ROOT, BALLERINA_CMD, BALLERINA_COMMANDS.RUN_WITH_WATCH, filePath);
        await wait(PROJECT_RUN_TIME)
        const response = await axios.get('http://0.0.0.0:9092/hello/sayHello');
        expect(response.data).to.eql("Hello, World!");
        killPort(9092);
    });
});
