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

import { debug } from "../../utils/logger";
import { parse } from "@iarna/toml";
import { CompletionItem, CompletionItemKind, Position, TextDocument, Uri } from "vscode";
import { BallerinaExtension } from "../../core";
import { findPropertyValues, getConfigValue, getCurrentBallerinaProjectFromContext, typeOfComment } from "./configSchema";
import { ConfigProperty, Constants, Property } from "./model";
import { BallerinaProject, PackageConfigSchema } from "@wso2/ballerina-core";


export { typeOfComment };

/**
 * Convert the TOML content into JSON object.
 * @param tomlContent The TOML content as a string value.
 */
export function parseTomlToConfig(tomlContent: string): object {
    try {
        return parse(tomlContent);
    } catch (error) {
        debug("Error while parsing the Config.toml file content: " + error);
    }
    return {};
}

/**
 * Use the TOML content to create a JSON accepted by the configurable editor for existing values.
 * @param tomlContent The TOML content as a JSON value.
 */
export function generateExistingValues(tomlContent: object, orgName: string, packageName: string): object {
    return {
        [orgName]: {
            [packageName]: tomlContent
        }
    };
}

export async function getConfigCompletions(ballerinaExtInstance: BallerinaExtension, filePath: string, document: TextDocument, position: Position): Promise<CompletionItem[]> {
    const suggestions: CompletionItem[] = [];
    const isConfigToml = document.fileName.includes("Config.toml");

    if (!isConfigToml) {
        return suggestions;
    }

    const currentProject: BallerinaProject | undefined = await getCurrentBallerinaProjectFromContext(ballerinaExtInstance);
    const newValues: ConfigProperty[] = [];
    ballerinaExtInstance.getDocumentContext().setCurrentProject(currentProject);

    try {
        const response = await ballerinaExtInstance.langClient?.getBallerinaProjectConfigSchema({
            documentIdentifier: {
                uri: Uri.file(filePath).toString()
            }
        });

        const data = response as PackageConfigSchema;
        const configSchema = data.configSchema;
        const props: object = configSchema.properties;
        const firstKey = Object.keys(props)[0];
        const orgName = props[firstKey].properties;
        const packageName = currentProject.packageName;
        const configs: Property = orgName[packageName];

        const tomlContent = document.getText();
        const existingConfigs: object = generateExistingValues(parseTomlToConfig(tomlContent), orgName, packageName);
        const obj = existingConfigs['[object Object]'][packageName];
        const objKeysLength = Object.keys(obj).length;
        const tomlContentLength = tomlContent.length;

        if (objKeysLength > 0 || tomlContentLength > 0) {
            findPropertyValues(configs, newValues, obj, true);
        } else {
            findPropertyValues(configs, newValues);
        }

        newValues.forEach(obj => {
            if (obj.required) {
                let comment = { value: `# ${typeOfComment} ${obj.type && obj.type.toUpperCase() || "STRING"}` };
                let newConfigValue = getConfigValue(obj.name, obj.property, comment);
                let notAnyOf = true;

                if (tomlContentLength > 1 && Constants.ANY_OF in obj.property && tomlContent.includes(obj.name)) {
                    const unionConfig = document.lineAt(position.line - 1).text;
                    notAnyOf = false;
                    if (unionConfig.includes(obj.name)) {
                        suggestions.length = 0;
                        const anyOfData: any = obj.property.anyOf;
                        anyOfData.forEach((value: Property) => {
                            newConfigValue = getConfigValue(obj.name, value, comment);
                            const lines = newConfigValue.split('\n').slice(1);
                            const modifiedString = lines.join('\n');
                            suggestions.push({
                                label: value.name,
                                insertText: modifiedString,
                                kind: CompletionItemKind.Field
                            });
                        });
                    }
                }

                if (notAnyOf) {
                    suggestions.push({
                        label: obj.name,
                        insertText: newConfigValue + comment.value,
                        kind: CompletionItemKind.Field
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error while fetching config schema', error);
    }

    return suggestions;
}
