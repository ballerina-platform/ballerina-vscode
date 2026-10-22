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
    SpecFetcherErrorCode,
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
import type { TextEdit } from "vscode-languageserver-protocol";
import { applyTextEdits } from "../utils";
import { approvalManager } from '../../state/ApprovalManager';
import { SUBAGENT_TOOL_NAME } from "../subagents/types";
import { recordAiTouchedFile } from "../../../../rpc-managers/diagram-validity";
import { addToIntegration } from "../../../../rpc-managers/ai-panel/utils";
import { writeBallerinaFileDidOpen } from "../../../../utils/modification";
import { isSupportedSpecVersion, resolveProvidedSpec, SpecContext, specVersion, withRelativeSpecPath } from "./connector-spec-source";
import { blockingValidationMessages, implementsServiceContract, selectOpenApiDesign, toServiceTypeName } from "./openapi-service-model";

export const CONNECTOR_GENERATOR_TOOL = "ConnectorGeneratorTool";

const SpecFetcherInputSchema = z.object({
    serviceName: z.string().describe("Name of the service/API that needs specification"),
    serviceDescription: z.string().optional().describe("Optional description of what the service is for"),
    attachmentFileName: z.string().optional().describe("File name of an OpenAPI spec the user attached in this conversation, exactly as shown in <User Attachments>. The tool reads the file itself; do not copy its content into specContent."),
    specUrl: z.string().optional().describe("URL of the OpenAPI spec, exactly as the user wrote it in their message"),
    specContent: z.string().optional().describe("Full OpenAPI spec text, only when the user pasted it into the message text"),
    mode: z.enum(["client", "service"]).optional().describe("client (default): generate a client connector for CALLING the API. service: generate an HTTP service that IMPLEMENTS the API described by the spec; use it when the user wants to create, build, implement or expose that API."),
});



export function createConnectorGeneratorTool(eventHandler: CopilotEventHandler, tempProjectPath: string, projectName?: string, modifiedFiles?: string[], specContext?: SpecContext, packagePath?: string) {
    return tool({
        description: `
Generates Ballerina code from a user-provided OpenAPI specification, in one of two modes:
- client (default): a connector module for CALLING the API described by the spec.
- service: an HTTP service that IMPLEMENTS the API described by the spec, with a resource for every operation and the spec's types. Use it when the user wants to create, build, implement or expose that API (e.g. "create an API using the attached definition").

Use this tool when:
1. Target service is custom, internal, or niche
2. User request is ambiguous and needs a SaaS connector
3. User explicitly requests to create a SaaS connector
4. After the Librarian subagent (${SUBAGENT_TOOL_NAME}) reports that no suitable connector exists
5. The user supplied an OpenAPI spec (attached, linked or pasted). Call this tool with it first, in the mode that matches the request, then build on the generated code and fix any remaining issues.

**CRITICAL: Do NOT call this tool again for the same service if the user has already skipped it (errorCode: USER_SKIPPED). Accept the skip and proceed without the connector.**

**If the user has already supplied the spec, pass it so they are not asked for it again:**
- Attached file, in this or an earlier message → attachmentFileName
- URL the user wrote → specUrl
- Pasted into the message text → specContent
Only when none of these apply does the tool ask the user for the spec.

**If the user has not supplied a spec, still call this tool; do not ask for the spec in chat.** The tool shows the user a form to upload, link or paste the spec, and lets them skip.

The tool will:
1. Use the spec the user already supplied, or otherwise request it from the user (supports JSON and YAML formats)
2. Save the spec to resources/specs/ directory
3. client mode: generate a connector module (client class, typed methods, record types, authentication) in the generated/moduleName submodule
4. service mode: generate the service contract type and the spec's record types in service_contract_<Type>.bal, and the listener plus a service with a stub for every resource in main.bal

In service mode the generated types and resource signatures come from the spec: do not rewrite, rename or duplicate them. Implement the resource bodies, then fix any remaining compilation errors.

Returns complete connector information for client mode (DO NOT read files, use the returned content directly):
- moduleName: Name of the generated submodule
- importStatement: Import statement to use in your code (e.g., "import project.moduleName")
- generatedFiles: Array with path and COMPLETE CONTENT of each generated .bal file
  * Each file object contains: { path: "relative/path/to/file.bal", content: "full file content" }
  * The content field contains the entire generated code - use it directly without reading files

# Examples
**Query**: Call the Foo API and sync its orders to Salesforce.
**Tool Call**: mode "client" → use the returned importStatement and client in your code.

**Query**: Create an API using the attached definition.
**Tool Call**: mode "service" → implement the generated resource stubs.

**Query**: Write a passthrough (proxy) service for the API in the attached spec.
**Tool Calls**: call this tool TWICE with the same spec: mode "service" to expose the API, then mode "client" to call the backend. Implement each resource by forwarding to the matching client method; do not hand-write HTTP calls to the backend.`,
        inputSchema: SpecFetcherInputSchema,
        execute: async (input: SpecFetcherInput): Promise<SpecFetcherResult> => {
            return await ConnectorGeneratorTool(input, eventHandler, tempProjectPath, projectName, modifiedFiles, specContext, packagePath);
        },
    });
}

export async function ConnectorGeneratorTool(
    input: SpecFetcherInput,
    eventHandler: CopilotEventHandler,
    tempProjectPath: string,
    projectName?: string,
    modifiedFiles?: string[],
    specContext?: SpecContext,
    packagePath?: string
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

    // A failure after the spec parses is in generation, not in the spec.
    let specAccepted = false;

    try {
        // Ask only when the user has not already supplied the spec through the chat.
        const provided = await resolveProvidedSpec(input, specContext ?? {});
        let spec: any;
        if (provided.kind === "resolved") {
            spec = provided.spec;
        } else {
            const reason = provided.kind === "unresolved" ? provided.reason : undefined;
            if (reason) {
                console.warn(`[ConnectorGeneratorTool] Could not use the supplied spec for ${input.serviceName}: ${reason}`);
            }
            const userInput = await requestSpecFromUser(requestId, input, eventHandler, reason);
            if (!userInput.provided) {
                return handleUserSkip(requestId, input, userInput.comment, eventHandler, reason);
            }
            spec = userInput.spec;
        }

        const { rawSpec, parsedSpec, originalContent, format } = parseAndValidateSpec(spec);
        specAccepted = true;

        // In a workspace project the package is a subfolder; the workspace root belongs to no package.
        const packageRoot = path.join(tempProjectPath, packagePath ?? "");
        const isService = input.mode === "service";

        const { specFilePath, sanitizedServiceName } = await saveSpecToWorkspace(
            originalContent,
            format,
            rawSpec,
            input.serviceName,
            packageRoot,
            tempProjectPath,
            modifiedFiles
        );

        if (isService) {
            sendGeneratingNotification(requestId, input.serviceName, parsedSpec, eventHandler, "service");
            const service = await generateService(specFilePath, packageRoot, tempProjectPath, parsedSpec, modifiedFiles);
            return handleServiceSuccess(requestId, input.serviceName, parsedSpec, service, eventHandler);
        }

        sendGeneratingNotification(requestId, input.serviceName, parsedSpec, eventHandler);

        const connector = await generateConnector(
            specFilePath,
            packageRoot,
            tempProjectPath,
            sanitizedServiceName,
            projectName,
            modifiedFiles
        );

        return handleSuccess(requestId, input.serviceName, parsedSpec, connector, eventHandler);
    } catch (error: any) {
        return handleError(error, input.serviceName, requestId, eventHandler, input.mode, specAccepted);
    }
}

async function requestSpecFromUser(
    requestId: string,
    input: SpecFetcherInput,
    eventHandler: CopilotEventHandler,
    reason?: string
): Promise<{ provided: boolean; spec?: any; comment?: string }> {
    // ApprovalManager emits the requesting_input event, so the card details go through it.
    return approvalManager.requestConnectorSpec(requestId, eventHandler, {
        mode: input.mode,
        serviceName: input.serviceName,
        serviceDescription: input.serviceDescription,
        reason,
        message: `Please provide OpenAPI specification for ${input.serviceName}${
            input.serviceDescription ? ` (${input.serviceDescription})` : ""
        }`,
    });
}

function handleUserSkip(
    requestId: string,
    input: SpecFetcherInput,
    comment: string | undefined,
    eventHandler: CopilotEventHandler,
    reason?: string
): SpecFetcherResult {
    const serviceName = input.serviceName;
    eventHandler({
        type: "connector_generation_notification",
        requestId,
        stage: "skipped",
        mode: input.mode,
        serviceName,
        reason,
        message: `Skipped providing spec for ${serviceName}${comment ? ": " + comment : ""}`,
    });

    const unusable = reason ? ` The spec the user supplied could not be used (${reason}), and they did not provide another.` : "";
    return {
        success: false,
        message: `User skipped providing OpenAPI specification for ${serviceName}.${unusable} Do NOT call this tool again for ${serviceName} — proceed with the implementation without this connector.`,
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
    saveRoot: string,
    tempProjectPath: string,
    modifiedFiles?: string[]
): Promise<{ specFilePath: string; sanitizedServiceName: string }> {
    const sanitizedServiceName = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const specsDir = path.join(saveRoot, "resources", "specs");
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
    eventHandler: CopilotEventHandler,
    mode: "client" | "service" = "client"
): void {
    eventHandler({
        type: "connector_generation_notification",
        requestId,
        stage: "generating",
        mode,
        serviceName,
        spec: {
            version: parsedSpec.version,
            title: parsedSpec.title,
            description: parsedSpec.description,
            baseUrl: parsedSpec.baseUrl,
            endpointCount: parsedSpec.endpointCount,
            methods: parsedSpec.methods,
        },
        message: `Generating ${mode === "service" ? "service" : "connector"} for "${parsedSpec.title}"...`,
    });
}

async function generateConnector(
    specFilePath: string,
    packageRoot: string,
    tempProjectPath: string,
    moduleName: string,
    projectName?: string,
    modifiedFiles?: string[]
): Promise<GeneratedConnector> {
    const importStatement = `import ${projectName || "project"}.${moduleName}`;

    const response = await langClient.openApiGenerateClient({
        openApiContractPath: specFilePath,
        projectPath: packageRoot,
        module: moduleName,
    });

    if (!response.source || !response.source.textEditsMap) {
        throw new Error("LS API returned empty textEditsMap");
    }

    // Applying the edits again would add a second copy of every file, as the low-code form also guards against.
    if (response.source.isModuleExists) {
        const moduleDir = path.join(packageRoot, "generated", moduleName);
        const generatedFiles = fs.existsSync(moduleDir)
            ? fs.readdirSync(moduleDir, { withFileTypes: true })
                .filter(entry => entry.isFile() && entry.name.endsWith(".bal"))
                .map(entry => path.join(moduleDir, entry.name))
                .map(file => ({ path: path.relative(tempProjectPath, file), content: fs.readFileSync(file, "utf-8") }))
            : [];
        return { moduleName, importStatement, generatedFiles, alreadyExisted: true };
    }

    const textEditsMap = Object.fromEntries(Object.entries(response.source.textEditsMap).map(([filePath, edits]) => [
        filePath,
        path.basename(filePath) === "Ballerina.toml"
            ? edits.map(edit => ({ ...edit, newText: withRelativeSpecPath(edit.newText, packageRoot, specFilePath) }))
            : edits,
    ]));
    const generatedFiles = await writeGeneratedEdits(textEditsMap, tempProjectPath, modifiedFiles);

    return { moduleName, importStatement, generatedFiles, alreadyExisted: false };
}

interface GeneratedConnector {
    moduleName: string;
    importStatement: string;
    generatedFiles: Array<{ path: string; content: string }>;
    /** True when the module already existed and was left unchanged. */
    alreadyExisted: boolean;
}

/** Applies the language server's edits and returns each edited .bal file in full. */
async function writeGeneratedEdits(
    textEditsMap: { [filePath: string]: TextEdit[] },
    tempProjectPath: string,
    modifiedFiles?: string[]
): Promise<Array<{ path: string; content: string }>> {
    const generatedFiles: Array<{ path: string; content: string }> = [];

    for (const [filePath, edits] of Object.entries(textEditsMap)) {
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
            generatedFiles.push({ path: relativePath, content });
        }

        // Track all generated files (including Ballerina.toml) for integration
        if (modifiedFiles) {
            modifiedFiles.push(relativePath);
        }
    }

    return generatedFiles;
}

/** Generates an HTTP service implementing the spec, the same way the service designer imports one. */
async function generateService(
    specFilePath: string,
    packageRoot: string,
    tempProjectPath: string,
    parsedSpec: ParsedSpec,
    modifiedFiles?: string[]
): Promise<GeneratedService> {
    const serviceTypeName = toServiceTypeName(parsedSpec.title);

    // Generating again would duplicate the service and every type. Only the name is checked, not the spec.
    const contractFile = path.join(packageRoot, `service_contract_${serviceTypeName}.bal`);
    if (fs.existsSync(contractFile)) {
        const serviceFile = fs.readdirSync(packageRoot, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.endsWith(".bal"))
            .map(entry => path.join(packageRoot, entry.name))
            .filter(file => file !== contractFile)
            .find(file => implementsServiceContract(fs.readFileSync(file, "utf-8"), serviceTypeName));
        if (!serviceFile) {
            throw new Error(`${path.basename(contractFile)} exists, but no service in the package implements ${serviceTypeName}`);
        }
        const generatedFiles = [contractFile, serviceFile]
            .map(file => ({ path: path.relative(tempProjectPath, file), content: fs.readFileSync(file, "utf-8") }));
        return { serviceTypeName, generatedFiles, alreadyExisted: true };
    }

    const mainFile = path.join(packageRoot, "main.bal");
    if (!fs.existsSync(mainFile)) {
        // Through the language server, so its loaded package includes the new file.
        await writeBallerinaFileDidOpen(mainFile, "\n");
    }

    const initResponse = await langClient.getServiceInitModel({
        filePath: mainFile,
        orgName: "ballerina",
        pkgName: "http",
        moduleName: "http",
        listenerName: "",
    });
    if (!initResponse.serviceInitModel) {
        throw new Error(`Could not load the HTTP service model: ${initResponse.errorMsg ?? "no model returned"}`);
    }

    const serviceInitModel = selectOpenApiDesign(initResponse.serviceInitModel, specFilePath, serviceTypeName);
    const response = await langClient.createServiceAndListener({ filePath: mainFile, serviceInitModel });

    if (response.errorMsg) {
        throw new Error(`Service generation failed: ${response.errorMsg}`);
    }
    const blocking = blockingValidationMessages(response.validationErrors);
    if (blocking.length > 0) {
        throw new Error(`Service generation was rejected: ${blocking.join("; ")}`);
    }
    if (!response.textEdits || Object.keys(response.textEdits).length === 0) {
        throw new Error("Service generation returned no source");
    }

    const generatedFiles = await writeGeneratedEdits(response.textEdits, tempProjectPath, modifiedFiles);
    return { serviceTypeName, generatedFiles, alreadyExisted: false };
}

function handleSuccess(
    requestId: string,
    serviceName: string,
    parsedSpec: ParsedSpec,
    connector: GeneratedConnector,
    eventHandler: CopilotEventHandler
): SpecFetcherResult {
    const { moduleName, importStatement, generatedFiles } = connector;
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

    if (connector.alreadyExisted) {
        return {
            success: true,
            message: `The project already has a connector module "${moduleName}", so nothing was regenerated and no files were changed. It may have been generated from a different version of the spec. Do NOT call this tool again for it. Use it with the import statement: ${importStatement}`,
            connector: { moduleName, importStatement, generatedFiles },
        };
    }

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

interface GeneratedService {
    serviceTypeName: string;
    generatedFiles: Array<{ path: string; content: string }>;
    /** True when a service of this name already existed and was left unchanged. */
    alreadyExisted: boolean;
}

function handleServiceSuccess(
    requestId: string,
    serviceName: string,
    parsedSpec: ParsedSpec,
    service: GeneratedService,
    eventHandler: CopilotEventHandler
): SpecFetcherResult {
    eventHandler({
        type: "connector_generation_notification",
        requestId,
        stage: "generated",
        mode: "service",
        serviceName,
        spec: {
            version: parsedSpec.version,
            title: parsedSpec.title,
            description: parsedSpec.description,
            baseUrl: parsedSpec.baseUrl,
            endpointCount: parsedSpec.endpointCount,
            methods: parsedSpec.methods,
        },
        message: `Generated service "${service.serviceTypeName}" for "${parsedSpec.title}"`,
    });

    if (service.alreadyExisted) {
        return {
            success: true,
            message: `The project already has a service generated as ${service.serviceTypeName} (from a spec titled "${parsedSpec.title}"), so nothing was regenerated and no files were changed. This only means a service with that name exists: it does NOT mean the existing files match the supplied spec, which may have changed since. Do NOT call this tool again for it. Compare the existing contract below with the supplied spec, update the contract and the service implementing it for any differences, and tell the user what you changed.`,
            service: { serviceTypeName: service.serviceTypeName, generatedFiles: service.generatedFiles },
        };
    }

    return {
        success: true,
        message: `Service generated for "${parsedSpec.title}" as ${service.serviceTypeName}. The types and resource signatures come from the spec: do not rewrite, rename or duplicate them. Implement the resource bodies in main.bal, then fix any remaining compilation errors.`,
        service: {
            serviceTypeName: service.serviceTypeName,
            generatedFiles: service.generatedFiles,
        },
    };
}

function handleError(
    error: any,
    serviceName: string,
    requestId: string,
    eventHandler?: CopilotEventHandler,
    mode?: "client" | "service",
    specAccepted = false
): SpecFetcherResult {
    const errorMessage = error.message || "Unknown error";
    let errorCode: SpecFetcherErrorCode;

    if (specAccepted) {
        errorCode = "GENERATION_FAILED";
    } else if (errorMessage.includes("Unsupported OpenAPI version")) {
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
            mode,
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

function createErrorResult(
    errorCode: SpecFetcherErrorCode,
    errorMessage: string,
    serviceName: string,
    details?: string
): SpecFetcherResult {
    if (errorCode === "GENERATION_FAILED") {
        return {
            success: false,
            message: `The OpenAPI specification for ${serviceName} was accepted, but generating code from it failed. Do NOT ask the user for the spec again. Read the error, then fix the cause in the project if it is there, or implement the integration directly from the spec.`,
            error: errorMessage,
            errorCode,
            details,
        };
    }

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
    const version = specVersion(spec) ?? "unknown";

    if (!isSupportedSpecVersion(version)) {
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
