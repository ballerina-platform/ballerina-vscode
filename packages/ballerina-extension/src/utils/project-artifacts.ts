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
import { ARTIFACT_TYPE, Artifacts, ArtifactsNotification, BaseArtifact, DIRECTORY_MAP, EVENT_TYPE, IconDescriptor, isPathInside, isSamePath, MACHINE_VIEW, PROJECT_KIND, ProjectInfo, ProjectStructure, ProjectStructureArtifactResponse, ProjectStructureResponse, resolveBrandIcon, resolveKindDefaultIcon, SHARED_COMMANDS, toIconDescriptor } from "@wso2/ballerina-core";
import { openView, StateMachine } from "../stateMachine";
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

// Serializes full rebuilds: a burst of notifications for an unknown package would
// otherwise rebuild concurrently, each run racing the others' structure updates.
let pendingStructureRebuild: Promise<ProjectStructureResponse | undefined> = Promise.resolve(undefined);

// Single-flight: `updateProjectArtifacts` runs fire-and-forget per notification, so a burst
// of notifications arriving before the first one resolves would otherwise each fetch project
// info independently. Share one in-flight fetch instead of one per notification.
let pendingProjectInfoFetch: Promise<ProjectInfo | undefined> | null = null;

function fetchProjectInfoSingleFlight(projectPath: string): Promise<ProjectInfo | undefined> {
    if (!pendingProjectInfoFetch) {
        pendingProjectInfoFetch = StateMachine.langClient().getProjectInfo({ projectPath })
            .finally(() => { pendingProjectInfoFetch = null; });
    }
    return pendingProjectInfoFetch;
}

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
            [DIRECTORY_MAP.AGENT]: [],
            [DIRECTORY_MAP.AGENT_DEFINITION]: [],
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

    const rootPath = StateMachine.context().workspacePath ?? StateMachine.context().projectPath;
    if (!rootPath) {
        console.warn("[updateProjectArtifacts] No project or workspace path found in the StateMachine context.");
        return;
    }
    const changedFsPath = URI.parse(publishedArtifacts.uri).fsPath.toLowerCase();
    const isWithinProject = changedFsPath.includes(URI.file(rootPath).fsPath.toLowerCase());

    const isSubmodule = publishedArtifacts?.moduleName;

    // A `persist` directory belongs to a package, which in a workspace is any member
    // package — so the exclusion is matched on the path's segments rather than against
    // a single `<root>/persist` path, which would only cover the root itself.
    const isInPersistDir = changedFsPath.split(/[\\/]/).includes('persist');

    if (currentProjectStructure && isWithinProject && !isSubmodule && !isInPersistDir) {
        // `rootPath` is the workspace root for a workspace project and the package root
        // for a standalone integration/library — which can still gain a sibling package,
        // e.g. when another integration/library is added via AI chat.
        const projectInfo = await fetchProjectInfoSingleFlight(rootPath);
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

        // Derive the owning package from the changed URI: in a workspace the context has
        // no single `projectPath`, so relying on it would resolve paths against undefined.
        const owningProjectPath = resolveOwningProjectPath(publishedArtifacts.uri, currentProjectStructure);

        // The cached structure can't absorb deltas for a package it doesn't know (just
        // added by the wizard or Copilot) — they'd be dropped or misapplied. Rebuild instead.
        if (untrackedProjectPaths.length > 0 || !owningProjectPath) {
            await rebuildAndPublishArtifacts(publishedArtifacts, projectInfo, untrackedProjectPaths);
            return;
        }

        const entryLocations = await traverseUpdatedComponents(publishedArtifacts.artifacts, currentProjectStructure, owningProjectPath);
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
    // Durable agentic workflows (workflow:DurableAgent declarations) list right after the
    // durable workflows in the same explorer section, distinguished only by the agent icon.
    // The WSO2 Integrator shell's explorer renders a section's children only when the entry
    // type matches the section, so the entries present as WORKFLOW; position-based click
    // routing still opens the agent model.
    response.directoryMap[DIRECTORY_MAP.WORKFLOW].push(...await getComponents(artifacts[ARTIFACT_TYPE.Workflows], projectPath, DIRECTORY_MAP.DURABLE_AGENT, "bi-ai-agent"));
    response.directoryMap[DIRECTORY_MAP.ACTIVITY].push(...await getComponents(artifacts[ARTIFACT_TYPE.Workflows], projectPath, DIRECTORY_MAP.ACTIVITY, "task"));
    response.directoryMap[DIRECTORY_MAP.DATA_MAPPER].push(...await getComponents(artifacts[ARTIFACT_TYPE.DataMappers], projectPath, DIRECTORY_MAP.DATA_MAPPER, "dataMapper"));
    response.directoryMap[DIRECTORY_MAP.CONNECTION].push(...await getComponents(artifacts[ARTIFACT_TYPE.Connections], projectPath, DIRECTORY_MAP.CONNECTION, "connection"));
    response.directoryMap[DIRECTORY_MAP.AGENT].push(...await getComponents(artifacts[ARTIFACT_TYPE.Agents], projectPath, DIRECTORY_MAP.AGENT, "bi-ai-agent"));
    response.directoryMap[DIRECTORY_MAP.AGENT_DEFINITION].push(...await getComponents(artifacts[ARTIFACT_TYPE.AgentDefinitions], projectPath, DIRECTORY_MAP.AGENT_DEFINITION, "bi-ai-agent"));
    response.directoryMap[DIRECTORY_MAP.TYPE].push(...await getComponents(artifacts[ARTIFACT_TYPE.Types], projectPath, DIRECTORY_MAP.TYPE, "type"));
    response.directoryMap[DIRECTORY_MAP.CONFIGURABLE].push(...await getComponents(artifacts[ARTIFACT_TYPE.Configurations], projectPath, DIRECTORY_MAP.CONFIGURABLE, "config"));
    response.directoryMap[DIRECTORY_MAP.NP_FUNCTION].push(...await getComponents(artifacts[ARTIFACT_TYPE.NaturalFunctions], projectPath, DIRECTORY_MAP.NP_FUNCTION, "function"));
}

function dedupeArtifactsById(artifacts: ProjectStructureArtifactResponse[]): ProjectStructureArtifactResponse[] {
    const uniqueArtifacts = new Map<string, ProjectStructureArtifactResponse>();
    artifacts.forEach((artifact) => uniqueArtifacts.set(artifact.id, artifact));
    return Array.from(uniqueArtifacts.values());
}

/** Key an artifact by type as well as id: ids are only unique within an artifact type. */
function artifactKey(artifactType: string, artifactId: string): string {
    return `${artifactType}::${artifactId}`;
}

/**
 * Rebuilds the structure from `projectInfo` and publishes the notification's artifacts
 * against it. The incremental {@link traverseUpdatedComponents} cannot be used — the
 * rebuild already absorbed the changes — but the artifacts must still be published, or
 * the caller waiting to navigate times out.
 */
async function rebuildAndPublishArtifacts(
    publishedArtifacts: ArtifactsNotification,
    projectInfo: ProjectInfo,
    untrackedProjectPaths: string[]
): Promise<void> {
    console.log(
        "[updateProjectArtifacts] Rebuilding the project structure. Untracked package(s):",
        untrackedProjectPaths, "changed file:", publishedArtifacts.uri
    );
    let entryLocations: ProjectStructureArtifactResponse[] = [];
    try {
        // Chained rather than shared: an in-flight rebuild may have read the project
        // before this notification's change landed, so a rebuild that starts after it
        // is still needed — it just must not run concurrently with the previous one.
        const rebuild = pendingStructureRebuild
            .catch(() => undefined)
            .then(() => StateMachine.updateProjectInfoAndRebuild(projectInfo));
        pendingStructureRebuild = rebuild;
        const rebuiltStructure = await rebuild;
        entryLocations = collectPublishedArtifacts(publishedArtifacts, rebuiltStructure);
        // Skip the fallback if the window is ALREADY showing one of the newly-tracked
        // packages: a create flow that scaffolds a package and then deliberately
        // navigates to its overview (e.g. the Create Integration wizard adding into an
        // open project) fires several of these untracked-package notifications, one per
        // scaffolded file — without this check, each one would override that navigation
        // with the workspace overview a moment after it happened.
        const alreadyViewingAddedPackage =
            StateMachine.context().view === MACHINE_VIEW.PackageOverview &&
            untrackedProjectPaths.some((p) => isSamePath(p, StateMachine.context().projectPath));
        if (untrackedProjectPaths.length > 0 && !alreadyViewingAddedPackage) {
            // Where the fire-and-forget refresh this replaces used to land the window
            // when a package joined the project: the overview is the view guaranteed to
            // be consistent with the rebuilt structure.
            openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.WorkspaceOverview });
        }
    } catch (error) {
        // Still publish below (with whatever was resolved) so subscribers are not left
        // hanging on a notification that will never come.
        console.error("[updateProjectArtifacts] Failed to rebuild the project structure:", error);
    }
    ArtifactNotificationHandler.getInstance().publish(ArtifactsUpdated.method, {
        data: entryLocations,
        timestamp: Date.now()
    });
}

/** Picks the notification's added/updated artifacts out of an up-to-date structure, flagging additions with `isNew`. */
function collectPublishedArtifacts(
    publishedArtifacts: ArtifactsNotification,
    projectStructure: ProjectStructureResponse
): ProjectStructureArtifactResponse[] {
    const owningProjectPath = resolveOwningProjectPath(publishedArtifacts.uri, projectStructure);
    const project = projectStructure?.projects?.find(project => isSamePath(project.projectPath, owningProjectPath));
    if (!project || !publishedArtifacts.artifacts) {
        console.warn("[collectPublishedArtifacts] No package in the project owns the changed file:",
            publishedArtifacts.uri);
        return [];
    }

    const entriesByKey = new Map<string, ProjectStructureArtifactResponse>();
    for (const entries of Object.values(project.directoryMap ?? {})) {
        for (const entry of entries ?? []) {
            entriesByKey.set(artifactKey(entry.type, entry.id), entry);
        }
    }

    const entryLocations: ProjectStructureArtifactResponse[] = [];
    const collect = (artifacts: BaseArtifact[], isNew: boolean) => {
        for (const artifact of artifacts) {
            const entry = entriesByKey.get(artifactKey(artifact.type, artifact.id));
            if (entry) {
                entryLocations.push(isNew ? { ...entry, isNew: true } : { ...entry });
            }
        }
    };
    for (const actionMap of Object.values(publishedArtifacts.artifacts)) {
        if (actionMap?.additions) {
            collect(Object.values(actionMap.additions) as BaseArtifact[], true);
        }
        if (actionMap?.updates) {
            collect(Object.values(actionMap.updates) as BaseArtifact[], false);
        }
    }
    return dedupeArtifactsById(entryLocations);
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
        // The WSO2 Integrator shell's explorer renders a section's children only when the
        // entry type matches the section, so durable agents present as WORKFLOW entries in
        // the same list, distinguished only by the agent icon; position-based click routing
        // still opens the agent model.
        type: artifact.type === DIRECTORY_MAP.DURABLE_AGENT ? DIRECTORY_MAP.WORKFLOW : artifact.type,
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
            const serviceIcon = toIconDescriptor(artifact.icon);
            entryValue.icon = resolveEntryGlyph(serviceIcon, artifact.module);
            entryValue.iconColor = resolveEntryColor(serviceIcon, artifact.module);
            entryValue.iconLight = serviceIcon?.light;
            entryValue.iconDark = serviceIcon?.dark;
            entryValue.triggerKind = artifact.triggerKind;
            entryValue.kind = serviceIcon?.kind;
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
            const listenerIcon = toIconDescriptor(artifact.icon);
            entryValue.icon = resolveEntryGlyph(listenerIcon, artifact.module);
            entryValue.iconColor = resolveEntryColor(listenerIcon, artifact.module);
            entryValue.iconLight = listenerIcon?.light;
            entryValue.iconDark = listenerIcon?.dark;
            entryValue.triggerKind = artifact.triggerKind;
            entryValue.kind = listenerIcon?.kind;
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
            if (artifact.type === DIRECTORY_MAP.DURABLE_AGENT) {
                return { mapKey: DIRECTORY_MAP.WORKFLOW, icon: "bi-ai-agent" };
            }
            return { mapKey: DIRECTORY_MAP.WORKFLOW, icon: "workflow" };
        case ARTIFACT_TYPE.DataMappers:
            return { mapKey: DIRECTORY_MAP.DATA_MAPPER, icon: "dataMapper" };
        case ARTIFACT_TYPE.Connections:
            return { mapKey: DIRECTORY_MAP.CONNECTION, icon: "connection" };
        case ARTIFACT_TYPE.Agents:
            return { mapKey: DIRECTORY_MAP.AGENT, icon: "bi-ai-agent" };
        case ARTIFACT_TYPE.AgentDefinitions:
            return { mapKey: DIRECTORY_MAP.AGENT_DEFINITION, icon: "bi-ai-agent" };
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
function processDeletion(artifact: BaseArtifact, artifactCategoryKey: string, projectStructure: ProjectStructureResponse, activeProjectPath: string): void {
    const mapping = getDirectoryMapKeyAndIcon(artifact, artifactCategoryKey);
    if (mapping) {
        try {
            const projectPath = activeProjectPath;
            const project = projectStructure.projects.find(project => isSamePath(project.projectPath, projectPath));
            // Deletion notifications carry only the artifact id (no type), so a category that fans out
            // into multiple directory map keys cannot be disambiguated here. Sweep every key the
            // category can produce; ids are unique within a category, so this is safe.
            const mapKeys = artifactCategoryKey === ARTIFACT_TYPE.Workflows
                ? [DIRECTORY_MAP.WORKFLOW, DIRECTORY_MAP.ACTIVITY]
                : [mapping.mapKey];
            for (const mapKey of mapKeys) {
                project.directoryMap[mapKey] =
                    project.directoryMap[mapKey]?.filter(value => value.id !== artifact.id) ?? [];
            }
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
async function processAddition(artifact: BaseArtifact, artifactCategoryKey: string, projectStructure: ProjectStructureResponse, activeProjectPath: string): Promise<ProjectStructureArtifactResponse | undefined> {
    const mapping = getDirectoryMapKeyAndIcon(artifact, artifactCategoryKey);
    if (mapping) {
        try {
            const projectPath = activeProjectPath;
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
async function processUpdate(artifact: BaseArtifact, artifactCategoryKey: string, projectStructure: ProjectStructureResponse, activeProjectPath: string): Promise<ProjectStructureArtifactResponse | undefined> {
    const mapping = getDirectoryMapKeyAndIcon(artifact, artifactCategoryKey);
    if (mapping) {
        try {
            const projectPath = activeProjectPath;
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

/** Resolves which package owns the changed file, preferring the deepest match so a workspace member wins over the root. */
function resolveOwningProjectPath(changedUri: string, projectStructure: ProjectStructureResponse): string | undefined {
    let changedFsPath: string;
    try {
        changedFsPath = URI.parse(changedUri).fsPath.toLowerCase();
    } catch {
        return undefined;
    }
    let best: string | undefined;
    for (const project of projectStructure.projects ?? []) {
        if (!project.projectPath) {
            continue;
        }
        // Both sides lowercased: path case is not significant on Windows.
        if (isPathInside(project.projectPath.toLowerCase(), changedFsPath)
            && (best === undefined || project.projectPath.length > best.length)) {
            best = project.projectPath;
        }
    }
    return best;
}

async function traverseUpdatedComponents(publishedArtifacts: Artifacts, currentProjectStructure: ProjectStructureResponse, activeProjectPath: string): Promise<ProjectStructureArtifactResponse[]> {
    const entryLocations: ProjectStructureArtifactResponse[] = [];
    const promises: Promise<ProjectStructureArtifactResponse | undefined>[] = [];

    // Iterate through each artifact category (e.g., EntryPoints, Listeners)
    for (const [artifactCategoryKey, actionMap] of Object.entries(publishedArtifacts)) {
        // Process Deletions first (synchronous)
        if (actionMap.deletions) {
            for (const artifact of Object.values(actionMap.deletions) as BaseArtifact[]) {
                processDeletion(artifact, artifactCategoryKey, currentProjectStructure, activeProjectPath);
            }
        }

        // Process Additions (asynchronous)
        if (actionMap.additions) {
            for (const artifact of Object.values(actionMap.additions) as BaseArtifact[]) {
                promises.push(processAddition(artifact, artifactCategoryKey, currentProjectStructure, activeProjectPath));
            }
        }

        // Process Updates (asynchronous)
        if (actionMap.updates) {
            for (const artifact of Object.values(actionMap.updates) as BaseArtifact[]) {
                promises.push(processUpdate(artifact, artifactCategoryKey, currentProjectStructure, activeProjectPath));
            }
        }
    }

    // Wait for all additions and updates to complete
    const results = await Promise.all(promises);

    const projectPath = activeProjectPath;
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

/**
 * Resolves the tree glyph for an entry point, honoring the Phase-6 representation order for a native
 * tree (glyph -> kind default) against the shared brand-icon registry in @wso2/ballerina-core (the
 * single source shared with the Add-Artifact gallery and the component diagram): the LS-declared
 * `icon.glyph`, then the registry brand glyph keyed by module, then the `kind` default.
 */
function resolveEntryGlyph(icon: IconDescriptor | undefined, module: string | undefined): string {
    return icon?.glyph
        ?? (icon?.source === "trigger-ui-metadata" ? undefined : resolveBrandIcon(module)?.glyph)
        ?? resolveKindDefaultIcon(icon?.kind).glyph;
}

/** Resolves the glyph tint: the LS-declared `icon.color`, else the shared registry's brand color. */
function resolveEntryColor(icon: IconDescriptor | undefined, module: string | undefined): string | undefined {
    return icon?.color
        ?? (icon?.source === "trigger-ui-metadata" ? undefined : resolveBrandIcon(module)?.color);
}
