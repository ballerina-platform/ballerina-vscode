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

import { loadFixtures } from "@wso2/test-config/fixtures";

jest.mock("os", () => ({ ...jest.requireActual("os"), platform: () => "darwin" }));
jest.mock("../utils", () => ({ debug: jest.fn() }));

const shell = { ownProcesses: [] as PortConflictFixture["ownProcesses"], listeners: [] as string[], fail: false };

jest.mock("child_process", () => ({
    exec: (_cmd: string, cb: (error: Error | null, stdout: string) => void) =>
        cb(null, shell.ownProcesses.map(p => `java ${p.pid} java -XX:HeapDumpPath=/project`).join("\n")),
    execSync: (cmd: string) => {
        const pid = cmd.match(/-p (\d+)/)?.[1];
        if (pid) {
            const own = shell.ownProcesses.find(p => p.pid === pid);
            return [`p${pid}`, ...(own?.ports ?? []).map(port => `n*:${port}`)].join("\n");
        }
        if (shell.fail) {
            throw new Error("lsof: command not found");
        }
        return shell.listeners.join("\n");
    },
}));

import { getPortConflictMessage } from "../features/tryit/utils";

interface PortConflictFixture {
    description: string;
    port: number;
    ownProcesses: { pid: string; ports: number[] }[];
    listeners: string[];
    expectedPids: string[];
}

const fixtures = loadFixtures<PortConflictFixture>(__dirname, "fixtures", "port-conflict");

describe("getPortConflictMessage — fixtures", () => {
    beforeEach(() => { shell.fail = false; });

    it("has fixtures to run", () => {
        expect(fixtures.length).toBeGreaterThan(0);
    });

    it.each(fixtures.map((f) => [f.name, f.data] as [string, PortConflictFixture]))("%s", async (_name, fx) => {
        shell.ownProcesses = fx.ownProcesses;
        shell.listeners = fx.listeners;
        const message = await getPortConflictMessage(`/project-${_name}`, fx.port);
        if (fx.expectedPids.length === 0) {
            expect(message).toBeUndefined();
        } else {
            expect(message).toContain(`Port ${fx.port}`);
            expect(message).toContain(`PID ${fx.expectedPids.join(", ")})`);
        }
    });

    it("returns undefined when the listener query fails", async () => {
        shell.ownProcesses = [];
        shell.fail = true;
        expect(await getPortConflictMessage("/project-failing", 9090)).toBeUndefined();
    });
});
