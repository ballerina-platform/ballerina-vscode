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

import { DIRECTORY_MAP, EVENT_TYPE, FOCUS_FLOW_DIAGRAM_VIEW, HistoryEntry, isSamePath, MACHINE_VIEW, ProjectStructureArtifactResponse, SyntaxTreeResponse, UpdatedArtifactsResponse } from "@wso2/ballerina-core";
import { NodePosition, STKindChecker, STNode, traversNode } from "@wso2/syntax-tree";
import { StateMachine, openView } from "../stateMachine";
import { Uri } from "vscode";
import { UIDGenerationVisitor } from "./history/uid-generation-visitor";
import { FindNodeByUidVisitor } from "./history/find-node-by-uid";
import { FindConstructByNameVisitor } from "./history/find-construct-by-name-visitor";
import { FindConstructByIndexVisitor } from "./history/find-construct-by-index-visitor";
import { getConstructBodyString } from "./history/util";
import { extension } from "../BalExtensionContext";
import path from "path";

export async function getView(documentUri: string, position: NodePosition, projectPath: string): Promise<HistoryEntry> {
    const haveTreeData = !!StateMachine.context().projectStructure;
    const isServiceClassFunction = await checkForServiceClassFunctions(documentUri, position, projectPath);
    if (isServiceClassFunction || path.relative(projectPath || '', documentUri).startsWith("tests")) {
        return {
            location: {
                view: MACHINE_VIEW.BIDiagram,
                documentUri: documentUri,
                position: position,
                identifier: StateMachine.context()?.identifier,
            },
            dataMapperDepth: 0
        };
    } else if (haveTreeData) {
        return getViewByArtifacts(documentUri, position, projectPath);
    }
    else {
        return await getViewBySTRange(documentUri, position, projectPath);
    }
}

async function checkForServiceClassFunctions(documentUri: string, position: NodePosition, projectPath: string) {
    const currentProjectArtifacts = StateMachine.context().projectStructure;
    if (currentProjectArtifacts) {
        const project = currentProjectArtifacts.projects.find(project => isSamePath(project.projectPath, projectPath));
        for (const dir of project.directoryMap[DIRECTORY_MAP.TYPE]) {
            if (dir.path === documentUri && isPositionWithinBlock(position, dir.position)) {
                const req = getSTByRangeReq(documentUri, position);
                const node = await StateMachine.langClient().getSTByRange(req) as SyntaxTreeResponse;
                if (node.parseSuccess && (STKindChecker.isObjectMethodDefinition(node.syntaxTree) || STKindChecker.isResourceAccessorDefinition(node.syntaxTree))) {
                    return true;
                }
            }
        }
        return false;
    }
}

// TODO: This is not used anymore. Remove it.
async function getViewBySTRange(documentUri: string, position: NodePosition, projectPath?: string): Promise<HistoryEntry> {
    const req = getSTByRangeReq(documentUri, position);
    const node = await StateMachine.langClient().getSTByRange(req) as SyntaxTreeResponse;
    if (node.parseSuccess) {
        if (STKindChecker.isTypeDefinition(node.syntaxTree)) {
            const recordST = node.syntaxTree;
            const name = recordST.typeName?.value;
            const module = recordST.typeData?.symbol?.moduleID;
            if (!name || !module) {
                // tslint:disable-next-line
                console.error('Couldn\'t generate record nodeId to render composition view', recordST);
            } else {
                const nodeId = `${module?.orgName}/${module?.moduleName}:${module?.version}:${name}`;
                return {
                    location: {
                        view: MACHINE_VIEW.TypeDiagram,
                        documentUri: documentUri,
                        position: position,
                        identifier: name,
                        projectPath
                    }
                };
            }
        }
        if (STKindChecker.isClassDefinition(node.syntaxTree)) {
            const classST = node.syntaxTree;
            const name = classST.className?.value;
            const module = classST.typeData?.symbol?.moduleID;
            if (!name || !module) {
                // tslint:disable-next-line
                console.error('Couldn\'t generate class nodeId to render composition view', classST);
            } else {
                return {
                    location: {
                        view: MACHINE_VIEW.TypeDiagram,
                        documentUri: documentUri,
                        position: position,
                        identifier: name,
                        projectPath
                    }
                };
            }
        }
        if (STKindChecker.isEnumDeclaration(node.syntaxTree)) {
            const enumST = node.syntaxTree;
            const name = enumST?.identifier?.value;
            const module = enumST.typeData?.symbol?.moduleID;
            if (!name || !module) {
                // tslint:disable-next-line
                console.error('Couldn\'t generate enum nodeId to render composition view', enumST);
            } else {
                return {
                    location: {
                        view: MACHINE_VIEW.TypeDiagram,
                        documentUri: documentUri,
                        position: position,
                        identifier: name,
                        projectPath
                    }
                };
            }
        }
        if (
            STKindChecker.isModuleVarDecl(node.syntaxTree) &&
            STKindChecker.isQualifiedNameReference(node.syntaxTree.typedBindingPattern.typeDescriptor) &&
            node.syntaxTree.typedBindingPattern.typeDescriptor.identifier.value === "Client" &&
            STKindChecker.isCaptureBindingPattern(node.syntaxTree.typedBindingPattern.bindingPattern)
        ) {
            // connection
            const connectionName = node.syntaxTree.typedBindingPattern.bindingPattern.variableName.value;
            if (!connectionName) {
                // tslint:disable-next-line
                console.error("Couldn't capture connection from STNode", { STNode: node.syntaxTree });
            } else {
                return {
                    location: {
                        view: MACHINE_VIEW.EditConnectionWizard,
                        identifier: connectionName,
                    },
                };
            }
        }

        if (STKindChecker.isListenerDeclaration(node.syntaxTree)) {
            const listenerST = node.syntaxTree;
            const variablePosition = listenerST.variableName.position;
            return {
                location: {
                    view: MACHINE_VIEW.BIListenerConfigView,
                    documentUri: documentUri,
                    position: variablePosition
                }
            };
        }

        if (STKindChecker.isServiceDeclaration(node.syntaxTree)) {
            const expr = node.syntaxTree.expressions[0];
            let haveServiceType = false;
            if (node.syntaxTree.typeDescriptor && STKindChecker.isSimpleNameReference(node.syntaxTree.typeDescriptor)) {
                haveServiceType = true;
            }
            if (expr?.typeData?.typeSymbol?.signature?.includes("graphql")) {
                return {
                    location: {
                        view: MACHINE_VIEW.GraphQLDiagram,
                        identifier: node.syntaxTree.absoluteResourcePath.map((path) => path.value).join(''),
                        documentUri: documentUri,
                        position: position,
                        projectPath
                    }
                };
            } else {
                return {
                    location: {
                        view: MACHINE_VIEW.ServiceDesigner,
                        identifier: node.syntaxTree.absoluteResourcePath.map((path) => path.value).join(''),
                        documentUri: documentUri,
                        position: position
                    }
                };
            }
        } else if (
            STKindChecker.isFunctionDefinition(node.syntaxTree)
            && STKindChecker.isExpressionFunctionBody(node.syntaxTree.functionBody)
        ) {
            return {
                location: {
                    view: MACHINE_VIEW.DataMapper,
                    identifier: node.syntaxTree.functionName.value,
                    documentUri: documentUri,
                    position: position,
                    artifactType: DIRECTORY_MAP.DATA_MAPPER,
                    dataMapperMetadata: {
                        name: node.syntaxTree.functionName.value,
                        codeData: {
                            lineRange: {
                                fileName: documentUri,
                                startLine: {
                                    line: position.startLine,
                                    offset: position.startColumn
                                },
                                endLine: {
                                    line: position.endLine,
                                    offset: position.endColumn
                                }
                            }
                        }
                    },
                },
                dataMapperDepth: 0
            };
        } else if (
            STKindChecker.isFunctionDefinition(node.syntaxTree) &&
            node.syntaxTree.functionBody.source.includes("@np:NaturalFunction external")
        ) {
            return {
                location: {
                    view: MACHINE_VIEW.BIDiagram,
                    documentUri: documentUri,
                    position: node.syntaxTree.position,
                    focusFlowDiagramView: FOCUS_FLOW_DIAGRAM_VIEW.NP_FUNCTION,
                },
                dataMapperDepth: 0
            };
        } else if (
            STKindChecker.isFunctionDefinition(node.syntaxTree)
            || STKindChecker.isResourceAccessorDefinition(node.syntaxTree)
            || STKindChecker.isObjectMethodDefinition(node.syntaxTree)
        ) {
            return {
                location: {
                    view: MACHINE_VIEW.BIDiagram,
                    documentUri: documentUri,
                    position: node.syntaxTree.position,
                    metadata: {
                        enableSequenceDiagram: extension.ballerinaExtInstance.enableSequenceDiagramView(),
                    }
                },
                dataMapperDepth: 0
            };
        }

        // config variables

        if (STKindChecker.isConfigurableKeyword(node.syntaxTree.qualifiers[0]) &&
            STKindChecker.isCaptureBindingPattern(node.syntaxTree.typedBindingPattern.bindingPattern)) {
            return {
                location: {
                    view: MACHINE_VIEW.EditConfigVariables,
                    documentUri: documentUri,
                    position: position
                },
            };
        }
    }

    return { location: { view: MACHINE_VIEW.PackageOverview, documentUri: documentUri } };

}

function getViewByArtifacts(documentUri: string, position: NodePosition, projectPath: string) {
    const currentProjectArtifacts = StateMachine.context().projectStructure;
    if (currentProjectArtifacts) {
        // Iterate through each category in the directory map
        const project = currentProjectArtifacts.projects.find(project => isSamePath(project.projectPath, projectPath));
        for (const [key, directory] of Object.entries(project.directoryMap)) {
            // Check each artifact in the category
            for (const dir of directory) {
                //  Go through the resources array if it exists
                if (dir.resources && dir.resources.length > 0) {
                    for (const resource of dir.resources) {
                        const view = findViewByArtifact(resource, position, documentUri, projectPath);
                        if (view) {
                            view.location.parentIdentifier = dir.name;
                            return view;
                        }
                    }
                }
                // Check the current directory
                const view = findViewByArtifact(dir, position, documentUri, projectPath);
                if (view) {
                    return view;
                }
            }
        }
        // If no artifact matched but we're already on a BIDiagram for this file,
        // stay on it instead of redirecting to Overview. This handles newly created files that aren't in the project structure yet.
        const ctx = StateMachine.context();
        if (ctx?.view === MACHINE_VIEW.BIDiagram && documentUri === ctx?.documentUri) {
            return {
                location: {
                    view: MACHINE_VIEW.BIDiagram,
                    documentUri,
                    position,
                    projectPath,
                }
            };
        }
        // If no view is found, return the overview view
        return { location: { view: MACHINE_VIEW.PackageOverview, documentUri: documentUri } };
    }
}

function findViewByArtifact(
    dir: ProjectStructureArtifactResponse,
    position: NodePosition,
    documentUri: string,
    projectPath?: string
): HistoryEntry {
    const currentDocumentUri = documentUri;
    const artifactUri = dir.path;
    if (artifactUri === currentDocumentUri && isPositionWithinRange(position, dir.position)) {
        switch (dir.type) {
            case DIRECTORY_MAP.SERVICE:
                if (dir.moduleName === "graphql") {
                    return {
                        location: {
                            view: MACHINE_VIEW.GraphQLDiagram,
                            identifier: dir.name,
                            documentUri: currentDocumentUri,
                            position: position,
                            projectPath: projectPath,
                            artifactType: DIRECTORY_MAP.SERVICE
                        }
                    };
                } else if (dir.moduleName === "ai") {
                    return {
                        location: {
                            view: MACHINE_VIEW.BIDiagram,
                            identifier: dir.name,
                            documentUri: currentDocumentUri,
                            position: position,
                            projectPath: projectPath,
                            artifactType: DIRECTORY_MAP.SERVICE,
                        }
                    };
                } else {
                    return {
                        location: {
                            view: MACHINE_VIEW.ServiceDesigner,
                            identifier: dir.name,
                            documentUri: currentDocumentUri,
                            position: position,
                            artifactType: DIRECTORY_MAP.SERVICE
                        }
                    };
                }
            case DIRECTORY_MAP.LISTENER:
                return {
                    location: {
                        view: MACHINE_VIEW.BIListenerConfigView,
                        documentUri: currentDocumentUri,
                        position: dir.position,
                        identifier: dir.name,
                        artifactType: DIRECTORY_MAP.LISTENER
                    }
                };
            case DIRECTORY_MAP.RESOURCE:
                return {
                    location: {
                        view: MACHINE_VIEW.BIDiagram,
                        documentUri: currentDocumentUri,
                        position: dir.position,
                        identifier: dir.id,
                        artifactType: DIRECTORY_MAP.RESOURCE,
                    }
                };
            case DIRECTORY_MAP.NP_FUNCTION:
                return {
                    location: {
                        view: MACHINE_VIEW.BIDiagram,
                        documentUri: currentDocumentUri,
                        position: dir.position,
                        identifier: dir.name,
                        focusFlowDiagramView: FOCUS_FLOW_DIAGRAM_VIEW.NP_FUNCTION,
                        artifactType: DIRECTORY_MAP.NP_FUNCTION,
                    },
                    dataMapperDepth: 0
                };
            case DIRECTORY_MAP.AUTOMATION:
            case DIRECTORY_MAP.FUNCTION:
            case DIRECTORY_MAP.WORKFLOW:
            case DIRECTORY_MAP.ACTIVITY:
            case DIRECTORY_MAP.REMOTE:
                return {
                    location: {
                        view: MACHINE_VIEW.BIDiagram,
                        documentUri: currentDocumentUri,
                        identifier: dir.name,
                        position: dir.position,
                        artifactType: dir.type,
                        metadata: {
                            enableSequenceDiagram: extension.ballerinaExtInstance.enableSequenceDiagramView(),
                        }
                    },
                    dataMapperDepth: 0
                };
            case DIRECTORY_MAP.AGENT:
                // The built-in ai:Agent (module "ai") opens the rich focus diagram; custom AgentType classes
                // (including *ai:FixedReturnAgent / *ai:InferredReturnAgent) open the simplified AGENT_TYPE focus
                // diagram (agent box + conditional model-provider circle).
                return {
                    location: {
                        view: MACHINE_VIEW.BIDiagram,
                        documentUri: currentDocumentUri,
                        position: dir.position,
                        identifier: dir.name,
                        focusFlowDiagramView: dir.moduleName === "ai"
                            ? FOCUS_FLOW_DIAGRAM_VIEW.AGENT
                            : FOCUS_FLOW_DIAGRAM_VIEW.AGENT_TYPE,
                        artifactType: DIRECTORY_MAP.AGENT,
                    },
                    dataMapperDepth: 0
                };
            case DIRECTORY_MAP.LOCAL_CONNECTORS:
            case DIRECTORY_MAP.CONNECTION:
                return {
                    location: {
                        view: MACHINE_VIEW.EditConnectionWizard,
                        identifier: dir.name,
                        artifactType: dir.type
                    },
                };
            case DIRECTORY_MAP.TYPE: // Type diagram should be shown for Type, Class, Enum, Record
                return {
                    location: {
                        view: MACHINE_VIEW.TypeDiagram,
                        documentUri: currentDocumentUri,
                        position: position,
                        identifier: dir.name,
                        projectPath: projectPath,
                        artifactType: DIRECTORY_MAP.TYPE
                    }
                };
            case DIRECTORY_MAP.CONFIGURABLE:
                return {
                    location: {
                        view: MACHINE_VIEW.EditConfigVariables,
                        documentUri: currentDocumentUri,
                        position: dir.position,
                        identifier: dir.name,
                        artifactType: DIRECTORY_MAP.CONFIGURABLE
                    },
                };
            case DIRECTORY_MAP.DATA_MAPPER:
                return {
                    location: {
                        view: MACHINE_VIEW.DataMapper,
                        identifier: dir.name,
                        documentUri: currentDocumentUri,
                        position: position,
                        artifactType: DIRECTORY_MAP.DATA_MAPPER,
                        dataMapperMetadata: {
                            name: dir.name,
                            codeData: {
                                lineRange: {
                                    fileName: currentDocumentUri,
                                    startLine: {
                                        line: dir.position.startLine,
                                        offset: dir.position.startColumn
                                    },
                                    endLine: {
                                        line: dir.position.endLine,
                                        offset: dir.position.endColumn
                                    }
                                }
                            }
                        },
                    },
                    dataMapperDepth: 0
                };
        }
    }
    return null;
}

function isPositionWithinRange(position: NodePosition, artifactPosition: NodePosition) {
    return position.startLine === artifactPosition.startLine && position.startColumn === artifactPosition.startColumn;
}

function isPositionWithinBlock(position: NodePosition, artifactPosition: NodePosition) {
    return position.startLine > artifactPosition.startLine && position.endLine < artifactPosition.endLine;
}

export function getComponentIdentifier(node: STNode): string {
    if (STKindChecker.isServiceDeclaration(node)) {
        return node.absoluteResourcePath.map((path) => path.value).join('');
    } else if (STKindChecker.isFunctionDefinition(node) || STKindChecker.isResourceAccessorDefinition(node)) {
        return node.functionName.value;
    }
    return '';
}

export function generateUid(position: NodePosition, fullST: STNode): string {
    const uidGenVisitor = new UIDGenerationVisitor(position);
    traversNode(fullST, uidGenVisitor);
    return uidGenVisitor.getUId();
}

export function getNodeByUid(uid: string, fullST: STNode): STNode {
    const nodeFindingVisitor = new FindNodeByUidVisitor(uid);
    traversNode(fullST, nodeFindingVisitor);
    return nodeFindingVisitor.getNode();
}

export function getNodeByName(uid: string, fullST: STNode): [STNode, string] {
    const nodeFindingVisitor = new FindConstructByNameVisitor(uid);
    traversNode(fullST, nodeFindingVisitor);
    return [nodeFindingVisitor.getNode(), nodeFindingVisitor.getUid()];
}

export function getNodeByIndex(uid: string, fullST: STNode): [STNode, string] {
    const nodeFindingVisitor = new FindConstructByIndexVisitor(uid, getConstructBodyString(fullST));
    traversNode(fullST, nodeFindingVisitor);
    return [nodeFindingVisitor.getNode(), nodeFindingVisitor.getUid()];
}

function getSTByRangeReq(documentUri: string, position: NodePosition) {
    return {
        documentIdentifier: { uri: Uri.file(documentUri).toString() },
        lineRange: {
            start: {
                line: position.startLine,
                character: position.startColumn
            },
            end: {
                line: position.endLine,
                character: position.endColumn
            }
        }
    };
}
