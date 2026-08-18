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

import { Category, AvailableNode, BallerinaProjectComponents } from "@wso2/ballerina-core";
import { URI, Utils } from "vscode-uri";

// Filter out connections where name starts with _ and module is "ai" or "ai.agent"
export const filterConnections = (categories: Category[]): Category[] => {
    return categories.map((category) => {
        if (category.metadata.label === "Connections") {
            const filteredItems = category.items.filter((item) => {
                if ("metadata" in item && "items" in item && item.items.length > 0 && "codedata" in item.items.at(0)) {
                    const name = item.metadata.label || "";
                    const module = (item.items.at(0) as AvailableNode)?.codedata.module || "";

                    // Filter out items where name starts with _ and module is "ai" or "ai.agent"
                    return !(name.startsWith("_") && (module === "ai" || module === "ai.agent"));
                }
                return true;
            });

            return {
                ...category,
                items: filteredItems,
            };
        }
        return category;
    });
};

export const transformCategories = (categories: Category[]): Category[] => {
    // First filter connections
    let filteredCategories = filterConnections(categories);

    // filter out some categories that are not supported in the diagram
    // TODO: these categories should be supported in the future
    const notSupportedCategories = [
        "PARALLEL_FLOW",
        "START",
        "TRANSACTION",
        "COMMIT",
        "ROLLBACK",
        "RETRY"
    ];

    filteredCategories = filteredCategories.map((category) => ({
        ...category,
        items: category?.items?.filter(
            (item) => !("codedata" in item) || !notSupportedCategories.includes((item as AvailableNode).codedata?.node)
        ),
    })) as Category[];

    // remove agents from categories
    filteredCategories = filteredCategories.filter((category) => category.metadata.label !== "Agents");

    return filteredCategories;
};

export const findFunctionByName = (components: BallerinaProjectComponents, functionName: string) => {
    for (const pkg of components.packages) {
        for (const module of pkg.modules) {
            const foundFunction = module.functions.find((func: any) => func.name === functionName);
            if (foundFunction) {
                const pkgUri = URI.parse(pkg.filePath);
                const joinedUri = Utils.joinPath(pkgUri, foundFunction.filePath);
                foundFunction.filePath = joinedUri.fsPath;
                return foundFunction;
            }
        }
    }
    return null;
};

export const findClassByName = (components: BallerinaProjectComponents, className: string) => {
    for (const pkg of components.packages) {
        for (const module of pkg.modules) {
            const foundClass = module.classes.find((cls: any) => cls.name === className);
            if (foundClass) {
                const pkgUri = URI.parse(pkg.filePath);
                const joinedUri = Utils.joinPath(pkgUri, foundClass.filePath);
                foundClass.filePath = joinedUri.fsPath;
                return foundClass;
            }
        }
    }
    return null;
};

export const getNodeTemplateForConnection = async (
    nodeId: string,
    metadata: any,
    targetRef: any,
    modelFileName: string | undefined,
    rpcClient: any
) => {
    const { node } = metadata as { node: AvailableNode };

    const response = await rpcClient
        .getBIDiagramRpcClient()
        .getNodeTemplate({
            position: targetRef?.startLine || { line: 0, offset: 0 },
            filePath: modelFileName,
            id: node.codedata,
        });

    const flowNode = response.flowNode;
    flowNode.metadata = {
        ...node.metadata,
        description: flowNode?.metadata?.description || node?.metadata?.description,
    };

    let connectionKind: string;
    switch (nodeId) {
        case "MODEL_PROVIDER":
        case "CLASS_INIT":
            connectionKind = 'MODEL_PROVIDER';
            break;
        default:
            connectionKind = nodeId;
    }

    return { flowNode, connectionKind };
};
