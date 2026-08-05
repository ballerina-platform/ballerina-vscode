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
import { commands, workspace, Uri } from "vscode";
import * as fs from 'fs';
import * as os from 'os';
import path from "path";
import {
    AddProjectToWorkspaceRequest,
    BallerinaProjectComponents,
    ComponentRequest,
    CreateComponentResponse,
    createFunctionSignature,
    EVENT_TYPE,
    IntegrationComponentLabel,
    isPathInside,
    isSamePath,
    MigrateRequest,
    NodePosition,
    ProjectMigrationResult,
    ProjectRequest,
    STModification,
    SyntaxTreeResponse,
    WorkspaceTomlValues,
    PackageTomlValues,
    ValidateProjectFormErrorField,
    SuggestedProjectDefaultsResponse
} from "@wso2/ballerina-core";
import { StateMachine, history, openView } from "../stateMachine";
import { applyModifications, modifyFileContent, writeBallerinaFileDidOpen } from "./modification";
import { ModulePart, STKindChecker } from "@wso2/syntax-tree";
import { URI } from "vscode-uri";
import { debug } from "./logger";
import { parse } from "@iarna/toml";
import { getProjectTomlValues, VALIDATOR_PACKAGE_NAME } from "./config";
import { extension } from "../BalExtensionContext";
import { scheduleMigrationEnhancement, writeEnhanceToml } from "../features/ai/migration/orchestrator";
// Imported from `startup-progress` rather than `pending-artifact`: that module pulls in the
// RPC managers, which import this file back.
import { PendingIntegrationLanding, writePendingIntegrationPointer } from "../features/bi/startup-progress";
import { runBackgroundTerminalCommand } from "./runCommand";
import { stringify as stringifyYaml } from "yaml";

export const README_FILE = "README.md";
export const FUNCTIONS_FILE = "functions.bal";
export const DATA_MAPPING_FILE = "data_mappings.bal";

/**
 * Interface for the processed project information
 */
interface ProcessedProjectInfo {
    sanitizedPackageName: string;
    projectRoot: string;
    finalOrgName: string;
    finalVersion: string;
    packageName: string;
    integrationName: string;
    orgHandle: string;
}

const settingsJsonContent = `
{
    "ballerina.isBI": true
}
`;

const launchJsonContent = `
{
    // Use IntelliSense to learn about possible attributes.
    // Hover to view descriptions of existing attributes.
    // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Ballerina Debug",
            "type": "ballerina",
            "request": "launch",
            "programArgs": [],
            "commandOptions": [],
            "env": {}
        },
        {
            "name": "Ballerina Test",
            "type": "ballerina",
            "request": "launch",
            "debugTests": true,
            "programArgs": [],
            "commandOptions": [],
            "env": {}
        },
        {
            "name": "Ballerina Remote",
            "type": "ballerina",
            "request": "attach",
            "debuggeeHost": "127.0.0.1",
            "debuggeePort": "5005"
        }
    ]
}
`;

const gitignoreContent = `
# Ballerina generates this directory during the compilation of a package.
# It contains compiler-generated artifacts and the final executable if this is an application package.
target/

# Ballerina maintains the compiler-generated source code here.
# Remove this if you want to commit generated sources.
generated/

# Contains configuration values used during development time.
# See https://ballerina.io/learn/provide-values-to-configurable-variables/ for more details.
Config.toml

# File used to enable development-time tracing.
# This should not be committed to version control.
trace_enabled.bal
`;

export function getUsername(): string {
    // Get current username from the system across different OS platforms
    let username: string;
    if (process.platform === 'win32') {
        // Windows
        username = process.env.USERNAME || 'myOrg';
    } else {
        // macOS and Linux
        username = process.env.USER || 'myOrg';
    }
    return username;
}

type BallerinaTomlValues = Partial<WorkspaceTomlValues & PackageTomlValues>;

interface BallerinaProject {
    /** `[workspace]` marks a multi-package workspace (the UI's "project"); otherwise a single package. */
    kind: 'workspace' | 'package';
    toml: BallerinaTomlValues;
}

/** Reads the `Ballerina.toml` at `dir` once, returning its kind and parsed document (null when there is none). */
function readBallerinaProject(dir: string): BallerinaProject | null {
    const ballerinaTomlPath = path.join(dir, 'Ballerina.toml');
    if (!fs.existsSync(ballerinaTomlPath)) {
        return null;
    }
    try {
        const toml = parse(fs.readFileSync(ballerinaTomlPath, 'utf8')) as BallerinaTomlValues;
        return { kind: toml?.workspace ? 'workspace' : 'package', toml };
    } catch {
        // Unparseable toml — treat as an occupied package so we never create on top of it.
        return { kind: 'package', toml: {} };
    }
}

function classifyBallerinaProject(dir: string): 'workspace' | 'package' | null {
    return readBallerinaProject(dir)?.kind ?? null;
}

/** Trimmed `[workspace].title`, or undefined when absent/blank. */
function workspaceTitle(toml: BallerinaTomlValues): string | undefined {
    return toml?.workspace?.title?.trim() || undefined;
}

export interface EnclosingProjectStatus {
    /**
     * 'none' = standalone; 'member' = listed in an ancestor workspace's `packages`;
     * 'orphaned' = inside an ancestor workspace but not listed; 'invalid' = nested
     * inside another package (an already-broken layout).
     */
    status: 'none' | 'member' | 'orphaned' | 'invalid';
    projectPath?: string;
    projectName?: string;
}

/**
 * Classifies a standalone package against the nearest ancestor `Ballerina.toml`.
 * Integrations can sit at any depth inside a project, so every ancestor is checked,
 * not just the immediate parent.
 */
export function getEnclosingProjectStatus(packagePath: string): EnclosingProjectStatus {
    let dir = path.dirname(packagePath);
    let parent = path.dirname(dir);

    while (true) {
        const project = readBallerinaProject(dir);
        if (project?.kind === 'workspace') {
            // An unreadable workspace toml yields no packages — membership can't be
            // confirmed, so the package is reported as orphaned.
            const packages = project.toml.workspace?.packages ?? [];
            const relativeToProject = path.normalize(path.relative(dir, packagePath));
            const isMember = packages.some((pkg) => path.normalize(pkg) === relativeToProject);
            return {
                status: isMember ? 'member' : 'orphaned',
                projectPath: dir,
                projectName: workspaceTitle(project.toml) ?? path.basename(dir),
            };
        }
        if (project?.kind === 'package') {
            return { status: 'invalid', projectPath: dir };
        }
        if (dir === parent) {
            return { status: 'none' };
        }
        dir = parent;
        parent = path.dirname(dir);
    }
}

/** Registers an orphaned package dir into its enclosing project's workspace toml (no files moved). */
export function adoptOrphanedPackageIntoProject(packagePath: string, projectPath: string): void {
    const relativeToProject = path.normalize(path.relative(projectPath, packagePath));
    addToWorkspaceToml(projectPath, relativeToProject);
}

/** Whether `dir` is a Ballerina workspace, plus its `[workspace].title` (falling back to the folder name). */
export function getExistingProjectInfo(dir: string): { isProject: boolean; name?: string; path: string } {
    const project = dir ? readBallerinaProject(dir) : null;
    if (project?.kind !== 'workspace') {
        return { isProject: false, path: dir };
    }
    return { isProject: true, name: workspaceTitle(project.toml) ?? path.basename(dir), path: dir };
}

/**
 * Folder names and package titles already used inside a project, so a default name
 * AND folder can avoid both. Empty for a project directory that does not exist yet.
 */
export async function getProjectComponentNames(projectPath: string): Promise<{ folders: string[]; titles: string[] }> {
    const folders = new Set<string>();
    const titles: string[] = [];
    if (!projectPath) {
        return { folders: [], titles };
    }

    try {
        for (const entry of await fs.promises.readdir(projectPath, { withFileTypes: true })) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                folders.add(entry.name);
            }
        }
    } catch {
        // Project directory doesn't exist yet — nothing taken.
    }

    const project = readBallerinaProject(projectPath);
    if (project?.kind === 'workspace') {
        // An unreadable workspace toml falls back to the on-disk folders gathered above.
        for (const pkg of project.toml.workspace?.packages ?? []) {
            folders.add(path.basename(path.normalize(pkg)));
        }
        const packageTitles = await Promise.all(
            Array.from(folders, async (folder) => {
                try {
                    const raw = await fs.promises.readFile(path.join(projectPath, folder, 'Ballerina.toml'), 'utf8');
                    return (parse(raw) as Partial<PackageTomlValues>)?.package?.title?.trim() || undefined;
                } catch {
                    return undefined;
                }
            })
        );
        titles.push(...packageTitles.filter((title): title is string => !!title));
    }

    return { folders: Array.from(folders), titles };
}

export function validateProjectPath(
    projectPath: string,
    projectName: string,
    createDirectory: boolean,
    createAsWorkspace?: boolean,
    directoryName?: string,
    allowExistingDirectory?: boolean
): { isValid: boolean; errorMessage?: string; errorField?: ValidateProjectFormErrorField; existingWorkspace?: boolean } {
    try {
        // Check if projectPath is provided and not empty
        if (!projectPath || projectPath.trim() === '') {
            return { isValid: false, errorMessage: 'Project path is required', errorField: ValidateProjectFormErrorField.PATH };
        }

        // For workspace projects, validate workspace name specifically
        if (createAsWorkspace && createDirectory && (!projectName || projectName.trim() === '')) {
            return { isValid: false, errorMessage: 'Project name is required', errorField: ValidateProjectFormErrorField.NAME };
        }

        // Check if the base directory exists
        if (!fs.existsSync(projectPath)) {
            // Check if parent directory exists and we can create the path
            const parentDir = path.dirname(projectPath);
            if (!fs.existsSync(parentDir)) {
                return { isValid: false, errorMessage: 'Directory path does not exist', errorField: ValidateProjectFormErrorField.PATH };
            }
        }

        // An explicit directoryName wins; otherwise derive the folder from the project name (legacy).
        const folderSegment = directoryName ?? sanitizeName(projectName);
        if (createDirectory && !isSafePathSegment(folderSegment)) {
            return { isValid: false, errorMessage: 'Invalid directory name', errorField: ValidateProjectFormErrorField.PATH };
        }
        const finalPath = createDirectory ? path.join(projectPath, folderSegment) : projectPath;

        // If not creating a new directory, check if the target directory already has a Ballerina project
        if (!createDirectory) {
            const ballerinaTomlPath = path.join(finalPath, 'Ballerina.toml');
            if (fs.existsSync(ballerinaTomlPath)) {
                return { isValid: false, errorMessage: 'Existing Ballerina project detected in the selected directory', errorField: ValidateProjectFormErrorField.PATH };
            }
        } else if (fs.existsSync(finalPath)) {
            // Target exists — the outcome depends on what kind of Ballerina project (if any) is already there.
            if (allowExistingDirectory) {
                const finalPathKind = classifyBallerinaProject(finalPath);
                if (createAsWorkspace) {
                    // A new project can never sit on top of an existing project or package.
                    if (finalPathKind === 'workspace') {
                        return { isValid: false, errorMessage: 'An Integrator project already exists in the selected directory', errorField: ValidateProjectFormErrorField.PATH };
                    }
                    if (finalPathKind === 'package') {
                        return { isValid: false, errorMessage: 'An integration or library already exists in the selected directory', errorField: ValidateProjectFormErrorField.PATH };
                    }
                } else {
                    // Adding INTO an existing workspace is allowed; on top of a package is not.
                    if (finalPathKind === 'workspace') {
                        return { isValid: true, existingWorkspace: true };
                    }
                    if (finalPathKind === 'package') {
                        return { isValid: false, errorMessage: 'An integration or library already exists in the selected directory', errorField: ValidateProjectFormErrorField.PATH };
                    }
                }
                // Not a Ballerina project — fall through to the parent-workspace and write checks.
            } else {
                return { isValid: false, errorMessage: `A directory with this name already exists at the selected location`, errorField: ValidateProjectFormErrorField.PATH};
            }
        }

        // "Browsed into an existing project": the parent is the workspace root and the
        // package folder doesn't exist yet.
        if (allowExistingDirectory && !createAsWorkspace && classifyBallerinaProject(projectPath) === 'workspace') {
            return { isValid: true, existingWorkspace: true };
        }

        // Check write permission on the nearest EXISTING ancestor: `projectPath` may not
        // exist yet (a new project folder and a package inside it are created in one go).
        let writeCheckDir = projectPath;
        while (writeCheckDir && !fs.existsSync(writeCheckDir)) {
            const parent = path.dirname(writeCheckDir);
            if (parent === writeCheckDir) {
                break;
            }
            writeCheckDir = parent;
        }
        try {
            fs.accessSync(writeCheckDir, fs.constants.W_OK);
        } catch (error) {
            return { isValid: false, errorMessage: 'No write permission for the selected directory', errorField: ValidateProjectFormErrorField.PATH };
        }

        return { isValid: true };
    } catch (error) {
        return { isValid: false, errorMessage: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`, errorField: ValidateProjectFormErrorField.PATH };
    }
}

/**
 * Generic function to resolve directory paths and create directories if needed
 * Can be used for both project and workspace directory creation
 * @param basePath - Base directory path
 * @param directoryName - Name of the directory to create (optional)
 * @param shouldCreateDirectory - Whether to create a new directory
 * @returns The resolved directory path
 */
function resolveDirectoryPath(basePath: string, directoryName?: string, shouldCreateDirectory: boolean = true): string {
    const resolvedPath = directoryName
        ? path.join(basePath, directoryName)
        : basePath;

    if (shouldCreateDirectory && !fs.existsSync(resolvedPath)) {
        fs.mkdirSync(resolvedPath, { recursive: true });
    }

    return resolvedPath;
}

/**
 * Creates .vscode folder and settings.json file
 * @param projectRoot - Root directory of the project
 */
function createVSCodeSettings(projectRoot: string): void {
    const vscodeDir = path.join(projectRoot, '.vscode');
    if (!fs.existsSync(vscodeDir)) {
    
        fs.mkdirSync(vscodeDir, { recursive: true });
    }

    const settingsPath = path.join(vscodeDir, 'settings.json');
    fs.writeFileSync(settingsPath, settingsJsonContent);
}

/**
 * Creates .vscode folder with both settings.json and launch.json files
 * @param projectRoot - Root directory of the project
 */
function createVSCodeSettingsWithLaunch(projectRoot: string): void {
    createVSCodeSettings(projectRoot);

    const vscodeDir = path.join(projectRoot, '.vscode');
    const launchPath = path.join(vscodeDir, 'launch.json');
    fs.writeFileSync(launchPath, launchJsonContent.trim());
}

/**
 * Resolves the project root path and creates the directory if needed
 * @param projectPath - Base project path
 * @param sanitizedPackageName - Sanitized package name for directory creation
 * @param createDirectory - Whether to create a new directory
 * @returns The resolved project root path
 */
function resolveProjectPath(projectPath: string, sanitizedPackageName: string, createDirectory: boolean): string {
    return resolveDirectoryPath(
        projectPath,
        createDirectory ? sanitizedPackageName : undefined,
        createDirectory
    );
}

/**
 * Resolves the workspace root path and creates the directory
 * @param basePath - Base path where workspace should be created
 * @param workspaceName - Name of the workspace directory
 * @returns The resolved workspace root path
 */
function resolveWorkspacePath(basePath: string, workspaceName: string): string {
    return resolveDirectoryPath(basePath, workspaceName, true);
}

/**
 * Extracts the Ballerina version number from the ballerinaVersion string
 * @returns The version number (e.g., "2201.13.0") or undefined if not available
 */
function getBallerinaDistribution(): string | undefined {
    try {
        const ballerinaVersion = extension.ballerinaExtInstance?.ballerinaVersion;
        if (!ballerinaVersion) {
            return undefined;
        }
        
        // Extract version number from strings like "Ballerina 2201.13.0" or "2201.13.0"
        // Match pattern: <numbers>.<numbers>.<numbers>
        const versionMatch = ballerinaVersion.match(/(\d+\.\d+\.\d+)/);
        return versionMatch ? versionMatch[1] : undefined;
    } catch (error) {
        debug(`Failed to extract Ballerina distribution version: ${error}`);
        return undefined;
    }
}

/**
 * Orchestrates the setup of project information
 * @param projectRequest - The project request containing all necessary information
 * @returns Processed project information ready for use
 */
function setupProjectInfo(projectRequest: ProjectRequest): ProcessedProjectInfo {
    const sanitizedPackageName = sanitizeName(projectRequest.packageName);
    // The folder the project is created in. When the caller provides an explicit
    // directory name (the editable last path segment), it is used verbatim so the
    // directory can differ from the Ballerina package name; otherwise the folder
    // is derived from the package name (legacy behaviour).
    const folderName = projectRequest.directoryName ?? sanitizedPackageName;
    if (projectRequest.createDirectory) {
        assertSafePathSegment(folderName);
    }
    const projectRoot = resolveProjectPath(
        projectRequest.projectPath,
        folderName,
        projectRequest.createDirectory
    );
    const finalOrgName = projectRequest.orgName || getUsername();
    const finalVersion = projectRequest.version || "0.1.0";

    return {
        sanitizedPackageName,
        projectRoot,
        finalOrgName,
        finalVersion,
        packageName: projectRequest.packageName,
        integrationName: projectRequest.projectName,
        orgHandle: projectRequest.orgHandle
    };
}

/**
 * Writes a local context file for the given project.
 * Creates (if missing) `{projectRoot}/.wso2/context.yaml` and stores the org/project handles with `local: true`.
 * @param projectRoot - Absolute path to the project root directory
 * @param orgHandle - Choreo organization handle
 * @param projectHandle - Choreo project handle
 */
export async function writeLocalContextYaml(
    projectRoot: string,
    orgHandle: string,
    projectHandle: string
): Promise<void> {
    try {
        const choreoDir = path.join(projectRoot, '.wso2');
        const localProjectFile = path.join(choreoDir, 'context.yaml');
        const content = stringifyYaml([{ org: orgHandle, project: projectHandle, local: true }]);
        await fs.promises.mkdir(choreoDir, { recursive: true });
        await fs.promises.writeFile(localProjectFile, content, { encoding: 'utf8' });
    } catch (error) {
        console.warn("Failed to write context.yaml (non-critical):", error);
    }
}

export async function createEmptyBIWorkspace(projectRequest: ProjectRequest): Promise<string> {
    const ballerinaTomlContent = `
[workspace]
title = "${projectRequest.workspaceName}"
packages = []

`;

    // directoryName (when given) decides the folder; else fall back to handle/name.
    const workspaceRoot = resolveWorkspacePath(
        projectRequest.projectPath,
        projectRequest.directoryName ?? projectRequest?.projectHandle ?? projectRequest.workspaceName
    );

    // Create Ballerina.toml file
    const ballerinaTomlPath = path.join(workspaceRoot, 'Ballerina.toml');
    writeBallerinaFileDidOpen(ballerinaTomlPath, ballerinaTomlContent);

    // create settings.json file
    createVSCodeSettings(workspaceRoot);

    console.log(`Project(default profile) created successfully at ${workspaceRoot}`);
    return workspaceRoot;
}

export async function createBIWorkspaceWithProject(projectRequest: ProjectRequest): Promise<string> {
    const ballerinaTomlContent = `
[workspace]
title = "${projectRequest.workspaceName}"
packages = ["${sanitizeName(projectRequest.packageName)}"]

`;

    // directoryName (when given) decides the folder; else fall back to handle/name.
    const workspaceRoot = resolveWorkspacePath(
        projectRequest.projectPath,
        projectRequest.directoryName ?? projectRequest?.projectHandle ?? projectRequest.workspaceName
    );

    // Create Ballerina.toml file
    const ballerinaTomlPath = path.join(workspaceRoot, 'Ballerina.toml');
    writeBallerinaFileDidOpen(ballerinaTomlPath, ballerinaTomlContent);

    // The workspace folder is already the target root — drop directoryName so the
    // package gets its own folder derived from the package name.
    await createBIProjectPure({ ...projectRequest, projectPath: workspaceRoot, directoryName: undefined, createDirectory: true });

    // create settings.json file
    createVSCodeSettings(workspaceRoot);

    console.log(`Project(default profile) with integration created successfully at ${workspaceRoot}`);
    return workspaceRoot;
}

export async function createBIProjectPure(projectRequest: ProjectRequest): Promise<string> {
    const projectInfo = setupProjectInfo(projectRequest);
    const {
        projectRoot,
        finalOrgName,
        finalVersion,
        packageName,
        integrationName,
        orgHandle
    } = projectInfo;

    const EMPTY = "\n";

    // Get the Ballerina distribution version
    const distribution = getBallerinaDistribution();
    
    // Build the distribution line if version is available
    const distributionLine = distribution ? `distribution = "${distribution}"\n` : '';

    const ballerinaTomlContent = `
[package]
org = "${orgHandle ?? finalOrgName}"
name = "${packageName}"
version = "${finalVersion}"
${distributionLine}title = "${integrationName}"

[build-options]
sticky = true

`;

    if (projectRequest.isLibrary) {
        const libraryBal = path.join(projectRoot, 'lib.bal');
        const libraryBalContent = `import ${VALIDATOR_PACKAGE_NAME} as _;`;
        writeBallerinaFileDidOpen(libraryBal, libraryBalContent);
        try {
            await runBackgroundTerminalCommand(`bal pull ${VALIDATOR_PACKAGE_NAME}`);
        } catch (error) {
            console.error('Failed to pull library validator package:', error);
        }
    }

    // Create Ballerina.toml file
    const ballerinaTomlPath = path.join(projectRoot, 'Ballerina.toml');
    writeBallerinaFileDidOpen(ballerinaTomlPath, ballerinaTomlContent);

    // Create connections.bal file
    const connectionsBalPath = path.join(projectRoot, 'connections.bal');
    writeBallerinaFileDidOpen(connectionsBalPath, EMPTY);

    // Create config.bal file
    const configurationsBalPath = path.join(projectRoot, 'config.bal');
    writeBallerinaFileDidOpen(configurationsBalPath, EMPTY);

    // Create types.bal file
    const typesBalPath = path.join(projectRoot, 'types.bal');
    writeBallerinaFileDidOpen(typesBalPath, EMPTY);

    // Create agents.bal file
    const agentsBal = path.join(projectRoot, 'agents.bal');
    writeBallerinaFileDidOpen(agentsBal, EMPTY);

    // Create functions.bal file
    const functionsBal = path.join(projectRoot, 'functions.bal');
    writeBallerinaFileDidOpen(functionsBal, EMPTY);

    // Create datamappings.bal file
    const datamappingsBalPath = path.join(projectRoot, 'data_mappings.bal');
    writeBallerinaFileDidOpen(datamappingsBalPath, EMPTY);

    if (!projectRequest.isLibrary) {
        // Create main.bal file
        const mainBal = path.join(projectRoot, 'main.bal');
        writeBallerinaFileDidOpen(mainBal, EMPTY);

        // Create automation.bal file
        const automationBal = path.join(projectRoot, 'automation.bal');
        writeBallerinaFileDidOpen(automationBal, EMPTY);
    }

    // Create .vscode configuration files
    createVSCodeSettingsWithLaunch(projectRoot);

    // Create .gitignore file
    const gitignorePath = path.join(projectRoot, '.gitignore');
    fs.writeFileSync(gitignorePath, gitignoreContent.trim());

    console.log(`Integration(default profile) created successfully at ${projectRoot}`);
    return projectRoot;
}

export async function convertProjectToWorkspace(params: AddProjectToWorkspaceRequest) {
    const currentProjectPath = StateMachine.context().projectPath;
    const tomlValues = await getProjectTomlValues(currentProjectPath);
    const currentPackageName = tomlValues?.package?.name;
    if (!currentPackageName) {
        throw new Error('No package name found in Ballerina.toml');
    }

    // Destination = params.path (default: the integration's parent) + the editable directory name.
    const baseDir = params.path?.trim() ? params.path : path.dirname(currentProjectPath);
    const projectDirectoryName = params.directoryName?.trim() ? params.directoryName : (params.projectHandle ?? params.workspaceName);
    const newDirectory = path.join(baseDir, projectDirectoryName);

    // The current integration is moved into the new project directory, so the
    // destination cannot be the integration itself or a directory inside it.
    if (isPathInside(currentProjectPath, newDirectory)) {
        throw new Error('The project location cannot be inside the integration being converted. Please choose a different location.');
    }

    // Never nest a new project inside an existing Ballerina project. Checking
    // `newDirectory`'s own parent chain also catches a destination pointed AT an
    // ancestor of the current integration. Safety net behind the UI, which routes
    // this case to "Open Project"/"Add to Project".
    const enclosing = getEnclosingProjectStatus(newDirectory);
    if (enclosing.status !== 'none') {
        throw new Error(`The selected location is already inside an existing Ballerina project (${enclosing.projectPath}). Choose a location outside that project, or open/add to it instead of converting.`);
    }

    try {
        fs.mkdirSync(newDirectory);
    } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'EEXIST') {
            throw new Error(`A directory named "${projectDirectoryName}" already exists at the selected location`);
        }
        throw err;
    }

    const updatedProjectPath = path.join(newDirectory, path.basename(currentProjectPath));
    fs.renameSync(currentProjectPath, updatedProjectPath);

    const existingProjectDirName = path.basename(currentProjectPath);
    createWorkspaceToml(newDirectory, params.workspaceName, existingProjectDirName);

    if (params.addNewAfterConvert) {
        // Resolved after the move + createWorkspaceToml, so it can't collide with the
        // package just moved in.
        const packageFolder = resolvePackageFolderInWorkspace(newDirectory, params);
        addToWorkspaceToml(newDirectory, packageFolder);
        await createProjectInWorkspace(params, newDirectory, packageFolder);
    }

    // create settings.json file
    createVSCodeSettings(newDirectory);
    // write local context file
    await writeLocalContextYaml(newDirectory, params.orgHandle, params.projectHandle);

    openInVSCode(newDirectory);
}

/** Adds a package to the project already open in this window; returns the new package's root. */
export async function addProjectToExistingWorkspace(params: AddProjectToWorkspaceRequest): Promise<string> {
    const workspacePath = StateMachine.context().workspacePath;
    const packageFolder = resolvePackageFolderInWorkspace(workspacePath, params);
    addToWorkspaceToml(workspacePath, packageFolder);

    return createProjectInWorkspace(params, workspacePath, packageFolder);
}

function createWorkspaceToml(workspacePath: string, projectTitle: string, packageName: string) {
    const ballerinaTomlContent = `
[workspace]
title = "${projectTitle}"
packages = ["${packageName}"]
`;
    const ballerinaTomlPath = path.join(workspacePath, 'Ballerina.toml');
    writeBallerinaFileDidOpen(ballerinaTomlPath, ballerinaTomlContent);
}

function addToWorkspaceToml(workspacePath: string, packageName: string) {
    const ballerinaTomlPath = path.join(workspacePath, 'Ballerina.toml');

    if (!fs.existsSync(ballerinaTomlPath)) {
        return;
    }

    try {
        const ballerinaTomlContent = fs.readFileSync(ballerinaTomlPath, 'utf8');
        const tomlData = parse(ballerinaTomlContent) as Partial<WorkspaceTomlValues>;
        const existingPackages: string[] = tomlData?.workspace?.packages ?? [];

        if (existingPackages.includes(packageName)) {
            return; // Package already exists
        }

        const updatedContent = addPackageToToml(ballerinaTomlContent, packageName);
        fs.writeFileSync(ballerinaTomlPath, updatedContent);
    } catch (error) {
        console.error('Failed to update project Ballerina.toml:', error);
    }
}

/**
 * Collision-free package folder name inside a workspace (checks disk and the workspace
 * toml), falling back to `base`. Callers holding the parsed toml should pass its `packages`.
 */
function resolveAvailablePackageFolder(workspaceRoot: string, base: string, existingPackages?: string[]): string {
    assertSafePathSegment(base);
    const MAX_ATTEMPTS = 50;
    const packages = existingPackages ?? readBallerinaProject(workspaceRoot)?.toml.workspace?.packages ?? [];
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const candidate = attempt === 0 ? base : `${base}_${attempt + 1}`;
        const taken = fs.existsSync(path.join(workspaceRoot, candidate))
            || packages.some((p) => path.normalize(p) === candidate);
        if (!taken) {
            return candidate;
        }
    }
    throw new Error(`Could not find an available folder name for "${base}" in "${workspaceRoot}" after ${MAX_ATTEMPTS} attempts`);
}

/** Workspace root + collision-free package folder for a component-creation request; null when not inside a workspace. */
function resolveExistingWorkspaceTarget(projectRequest: ProjectRequest): { workspaceRoot: string; packageFolder: string } | null {
    const sanitizedPackageName = sanitizeName(projectRequest.packageName);
    const folderName = projectRequest.directoryName?.trim() || sanitizedPackageName;
    assertSafePathSegment(folderName);
    const finalPath = path.join(projectRequest.projectPath, folderName);

    // Case (a): the chosen path itself is a workspace root — the user pointed at
    // the project. Add a new, auto-named package folder inside it.
    const target = readBallerinaProject(finalPath);
    if (target?.kind === 'workspace') {
        return {
            workspaceRoot: finalPath,
            packageFolder: resolveAvailablePackageFolder(finalPath, sanitizedPackageName, target.toml.workspace?.packages ?? []),
        };
    }

    // Case (b): the parent directory is a workspace root — the user browsed into
    // the project, leaving the new package folder as the last path segment.
    const parent = readBallerinaProject(projectRequest.projectPath);
    if (parent?.kind === 'workspace') {
        return {
            workspaceRoot: projectRequest.projectPath,
            packageFolder: resolveAvailablePackageFolder(projectRequest.projectPath, folderName, parent.toml.workspace?.packages ?? []),
        };
    }

    return null;
}

/** Scaffolds a package inside `workspaceRoot` and registers it in the workspace toml. */
async function addComponentToExistingWorkspace(
    workspaceRoot: string,
    packageFolder: string,
    projectRequest: ProjectRequest
): Promise<{ packageRoot: string; workspaceRoot: string }> {
    const request: ProjectRequest = {
        ...projectRequest,
        projectPath: workspaceRoot,
        directoryName: packageFolder,
        createDirectory: true,
    };
    const packageRoot = await createBIProjectPure(request);
    addToWorkspaceToml(workspaceRoot, packageFolder);
    return { packageRoot, workspaceRoot };
}

/**
 * Converts the open standalone integration into a new workspace at
 * `projectRequest.projectPath` and creates the requested package inside it.
 * Returns the new package root and the workspace root.
 */
async function convertAndAddComponent(projectRequest: ProjectRequest): Promise<{ packageRoot: string; openRoot: string }> {
    const currentProjectPath = StateMachine.context().projectPath;
    if (!currentProjectPath) {
        throw new Error('No integration is open to convert into a project.');
    }

    const workspaceRoot = projectRequest.projectPath;

    // The current integration is moved into the new project directory, so the
    // destination cannot be the integration itself or a directory inside it.
    if (isPathInside(currentProjectPath, workspaceRoot)) {
        throw new Error('The project location cannot be inside the integration being converted. Please choose a different location.');
    }

    // Never clobber an existing project: converting always creates a fresh workspace.
    const existing = classifyBallerinaProject(workspaceRoot);
    if (existing === 'workspace' || existing === 'package') {
        throw new Error('A project already exists at the selected location');
    }

    fs.mkdirSync(workspaceRoot, { recursive: true });
    const existingProjectDirName = path.basename(currentProjectPath);
    const movedProjectPath = path.join(workspaceRoot, existingProjectDirName);
    fs.renameSync(currentProjectPath, movedProjectPath);

    createWorkspaceToml(workspaceRoot, projectRequest.workspaceName ?? path.basename(workspaceRoot), existingProjectDirName);
    createVSCodeSettings(workspaceRoot);

    const base = projectRequest.directoryName?.trim() || sanitizeName(projectRequest.packageName);
    const packageFolder = resolveAvailablePackageFolder(workspaceRoot, base);
    const { packageRoot } = await addComponentToExistingWorkspace(workspaceRoot, packageFolder, projectRequest);

    return { packageRoot, openRoot: workspaceRoot };
}

/**
 * Scaffolds a fresh workspace at `projectRequest.projectPath` and creates the package
 * inside it. Returns the package root and the workspace root.
 */
async function createComponentInNewWorkspace(projectRequest: ProjectRequest): Promise<{ packageRoot: string; openRoot: string }> {
    const workspaceRoot = projectRequest.projectPath;

    // Never clobber an existing project: add into a workspace already at the target;
    // a package there is an error.
    const existing = classifyBallerinaProject(workspaceRoot);
    if (existing === 'package') {
        throw new Error('An integration or library already exists at the selected location');
    }
    if (existing !== 'workspace') {
        // For a brand-new project neither the folder nor its parents exist yet.
        fs.mkdirSync(workspaceRoot, { recursive: true });
        const workspaceTomlContent = `
[workspace]
title = "${projectRequest.workspaceName ?? path.basename(workspaceRoot)}"
packages = []

`;
        writeBallerinaFileDidOpen(path.join(workspaceRoot, 'Ballerina.toml'), workspaceTomlContent);
        createVSCodeSettings(workspaceRoot);
    }

    const base = projectRequest.directoryName?.trim() || sanitizeName(projectRequest.packageName);
    const packageFolder = resolveAvailablePackageFolder(workspaceRoot, base);
    const { packageRoot } = await addComponentToExistingWorkspace(workspaceRoot, packageFolder, projectRequest);
    return { packageRoot, openRoot: workspaceRoot };
}

/**
 * Creates an integration/library package: as a fresh workspace (`newProject`), inside
 * an existing workspace, or standalone. Returns the package root and the folder to open.
 */
export async function createBIComponent(projectRequest: ProjectRequest): Promise<{ packageRoot: string; openRoot: string }> {
    if (projectRequest.convertToWorkspace) {
        return convertAndAddComponent(projectRequest);
    }
    if (projectRequest.newProject) {
        return createComponentInNewWorkspace(projectRequest);
    }
    const workspaceTarget = resolveExistingWorkspaceTarget(projectRequest);
    if (workspaceTarget) {
        const { packageRoot, workspaceRoot } = await addComponentToExistingWorkspace(
            workspaceTarget.workspaceRoot,
            workspaceTarget.packageFolder,
            projectRequest
        );
        return { packageRoot, openRoot: workspaceRoot };
    }
    const packageRoot = await createBIProjectPure(projectRequest);
    return { packageRoot, openRoot: packageRoot };
}

/**
 * Naming and landing for a create, resolved once at submit time (the only point that knows
 * whether the project was created by this same submit) and carried across the reload.
 */
export interface CreateLandingContext {
    /** Display name of the project the package went into; undefined for a standalone package. */
    projectName?: string;
    /** Whether this submit created the project too. */
    isNewProject: boolean;
    /**
     * A brand-new project lands on the project overview — the project is what the user just
     * made. Adding into a project that already existed lands on the new package instead.
     */
    landing: PendingIntegrationLanding;
}

export function resolveCreateLandingContext(
    packageRoot: string,
    openRoot: string,
    request: Pick<ProjectRequest, 'newProject' | 'convertToWorkspace' | 'workspaceName'>,
    /** Lands on the package even for a new project — the Copilot prompt bar is only there. */
    preferPackageLanding = false
): CreateLandingContext {
    // The folder to open being the package itself means no project was involved.
    if (isSamePath(packageRoot, openRoot)) {
        return { isNewProject: false, landing: "package" };
    }
    const isNewProject = !!request.newProject || !!request.convertToWorkspace;
    return {
        // The form's project name is authoritative for a new project; for an existing one
        // read the title it was actually created with.
        projectName: request.workspaceName?.trim() || getExistingProjectInfo(openRoot).name || path.basename(openRoot),
        isNewProject,
        landing: isNewProject && !preferPackageLanding ? "project" : "package",
    };
}

/**
 * Refreshes project info and waits for the rebuilt structure to land in context, unlike
 * plain `StateMachine.refreshProjectInfo` (fire-and-forget). Call this BEFORE navigating to
 * a just-created package's own overview: that view fetches `getProjectStructure()` on mount
 * and shows a bare spinner until it finds its own package in the list, so navigating first
 * (with the refresh still in flight) is what makes that spinner visible instead of the page.
 */
export async function refreshProjectInfoAndWait(): Promise<boolean> {
    const ctx = StateMachine.context();
    const projectPath = ctx.workspacePath || ctx.projectPath;
    if (!projectPath || !ctx.langClient) {
        return false;
    }
    try {
        const projectInfo = await ctx.langClient.getProjectInfo({ projectPath });
        await StateMachine.updateProjectInfoAndRebuild(projectInfo);
        return true;
    } catch (error) {
        console.error("[IntegrationWizard] Failed to refresh project info before navigating:", error);
        return false;
    }
}

export function deleteProjectFromWorkspace(workspacePath: string, packagePath: string) {
    const relativeProjectPath = path.relative(workspacePath, packagePath);
    console.log(">>> relative project path", relativeProjectPath);

    const ballerinaTomlPath = path.join(workspacePath, 'Ballerina.toml');
    if (!fs.existsSync(ballerinaTomlPath)) {
        return;
    }
    
    try {
        const ballerinaTomlContent = fs.readFileSync(ballerinaTomlPath, 'utf8');
        const tomlData = parse(ballerinaTomlContent) as Partial<WorkspaceTomlValues>;
        const existingPackages: string[] = tomlData?.workspace?.packages ?? [];

        const matchedEntry = existingPackages.find(p => path.normalize(p) === relativeProjectPath);
        if (!matchedEntry) {
            return; // Package not found
        }

        const updatedContent = removePackageFromToml(ballerinaTomlContent, matchedEntry);
        fs.writeFileSync(ballerinaTomlPath, updatedContent);

        // send didChange event to the language server
        StateMachine.langClient().didChange({
            contentChanges: [
                {
                    text: updatedContent
                }
            ],
            textDocument: {
                uri: Uri.file(ballerinaTomlPath).toString(),
                version: 1
            }
        });

        // delete the project directory
        fs.rmdirSync(packagePath, { recursive: true });
    } catch (error) {
        console.error(">>> error deleting integration from project", error);
    }
}

function addPackageToToml(tomlContent: string, packageName: string): string {
    const packagesRegex = /packages\s*=\s*\[([\s\S]*?)\]/;
    const match = tomlContent.match(packagesRegex);

    if (match) {
        const currentArrayContent = match[1].trim();
        const newArrayContent = currentArrayContent === ''
            ? `"${packageName}"`
            : `${currentArrayContent}, "${packageName}"`;

        return tomlContent.replace(packagesRegex, `packages = [${newArrayContent}]`);
    } else {
        return tomlContent + `\npackages = ["${packageName}"]\n`;
    }
}

function removePackageFromToml(tomlContent: string, packagePath: string): string {
    const packagesRegex = /packages\s*=\s*\[([\s\S]*?)\]/;
    const match = tomlContent.match(packagesRegex);

    if (match) {
        const currentArrayContent = match[1].trim();
        
        // Split by comma, trim whitespace, and filter out the package to remove
        const packages = currentArrayContent
            .split(',')
            .map(pkg => pkg.trim())
            .filter(pkg => pkg && pkg !== `"${packagePath}"`);
        
        const newArrayContent = packages.length > 0 ? packages.join(', ') : '';
        return tomlContent.replace(packagesRegex, `packages = [${newArrayContent}]`);
    } else {
        return tomlContent;
    }
}

/**
 * Scaffolds the new package inside `workspacePath`. `packageFolder` is resolved by the
 * caller and is deliberately independent of the Ballerina package name.
 */
async function createProjectInWorkspace(
    params: AddProjectToWorkspaceRequest,
    workspacePath: string,
    packageFolder: string
): Promise<string> {
    const projectRequest: ProjectRequest = {
        projectName: params.projectName,
        packageName: params.packageName,
        projectPath: workspacePath,
        directoryName: packageFolder,
        createDirectory: true,
        orgName: params.orgName,
        orgHandle: params.orgHandle,
        version: params.version,
        isLibrary: params.isLibrary,
        projectHandle: params.projectHandle
    };

    return await createBIProjectPure(projectRequest);
}

/**
 * Folder for the new package inside `workspaceRoot`: `packageDirectoryName` or the
 * sanitized package name, always indexed to a free name — the scaffold's `mkdir -p`
 * would otherwise write over an existing package. Last line of defence behind the UI.
 */
function resolvePackageFolderInWorkspace(workspaceRoot: string, params: AddProjectToWorkspaceRequest): string {
    const base = params.packageDirectoryName?.trim() || sanitizeName(params.packageName);
    return resolveAvailablePackageFolder(workspaceRoot, base);
}

/** Whether `projectRoot` is already an open workspace folder — callers can then refresh in place instead of reloading. */
export function isAlreadyOpenFolder(projectRoot: string): boolean {
    const resolvedRoot = path.resolve(projectRoot);
    return (workspace.workspaceFolders ?? []).some(
        (folder) => path.resolve(folder.uri.fsPath) === resolvedRoot
    );
}

export function openInVSCode(projectRoot: string) {
    const resolvedRoot = path.resolve(projectRoot);

    // `vscode.openFolder` is a no-op when the target is already the open folder, so a
    // caller awaiting the reload would hang — reload explicitly instead. Callers adding
    // into an already-open workspace should prefer isAlreadyOpenFolder + an in-place refresh.
    if (isAlreadyOpenFolder(resolvedRoot)) {
        commands.executeCommand('workbench.action.reloadWindow');
        return;
    }

    commands.executeCommand('vscode.openFolder', Uri.file(resolvedRoot));
}

export async function createBIProjectFromMigration(params: MigrateRequest) {
    const projectInfo = setupProjectInfo(params.project);
    const { projectRoot, sanitizedPackageName } = projectInfo;

    const EMPTY = "\n";
    // Write files based on keys in params.textEdits
    for (const [fileName, fileContent] of Object.entries(params.textEdits)) {
        let content = fileContent;
        const filePath = path.join(projectRoot, fileName);

        if (fileName === "Ballerina.toml") {
            if (params.projects && params.projects.length > 0) {
                // Multi-project migration: this is a workspace-level Ballerina.toml ([workspace] section).
                // The packages list from the LS reflects the CLI's directory naming convention,
                // which may differ from the projectName values used to create actual directories.
                // Rebuild the packages list from the actual project names.
                const packageList = params.projects.map(p => `"${p.projectName}"`).join(', ');
                content = content.replace(/packages\s*=\s*\[[\s\S]*?\]/, `packages = [${packageList}]`);
            } else {
                // Single-project migration: this is a package-level Ballerina.toml ([package] section).
                content = content.replace(/name = ".*?"/, `name = "${sanitizedPackageName}"`);
                content = content.replace(/org = ".*?"/, `org = "${projectInfo.orgHandle ?? projectInfo.finalOrgName}"`);

                // Remove any existing distribution line
                content = content.replace(/^\s*distribution\s*=\s*".*?"\n?/m, '');

                // Get the Ballerina distribution version
                const distribution = getBallerinaDistribution();
                const distributionLine = distribution ? `\ndistribution = "${distribution}"` : '';

                content = content.replace(/version = ".*?"/, `version = "${projectInfo.finalVersion}"${distributionLine}\ntitle = "${projectInfo.integrationName}"`);
            }
        }

        writeBallerinaFileDidOpen(filePath, content || EMPTY);
    }

    params.projects?.forEach(project => {
        createProjectFiles(project, projectRoot);
    });

    // Create .vscode configuration files
    createVSCodeSettingsWithLaunch(projectRoot);

    // Create .gitignore file
    const gitignorePath = path.join(projectRoot, '.gitignore');
    fs.writeFileSync(gitignorePath, gitignoreContent.trim());

    debug(`BI project created successfully at ${projectRoot}`);

    const resolvedRoot = path.resolve(projectRoot);
    const aiEnabled = params.aiFeatureUsed ?? false;

    // Write the AI enhancement state file – acts as the source of truth for the
    // migration UI banner.  This is done for ALL values of aiFeatureUsed so
    // the card can offer a "Start Enhancement" button even when the user skipped.
    writeEnhanceToml(resolvedRoot, aiEnabled, false, params.sourcePath);

    if (aiEnabled) {
        // When AI enhancement is enabled, return the project root to the caller
        // so the wizard can run the enhancement pipeline before opening the folder.
        // The caller (RPC manager) will notify the webview with the project root
        // and kick off the agent; vscode.openFolder is deferred until the
        // enhancement completes or the user skips.
        return resolvedRoot;
    }

    // No AI enhancement – open the project immediately.
    scheduleMigrationEnhancement(aiEnabled, resolvedRoot, params.sourcePath);
    commands.executeCommand('vscode.openFolder', Uri.file(resolvedRoot));
    return resolvedRoot;
}

async function createProjectFiles(project: ProjectMigrationResult, projectRoot: string) {
    for (const [fileName, fileContent] of Object.entries(project.textEdits)) {
        const filePath = path.join(projectRoot, project.projectName, fileName);
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
        }
        writeBallerinaFileDidOpen(filePath, fileContent || "\n");
    }

    // Save migration report for this project
    if (project.report) {
        const reportPath = path.join(projectRoot, project.projectName, 'migration_report.html');
        fs.writeFileSync(reportPath, project.report);
    }
}

export async function createBIAutomation(params: ComponentRequest): Promise<CreateComponentResponse> {
    return new Promise(async (resolve) => {
        const functionFile = await handleAutomationCreation(params);
        const components = await StateMachine.langClient().getBallerinaProjectComponents({
            documentIdentifiers: [{ uri: URI.file(StateMachine.context().projectPath).toString() }]
        }) as BallerinaProjectComponents;
        const position: NodePosition = {};
        for (const pkg of components.packages) {
            for (const module of pkg.modules) {
                module.automations.forEach(func => {
                    position.startColumn = func.startColumn;
                    position.startLine = func.startLine;
                    position.endLine = func.endLine;
                    position.endColumn = func.endColumn;
                });
            }
        }
        openView(EVENT_TYPE.OPEN_VIEW, { documentUri: functionFile, position });
        history.clear();
        resolve({ response: true, error: "" });
    });
}

export async function createBIFunction(params: ComponentRequest): Promise<CreateComponentResponse> {
    return new Promise(async (resolve) => {
        const isExpressionBodied = params.functionType.isExpressionBodied;
        const projectPath = StateMachine.context().projectPath;
        // Hack to create trasformation function (Use LS API to create the function when available)
        const targetFile = path.join(projectPath, isExpressionBodied ? DATA_MAPPING_FILE : FUNCTIONS_FILE);
        if (!fs.existsSync(targetFile)) {
            writeBallerinaFileDidOpen(targetFile, '');
        }
        const response = await handleFunctionCreation(targetFile, params);
        await modifyFileContent({ filePath: targetFile, content: response.source });
        const modulePart: ModulePart = response.syntaxTree as ModulePart;
        let targetPosition: NodePosition = response.syntaxTree?.position;
        modulePart.members.forEach(member => {
            if (STKindChecker.isFunctionDefinition(member) && member.functionName.value === params.functionType.name.trim()) {
                targetPosition = member.position;
            }
        });
        openView(EVENT_TYPE.OPEN_VIEW, { documentUri: targetFile, position: targetPosition });
        history.clear();
        resolve({ response: true, error: "" });
    });
}

// <---------- Task Source Generation START-------->
export async function handleAutomationCreation(params: ComponentRequest) {
    let paramList = '';
    const paramLength = params.functionType?.parameters.length;
    if (paramLength > 0) {
        params.functionType.parameters.forEach((param, index) => {
            let paramValue = param.defaultValue ? `${param.type} ${param.name} = ${param.defaultValue}, ` : `${param.type} ${param.name}, `;
            if (paramLength === index + 1) {
                paramValue = param.defaultValue ? `${param.type} ${param.name} = ${param.defaultValue}` : `${param.type} ${param.name}`;
            }
            paramList += paramValue;
        });
    }
    let funcSignature = `public function main(${paramList}) returns error? {`;
    const balContent = `import ballerina/log;

${funcSignature}
    do {

    } on fail error e {
        log:printError("Error: ", 'error = e);
        return e;
    }
}
`;
    const projectPath = StateMachine.context().projectPath;
    // Create foo.bal file within services directory
    const taskFile = path.join(projectPath, `automation.bal`);
    writeBallerinaFileDidOpen(taskFile, balContent);
    console.log('Task Created.', `automation.bal`);
    return taskFile;
}
// <---------- Task Source Generation END-------->

// <---------- Function Source Generation START-------->
export async function handleFunctionCreation(targetFile: string, params: ComponentRequest): Promise<SyntaxTreeResponse> {
    const modifications: STModification[] = [];
    const { parameters, returnType, name, isExpressionBodied } = params.functionType;
    const parametersStr = parameters
        .map((item) => `${item.type} ${item.name} ${item.defaultValue ? `= ${item.defaultValue}` : ''}`)
        .join(",");

    const returnTypeStr = `returns ${!returnType ? 'error?' : isExpressionBodied ? `${returnType}` : `${returnType}|error?`}`;

    const expBody = `{
    do {

    } on fail error e {
        return e;
    }
}`;

    const document = await workspace.openTextDocument(Uri.file(targetFile));
    const lastPosition = document.lineAt(document.lineCount - 1).range.end;

    const targetPosition: NodePosition = {
        startLine: lastPosition.line,
        startColumn: 0,
        endLine: lastPosition.line,
        endColumn: 0
    };
    modifications.push(
        createFunctionSignature(
            "",
            name,
            parametersStr,
            returnTypeStr,
            targetPosition,
            false,
            params.functionType.isExpressionBodied,
            params.functionType.isExpressionBodied ? `{}` : expBody
        )
    );

    const res = await applyModifications(targetFile, modifications) as SyntaxTreeResponse;
    return res;
}
// <---------- Function Source Generation END-------->
// Test_Integration test_integration   Test Integration testIntegration -> testintegration
export function sanitizeName(name: string): string {
    return name.replace(/[^a-z0-9]_./gi, '_').toLowerCase(); // Replace invalid characters with underscores
}

/**
 * Whether `segment` is safe to `path.join` onto a trusted base directory as a single real
 * path segment — never empty, a separator (either platform's), a NUL byte, or a `.`/`..`
 * traversal component. Applied to both an explicit `directoryName` and any
 * project/package-name-derived fallback, since only the latter goes through
 * {@link sanitizeName} — an explicit `directoryName` is otherwise used verbatim.
 */
function isSafePathSegment(segment: string): boolean {
    const trimmed = segment?.trim() ?? '';
    if (trimmed === '' || trimmed === '.' || trimmed === '..') {
        return false;
    }
    return !/[\\/\0]/.test(trimmed);
}

/** Throws when `segment` is not {@link isSafePathSegment} — the creation-path guard for callers that can't return a validation result. */
function assertSafePathSegment(segment: string): void {
    if (!isSafePathSegment(segment)) {
        throw new Error(`Invalid directory name: "${segment}"`);
    }
}

export async function getSuggestedProjectDefaults(isInProject: boolean): Promise<SuggestedProjectDefaultsResponse> {
    const BASE_PROJECT_NAME = "Default";
    const BASE_INTEGRATION_NAME = "Untitled";

    if (!isInProject) {
        const currentProjectPath = StateMachine.context().projectPath;
        const parentDir = path.dirname(currentProjectPath);
        const tomlValues = await getProjectTomlValues(currentProjectPath);
        const currentPackageName = tomlValues?.package?.name ?? "";

        const baseHandle = BASE_PROJECT_NAME.toLowerCase();
        let projectName = BASE_PROJECT_NAME;
        let projectHandle = baseHandle;
        if (fs.existsSync(path.join(parentDir, baseHandle))) {
            for (let i = 2; ; i++) {
                projectHandle = `${baseHandle}-${i}`;
                if (!fs.existsSync(path.join(parentDir, projectHandle))) {
                    projectName = `${BASE_PROJECT_NAME} ${i}`;
                    break;
                }
            }
        }

        const basePackageName = BASE_INTEGRATION_NAME.toLowerCase();
        let integrationName = BASE_INTEGRATION_NAME;
        let packageName = basePackageName;
        if (packageName === currentPackageName) {
            for (let i = 2; ; i++) {
                packageName = `${basePackageName}_${i}`;
                if (packageName !== currentPackageName) {
                    integrationName = `${BASE_INTEGRATION_NAME} ${i}`;
                    break;
                }
            }
        }

        return { projectName, projectHandle, integrationName, packageName };
    } else {
        const workspacePath = StateMachine.context().workspacePath;
        const basePackageName = BASE_INTEGRATION_NAME.toLowerCase();
        if (!fs.existsSync(path.join(workspacePath, basePackageName))) {
            return { projectName: BASE_PROJECT_NAME, projectHandle: BASE_PROJECT_NAME.toLowerCase(), integrationName: BASE_INTEGRATION_NAME, packageName: basePackageName };
        }
        for (let i = 2; ; i++) {
            const packageName = `${basePackageName}_${i}`;
            if (!fs.existsSync(path.join(workspacePath, packageName))) {
                return { projectName: BASE_PROJECT_NAME, projectHandle: BASE_PROJECT_NAME.toLowerCase(), integrationName: `${BASE_INTEGRATION_NAME} ${i}`, packageName };
            }
        }
    }
}

const DEFAULT_CREATION_DIRNAME = "WSO2Integrator";

/** Default directory new projects are created under when no path is chosen. */
export function getDefaultCreationPath(): string {
    const dir = path.join(os.homedir(), DEFAULT_CREATION_DIRNAME);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

/** Scaffolds the project/workspace, then opens it. */
export async function createBIProject(params: any): Promise<void> {
    if (params.createAsWorkspace) {
        const projectRoot = params.projectName
            ? await createBIWorkspaceWithProject(params)
            : await createEmptyBIWorkspace(params);
        openInVSCode(projectRoot);
        return;
    }
    // Components go into an existing workspace when the target resolves inside one, else standalone.
    const { packageRoot, openRoot } = await createBIComponent(params);
    // No artifact is configured on this path, so the pointer carries only the narration
    // and the landing view for the window that opens next.
    const landingContext = resolveCreateLandingContext(packageRoot, openRoot, params);
    const componentLabel: IntegrationComponentLabel = params.isLibrary ? "library" : "integration";
    await writePendingIntegrationPointer({
        projectRoot: packageRoot,
        timestamp: Date.now(),
        integrationName: params.projectName,
        projectName: landingContext.projectName,
        isNewProject: landingContext.isNewProject,
        componentLabel,
        landing: landingContext.landing,
    });
    openInVSCode(openRoot);
}
