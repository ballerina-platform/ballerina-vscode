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
import * as vscode from "vscode";
import { URI, Utils } from "vscode-uri";
import { ARTIFACT_TYPE, Artifacts, ArtifactsNotification, BaseArtifact, DIRECTORY_MAP, isSamePath, PROJECT_KIND, ProjectInfo, ProjectStructure, ProjectStructureArtifactResponse, ProjectStructureResponse, SHARED_COMMANDS } from "@wso2/ballerina-core";
import { StateMachine } from "../stateMachine";
import { ExtendedLangClient } from "../core/extended-language-client";
import { ArtifactsUpdated, ArtifactNotificationHandler } from "./project-artifacts-handler";
import { isLibraryProject } from "./config";

// Tracks projects whose artifacts could not be fetched (e.g., the initial load raced with a
// missing-module pull and the compilation failed). Used to recover with a full rebuild once
// the LS publishes artifacts after the pull completes.
const failedArtifactProjects = new Set<string>();

// True while a recovery rebuild is in flight. Overlapping publishArtifacts notifications are
// skipped during this window: the rebuild fetches the latest project state anyway, and letting
// them run the incremental path would race the rebuild with updates based on stale structure.
let artifactRecoveryInProgress = false;

export async function buildProjectsStructure(
    projectInfo: ProjectInfo,
    langClient: ExtendedLangClient,
    isUpdate: boolean = false
): Promise<ProjectStructureResponse> {

    const isWorkspace = projectInfo.projectKind === PROJECT_KIND.WORKSPACE_PROJECT;

    const packages = isWorkspace ? projectInfo.children : [projectInfo];

    const projects: ProjectStructure[] = [];
    for (const packageInfo of packages) {
        const project = await buildProjectArtifactsStructure(
            packageInfo.projectPath,
            packageInfo.name,
            packageInfo.title,
            langClient
        );
        projects.push(project);
    }

    const response: ProjectStructureResponse = {
        workspaceName: isWorkspace ? projectInfo.name : undefined,
        workspacePath: isWorkspace ? projectInfo.projectPath : undefined,
        workspaceTitle: isWorkspace ? projectInfo.title : undefined,
        projects: projects
    };

    if (isUpdate) {
        StateMachine.updateProjectStructure({ ...response });
    }

    return response;
}

async function buildProjectArtifactsStructure(
    projectPath: string,
    packageName: string,
    packageTitle: string,
    langClient: ExtendedLangClient
): Promise<ProjectStructure> {
    const result: ProjectStructure = {
        projectName: packageName,
        projectPath: projectPath,
        projectTitle: packageTitle,
        // Workaround to check if the project is a library project.
        // This will be removed once the projectInfo is updated to include the library flag.
        isLibrary: await isLibraryProject(projectPath),
        directoryMap: {
            [DIRECTORY_MAP.AUTOMATION]: [],
            [DIRECTORY_MAP.SERVICE]: [],
            [DIRECTORY_MAP.LISTENER]: [],
            [DIRECTORY_MAP.FUNCTION]: [],
            [DIRECTORY_MAP.CONNECTION]: [],
            [DIRECTORY_MAP.TYPE]: [],
            [DIRECTORY_MAP.CONFIGURABLE]: [],
            [DIRECTORY_MAP.DATA_MAPPER]: [],
            [DIRECTORY_MAP.NP_FUNCTION]: [],
            [DIRECTORY_MAP.AGENTS]: [],
            [DIRECTORY_MAP.AGENT_DEFINITIONS]: [],
            [DIRECTORY_MAP.LOCAL_CONNECTORS]: [],
            [DIRECTORY_MAP.WORKFLOW]: [],
            [DIRECTORY_MAP.ACTIVITY]: [],
        }
    };
    const designArtifacts = await langClient.getProjectArtifacts({ projectPath });
    console.log("designArtifacts", designArtifacts);
    if (designArtifacts?.artifacts) {
        failedArtifactProjects.delete(projectPath);
        traverseComponents(designArtifacts.artifacts, projectPath, result);
        await populateLocalConnectors(projectPath, result);
    } else {
        // The artifact fetch failed (e.g., compilation error while modules are being pulled).
        // Remember it so the next publishArtifacts notification triggers a full rebuild.
        failedArtifactProjects.add(projectPath);
        console.warn("[buildProjectArtifactsStructure] Failed to fetch artifacts for project:", projectPath);
    }

    return result;
}

export async function updateProjectArtifacts(publishedArtifacts: ArtifactsNotification): Promise<void> {
    // A recovery rebuild is already running; it fetches the post-edit state, so this
    // notification's changes are covered by the rebuild.
    if (artifactRecoveryInProgress) {
        return;
    }

    // If any project's artifacts failed to load earlier (e.g., the initial load raced with a
    // missing-module pull), the cached structure is empty and incremental deltas cannot repair
    // it. The LS publishes artifacts once the pull completes and the project is reloaded, so
    // recover here with a full rebuild instead of applying the deltas.
    if (failedArtifactProjects.size > 0) {
        const failedSnapshot = Array.from(failedArtifactProjects);
        console.log("[updateProjectArtifacts] Rebuilding project structure; artifacts previously failed for:",
            failedSnapshot);
        artifactRecoveryInProgress = true;
        // Clear before the rebuild; buildProjectArtifactsStructure re-adds any project that
        // still fails, and stale entries (e.g., removed packages) get pruned.
        failedArtifactProjects.clear();
        const notificationHandler = ArtifactNotificationHandler.getInstance();
        notificationHandler.publish(ArtifactsUpdated.method, {
            data: [],
            timestamp: Date.now()
        });
        try {
            await vscode.commands.executeCommand(SHARED_COMMANDS.FORCE_UPDATE_PROJECT_ARTIFACTS);
        } catch (error) {
            // Restore the failed state so the next notification retries the recovery.
            failedSnapshot.forEach(projectPath => failedArtifactProjects.add(projectPath));
            console.error("[updateProjectArtifacts] Failed to rebuild the project structure:", error);
        } finally {
            artifactRecoveryInProgress = false;
        }
        return;
    }

    // Current project structure
    const currentProjectStructure: ProjectStructureResponse = StateMachine.context().projectStructure;

    const rootPath = StateMachine.context().projectPath ?? StateMachine.context().workspacePath;
    if (!rootPath) {
        console.warn("[updateProjectArtifacts] No project or workspace path found in the StateMachine context.");
        return;
    }
    const projectUri = URI.file(rootPath);
    const isWithinProject = URI
        .parse(publishedArtifacts.uri).fsPath.toLowerCase()
        .includes(projectUri.fsPath.toLowerCase());

    const isSubmodule = publishedArtifacts?.moduleName;

    const persistDir = Utils.joinPath(projectUri, 'persist').fsPath.toLowerCase();
    const isInPersistDir = URI.parse(publishedArtifacts.uri).fsPath.toLowerCase().includes(persistDir);

    if (currentProjectStructure && isWithinProject && !isSubmodule && !isInPersistDir) {
        // If user is working on a workspace project pick the workspace path, otherwise fallback to the project path.
        // Fallback can happen when user is working on a standalone integration/library and
        // adding another integration/library via AI chat.
        const workspacePath = StateMachine.context().workspacePath ?? StateMachine.context().projectPath;
        if (!workspacePath) {
            console.warn("[updateProjectArtifacts] Workspace path not found in the StateMachine context.");
            return;
        }
        
        const projectInfo = await StateMachine.langClient().getProjectInfo({ projectPath: workspacePath });
        if (!projectInfo) {
            console.warn("[updateProjectArtifacts] Project info not found for the project:", rootPath);
            return;
        }

        const isWorkspace = projectInfo.projectKind === PROJECT_KIND.WORKSPACE_PROJECT;
        const packages = isWorkspace ? projectInfo.children : [projectInfo];

        const untrackedProjectPaths = packages
            ?.filter(child => child?.projectPath !== undefined)
            ?.filter(
                child => !currentProjectStructure.projects
                    ?.some(project => isSamePath(project.projectPath, child.projectPath))
            ).map(child => child.projectPath) ?? [];

        // Check if the active project exists in the current structure.
        // If not (e.g., a new package was added by Copilot), a full rebuild is needed
        // since we can't incrementally update a project that doesn't exist yet.
        for (const untrackedProjectPath of untrackedProjectPaths) {
            console.log("[updateProjectArtifacts] Project not found in structure, triggering full rebuild:", untrackedProjectPath);
            const notificationHandler = ArtifactNotificationHandler.getInstance();
            notificationHandler.publish(ArtifactsUpdated.method, {
                data: [],
                timestamp: Date.now()
            });
            StateMachine.refreshProjectInfo();
            return;
        }

        const entryLocations = await traverseUpdatedComponents(publishedArtifacts.artifacts, currentProjectStructure);
        const notificationHandler = ArtifactNotificationHandler.getInstance();
        // Publish a notification to the artifact handler
        notificationHandler.publish(ArtifactsUpdated.method, {
            data: entryLocations,
            timestamp: Date.now()
        });
        StateMachine.updateProjectStructure({ ...currentProjectStructure }); // Update the project structure and refresh the tree
    } else {
        const notificationHandler = ArtifactNotificationHandler.getInstance();
        // Publish a notification to the artifact handler
        notificationHandler.publish(ArtifactsUpdated.method, {
            data: [],
            timestamp: Date.now()
        });
    }
}

async function traverseComponents(artifacts: Artifacts, projectPath: string, response: ProjectStructure) {
    response.directoryMap[DIRECTORY_MAP.AUTOMATION].push(...await getComponents(artifacts[ARTIFACT_TYPE.EntryPoints], projectPath, DIRECTORY_MAP.AUTOMATION, "task"));
    response.directoryMap[DIRECTORY_MAP.SERVICE].push(...await getComponents(artifacts[ARTIFACT_TYPE.EntryPoints], projectPath, DIRECTORY_MAP.SERVICE, "http-service"));
    response.directoryMap[DIRECTORY_MAP.LISTENER].push(...await getComponents(artifacts[ARTIFACT_TYPE.Listeners], projectPath, DIRECTORY_MAP.LISTENER, "http-service"));
    response.directoryMap[DIRECTORY_MAP.FUNCTION].push(...await getComponents(artifacts[ARTIFACT_TYPE.Functions], projectPath, DIRECTORY_MAP.FUNCTION, "function"));
    response.directoryMap[DIRECTORY_MAP.WORKFLOW].push(...await getComponents(artifacts[ARTIFACT_TYPE.Workflows], projectPath, DIRECTORY_MAP.WORKFLOW, "workflow"));
    response.directoryMap[DIRECTORY_MAP.ACTIVITY].push(...await getComponents(artifacts[ARTIFACT_TYPE.Workflows], projectPath, DIRECTORY_MAP.ACTIVITY, "task"));
    response.directoryMap[DIRECTORY_MAP.DATA_MAPPER].push(...await getComponents(artifacts[ARTIFACT_TYPE.DataMappers], projectPath, DIRECTORY_MAP.DATA_MAPPER, "dataMapper"));
    response.directoryMap[DIRECTORY_MAP.CONNECTION].push(...await getComponents(artifacts[ARTIFACT_TYPE.Connections], projectPath, DIRECTORY_MAP.CONNECTION, "connection"));
    response.directoryMap[DIRECTORY_MAP.AGENTS].push(...await getComponents(artifacts[ARTIFACT_TYPE.Agents], projectPath, DIRECTORY_MAP.AGENT, "bi-ai-agent"));
    response.directoryMap[DIRECTORY_MAP.AGENT_DEFINITIONS].push(...await getComponents(artifacts[ARTIFACT_TYPE.AgentDefinitions], projectPath, DIRECTORY_MAP.AGENT_DEFINITION, "bi-ai-agent"));
    response.directoryMap[DIRECTORY_MAP.TYPE].push(...await getComponents(artifacts[ARTIFACT_TYPE.Types], projectPath, DIRECTORY_MAP.TYPE, "type"));
    response.directoryMap[DIRECTORY_MAP.CONFIGURABLE].push(...await getComponents(artifacts[ARTIFACT_TYPE.Configurations], projectPath, DIRECTORY_MAP.CONFIGURABLE, "config"));
    response.directoryMap[DIRECTORY_MAP.NP_FUNCTION].push(...await getComponents(artifacts[ARTIFACT_TYPE.NaturalFunctions], projectPath, DIRECTORY_MAP.NP_FUNCTION, "function"));
}

function dedupeArtifactsById(artifacts: ProjectStructureArtifactResponse[]): ProjectStructureArtifactResponse[] {
    const uniqueArtifacts = new Map<string, ProjectStructureArtifactResponse>();
    artifacts.forEach((artifact) => uniqueArtifacts.set(artifact.id, artifact));
    return Array.from(uniqueArtifacts.values());
}

async function getComponents(
    artifacts: Record<string, BaseArtifact>,
    projectPath: string,
    artifactType: DIRECTORY_MAP,
    icon: string,
    moduleName?: string
): Promise<ProjectStructureArtifactResponse[]> {

    const entries: ProjectStructureArtifactResponse[] = [];
    if (!artifacts) {
        return entries;
    }
    // Loop though the artifact records and create the project structure artifact response
    for (const [key, artifact] of Object.entries(artifacts)) {
        // Skip the entry to the entries array if the artifact type does not match the requested artifact type
        if (artifact.type !== artifactType) {
            continue;
        }
        const entryValue = await getEntryValue(artifact, projectPath, icon, moduleName);
        entries.push(entryValue);
    }
    return entries;
}

async function getEntryValue(artifact: BaseArtifact, projectPath: string, icon: string, moduleName?: string) {
    const targetFile = Utils.joinPath(URI.file(projectPath), artifact.location.fileName).fsPath;
    const entryValue: ProjectStructureArtifactResponse = {
        id: artifact.id,
        name: artifact.name,
        path: targetFile,
        moduleName: artifact.module,
        type: artifact.type,
        icon: artifact.module ? `bi-${artifact.module}` : icon,
        context: artifact.name === "automation" ? "main" : artifact.name,
        resources: [],
        visibility: artifact.visibility,
        position: {
            endColumn: artifact.location.endLine.offset,
            endLine: artifact.location.endLine.line,
            startColumn: artifact.location.startLine.offset,
            startLine: artifact.location.startLine.line
        }
    };
    switch (artifact.type) {
        case DIRECTORY_MAP.AUTOMATION:
            // Do things related to automation
            entryValue.name = `Automation`;
            break;
        case DIRECTORY_MAP.SERVICE:
            // Do things related to service
            entryValue.name = getServiceDisplayName(artifact); // GraphQL Service - /foo
            entryValue.icon = getCustomEntryNodeIcon(artifact.module);
            if (artifact.module === "ai") {
                entryValue.resources = [];
                const aiResourceLocation = Object.values(artifact.children).find(child => child.type === DIRECTORY_MAP.RESOURCE)?.location;
                entryValue.position = {
                    endColumn: aiResourceLocation.endLine.offset,
                    endLine: aiResourceLocation.endLine.line,
                    startColumn: aiResourceLocation.startLine.offset,
                    startLine: aiResourceLocation.startLine.line
                };
            } else {
                // Get the children of the service
                const resourceFunctions = await getComponents(artifact.children, projectPath, DIRECTORY_MAP.RESOURCE, icon, artifact.module);
                const remoteFunctions = await getComponents(artifact.children, projectPath, DIRECTORY_MAP.REMOTE, icon, artifact.module);
                const privateFunctions = await getComponents(artifact.children, projectPath, DIRECTORY_MAP.FUNCTION, icon, artifact.module);
                entryValue.resources = [...resourceFunctions, ...remoteFunctions, ...privateFunctions];
            }
            break;
        case DIRECTORY_MAP.TYPE:
            if (artifact.children && Object.keys(artifact.children).length > 0) {
                const resourceFunctions = await getComponents(artifact.children, projectPath, DIRECTORY_MAP.RESOURCE, icon, artifact.module);
                const remoteFunctions = await getComponents(artifact.children, projectPath, DIRECTORY_MAP.REMOTE, icon, artifact.module);
                const privateFunctions = await getComponents(artifact.children, projectPath, DIRECTORY_MAP.FUNCTION, icon, artifact.module);
                entryValue.resources = [...resourceFunctions, ...remoteFunctions, ...privateFunctions];
            }
            break;
        case DIRECTORY_MAP.LISTENER:
            // Do things related to listener
            const listenerModule = getTypePrefix(artifact.module);
            entryValue.icon = listenerModule === "ai"
                ? "bi-ai-listener"
                : getCustomEntryNodeIcon(listenerModule);
            break;
        case DIRECTORY_MAP.CONNECTION:
            entryValue.icon = icon;
            break;
        case DIRECTORY_MAP.AGENT:
            entryValue.icon = icon;
            break;
        case DIRECTORY_MAP.AGENT_DEFINITION:
            entryValue.icon = icon;
            break;
        case DIRECTORY_MAP.RESOURCE:
            // Do things related to resource
            let resourceName = `${artifact.name}`;
            let resourceIcon = `${artifact.accessor}-api`;
            if (moduleName && moduleName === "graphql") {
                resourceName = `${artifact.name}`;
                resourceIcon = ``;
            }
            entryValue.name = resourceName;
            entryValue.icon = resourceIcon;
            break;
        case DIRECTORY_MAP.REMOTE:
            // Do things related to remote
            entryValue.icon = ``;
            break;
    }
    return entryValue;
}

function getServiceDisplayName(artifact: BaseArtifact): string {
    if (artifact.module !== "ftp") {
        return artifact.name;
    }
    const accessor = artifact.accessor?.trim();
    if (!accessor) {
        return artifact.name;
    }
    const suffix = ` - ${accessor}`;
    return artifact.name.includes(suffix) ? artifact.name : `${artifact.name}${suffix}`;
}

/**
 * Maps an ARTIFACT_TYPE category key and a specific artifact to the corresponding DIRECTORY_MAP key and a default icon.
 * Note: The icon returned here is a base icon; `getEntryValue` might assign a more specific icon later based on the module.
 * @param artifact The specific artifact being processed. Used to differentiate between AUTOMATION and SERVICE within EntryPoints.
 * @param artifactCategoryKey The category key from ARTIFACT_TYPE (e.g., ARTIFACT_TYPE.EntryPoints).
 * @returns An object containing the DIRECTORY_MAP key and a base icon string, or null if the category is unhandled.
 */
function getDirectoryMapKeyAndIcon(artifact: BaseArtifact, artifactCategoryKey: string): { mapKey: DIRECTORY_MAP; icon: string } | null {
    switch (artifactCategoryKey) {
        case ARTIFACT_TYPE.EntryPoints:
            // EntryPoints can be either AUTOMATION or SERVICE type artifacts.
            // We use the artifact's ID as per the original logic to distinguish.
            if (artifact.id === "automation") {
                // Check the type for consistency, although original code relied on ID.
                if (artifact.type === DIRECTORY_MAP.AUTOMATION) {
                    return { mapKey: DIRECTORY_MAP.AUTOMATION, icon: "task" };
                } else {
                    console.warn(`Artifact with id 'automation' has unexpected type: ${artifact.type}`);
                    // Fallback based on ID, but log a warning.
                    return { mapKey: DIRECTORY_MAP.AUTOMATION, icon: "task" };
                }
            } else {
                // Assume it's a service if not automation.
                // Add a type check for robustness.
                if (artifact.type === DIRECTORY_MAP.SERVICE) {
                    return { mapKey: DIRECTORY_MAP.SERVICE, icon: "http-service" };
                } else {
                    console.warn(`EntryPoint artifact (id: ${artifact.id}) has unexpected type: ${artifact.type}. Assuming SERVICE.`);
                    // Fallback based on non-automation ID.
                    return { mapKey: DIRECTORY_MAP.SERVICE, icon: "http-service" };
                }
            }
        case ARTIFACT_TYPE.Listeners:
            return { mapKey: DIRECTORY_MAP.LISTENER, icon: "http-service" }; // Base icon, getEntryValue might refine
        case ARTIFACT_TYPE.Functions:
            return { mapKey: DIRECTORY_MAP.FUNCTION, icon: "function" };
        case ARTIFACT_TYPE.Workflows:
            if (artifact.type === DIRECTORY_MAP.ACTIVITY) {
                return { mapKey: DIRECTORY_MAP.ACTIVITY, icon: "task" };
            }
            return { mapKey: DIRECTORY_MAP.WORKFLOW, icon: "workflow" };
        case ARTIFACT_TYPE.DataMappers:
            return { mapKey: DIRECTORY_MAP.DATA_MAPPER, icon: "dataMapper" };
        case ARTIFACT_TYPE.Connections:
            return { mapKey: DIRECTORY_MAP.CONNECTION, icon: "connection" };
        case ARTIFACT_TYPE.Agents:
            return { mapKey: DIRECTORY_MAP.AGENTS, icon: "bi-ai-agent" };
        case ARTIFACT_TYPE.AgentDefinitions:
            return { mapKey: DIRECTORY_MAP.AGENT_DEFINITIONS, icon: "bi-ai-agent" };
        case ARTIFACT_TYPE.Types:
            return { mapKey: DIRECTORY_MAP.TYPE, icon: "type" };
        case ARTIFACT_TYPE.Configurations:
            return { mapKey: DIRECTORY_MAP.CONFIGURABLE, icon: "config" };
        case ARTIFACT_TYPE.NaturalFunctions:
            return { mapKey: DIRECTORY_MAP.NP_FUNCTION, icon: "function" };
        case ARTIFACT_TYPE.Variables:
            return { mapKey: DIRECTORY_MAP.VARIABLE, icon: "variable" };
        default:
            console.warn(`Unhandled artifact category key: ${artifactCategoryKey}`);
            return null;
    }
}

/**
 * Processes a single artifact deletion.
 * @param artifact The artifact to delete.
 * @param artifactCategoryKey The category key (from ARTIFACT_TYPE).
 * @param projectStructure The project structure to modify.
 */
function processDeletion(artifact: BaseArtifact, artifactCategoryKey: string, projectStructure: ProjectStructureResponse): void {
    const mapping = getDirectoryMapKeyAndIcon(artifact, artifactCategoryKey);
    if (mapping) {
        try {
            const projectPath = StateMachine.context().projectPath;
            const project = projectStructure.projects.find(project => isSamePath(project.projectPath, projectPath));
            project.directoryMap[mapping.mapKey] =
                project.directoryMap[mapping.mapKey]?.filter(value => value.id !== artifact.id) ?? [];
        } catch (error) {
            //TODO: Hack: Properly fix for the workspace scenario
            console.error(`Error processing deletion for artifact ${artifact.id} in category ${artifactCategoryKey}:`, error);
        }
    } else {
        console.error(`Could not determine directory map key for deletion of artifact ${artifact.id} in category ${artifactCategoryKey}`);
    }
}

/**
 * Processes a single artifact addition.
 * @param artifact The artifact to add.
 * @param artifactCategoryKey The category key (from ARTIFACT_TYPE).
 * @param projectStructure The project structure to modify.
 * @returns A promise resolving to the potentially relevant visualization entry, or undefined.
 */
async function processAddition(artifact: BaseArtifact, artifactCategoryKey: string, projectStructure: ProjectStructureResponse): Promise<ProjectStructureArtifactResponse | undefined> {
    const mapping = getDirectoryMapKeyAndIcon(artifact, artifactCategoryKey);
    if (mapping) {
        try {
            const projectPath = StateMachine.context().projectPath;
            const entryValue = await getEntryValue(artifact, projectPath, mapping.icon);

            const project = projectStructure.projects.find(project => isSamePath(project.projectPath, projectPath));
            // Ensure the array exists before pushing
            if (!project.directoryMap[mapping.mapKey]) {
                project.directoryMap[mapping.mapKey] = [];
            }
            entryValue.isNew = true; // This is a flag to identify the new artifact
            project.directoryMap[mapping.mapKey]?.push(entryValue);
            return entryValue;
        } catch (error) {
            console.error(`Error processing addition for artifact ${artifact.id} in category ${artifactCategoryKey}:`, error);
            return undefined;
        }
    } else {
        console.error(`Could not determine directory map key for addition of artifact ${artifact.id} in category ${artifactCategoryKey}`);
        return undefined;
    }
}

/**
 * Processes a single artifact update.
 * @param artifact The artifact to update.
 * @param artifactCategoryKey The category key (from ARTIFACT_TYPE).
 * @param projectStructure The project structure to modify.
 * @returns A promise resolving to the potentially relevant visualization entry, or undefined.
 */
async function processUpdate(artifact: BaseArtifact, artifactCategoryKey: string, projectStructure: ProjectStructureResponse): Promise<ProjectStructureArtifactResponse | undefined> {
    const mapping = getDirectoryMapKeyAndIcon(artifact, artifactCategoryKey);
    if (mapping) {
        try {
            const projectPath = StateMachine.context().projectPath;
            const entryValue = await getEntryValue(artifact, projectPath, mapping.icon);
            const project = projectStructure.projects.find(project => isSamePath(project.projectPath, projectPath));
            // Ensure the array exists
            if (!project.directoryMap[mapping.mapKey]) {
                project.directoryMap[mapping.mapKey] = [];
            }
            const index = project.directoryMap[mapping.mapKey]?.findIndex(value => value.id === artifact.id);
            if (index !== undefined && index !== -1) {
                project.directoryMap[mapping.mapKey][index] = entryValue;
            } else {
                // Artifact not found for update, add it instead (matches original logic)
                console.warn(`Artifact ${artifact.id} not found for update in ${mapping.mapKey}, adding it instead.`);
                project.directoryMap[mapping.mapKey]?.push(entryValue);
            }
            return entryValue;
        } catch (error) {
            console.error(`Error processing update for artifact ${artifact.id} in category ${artifactCategoryKey}:`, error);
            return undefined;
        }
    } else {
        console.error(`Could not determine directory map key for update of artifact ${artifact.id} in category ${artifactCategoryKey}`);
        return undefined;
    }
}

async function traverseUpdatedComponents(publishedArtifacts: Artifacts, currentProjectStructure: ProjectStructureResponse): Promise<ProjectStructureArtifactResponse[]> {
    const entryLocations: ProjectStructureArtifactResponse[] = [];
    const promises: Promise<ProjectStructureArtifactResponse | undefined>[] = [];

    // Iterate through each artifact category (e.g., EntryPoints, Listeners)
    for (const [artifactCategoryKey, actionMap] of Object.entries(publishedArtifacts)) {
        // Process Deletions first (synchronous)
        if (actionMap.deletions) {
            for (const artifact of Object.values(actionMap.deletions) as BaseArtifact[]) {
                processDeletion(artifact, artifactCategoryKey, currentProjectStructure);
            }
        }

        // Process Additions (asynchronous)
        if (actionMap.additions) {
            for (const artifact of Object.values(actionMap.additions) as BaseArtifact[]) {
                promises.push(processAddition(artifact, artifactCategoryKey, currentProjectStructure));
            }
        }

        // Process Updates (asynchronous)
        if (actionMap.updates) {
            for (const artifact of Object.values(actionMap.updates) as BaseArtifact[]) {
                promises.push(processUpdate(artifact, artifactCategoryKey, currentProjectStructure));
            }
        }
    }

    // Wait for all additions and updates to complete
    const results = await Promise.all(promises);

    const projectPath = StateMachine.context().projectPath;
    const project = currentProjectStructure.projects.find(project => isSamePath(project.projectPath, projectPath));
    try {
        if (project) {
            for (const key of Object.keys(project.directoryMap)) {
                if (project.directoryMap[key]) {
                    project.directoryMap[key].sort((a, b) => a.name.localeCompare(b.name));
                }
            }
        }
    } catch (error) {
        //TODO: Hack: Properly fix for the workspace scenario
        console.error(`Error sorting directory map entries for project ${projectPath}:`, error);
    }

    // Populate addition entry locations
    for (const result of results) {
        if (result) {
            entryLocations.push(result);
        }
    }
    return entryLocations;
}

async function populateLocalConnectors(projectDir: string, response: ProjectStructure) {
    const filePath = `${projectDir}/Ballerina.toml`;
    const localConnectors = (await StateMachine.langClient().getOpenApiGeneratedModules({ projectPath: projectDir })).modules || [];
    const mappedEntries: ProjectStructureArtifactResponse[] = localConnectors.map(moduleName => ({
        id: moduleName,
        name: moduleName,
        path: filePath,
        type: "HTTP",
        icon: "connection",
        context: moduleName,
        resources: [],
        position: {
            endColumn: 61,
            endLine: 8,
            startColumn: 0,
            startLine: 5
        }
    }));

    response.directoryMap[DIRECTORY_MAP.LOCAL_CONNECTORS].push(...mappedEntries);
}

function getCustomEntryNodeIcon(type: string) {
    switch (type) {
        case "tcp":
            return "bi-tcp";
        case "ai":
            return "bi-ai-agent";
        case "kafka":
            return "bi-kafka";
        case "rabbitmq":
            return "bi-rabbitmq";
        case "nats":
            return "bi-nats";
        case "mqtt":
            return "bi-mqtt";
        case "grpc":
            return "bi-grpc";
        case "graphql":
            return "bi-graphql";
        case "java.jms":
            return "bi-java";
        case "github":
            return "bi-github";
        case "salesforce":
            return "bi-salesforce";
        case "asb":
            return "bi-asb";
        case "ftp":
            return "bi-ftp";
        case "file":
            return "bi-file";
        case "mcp":
            return "bi-mcp";
        case "solace":
            return "bi-solace";
        case "mssql":
            return "bi-mssql";
        case "mysql":
            return "bi-mysql";
        case "postgresql":
            return "bi-postgresql";
        case "trigger.shopify":
        case "shopify":
            return "bi-shopify";
        case "trigger.hubspot":
        case "hubspot":
            return "bi-hubspot";
        case "trigger.twilio":
        case "twilio":
            return "bi-twilio";
        default:
            return "bi-globe";
    }
}

const getTypePrefix = (type: string): string => {
    if (!type) { return ""; }
    const parts = type.split(":");
    return parts.length > 1 ? parts[0] : type;
};
