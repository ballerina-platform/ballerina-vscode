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

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StateMachine } from '../../../../stateMachine';
import { OperationType, ProjectModule, ProjectSource, ExecutionContext } from '@wso2/ballerina-core';
import { getWorkspaceTomlValues } from '../../../../utils';
import { NATURAL_PROGRAMMING_DIR_NAME, REQ_KEY, REQUIREMENT_DOC_PREFIX, REQUIREMENT_MD_DOCUMENT, REQUIREMENT_TEXT_DOCUMENT } from '../../../../rpc-managers/ai-panel/constants';
import { isErrorCode, requirementsSpecification } from '../../../../rpc-managers/ai-panel/utils';
import { sendAgentDidCloseBatch } from './ls-schema-notifications';
import { parseTomlToConfig } from '../../../../../src/features/config-generator/utils';
import { BALLERINA_TOML } from '../../../../../src/utils/project-utils';

/**
 * Result of getTempProject operation
 */
export interface TempProjectResult {
    /** Path to the temporary project directory */
    path: string;
}

interface BallerinaProject {
    projectName: string;
    modules?: BallerinaModule[];
    sources: { [key: string]: string };
    tests?: { [key: string]: string };
}

interface BallerinaModule {
    moduleName: string;
    sources: { [key: string]: string };
    isGenerated: boolean;
}

const REVIEW_BASELINE_SUFFIX = '-review-baseline';
const REVIEW_BASELINE_IGNORED_DIRECTORIES = new Set([
    '.git',
    'node_modules',
    'target',
    'build',
    'dist',
]);

export function getReviewBaselinePath(tempProjectPath: string): string {
    return `${tempProjectPath}${REVIEW_BASELINE_SUFFIX}`;
}

async function copyReviewBaselineFiles(sourceRoot: string, baselineRoot: string, relativeDir = ''): Promise<void> {
    const sourceDir = path.join(sourceRoot, relativeDir);
    const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (!REVIEW_BASELINE_IGNORED_DIRECTORIES.has(entry.name)) {
                await copyReviewBaselineFiles(sourceRoot, baselineRoot, path.join(relativeDir, entry.name));
            }
            continue;
        }
        if (!entry.isFile() || (!entry.name.endsWith('.bal') && entry.name !== 'Ballerina.toml')) {
            continue;
        }

        const relativeFile = path.join(relativeDir, entry.name);
        const baselineFile = path.join(baselineRoot, relativeFile);
        await fs.promises.mkdir(path.dirname(baselineFile), { recursive: true });
        await fs.promises.copyFile(path.join(sourceRoot, relativeFile), baselineFile);
    }
}

/**
 * Recursively finds all .bal files in a directory
 * @param dir Directory to search
 * @param baseDir Base directory for relative paths (defaults to dir)
 * @returns Array of relative file paths
 */
function findAllBalFiles(dir: string, baseDir?: string): string[] {
    const base = baseDir || dir;
    const files: string[] = [];

    if (!fs.existsSync(dir)) {
        return files;
    }

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                files.push(...findAllBalFiles(fullPath, base));
            } else if (entry.isFile() && entry.name.endsWith('.bal')) {
                const relativePath = path.relative(base, fullPath);
                files.push(relativePath);
            }
        }
    } catch (error) {
        console.warn(`[findAllBalFiles] Error reading directory ${dir}:`, error);
    }

    return files;
}

// TODO: Improve sync strategy and timing
// Current approach syncs all workspace files to temp on every session continuation.
// Consider:
// - More granular sync triggers (only sync when external changes detected)
// - Smarter sync timing (sync before AI operations, not during session start)
// - Bidirectional conflict detection (workspace vs temp changes)
// - Performance optimization for large projects

/**
 * Creates a temporary project directory for AI operations.
 *
 * Priority order for source project path:
 * 1. ctx.projectPath (set by caller, isolated per execution)
 * 2. ctx.workspacePath (fallback for workspace context)
 *
 * @param ctx - Execution context containing project paths
 * @returns Result containing temp path
 */
export async function getTempProject(ctx: ExecutionContext): Promise<TempProjectResult> {
    let projectRoot = ctx.projectPath;
    const workspacePath = ctx.workspacePath;
    if (workspacePath) {
        projectRoot = workspacePath;
    }

    const projectHash = crypto.createHash('sha256').update(projectRoot).digest('hex');
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const tempDir = path.join(os.tmpdir(), `bal-proj-${projectHash}-${timestamp}-${randomSuffix}`);
    const baselineDir = getReviewBaselinePath(tempDir);

    if (fs.existsSync(tempDir)) {
        const existingFiles = findAllBalFiles(tempDir);

        if (existingFiles.length > 0) {
            sendAgentDidCloseBatch(tempDir, existingFiles);
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    try {
        // Create temp directory
        fs.mkdirSync(tempDir, { recursive: true });

        // Copy entire project to temp directory
        await fs.promises.cp(projectRoot, tempDir, { recursive: true });

        // Keep a compact, on-disk original for review restoration. Checkpoints are optional and
        // size-limited, while this baseline only contains files used by semantic/diagram diffs.
        await fs.promises.mkdir(baselineDir, { recursive: true });
        await copyReviewBaselineFiles(tempDir, baselineDir);
    } catch (error) {
        // A partial project/baseline is never usable and must not outlive a failed setup.
        for (const directory of [tempDir, baselineDir]) {
            try {
                fs.rmSync(directory, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error(`Failed to remove partial temp project artifact at ${directory}:`, cleanupError);
            }
        }
        throw error;
    }

    return {
        path: tempDir
    };
}

/**
 * True only for paths this module itself created via getTempProject — a real OS temp
 * directory named bal-proj-<hash>-<timestamp>-<suffix>. cleanupTempProject refuses to
 * delete anything else, since callers may pass a real project directory (e.g. the
 * existingTempPath lifecycle option, or an ExecutionContext whose tempProjectPath has
 * been repointed at the live workspace) and fs.rmSync on that would be irreversible.
 */
function isOwnedTempDir(tempPath: string): boolean {
    const resolved = path.resolve(tempPath);
    const withinOsTmpdir = resolved.startsWith(path.resolve(os.tmpdir()) + path.sep);
    return withinOsTmpdir && /^bal-proj-[0-9a-f]{64}-\d+-[0-9a-f]{8}$/.test(path.basename(resolved));
}

/**
 * Cleans up a temporary project directory
 * Sends didClose notifications to Language Server for both file:// and ai:// schemas
 * before deleting files to prevent orphaned LS references
 *
 * @param tempPath Path to the temporary project to delete
 */
export async function cleanupTempProject(tempPath: string): Promise<void> {
    removeReviewBaseline(getReviewBaselinePath(tempPath));

    if (!fs.existsSync(tempPath)) {
        return;
    }

    if (!isOwnedTempDir(tempPath)) {
        console.log(`[cleanupTempProject] Keeping non-temp path: ${tempPath}`);
        return;
    }

    try {
        // Find all .bal files and send didClose notifications
        const balFiles = findAllBalFiles(tempPath);
        if (balFiles.length > 0) {
            sendAgentDidCloseBatch(tempPath, balFiles); // Handles both file:// and ai:// schemas
            await new Promise(resolve => setTimeout(resolve, 300)); // Wait for LS to process
        }
    } catch (error) {
        console.error(`Failed to notify the language server before cleaning up ${tempPath}:`, error);
    } finally {
        try {
            fs.rmSync(tempPath, { recursive: true, force: true });
        } catch (error) {
            console.error(`Failed to cleanup temp project at ${tempPath}:`, error);
        }
    }
}

/** Always ours to delete, even when tempPath is the live workspace and must be left in place. */
function removeReviewBaseline(baselinePath: string): void {
    if (!path.basename(baselinePath).endsWith(REVIEW_BASELINE_SUFFIX) || !fs.existsSync(baselinePath)) {
        return;
    }
    try {
        fs.rmSync(baselinePath, { recursive: true, force: true });
    } catch (error) {
        console.error(`Failed to cleanup review baseline at ${baselinePath}:`, error);
    }
}

export async function getProjectSource(requestType: OperationType, ctx: ExecutionContext): Promise<ProjectSource[]> {
    const currentProjectPath = ctx.projectPath;
    const workspacePath = ctx.workspacePath;

    // Early return for non-workspace case: single project only
    if (!workspacePath) {
        const project = await getCurrentProjectSource(requestType, ctx);
        if (!project) {
            throw new Error('Cannot get project source - ExecutionContext projectPath not initialized');
        }
        // No workspace context, so packagePath is empty string
        return [convertToProjectSource(project, "", true)];
    }

    // Workspace case: load all packages from the workspace
    const workspaceTomlValues = await getWorkspaceTomlValues(workspacePath);

    // Fallback to single project if workspace.toml is invalid or has no packages
    if (!workspaceTomlValues || !workspaceTomlValues.workspace || !workspaceTomlValues.workspace.packages) {
        const project = await getCurrentProjectSource(requestType, ctx);
        // Workspace exists but invalid, treat as non-workspace
        return [convertToProjectSource(project, "", true)];
    }

    const packagePaths = StateMachine.context().projectInfo?.children.map(child => child.projectPath);
    // Load all packages in parallel
    const projectSources: ProjectSource[] = await Promise.all(
        packagePaths.map(async (pkgPath) => {
            // Resolve the full path for reading files and checking if active
            const fullPackagePath = path.isAbsolute(pkgPath)
                ? pkgPath
                : path.join(workspacePath, pkgPath);

            const project = await getCurrentProjectSource(requestType, ctx, fullPackagePath);
            const isActive = fullPackagePath === currentProjectPath;

            // Use relative path from workspace for packagePath
            const relativePackagePath = path.isAbsolute(pkgPath)
                ? path.relative(workspacePath, pkgPath)
                : pkgPath;

            return convertToProjectSource(project, relativePackagePath, isActive);
        })
    );

    return projectSources;
}

async function getCurrentProjectSource(
    requestType: OperationType,
    ctx: ExecutionContext,
    projectPathOverride?: string
): Promise<BallerinaProject> {
    const targetProjectPath = projectPathOverride || ctx.projectPath;
    if (!targetProjectPath) {
        return null;
    }

    // Read the Ballerina.toml file to get package name
    const ballerinaTomlPath = path.join(targetProjectPath, 'Ballerina.toml');
    let packageName: string = '';
    if (fs.existsSync(ballerinaTomlPath)) {
        const tomlContent = await fs.promises.readFile(ballerinaTomlPath, 'utf-8');
        // Simple parsing to extract the package.name field
        try {
            const tomlObj: BALLERINA_TOML = parseTomlToConfig(tomlContent) as BALLERINA_TOML;
            packageName = tomlObj.package.name;
        } catch (error) {
            packageName = '';
        }
    }

    const project: BallerinaProject = {
        modules: [],
        sources: {},
        projectName: packageName
    };

    // Include package Ballerina.toml in sources so the agent sees the package structure
    if (fs.existsSync(ballerinaTomlPath)) {
        const tomlContent = await fs.promises.readFile(ballerinaTomlPath, 'utf-8');
        project.sources['Ballerina.toml'] = tomlContent;
    }

    // Read root-level .bal files
    const rootFiles = fs.readdirSync(targetProjectPath);
    for (const file of rootFiles) {
        if (file.endsWith('.bal') || file.toLowerCase() === "readme.md") {
            const filePath = path.join(targetProjectPath, file);
            project.sources[file] = await fs.promises.readFile(filePath, 'utf-8');
        }
    }

    if (requestType) {
        const naturalProgrammingDirectory = targetProjectPath + `/${NATURAL_PROGRAMMING_DIR_NAME}`;
        if (fs.existsSync(naturalProgrammingDirectory)) {
            const reqFiles = fs.readdirSync(naturalProgrammingDirectory);
            for (const file of reqFiles) {
                const filePath = path.join(targetProjectPath, `${NATURAL_PROGRAMMING_DIR_NAME}`, file);
                if (file.toLowerCase() == REQUIREMENT_TEXT_DOCUMENT || file.toLowerCase() == REQUIREMENT_MD_DOCUMENT) {
                    project.sources[REQ_KEY] = await fs.promises.readFile(filePath, 'utf-8');
                    continue;
                } else if (file.toLowerCase().startsWith(REQUIREMENT_DOC_PREFIX)) {
                    const requirements = await requirementsSpecification(filePath);
                    if (!isErrorCode(requirements)) {
                        project.sources[REQ_KEY] = requirements.toString();
                        continue;
                    }
                    project.sources[REQ_KEY] = "";
                }
            }
        }
    }

    // Read modules
    const modulesDir = path.join(targetProjectPath, 'modules');
    const generatedDir = path.join(targetProjectPath, 'generated');
    await populateModules(modulesDir, project);
    await populateModules(generatedDir, project);

    // Read test files from tests/ directory (recursive, paths relative to testsDir)
    const testsDir = path.join(targetProjectPath, 'tests');
    if (fs.existsSync(testsDir)) {
        project.tests = {};
        const testFiles = findAllBalFiles(testsDir);
        for (const relPath of testFiles) {
            const filePath = path.join(testsDir, relPath);
            project.tests[relPath] = await fs.promises.readFile(filePath, 'utf-8');
        }
    }

    return project;
}

async function populateModules(modulesDir: string, project: BallerinaProject) {
    if (fs.existsSync(modulesDir)) {
        const modules = fs.readdirSync(modulesDir, { withFileTypes: true });
        for (const moduleDir of modules) {
            if (moduleDir.isDirectory()) {
                const module: BallerinaModule = {
                    moduleName: moduleDir.name,
                    sources: {},
                    isGenerated: path.basename(modulesDir) !== 'modules'
                };

                const moduleFiles = fs.readdirSync(path.join(modulesDir, moduleDir.name));
                for (const file of moduleFiles) {
                    if (file.endsWith('.bal')) {
                        const filePath = path.join(modulesDir, moduleDir.name, file);
                        module.sources[file] = await fs.promises.readFile(filePath, 'utf-8');
                    }
                }

                project.modules.push(module);
            }
        }
    }
}

function convertToProjectSource(project: BallerinaProject, pkgPath: string, isActive: boolean): ProjectSource {
    const projectSource: ProjectSource = {
        sourceFiles: [],
        projectModules: [],
        projectName: project.projectName,
        packagePath: pkgPath,
        isActive: isActive
    };

    // Iterate through root-level sources
    for (const [filePath, content] of Object.entries(project.sources)) {
        projectSource.sourceFiles.push({ filePath, content });
    }

    // Iterate through module sources
    if (project.modules) {
        for (const module of project.modules) {
            const projectModule: ProjectModule = {
                moduleName: module.moduleName,
                sourceFiles: [],
                isGenerated: module.isGenerated
            };
            for (const [fileName, content] of Object.entries(module.sources)) {
                projectModule.sourceFiles.push({ filePath: fileName, content });
            }
            projectSource.projectModules.push(projectModule);
        }
    }

    // Iterate through test sources
    if (project.tests) {
        projectSource.projectTests = [];
        for (const [filePath, content] of Object.entries(project.tests)) {
            projectSource.projectTests.push({ filePath, content });
        }
    }

    return projectSource;
}
