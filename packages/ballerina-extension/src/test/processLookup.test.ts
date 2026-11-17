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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ChildProcess, spawn, spawnSync } from "child_process";
import { loadFixtures } from "@wso2/test-config/fixtures";

jest.mock("../utils", () => ({ debug: jest.fn() }));

import { findRunningBallerinaProcesses } from "../features/tryit/utils";

interface ProcessLookupFixture {
    description: string;
    folderNames: { name: string; skipOn?: string[] }[];
}

const LISTENER = "require('net').createServer().listen(0, () => console.log('ready')); setTimeout(() => process.exit(), 20000);";

function startFakeService(projectDir: string): Promise<ChildProcess> {
    const child = spawn(process.execPath, ["-e", LISTENER, "--", `-XX:HeapDumpPath=${projectDir}`]);
    return new Promise((resolve) => child.stdout.once("data", () => resolve(child)));
}

// Matched processes need a listening port, which the lookup reads with lsof outside Windows.
const canListPorts = process.platform === "win32" || !spawnSync("lsof", ["-v"]).error;

const cases = loadFixtures<ProcessLookupFixture>(__dirname, "fixtures", "process-lookup")
    .flatMap(f => f.data.folderNames.map(n => [f.name, n.name, n.skipOn ?? []] as [string, string, string[]]))
    .filter(([, , skipOn]) => !skipOn.includes(process.platform));

describe("findRunningBallerinaProcesses — folder names", () => {
    const originalCwd = process.cwd();
    let workDir: string;

    beforeAll(() => {
        workDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "process-lookup-")));
        process.chdir(workDir);
    });

    afterAll(() => {
        process.chdir(originalCwd);
        fs.rmSync(workDir, { recursive: true, force: true });
    });

    it("has cases to run", () => {
        expect(cases.length).toBeGreaterThan(0);
    });

    it.each(cases)("%s: %s", async (_fixture, folderName) => {
        const projectDir = path.join(workDir, folderName);
        fs.mkdirSync(projectDir);
        const service = await startFakeService(projectDir);
        try {
            const processes = await findRunningBallerinaProcesses(projectDir);
            if (canListPorts) {
                expect(processes.map(p => p.pid)).toEqual([String(service.pid)]);
            }
            expect(fs.existsSync(path.join(workDir, "INJECTED"))).toBe(false);
        } finally {
            service.kill();
        }
    }, 30000);
});
