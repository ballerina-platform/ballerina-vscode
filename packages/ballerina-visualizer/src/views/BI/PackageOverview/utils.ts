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
import { useEffect, useRef } from "react";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import {
    SCOPE,
    DIRECTORY_MAP,
    ProjectStructure,
    ProjectStructureResponse,
    ProjectScopeMapping,
    WorkspaceDevantMetadata,
    findScopeByModule,
    findScope
} from "@wso2/ballerina-core";
export { validateComponentName } from "../ProjectForm/utils";
export { findScopeByModule, findScope };

/**
 * Extracts deployable integration types (scopes) from project structure.
 * 
 * @param projectStructure - The project structure response containing all projects
 * @param projectPath - The path of the specific project to extract scopes from
 * @returns Array of SCOPE enums representing the deployable integration types
 */
export function getIntegrationTypes(projectStructure: ProjectStructure | undefined): SCOPE[] {
    if (!projectStructure) {
        return [];
    }

    const services = projectStructure.directoryMap[DIRECTORY_MAP.SERVICE];
    const automation = projectStructure.directoryMap[DIRECTORY_MAP.AUTOMATION];
    const workflows = projectStructure.directoryMap[DIRECTORY_MAP.WORKFLOW];

    let scopes: SCOPE[] = [];
    
    // Extract scopes from services based on their module names
    if (services) {
        const svcScopes = services
            .map(svc => findScope(svc?.kind, svc?.moduleName))
            .filter(svc => svc !== undefined);
        scopes = Array.from(new Set(svcScopes)); // Remove duplicates
    }

    if (workflows?.length > 0) {
        scopes.push(SCOPE.WORKFLOW);
    }
    
    // Add automation scope if automation exists
    if (automation?.length > 0) {
        scopes.push(SCOPE.AUTOMATION);
    }

    // Add library scope if the project is a library
    if (projectStructure.isLibrary) {
        scopes.push(SCOPE.LIBRARY);
    }

    return scopes;
}

/**
 * Builds a list of deployable integration scopes per integration for a project.
 *
 * @param projectCollection - Project collection containing the integrations list.
 * @returns A list of integration-to-scope mappings used for project-level deployment.
 */
export function getWorkspaceProjectScopes(
    projectCollection: ProjectStructureResponse | undefined
): ProjectScopeMapping[] {
    if (!projectCollection || !projectCollection.projects) {
        return [];
    }

    const mapProjectToScope = (project: ProjectStructure): ProjectScopeMapping | undefined => {
        const integrationTypes = getIntegrationTypes(project);
        if (integrationTypes.length > 0) {
            return {
                projectPath: project.projectPath!,
                projectTitle: project.projectTitle || project.projectName,
                integrationTypes
            };
        }
        return undefined;
    };

    return projectCollection.projects
        .map(mapProjectToScope)
        .filter((scopeMapping): scopeMapping is ProjectScopeMapping => scopeMapping !== undefined);
}

export interface WorkspaceDeploymentState {
    libraryProjectPaths: Set<string>;
    deployableProjectPaths: Set<string>;
    undeployedProjectScopes: ProjectScopeMapping[];
    hasDeployableIntegration: boolean;
}

export function getWorkspaceDeploymentState(
    projectCollection: ProjectStructureResponse | undefined,
    devantMetadata: WorkspaceDevantMetadata | undefined
): WorkspaceDeploymentState {
    const projectScopes = getWorkspaceProjectScopes(projectCollection);

    const libraryProjectPaths = (projectCollection?.projects ?? []).reduce<Set<string>>((paths, project) => {
        if (project.isLibrary && project.projectPath) {
            paths.add(project.projectPath);
        }
        return paths;
    }, new Set<string>());

    const deployableProjectPaths = new Set(projectScopes.map((scope) => scope.projectPath));

    const deployedPaths = new Set(
        (devantMetadata?.projectsMetadata ?? []).filter((p) => p.hasComponent).map((p) => p.projectPath)
    );
    const undeployedProjectScopes = projectScopes.filter(
        (scope) => !deployedPaths.has(scope.projectPath) && !libraryProjectPaths.has(scope.projectPath)
    );

    const hasDeployableIntegration = projectScopes.some(
        (scope) => scope.integrationTypes.length > 0 && !libraryProjectPaths.has(scope.projectPath)
    );

    return { libraryProjectPaths, deployableProjectPaths, undeployedProjectScopes, hasDeployableIntegration };
}

export function validateWorkspaceTitle(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return "You are required to enter a project name.";
    }
    if (!/^[a-zA-Z]/.test(trimmed)) {
        return "Name must start with an alphabetical letter.";
    }
    if (trimmed.length < 3) {
        return "The name must have at least three characters.";
    }
    if (/[^a-zA-Z0-9\-_ ]/.test(trimmed)) {
        return "The name cannot contain special characters.";
    }
    return "";
}

export function useProjectContentRefresh(rpcClient: BallerinaRpcClient | undefined, onUpdate: () => void): void {
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    useEffect(() => {
        if (!rpcClient) {
            return;
        }
        return rpcClient.onProjectContentUpdated((state: boolean) => {
            if (state) {
                onUpdateRef.current();
            }
        });
    }, [rpcClient]);
}
