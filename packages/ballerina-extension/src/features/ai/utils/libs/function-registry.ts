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

import { generateObject, ModelMessage } from "ai";

import {
    GetFunctionResponse,
    GetFunctionsRequest,
    GetFunctionsResponse,
    getFunctionsResponseSchema,
    MinifiedClient,
    MinifiedRemoteFunction,
    MinifiedResourceFunction,
    MinifiedService,
    PathParameter,
} from "./function-types";
import { Client, GetTypeResponse, GetTypesRequest, GetTypesResponse, getTypesResponseSchema, Library, MiniType, RemoteFunction, ResourceFunction, Service, FixedService, Annotation } from "./library-types";
import { TypeDefinition, AbstractFunction, Type, RecordTypeDefinition, UnionTypeDefinition } from "./library-types";
import { getAnthropicClient, ANTHROPIC_HAIKU } from "../ai-client";
import { GenerationType } from "./libraries";
// import { getRequiredTypesFromLibJson } from "../healthcare/healthcare";
import { langClient } from "../../activator";

export interface ModelUsage {
    model: string;
    inputTokens: number;
    outputTokens: number;
}

export function mergeUsage(...usages: ModelUsage[]): ModelUsage[] {
    const map = new Map<string, ModelUsage>();
    for (const u of usages) {
        const existing = map.get(u.model);
        if (existing) {
            existing.inputTokens += u.inputTokens;
            existing.outputTokens += u.outputTokens;
        } else {
            map.set(u.model, { ...u });
        }
    }
    return Array.from(map.values());
}

// Constants for type definitions
const TYPE_RECORD = 'Record';
const TYPE_UNION = 'Union';
const TYPE_CONSTRUCTOR = 'Constructor';

export async function selectRequiredFunctions(prompt: string, selectedLibNames: string[], generationType: GenerationType): Promise<{ libraries: Library[], usage: ModelUsage[] }> {
    const selectedLibs: Library[] = await getMaximizedSelectedLibs(selectedLibNames);
    const { functionsResponse, usage: functionsUsage } = await getRequiredFunctions(selectedLibNames, prompt, selectedLibs, generationType);
    let typeLibraries: Library[] = [];
    const allUsages: ModelUsage[] = [...functionsUsage];
    if (generationType === GenerationType.HEALTHCARE_GENERATION) {
        const { types: resp, usage } = await getRequiredTypesFromLibJson(selectedLibNames, prompt, selectedLibs);
        typeLibraries = toTypesToLibraries(resp, selectedLibs);
        allUsages.push(usage);
    }
    const maximizedLibraries: Library[] = await toMaximizedLibrariesFromLibJson(functionsResponse, selectedLibs);
    const mergedLibraries = mergeLibrariesWithoutDuplicates(maximizedLibraries, typeLibraries);

    const result = { libraries: mergedLibraries, usage: mergeUsage(...allUsages) };
    return result;
}

function getClientFunctionCount(clients: MinifiedClient[]): number {
    return clients.reduce((count, client) => count + client.functions.length, 0);
}

function toTypesToLibraries(types: GetTypeResponse[], fullLibs: Library[]): Library[] {
    const librariesWithTypes: Library[] = [];

    for (const minifiedSelectedLib of types) {
        try {
            const fullDefOfSelectedLib = getLibraryByNameFromLibJson(minifiedSelectedLib.libName, fullLibs);
            if (!fullDefOfSelectedLib) {
                continue;
            }

            const filteredTypes = selectTypes(fullDefOfSelectedLib.typeDefs, minifiedSelectedLib);

            librariesWithTypes.push({
                name: fullDefOfSelectedLib.name,
                description: fullDefOfSelectedLib.description,
                typeDefs: filteredTypes,
                services: fullDefOfSelectedLib.services,
                annotations: fullDefOfSelectedLib.annotations,
                clients: [],
            });
        } catch (error) {
            console.error(`Error processing library ${minifiedSelectedLib.libName}:`, error);
        }
    }

    return librariesWithTypes;
}

function getLibraryByNameFromLibJson(libName: string, librariesJson: Library[]): Library | null {
    return librariesJson.find((lib) => lib.name === libName) || null;
}

function selectTypes(fullDefOfSelectedLib: any[], minifiedSelectedLib: GetTypeResponse): any[] {
    const typesResult = minifiedSelectedLib.types;
    if (!typesResult) {
        return [];
    }

    const output: any[] = [];

    if (fullDefOfSelectedLib.length === 0) {
        throw new Error("Complete type list is not available");
    }

    for (const miniType of typesResult) {
        const miniTypeName = miniType.name;

        for (const item of fullDefOfSelectedLib) {
            if (item.name === miniTypeName) {
                output.push(item);
                break;
            }
        }
    }

    return output;
}

async function getRequiredFunctions(
    libraries: string[],
    prompt: string,
    librariesJson: Library[],
    generationType: GenerationType
): Promise<{ functionsResponse: GetFunctionResponse[], usage: ModelUsage[] }> {
    if (librariesJson.length === 0) {
        return { functionsResponse: [], usage: [] };
    }
    const startTime = Date.now();

    const libraryList: GetFunctionsRequest[] = librariesJson
        .filter((lib) => libraryContains(lib.name, libraries))
        .map((lib) => ({
            name: lib.name,
            description: lib.description,
            clients: filteredClients(lib.clients),
            functions: filteredNormalFunctions(lib.functions, generationType),
            services: filteredServicesForRequest(lib.services),
        }));

    const largeLibs = libraryList.filter((lib) => getClientFunctionCount(lib.clients) >= 100);
    const smallLibs = libraryList.filter((lib) => !largeLibs.includes(lib));

    console.log(
        `[Parallel Execution Plan] Large libraries: ${largeLibs.length} (${largeLibs
            .map((lib) => lib.name)
            .join(", ")}), Small libraries: ${smallLibs.length} (${smallLibs.map((lib) => lib.name).join(", ")})`
    );

    // Create promises for large libraries (each processed individually)
    const largeLiberiesPromises = largeLibs.map((funcItem) =>
        getSuggestedFunctions(prompt, [funcItem])
    );

    // Create promise for small libraries (processed in bulk)
    const smallLibrariesPromise =
        smallLibs.length !== 0 ? getSuggestedFunctions(prompt, smallLibs) : Promise.resolve({ libraries: [] as GetFunctionResponse[], usage: { model: ANTHROPIC_HAIKU, inputTokens: 0, outputTokens: 0 } });

    console.log(
        `[Parallel Execution Start] Starting ${largeLiberiesPromises.length} large library requests + 1 small libraries bulk request`
    );
    const parallelStartTime = Date.now();

    // Wait for all promises to complete
    const allResults = await Promise.all([smallLibrariesPromise, ...largeLiberiesPromises]);
    const [smallLibResult, ...largeLibResults] = allResults;

    const parallelEndTime = Date.now();
    const parallelDuration = (parallelEndTime - parallelStartTime) / 1000;

    console.log(`[Parallel Execution Complete] Total parallel execution time: ${parallelDuration}s`);

    // Flatten the results
    const collectiveResp: GetFunctionResponse[] = [...smallLibResult.libraries, ...largeLibResults.flatMap(r => r.libraries)];
    const endTime = Date.now();
    const totalDuration = (endTime - startTime) / 1000;

    const aggregatedUsage = mergeUsage(...allResults.map(r => r.usage));

    console.log(
        `[getRequiredFunctions Complete] Total function count: ${collectiveResp.reduce(
            (total, lib) =>
                total +
                (lib.clients?.reduce((clientTotal, client) => clientTotal + client.functions.length, 0) || 0) +
                (lib.functions?.length || 0),
            0
        )}, Total duration: ${totalDuration}s, Preparation time: ${
            (parallelStartTime - startTime) / 1000
        }s, Parallel time: ${parallelDuration}s, Usage:`, aggregatedUsage
    );

    return { functionsResponse: collectiveResp, usage: aggregatedUsage };
}


async function getSuggestedFunctions(
    prompt: string,
    libraryList: GetFunctionsRequest[]
): Promise<{ libraries: GetFunctionResponse[], usage: ModelUsage }> {
    const startTime = Date.now();
    const libraryNames = libraryList.map((lib) => lib.name).join(", ");
    const functionCount = libraryList.reduce(
        (total, lib) => total + getClientFunctionCount(lib.clients) + (lib.functions?.length || 0),
        0
    );

    console.log(`[AI Request Start] Libraries: [${libraryNames}], Function Count: ${functionCount}`);

    const getLibSystemPrompt = `You are an AI assistant tasked with filtering and removing unwanted functions, clients, and services from a provided set of libraries based on a user query. The provided libraries are a subset of the full requirements for the query. Your goal is to return ONLY the relevant libraries, clients, functions, and services from the provided context that match the user's needs.

CRITICAL RULES:
1. Use ONLY items from Library_Context_JSON - do not create or infer new ones.
2. Your ONLY task is selection - include or exclude items, NEVER modify field values.
3. Copy all field values EXACTLY as provided - preserve every character including backslashes and special characters.
4. For resource functions: "accessor" and "paths" are SEPARATE fields - NEVER combine them.
5. A library is relevant if ANY of its clients, functions, or services match the query. Echo matching services under the library's "services" field (copy listener, name, and methods verbatim). If a library matches ONLY via its services, still include the library in the output with empty/omitted clients and functions.`;

    const getLibUserPrompt = `You will be provided with a list of libraries, clients, and their functions, and a user query.

<QUERY>
${prompt}
</QUERY>

<Library_Context_JSON>
${JSON.stringify(libraryList)}
</Library_Context_JSON>

To process the user query and filter the libraries, clients, services and functions, follow these steps:

1. Analyze the user query to understand the specific requirements or needs.
2. Review the provided libraries, clients, services and functions in Library_Context_JSON.
3. Select only the libraries, clients, services and functions that directly match the query's needs.
4. Exclude any irrelevant libraries, clients, services or functions.
5. If no relevant functions and services are found, return an empty array for libraries.
6. Organize the remaining relevant information.

CRITICAL - Field Preservation:
- For resource functions: "accessor" contains ONLY the HTTP method (e.g., "post", "get") - do NOT put path info in it.
- The "paths" field is separate - do NOT merge with accessor.
- Copy all values exactly - preserve backslashes, dots, and special characters.

Return the filtered subset with IDENTICAL field values.

Now, based on the provided libraries and the user query, please filter and return the relevant information.
`;

    const messages: ModelMessage[] = [
        { role: "system", content: getLibSystemPrompt },
        { role: "user", content: getLibUserPrompt },
    ];
    try {
        const { object, usage } = await generateObject({
            model: await getAnthropicClient(ANTHROPIC_HAIKU),
            maxOutputTokens: 8192,
            temperature: 0,
            messages: messages,
            schema: getFunctionsResponseSchema,
            abortSignal: new AbortController().signal,
        });

        const libList = object as GetFunctionsResponse;
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        // Filter to remove hallucinated libraries
        const filteredLibList = libList.libraries.filter((lib) =>
            libraryList.some((inputLib) => inputLib.name === lib.name)
        );

        const callUsage: ModelUsage = { model: ANTHROPIC_HAIKU, inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0 };
        console.log(
            `[AI Request Complete] Libraries: [${libraryNames}], Duration: ${duration}s, Selected Functions: ${libList.libraries.reduce(
                (total, lib) =>
                    total +
                    (lib.clients?.reduce((clientTotal, client) => clientTotal + client.functions.length, 0) || 0) +
                    (lib.functions?.length || 0),
                0
            )}, Usage:`, callUsage
        );

        printSelectedFunctions(filteredLibList);
        return { libraries: filteredLibList, usage: callUsage };
    } catch (error) {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        console.error(`[AI Request Failed] Libraries: [${libraryNames}], Duration: ${duration}s, Error: ${error}`);
        throw error;
    }
}

function printSelectedFunctions(libraries: GetFunctionResponse[]): void {
    console.log("Selected functions:", JSON.stringify(libraries, null, 2));
}

export function libraryContains(library: string, libraries: string[]): boolean {
    return libraries.includes(library);
}

function filteredClients(clients: Client[]): MinifiedClient[] {
    return clients.map((cli) => ({
        name: cli.name,
        description: cli.description,
        functions: filteredFunctions(cli.functions),
    }));
}

function filteredFunctions(
    functions: (RemoteFunction | ResourceFunction)[]
): (MinifiedRemoteFunction | MinifiedResourceFunction)[] {
    const output: (MinifiedRemoteFunction | MinifiedResourceFunction)[] = [];

    for (const item of functions) {
        if ("accessor" in item) {
            // ResourceFunction
            const res: MinifiedResourceFunction = {
                accessor: item.accessor,
                paths: item.paths,
                parameters: item.parameters.map((param) => param.name),
                returnType: item.return.type.name,
            };
            output.push(res);
        } else { // RemoteFunction
            if (item.type !== TYPE_CONSTRUCTOR) {
                const rem: MinifiedRemoteFunction = {
                    name: item.name,
                    parameters: item.parameters.map((param) => param.name),
                    returnType: item.return.type.name,
                };
                output.push(rem);
            }
        }
    }

    return output;
}

function filteredServicesForRequest(services?: Service[]): MinifiedService[] | undefined {
    if (!services || services.length === 0) {
        return undefined;
    }
    return services.map((svc) => {
        const result: MinifiedService = {
            listener: svc.listener.name,
        };
        if (svc.name) {
            result.name = svc.name;
        }
        if (svc.type === "fixed") {
            const methodNames = (svc as FixedService).methods.map((m) => m.name);
            if (methodNames.length > 0) {
                result.methods = methodNames;
            }
        }
        return result;
    });
}

function filteredNormalFunctions(functions?: RemoteFunction[], generationType?: GenerationType): MinifiedRemoteFunction[] | undefined {
    if (!functions) {
        return undefined;
    }

    return functions.map((item) => ({
        name: item.name,
        parameters: item.parameters.map((param) => param.name),
        returnType: item.return.type.name,
        ...(generationType === GenerationType.HEALTHCARE_GENERATION && { description: item?.description }),
    }));
}

export async function getMaximizedSelectedLibs(libNames: string[]): Promise<Library[]> {
    const result = (await langClient.getCopilotFilteredLibraries({
        libNames: libNames
    })) as { libraries: Library[] };
    const normalizedLibraries: Library[] = result.libraries.map(lib => {
            return {
                name: lib.name,
                description: lib.description,
                clients: lib.clients ? lib.clients : [],
                functions: lib.functions ? lib.functions : [],
                typeDefs: lib.typeDefs ? lib.typeDefs : [],
                services: lib.services ? lib.services : [],
                annotations: lib.annotations ? lib.annotations : [],
                instructions: lib.instructions ? lib.instructions : null,
                readme: lib.readme ? lib.readme : null,
            };
        });

    return normalizedLibraries;
}

export async function toMaximizedLibrariesFromLibJson(
    functionResponses: GetFunctionResponse[],
    originalLibraries: Library[]
): Promise<Library[]> {
    const minifiedLibrariesWithoutRecords: Library[] = [];

    for (const funcResponse of functionResponses) {
        console.log(`[toMaximizedLibrariesFromLibJson] Processing library: ${funcResponse.name}`);
        // Find the original library to get complete information
        const originalLib = originalLibraries.find((lib) => lib.name === funcResponse.name);
        if (!originalLib) {
            continue;
        }

        const filteredClients = selectClients(originalLib.clients, funcResponse);
        const filteredFunctions = selectFunctions(originalLib.functions, funcResponse);

        const maximizedLib: Library = {
            name: funcResponse.name,
            description: originalLib.description,
            clients: filteredClients,
            functions: filteredFunctions ? filteredFunctions : null,
            // Get only the type definitions that are actually used by the selected functions, clients, services, and annotations
            typeDefs: getOwnTypeDefsForLib(filteredClients, filteredFunctions, originalLib.typeDefs, originalLib.services, originalLib.annotations),
            services: originalLib.services ? originalLib.services : null,
            annotations: originalLib.annotations ? originalLib.annotations : null,
            instructions: originalLib.instructions ? originalLib.instructions : null,
            readme: originalLib.readme ? originalLib.readme : null,
        };

        minifiedLibrariesWithoutRecords.push(maximizedLib);
    }

    // Handle external type references
    const externalRecordsRefs = getExternalTypeDefsRefs(minifiedLibrariesWithoutRecords);
    await getExternalRecords(minifiedLibrariesWithoutRecords, externalRecordsRefs, originalLibraries);

    return minifiedLibrariesWithoutRecords;
}

function mergeLibrariesWithoutDuplicates(maximizedLibraries: Library[], typeLibraries: Library[]): Library[] {
    const finalLibraries: Library[] = maximizedLibraries;

    for (const typeLib of typeLibraries) {
        const finalLib = findLibraryByName(typeLib.name, finalLibraries);
        if (finalLib) {
            finalLib.typeDefs.push(...typeLib.typeDefs);
        } else {
            finalLibraries.push(typeLib);
        }
    }

    return finalLibraries;
}

function findLibraryByName(name: string, libraries: Library[]): Library | null {
    return libraries.find((lib) => lib.name === name) || null;
}

// Helper functions for type definition handling

function selectClients(originalClients: Client[], funcResponse: GetFunctionResponse): Client[] {
    if (!funcResponse.clients) {
        return [];
    }

    const newClients: Client[] = [];

    for (const minClient of funcResponse.clients) {
        const originalClient = originalClients.find((c) => c.name === minClient.name);
        if (!originalClient) {
            continue;
        }

        const completeClient: Client = {
            name: originalClient.name,
            description: originalClient.description,
            functions: [],
        };

        const output: (RemoteFunction | ResourceFunction)[] = [];

        // Add constructor if there are functions to add
        if (minClient.functions.length > 0) {
            const constructor = getConstructor(originalClient.functions);
            if (constructor) {
                output.push(constructor);
            }
        }

        // Add selected functions
        for (const minFunc of minClient.functions) {
            const completeFunc = getCompleteFuncForMiniFunc(minFunc, originalClient.functions);
            if (completeFunc) {
                output.push(completeFunc);
            }
        }

        completeClient.functions = output;
        newClients.push(completeClient);
    }

    return newClients;
}

function selectFunctions(
    originalFunctions: RemoteFunction[] | undefined,
    funcResponse: GetFunctionResponse
): RemoteFunction[] | undefined {
    if (!funcResponse.functions || !originalFunctions) {
        return undefined;
    }

    const output: RemoteFunction[] = [];

    for (const minFunc of funcResponse.functions) {
        const originalFunc = originalFunctions.find((f) => f.name === minFunc.name);
        if (originalFunc) {
            output.push(originalFunc);
        }
    }

    return output.length > 0 ? output : undefined;
}

function getConstructor(functions: (RemoteFunction | ResourceFunction)[]): RemoteFunction | null {
    for (const func of functions) {
        if ('type' in func && func.type === TYPE_CONSTRUCTOR) {
            return func as RemoteFunction;
        }
    }
    return null;
}

function normalizePaths(paths: (PathParameter | string)[]): string[] {
    return paths.map((path) => {
        const pathStr = typeof path === "string" ? path : path.name;
        return pathStr.replace(/\\./g, ".");
    });
}

function getCompleteFuncForMiniFunc(
    minFunc: MinifiedRemoteFunction | MinifiedResourceFunction,
    fullFunctions: (RemoteFunction | ResourceFunction)[]
): (RemoteFunction | ResourceFunction) | null {
    if ("name" in minFunc) {
        // MinifiedRemoteFunction
        return fullFunctions.find((f) => "name" in f && f.name === minFunc.name) || null;
    } else {
        // MinifiedResourceFunction
        return (
            fullFunctions.find(
                (f) =>
                    "accessor" in f &&
                    f.accessor === minFunc.accessor &&
                    JSON.stringify(normalizePaths(f.paths)) === JSON.stringify(normalizePaths(minFunc.paths))
            ) || null
        );
    }
}

function getOwnTypeDefsForLib(
    clients: Client[],
    functions: RemoteFunction[] | undefined,
    allTypeDefs: TypeDefinition[],
    services?: Service[],
    annotations?: Annotation[]
): TypeDefinition[] {
    const allFunctions: AbstractFunction[] = [];

    // Collect all functions from clients
    for (const client of clients) {
        allFunctions.push(...client.functions);
    }

    // Add standalone functions
    if (functions) {
        allFunctions.push(...functions);
    }

    return getOwnRecordRefs(allFunctions, allTypeDefs, services, annotations);
}

function getOwnRecordRefs(functions: AbstractFunction[], allTypeDefs: TypeDefinition[], services?: Service[], annotations?: Annotation[]): TypeDefinition[] {
    const ownRecords = new Map<string, TypeDefinition>();

    // Process all functions to find type references
    for (const func of functions) {
        // Check parameter types
        for (const param of func.parameters) {
            addInternalRecord(param.type, ownRecords, allTypeDefs);
        }

        // Check return type
        addInternalRecord(func.return.type, ownRecords, allTypeDefs);
    }

    // Process service listener parameters and fixed service method parameters
    if (services) {
        for (const service of services) {
            for (const param of service.listener.parameters) {
                addInternalRecord(param.type, ownRecords, allTypeDefs);
            }
            if (service.type === "fixed") {
                const fixedService = service as FixedService;
                for (const method of fixedService.methods) {
                    for (const param of method.parameters) {
                        addInternalRecord(param.type, ownRecords, allTypeDefs);
                    }
                    if (method.return?.type) {
                        addInternalRecord(method.return.type, ownRecords, allTypeDefs);
                    }
                }
            }
        }
    }

    // Process annotation type constraints
    if (annotations) {
        for (const annotation of annotations) {
            if (annotation.typeConstraint) {
                addInternalRecord(annotation.typeConstraint, ownRecords, allTypeDefs);
            }
        }
    }

    // Recursively process found type definitions to include dependent types
    const processedTypes = new Set<string>();
    const typesToProcess = Array.from(ownRecords.values());

    while (typesToProcess.length > 0) {
        const typeDef = typesToProcess.shift()!;

        if (processedTypes.has(typeDef.name)) {
            continue;
        }

        processedTypes.add(typeDef.name);

        if (typeDef.type === TYPE_RECORD) {
            const recordDef = typeDef as RecordTypeDefinition;
            for (const field of recordDef.fields) {
                const foundTypes = addInternalRecord(field.type, ownRecords, allTypeDefs);
                typesToProcess.push(...foundTypes);
            }
        } else if (typeDef.type === TYPE_UNION) {
            const unionDef = typeDef as UnionTypeDefinition;
            for (const member of unionDef.members) {
                const foundTypes = addInternalRecord(member.type, ownRecords, allTypeDefs);
                typesToProcess.push(...foundTypes);
            }
        }
    }

    return Array.from(ownRecords.values());
}

function addInternalRecord(
    paramType: Type,
    ownRecords: Map<string, TypeDefinition>,
    allTypeDefs: TypeDefinition[]
): TypeDefinition[] {
    const foundTypes: TypeDefinition[] = [];

    if (!paramType.links) {
        return foundTypes;
    }

    for (const link of paramType.links) {
        if (link.category === "internal") {
            if (isIgnoredRecordName(link.recordName)) {
                continue;
            }

            const typeDefResult = getTypeDefByName(link.recordName, allTypeDefs);

            // Temporarily remove descriptions to reduce payload size
            if (typeDefResult && "description" in typeDefResult) {
                delete typeDefResult.description;
            }
            if (typeDefResult && typeDefResult.type === TYPE_RECORD) {
                const recordDef = typeDefResult as RecordTypeDefinition;
                for (const field of recordDef.fields) {
                    if ("description" in field) {
                        delete field.description;
                    }
                }
            }
            if (typeDefResult) {
                ownRecords.set(link.recordName, typeDefResult);
                foundTypes.push(typeDefResult);
            } else {
                console.warn(`Type ${link.recordName} definition not found.`);
            }
        }
    }

    return foundTypes;
}

function isIgnoredRecordName(recordName: string): boolean {
    const ignoredRecords = [
        "CodeScanningAnalysisToolGuid",
        "AlertDismissedAt",
        "AlertFixedAt",
        "AlertAutoDismissedAt",
        "NullableAlertUpdatedAt",
        "ActionsCanApprovePullRequestReviews",
        "CodeScanningAlertDismissedComment",
        "ActionsEnabled",
        "PreventSelfReview",
        "SecretScanningAlertResolutionComment",
        "Conference_enum_update_status",
        "Message_enum_schedule_type",
        "Message_enum_update_status",
        "Siprec_enum_update_status",
        "Stream_enum_update_status",
    ];
    return ignoredRecords.includes(recordName);
}

function getTypeDefByName(name: string, typeDefs: TypeDefinition[]): TypeDefinition | null {
    return typeDefs.find((def) => def.name === name) || null;
}

function getExternalTypeDefsRefs(libraries: Library[]): Map<string, string[]> {
    const externalRecords = new Map<string, string[]>();

    for (const lib of libraries) {
        const allFunctions: AbstractFunction[] = [];

        // Collect all functions from clients
        for (const client of lib.clients) {
            allFunctions.push(...client.functions);
        }

        // Add standalone functions
        if (lib.functions) {
            allFunctions.push(...lib.functions);
        }

        getExternalTypeDefRefs(externalRecords, allFunctions, lib.typeDefs, lib.services, lib.annotations);
    }

    return externalRecords;
}

function getExternalTypeDefRefs(
    externalRecords: Map<string, string[]>,
    functions: AbstractFunction[],
    allTypeDefs: TypeDefinition[],
    services?: Service[],
    annotations?: Annotation[]
): void {
    // Check function parameters and return types
    for (const func of functions) {
        for (const param of func.parameters) {
            addExternalRecord(param.type, externalRecords);
        }
        addExternalRecord(func.return.type, externalRecords);
    }

    // Check service listener parameters and fixed service method parameters
    if (services) {
        for (const service of services) {
            for (const param of service.listener.parameters) {
                addExternalRecord(param.type, externalRecords);
            }
            if (service.type === "fixed") {
                const fixedService = service as FixedService;
                for (const method of fixedService.methods) {
                    for (const param of method.parameters) {
                        addExternalRecord(param.type, externalRecords);
                    }
                    if (method.return?.type) {
                        addExternalRecord(method.return.type, externalRecords);
                    }
                }
            }
        }
    }

    // Check annotation type constraints
    if (annotations) {
        for (const annotation of annotations) {
            if (annotation.typeConstraint) {
                addExternalRecord(annotation.typeConstraint, externalRecords);
            }
        }
    }

    // Check type definition fields
    for (const typeDef of allTypeDefs) {
        if (typeDef.type === TYPE_RECORD) {
            const recordDef = typeDef as RecordTypeDefinition;
            for (const field of recordDef.fields) {
                addExternalRecord(field.type, externalRecords);
            }
        } else if (typeDef.type === TYPE_UNION) {
            const unionDef = typeDef as UnionTypeDefinition;
            for (const member of unionDef.members) {
                addExternalRecord(member.type, externalRecords);
            }
        }
    }
}

function addExternalRecord(paramType: Type, externalRecords: Map<string, string[]>): void {
    if (!paramType.links) {
        return;
    }

    for (const link of paramType.links) {
        if (link.category === "external" && link.libraryName) {
            addLibraryRecords(externalRecords, link.libraryName, link.recordName);
        }
    }
}

function addLibraryRecords(externalRecords: Map<string, string[]>, libraryName: string, recordName: string): void {
    if (externalRecords.has(libraryName)) {
        const records = externalRecords.get(libraryName)!;
        if (!records.includes(recordName)) {
            records.push(recordName);
        }
    } else {
        externalRecords.set(libraryName, [recordName]);
    }
}

async function getExternalRecords(
    newLibraries: Library[],
    libRefs: Map<string, string[]>,
    cachedLibraries: Library[]
): Promise<void> {
    for (const [libName, recordNames] of libRefs.entries()) {
        if (libName.startsWith("ballerina/lang.int")) {
            // TODO: find a proper solution
            continue;
        }

        let library = cachedLibraries.find((lib) => lib.name === libName);
        if (!library) {
            const result = (await langClient.getCopilotFilteredLibraries({
                libNames: [libName]
            })) as { libraries: Library[] };
            if (result.libraries && result.libraries.length > 0) {
                library = result.libraries[0];
            } else {
                console.warn(`Library ${libName} could not be fetched. Skipping.`);
                continue;
            }
            console.log(`[getExternalRecords] Fetched library ${libName}:`, library);
        }

        for (const recordName of recordNames) {
            const typeDef = getTypeDefByName(recordName, library.typeDefs);
            if (!typeDef) {
                console.warn(`Record ${recordName} is not found in library ${libName}. Skipping the record.`);
                continue;
            }

            let newLibrary = newLibraries.find((lib) => lib.name === libName);
            if (!newLibrary) {
                newLibrary = {
                    name: libName,
                    description: library.description,
                    clients: [],
                    functions: null,
                    typeDefs: [typeDef],
                    services: library.services ? library.services : null,
                    annotations: library.annotations ? library.annotations : null,
                    instructions: library.instructions ? library.instructions : null,
                    readme: library.readme ? library.readme : null,
                };
                newLibraries.push(newLibrary);
            } else {
                // Check if type definition already exists
                const existingTypeDef = newLibrary.typeDefs.find((def) => def.name === recordName);
                if (!existingTypeDef) {
                    newLibrary.typeDefs.push(typeDef);
                }
            }
        }
    }
}

export async function getRequiredTypesFromLibJson(
    libraries: string[],
    prompt: string,
    librariesJson: Library[]
): Promise<{ types: GetTypeResponse[], usage: ModelUsage }> {
    const emptyUsage: ModelUsage = { model: ANTHROPIC_HAIKU, inputTokens: 0, outputTokens: 0 };
    if (librariesJson.length === 0) {
        return { types: [], usage: emptyUsage };
    }

    const typeDefs: GetTypesRequest[] = librariesJson
        .filter((lib) => libraryContains(lib.name, libraries))
        .map((lib) => ({
            name: lib.name,
            description: lib.description,
            types: filteredTypes(lib.typeDefs),
        }));

    if (typeDefs.length === 0) {
        return { types: [], usage: emptyUsage };
    }

    const getLibSystemPrompt = `You are an assistant tasked with selecting the Ballerina types needed to solve a given question based on a set of Ballerina libraries given in the context as a JSON.

Objective: Create a JSON output that includes a minimized version of the context JSON, containing only the selected libraries and types necessary to achieve a given question.

Context Format: A JSON Object that represents a library with its name and types.

Library Context JSON:
\`\`\`json
${JSON.stringify(typeDefs)}
\`\`\`

Think step-by-step to choose the required types in order to solve the given question.
1. Identify the unique entities that are required to answer the question. Create a small description for each identified entitiy to better explain their role.
2. When selecting the necessary Ballerina types that represents those entities, consider the following factors:
2.1 Take the description of the types from the context as a way to understand the entity represented by it.
2.2 Compare the types descriptions against the descriptions you generated for each identity and find the mapping types for each entity.
2.3 Find the Ballerina libraries of the selected types using the given context. Use ONLY the given context to find the libraries. 
3. For each selected type, find which fields of those types are required to answer the given question by referring to the given context. For each selected field; 
3.1 Understands the types of those fields by referring to the context. 
3.2 Context json has a link element which indicates the library name.
3.3 Make sure that you select those types and add to the output. When selecting those types pay attention to following:
3.3.1 For each new type, search the context and find the library which defines the new type. Use ONLY the given context to find the libraries. 
3.3.2 Add the found library and the types to the output. 
4. Once you select the types, please cross check and make sure they are placed under the correct library.
4.1 Go through each library and make sure they exist in the given context json.
4.2 Go through each library and verify the types by referring to the context.
4.2 Fix any issues found and try to re-identify the correct library the problematic type belongs to by referring to the context.
4.3 IT IS A MUST that you do these verification steps.
5. Simplify the type details as per the below rules.
5.1 Include only the type name in the context object. 
5.2 Include the name of the type as SAME as the original context.
6. For each selected type, Quote the original type from the context in the thinking field.
7. Respond using the Output format with the selected functions.

`;
    const getLibUserPrompt = "QUESTION\n```\n" + prompt + "\n```";

    const messages: ModelMessage[] = [
        { role: "system", content: getLibSystemPrompt },
        { role: "user", content: getLibUserPrompt },
    ];
    try {
        const { object, usage } = await generateObject({
            model: await getAnthropicClient(ANTHROPIC_HAIKU),
            maxOutputTokens: 8192,
            temperature: 0,
            messages: messages,
            schema: getTypesResponseSchema,
            abortSignal: new AbortController().signal,
        });

        const callUsage: ModelUsage = { model: ANTHROPIC_HAIKU, inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0 };
        console.log(`[getRequiredTypesFromLibJson] Usage:`, callUsage);

        const libList = object as GetTypesResponse;
        return { types: libList.libraries, usage: callUsage };
    } catch (error) {
        throw new Error(`Failed to parse bulk functions response: ${error}`);
    }
}

function filteredTypes(typeDefinitions: TypeDefinition[]): MiniType[] {
    return typeDefinitions.map((typeDef) => ({
        name: typeDef.name,
        description: typeDef.description,
    }));
}
