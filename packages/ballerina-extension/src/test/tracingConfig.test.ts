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
import { parse } from "@iarna/toml";

import { isTracingEnabled, removeTracingConfig, setTracingConfig } from "../features/tracing/utils";
import { OTLP_PORT } from "../features/tracing/constants";

const IDE_ENDPOINT = `http://localhost:${OTLP_PORT}/v1/traces`;

// Projects as they may exist before the user enables tracing in the IDE.
const PROJECTS: Record<string, { config?: string; ballerinaToml?: string }> = {
    "no config": {},
    "unrelated config only": {
        config: `[myorg.mypkg]\nport = 8080\n`,
        ballerinaToml: `[package]\norg = "myorg"\nname = "mypkg"\n`,
    },
    "own otel collector": {
        config: [
            `[ballerina.observe]`,
            `tracingEnabled = true`,
            `tracingProvider = "otel"`,
            ``,
            `[ballerina.otel]`,
            `tracesEndpoint = "http://collector:4318/v1/traces"`,
            `tracesProtocol = "http/protobuf"`,
            `serviceName = "orders"`,
            ``,
        ].join("\n"),
        ballerinaToml: `[build-options]\nobservabilityIncluded = true\n`,
    },
    "own metrics setup": {
        config: [
            `[ballerina.observe]`,
            `metricsEnabled = true`,
            `metricsReporter = "prometheus"`,
            `tracingEnabled = false`,
            ``,
        ].join("\n"),
    },
};

let dir: string;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tracing-config-"));
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

function writeProject(project: { config?: string; ballerinaToml?: string }): void {
    if (project.config !== undefined) {
        fs.writeFileSync(path.join(dir, "Config.toml"), project.config);
    }
    if (project.ballerinaToml !== undefined) {
        fs.writeFileSync(path.join(dir, "Ballerina.toml"), project.ballerinaToml);
    }
}

function readToml(file: string): Record<string, any> {
    const filePath = path.join(dir, file);
    return fs.existsSync(filePath) ? parse(fs.readFileSync(filePath, "utf-8")) as Record<string, any> : {};
}

describe.each(Object.entries(PROJECTS))("tracing config — %s", (_name, project) => {
    it("enabling exports traces to the IDE's trace server", async () => {
        writeProject(project);
        await setTracingConfig(dir);

        expect(isTracingEnabled(dir)).toBe(true);
        expect(readToml("Config.toml").ballerina.otel.tracesEndpoint).toBe(IDE_ENDPOINT);
        expect(readToml("Ballerina.toml")["build-options"].observabilityIncluded).toBe(true);
    });

    it("enabling then disabling leaves the project's own settings as they were", async () => {
        writeProject(project);
        const configBefore = readToml("Config.toml");
        const ballerinaTomlBefore = readToml("Ballerina.toml");

        await setTracingConfig(dir);
        await setTracingConfig(dir);
        await removeTracingConfig(dir);

        expect(readToml("Config.toml")).toEqual(configBefore);
        expect(readToml("Ballerina.toml")).toEqual(ballerinaTomlBefore);
        expect(isTracingEnabled(dir)).toBe(false);
    });
});

describe("tracing config — formatting", () => {
    it("keeps a blank line before every section header after enabling", async () => {
        writeProject(PROJECTS["own otel collector"]);
        await setTracingConfig(dir);

        const lines = fs.readFileSync(path.join(dir, "Config.toml"), "utf-8").split("\n");
        lines.forEach((line, index) => {
            if (index > 0 && line.startsWith("[")) {
                expect(lines[index - 1]).toBe("");
            }
        });
    });

    it("enabling then disabling leaves Config.toml byte-for-byte unchanged", async () => {
        const project = PROJECTS["own otel collector"];
        writeProject(project);

        await setTracingConfig(dir);
        await removeTracingConfig(dir);

        expect(fs.readFileSync(path.join(dir, "Config.toml"), "utf-8")).toBe(project.config);
    });
});

describe("tracing config — a project exporting to its own collector", () => {
    it("is not reported as traced by the IDE, and disabling leaves its exporter alone", async () => {
        const project = PROJECTS["own otel collector"];
        writeProject(project);

        expect(isTracingEnabled(dir)).toBe(false);

        await removeTracingConfig(dir);

        expect(fs.readFileSync(path.join(dir, "Config.toml"), "utf-8")).toBe(project.config);
        expect(fs.readFileSync(path.join(dir, "Ballerina.toml"), "utf-8")).toBe(project.ballerinaToml);
    });
});
