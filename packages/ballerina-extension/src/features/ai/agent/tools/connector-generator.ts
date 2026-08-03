// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { tool } from "ai";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { z } from "zod";
import {
    SpecFetcherInput,
    SpecFetcherResult,
    ParsedSpec,
    ParsedService,
    ParsedEndpoint,
    ParsedSchema,
    HttpMethod,
} from "../../utils/libs/generator/openapi-types";
import { CopilotEventHandler } from "../../utils/events";
import { langClient } from "../../activator";
import { applyTextEdits } from "../utils";
import { LIBRARY_GET_TOOL } from "./library-get";
import { approvalManager } from '../../state/ApprovalManager';
import { LIBRARY_SEARCH_TOOL } from "./library-search";
import { recordAiTouchedFile } from "../../../../rpc-managers/diagram-validity";
import { addToIntegration } from "../../../../rpc-managers/ai-panel/utils";

export const CONNECTOR_GENERATOR_TOOL = "ConnectorGeneratorTool";

const SpecFetcherInputSchema = z.object({
    serviceName: z.string().describe("Name of the service/API that needs specification"),
    serviceDescription: z.string().optional().describe("Optional description of what the service is for"),
});



export function createConnectorGeneratorTool(eventHandler: CopilotEventHandler, tempProjectPath: string, projectName?: string, modifiedFiles?: string[]) {
    return tool({
        // TODO: Verify that the agent invokes LIBRARY_SEARCH_TOOL before LIBRARY_GET_TOOL and only falls back to this tool when no suitable library is found; update the tool description or agent prompt if the ordering is incorrect
        description: `
Generates a connector for an external service by deriving the service contract from user-provided OpenAPI specifications.

Use this tool when:
1. Target service is custom, internal, or niche
2. User request is ambiguous and needs a SaaS connector
3. User explicitly requests to create a SaaS connector
4. After searching with ${LIBRARY_SEARCH_TOOL}, no suitable connector is found

**CRITICAL: Do NOT call this tool again for the same service if the user has already skipped it (errorCode: USER_SKIPPED). Accept the skip and proceed without the connector.**

The tool will:
1. Request OpenAPI spec from user (supports JSON and YAML formats)
2. Generate complete Ballerina connector module with client class, typed methods, record types, and authentication
3. Save the spec to resources/specs/ directory
4. Generate connector files in generated/moduleName submodule

Returns complete connector information (DO NOT read files, use the returned content directly):
- moduleName: Name of the generated submodule
- importStatement: Import statement to use in your code (e.g., "import project.moduleName")
- generatedFiles: Array with path and COMPLETE CONTENT of each generated .bal file
  * Each file object contains: { path: "relative/path/to/file.bal", content: "full file content" }
  * The content field contains the entire generated code - use it directly without reading files

# Example
**Query**: Write a passthrough service for Foo service.
**Tool Call**: Call with serviceName: "Foo API", serviceDescription: "Foo API"
**Result**: Returns importStatement and generatedFiles with complete content → Use importStatement in your code`,
        inputSchema: SpecFetcherInputSchema,
        execute: async (input: SpecFetcherInput): Promise<SpecFetcherResult> => {
            return await ConnectorGeneratorTool(input, eventHandler, tempProjectPath, projectName, modifiedFiles);
        },
    });
}

export async function ConnectorGeneratorTool(
    input: SpecFetcherInput,
    eventHandler: CopilotEventHandler,
    tempProjectPath: string,
    projectName?: string,
    modifiedFiles?: string[]
): Promise<SpecFetcherResult> {
    if (!eventHandler) {
        return createErrorResult(
            "INVALID_INPUT",
            "Event handler is required for spec fetcher tool",
            input.serviceName
        );
    }

    if (!tempProjectPath) {
        return createErrorResult(
            "INVALID_INPUT",
            "tempProjectPath is required for ConnectorGeneratorTool",
            input.serviceName
        );
    }

    // requestId must be defined before try block to ensure it's available in catch
    const requestId = crypto.randomUUID();

    try {
        const userInput = await requestSpecFromUser(requestId, input, eventHandler);

        if (!userInput.provided) {
            return handleUserSkip(requestId, input.serviceName, userInput.comment, eventHandler);
        }

        const { rawSpec, parsedSpec, originalContent, format } = parseAndValidateSpec(userInput.spec);

        const { specFilePath, sanitizedServiceName } = await saveSpecToWorkspace(
            originalContent,
            format,
            rawSpec,
            input.serviceName,
            tempProjectPath,
            modifiedFiles
        );

        sendGeneratingNotification(requestId, input.serviceName, parsedSpec, eventHandler);

        const { moduleName, importStatement, generatedFiles } = await generateConnector(
            specFilePath,
            tempProjectPath,
            sanitizedServiceName,
            projectName,
            modifiedFiles
        );

        return handleSuccess(
            requestId,
            input.serviceName,
            parsedSpec,
            moduleName,
            importStatement,
            generatedFiles,
            eventHandler
        );
    } catch (error: any) {
        return handleError(error, input.serviceName, requestId, eventHandler);
    }
}

async function requestSpecFromUser(
    requestId: string,
    input: SpecFetcherInput,
    eventHandler: CopilotEventHandler
): Promise<{ provided: boolean; spec?: any; comment?: string }> {
    eventHandler({
        type: "connector_generation_notification",
        requestId,
        stage: "requesting_input",
        serviceName: input.serviceName,
        serviceDescription: input.serviceDescription,
        message: `Please provide OpenAPI specification for ${input.serviceName}${
            input.serviceDescription ? ` (${input.serviceDescription})` : ""
        }`,
    });

    return waitForUserResponse(requestId, eventHandler);
}

function handleUserSkip(
    requestId: string,
    serviceName: string,
    comment: string | undefined,
    eventHandler: CopilotEventHandler
): SpecFetcherResult {
    eventHandler({
        type: "connector_generation_notification",
        requestId,
        stage: "skipped",
        serviceName,
        message: `Skipped providing spec for ${serviceName}${comment ? ": " + comment : ""}`,
    });

    return {
        success: false,
        message: `User skipped providing OpenAPI specification for ${serviceName}. Do NOT call this tool again for ${serviceName} — proceed with the implementation without this connector.`,
        error: `User skipped providing spec for ${serviceName}${comment ? ": " + comment : ""}`,
        errorCode: "USER_SKIPPED",
        details: "User chose not to provide the OpenAPI specification",
    };
}

function parseAndValidateSpec(
    spec: any
): { rawSpec: any; parsedSpec: ParsedSpec; originalContent: string; format: "json" | "yaml" } {
    const specContent = typeof spec === "string" ? spec : JSON.stringify(spec);
    const { spec: rawSpec, format } = parseSpec(specContent);
    const parsedSpec = parseOpenApiSpec(rawSpec);
    return { rawSpec, parsedSpec, originalContent: specContent, format };
}

async function saveSpecToWorkspace(
    originalContent: string,
    format: "json" | "yaml",
    rawSpec: any,
    serviceName: string,
    tempProjectPath: string,
    modifiedFiles?: string[]
): Promise<{ specFilePath: string; sanitizedServiceName: string }> {
    const sanitizedServiceName = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const specsDir = path.join(tempProjectPath, "resources", "specs");
    const fileExtension = format === "yaml" ? "yaml" : "json";
    const specFilePath = path.join(specsDir, `${sanitizedServiceName}.${fileExtension}`);

    if (!fs.existsSync(specsDir)) {
        fs.mkdirSync(specsDir, { recursive: true });
    }

    const contentToSave = format === "yaml" ? originalContent : JSON.stringify(rawSpec, null, 2);
    fs.writeFileSync(specFilePath, contentToSave, "utf-8");

    if (modifiedFiles) {
        const relativeSpecPath = path.relative(tempProjectPath, specFilePath);
        modifiedFiles.push(relativeSpecPath);
    }

    return { specFilePath, sanitizedServiceName };
}

function sendGeneratingNotification(
    requestId: string,
    serviceName: string,
    parsedSpec: ParsedSpec,
    eventHandler: CopilotEventHandler
): void {
    eventHandler({
        type: "connector_generation_notification",
        requestId,
        stage: "generating",
        serviceName,
        spec: {
            version: parsedSpec.version,
            title: parsedSpec.title,
            description: parsedSpec.description,
            baseUrl: parsedSpec.baseUrl,
            endpointCount: parsedSpec.endpointCount,
            methods: parsedSpec.methods,
        },
        message: `Generating connector for "${parsedSpec.title}"...`,
    });
}

async function generateConnector(
    specFilePath: string,
    tempProjectPath: string,
    moduleName: string,
    projectName?: string,
    modifiedFiles?: string[]
): Promise<{ moduleName: string; importStatement: string; generatedFiles: Array<{ path: string; content: string }> }> {
    const importStatement = `import ${projectName || "project"}.${moduleName}`;
    const generatedFiles: Array<{ path: string; content: string }> = [];

    const response = await langClient.openApiGenerateClient({
        openApiContractPath: specFilePath,
        projectPath: tempProjectPath,
        module: moduleName,
    });

    if (!response.source || !response.source.textEditsMap) {
        throw new Error("LS API returned empty textEditsMap");
    }

    const textEditsMap = new Map(Object.entries(response.source.textEditsMap));

    for (const [filePath, edits] of textEditsMap.entries()) {
        const content = await applyTextEdits(filePath, edits);
        const relativePath = path.relative(tempProjectPath, filePath);

        await addToIntegration(tempProjectPath, [{ filePath: relativePath, content }]);
        recordAiTouchedFile(filePath);

        // The ai:// baseline is deliberately left alone here, for either kind of file this
        // loop writes: a brand-new one has to stay absent from it to read as an addition, and
        // an existing one (Ballerina.toml) keeps the baseline frozen at generation start.
        // See the notes in utils/project/ls-schema-notifications.ts.

        // Add .bal files to generatedFiles for agent visibility
        if (filePath.endsWith(".bal") && edits.length > 0) {
            generatedFiles.push({
                path: relativePath,
                content: edits[0].newText,
            });
        }

        // Track all generated files (including Ballerina.toml) for integration
        if (modifiedFiles) {
            modifiedFiles.push(relativePath);
        }
    }

    return { moduleName, importStatement, generatedFiles };
}

function handleSuccess(
    requestId: string,
    serviceName: string,
    parsedSpec: ParsedSpec,
    moduleName: string,
    importStatement: string,
    generatedFiles: Array<{ path: string; content: string }>,
    eventHandler: CopilotEventHandler
): SpecFetcherResult {
    eventHandler({
        type: "connector_generation_notification",
        requestId,
        stage: "generated",
        serviceName,
        spec: {
            version: parsedSpec.version,
            title: parsedSpec.title,
            description: parsedSpec.description,
            baseUrl: parsedSpec.baseUrl,
            endpointCount: parsedSpec.endpointCount,
            methods: parsedSpec.methods,
        },
        connector: {
            moduleName,
            importStatement,
        },
        message: `Generated connector module "${moduleName}" for "${parsedSpec.title}"`,
    });

    return {
        success: true,
        message: `Connector successfully generated for "${parsedSpec.title}". Use the import statement: ${importStatement}`,
        connector: {
            moduleName,
            importStatement,
            generatedFiles,
        },
    };
}

function handleError(
    error: any,
    serviceName: string,
    requestId: string,
    eventHandler?: CopilotEventHandler
): SpecFetcherResult {
    const errorMessage = error.message || "Unknown error";
    let errorCode: "USER_SKIPPED" | "INVALID_SPEC" | "PARSE_ERROR" | "UNSUPPORTED_VERSION" | "INVALID_INPUT";

    if (errorMessage.includes("Unsupported OpenAPI version")) {
        errorCode = "UNSUPPORTED_VERSION";
    } else if (errorMessage.includes("JSON") || errorMessage.includes("YAML")) {
        errorCode = "PARSE_ERROR";
    } else if (errorMessage.includes("required")) {
        errorCode = "INVALID_INPUT";
    } else {
        errorCode = "INVALID_SPEC";
    }

    if (eventHandler) {
        eventHandler({
            type: "connector_generation_notification",
            requestId,
            stage: "error",
            serviceName,
            error: {
                message: errorMessage,
                code: errorCode,
            },
            message: `Failed to process spec for ${serviceName}: ${errorMessage}`,
        });
    }

    return createErrorResult(errorCode, errorMessage, serviceName, error.stack);
}

async function waitForUserResponse(
    requestId: string,
    eventHandler: CopilotEventHandler
): Promise<{ provided: boolean; spec?: any; comment?: string }> {
    // Use ApprovalManager for connector spec approval (replaces state machine subscription)
    return approvalManager.requestConnectorSpec(requestId, eventHandler);
}

function createErrorResult(
    errorCode: "USER_SKIPPED" | "INVALID_SPEC" | "PARSE_ERROR" | "UNSUPPORTED_VERSION" | "INVALID_INPUT",
    errorMessage: string,
    serviceName: string,
    details?: string
): SpecFetcherResult {
    const errorDescriptions = {
        PARSE_ERROR: "The spec format is invalid.",
        UNSUPPORTED_VERSION: "The OpenAPI version is not supported.",
        INVALID_INPUT: "Invalid input provided.",
        INVALID_SPEC: "The spec is invalid or malformed.",
        USER_SKIPPED: "User skipped providing specification.",
    };

    return {
        success: false,
        message: `Failed to process OpenAPI specification for ${serviceName}. ${errorDescriptions[errorCode]} You may need to manually implement the integration or ask the user for a valid spec.`,
        error: errorMessage,
        errorCode,
        details,
    };
}

function parseSpec(content: string): { spec: any; format: "json" | "yaml" } {
    try {
        const result = JSON.parse(content);
        return { spec: result, format: "json" };
    } catch (jsonError: any) {
        try {
            const result = yaml.load(content) as any;
            return { spec: result, format: "yaml" };
        } catch (yamlError: any) {
            throw new Error("Invalid spec format. Both JSON and YAML parsing failed.");
        }
    }
}

function parseOpenApiSpec(spec: any): ParsedSpec {
    const version = spec.openapi || spec.swagger || "unknown";

    if (!version.startsWith("3.") && !version.startsWith("2.")) {
        throw new Error(`Unsupported OpenAPI version: ${version}`);
    }

    const info = spec.info || {};
    const title = info.title || "Untitled API";
    const description = info.description;

    const baseUrl = extractBaseUrl(spec);
    const services = extractServices(spec);
    const endpointCount = services.reduce((sum, service) => sum + service.endpoints.length, 0);
    const methods = extractMethods(spec);
    const schemas = extractSchemas(spec);
    const securitySchemes = extractSecuritySchemes(spec);

    return {
        version,
        title,
        description,
        baseUrl,
        endpointCount,
        methods,
        services,
        schemas,
        securitySchemes,
    };
}

function extractBaseUrl(spec: any): string | undefined {
    if (spec.servers && spec.servers.length > 0) {
        return spec.servers[0].url;
    }
    if (spec.host) {
        const scheme = spec.schemes?.[0] || "https";
        const basePath = spec.basePath || "";
        return `${scheme}://${spec.host}${basePath}`;
    }
    return undefined;
}

function extractMethods(spec: any): HttpMethod[] {
    const methods = new Set<HttpMethod>();
    const paths = spec.paths || {};

    for (const path in paths) {
        for (const method of Object.keys(paths[path])) {
            const upperMethod = method.toUpperCase();
            if (["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(upperMethod)) {
                methods.add(upperMethod as HttpMethod);
            }
        }
    }

    return Array.from(methods);
}

function extractServices(spec: any): ParsedService[] {
    const paths = spec.paths || {};
    const serviceMap = new Map<string, ParsedEndpoint[]>();

    for (const path in paths) {
        const pathItem = paths[path];

        for (const method of Object.keys(pathItem)) {
            const upperMethod = method.toUpperCase();
            if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(upperMethod)) {
                continue;
            }

            const operation = pathItem[method];
            const tags = operation.tags || ["default"];

            const endpoint: ParsedEndpoint = {
                path,
                method: upperMethod as HttpMethod,
                operationId: operation.operationId,
                summary: operation.summary,
                parameters: operation.parameters?.map((p: any) => p.name) || [],
                requestContentTypes: operation.requestBody?.content
                    ? Object.keys(operation.requestBody.content)
                    : undefined,
                responseContentTypes: operation.responses?.["200"]?.content
                    ? Object.keys(operation.responses["200"].content)
                    : undefined,
                responseType: operation.responses?.["200"]?.description,
            };

            for (const tag of tags) {
                if (!serviceMap.has(tag)) {
                    serviceMap.set(tag, []);
                }
                serviceMap.get(tag)!.push(endpoint);
            }
        }
    }

    const services: ParsedService[] = [];
    for (const [name, endpoints] of serviceMap.entries()) {
        const tagInfo = spec.tags?.find((t: any) => t.name === name);
        services.push({
            name,
            description: tagInfo?.description,
            endpoints,
        });
    }

    return services;
}

function extractSchemas(spec: any): ParsedSchema[] {
    const schemas: ParsedSchema[] = [];
    const components = spec.components || spec.definitions || {};
    const schemaObjects = components.schemas || components;

    for (const schemaName in schemaObjects) {
        const schema = schemaObjects[schemaName];
        schemas.push({
            name: schemaName,
            type: schema.type || "object",
            properties: schema.properties ? Object.keys(schema.properties) : undefined,
        });
    }

    return schemas;
}

function extractSecuritySchemes(spec: any): string[] | undefined {
    if (spec.components?.securitySchemes) {
        return Object.keys(spec.components.securitySchemes);
    }
    if (spec.securityDefinitions) {
        return Object.keys(spec.securityDefinitions);
    }
    return undefined;
}
