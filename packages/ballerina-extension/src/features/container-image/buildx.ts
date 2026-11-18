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

// Shared by the hosted-agent image builds (Microsoft Foundry, Amazon Bedrock AgentCore): each scaffolds its own
// Dockerfile, then runs `bal build` and a single-platform `docker buildx build` through these helpers.

import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { parse } from "@iarna/toml";
import { ShellExecution, Task, TaskExecution, TaskPanelKind, TaskScope, tasks } from "vscode";

/** The `[package]` fields an image build reads from Ballerina.toml. */
export interface BallerinaPackageInfo {
    /** `[package] name`; `bal build` writes `target/bin/<name>.jar`. */
    name: string;
    /** `[package] version`, used as the default image tag. */
    version?: string;
}

export function readBallerinaPackage(projectPath: string): BallerinaPackageInfo {
    const tomlPath = path.join(projectPath, "Ballerina.toml");
    if (!fs.existsSync(tomlPath)) {
        throw new Error(`No Ballerina.toml found in ${projectPath}.`);
    }
    const pkg = (parse(fs.readFileSync(tomlPath, "utf-8")) as { package?: { name?: string; version?: string } }).package;
    if (!pkg?.name) {
        throw new Error("Ballerina.toml has no [package] name.");
    }
    return { name: pkg.name, version: pkg.version };
}

/** Runs a shell task and resolves with its exit code once the process ends. */
export async function runShellTask(name: string, command: string, cwd: string): Promise<number | undefined> {
    const task = new Task({ type: "shell", task: name }, TaskScope.Workspace, name, "ballerina", new ShellExecution(command, {
        cwd,
        env: process.env as { [key: string]: string },
    }));
    // Every step shares one panel and starts it clean, so the terminal shows only the current build.
    task.presentationOptions = { panel: TaskPanelKind.Shared, clear: true };
    let execution: TaskExecution | undefined;
    let resolveEnded: (exitCode: number | undefined) => void;
    const ended = new Promise<number | undefined>((resolve) => (resolveEnded = resolve));
    const listener = tasks.onDidEndTaskProcess((event) => {
        if (event.execution === execution) {
            listener.dispose();
            resolveEnded(event.exitCode);
        }
    });
    try {
        execution = await tasks.executeTask(task);
    } catch (error) {
        listener.dispose();
        throw error;
    }
    return ended;
}

/**
 * Resolves with an error message when Docker Buildx cannot be run. It ships with Docker Desktop and Rancher Desktop,
 * but on Linux the Docker Engine packages install it as a separate `docker-buildx-plugin`.
 *
 * @param purpose what Buildx is needed for, e.g. "the linux/amd64 image Foundry runs"
 */
export function buildxError(purpose: string): Promise<string | undefined> {
    return new Promise((resolve) => {
        execFile("docker", ["buildx", "version"], { timeout: 30_000, env: process.env }, (error, _stdout, stderr) => {
            if (!error) {
                resolve(undefined);
            } else if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                resolve("Docker was not found. Install Docker and make sure the docker command is on the PATH.");
            } else {
                resolve(`Docker Buildx is needed to build ${purpose}. Install Docker ` +
                    "Desktop, or on Linux the docker-buildx-plugin package." + (stderr ? ` (${stderr.trim()})` : ""));
            }
        });
    });
}

/** Removes a directory left empty by a scaffold, such as `otel/` once its generated tracing files are gone. */
export function removeIfEmpty(dir: string): void {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
    }
}
