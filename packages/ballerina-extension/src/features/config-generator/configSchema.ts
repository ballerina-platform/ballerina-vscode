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

// The parts of config generation that Config.toml completion uses, kept apart from configGenerator.ts
// so they load without the extension's views and state. configGenerator.ts re-exports them.

import { window } from "vscode";
import type { BallerinaProject } from "@wso2/ballerina-core";
import type { BallerinaExtension } from "../../core";
import { getCurrentBallerinaProject } from "../../utils/project-utils";
import { ConfigProperty, ConfigTypes, Constants, Property } from "./model";

export const typeOfComment = 'Type of';

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
