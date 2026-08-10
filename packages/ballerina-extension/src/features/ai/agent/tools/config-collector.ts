// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

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
import { z } from "zod";
import { CopilotEventHandler } from "../../utils/events";
import { approvalManager } from "../../state/ApprovalManager";
import {
    ConfigVariable,
    ConfigKeyRename,
    getAllConfigStatus,
    validateVariableName,
    writeConfigValuesToConfig,
    createStatusMetadata,
    readExistingConfigValues,
    removeConfigKeys,
    renameConfigKeys,
    isPlaceholderValue,
    computeCollectStatus,
} from "../../../../utils/toml-utils";
import { ManagedConnectionGroup } from "@wso2/ballerina-core/lib/state-machine-types";
import { RecoverableAgentError, resolveContained, resolvePackageBasePath } from "./path-utils";
import { getOrgPackageName } from "../../../../utils/config";
import { langClient } from "../../activator";
import { extension } from "../../../../BalExtensionContext";
import {
    getManagedLibraries,
    ManagedLibrariesResponse,
    ManagedLibraryEntry,
} from "../../../../rpc-managers/platform-ext/managed-connections";

export const CONFIG_COLLECTOR_TOOL = "ConfigCollector";

// Constants for config file paths
const CONFIG_FILE_PATH = "Config.toml";
const TEST_CONFIG_FILE_PATH = "tests/Config.toml";

const ConfigVariableSchema = z.object({
    name: z.string().describe("Variable name in camelCase — must match the Ballerina configurable identifier exactly"),
    description: z.string().describe("Human-readable description"),
    secret: z.boolean().optional().describe("Mark as true for sensitive values (API keys, passwords, tokens) to render as a masked input"),
});

const ConfigKeyRenameSchema = z.object({
    from: z.string().describe("Current variable name in Config.toml"),
    to: z.string().describe("New variable name — must match the renamed configurable identifier in source"),
});

// Managed connections, discriminated by `authType` and `.strict()` so a partial or mixed group
// is rejected at the schema level rather than silently half-configured.
const RefreshTokenConnectionSchema = z.object({
    authType: z.literal("oauth2RefreshToken").describe("Discriminator: OAuth2 refresh-token grant"),
    library: z.string().describe("Connector library in 'org/package' form, e.g. '<org>/<connector>'"),
    clientId: z.string().describe("Configurable identifier holding the OAuth client ID"),
    clientSecret: z.string().describe("Configurable identifier holding the OAuth client secret"),
    refreshToken: z.string().describe("Configurable identifier holding the OAuth refresh token"),
    refreshUrl: z.string().describe("Configurable identifier holding the OAuth refresh URL"),
}).strict();

// A single long-lived token (bearer / bot / static). Any one-field client auth is a candidate;
// the registry decides whether it is actually managed.
const StaticTokenConnectionSchema = z.object({
    authType: z.literal("staticToken").describe("Discriminator: single static/bearer token"),
    library: z.string().describe("Connector library in 'org/package' form, e.g. '<org>/<connector>'"),
    token: z.string().describe("Configurable identifier holding the static/bearer token"),
}).strict();

// Exactly one shape per group; .strict() blocks mixing fields across shapes.
const ManagedConnectionSchema = z.discriminatedUnion("authType", [RefreshTokenConnectionSchema, StaticTokenConnectionSchema]);

const ConfigCollectorSchema = z.object({
    mode: z.enum(["collect", "check", "remove", "rename"]).describe("Operation mode"),
    filePath: z.string().optional().describe("Path to config file (for check mode)"),
    variables: z.array(ConfigVariableSchema).optional().describe("Configuration variables (collect mode)"),
    variableNames: z.array(z.string()).optional().describe(
        "Variable names — used by 'check' (verify; omit to list all) and 'remove' (keys to delete)."
    ),
    renames: z.array(ConfigKeyRenameSchema).optional().describe(
        "Rename pairs for 'rename' mode. The 'to' name must already exist as a configurable in source."
    ),
    isTestConfig: z.boolean().optional().describe("Set to true when collecting configuration for tests. Tool will automatically read from Config.toml and write to tests/Config.toml"),
    managedConnections: z.array(ManagedConnectionSchema).optional().describe("Managed connections, one per connector instance. Each is tagged with authType: 'oauth2RefreshToken' (clientId/clientSecret/refreshToken/refreshUrl) or 'staticToken' (a single token field). Repeat the same library for two clients of it. The tool verifies the (library, shape) is a managed provider; unsupported combinations fall back to manual entry."),
    packagePath: z.string().optional().describe(
        "Relative path to the target package within the workspace project (e.g., \"pkg1\"). " +
        "Required for workspace projects so Config.toml is written inside the correct package, not the workspace root. " +
        "Omit for single-package (non-workspace) projects."
    ),
});

interface RefreshTokenConnection {
    authType: "oauth2RefreshToken";
    library: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    refreshUrl: string;
}

interface StaticTokenConnection {
    authType: "staticToken";
    library: string;
    token: string;
}

type ManagedConnectionInput = RefreshTokenConnection | StaticTokenConnection;

interface ConfigCollectorInput {
    mode: "collect" | "check" | "remove" | "rename";
    filePath?: string;
    variables?: ConfigVariable[];
    variableNames?: string[];
    renames?: ConfigKeyRename[];
    isTestConfig?: boolean;
    managedConnections?: ManagedConnectionInput[];
    packagePath?: string;
}

export interface ConfigCollectorResult {
    success: boolean;
    message: string;
    status?: Record<string, "filled" | "missing">;
    userSkipped?: string[];
    error?: string;
    errorCode?: string;
}

interface SubmissionAnalysis {
    provided: Record<string, string>;
    notProvided: string[];
}

function classifySubmission(
    variables: ConfigVariable[],
    submitted: Record<string, string>
): SubmissionAnalysis {
    const provided: Record<string, string> = {};
    const notProvided: string[] = [];
    for (const variable of variables) {
        const raw = submitted[variable.name];
        if (raw && raw.trim()) {
            provided[variable.name] = raw;
        } else {
            notProvided.push(variable.name);
        }
    }
    return { provided, notProvided };
}

export interface ConfigCollectorPaths {
    tempPath: string;
    workspacePath: string;
}

// Helper functions
function getConfigPath(basePath: string, isTestConfig?: boolean): string {
    return isTestConfig
        ? path.join(basePath, "tests", "Config.toml")
        : path.join(basePath, "Config.toml");
}

function getConfigFileName(isTestConfig?: boolean): string {
    return isTestConfig ? TEST_CONFIG_FILE_PATH : CONFIG_FILE_PATH;
}

function validateConfigVariables(
    variables: ConfigVariable[] | undefined
): ConfigCollectorResult | null {
    if (!variables || variables.length === 0) {
        return createErrorResult(
            "NO_VARIABLES",
            "No variables provided to collect. " +
            "Always pass `variables` with the configurable identifiers from the code. " +
            "Use mode: 'check' first if you need to discover existing variable names in Config.toml."
        );
    }
    for (const variable of variables) {
        if (!validateVariableName(variable.name)) {
            return createErrorResult(
                "INVALID_VARIABLE_NAME",
                `Invalid variable name: ${variable.name}. Use camelCase alphanumeric names (e.g., apiKey)`
            );
        }
    }
    return null; // Valid
}

function createErrorResult(errorCode: string, message: string): ConfigCollectorResult {
    return {
        success: false,
        message,
        error: message,
        errorCode,
    };
}

export function createConfigCollectorTool(
    eventHandler: CopilotEventHandler,
    paths: ConfigCollectorPaths,
    modifiedFiles?: string[]
) {
    return tool({
        description: `
Manages configuration values in Config.toml for Ballerina integrations securely.

The codebase listing includes a <config_files main="present|absent" tests="present|absent"/> tag per project showing the initial state.
Before collecting, always call CHECK first (without variableNames) to discover any existing variable names and reuse them — Config.toml may have been added mid-session even if the listing shows absent.

IMPORTANT: Only call COLLECT mode immediately before executing the project (running or testing). Do NOT call it during code writing or implementation — even if the code has sensitive configurables. Write the code first, then collect config only when you are about to run or test.

REQUIRED ORDER:
1. Write the Ballerina source code including all 'configurable' declarations and save the file.
2. Only then call collect. Variable names are validated against the LS's view of the source.
   - If a name is not declared in source, you get UNKNOWN_CONFIGURABLE — check the code first.
   - If no configurables are found at all, you get NO_CONFIGURABLES_IN_SOURCE — write the code first.
Variable type is derived automatically from the source declaration — do NOT pass a type field.

Operation Modes:
1. COLLECT: Collect configuration values from the user
   - ALWAYS provide 'variables' — never call collect without them
   - Call ONLY immediately before running or testing the project — never during code writing
   - Shows a form; nothing is written until the user confirms. If the whole collection is cancelled, no file is created or modified
   - User may skip individual fields ('userSkipped' lists them). Do not re-prompt immediately. Only ask once more later if a value is truly needed for the run; if the user skips again, stop calling collect and tell them in chat what is missing
   - Pre-populates from existing Config.toml if it exists
   - When running tests, use isTestConfig: true — this is the only collect call needed; writes to tests/Config.toml after user confirms
   - For workspace projects, you MUST pass packagePath so the file is written inside the target package (not the workspace root)
   - Example: { mode: "collect", variables: [{ name: "stripeApiKey", description: "Stripe API key", secret: true }] }
   - Example (test): { mode: "collect", variables: [...], isTestConfig: true }
   - Example (workspace): { mode: "collect", variables: [...], packagePath: "pkg1" }

   Managed Connections:
   - If a CONNECTOR authenticates using credentials (configurables passed into the connector's ConnectionConfig / auth), pass those configurables as an entry in managedConnections — do NOT leave them in the plain variables array. This applies EVEN when the credential looks like an ordinary secret: a bearer token / bot token / access token used by a connector is a connector auth credential, not a plain variable. Tag each entry with authType:
       * authType: "oauth2RefreshToken" — OAuth2 refresh-token grant. Map all four configurables: clientId, clientSecret, refreshToken, refreshUrl (all required).
       * authType: "staticToken" — the connector authenticates with a SINGLE long-lived token (bearer token, bot token, access token, static token). Map the one configurable as token.
   - Key each group by the connector library in "org/package" form (e.g. "<org>/<connector>")
   - One entry per connector instance; repeat the same library if there are two clients of it
   - Put each configurable in EXACTLY ONE place: if it belongs to a managedConnections entry, it goes ONLY there and must NOT also appear in the variables array (and vice versa). Never list the same configurable name twice.
   - Be liberal: emit a group for ANY connector credential that fits one of these two shapes. You do NOT decide which are actually supported — the tool checks each (library, shape) against the managed registry and silently downgrades unsupported ones to manual entry, so grouping a candidate that turns out to be unsupported is harmless. That tolerance covers the library and shape only — every mapped name must be a configurable that already exists in source, spelled exactly as declared. Only leave TRULY non-connector secrets (e.g. a database password, or a standalone API key not tied to any connector) in the variables array
   - Example (refresh + static + standalone): { mode: "collect", managedConnections: [{ authType: "oauth2RefreshToken", library: "<org>/<connectorA>", clientId: "<clientIdVar>", clientSecret: "<clientSecretVar>", refreshToken: "<refreshTokenVar>", refreshUrl: "<refreshUrlVar>" }, { authType: "staticToken", library: "<org>/<connectorB>", token: "<tokenVar>" }], variables: [{ name: "serverPort", description: "HTTP listener port" }] }

2. CHECK: Inspect which values are filled or missing — can be called at any time
   - Returns variable names and status; never actual values
   - For workspace projects, pass packagePath to inspect the Config.toml of a specific package
   - Example (discover): { mode: "check" }
   - Example (verify): { mode: "check", variableNames: ["dbPassword", "apiKey"], filePath: "Config.toml" }
   - Example (workspace): { mode: "check", packagePath: "pkg1" }
   - Returns: { status: { dbPassword: "filled", apiKey: "missing" } }

3. REMOVE: Delete keys from Config.toml.

4. RENAME: Rename keys in Config.toml, preserving values. Rename the configurable in source first — the 'to' name must already match a source declaration.

Prefer REMOVE/RENAME over adding a dummy configurable to suppress unused-key errors.

VARIABLE NAMING:
Use camelCase names that match exactly the Ballerina configurable identifier. The name is written as-is to Config.toml.

SECURITY:
- You NEVER see actual configuration values
- Tool returns only status: { dbPassword: "filled" }
- NEVER hardcode configuration values in code`,
        inputSchema: ConfigCollectorSchema,
        execute: async (input) => {
            return await ConfigCollectorTool(
                input as ConfigCollectorInput,
                eventHandler,
                paths,
                modifiedFiles
            );
        },
    });
}

/**
 * Analyze existing configuration values to determine their status and appropriate UI message
 */
function analyzeExistingConfig(
    existingValues: Record<string, string>,
    variableNames: string[]
): {
    hasActualValues: boolean;
    hasPlaceholders: boolean;
    filledCount: number;
    message: string;
} {
    let filledCount = 0;
    let placeholderCount = 0;

    for (const name of variableNames) {
        const value = existingValues[name];
        if (value && !isPlaceholderValue(value)) {
            filledCount++;
        } else {
            placeholderCount++;
        }
    }

    let message = "";
    if (filledCount === 0) {
        message = "Configuration values needed";
    } else if (placeholderCount === 0) {
        message = "Found existing values. You can reuse or update them.";
    } else {
        message = "Complete the remaining configuration values";
    }

    return {
        hasActualValues: filledCount > 0,
        hasPlaceholders: placeholderCount > 0,
        filledCount,
        message
    };
}

export async function ConfigCollectorTool(
    input: ConfigCollectorInput,
    eventHandler: CopilotEventHandler,
    paths: ConfigCollectorPaths,
    modifiedFiles?: string[]
): Promise<ConfigCollectorResult> {
    if (!eventHandler) {
        return createErrorResult("INVALID_INPUT", "Event handler is required");
    }

    const requestId = crypto.randomUUID();

    try {
        switch (input.mode) {
            case "collect": {
                const { metas, managedVariables, degradedVariables } =
                    await resolveManagedConnections(input.managedConnections || []);

                // First-occurrence wins (managed → degraded → plain): the LLM sometimes lists a
                // credential in both a group and `variables`, and the group entry must win so the
                // field stays attached to its Connect card.
                const seenVarNames = new Set<string>();
                const allVariables = [
                    ...managedVariables,
                    ...degradedVariables,
                    ...(input.variables || []),
                ].filter((v) => {
                    if (seenVarNames.has(v.name)) { return false; }
                    seenVarNames.add(v.name);
                    return true;
                });

                return await handleCollectMode(
                    allVariables,
                    paths,
                    eventHandler,
                    requestId,
                    input.isTestConfig,
                    modifiedFiles,
                    input.packagePath,
                    metas.length > 0 ? metas : undefined
                );
            }

            case "check":
                return await handleCheckMode(
                    input.variableNames,
                    input.filePath,
                    paths,
                    input.isTestConfig,
                    input.packagePath
                );

            case "remove":
                return await handleRemoveMode(
                    input.variableNames,
                    paths,
                    input.isTestConfig,
                    modifiedFiles,
                    input.packagePath
                );

            case "rename":
                return await handleRenameMode(
                    input.renames,
                    paths,
                    input.isTestConfig,
                    modifiedFiles,
                    input.packagePath
                );

            default:
                // TypeScript should prevent this with discriminated unions
                return createErrorResult("INVALID_MODE", `Unknown mode: ${(input as any).mode}`);
        }
    } catch (error: any) {
        if (error instanceof RecoverableAgentError) {
            return createErrorResult(error.code, error.message);
        }
        return handleError(error, requestId, eventHandler);
    }
}

// Returns null on LS error (transient failure), {} when LS responded but found no configurables.
async function getConfigurableTypesFromSource(
    projectPath: string,
    orgName: string,
    packageName: string
): Promise<Record<string, string> | null> {
    try {
        const response = await langClient.getConfigVariablesV2({ projectPath, includeLibraries: false }) as any;
        const configVariables = response?.configVariables;
        if (!configVariables || typeof configVariables !== "object") {
            return {};
        }

        // Response is { [pkgKey: string]: { [moduleName: string]: ConfigVariable[] } }
        // where pkgKey is "org/packageName"
        const pkgKey = `${orgName}/${packageName}`;
        const modules = configVariables[pkgKey];
        if (!modules || typeof modules !== "object") {
            return {};
        }

        const types: Record<string, string> = {};
        for (const moduleVars of Object.values(modules)) {
            if (!Array.isArray(moduleVars)) { continue; }
            for (const variable of moduleVars) {
                const name = variable?.properties?.variable?.value;
                const type = variable?.properties?.type?.value;
                if (typeof name === "string" && name) {
                    types[name] = typeof type === "string" && type ? type : "string";
                }
            }
        }
        return types;
    } catch (error) {
        console.error("[ConfigCollector] Failed to query configurables from LS:", error);
        return null;
    }
}

// -----------------------------------------------------------------------------
// Managed-connection registry. The catalog lists which connector libraries can be brokered and under
// which grant shapes; a library is managed for a shape iff it lists a matching auth option, each
// pairing a `grant` with the provider key that brokers it. One library may list several options
// (e.g. Slack as a static token today, a refresh grant later). The HTTP call lives in
// rpc-managers/platform-ext/managed-connections.ts; this file only interprets the result.
// -----------------------------------------------------------------------------

// Only non-empty catalogs are cached — the common failure is "not signed in yet", and caching
// that would keep every group demoted for the rest of the session.
let managedLibrariesCache: ManagedLibrariesResponse | undefined;

// Never throws: on any failure an empty catalog demotes every candidate group to manual entry,
// which is the pre-feature behaviour, rather than blocking config collection.
async function fetchManagedLibraries(): Promise<ManagedLibrariesResponse> {
    if (managedLibrariesCache) {
        console.log(`[ConfigCollector][managed-connections] using cached managed-libraries catalog ` +
            `(${managedLibrariesCache.libraries.length} librar${managedLibrariesCache.libraries.length === 1 ? "y" : "ies"}).`);
        return managedLibrariesCache;
    }

    // Checked before any credential is read, so with the flag off nothing is contacted.
    if (!extension.ballerinaExtInstance.enabledExperimentalFeatures()) {
        console.log("[ConfigCollector][managed-connections] experimental features are off — skipping the " +
            "managed-libraries lookup; all candidate groups will be treated as unmanaged.");
        return { libraries: [] };
    }

    try {
        const data = await getManagedLibraries();

        if (!data || !Array.isArray(data.libraries)) {
            console.warn("[ConfigCollector][managed-connections] managed-libraries endpoint returned an unexpected " +
                "response shape — treating all candidate groups as unmanaged.");
            return { libraries: [] };
        }

        // Remote JSON: the response type asserts these shapes, nothing validates them. Dropping
        // malformed entries here keeps one bad entry from degrading anything but its own group.
        const libraries: ManagedLibraryEntry[] = [];
        for (const entry of data.libraries) {
            if (!entry || typeof entry.library !== "string" || !Array.isArray(entry.authOptions)) {
                continue;
            }
            libraries.push({
                library: entry.library,
                authOptions: entry.authOptions.filter(
                    (option) => option && typeof option.grant === "string" && typeof option.provider === "string"
                ),
            });
        }
        const dropped = data.libraries.length - libraries.length;
        if (dropped > 0) {
            console.warn(`[ConfigCollector][managed-connections] dropped ${dropped} malformed catalog ` +
                `entr${dropped === 1 ? "y" : "ies"} — their groups will fall back to manual entry.`);
        }

        // Cache only a catalog that actually carries entries — an empty one is indistinguishable
        // from a misconfigured or not-yet-deployed service, and is not worth pinning the session to.
        if (libraries.length > 0) {
            managedLibrariesCache = { libraries };
        }
        return { libraries };
    } catch (error: any) {
        console.error("[ConfigCollector][managed-connections] Failed to load the managed-libraries catalog " +
            "(unreachable, erroring, or not deployed) — treating all candidate groups as unmanaged:",
            error?.message || error);
        return { libraries: [] };
    }
}

interface ResolvedManagedConnections {
    // Metadata for groups that are managed (drives the grouped UI + proxy).
    metas: ManagedConnectionGroup[];
    // Credential configurables for managed groups (collected/proxied).
    managedVariables: ConfigVariable[];
    // Configurables for groups that fell back to manual entry.
    degradedVariables: ConfigVariable[];
}

// Configurables a group contributes when collected by hand — no managed provider matched its
// (library, shape), or the registry check failed.
function manualVariablesFor(group: ManagedConnectionInput): ConfigVariable[] {
    if (group.authType === "oauth2RefreshToken") {
        return [
            { name: group.clientId, description: "Client ID", type: "string", secret: true },
            { name: group.clientSecret, description: "Client Secret", type: "string", secret: true },
            { name: group.refreshToken, description: "Refresh Token", type: "string", secret: true },
            { name: group.refreshUrl, description: "Refresh URL", type: "string", secret: false },
        ];
    }
    return [
        { name: group.token, description: "Token", type: "string", secret: true },
    ];
}

// Partitions groups: those whose (library, shape) is a registered managed provider become
// managed metas, everything else degrades to manual configurables. The
// credentialField → variable mapping is taken as-is from the LLM, which has the code context;
// this only confirms the (library, shape) and applies the beta gate.
//
// Never throws: any failure degrades every group to manual entry rather than failing the collect.
async function resolveManagedConnections(groups: ManagedConnectionInput[]): Promise<ResolvedManagedConnections> {
    const result: ResolvedManagedConnections = { metas: [], managedVariables: [], degradedVariables: [] };
    if (groups.length === 0) { return result; }

    console.log(`[ConfigCollector][managed-connections] resolving ${groups.length} oauth group(s):`,
        groups.map((g) => ({ library: g.library, authType: g.authType })));

    try {
        const registry = await fetchManagedLibraries();
        const entriesByLibrary = new Map<string, ManagedLibraryEntry>(
            registry.libraries.map((e) => [e.library, e])
        );

        const experimentalEnabled = extension.ballerinaExtInstance.enabledExperimentalFeatures();

        for (const [index, group] of groups.entries()) {
            const entry = entriesByLibrary.get(group.library);
            const option = entry?.authOptions.find(
                (o) => o.grant === group.authType && (!o.beta || experimentalEnabled)
            );

            // `vendor` cannot be the key — two clients of one connector share a provider, and several
            // libraries can too. The index disambiguates and is stable for a metadata payload.
            const id = `${group.library}#${index}`;

            if (option) {
                const vendor = option.provider;
                console.log(`[ConfigCollector][managed-connections] '${group.library}' (${group.authType}) → MANAGED (provider: '${vendor}', id: '${id}')`);
                if (group.authType === "oauth2RefreshToken") {
                    result.metas.push({
                        id,
                        vendor,
                        authType: "oauth2RefreshToken",
                        variables: [
                            { name: group.clientId, credentialField: "clientId", description: "Client ID", secret: true },
                            { name: group.clientSecret, credentialField: "clientSecret", description: "Client Secret", secret: true },
                            { name: group.refreshToken, credentialField: "refreshToken", description: "Refresh Token", secret: true },
                        ],
                        refreshUrlVar: group.refreshUrl,
                    });
                    result.managedVariables.push(
                        { name: group.clientId, description: "Client ID", type: "string", secret: true },
                        { name: group.clientSecret, description: "Client Secret", type: "string", secret: true },
                        { name: group.refreshToken, description: "Refresh Token", type: "string", secret: true },
                        // Must be collected so it reaches Config.toml (the writer only writes declared
                        // variables), but it is not in meta.variables, so the form renders it as an
                        // ordinary editable field rather than a proxied secret.
                        { name: group.refreshUrl, description: "Refresh URL", type: "string", secret: false },
                    );
                } else {
                    result.metas.push({
                        id,
                        vendor,
                        authType: "staticToken",
                        variables: [
                            { name: group.token, credentialField: "token", description: "Token", secret: true },
                        ],
                    });
                    result.managedVariables.push(
                        { name: group.token, description: "Token", type: "string", secret: true },
                    );
                }
            } else {
                // No matching managed (library, shape) option → collect the group's field(s) manually.
                console.warn(`[ConfigCollector][managed-connections] '${group.library}' (${group.authType}) → NOT managed; falling back to manual entry.`);
                result.degradedVariables.push(...manualVariablesFor(group));
            }
        }
    } catch (error: any) {
        // Partial results are discarded: a half-built one would render Connect cards backed by a
        // lookup that did not finish.
        console.error("[ConfigCollector][managed-connections] failed to resolve managed connections — " +
            "falling back to manual entry for all candidate groups:", error?.message || error);
        return { metas: [], managedVariables: [], degradedVariables: groups.flatMap(manualVariablesFor) };
    }

    console.log(
        `[ConfigCollector][managed-connections] result — managed groups: [${result.metas.map((m) => `${m.id} → ${m.vendor}`).join(", ") || "none"}]; ` +
        `managed vars: [${result.managedVariables.map((v) => v.name).join(", ") || "none"}]; ` +
        `degraded vars: [${result.degradedVariables.map((v) => v.name).join(", ") || "none"}]`
    );

    return result;
}

async function handleCollectMode(
    variables: ConfigVariable[] | undefined,
    paths: ConfigCollectorPaths,
    eventHandler: CopilotEventHandler,
    requestId: string,
    isTestConfig?: boolean,
    modifiedFiles?: string[],
    packagePath?: string,
    managedConnections?: ManagedConnectionGroup[]
): Promise<ConfigCollectorResult> {
    const validationError = validateConfigVariables(variables);
    if (validationError) { return validationError; }

    // Resolve and validate the package base path. For workspace projects, the
    // agent must pass packagePath so Config.toml lands inside the target
    // package rather than the workspace root. The helper rejects directory
    // traversal attempts and missing-but-required values.
    const packageBasePath = resolvePackageBasePath(paths.tempPath, packagePath);
    const { orgName, packageName } = getOrgPackageName(packageBasePath);
    if (!orgName || !packageName) {
        return createErrorResult(
            "MISSING_PACKAGE_INFO",
            "Ballerina.toml is missing or does not declare both 'org' and 'name' under [package]. Cannot scope Config.toml to the correct section."
        );
    }

    // Derive variable types from the LS rather than accepting them from the agent.
    // The LS reads the 'configurable' declarations already written in source.
    const sourceTypes = await getConfigurableTypesFromSource(packageBasePath, orgName, packageName);
    if (sourceTypes === null) {
        return createErrorResult(
            "LS_UNAVAILABLE",
            "Language server is unavailable or failed to respond. Wait a moment and retry."
        );
    }
    if (Object.keys(sourceTypes).length === 0) {
        return createErrorResult(
            "NO_CONFIGURABLES_IN_SOURCE",
            "No configurables found in source. Write the 'configurable' declarations in code first and save, then call collect again."
        );
    }

    const unknownNames = variables.filter(v => !(v.name in sourceTypes));
    if (unknownNames.length > 0) {
        return createErrorResult(
            "UNKNOWN_CONFIGURABLE",
            `Variables not declared in source: ${unknownNames.map(v => v.name).join(", ")}. ` +
            `Available in source: ${Object.keys(sourceTypes).join(", ")}. ` +
            `Verify the configurable declarations in your .bal files match the names you're passing, then retry.`
        );
    }

    // Enrich variables with LS-derived types so the writer uses the correct type.
    const enrichedVariables: ConfigVariable[] = variables.map(v => ({ ...v, type: sourceTypes[v.name] }));

    // Determine paths based on isTestConfig flag
    const configPath = getConfigPath(packageBasePath, isTestConfig);

    // Priority: tests/Config.toml → Config.toml → empty
    const mainConfigPath = path.join(packageBasePath, "Config.toml");
    const sourceConfigPath = isTestConfig
        ? (fs.existsSync(configPath) ? configPath : mainConfigPath)
        : configPath;

    // Read existing configuration values from source config (if they exist) for pre-populating the form
    const existingValues = readExistingConfigValues(
        sourceConfigPath,
        variables.map(v => v.name),
        orgName,
        packageName
    );

    // Analyze existing values to determine appropriate messaging
    const analysis = analyzeExistingConfig(
        existingValues,
        variables.map(v => v.name)
    );

    const configFileName = getConfigFileName(isTestConfig);
    console.log(`[ConfigCollector] collect requested=${enrichedVariables.length} preFilled=${analysis.filledCount} file=${configFileName}`);

    // Determine the message to show to user
    // Vendors are deduped — several groups can share one provider.
    const userMessage = managedConnections?.length
        ? `Configure ${[...new Set(managedConnections.map(g => g.vendor))].join(", ")} credentials`
        : isTestConfig
            ? (analysis.hasActualValues
                ? "Found values from main config. You can reuse or update them for testing."
                : "Test configuration values needed")
            : (analysis.hasActualValues
                ? "Update configuration values"
                : "Configuration values needed");

    // Request configuration values from user via ApprovalManager
    // This returns ACTUAL values (not exposed to agent)
    const userResponse = await approvalManager.requestConfiguration(
        requestId,
        enrichedVariables,
        existingValues,
        eventHandler,
        isTestConfig,
        userMessage,
        managedConnections
    );

    if (!userResponse.provided) {
        console.log(`[ConfigCollector] collect cancelled file=${configFileName}`);
        eventHandler({
            type: "configuration_collection_event",
            requestId,
            stage: "skipped",
            message: `Configuration collection skipped${userResponse.comment ? ": " + userResponse.comment : ""}`,
            isTestConfig,
        });

        return {
            success: false,
            message: `User cancelled configuration collection${userResponse.comment ? ": " + userResponse.comment : ""}.`,
            error: `User skipped${userResponse.comment ? ": " + userResponse.comment : ""}`,
            errorCode: "USER_CANCELLED",
        };
    }

    // Split provided values from skipped names; only write what the user actually filled.
    const { provided, notProvided } = classifySubmission(enrichedVariables, userResponse.configValues!);

    // Skipped names that had a non-placeholder existing value are preserved silently on disk;
    // the agent only needs to know about the ones truly missing from Config.toml.
    const skippedNew = notProvided.filter(
        name => !existingValues[name] || isPlaceholderValue(existingValues[name])
    );

    const providedCount = Object.keys(provided).length;
    const preservedCount = notProvided.length - skippedNew.length;
    console.log(`[ConfigCollector] collect saved=${providedCount} skippedNew=${skippedNew.length} preserved=${preservedCount} requested=${enrichedVariables.length} file=${configFileName}`);

    writeConfigValuesToConfig(configPath, provided, enrichedVariables, orgName, packageName);

    // Track modified file for syncing to workspace.
    // Path is relative to tempProjectPath, so prefix with packagePath for workspace projects.
    if (modifiedFiles) {
        const relativeConfigPath = packagePath
            ? path.join(packagePath, configFileName)
            : configFileName;
        if (!modifiedFiles.includes(relativeConfigPath)) {
            modifiedFiles.push(relativeConfigPath);
        }
    }

    // Status reflects post-write Config.toml: "filled" includes preserved existing values.
    const statusMetadata = computeCollectStatus(enrichedVariables, provided, existingValues);

    // Clear values from memory; NEVER return actual values to agent
    userResponse.configValues = undefined;

    eventHandler({
        type: "configuration_collection_event",
        requestId,
        stage: "done",
        message: isTestConfig
            ? "Test configuration saved to tests/Config.toml"
            : "Configuration saved to Config.toml",
        isTestConfig,
    });

    const userNote = userResponse.comment ? ". User note: " + userResponse.comment : "";
    const message = skippedNew.length > 0
        ? `Saved ${providedCount} value(s) to ${configFileName}. User skipped: [${skippedNew.join(", ")}]${userNote}`
        : `Saved ${providedCount} configuration value(s) to ${configFileName}${userNote}`;

    return {
        success: true,
        message,
        status: statusMetadata,
        ...(skippedNew.length > 0 ? { userSkipped: skippedNew } : {}),
    };
}

async function handleCheckMode(
    variableNames: string[] | undefined,
    filePath: string | undefined,
    paths: ConfigCollectorPaths,
    isTestConfig?: boolean,
    packagePath?: string
): Promise<ConfigCollectorResult> {
    // Resolve and validate the package base path. For workspace projects the
    // agent must pass packagePath to inspect a specific package's Config.toml.
    const packageBasePath = resolvePackageBasePath(paths.tempPath, packagePath);
    const { orgName, packageName } = getOrgPackageName(packageBasePath);
    if (!orgName || !packageName) {
        return createErrorResult(
            "MISSING_PACKAGE_INFO",
            "Ballerina.toml is missing or does not declare both 'org' and 'name' under [package]. Cannot scope Config.toml to the correct section."
        );
    }

    let configPath: string;
    let configFileName: string;
    if (filePath) {
        // filePath is also untrusted agent input — validate containment so
        // it cannot escape the package directory via `..` segments.
        configPath = resolveContained(packageBasePath, filePath);
        configFileName = path.basename(filePath);
    } else {
        configPath = getConfigPath(packageBasePath, isTestConfig);
        configFileName = getConfigFileName(isTestConfig);
    }

    if (!fs.existsSync(configPath)) {
        return {
            success: false,
            message: `${configFileName} not found. Use collect mode to create it.`,
            error: "FILE_NOT_FOUND",
            errorCode: "FILE_NOT_FOUND",
        };
    }

    const status = getAllConfigStatus(configPath, orgName, packageName);

    // When specific names are provided, pad any that are absent from the file as "missing"
    if (variableNames && variableNames.length > 0) {
        for (const name of variableNames) {
            if (!(name in status)) {
                status[name] = "missing";
            }
        }
    }

    const filledNames = Object.entries(status).filter(([, s]) => s === "filled").map(([n]) => n);
    const missingNames = Object.entries(status).filter(([, s]) => s === "missing").map(([n]) => n);

    console.log(`[ConfigCollector] check ${configFileName} filled=${filledNames.length} missing=${missingNames.length}`);

    return {
        success: true,
        message:
            `${configFileName}: ` +
            `filled: [${filledNames.join(", ") || "none"}], ` +
            `missing: [${missingNames.join(", ") || "none"}]`,
        status,
    };
}

async function handleRemoveMode(
    variableNames: string[] | undefined,
    paths: ConfigCollectorPaths,
    isTestConfig: boolean | undefined,
    modifiedFiles: string[] | undefined,
    packagePath: string | undefined
): Promise<ConfigCollectorResult> {
    if (!variableNames || variableNames.length === 0) {
        return createErrorResult(
            "NO_VARIABLES",
            "No variable names provided to remove. Pass 'variableNames' with the keys to delete from Config.toml."
        );
    }
    for (const name of variableNames) {
        if (!validateVariableName(name)) {
            return createErrorResult(
                "INVALID_VARIABLE_NAME",
                `Invalid variable name: ${name}. Use camelCase alphanumeric names (e.g., apiKey).`
            );
        }
    }

    const packageBasePath = resolvePackageBasePath(paths.tempPath, packagePath);
    const { orgName, packageName } = getOrgPackageName(packageBasePath);
    if (!orgName || !packageName) {
        return createErrorResult(
            "MISSING_PACKAGE_INFO",
            "Ballerina.toml is missing or does not declare both 'org' and 'name' under [package]. Cannot scope Config.toml to the correct section."
        );
    }

    const configPath = getConfigPath(packageBasePath, isTestConfig);
    const configFileName = getConfigFileName(isTestConfig);

    if (!fs.existsSync(configPath)) {
        return {
            success: true,
            message: `${configFileName} does not exist; nothing to remove.`,
        };
    }

    const { removed, notFound } = removeConfigKeys(configPath, variableNames, orgName, packageName);

    if (removed.length > 0 && modifiedFiles) {
        const relativeConfigPath = packagePath
            ? path.join(packagePath, configFileName)
            : configFileName;
        if (!modifiedFiles.includes(relativeConfigPath)) {
            modifiedFiles.push(relativeConfigPath);
        }
    }

    console.log(`[ConfigCollector] remove ${configFileName} removed=${removed.length} notFound=${notFound.length}`);

    const parts: string[] = [];
    if (removed.length > 0) { parts.push(`removed: [${removed.join(", ")}]`); }
    if (notFound.length > 0) { parts.push(`not found: [${notFound.join(", ")}]`); }

    return {
        success: true,
        message: `${configFileName}: ${parts.join(", ") || "no changes"}`,
    };
}

async function handleRenameMode(
    renames: ConfigKeyRename[] | undefined,
    paths: ConfigCollectorPaths,
    isTestConfig: boolean | undefined,
    modifiedFiles: string[] | undefined,
    packagePath: string | undefined
): Promise<ConfigCollectorResult> {
    if (!renames || renames.length === 0) {
        return createErrorResult(
            "NO_RENAMES",
            "No rename pairs provided. Pass 'renames' as an array of { from, to } objects."
        );
    }
    for (const { from, to } of renames) {
        if (!validateVariableName(from) || !validateVariableName(to)) {
            return createErrorResult(
                "INVALID_VARIABLE_NAME",
                `Invalid variable name in rename pair: ${from} → ${to}. Use camelCase alphanumeric names.`
            );
        }
    }

    const packageBasePath = resolvePackageBasePath(paths.tempPath, packagePath);
    const { orgName, packageName } = getOrgPackageName(packageBasePath);
    if (!orgName || !packageName) {
        return createErrorResult(
            "MISSING_PACKAGE_INFO",
            "Ballerina.toml is missing or does not declare both 'org' and 'name' under [package]. Cannot scope Config.toml to the correct section."
        );
    }

    // The target name must exist in source — the agent should have renamed the
    // configurable declaration and saved before calling rename.
    const sourceTypes = await getConfigurableTypesFromSource(packageBasePath, orgName, packageName);
    if (sourceTypes === null) {
        return createErrorResult(
            "LS_UNAVAILABLE",
            "Language server is unavailable or failed to respond. Wait a moment and retry."
        );
    }
    const unknownTargets = renames.filter(r => !(r.to in sourceTypes));
    if (unknownTargets.length > 0) {
        return createErrorResult(
            "UNKNOWN_CONFIGURABLE",
            `Target names not declared in source: ${unknownTargets.map(r => r.to).join(", ")}. ` +
            `Available in source: ${Object.keys(sourceTypes).join(", ") || "none"}. ` +
            `Rename the configurable in your .bal files and save first, then retry.`
        );
    }

    const configPath = getConfigPath(packageBasePath, isTestConfig);
    const configFileName = getConfigFileName(isTestConfig);

    if (!fs.existsSync(configPath)) {
        return createErrorResult(
            "FILE_NOT_FOUND",
            `${configFileName} does not exist; nothing to rename. Use collect mode to create entries for the new names.`
        );
    }

    const { renamed, skipped } = renameConfigKeys(configPath, renames, orgName, packageName);

    if (renamed.length > 0 && modifiedFiles) {
        const relativeConfigPath = packagePath
            ? path.join(packagePath, configFileName)
            : configFileName;
        if (!modifiedFiles.includes(relativeConfigPath)) {
            modifiedFiles.push(relativeConfigPath);
        }
    }

    console.log(`[ConfigCollector] rename ${configFileName} renamed=${renamed.length} skipped=${skipped.length}`);

    const parts: string[] = [];
    if (renamed.length > 0) {
        parts.push(`renamed: [${renamed.map(r => `${r.from} -> ${r.to}`).join(", ")}]`);
    }
    if (skipped.length > 0) {
        parts.push(`skipped: [${skipped.map(s => `${s.from} -> ${s.to} (${s.reason})`).join(", ")}]`);
    }

    return {
        success: renamed.length > 0,
        message: `${configFileName}: ${parts.join(", ") || "no changes"}`,
    };
}

function handleError(
    error: any,
    requestId: string,
    eventHandler: CopilotEventHandler
): ConfigCollectorResult {
    const message = (error && typeof error.message === "string" && error.message) || String(error) || "Unknown error";
    const code = (error && error.code) || "UNKNOWN_ERROR";

    console.error("[ConfigCollector] Error:", error);

    eventHandler({
        type: "configuration_collection_event",
        requestId,
        stage: "error",
        message: `Error: ${message}`,
        error: {
            message,
            code,
        },
    });

    return {
        success: false,
        message: `Failed to manage configuration: ${message}`,
        error: message,
        errorCode: code,
    };
}
