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

import { ELineRange, EVENT_TYPE, MACHINE_VIEW, NodeMetadata } from "@wso2/ballerina-core";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { ApprovalFunctionParam } from "@wso2/ballerina-side-panel";
import { findFunctionByName } from "../FlowDiagram/utils";

export interface ApprovalFunctionInfo {
    params: ApprovalFunctionParam[];
    // Agent tools whose @ai:AgentTool annotation names this function, as reported by the language server.
    usedBy: string[];
    // Whether anything besides those annotations refers to the function (a call, an ai:ToolConfig). Unknown
    // when the language server predates the check.
    referencedElsewhere?: boolean;
    // Where the function's name is declared, so a name check can treat this function as an existing declaration.
    nameLineRange?: ELineRange;
}

// A FUNCTION_DEFINITION node keeps its parameters as REPEATABLE_PROPERTY entries, each holding
// `type` and `variable` properties.
export function readFunctionNodeParameters(value: unknown): ApprovalFunctionParam[] {
    if (!value || typeof value !== "object") {
        return [];
    }
    return Object.values(value as Record<string, any>)
        .map((entry) => ({
            type: String(entry?.value?.type?.value ?? "").trim(),
            name: String(entry?.value?.variable?.value ?? "").trim(),
        }))
        .filter((param) => param.type && param.name);
}

// Project-wide lookups behind the "Requires Approval" control. The approval function can live in
// any file of the package, so these go through the project components rather than the per-file
// function-node request.
export function createApprovalFunctionActions(rpcClient: BallerinaRpcClient) {
    const locate = async (name: string): Promise<any | null> => {
        try {
            const project = await rpcClient.getBIDiagramRpcClient().getProjectComponents();
            return project?.components ? findFunctionByName(project.components, name) : null;
        } catch (error) {
            console.error(">>> Error locating approval function", error);
            return null;
        }
    };

    const readFunction = async (name: string, fileName: string, projectPath?: string) => {
        const location = projectPath ? { projectPath } : await rpcClient.getVisualizerLocation();
        const response = await rpcClient.getBIDiagramRpcClient().getFunctionNode({
            functionName: name,
            fileName,
            projectPath: location.projectPath,
        });
        return response?.functionDefinition;
    };

    const getFunctionInfo = async (name: string): Promise<ApprovalFunctionInfo | null> => {
        const found = await locate(name);
        if (!found) {
            return null;
        }
        try {
            const node = await readFunction(name, found.filePath);
            if (!node) {
                return null;
            }
            const metadata = node.metadata?.data as NodeMetadata | undefined;
            const usedBy = metadata?.approvalFunctionFor;
            const referencedElsewhere = metadata?.referencedOutsideApprovals;
            return {
                params: readFunctionNodeParameters(node.properties?.parameters?.value),
                usedBy: Array.isArray(usedBy) ? usedBy.map(String) : [],
                referencedElsewhere: typeof referencedElsewhere === "boolean" ? referencedElsewhere : undefined,
                nameLineRange: node.properties?.functionName?.codedata?.lineRange,
            };
        } catch (error) {
            console.error(">>> Error reading approval function", error);
            return null;
        }
    };

    // Deletes an approval function once nothing refers to it any more. Call it after the change that dropped the
    // reference has been saved, so the language server's view is current. A language server that can't say
    // whether the function is referenced elsewhere gets the benefit of the doubt: the function is kept.
    // Returns whether it deleted.
    const deleteIfUnused = async (name: string): Promise<boolean> => {
        const info = await getFunctionInfo(name);
        if (!info || info.usedBy.length > 0 || info.referencedElsewhere !== false) {
            return false;
        }
        const found = await locate(name);
        if (!found) {
            return false;
        }
        try {
            await rpcClient.getBIDiagramRpcClient().deleteByComponentInfo({
                filePath: found.filePath,
                component: {
                    name,
                    filePath: found.filePath,
                    startLine: found.startLine,
                    startColumn: found.startColumn,
                    endLine: found.endLine,
                    endColumn: found.endColumn,
                    resources: [],
                },
            });
            return true;
        } catch (error) {
            console.error(">>> Error deleting approval function", error);
            return false;
        }
    };

    return {
        deleteIfUnused,
        // The approval function a tool's @ai:AgentTool annotation names, as the language server reports it on the
        // tool's node, read before the tool is deleted. The tool can live in any file of the package; `fileName`
        // is only the fallback when it can't be located.
        approvalFunctionOfTool: async (
            toolName: string, fileName: string, projectPath?: string
        ): Promise<string | undefined> => {
            try {
                const tool = await locate(toolName);
                const node = await readFunction(toolName, tool?.filePath ?? fileName, projectPath);
                return (node?.metadata?.data as NodeMetadata | undefined)?.approvalFunction;
            } catch (error) {
                console.error(">>> Error reading tool annotation", error);
                return undefined;
            }
        },
        // The approval function's current parameters and the agent tools that use it, so the tool form can
        // warn about a mismatch before saving. Null when the function can't be read.
        getFunctionInfo,
        onOpenFunction: async (name: string): Promise<void> => {
            const found = await locate(name);
            if (!found) {
                await rpcClient.getCommonRpcClient().showErrorMessage({
                    message: `Couldn't find the function '${name}' in this project.`,
                });
                return;
            }
            // Opens the function's flow diagram, the same view the agent node's "View" action opens
            // for a tool.
            await rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    documentUri: found.filePath,
                    identifier: name,
                    position: {
                        startLine: found.startLine,
                        startColumn: found.startColumn,
                        endLine: found.endLine,
                        endColumn: found.endColumn,
                    },
                    view: MACHINE_VIEW.BIDiagram,
                },
            });
        },
    };
}
