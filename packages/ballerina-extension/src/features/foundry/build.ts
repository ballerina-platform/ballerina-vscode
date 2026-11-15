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

import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { parse } from "@iarna/toml";
import { env, ShellExecution, Task, TaskExecution, TaskPanelKind, TaskScope, tasks, window } from "vscode";
import { imageReferenceError } from "@wso2/ballerina-core";
import {
    ACR_PLACEHOLDER,
    FOUNDRY_EXECUTABLE_FILES,
    FOUNDRY_GENERATED_MARKER,
    FOUNDRY_PLATFORM,
    FOUNDRY_TRACING_FILES,
    FoundryBuildOptions,
    FoundryPackage,
    foundryDockerFiles,
    foundryImageBuildCommand,
    foundryNames,
    foundryPushCommand,
    foundryShell,
} from "./templates";

const PUSH_TERMINAL_NAME = "Microsoft Foundry";

export interface FoundryScaffold {
    /** Generated files written by this build. */
    written: string[];
    /** Files the user owns (no generated marker), left as they are. */
    kept: string[];
    /** Generated tracing files removed because this build has tracing off. */
    removed: string[];
}

export function readFoundryPackage(projectPath: string): FoundryPackage {
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

/** The image a build produces unless the user names another. */
export function defaultFoundryImageReference(projectPath: string): string {
    return foundryNames(readFoundryPackage(projectPath)).imageReference;
}

function isGenerated(filePath: string): boolean {
    return fs.readFileSync(filePath, "utf-8").includes(FOUNDRY_GENERATED_MARKER);
}

/**
 * Writes the Foundry Docker scaffolding into the package for the chosen tracing mode. A file that still carries
 * the generated marker is rewritten, and a generated tracing file is removed when tracing is off; a file without
 * the marker, such as a Dockerfile the user tuned, is never touched.
 */
export function scaffoldFoundryDocker(projectPath: string, options: FoundryBuildOptions,
    pkg: FoundryPackage = readFoundryPackage(projectPath)): FoundryScaffold {
    const result: FoundryScaffold = { written: [], kept: [], removed: [] };
    const files = foundryDockerFiles(pkg, options);
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(projectPath, relativePath);
        if (fs.existsSync(filePath) && !isGenerated(filePath)) {
            result.kept.push(relativePath);
            continue;
        }
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
        if (FOUNDRY_EXECUTABLE_FILES.includes(relativePath)) {
            fs.chmodSync(filePath, 0o755);
        }
        result.written.push(relativePath);
    }
    for (const relativePath of FOUNDRY_TRACING_FILES.filter((file) => !(file in files))) {
        const filePath = path.join(projectPath, relativePath);
        if (fs.existsSync(filePath) && isGenerated(filePath)) {
            fs.rmSync(filePath);
            result.removed.push(relativePath);
        }
    }
    removeIfEmpty(path.join(projectPath, "otel"));
    return result;
}

function removeIfEmpty(dir: string): void {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
    }
}

// Runs a shell task and resolves with its exit code once the process ends.
async function runTask(name: string, command: string, cwd: string): Promise<number | undefined> {
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
 */
function buildxError(): Promise<string | undefined> {
    return new Promise((resolve) => {
        execFile("docker", ["buildx", "version"], { timeout: 30_000, env: process.env }, (error, _stdout, stderr) => {
            if (!error) {
                resolve(undefined);
            } else if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                resolve("Docker was not found. Install Docker and make sure the docker command is on your PATH.");
            } else {
                resolve(`Docker Buildx is needed to build the ${FOUNDRY_PLATFORM} image Foundry runs. Install Docker ` +
                    "Desktop, or on Linux the docker-buildx-plugin package." + (stderr ? ` (${stderr.trim()})` : ""));
            }
        });
    });
}

/**
 * Opens a fresh terminal with the command that pushes the image to an Azure Container Registry typed in but not
 * run, so the user fills in the registry name and presses Enter.
 */
function offerPush(projectPath: string, imageReference: string): void {
    window.terminals.filter((terminal) => terminal.name === PUSH_TERMINAL_NAME).forEach((terminal) => terminal.dispose());
    const terminal = window.createTerminal({ name: PUSH_TERMINAL_NAME, cwd: projectPath });
    terminal.show();
    terminal.sendText(foundryPushCommand(imageReference, foundryShell(env.shell)), false);
}

/**
 * Builds a Microsoft Foundry hosted-agent image for the package: scaffolds the Dockerfile (and, with tracing,
 * the OpenTelemetry Collector files), builds the jar, builds a linux/amd64 image, then offers the command that
 * pushes it to an Azure Container Registry.
 */
export async function buildFoundryImage(projectPath: string, balCmd: string, imageReference: string,
    options: FoundryBuildOptions): Promise<void> {
    const invalid = imageReferenceError(imageReference);
    if (invalid) {
        throw new Error(`Invalid image name "${imageReference}". ${invalid}`);
    }
    const missingBuildx = await buildxError();
    if (missingBuildx) {
        window.showErrorMessage(missingBuildx);
        return;
    }
    const scaffold = scaffoldFoundryDocker(projectPath, options);
    if (scaffold.kept.length > 0) {
        window.showInformationMessage(`Using your own ${scaffold.kept.join(", ")}. ` +
            "Delete a file to have it generated again.");
    }

    // The tracer is only linked into the jar when observability is included in the build.
    const balBuild = options.tracing ? `${balCmd} build --observability-included` : `${balCmd} build`;
    const buildExit = await runTask("Ballerina Build", balBuild, projectPath);
    if (buildExit !== 0) {
        window.showErrorMessage("Ballerina build failed; the Foundry image was not built.");
        return;
    }
    const dockerExit = await runTask("Foundry Image Build", foundryImageBuildCommand(imageReference), projectPath);
    if (dockerExit !== 0) {
        window.showErrorMessage("Docker image build failed. See the terminal for details.");
        return;
    }
    offerPush(projectPath, imageReference);
    window.showInformationMessage(`Built ${imageReference}. To push it to your Azure Container Registry, replace ` +
        `${ACR_PLACEHOLDER} in the ${PUSH_TERMINAL_NAME} terminal and press Enter.`);
}
