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

// Files that package a Ballerina agent as a Microsoft Foundry hosted agent: the agent jar, plus, when tracing is
// on, a slim OpenTelemetry Collector that forwards its traces to the Application Insights resource Foundry
// provides. Pure functions only, so the scaffolding can be checked without VS Code.

/** Foundry sends hosted-agent traffic to this port; `azure:FoundryListener` listens on it by default. */
export const FOUNDRY_PORT = 8088;

/** Foundry runs hosted agents on linux/amd64, whatever the machine the image is built on. */
export const FOUNDRY_PLATFORM = "linux/amd64";

/**
 * The image build, the same in every shell (sh, PowerShell, cmd) and on every host (Apple silicon, Intel, Linux,
 * Windows):
 * - `--platform` pins the target, so an arm64 machine still builds an amd64 image. No Dockerfile stage runs a
 *   target-platform binary (the collector is cross-compiled on the build platform, and the runtime stage has no
 *   `RUN`), so the build needs no QEMU or Rosetta emulation.
 * - `--load` puts the image in the local image store for `docker tag`/`docker push`. Without it, a builder that is
 *   not the Docker engine's own (the docker-container driver) keeps the result only in its build cache.
 * - `--provenance=false` keeps a single-platform image manifest. BuildKit otherwise wraps it in an index with an
 *   `unknown/unknown` attestation manifest, which Azure's container hosts do not all accept.
 */
export function foundryImageBuildCommand(imageReference: string): string {
    return `docker buildx build --platform ${FOUNDRY_PLATFORM} --provenance=false --load -t ${imageReference} .`;
}

const OTEL_COLLECTOR_VERSION = "0.164.0";
// The contrib exporter is released separately, so its patch version can run ahead of the core modules.
const AZURE_MONITOR_EXPORTER_VERSION = "0.164.1";
const GO_IMAGE = "golang:1.26.2";
// `ballerinax/ai.azure` ships the Foundry listener for the Java 25 platform only (Ballerina 2201.14+).
const JRE_IMAGE = "eclipse-temurin:25-jre";
// The collector receives the agent's spans over OTLP/gRPC inside the container.
const OTLP_GRPC_ENDPOINT = "localhost:4317";

export interface FoundryPackage {
    /** `[package] name` from Ballerina.toml; `bal build` writes `target/bin/<name>.jar`. */
    name: string;
    /** `[package] version` from Ballerina.toml, used as the image tag. */
    version?: string;
}

export interface FoundryBuildOptions {
    /** Bundles the OpenTelemetry Collector and the Ballerina tracing config into the image. */
    tracing: boolean;
}

/** The names derived from a package. Image and service names follow Docker's lowercase, hyphenated style. */
export interface FoundryNames {
    jarName: string;
    imageName: string;
    /** The default image reference, `<imageName>:<version>`. */
    imageReference: string;
    serviceName: string;
}

export function foundryNames(pkg: FoundryPackage): FoundryNames {
    const imageName = pkg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ballerina-agent";
    return {
        jarName: `${pkg.name}.jar`,
        imageName,
        imageReference: `${imageName}:${pkg.version || "latest"}`,
        serviceName: imageName,
    };
}

/**
 * Marks a file the extension wrote. A file that still carries it is rewritten on every build, so it follows the
 * tracing choice; a file without it belongs to the user and is never touched.
 */
export const FOUNDRY_GENERATED_MARKER =
    "# Generated for Microsoft Foundry by the Ballerina extension and rewritten on each build. Delete this line to keep your edits.";

/** Only a traced image needs these; a build without tracing removes the generated ones. */
export const FOUNDRY_TRACING_FILES = ["start.sh", "otel/builder-config.yaml", "otel/collector.yaml", "otel/tracing.toml"];

/** The scaffolding, keyed by path relative to the package root. */
export function foundryDockerFiles(pkg: FoundryPackage, { tracing }: FoundryBuildOptions): Record<string, string> {
    const names = foundryNames(pkg);
    if (!tracing) {
        return {
            "Dockerfile": plainDockerfile(names),
            ".dockerignore": dockerignore(names, false),
        };
    }
    return {
        "Dockerfile": tracedDockerfile(names),
        ".dockerignore": dockerignore(names, true),
        "start.sh": startScript(names),
        "otel/builder-config.yaml": builderConfig(names),
        "otel/collector.yaml": collectorConfig(),
        "otel/tracing.toml": tracingConfig(names),
    };
}

/** The files that must be executable inside the image. */
export const FOUNDRY_EXECUTABLE_FILES = ["start.sh"];

const DOCKERFILE_HEADER = `${FOUNDRY_GENERATED_MARKER}
# Build the jar first with \`bal build\`, then:
#   ${foundryImageBuildCommand("<image>")}
`;

// The runtime stage must not RUN anything: on an arm64 machine that would need amd64 emulation.
const RUNTIME_STAGE_NOTE = `# Ballerina 2201.14 compiles to Java 25 bytecode.
# No RUN steps in this stage, so building it for ${FOUNDRY_PLATFORM} needs no emulation on an arm64 machine.`;

function plainDockerfile({ jarName }: FoundryNames): string {
    return `${DOCKERFILE_HEADER}
${RUNTIME_STAGE_NOTE}
FROM ${JRE_IMAGE}

WORKDIR /app
COPY target/bin/${jarName} /app/${jarName}

EXPOSE ${FOUNDRY_PORT}
ENTRYPOINT ["java", "-jar", "/app/${jarName}"]
`;
}

function tracedDockerfile({ jarName }: FoundryNames): string {
    return `${DOCKERFILE_HEADER}
# Slim OpenTelemetry Collector built for the target platform (see otel/builder-config.yaml).
FROM --platform=$BUILDPLATFORM ${GO_IMAGE} AS otelcol
ARG TARGETOS TARGETARCH
RUN go install go.opentelemetry.io/collector/cmd/builder@v${OTEL_COLLECTOR_VERSION}
COPY otel/builder-config.yaml /src/builder-config.yaml
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH builder --config=/src/builder-config.yaml

${RUNTIME_STAGE_NOTE}
FROM ${JRE_IMAGE}

WORKDIR /app
COPY --from=otelcol /build/otelcol /app/otelcol
COPY otel/collector.yaml /app/collector.yaml
COPY otel/tracing.toml /app/tracing.toml
COPY start.sh /app/start.sh
COPY target/bin/${jarName} /app/${jarName}

ENV BAL_CONFIG_FILES=/app/tracing.toml
EXPOSE ${FOUNDRY_PORT}
# Run through sh so the script needs no executable bit, which a build context sent from Windows can lack.
ENTRYPOINT ["/bin/sh", "/app/start.sh"]
`;
}

// Keeps the build context to what the Dockerfile copies, so Config.toml secrets and sources stay out.
function dockerignore({ jarName }: FoundryNames, tracing: boolean): string {
    return `${FOUNDRY_GENERATED_MARKER}
*
!target/bin/${jarName}
${tracing ? "!start.sh\n!otel/\n" : ""}`;
}

function startScript({ jarName }: FoundryNames): string {
    return `#!/bin/sh
${FOUNDRY_GENERATED_MARKER}
# Container entrypoint. Foundry runs one container per session, so the OpenTelemetry Collector runs here
# as a second process. It only starts when an Application Insights connection string is available.
if [ -n "$APPLICATIONINSIGHTS_CONNECTION_STRING" ]; then
    /app/otelcol --config=/app/collector.yaml &
else
    echo "APPLICATIONINSIGHTS_CONNECTION_STRING not set; traces will not be exported" >&2
fi
exec java -jar /app/${jarName}
`;
}

function builderConfig({ serviceName }: FoundryNames): string {
    return `${FOUNDRY_GENERATED_MARKER}
# OpenTelemetry Collector Builder manifest: a slim collector with only what the agent needs
# (the full contrib build is ~420 MB).
dist:
  name: otelcol
  description: ${serviceName} collector (OTLP in, Azure Monitor out)
  output_path: /build

receivers:
  - gomod: go.opentelemetry.io/collector/receiver/otlpreceiver v${OTEL_COLLECTOR_VERSION}
processors:
  - gomod: go.opentelemetry.io/collector/processor/batchprocessor v${OTEL_COLLECTOR_VERSION}
exporters:
  - gomod: github.com/open-telemetry/opentelemetry-collector-contrib/exporter/azuremonitorexporter v${AZURE_MONITOR_EXPORTER_VERSION}
  - gomod: go.opentelemetry.io/collector/exporter/debugexporter v${OTEL_COLLECTOR_VERSION}
`;
}

function collectorConfig(): string {
    return `${FOUNDRY_GENERATED_MARKER}
# Receives the agent's OTLP traces on localhost and forwards them to Application Insights.
# Foundry sets APPLICATIONINSIGHTS_CONNECTION_STRING in the sandbox.
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: ${OTLP_GRPC_ENDPOINT}

processors:
  batch:
    timeout: 2s

exporters:
  azure_monitor:
    connection_string: \${env:APPLICATIONINSIGHTS_CONNECTION_STRING}

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [azure_monitor]
`;
}

function tracingConfig({ serviceName }: FoundryNames): string {
    return `${FOUNDRY_GENERATED_MARKER}
# Ballerina tracing config, used only inside the container (BAL_CONFIG_FILES points here).
# Exports spans over OTLP to the collector that start.sh runs next to the agent.
[ballerina.observe]
tracingEnabled = true
tracingProvider = "otel"

[ballerina.otel]
tracesEndpoint = "http://${OTLP_GRPC_ENDPOINT}"

[ballerina.otel.tracesResourceAttributes]
"service.name" = "${serviceName}"
`;
}

/** The shell the push command is written for, from the user's default terminal shell. */
export type FoundryShell = "posix" | "powershell" | "cmd";

export function foundryShell(shellPath: string | undefined): FoundryShell {
    if (/(pwsh|powershell)(\.exe)?$/i.test(shellPath ?? "")) {
        return "powershell";
    }
    return /cmd(\.exe)?$/i.test(shellPath ?? "") ? "cmd" : "posix";
}

/** Stands in for the Azure Container Registry name, which the user fills in before running the command. */
export const ACR_PLACEHOLDER = "<your-registry-name>";

/**
 * One line that signs in to the Azure Container Registry, then tags and pushes the image to it. The registry
 * name is set once at the start where the shell allows it, so it is the only thing the user edits.
 */
export function foundryPushCommand(imageReference: string, shell: FoundryShell): string {
    switch (shell) {
        case "powershell": {
            const remote = `"$ACR.azurecr.io/${imageReference}"`;
            return `$ACR = "${ACR_PLACEHOLDER}"; az acr login --name $ACR; if ($?) { docker tag ${imageReference} ${remote}; ` +
                `if ($?) { docker push ${remote} } }`;
        }
        case "cmd": {
            // cmd expands %VAR% when it reads the line, so a variable set on the same line is not seen.
            const remote = `${ACR_PLACEHOLDER}.azurecr.io/${imageReference}`;
            return `az acr login --name ${ACR_PLACEHOLDER} && docker tag ${imageReference} ${remote} && docker push ${remote}`;
        }
        default: {
            const remote = `"$ACR.azurecr.io/${imageReference}"`;
            return `ACR=${ACR_PLACEHOLDER}; az acr login --name "$ACR" && docker tag ${imageReference} ${remote} && ` +
                `docker push ${remote}`;
        }
    }
}
