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
import { imageReferenceError } from "@wso2/ballerina-core";

import {
    ACR_PLACEHOLDER,
    FOUNDRY_GENERATED_MARKER,
    FOUNDRY_PLATFORM,
    FOUNDRY_PORT,
    FOUNDRY_TRACING_FILES,
    FoundryPackage,
    FoundryShell,
    foundryDockerFiles,
    foundryImageBuildCommand,
    foundryNames,
    foundryPushCommand,
    foundryShell,
} from "../features/foundry/templates";
import { scaffoldFoundryDocker } from "../features/foundry/build";

// The full @wso2/ballerina-core barrel drags in ESM LS-connection code jest can't transform, so stand in the one
// module the Foundry build uses.
jest.mock("@wso2/ballerina-core", () => jest.requireActual("@wso2/ballerina-core/lib/utils/image-reference-utils"));

const PACKAGES: FoundryPackage[] = [
    { name: "hr_agent", version: "0.1.0" },
    { name: "Orders.Agent", version: "2.3.4" },
    { name: "agent" },
];

const copiedSources = (dockerfile: string) =>
    [...dockerfile.matchAll(/^COPY (?!--from)(\S+)/gm)].map((match) => match[1]);

describe("Foundry Docker templates", () => {
    describe.each(PACKAGES)("package $name", (pkg) => {
        const names = foundryNames(pkg);

        it("names the image in Docker's lowercase, hyphenated form", () => {
            expect(names.imageName).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
            expect(names.imageReference).toBe(`${names.imageName}:${pkg.version ?? "latest"}`);
            expect(imageReferenceError(names.imageReference)).toBeUndefined();
        });

        describe.each([true, false])("with tracing %s", (tracing) => {
            const files = foundryDockerFiles(pkg, { tracing });

            it("copies and runs the jar that bal build writes", () => {
                expect(files["Dockerfile"]).toContain(`COPY target/bin/${pkg.name}.jar /app/${pkg.name}.jar`);
                expect(files[".dockerignore"]).toContain(`!target/bin/${pkg.name}.jar`);
                expect(files[tracing ? "start.sh" : "Dockerfile"]).toContain(tracing
                    ? `exec java -jar /app/${pkg.name}.jar`
                    : `ENTRYPOINT ["java", "-jar", "/app/${pkg.name}.jar"]`);
            });

            it("ships every file the Dockerfile copies, and lets each through .dockerignore", () => {
                for (const source of copiedSources(files["Dockerfile"]).filter((source) => !source.startsWith("target/"))) {
                    expect(files[source]).toBeDefined();
                    expect(files[".dockerignore"]).toMatch(new RegExp(`^!(${source}|${path.dirname(source)}/)$`, "m"));
                }
            });

            it("marks every file as generated, so a later build can rewrite it", () => {
                for (const content of Object.values(files)) {
                    expect(content).toContain(FOUNDRY_GENERATED_MARKER);
                }
            });

            it("exposes the Foundry port", () => {
                expect(files["Dockerfile"]).toContain(`EXPOSE ${FOUNDRY_PORT}`);
            });

            // A RUN in the stage that becomes the image would execute amd64 code, which an arm64 machine
            // (Apple silicon, Windows or Linux on ARM) can only do under emulation.
            it("builds the runtime stage without running anything for the target platform", () => {
                const stages = files["Dockerfile"].split(/^FROM /m).slice(1);
                expect(stages[stages.length - 1]).not.toMatch(/^RUN /m);
                for (const stage of stages.slice(0, -1)) {
                    expect(stage.startsWith("--platform=$BUILDPLATFORM ")).toBe(true);
                }
            });

            it("shows the build command it is built with", () => {
                expect(files["Dockerfile"]).toContain(`#   ${foundryImageBuildCommand("<image>")}`);
            });
        });

        it("leaves the collector and tracing config out of an image without tracing", () => {
            const files = foundryDockerFiles(pkg, { tracing: false });
            for (const tracingFile of FOUNDRY_TRACING_FILES) {
                expect(files[tracingFile]).toBeUndefined();
            }
            expect(files["Dockerfile"]).not.toMatch(/otel|BAL_CONFIG_FILES|start\.sh/);
            expect(files[".dockerignore"]).not.toMatch(/otel|start\.sh/);
        });

        it("sends traces to the collector's OTLP receiver under the image name", () => {
            const files = foundryDockerFiles(pkg, { tracing: true });
            expect(files["Dockerfile"]).toContain("ENV BAL_CONFIG_FILES=/app/tracing.toml");
            const tracingToml = parse(files["otel/tracing.toml"]) as any;
            expect(tracingToml.ballerina.observe).toEqual({ tracingEnabled: true, tracingProvider: "otel" });
            expect(tracingToml.ballerina.otel.tracesResourceAttributes["service.name"]).toBe(names.serviceName);
            const endpoint = new URL(tracingToml.ballerina.otel.tracesEndpoint).host;
            expect(files["otel/collector.yaml"]).toContain(`endpoint: ${endpoint}`);
        });

        it("keeps the collector config's env reference for the shell, not the template", () => {
            const files = foundryDockerFiles(pkg, { tracing: true });
            expect(files["otel/collector.yaml"]).toContain("connection_string: ${env:APPLICATIONINSIGHTS_CONNECTION_STRING}");
            expect(files["Dockerfile"]).toContain("FROM --platform=$BUILDPLATFORM");
        });

        it("keeps the shebang on the first line of start.sh", () => {
            expect(foundryDockerFiles(pkg, { tracing: true })["start.sh"].startsWith("#!/bin/sh\n")).toBe(true);
        });

        it("runs start.sh through sh, so it starts even without the executable bit", () => {
            expect(foundryDockerFiles(pkg, { tracing: true })["Dockerfile"])
                .toContain(`ENTRYPOINT ["/bin/sh", "/app/start.sh"]`);
        });

        it("writes every file with LF line endings, which sh needs", () => {
            for (const content of Object.values(foundryDockerFiles(pkg, { tracing: true }))) {
                expect(content).not.toContain("\r");
            }
        });
    });
});

describe("imageReferenceError", () => {
    it.each(["hr-agent", "hr-agent:0.1.0", "team/hr_agent:v2", "acme.azurecr.io/hr-agent:latest"])("accepts %s", (ref) => {
        expect(imageReferenceError(ref)).toBeUndefined();
    });

    it.each(["", "HR-Agent", "hr agent", "-agent", "agent:", "agent:-1", "agent:a:b"])("rejects %p", (ref) => {
        expect(imageReferenceError(ref)).toBeDefined();
    });
});

describe("foundryImageBuildCommand", () => {
    const command = foundryImageBuildCommand("hr-agent:0.1.0");

    it("builds a single-platform linux/amd64 image into the local store", () => {
        expect(FOUNDRY_PLATFORM).toBe("linux/amd64");
        expect(command).toMatch(/^docker buildx build /);
        expect(command).toContain(`--platform ${FOUNDRY_PLATFORM}`);
        expect(command).toContain("--load");
        expect(command).toContain("--provenance=false");
        expect(command).toMatch(/ -t hr-agent:0\.1\.0 \.$/);
    });

    // The same line runs in sh, PowerShell and cmd, so it carries nothing any of them would expand or split.
    it("has nothing a shell would treat specially", () => {
        expect(command).toMatch(/^[\w ./:=-]+$/);
    });
});

describe("foundryPushCommand", () => {
    const image = "hr-agent:0.1.0";

    it.each<FoundryShell>(["posix", "powershell", "cmd"])("is one %s line that signs in, tags and pushes into the registry", (shell) => {
        const command = foundryPushCommand(image, shell);
        expect(command).not.toContain("\n");
        expect(command).toContain(ACR_PLACEHOLDER);
        expect(command).toMatch(/az acr login --name/);
        expect(command).toMatch(new RegExp(`docker tag ${image} \\S*\\.azurecr\\.io/${image}`));
        expect(command).toMatch(new RegExp(`docker push \\S*\\.azurecr\\.io/${image}`));
        // Each step runs only once the one before it has succeeded.
        expect(command.indexOf("az acr login")).toBeLessThan(command.indexOf("docker tag"));
        expect(command.indexOf("docker tag")).toBeLessThan(command.indexOf("docker push"));
    });

    it("asks for the registry name once where the shell can hold it in a variable", () => {
        for (const shell of ["posix", "powershell"] as FoundryShell[]) {
            expect(foundryPushCommand(image, shell).split(ACR_PLACEHOLDER)).toHaveLength(2);
        }
    });

    it.each([
        ["/bin/zsh", "posix"],
        ["/usr/bin/bash", "posix"],
        [undefined, "posix"],
        ["C:\\Program Files\\PowerShell\\7\\pwsh.exe", "powershell"],
        ["C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "powershell"],
        ["C:\\Windows\\System32\\cmd.exe", "cmd"],
    ])("treats %s as %s", (shellPath, shell) => {
        expect(foundryShell(shellPath)).toBe(shell);
    });
});

describe("scaffoldFoundryDocker", () => {
    let projectPath: string;
    const exists = (relativePath: string) => fs.existsSync(path.join(projectPath, relativePath));

    beforeEach(() => {
        projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "foundry-docker-"));
        fs.writeFileSync(path.join(projectPath, "Ballerina.toml"), `[package]\norg = "acme"\nname = "hr_agent"\nversion = "0.1.0"\n`);
    });

    afterEach(() => fs.rmSync(projectPath, { recursive: true, force: true }));

    it("writes every file and makes start.sh executable, without touching Ballerina.toml", () => {
        const toml = fs.readFileSync(path.join(projectPath, "Ballerina.toml"), "utf-8");
        const result = scaffoldFoundryDocker(projectPath, { tracing: true });

        expect(result.kept).toEqual([]);
        expect(result.written.sort()).toEqual(Object.keys(foundryDockerFiles({ name: "hr_agent" }, { tracing: true })).sort());
        if (process.platform !== "win32") {
            expect(fs.statSync(path.join(projectPath, "start.sh")).mode & 0o111).not.toBe(0);
        }
        expect(fs.readFileSync(path.join(projectPath, "Ballerina.toml"), "utf-8")).toBe(toml);
    });

    it("removes the generated tracing files when tracing is turned off, and brings them back when it is on", () => {
        scaffoldFoundryDocker(projectPath, { tracing: true });

        const off = scaffoldFoundryDocker(projectPath, { tracing: false });
        expect(off.removed.sort()).toEqual([...FOUNDRY_TRACING_FILES].sort());
        expect(exists("otel")).toBe(false);
        expect(fs.readFileSync(path.join(projectPath, "Dockerfile"), "utf-8")).not.toContain("otelcol");

        scaffoldFoundryDocker(projectPath, { tracing: true });
        expect(FOUNDRY_TRACING_FILES.every(exists)).toBe(true);
        expect(fs.readFileSync(path.join(projectPath, "Dockerfile"), "utf-8")).toContain("otelcol");
    });

    it("keeps files the user owns, and never removes them", () => {
        fs.writeFileSync(path.join(projectPath, "Dockerfile"), "FROM custom\n");
        fs.writeFileSync(path.join(projectPath, "start.sh"), "#!/bin/sh\necho mine\n");

        const result = scaffoldFoundryDocker(projectPath, { tracing: false });

        expect(result.kept).toEqual(["Dockerfile"]);
        expect(result.removed).toEqual([]);
        expect(fs.readFileSync(path.join(projectPath, "Dockerfile"), "utf-8")).toBe("FROM custom\n");
        expect(exists("start.sh")).toBe(true);
    });

    it("leaves an otel directory that holds the user's own files", () => {
        scaffoldFoundryDocker(projectPath, { tracing: true });
        fs.writeFileSync(path.join(projectPath, "otel", "notes.md"), "mine\n");

        scaffoldFoundryDocker(projectPath, { tracing: false });

        expect(exists("otel/notes.md")).toBe(true);
    });
});
