/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
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
import * as net from "net";
import * as os from "os";
import * as path from "path";

import {
    getWorkflowRuntimeStatus,
    parseHostPort,
    probeWorkflowRuntime,
    readWorkflowRuntimeConfig,
} from "../utils/workflow-runtime";

let projectPath: string;

beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-runtime-"));
});

afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
});

function write(content: string): void {
    fs.writeFileSync(path.join(projectPath, "Config.toml"), content, "utf-8");
}

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;
    return {
        url: `127.0.0.1:${port}`,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}

describe("readWorkflowRuntimeConfig", () => {
    it("falls back to the module defaults without a Config.toml", () => {
        expect(readWorkflowRuntimeConfig(projectPath)).toEqual({ mode: "LOCAL", url: "localhost:7233" });
    });

    it("reads mode and url from the workflow table", () => {
        write('[ballerina.workflow]\nmode = "SELF_HOSTED"\nurl = "workflow.internal:7233"\n');

        expect(readWorkflowRuntimeConfig(projectPath)).toEqual({ mode: "SELF_HOSTED", url: "workflow.internal:7233" });
    });

    it("treats an unknown mode or a blank url as the default", () => {
        write('[ballerina.workflow]\nmode = "SOMEWHERE"\nurl = "  "\n');

        expect(readWorkflowRuntimeConfig(projectPath)).toEqual({ mode: "LOCAL", url: "localhost:7233" });
    });

    it("assumes the defaults when the file does not parse", () => {
        write("[ballerina.workflow\n");

        expect(readWorkflowRuntimeConfig(projectPath)).toEqual({ mode: "LOCAL", url: "localhost:7233" });
    });
});

describe("parseHostPort", () => {
    it.each([
        ["localhost:7233", { host: "localhost", port: 7233 }],
        ["grpc://temporal.example.com:7233/", { host: "temporal.example.com", port: 7233 }],
        ["[::1]:7233", { host: "::1", port: 7233 }],
    ])("parses %s", (url, expected) => {
        expect(parseHostPort(url)).toEqual(expected);
    });

    it.each(["localhost", "localhost:0", "localhost:70000", ""])("rejects %s", (url) => {
        expect(parseHostPort(url)).toBeUndefined();
    });
});

describe("probeWorkflowRuntime", () => {
    it("reports a listening port as reachable", async () => {
        const server = await listen();
        try {
            expect(await probeWorkflowRuntime(server.url)).toBe(true);
        } finally {
            await server.close();
        }
    });

    it("reports a closed port as unreachable", async () => {
        const server = await listen();
        await server.close();

        expect(await probeWorkflowRuntime(server.url)).toBe(false);
    });

    it("reports an unparsable url as unreachable", async () => {
        expect(await probeWorkflowRuntime("not a url")).toBe(false);
    });
});

describe("getWorkflowRuntimeStatus", () => {
    it("probes the configured server in LOCAL mode", async () => {
        const server = await listen();
        write(`[ballerina.workflow]\nurl = "${server.url}"\n`);
        try {
            expect(await getWorkflowRuntimeStatus(projectPath)).toEqual({ mode: "LOCAL", url: server.url, reachable: true });
        } finally {
            await server.close();
        }
    });

    it("does not probe in IN_MEMORY mode", async () => {
        write('[ballerina.workflow]\nmode = "IN_MEMORY"\n');

        expect(await getWorkflowRuntimeStatus(projectPath)).toEqual({ mode: "IN_MEMORY", url: "localhost:7233" });
    });

    it("does not probe a managed runtime", async () => {
        write('[ballerina.workflow]\nmode = "CLOUD"\nurl = "ns.account.tmprl.cloud:7233"\n');

        expect(await getWorkflowRuntimeStatus(projectPath)).toEqual({ mode: "CLOUD", url: "ns.account.tmprl.cloud:7233" });
    });
});
