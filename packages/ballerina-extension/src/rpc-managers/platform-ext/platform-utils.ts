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

import { isSamePath, SyntaxTree } from "@wso2/ballerina-core";
import { ModulePart, CaptureBindingPattern } from "@wso2/syntax-tree";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { StateMachine } from "../../stateMachine";
import { Uri, WorkspaceEdit, workspace } from "vscode";
import { OpenAPIDefinition } from "./types";
import * as yaml from "js-yaml";
import { readContextDocument } from "@wso2/wso2-cloud-client";
import { extension } from "../../BalExtensionContext";
import { PersistOptions, createJSONStorage } from "zustand/middleware";
import Handlebars from "handlebars";
import { updateSourceCode } from "../../utils";

export const getConfigFileUri = () => {
    const configBalFile = path.join(StateMachine.context().projectPath, "config.bal");
    const configBalFileUri = Uri.file(configBalFile);
    if (!fs.existsSync(configBalFile)) {
        // create new config.bal if it doesn't exist
        fs.writeFileSync(configBalFile, "");
    }
    return configBalFileUri;
};

export const addConfigurable = async (
    configBalFileUri: Uri,
    params: { configName: string; configEnvName: string }[],
) => {
    const configBalEdits = new WorkspaceEdit();

    // if import doesn't exist, add it
    const syntaxTree = (await StateMachine.context().langClient.getSyntaxTree({
        documentIdentifier: { uri: configBalFileUri.toString() },
    })) as SyntaxTree;
    if (
        !(syntaxTree?.syntaxTree as ModulePart)?.imports?.some((item) => item.source?.includes("import ballerina/os"))
    ) {
        const balOsImportTemplate = Templates.importBalOs();
        configBalEdits.insert(configBalFileUri, new vscode.Position(0, 0), balOsImportTemplate);
    }

    const newConfigEditLine = (syntaxTree?.syntaxTree?.position?.endLine ?? 0) + 1;
    configBalEdits.insert(configBalFileUri, new vscode.Position(newConfigEditLine, 0), Templates.emptyLine());

    for (const item of params) {
        const newConfigTemplate = Templates.newEnvConfigurable({
            CONFIG_NAME: item.configName,
            CONFIG_ENV_NAME: item.configEnvName,
        });
        configBalEdits.insert(configBalFileUri, new vscode.Position(newConfigEditLine, 0), newConfigTemplate);
    }

    await updateSourceCode({
        textEdits: { [configBalFileUri.toString()]: configBalEdits.get(configBalFileUri) || [] },
        skipPayloadCheck: true,
    });
};

export const addConnection = async (
    connectionName: string,
    moduleName: string,
    securityType: "" | "oauth" | "apikey",
    requireProxy: boolean,
    configs: {
        apiKeyVarName: string;
        svsUrlVarName: string;
        tokenUrlVarName?: string;
        tokenClientIdVarName?: string;
        tokenClientSecretVarName?: string;
    },
): Promise<{ connName: string; connFileUri: Uri }> => {
    const matchingBalProj = StateMachine.context().projectStructure?.projects?.find(
        (item) => isSamePath(item.projectPath, StateMachine.context().projectPath),
    );
    if (!matchingBalProj) {
        throw new Error(`Failed to find bal project for :${StateMachine.context().projectPath}`);
    }

    const packageName = matchingBalProj.projectName;
    const connectionBalFile = path.join(StateMachine.context().projectPath, "connections.bal");
    const connectionBalFileUri = Uri.file(connectionBalFile);
    if (!fs.existsSync(connectionBalFile)) {
        fs.writeFileSync(connectionBalFile, "");
    }

    const connBalEdits = new WorkspaceEdit();

    // if import doesn't exist, add it
    const syntaxTree = (await StateMachine.context().langClient.getSyntaxTree({
        documentIdentifier: { uri: connectionBalFileUri.toString() },
    })) as SyntaxTree;

    if (
        !(syntaxTree?.syntaxTree as ModulePart)?.imports?.some((item) =>
            item.source?.includes(`import ${packageName}/${moduleName}`),
        )
    ) {
        const connImportTemplate = Templates.importConnection({ PACKAGE_NAME: packageName, MODULE_NAME: moduleName });
        connBalEdits.insert(connectionBalFileUri, new vscode.Position(0, 0), connImportTemplate);
    }

    const newConnEditLine = (syntaxTree?.syntaxTree?.position?.endLine ?? 0) + 1;
    connBalEdits.insert(connectionBalFileUri, new vscode.Position(newConnEditLine, 0), Templates.emptyLine());

    let baseName = connectionName?.replaceAll("-", "_").replaceAll(" ", "_");
    let candidate = baseName;
    let counter = 1;
    while (
        (syntaxTree.syntaxTree as ModulePart)?.members?.some(
            (k) => (k.typedBindingPattern?.bindingPattern as CaptureBindingPattern)?.variableName?.value === candidate,
        )
    ) {
        candidate = `${baseName}${counter}`;
        counter++;
    }

    let newConnTemplate = "";
    if (securityType === "") {
        newConnTemplate = Templates.newConnectionNoSecurity({
            CONNECTION_NAME: candidate,
            MODULE_NAME: moduleName,
            SERVICE_URL_VAR_NAME: configs.svsUrlVarName,
        });
    } else if (securityType === "oauth") {
        newConnTemplate = Templates.newConnectionWithOAuth({
            requireProxy,
            API_KEY_VAR_NAME: configs.apiKeyVarName,
            CONNECTION_NAME: candidate,
            MODULE_NAME: moduleName,
            SERVICE_URL_VAR_NAME: configs.svsUrlVarName,
            CLIENT_ID: configs.tokenClientIdVarName,
            CLIENT_SECRET: configs.tokenClientSecretVarName,
            TOKEN_URL: configs.tokenUrlVarName,
        });
    } else if (securityType === "apikey") {
        newConnTemplate = Templates.newConnectionWithApiKey({
            requireProxy,
            API_KEY_VAR_NAME: configs.apiKeyVarName,
            CONNECTION_NAME: candidate,
            MODULE_NAME: moduleName,
            SERVICE_URL_VAR_NAME: configs.svsUrlVarName,
        });
    }

    connBalEdits.insert(connectionBalFileUri, new vscode.Position(newConnEditLine, 0), newConnTemplate);

    await workspace.applyEdit(connBalEdits);
    return { connName: candidate, connFileUri: connectionBalFileUri };
};

export const getYamlString = (yamlString: string) => {
    try {
        if (/%[0-9A-Fa-f]{2}/.test(yamlString)) {
            const decoded = decodeURIComponent(yamlString);
            if (
                decoded !== yamlString &&
                (decoded.includes("\n") || decoded.includes(":") || /openapi/i.test(decoded))
            ) {
                return decoded;
            }
        }
        return yamlString;
    } catch {
        return yamlString;
    }
};

export const processOpenApiWithApiKeyAuth = (yamlString: string, securityType: "" | "oauth" | "apikey"): string => {
    try {
        const openApiDefinition = yaml.load(getYamlString(yamlString)) as OpenAPIDefinition;
        const oAuthSchemaName = "wso2CloudOAuth2";
        const apiKeySchemaName = "wso2CloudApiKeyAuth";

        if (!openApiDefinition) {
            throw new Error("Invalid YAML: Unable to parse OpenAPI definition");
        }

        if (!openApiDefinition.components) {
            openApiDefinition.components = {};
        }

        if (!openApiDefinition.components.securitySchemes && securityType !== "") {
            openApiDefinition.components.securitySchemes = {};
        }

        if (securityType === "oauth") {
            openApiDefinition.components.securitySchemes[oAuthSchemaName] = {
                type: "oauth2",
                flows: {
                    clientCredentials: {
                        tokenUrl: "tokenURL",
                        scopes: {},
                    },
                },
            };
        } else if (securityType === "apikey") {
            openApiDefinition.components.securitySchemes[apiKeySchemaName] = {
                type: "apiKey",
                in: "header",
                name: "Choreo-API-Key",
                "x-ballerina-name": "choreoAPIKey",
            };
        }

        if (!openApiDefinition.security && securityType !== "") {
            openApiDefinition.security = [];
        }
        if (securityType === "oauth") {
            openApiDefinition.security.push({ [oAuthSchemaName]: [], [apiKeySchemaName]: [] });
        } else if (securityType === "apikey") {
            openApiDefinition.security.push({ [apiKeySchemaName]: [] });
        }

        if (openApiDefinition.paths) {
            for (const path in openApiDefinition.paths) {
                for (const method in openApiDefinition.paths[path]) {
                    if (openApiDefinition.paths[path]?.[method]?.security) {
                        if (securityType === "oauth") {
                            openApiDefinition.paths[path]?.[method]?.security.push({
                                [oAuthSchemaName]: [],
                                [apiKeySchemaName]: [],
                            });
                        } else if (securityType === "apikey") {
                            openApiDefinition.paths[path]?.[method]?.security.push({ [apiKeySchemaName]: [] });
                        }
                    }
                }
            }
        }

        if (!openApiDefinition.servers || openApiDefinition.servers.length === 0) {
            openApiDefinition.servers = [{ url: "http://localhost:8080" }];
        }

        openApiDefinition.servers.forEach((server) => {
            if (typeof server.url === "string" && server.url.endsWith("/")) {
                server.url = server.url.slice(0, -1);
            }
        });

        return yaml.dump(openApiDefinition);
    } catch (error) {
        throw new Error(
            `Failed to process OpenAPI definition: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    }
};

/** Persisted-store version; bumped from v1 to v2 when the state moved to the platform's shapes (session, integrations, environments). */
const PLATFORM_STORE_VERSION = "v2";

export const getWorkspaceStateStore = (storeName: string): PersistOptions<any, any> => {
    const version = PLATFORM_STORE_VERSION;
    return {
        name: `${storeName}-${version}`,
        storage: createJSONStorage(() => ({
            getItem: async (name) => {
                const value = await extension.context.workspaceState.get(name);
                return value ? (value as string) : "";
            },
            removeItem: (name) => extension.context.workspaceState.update(name, undefined),
            setItem: (name, value) => extension.context.workspaceState.update(name, value),
        })),
        skipHydration: true,
    };
};

export const Templates = {
    emptyLine: () => {
        const template = Handlebars.compile(`\n`);
        return template({});
    },
    newEnvConfigurable: (params: { CONFIG_NAME: string; CONFIG_ENV_NAME: string }) => {
        const template = Handlebars.compile(
            `configurable string {{CONFIG_NAME}} = os:getEnv("{{CONFIG_ENV_NAME}}");\n`,
        );
        return template(params);
    },
    newDefaultEnvConfigurable: (params: { CONFIG_NAME: string }) => {
        const template = Handlebars.compile(`configurable string {{CONFIG_NAME}} = ?;\n`);
        return template(params);
    },
    importBalOs: () => {
        const template = Handlebars.compile(`import ballerina/os;\n`);
        return template({});
    },
    importConnection: (params: { PACKAGE_NAME: string; MODULE_NAME: string }) => {
        const template = Handlebars.compile(`import {{PACKAGE_NAME}}.{{MODULE_NAME}};\n`);
        return template(params);
    },
    newConnectionNoSecurity: (params: {
        MODULE_NAME: string;
        CONNECTION_NAME: string;
        SERVICE_URL_VAR_NAME: string;
    }) => {
        return `final ${params.MODULE_NAME}:Client ${params.CONNECTION_NAME} = check new (config = { timeout: 30 }, serviceUrl = ${params.SERVICE_URL_VAR_NAME});\n`;
    },
    newConnectionWithApiKey: (params: {
        requireProxy: boolean;
        MODULE_NAME: string;
        CONNECTION_NAME: string;
        SERVICE_URL_VAR_NAME: string;
        API_KEY_VAR_NAME: string;
    }) => {
        return `final ${params.MODULE_NAME}:Client ${
            params.CONNECTION_NAME
        } = check new (apiKeyConfig = { choreoAPIKey: ${params.API_KEY_VAR_NAME} }, config = { ${
            params.requireProxy ? `proxy: ${ProxyConfigEnvVars.proxyConfig.varName}, ` : ""
        }timeout: 60 }, serviceUrl = ${params.SERVICE_URL_VAR_NAME});\n`;
    },
    newConnectionWithOAuth: (params: {
        requireProxy: boolean;
        MODULE_NAME: string;
        CONNECTION_NAME: string;
        SERVICE_URL_VAR_NAME: string;
        API_KEY_VAR_NAME: string;
        TOKEN_URL: string;
        CLIENT_ID: string;
        CLIENT_SECRET: string;
    }) => {
        // todo: get params from LS
        return `final ${params.MODULE_NAME}:Client ${
            params.CONNECTION_NAME
        } = check new (config = { auth: { tokenUrl: ${params.TOKEN_URL}, clientId: ${params.CLIENT_ID}, clientSecret: ${
            params.CLIENT_SECRET
        } }, ${params.requireProxy ? `proxy: ${ProxyConfigEnvVars.proxyConfig.varName}, ` : ""}timeout: 60 }, serviceUrl = ${
            params.SERVICE_URL_VAR_NAME
        });\n`;
    },
};

/**
 * Whether the repository holding `projectPath` is linked to a cloud project: its `.wso2/context.yaml` has to
 * be a v2 document with an entry, as the cloud features read it. A v1 or unreadable file links nothing.
 */
export const hasContextYaml = (projectPath: string): boolean => {
    try {
        const repoRoot = getRepoRoot(projectPath);
        if (!repoRoot) {
            return false;
        }
        const content = fs.readFileSync(path.join(repoRoot, ".wso2", "context.yaml"), "utf-8");
        return readContextDocument(yaml.load(content)).length > 0;
    } catch {
        return false;
    }
};

export function getRepoRoot(projectRoot: string): string | undefined {
    // traverse up the directory tree until .git directory is found
    const gitDir = path.join(projectRoot, ".git");
    if (fs.existsSync(gitDir)) {
        return projectRoot;
    }
    // path is root return undefined
    if (projectRoot === path.parse(projectRoot).root) {
        return undefined;
    }
    return getRepoRoot(path.join(projectRoot, ".."));
}

export function getDomain(rawURL: string): string {
    try {
        const parsedURL = new URL(rawURL);
        return parsedURL.hostname;
    } catch (error) {
        throw new Error("");
    }
}

/**
 * Finds a unique connection name by checking against the existing names.
 * If the base name exists, appends a numeric counter until a unique name is found.
 * If the initial name is shorter than 3 characters, appends '-connection' to it.
 */
export const findUniqueConnectionName = (name: string, existing: { name: string }[]): string => {
    // If name is too short, append '-connection'
    let baseName = name;
    if (baseName.length < 3) {
        baseName = `${baseName}-connection`;
    }

    const existingNames = new Set(existing.map((item) => item.name.toLowerCase()));

    // Check if the base name exists
    let uniqueName = baseName;
    let counter = 1;

    while (existingNames.has(uniqueName.toLowerCase())) {
        uniqueName = `${baseName}${counter}`;
        counter++;
    }

    return uniqueName;
};

export const ProxyConfigEnvVars = {
    proxyHost:{
        varName: "wso2CloudProxyHost",
        envName: "BAL_CONFIG_VAR_WSO2CLOUDPROXYHOST",
    },
    proxyPort:{
        varName: "wso2CloudProxyPort",
        envName: "BAL_CONFIG_VAR_WSO2CLOUDPROXYPORT",
    },
    proxyConfig:{
        varName: "wso2CloudProxyConfig"
    }
};