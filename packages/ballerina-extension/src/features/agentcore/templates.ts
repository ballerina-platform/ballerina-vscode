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

// Files that package a Ballerina agent for Amazon Bedrock AgentCore Runtime: the agent jar, plus, when tracing is
// on, a slim OpenTelemetry Collector that signs its traces with the runtime's IAM role and sends them to AWS X-Ray,
// where CloudWatch's GenAI observability reads them. Pure functions only, so the scaffolding can be checked without
// VS Code.

/** AgentCore Runtime calls the container on this port; `agentcore:Listener` listens on it by default. */
export const AGENTCORE_PORT = 8080;

/** AgentCore Runtime runs only linux/arm64 images, whatever the machine the image is built on. */
export const AGENTCORE_PLATFORM = "linux/arm64";

/**
 * The image build, the same in every shell and on every host. `--platform` pins the target, so an amd64 machine
 * still builds an arm64 image. No Dockerfile stage runs a target-platform binary (the collector is cross-compiled on
 * the build platform, and the runtime stage has no `RUN`), so the build needs no QEMU emulation.
 * `--provenance=false` is required, not optional: AgentCore Runtime rejects the image index with an attestation
 * manifest that BuildKit otherwise produces. `--load` puts the image in the local store for `docker tag`/`docker push`.
 */
export function agentCoreImageBuildCommand(imageReference: string): string {
    return `docker buildx build --platform ${AGENTCORE_PLATFORM} --provenance=false --load -t ${imageReference} .`;
}

const OTEL_COLLECTOR_VERSION = "0.164.0";
// The contrib modules are released separately, so their patch version can run ahead of the core modules.
const OTEL_CONTRIB_VERSION = "0.164.1";
const GO_IMAGE = "golang:1.26.2";
// `ballerinax/ai.aws.bedrock` ships the AgentCore listener for the Java 25 platform only (Ballerina 2201.14+).
const JRE_IMAGE = "eclipse-temurin:25-jre";
// The collector receives the agent's spans over OTLP/gRPC on loopback, so nothing outside the container can post to it.
const OTLP_GRPC_ENDPOINT = "127.0.0.1:4317";

export interface AgentCorePackage {
    /** `[package] name` from Ballerina.toml; `bal build` writes `target/bin/<name>.jar`. */
    name: string;
    /** `[package] version` from Ballerina.toml, used as the image tag. */
    version?: string;
}

export interface AgentCoreBuildOptions {
    /** Bundles the OpenTelemetry Collector and the Ballerina tracing config into the image. */
    tracing: boolean;
}

/** The names derived from a package. Image and service names follow Docker's lowercase, hyphenated style. */
export interface AgentCoreNames {
    jarName: string;
    imageName: string;
    /** The default image reference, `<imageName>:<version>`. */
    imageReference: string;
    serviceName: string;
}

export function agentCoreNames(pkg: AgentCorePackage): AgentCoreNames {
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
export const AGENTCORE_GENERATED_MARKER =
    "# Generated for Amazon Bedrock AgentCore by the Ballerina extension and rewritten on each build. Delete this line to keep your edits.";

/** Only a traced image needs these; a build without tracing removes the generated ones. */
export const AGENTCORE_TRACING_FILES = ["otel/builder-config.yaml", "otel/collector.yaml", "otel/tracing.toml"];

/** The files that must be executable inside the image. */
export const AGENTCORE_EXECUTABLE_FILES = ["start.sh"];

/**
 * The collector processors that need the runtime identity AgentCore injects through `OTEL_RESOURCE_ATTRIBUTES`.
 * The collector refuses to start when one of their `${env:...}` values is empty, so start.sh drops them from the
 * pipeline when that identity is missing, as it is outside AgentCore.
 */
export const AGENTCORE_IDENTITY_PROCESSORS = ["resource/agent_identity", "attributes/agentcore_origin"];

/** The scaffolding, keyed by path relative to the package root. */
export function agentCoreDockerFiles(pkg: AgentCorePackage, { tracing }: AgentCoreBuildOptions): Record<string, string> {
    const names = agentCoreNames(pkg);
    const files: Record<string, string> = {
        "Dockerfile": tracing ? tracedDockerfile(names) : plainDockerfile(names),
        ".dockerignore": dockerignore(names, tracing),
        "start.sh": startScript(names, tracing),
    };
    if (tracing) {
        files["otel/builder-config.yaml"] = builderConfig(names);
        files["otel/collector.yaml"] = collectorConfig();
        files["otel/tracing.toml"] = tracingConfig(names);
    }
    return files;
}

// The runtime stage has no RUN step, so building it for linux/arm64 needs no emulation on an amd64 machine; the
// collector stage is cross-compiled on the build platform. start.sh runs through sh, so it needs no executable bit.
// No configuration is copied in: AgentCore passes it as environment variables (BAL_CONFIG_VAR_*).
function plainDockerfile({ jarName }: AgentCoreNames): string {
    return `${AGENTCORE_GENERATED_MARKER}
FROM ${JRE_IMAGE}

WORKDIR /app
COPY start.sh /app/start.sh
COPY target/bin/${jarName} /app/${jarName}

EXPOSE ${AGENTCORE_PORT}

ENTRYPOINT ["/bin/sh", "/app/start.sh"]
`;
}

function tracedDockerfile({ jarName }: AgentCoreNames): string {
    return `${AGENTCORE_GENERATED_MARKER}
FROM --platform=$BUILDPLATFORM ${GO_IMAGE} AS otelcol
ARG TARGETOS TARGETARCH
RUN go install go.opentelemetry.io/collector/cmd/builder@v${OTEL_COLLECTOR_VERSION}
COPY otel/builder-config.yaml /src/builder-config.yaml
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH builder --config=/src/builder-config.yaml

FROM ${JRE_IMAGE}

WORKDIR /app
COPY --from=otelcol /build/otelcol /app/otelcol
COPY otel/collector.yaml /app/collector.yaml
COPY otel/tracing.toml /app/tracing.toml
COPY start.sh /app/start.sh
COPY target/bin/${jarName} /app/${jarName}

ENV BAL_CONFIG_FILES=/app/tracing.toml
EXPOSE ${AGENTCORE_PORT}

ENTRYPOINT ["/bin/sh", "/app/start.sh"]
`;
}

// Keeps the build context to what the Dockerfile copies, so Config.toml secrets and sources stay out.
function dockerignore({ jarName }: AgentCoreNames, tracing: boolean): string {
    return `${AGENTCORE_GENERATED_MARKER}
*
!target/bin/${jarName}
!start.sh
${tracing ? "!otel/\n" : ""}`;
}

// AgentCore gives a container, not a pod, so the collector cannot be a sidecar: it runs in the background and the
// agent in the foreground, so the container lives and dies with the agent. A dead collector only costs traces.
//
// AgentCore injects OTEL_RESOURCE_ATTRIBUTES with the identity CloudWatch attributes spans by (the service name, the
// runtime endpoint ARN, the log group, ...). It is taken from there rather than rebuilt, since its format is AWS's
// to change.
const START_COLLECTOR = `
otel_attr() {
    printf '%s' "\${OTEL_RESOURCE_ATTRIBUTES:-}" | tr ',' '\\n' | sed -n "s/^$1=//p" | head -1
}

AGENT_SERVICE_NAME=$(otel_attr 'service\\.name')
AGENT_CLOUD_RESOURCE_ID=$(otel_attr 'cloud\\.resource_id')
AGENT_DEPLOYMENT_ENV=$(otel_attr 'deployment\\.environment\\.name')
AGENT_LOG_GROUP=$(otel_attr 'aws\\.log\\.group\\.names')
AGENT_LOG_STREAM=$(otel_attr 'aws\\.log\\.stream\\.names')
AGENT_CLOUD_PLATFORM=$(otel_attr 'cloud\\.platform')
AGENT_CLOUD_PROVIDER=$(otel_attr 'cloud\\.provider')
AGENT_CLOUD_REGION=$(otel_attr 'cloud\\.region')
AWS_REGION="\${AWS_REGION:-\${AWS_DEFAULT_REGION:-$AGENT_CLOUD_REGION}}"
export AGENT_SERVICE_NAME AGENT_CLOUD_RESOURCE_ID AGENT_DEPLOYMENT_ENV AGENT_LOG_GROUP AGENT_LOG_STREAM \\
    AGENT_CLOUD_PLATFORM AGENT_CLOUD_PROVIDER AGENT_CLOUD_REGION AWS_REGION

config=/app/collector.yaml
if [ -z "$AGENT_SERVICE_NAME" ] || [ -z "$AGENT_CLOUD_RESOURCE_ID" ] || [ -z "$AGENT_DEPLOYMENT_ENV" ] ||
    [ -z "$AGENT_LOG_GROUP" ] || [ -z "$AGENT_LOG_STREAM" ] || [ -z "$AGENT_CLOUD_PLATFORM" ] ||
    [ -z "$AGENT_CLOUD_PROVIDER" ] || [ -z "$AGENT_CLOUD_REGION" ]; then
    echo "OTEL_RESOURCE_ATTRIBUTES is missing or incomplete; tracing without the AgentCore runtime identity" >&2
    sed ${AGENTCORE_IDENTITY_PROCESSORS.map((name) => `-e 's|, ${name}||'`).join(" ")} "$config" > /tmp/collector.yaml
    config=/tmp/collector.yaml
fi

if [ -n "$AWS_REGION" ]; then
    /app/otelcol --config="$config" &
else
    echo "AWS_REGION not set; traces will not be exported" >&2
fi
`;

function startScript({ jarName }: AgentCoreNames, tracing: boolean): string {
    return `#!/bin/sh
${AGENTCORE_GENERATED_MARKER}
${tracing ? START_COLLECTOR : ""}
exec java -jar /app/${jarName}
`;
}

function builderConfig({ serviceName }: AgentCoreNames): string {
    return `${AGENTCORE_GENERATED_MARKER}
# OpenTelemetry Collector Builder manifest: a slim collector with only what the agent needs
# (the full contrib build is ~420 MB).
dist:
  name: otelcol
  description: ${serviceName} collector (OTLP in, AWS X-Ray out)
  output_path: /build

receivers:
  - gomod: go.opentelemetry.io/collector/receiver/otlpreceiver v${OTEL_COLLECTOR_VERSION}
processors:
  - gomod: go.opentelemetry.io/collector/processor/batchprocessor v${OTEL_COLLECTOR_VERSION}
  - gomod: github.com/open-telemetry/opentelemetry-collector-contrib/processor/attributesprocessor v${OTEL_CONTRIB_VERSION}
  - gomod: github.com/open-telemetry/opentelemetry-collector-contrib/processor/filterprocessor v${OTEL_CONTRIB_VERSION}
  - gomod: github.com/open-telemetry/opentelemetry-collector-contrib/processor/resourceprocessor v${OTEL_CONTRIB_VERSION}
  - gomod: github.com/open-telemetry/opentelemetry-collector-contrib/processor/transformprocessor v${OTEL_CONTRIB_VERSION}
exporters:
  - gomod: go.opentelemetry.io/collector/exporter/otlphttpexporter v${OTEL_COLLECTOR_VERSION}
extensions:
  - gomod: github.com/open-telemetry/opentelemetry-collector-contrib/extension/sigv4authextension v${OTEL_CONTRIB_VERSION}
`;
}

// The pipeline must stay on one line: start.sh drops the identity processors with `sed s|, <name>||`.
const PIPELINE_PROCESSORS = ["filter/drop_ping", "attributes/genai_token_types", "transform/genai_total_tokens",
    "transform/scope_name", "transform/genai_eval_aliases", ...AGENTCORE_IDENTITY_PROCESSORS, "attributes/session_id",
    "batch"];

function collectorConfig(): string {
    return `${AGENTCORE_GENERATED_MARKER}
# Receives the agent's unsigned OTLP traces on loopback, signs them with the AgentCore execution role (SigV4) and
# sends them to the AWS X-Ray OTLP endpoint, which CloudWatch's GenAI observability reads. The execution role needs
# permission to write to X-Ray, and CloudWatch Transaction Search must be enabled in the account.
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: ${OTLP_GRPC_ENDPOINT}

extensions:
  sigv4auth:
    region: \${env:AWS_REGION}
    service: xray

exporters:
  otlp_http:
    # The X-Ray endpoint takes OTLP over HTTP only, at this full path.
    traces_endpoint: https://xray.\${env:AWS_REGION}.amazonaws.com/v1/traces
    auth:
      authenticator: sigv4auth
    compression: gzip

processors:
  # AgentCore health-checks /ping every few seconds; those spans would bury everything worth reading.
  filter/drop_ping:
    error_mode: ignore
    traces:
      span:
        - 'attributes["http.url"] == "/ping"'

  # Ballerina emits token counts as strings, which CloudWatch cannot sum.
  attributes/genai_token_types:
    actions:
      - key: gen_ai.usage.input_tokens
        action: convert
        converted_type: int
      - key: gen_ai.usage.output_tokens
        action: convert
        converted_type: int

  # CloudWatch queries gen_ai.usage.total_tokens; Ballerina emits only the input and output counts.
  transform/genai_total_tokens:
    error_mode: ignore
    trace_statements:
      - context: span
        statements:
          - set(span.attributes["gen_ai.usage.total_tokens"], Int(span.attributes["gen_ai.usage.input_tokens"]) + Int(span.attributes["gen_ai.usage.output_tokens"])) where span.attributes["gen_ai.usage.input_tokens"] != nil and span.attributes["gen_ai.usage.output_tokens"] != nil

  # AgentCore Evaluations reads only spans whose scope name starts with "opentelemetry.instrumentation.".
  transform/scope_name:
    error_mode: ignore
    trace_statements:
      - context: scope
        statements:
          - set(scope.name, "opentelemetry.instrumentation.ballerina") where scope.name == "otel"

  # AgentCore Evaluations reads an agent's input and output, and a tool call's arguments and result, under these names.
  transform/genai_eval_aliases:
    error_mode: ignore
    trace_statements:
      - context: span
        statements:
          - set(span.attributes["gen_ai.task.input"], span.attributes["gen_ai.input.messages"]) where span.attributes["gen_ai.operation.name"] == "invoke_agent" and span.attributes["gen_ai.input.messages"] != nil
          - set(span.attributes["gen_ai.task.output"], span.attributes["gen_ai.output.messages"]) where span.attributes["gen_ai.operation.name"] == "invoke_agent" and span.attributes["gen_ai.output.messages"] != nil
          - set(span.attributes["agentcore.invocation.user_prompt"], span.attributes["gen_ai.input.messages"]) where span.attributes["gen_ai.operation.name"] == "invoke_agent" and span.attributes["gen_ai.input.messages"] != nil
          - set(span.attributes["agentcore.invocation.agent_response"], span.attributes["gen_ai.output.messages"]) where span.attributes["gen_ai.operation.name"] == "invoke_agent" and span.attributes["gen_ai.output.messages"] != nil
          - set(span.attributes["gen_ai.tool.call.arguments"], span.attributes["gen_ai.tool.arguments"]) where span.attributes["gen_ai.operation.name"] == "execute_tool" and span.attributes["gen_ai.tool.arguments"] != nil
          - set(span.attributes["gen_ai.tool.call.result"], span.attributes["gen_ai.tool.output"]) where span.attributes["gen_ai.operation.name"] == "execute_tool" and span.attributes["gen_ai.tool.output"] != nil

  # The runtime identity start.sh reads from OTEL_RESOURCE_ATTRIBUTES, so CloudWatch attributes the spans to this agent.
  resource/agent_identity:
    attributes:
      - key: service.name
        value: \${env:AGENT_SERVICE_NAME}
        action: upsert
      - key: cloud.resource_id
        value: \${env:AGENT_CLOUD_RESOURCE_ID}
        action: upsert
      - key: deployment.environment.name
        value: \${env:AGENT_DEPLOYMENT_ENV}
        action: upsert
      - key: aws.log.group.names
        value: \${env:AGENT_LOG_GROUP}
        action: upsert
      - key: aws.log.stream.names
        value: \${env:AGENT_LOG_STREAM}
        action: upsert
      - key: cloud.platform
        value: \${env:AGENT_CLOUD_PLATFORM}
        action: upsert
      - key: cloud.provider
        value: \${env:AGENT_CLOUD_PROVIDER}
        action: upsert
      - key: cloud.region
        value: \${env:AGENT_CLOUD_REGION}
        action: upsert

  attributes/agentcore_origin:
    actions:
      - key: aws.xray.origin
        value: AWS::BedrockAgentCore::Runtime
        action: upsert
      - key: aws.resource.type
        value: AWS::BedrockAgentCore::Runtime
        action: upsert
      - key: aws.resource.arn
        value: \${env:AGENT_CLOUD_RESOURCE_ID}
        action: upsert

  # AWS correlates sessions on session.id; Ballerina records the AgentCore session as gen_ai.conversation.id.
  attributes/session_id:
    actions:
      - key: session.id
        from_attribute: gen_ai.conversation.id
        action: upsert

  batch:
    timeout: 2s

service:
  extensions: [sigv4auth]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [${PIPELINE_PROCESSORS.join(", ")}]
      exporters: [otlp_http]
`;
}

function tracingConfig({ serviceName }: AgentCoreNames): string {
    return `${AGENTCORE_GENERATED_MARKER}
# Ballerina tracing config, used only inside the container (BAL_CONFIG_FILES points here).
# Exports spans over OTLP to the collector that start.sh runs next to the agent.
[ballerina.observe]
tracingEnabled = true
tracingProvider = "otel"

[ballerina.otel]
tracesEndpoint = "http://${OTLP_GRPC_ENDPOINT}"

# A fallback only: on AgentCore the collector sets the service name from the runtime's identity.
[ballerina.otel.tracesResourceAttributes]
"service.name" = "${serviceName}"

# JSON logs, so CloudWatch Logs parses each line, with its trace and span IDs, into fields.
[ballerina.log]
format = "json"
`;
}
