/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { window, Uri, commands } from "vscode";
import { existsSync, readFileSync, writeFile } from "fs";
import { BAL_CONFIG_FILE, MESSAGES, PALETTE_COMMANDS, clearTerminal } from "../project";
import { BallerinaExtension, ExtendedLangClient } from "../../core";
import { getCurrentBallerinaProject, getCurrentProjectRoot } from "../../utils/project-utils";
import { typeOfComment } from "./utils";
import { ConfigProperty, ConfigTypes, Constants, Property } from "./model";
import { BallerinaProject, ConfigVariableResponse, EVENT_TYPE, isSamePath, MACHINE_VIEW, PackageConfigSchema, ProjectDiagnosticsResponse, SyntaxTree } from "@wso2/ballerina-core";
import { TextDocumentEdit } from "vscode-languageserver-types";
import { modifyFileContent } from "../../utils/modification";
import { fileURLToPath } from "url";
import { startDebugging } from "../editor-support/activator";
import { openView, StateMachine } from "../../stateMachine";
import * as path from "path";
import { TracerMachine } from "../tracing";
import { VisualizerWebview } from "../../views/visualizer/webview";
import { selectIntegrationOrPrompt } from "../../utils/command-utils";
import { refreshDefaultProviderToken } from "../ai/utils";

const UNUSED_IMPORT_ERR_CODE = "BCE2002";

export async function prepareAndGenerateConfig(
    ballerinaExtInstance: BallerinaExtension,
    projectPath: string,
    isCommand?: boolean,
    isBi?: boolean,
    executeRun: boolean = true,
    needsPackageSelection: boolean = false
): Promise<boolean> {

    let packagePath: string;
    let packageName: string;

    if (needsPackageSelection) {
        try {
            const packages = StateMachine.context().projectInfo?.children;
            // Show integration NAMES in the picker (paths only as descriptions).
            const integrationItems = packages?.map((child) => ({
                name: child.name,
                projectPath: child.projectPath
            })) ?? [];

            const selectedPackage = await selectIntegrationOrPrompt(integrationItems, "Select an integration to run");
            if (!selectedPackage) {
                return false;
            }

            const selectedPackageInfo = packages?.find((child) => isSamePath(child.projectPath, selectedPackage));

            if (!selectedPackageInfo) {
                throw new Error("Failed to find selected package information.");
            }

            packagePath = selectedPackageInfo.projectPath;
            packageName = selectedPackageInfo.name;
            
            if (isBi) {
                openView(
                    EVENT_TYPE.OPEN_VIEW,
                    { view: MACHINE_VIEW.PackageOverview, projectPath: selectedPackage },
                    true
                );
            }
        } catch (error) {
            console.error("Error selecting integration:", error);
            return false;
        }
    } else {
        const currentProject: BallerinaProject | undefined = await getCurrentBIProject(projectPath);

        if (!currentProject) {
            window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
            return false;
        }

        packagePath = currentProject.path;
        packageName = currentProject.packageName;

        const isWebviewOpen = VisualizerWebview.currentPanel !== undefined;
        if (isBi && !isWebviewOpen) {
            openView(
                EVENT_TYPE.OPEN_VIEW,
                { view: MACHINE_VIEW.PackageOverview, projectPath: packagePath },
                true
            );
        }
    }

    await refreshDefaultProviderToken(packagePath);

    const ignoreFile = path.join(packagePath, ".gitignore");
    const configFile = path.join(packagePath, BAL_CONFIG_FILE);

    const hasWarnings = (
        await checkConfigUpdateRequired(
            ballerinaExtInstance,
            packagePath
        )).hasWarnings;

    if (!hasWarnings) {
        if (!isCommand && executeRun) {
            executeRunCommand(ballerinaExtInstance, packagePath, isBi);
        }
        return true;
    }

    return await handleOnUnSetValues(packageName, packagePath, configFile, ignoreFile, ballerinaExtInstance, isCommand, isBi, executeRun);
}

export async function checkConfigUpdateRequired(
    ballerinaExtInstance: BallerinaExtension,
    projectPath: string
): Promise<{ hasWarnings: boolean }> {
    try {
        const showLibraryConfigVariables = ballerinaExtInstance.showLibraryConfigVariables();

        const response = await ballerinaExtInstance.langClient?.getConfigVariablesV2({
            projectPath,
            includeLibraries: showLibraryConfigVariables !== false
        }) as ConfigVariableResponse;

        const configVariables = response?.configVariables;

        const configVariablesMap = configVariables || {};
        let hasWarnings = false;

        // Check if any config variable has warnings
        for (const pkgKey of Object.keys(configVariablesMap)) {
            const pkgModules = configVariablesMap[pkgKey];
            if (!pkgModules) { continue; }

            for (const moduleName of Object.keys(pkgModules)) {
                const moduleVars = pkgModules[moduleName];

                if (Array.isArray(moduleVars)) {
                    const hasUnsetValues = moduleVars.some(variable =>
                        !variable?.properties?.defaultValue?.value &&
                        !variable?.properties?.configValue?.value
                    );
                    if (hasUnsetValues) {
                        hasWarnings = true;
                        break;
                    }
                }
            }

            if (hasWarnings) { break; }
        }

        return { hasWarnings };
    } catch (error) {
        console.error('Error while checking config update requirement:', error);
        return { hasWarnings: false };
    }
}

export function findPropertyValues(configs: Property, newValues: ConfigProperty[], obj?: any, skipAnyOf?: boolean): void {
    const properties = configs.properties;
    const requiredKeys = configs.required || [];

    for (let propertyKey in properties) {
        if (properties.hasOwnProperty(propertyKey)) {
            const property: Property = properties[propertyKey];
            const isRequired = requiredKeys.includes(propertyKey);
            if (!isRequired && property.required && property.required.length > 0) {
                findPropertyValues(property, newValues, obj);
            } else {
                const valueExists = obj ? (propertyKey in obj) : false;
                const anyOfValue = skipAnyOf && Constants.ANY_OF in property;
                if ((anyOfValue && valueExists) || !valueExists) {
                    newValues.push({
                        name: propertyKey,
                        type: property.type,
                        property,
                        required: isRequired
                    });
                }
            }
        }
    }
}

export async function getCurrentBallerinaProjectFromContext(ballerinaExtInstance: BallerinaExtension): Promise<BallerinaProject | undefined> {
    let currentProject: BallerinaProject = {};

    if (window.activeTextEditor) {
        currentProject = await getCurrentBallerinaProject();
    } else {
        const document = ballerinaExtInstance.getDocumentContext().getLatestDocument();
        if (document) {
            currentProject = await getCurrentBallerinaProject(document.fsPath);
        }
    }
    return currentProject;
}

export async function getCurrentBIProject(projectPath: string): Promise<BallerinaProject | undefined> {
    try {
        if (projectPath) {
            return await getCurrentBallerinaProject(projectPath);
        }
        const projectRoot = await getCurrentProjectRoot();
        return await getCurrentBallerinaProject(projectRoot);
    } catch (error) {
        console.error('Failed to resolve current BI project:', error);
        return undefined;
    }
}

export async function handleOnUnSetValues(packageName: string, packagePath: string, configFile: string, ignoreFile: string, ballerinaExtInstance: BallerinaExtension, isCommand: boolean, isBi: boolean, executeRun: boolean = true): Promise<boolean> {
    let result;
    let btnTitle: string;
    let message: string;

    if (!existsSync(configFile)) {
        message = 'Missing Config.toml file';
        btnTitle = 'Create Config.toml';
    } else {
        message = 'Missing required configurations in Config.toml file';
        btnTitle = 'Update Configurables';
    }

    const openConfigButton = { title: btnTitle };
    const ignoreButton = { title: 'Run Anyway' };
    const details = "It is recommended to create/update the configurable variables with all mandatory configuration values before running the program.";

    if (!isCommand) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        result = await window.showInformationMessage(message, { detail: details, modal: true }, openConfigButton, ignoreButton);
    }

    const docLink = "https://ballerina.io/learn/provide-values-to-configurable-variables/#provide-via-toml-syntax";
    if (isCommand || result === openConfigButton) {
        if (!existsSync(configFile)) {
            const updatedContent = `
# Configuration file for "${packageName}"
# 
# This file contains configuration values for configurable variables in your Ballerina code.
# Both package-specific and imported module configurations are included below.
# 
# Learn more about configurable variables:
# ${docLink}
#
# Note: This file is automatically added to .gitignore to protect sensitive information.
`;
            // Create and write content to the config file
            writeFile(configFile, updatedContent, (error) => {
                if (error) {
                    window.showErrorMessage('Unable to create the Config.toml file: ' + error);
                    return;
                }
            });

            if (existsSync(ignoreFile)) {
                const ignoreUri = Uri.file(ignoreFile);
                let ignoreContent: string = readFileSync(ignoreUri.fsPath, 'utf8');
                if (!ignoreContent.includes("config.toml")) {
                    ignoreContent += `\n${"config.toml"}\n`;
                    writeFile(ignoreUri.fsPath, ignoreContent, function (error) {
                        if (error) {
                            return window.showErrorMessage('Unable to update the .gitIgnore file: ' + error);
                        }
                        window.showInformationMessage('Successfully updated the .gitIgnore file.');
                    });
                }
            }
        }

        openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.ViewConfigVariables });
        return false;
    } else if (!isCommand && result === ignoreButton) {
        if (executeRun) {
            executeRunCommand(ballerinaExtInstance, packagePath, isBi);
        }
        return true;
    }
    return false;
}


async function executeRunCommand(ballerinaExtInstance: BallerinaExtension, filePath: string, isBi?: boolean) {
    TracerMachine.startServer();
    if (ballerinaExtInstance.enabledRunFast() || isBi) {
        filePath = (await getCurrentBallerinaProject(filePath)).path;
        const projectHasErrors = await cleanAndValidateProject(ballerinaExtInstance.langClient, filePath);
        if (projectHasErrors) {
            window.showErrorMessage("Project contains errors. Please fix them and try again.");
        } else {
            clearTerminal();
            await startDebugging(Uri.file(filePath), false, true, true);
        }
    } else {
        commands.executeCommand(PALETTE_COMMANDS.RUN_CMD, filePath);
    }
}

export async function cleanAndValidateProject(langClient: ExtendedLangClient, path: string): Promise<boolean> {
    try {
        // Get initial project diagnostics
        const projectPath = (await getCurrentBallerinaProject(path)).path;
        let response: ProjectDiagnosticsResponse = await langClient.getProjectDiagnostics({
            projectRootIdentifier: {
                uri: Uri.file(projectPath).toString()
            }
        });

        if (!response.errorDiagnosticMap || Object.keys(response.errorDiagnosticMap).length === 0) {
            return false;
        }

        // Process each file with diagnostics
        for (const [filePath, diagnostics] of Object.entries(response.errorDiagnosticMap)) {
            // Filter the unused import diagnostics
            const diagnostic = diagnostics.find(d => d.code === UNUSED_IMPORT_ERR_CODE);
            if (!diagnostic) {
                continue;
            }
            const codeActions = await langClient.codeAction({
                textDocument: { uri: filePath },
                range: {
                    start: diagnostic.range.start,
                    end: diagnostic.range.end
                },
                context: { diagnostics: [diagnostic] }
            });

            // Find and apply the appropriate code action
            const action = codeActions.find(action => action.title === "Remove all unused imports");
            if (!action?.edit?.documentChanges?.length) {
                continue;
            }
            const docEdit = action.edit.documentChanges[0] as TextDocumentEdit;

            // Apply modifications to syntax tree
            const syntaxTree = await langClient.stModify({
                documentIdentifier: { uri: docEdit.textDocument.uri },
                astModifications: docEdit.edits.map(edit => ({
                    startLine: edit.range.start.line,
                    startColumn: edit.range.start.character,
                    endLine: edit.range.end.line,
                    endColumn: edit.range.end.character,
                    type: "INSERT",
                    isImport: true,
                    config: { STATEMENT: edit.newText }
                }))
            });

            // Update file content
            const { source } = syntaxTree as SyntaxTree;
            const absolutePath = fileURLToPath(filePath);
            await modifyFileContent({ filePath: absolutePath, content: source });
        }

        // Check if errors still exist after fixes
        const updatedResponse: ProjectDiagnosticsResponse = await langClient.getProjectDiagnostics({
            projectRootIdentifier: {
                uri: Uri.file(projectPath).toString()
            }
        });

        return updatedResponse.errorDiagnosticMap && updatedResponse.errorDiagnosticMap.size > 0;
    } catch (error) {
        return true;
    }
}

export function getConfigValue(name: string, obj: Property, comment: { value: string }): string {
    let newConfigValue = '';
    switch (obj.type) {
        case ConfigTypes.BOOLEAN:
            newConfigValue = `${name} = false\t`;
            break;
        case ConfigTypes.INTEGER:
            newConfigValue = `${name} = 0\t`;
            break;
        case ConfigTypes.NUMBER:
            newConfigValue = `${name} = 0.0\t`;
            break;
        case ConfigTypes.STRING:
            newConfigValue = `${name} = ""\t`;
            break;
        case ConfigTypes.ARRAY:
            newConfigValue = getArrayConfigValue(comment, name, obj);
            break;
        case ConfigTypes.OBJECT:
            // Use inline object format for nested objects
            newConfigValue = getInlineObjectConfigValue(name, obj);
            comment.value = `# ${typeOfComment} ${ConfigTypes.OBJECT.toUpperCase()}`;
            break;
        default:
            if (Constants.ANY_OF in obj) {
                const anyType: Property = obj.anyOf[0];
                if (anyType.type === ConfigTypes.INTEGER || anyType.type === ConfigTypes.NUMBER) {
                    comment.value = `# ${typeOfComment} ${ConfigTypes.NUMBER.toUpperCase()}`;
                    newConfigValue = `${name} = 0\t`;
                } else if (anyType.type === ConfigTypes.STRING) {
                    newConfigValue = `${name} = ""\t`;
                } else if (anyType.type === ConfigTypes.OBJECT) {
                    // For other objects, use inline format
                    newConfigValue = getInlineObjectConfigValue(name, anyType);
                    comment.value = `# ${typeOfComment} ${ConfigTypes.OBJECT.toUpperCase()}`;
                } else {
                    newConfigValue = `${name} = ""\t`;
                }
            } else {
                newConfigValue = `${name} = ""\t`;
            }
            break;
    }
    return newConfigValue;
}

/**
 * Generate an inline TOML object format for nested objects
 */
function getInlineObjectConfigValue(name: string, property: Property): string {
    if (!property || !property.properties) {
        return `${name} = {}\t`;
    }

    let configValue = `${name} = { `;
    const parts: string[] = [];

    // Add required properties if any
    if (property.required && property.required.length > 0) {
        for (const requiredKey of property.required) {
            if (property.properties[requiredKey]) {
                const propValue = getDefaultValueForType(property.properties[requiredKey]);
                parts.push(`${requiredKey} = ${propValue}`);
            }
        }
    } else {
        const propertyKeys = Object.keys(property.properties);
        const keysToInclude = propertyKeys.slice(0, Math.min(3, propertyKeys.length));

        for (const key of keysToInclude) {
            const propValue = getDefaultValueForType(property.properties[key]);
            parts.push(`${key} = ${propValue}`);
        }
    }

    configValue += parts.join(", ");
    configValue += " }\t";
    return configValue;
}

/**
 * Get default value string for different property types
 */
function getDefaultValueForType(property: Property): string {
    if (!property || !property.type) {
        return '""';
    }

    switch (property.type) {
        case ConfigTypes.INTEGER:
            return "0";
        case ConfigTypes.NUMBER:
            return "0.0";
        case ConfigTypes.BOOLEAN:
            return "false";
        case ConfigTypes.OBJECT:
            return "{}";
        case ConfigTypes.ARRAY:
            return "[]";
        case ConfigTypes.STRING:
        default:
            return '""';
    }
}

function getArrayConfigValue(comment: { value: string }, name: string, item: Property): string {
    let newConfigValue = '';
    switch (item.items?.type) {
        case ConfigTypes.BOOLEAN:
            comment.value = ``;
            newConfigValue = `${name} = []\t# ${typeOfComment} ${ConfigTypes.BOOLEAN.toUpperCase()} array\n`;
            break;
        case ConfigTypes.INTEGER:
            comment.value = ``;
            newConfigValue = `${name} = []\t# ${typeOfComment} ${ConfigTypes.INTEGER.toUpperCase()} array\n`;
            break;
        case ConfigTypes.NUMBER:
            comment.value = ``;
            newConfigValue = `${name} = []\t# ${typeOfComment} ${ConfigTypes.NUMBER.toUpperCase()} array\n`;
            break;
        case ConfigTypes.STRING:
            comment.value = ``;
            newConfigValue = `${name} = []\t# ${typeOfComment} ${ConfigTypes.STRING.toUpperCase()} array\n`;
            break;
        case ConfigTypes.OBJECT:
            comment.value = ``;
            if (item.items.additionalProperties && item.items.additionalProperties.type === ConfigTypes.STRING) {
                // For arrays of map-like objects
                newConfigValue = `${name} = []\t# ${typeOfComment} ${ConfigTypes.OBJECT.toUpperCase()} array\n`;
            } else if (item.items.properties) {
                // For arrays of structured objects
                newConfigValue = `${name} = []\t# ${typeOfComment} ${ConfigTypes.OBJECT.toUpperCase()} array\n`;
            } else {
                newConfigValue = `${name} = []\t# ${typeOfComment} ${ConfigTypes.OBJECT.toUpperCase()} array\n`;
            }
            break;
        case ConfigTypes.ARRAY:
            comment.value = `# ${typeOfComment} ${ConfigTypes.ARRAY.toUpperCase()} of array\n`;
            newConfigValue = `${name} = []\t# ${typeOfComment} Nested array\n`;
            break;
        default:
            newConfigValue = `${name} = []\t# ${typeOfComment} Array\n`;
            break;
    }
    return newConfigValue;
}

export interface ConfigGenerationContext {
    orgName: string;
    packageName: string;
    projectPath: string;
    configFilePath: string;
    configSchema?: PackageConfigSchema;
    existingConfigs?: object;
}

export interface ConfigRequirementResult {
    needsConfig: boolean;
    context?: ConfigGenerationContext;
    newValues?: ConfigProperty[];
    updatedContent?: string;
    moduleWarnings?: Record<string, number>;
    totalWarnings?: number;
    hasWarnings?: boolean;
}
