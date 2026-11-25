/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { NodePosition } from "@wso2/syntax-tree";
import { ListenerConfigFormState, STModification, ServiceConfigState, getComponentSource } from "..";
import { getInsertComponentSource } from "./template-utils";
import { keywords } from "./keywords";

export { keywords };

export async function InsertorDelete(
    modifications: STModification[]
): Promise<STModification[]> {
    const stModifications: STModification[] = [];
    /* tslint:disable prefer-for-of */
    for (let i = 0; i < modifications.length; i++) {
        const value: STModification = modifications[i];
        let stModification: STModification;
        if (value.type && value.type.toLowerCase() === "delete") {
            stModification = value;
        } else if (value.type && value.type.toLowerCase() === "import") {
            const source = await getInsertComponentSource(value.type, value.config);
            stModification = {
                startLine: value.startLine,
                startColumn: value.startColumn,
                endLine: value.endLine,
                endColumn: value.endColumn,
                type: "INSERT",
                isImport: true,
                config: {
                    "TYPE": value?.config?.TYPE,
                    "STATEMENT": source,
                }
            };
        } else if (value.type && value.type.toLowerCase() === 'insert') {
            stModification = value;
        } else {
            const source = await getInsertComponentSource(value.type, value.config);
            stModification = {
                startLine: value.startLine,
                startColumn: value.startColumn,
                endLine: value.endLine,
                endColumn: value.endColumn,
                type: "INSERT",
                config: {
                    "STATEMENT": source,
                }
            };
        }
        stModifications.push(stModification);
    }
    return stModifications;
}

export function createFunctionSignature(
    accessModifier: string,
    name: string,
    parameters: string,
    returnTypes: string,
    targetPosition: NodePosition,
    isLastMember?: boolean,
    isExpressionBodied?: boolean,
    expressionBody?: string
): STModification {
    const functionStatement: STModification = {
        startLine: targetPosition.startLine,
        startColumn: isLastMember ? targetPosition.endColumn : 0,
        endLine: targetPosition.startLine,
        endColumn: isLastMember ? targetPosition.endColumn : 0,
        type: "FUNCTION_DEFINITION",
        config: {
            "ACCESS_MODIFIER": accessModifier,
            "NAME": name,
            "PARAMETERS": parameters,
            "RETURN_TYPE": returnTypes,
            "IS_EXPRESSION_BODIED": isExpressionBodied,
            "EXPRESSION_BODY": expressionBody
        }
    };

    return functionStatement;
}

export function updateFunctionSignature(
    name: string,
    parameters: string,
    returnTypes: string,
    targetPosition: NodePosition
): STModification {
    const functionStatement: STModification = {
        startLine: targetPosition.startLine,
        startColumn: targetPosition.startColumn,
        endLine: targetPosition.endLine,
        endColumn: targetPosition.endColumn,
        type: "FUNCTION_DEFINITION_SIGNATURE",
        config: {
            "NAME": name,
            "PARAMETERS": parameters,
            "RETURN_TYPE": returnTypes
        }
    };

    return functionStatement;
}

export function getSource(modification: STModification): string {
    const source = getComponentSource(modification.type, modification.config);
    return source;
}

export function getFormattedModuleName(moduleName: string): string {
    let formattedModuleName = moduleName.includes('.') ? moduleName.split('.').pop() : moduleName;
    if (keywords.includes(formattedModuleName)) {
        formattedModuleName = `${formattedModuleName}0`;
    }
    return formattedModuleName;
}

export function createResource(method: string, path: string, parameters: string, addReturn: string, targetPosition: NodePosition): STModification {
    const resource: STModification = {
        startLine: targetPosition.startLine,
        startColumn: 0,
        endLine: targetPosition.startLine,
        endColumn: 0,
        type: "RESOURCE",
        config: {
            "METHOD": method,
            "PATH": path,
            "PARAMETERS": parameters,
            // "PAYLOAD": payload,
            // "ADD_CALLER": isCaller,
            // "ADD_REQUEST": isRequest,
            "ADD_RETURN": addReturn
        }
    };
    return resource;
}

export function createRemoteFunction(path: string, parameters: string, returnTypes: string, targetPosition: NodePosition): STModification {
    const remoteFunction: STModification = {
        startLine: targetPosition.startLine,
        startColumn: 0,
        endLine: targetPosition.startLine,
        endColumn: 0,
        type: "REMOTE_FUNCTION",
        config: {
            "PATH": path,
            "PARAMETERS": parameters,
            "ADD_RETURN": returnTypes
        }
    };
    return remoteFunction;
}

export function updateResourceSignature(method: string, path: string, parameters: string, addReturn: string, targetPosition: NodePosition): STModification {
    const resourceSignature: STModification = {
        startLine: targetPosition.startLine,
        startColumn: targetPosition.startColumn,
        endLine: targetPosition.endLine,
        endColumn: targetPosition.endColumn,
        type: "RESOURCE_SIGNATURE",
        config: {
            "METHOD": method,
            "PATH": path,
            "PARAMETERS": parameters,
            "ADD_RETURN": addReturn
        }
    };

    return resourceSignature;
}

export function updateRemoteFunctionSignature(name: string, parameters: string, returnTypes: string, targetPosition: NodePosition): STModification {
    const remoteFunctionSignature: STModification = {
        startLine: targetPosition.startLine,
        startColumn: targetPosition.startColumn,
        endLine: targetPosition.endLine,
        endColumn: targetPosition.endColumn,
        type: "REMOTE_FUNCTION_SIGNATURE",
        config: {
            "PATH": name,
            "PARAMETERS": parameters,
            "ADD_RETURN": returnTypes
        }
    };
    return remoteFunctionSignature;
}

export function createImportStatement(org: string, module: string): STModification {
    const moduleName = module;
    const formattedName = getFormattedModuleName(module);
    let moduleNameStr = org + "/" + module;

    const subModuleName = moduleName.split('.').pop();
    if (moduleName.includes('.') && subModuleName !== formattedName) {
        if (keywords.includes(subModuleName)){
            module = module.replace(subModuleName, "'" + subModuleName);
        }
        // add alias if module name is different with formatted name
        moduleNameStr = org + "/" + module + " as " + formattedName
    }

    const importStatement: STModification = {
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
        type: "IMPORT",
        config: {
            "TYPE": moduleNameStr
        }
    };

    return importStatement;
}

export function createServiceDeclartion(
    config: ServiceConfigState, targetPosition: NodePosition, isLastMember?: boolean): STModification {
    const { serviceBasePath, listenerConfig: { listenerName, listenerPort, createNewListener }, serviceType } = config;

    const modification: STModification = {
        startLine: targetPosition.startLine,
        endLine: targetPosition.startLine,
        startColumn: isLastMember ? targetPosition.endColumn : 0,
        endColumn: isLastMember ? targetPosition.endColumn : 0,
        type: ''
    };

    if (createNewListener) {
        return {
            ...modification,
            type: 'SERVICE_AND_LISTENER_DECLARATION',
            config: {
                'LISTENER_NAME': listenerName,
                'PORT': listenerPort,
                'BASE_PATH': serviceBasePath,
                'SERVICE_TYPE': serviceType ? serviceType : 'http'
            }
        }
    } else if (listenerPort) {
        return {
            ...modification,
            type: 'SERVICE_DECLARATION_WITH_NEW_INLINE_LISTENER',
            config: {
                'PORT': listenerPort,
                'BASE_PATH': serviceBasePath,
                'SERVICE_TYPE': serviceType ? serviceType : 'http'
            }
        }

    } else {
        return {
            ...modification,
            type: 'SERVICE_DECLARATION_WITH_SHARED_LISTENER',
            config: {
                'LISTENER_NAME': listenerName,
                'BASE_PATH': serviceBasePath,
            }
        }
    }
}

export function createListenerDeclartion(config: ListenerConfigFormState, targetPosition: NodePosition, isNew: boolean,
                                         serviceType: string, isLastMember?: boolean): STModification {
    const { listenerName, listenerPort } = config;
    let modification: STModification;
    if (isNew) {
        modification = {
            startLine: targetPosition.startLine,
            endLine: targetPosition.startLine,
            startColumn: isLastMember ? targetPosition.endColumn : 0,
            endColumn: isLastMember ? targetPosition.endColumn : 0,
            type: ''
        };
    } else {
        modification = {
            ...targetPosition,
            type: ''
        };
    }

    return {
        ...modification,
        type: 'LISTENER_DECLARATION',
        config: {
            'LISTENER_NAME': listenerName,
            'PORT': listenerPort,
            'SERVICE_TYPE': serviceType
        }
    }
}
