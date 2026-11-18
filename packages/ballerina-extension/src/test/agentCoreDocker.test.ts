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
    AGENTCORE_GENERATED_MARKER,
    AGENTCORE_IDENTITY_PROCESSORS,
    AGENTCORE_PLATFORM,
    AGENTCORE_PORT,
    AGENTCORE_TRACING_FILES,
    AgentCorePackage,
    agentCoreDockerFiles,
    agentCoreImageBuildCommand,
    agentCoreNames,
} from "../features/agentcore/templates";
import { defaultAgentCoreImageReference, scaffoldAgentCoreDocker } from "../features/agentcore/build";

// The full @wso2/ballerina-core barrel drags in ESM LS-connection code jest can't transform, so stand in the one
// module the AgentCore build uses.
jest.mock("@wso2/ballerina-core", () => jest.requireActual("@wso2/ballerina-core/lib/utils/image-reference-utils"));

const PACKAGES: AgentCorePackage[] = [
    { name: "hr_agent", version: "0.1.0" },
    { name: "Orders.Agent", version: "2.3.4" },
    { name: "agent" },
];

const copiedSources = (dockerfile: string) =>
    [...dockerfile.matchAll(/^COPY (?!--from)(\S+)/gm)].map((match) => match[1]);

// The pipeline's processors, as the collector reads them.
const pipelineProcessors = (collectorYaml: string) =>
    /^ {6}processors: \[(.*)\]$/m.exec(collectorYaml)![1].split(", ");

describe("AgentCore Docker templates", () => {
    describe.each(PACKAGES)("package $name", (pkg) => {
        const names = agentCoreNames(pkg);

        it("names the image in Docker's lowercase, hyphenated form", () => {
            expect(names.imageName).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
            expect(names.imageReference).toBe(`${names.imageName}:${pkg.version ?? "latest"}`);
            expect(imageReferenceError(names.imageReference)).toBeUndefined();
        });

        describe.each([true, false])("with tracing %s", (tracing) => {
            const files = agentCoreDockerFiles(pkg, { tracing });

            it("copies and runs the jar that bal build writes", () => {
                expect(files["Dockerfile"]).toContain(`COPY target/bin/${pkg.name}.jar /app/${pkg.name}.jar`);
                expect(files[".dockerignore"]).toContain(`!target/bin/${pkg.name}.jar`);
                expect(files["start.sh"].endsWith(`\nexec java -jar /app/${pkg.name}.jar\n`)).toBe(true);
            });

            it("ships every file the Dockerfile copies, and lets each through .dockerignore", () => {
                for (const source of copiedSources(files["Dockerfile"]).filter((source) => !source.startsWith("target/"))) {
                    expect(files[source]).toBeDefined();
                    expect(files[".dockerignore"]).toMatch(new RegExp(`^!(${source}|${path.dirname(source)}/)$`, "m"));
                }
            });

            it("keeps Config.toml and the sources out of the build context", () => {
                expect(files[".dockerignore"]).toMatch(/^\*$/m);
                expect(files[".dockerignore"]).not.toMatch(/Config\.toml|\.bal/);
            });

            it("marks every file as generated, so a later build can rewrite it", () => {
                for (const content of Object.values(files)) {
                    expect(content).toContain(AGENTCORE_GENERATED_MARKER);
                }
            });

            it("exposes the port AgentCore Runtime calls", () => {
                expect(AGENTCORE_PORT).toBe(8080);
                expect(files["Dockerfile"]).toContain(`EXPOSE ${AGENTCORE_PORT}`);
            });

            // A RUN in the stage that becomes the image would execute arm64 code, which an amd64 machine can only do
            // under emulation.
            it("builds the runtime stage without running anything for the target platform", () => {
                const stages = files["Dockerfile"].split(/^FROM /m).slice(1);
                expect(stages[stages.length - 1]).not.toMatch(/^RUN /m);
                for (const stage of stages.slice(0, -1)) {
                    expect(stage.startsWith("--platform=$BUILDPLATFORM ")).toBe(true);
                }
            });

            it("keeps the shebang on the first line of start.sh", () => {
                expect(files["start.sh"].startsWith("#!/bin/sh\n")).toBe(true);
            });

            it("runs start.sh through sh, so it starts even without the executable bit", () => {
                expect(files["Dockerfile"]).toContain(`ENTRYPOINT ["/bin/sh", "/app/start.sh"]`);
            });

            it("writes every file with LF line endings, which sh needs", () => {
                for (const content of Object.values(files)) {
                    expect(content).not.toContain("\r");
                }
            });
        });

        it("leaves the collector and tracing config out of an image without tracing", () => {
            const files = agentCoreDockerFiles(pkg, { tracing: false });
            for (const tracingFile of AGENTCORE_TRACING_FILES) {
                expect(files[tracingFile]).toBeUndefined();
            }
            expect(files["Dockerfile"]).not.toMatch(/otel|BAL_CONFIG_FILES/);
            expect(files[".dockerignore"]).not.toMatch(/otel/);
            expect(files["start.sh"]).not.toMatch(/otelcol|OTEL_RESOURCE_ATTRIBUTES/);
        });

        it("sends traces to the collector's OTLP receiver under the image name", () => {
            const files = agentCoreDockerFiles(pkg, { tracing: true });
            expect(files["Dockerfile"]).toContain("ENV BAL_CONFIG_FILES=/app/tracing.toml");
            const tracingToml = parse(files["otel/tracing.toml"]) as any;
            expect(tracingToml.ballerina.observe).toEqual({ tracingEnabled: true, tracingProvider: "otel" });
            expect(tracingToml.ballerina.otel.tracesResourceAttributes["service.name"]).toBe(names.serviceName);
            const endpoint = new URL(tracingToml.ballerina.otel.tracesEndpoint).host;
            expect(files["otel/collector.yaml"]).toContain(`endpoint: ${endpoint}`);
        });
    });
});

describe("AgentCore collector", () => {
    const files = agentCoreDockerFiles({ name: "hr_agent", version: "0.1.0" }, { tracing: true });
    const collector = files["otel/collector.yaml"];
    const builder = files["otel/builder-config.yaml"];

    it("signs the traces with SigV4 and sends them to the X-Ray OTLP endpoint of the runtime's region", () => {
        expect(collector).toContain("authenticator: sigv4auth");
        expect(collector).toContain("service: xray");
        expect(collector).toContain("traces_endpoint: https://xray.${env:AWS_REGION}.amazonaws.com/v1/traces");
    });

    it("listens for the agent's spans on loopback only", () => {
        expect(collector).toMatch(/^ {8}endpoint: 127\.0\.0\.1:4317$/m);
    });

    it("defines every processor the pipeline names, on the single line start.sh edits", () => {
        const processors = pipelineProcessors(collector);
        expect(processors).toEqual(expect.arrayContaining(AGENTCORE_IDENTITY_PROCESSORS));
        for (const processor of processors) {
            expect(collector).toMatch(new RegExp(`^ {2}${processor}:$`, "m"));
        }
        // start.sh drops a processor with `sed s|, <name>||`, which needs one before it on the same line.
        for (const processor of AGENTCORE_IDENTITY_PROCESSORS) {
            expect(processors.indexOf(processor)).toBeGreaterThan(0);
        }
    });

    it("drops AgentCore's frequent /ping health checks from the traces", () => {
        expect(pipelineProcessors(collector)[0]).toBe("filter/drop_ping");
        expect(collector).toContain(`'attributes["http.url"] == "/ping"'`);
    });

    it("builds the collector with a module for every component the config uses", () => {
        const modules: Record<string, string> = {
            otlp: "receiver/otlpreceiver",
            sigv4auth: "extension/sigv4authextension",
            otlp_http: "exporter/otlphttpexporter",
            filter: "processor/filterprocessor",
            attributes: "processor/attributesprocessor",
            transform: "processor/transformprocessor",
            resource: "processor/resourceprocessor",
            batch: "processor/batchprocessor",
        };
        const components = new Set(["otlp", "sigv4auth", "otlp_http",
            ...pipelineProcessors(collector).map((processor) => processor.split("/")[0])]);
        for (const component of components) {
            expect(modules[component]).toBeDefined();
            expect(builder).toContain(`/${modules[component]} v`);
        }
    });

    it("starts the collector in the background, before the agent, and only with a region to send to", () => {
        const script = files["start.sh"];
        expect(script).toMatch(/if \[ -n "\$AWS_REGION" \]; then\n {4}\/app\/otelcol --config="\$config" &/);
        expect(script.indexOf("/app/otelcol")).toBeLessThan(script.indexOf("exec java"));
    });

    it("takes the runtime identity from OTEL_RESOURCE_ATTRIBUTES, and drops the processors that need it otherwise", () => {
        const script = files["start.sh"];
        for (const variable of ["AGENT_SERVICE_NAME", "AGENT_CLOUD_RESOURCE_ID", "AGENT_CLOUD_REGION"]) {
            expect(script).toContain(`${variable}=$(otel_attr`);
            expect(collector).toContain(`\${env:${variable}}`);
        }
        for (const processor of AGENTCORE_IDENTITY_PROCESSORS) {
            expect(script).toContain(`-e 's|, ${processor}||'`);
        }
    });
});

describe("agentCoreImageBuildCommand", () => {
    const command = agentCoreImageBuildCommand("hr-agent:0.1.0");

    it("builds a single-platform linux/arm64 image into the local store", () => {
        expect(AGENTCORE_PLATFORM).toBe("linux/arm64");
        expect(command).toMatch(/^docker buildx build /);
        expect(command).toContain(`--platform ${AGENTCORE_PLATFORM}`);
        expect(command).toContain("--load");
        expect(command).toContain("--provenance=false");
        expect(command).toMatch(/ -t hr-agent:0\.1\.0 \.$/);
    });

    // The same line runs in sh, PowerShell and cmd, so it carries nothing any of them would expand or split.
    it("has nothing a shell would treat specially", () => {
        expect(command).toMatch(/^[\w ./:=-]+$/);
    });

    it("accepts an Amazon ECR repository URI as the image name", () => {
        expect(imageReferenceError("123456789012.dkr.ecr.us-east-1.amazonaws.com/hr-agent:0.1.0")).toBeUndefined();
    });
});

describe("scaffoldAgentCoreDocker", () => {
    let projectPath: string;
    const exists = (relativePath: string) => fs.existsSync(path.join(projectPath, relativePath));

    beforeEach(() => {
        projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "agentcore-docker-"));
        fs.writeFileSync(path.join(projectPath, "Ballerina.toml"), `[package]\norg = "acme"\nname = "hr_agent"\nversion = "0.1.0"\n`);
    });

    afterEach(() => fs.rmSync(projectPath, { recursive: true, force: true }));

    it("defaults the image to the package's name and version", () => {
        expect(defaultAgentCoreImageReference(projectPath)).toBe("hr-agent:0.1.0");
    });

    it("writes every file and makes start.sh executable, without touching Ballerina.toml", () => {
        const toml = fs.readFileSync(path.join(projectPath, "Ballerina.toml"), "utf-8");
        const result = scaffoldAgentCoreDocker(projectPath, { tracing: true });

        expect(result.kept).toEqual([]);
        expect(result.written.sort()).toEqual(Object.keys(agentCoreDockerFiles({ name: "hr_agent" }, { tracing: true })).sort());
        if (process.platform !== "win32") {
            expect(fs.statSync(path.join(projectPath, "start.sh")).mode & 0o111).not.toBe(0);
        }
        expect(fs.readFileSync(path.join(projectPath, "Ballerina.toml"), "utf-8")).toBe(toml);
    });

    it("removes the generated tracing files when tracing is turned off, and brings them back when it is on", () => {
        scaffoldAgentCoreDocker(projectPath, { tracing: true });

        const off = scaffoldAgentCoreDocker(projectPath, { tracing: false });
        expect(off.removed.sort()).toEqual([...AGENTCORE_TRACING_FILES].sort());
        expect(exists("otel")).toBe(false);
        expect(fs.readFileSync(path.join(projectPath, "Dockerfile"), "utf-8")).not.toContain("otelcol");

        scaffoldAgentCoreDocker(projectPath, { tracing: true });
        expect(AGENTCORE_TRACING_FILES.every(exists)).toBe(true);
        expect(fs.readFileSync(path.join(projectPath, "Dockerfile"), "utf-8")).toContain("otelcol");
    });

    it("keeps files the user owns, and never removes them", () => {
        fs.writeFileSync(path.join(projectPath, "Dockerfile"), "FROM custom\n");
        fs.writeFileSync(path.join(projectPath, "start.sh"), "#!/bin/sh\necho mine\n");

        const result = scaffoldAgentCoreDocker(projectPath, { tracing: false });

        expect(result.kept.sort()).toEqual(["Dockerfile", "start.sh"]);
        expect(result.removed).toEqual([]);
        expect(fs.readFileSync(path.join(projectPath, "Dockerfile"), "utf-8")).toBe("FROM custom\n");
        expect(fs.readFileSync(path.join(projectPath, "start.sh"), "utf-8")).toBe("#!/bin/sh\necho mine\n");
    });

    it("leaves an otel directory that holds the user's own files", () => {
        scaffoldAgentCoreDocker(projectPath, { tracing: true });
        fs.writeFileSync(path.join(projectPath, "otel", "notes.md"), "mine\n");

        scaffoldAgentCoreDocker(projectPath, { tracing: false });

        expect(exists("otel/notes.md")).toBe(true);
    });
});
