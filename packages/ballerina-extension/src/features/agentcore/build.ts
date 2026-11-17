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
import * as path from "path";
import { window } from "vscode";
import { imageReferenceError } from "@wso2/ballerina-core";
import { buildxError, readBallerinaPackage, removeIfEmpty, runShellTask } from "../container-image/buildx";
import {
    AGENTCORE_EXECUTABLE_FILES,
    AGENTCORE_GENERATED_MARKER,
    AGENTCORE_PLATFORM,
    AGENTCORE_TRACING_FILES,
    AgentCoreBuildOptions,
    AgentCorePackage,
    agentCoreDockerFiles,
    agentCoreImageBuildCommand,
    agentCoreNames,
} from "./templates";

export interface AgentCoreScaffold {
    /** Generated files written by this build. */
    written: string[];
    /** Files the user owns (no generated marker), left as they are. */
    kept: string[];
    /** Generated tracing files removed because this build has tracing off. */
    removed: string[];
}

/** The image a build produces unless the user names another. */
export function defaultAgentCoreImageReference(projectPath: string): string {
    return agentCoreNames(readBallerinaPackage(projectPath)).imageReference;
}

function isGenerated(filePath: string): boolean {
    return fs.readFileSync(filePath, "utf-8").includes(AGENTCORE_GENERATED_MARKER);
}

/**
 * Writes the AgentCore Docker scaffolding into the package for the chosen tracing mode. A file that still carries
 * the generated marker is rewritten, and a generated tracing file is removed when tracing is off; a file without
 * the marker, such as a Dockerfile the user tuned, is never touched.
 */
export function scaffoldAgentCoreDocker(projectPath: string, options: AgentCoreBuildOptions,
    pkg: AgentCorePackage = readBallerinaPackage(projectPath)): AgentCoreScaffold {
    const result: AgentCoreScaffold = { written: [], kept: [], removed: [] };
    const files = agentCoreDockerFiles(pkg, options);
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(projectPath, relativePath);
        if (fs.existsSync(filePath) && !isGenerated(filePath)) {
            result.kept.push(relativePath);
            continue;
        }
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
        if (AGENTCORE_EXECUTABLE_FILES.includes(relativePath)) {
            fs.chmodSync(filePath, 0o755);
        }
        result.written.push(relativePath);
    }
    for (const relativePath of AGENTCORE_TRACING_FILES.filter((file) => !(file in files))) {
        const filePath = path.join(projectPath, relativePath);
        if (fs.existsSync(filePath) && isGenerated(filePath)) {
            fs.rmSync(filePath);
            result.removed.push(relativePath);
        }
    }
    removeIfEmpty(path.join(projectPath, "otel"));
    return result;
}

/**
 * Builds an Amazon Bedrock AgentCore Runtime image for the package: scaffolds the Dockerfile (and, with tracing,
 * the OpenTelemetry Collector files), builds the jar, then builds a linux/arm64 image.
 */
export async function buildAgentCoreImage(projectPath: string, balCmd: string, imageReference: string,
    options: AgentCoreBuildOptions): Promise<void> {
    const invalid = imageReferenceError(imageReference);
    if (invalid) {
        throw new Error(`Invalid image name "${imageReference}". ${invalid}`);
    }
    const missingBuildx = await buildxError(`the ${AGENTCORE_PLATFORM} image AgentCore Runtime runs`);
    if (missingBuildx) {
        window.showErrorMessage(missingBuildx);
        return;
    }
    const scaffold = scaffoldAgentCoreDocker(projectPath, options);
    if (scaffold.kept.length > 0) {
        window.showInformationMessage(`Kept existing ${scaffold.kept.join(", ")}. Delete a file to generate it again.`);
    }

    // The tracer is only linked into the jar when observability is included in the build.
    const balBuild = options.tracing ? `${balCmd} build --observability-included` : `${balCmd} build`;
    const buildExit = await runShellTask("Ballerina Build", balBuild, projectPath);
    if (buildExit !== 0) {
        window.showErrorMessage("Ballerina build failed; the AgentCore image was not built.");
        return;
    }
    const dockerExit = await runShellTask("AgentCore Image Build", agentCoreImageBuildCommand(imageReference), projectPath);
    if (dockerExit !== 0) {
        window.showErrorMessage("Docker image build failed. See the terminal for details.");
        return;
    }
    window.showInformationMessage(`Built ${imageReference}.`);
}
