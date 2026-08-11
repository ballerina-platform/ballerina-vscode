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

import { SemanticVersion, PackageTomlValues, SCOPE, WorkspaceTomlValues, ProjectInfo, isSamePath } from '@wso2/ballerina-core';
import { BallerinaExtension } from '../core';
import { WorkspaceConfiguration, workspace, Uri, RelativePattern, extensions } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@iarna/toml';

export enum VERSION {
    BETA = 'beta',
    ALPHA = 'alpha',
    PREVIEW = 'preview'
}

export const AGENTS_FILE = "agents.bal";
export const AUTOMATION_FILE = "automation.bal";
export const CONFIG_FILE = "config.bal";
export const CONNECTIONS_FILE = "connections.bal";
export const DATA_MAPPING_FILE = "data_mappings.bal";
export const FUNCTIONS_FILE = "functions.bal";
export const MAIN_FILE = "main.bal";
export const TYPES_FILE = "types.bal";

export const BI_PROJECT_FILES = [
    AGENTS_FILE,
    AUTOMATION_FILE,
    CONFIG_FILE,
    CONNECTIONS_FILE,
    DATA_MAPPING_FILE,
    FUNCTIONS_FILE,
    MAIN_FILE,
    TYPES_FILE
];

export const WI_EXTENSION_ID = 'wso2.wso2-integrator';
export const VALIDATOR_PACKAGE_NAME = "wso2/strict.library";

interface BallerinaPluginConfig extends WorkspaceConfiguration {
    home?: string;
    debugLog?: boolean;
    classpath?: string;
}

export function getPluginConfig(): BallerinaPluginConfig {
    return workspace.getConfiguration('ballerina');
}

export function isWindows(): boolean {
    return process.platform === "win32";
}

export function isWSL(): boolean {
    // Check for WSL environment indicators
    return process.platform === "linux" && (
        process.env.WSL_DISTRO_NAME !== undefined ||
        process.env.WSLENV !== undefined ||
        (process.env.PATH && process.env.PATH.includes('/mnt/c/')) ||
        (process.env.TERM_PROGRAM && process.env.TERM_PROGRAM.includes('vscode'))
    );
}

/**
 * Wraps a file path in double quotes if it contains spaces,
 * so it can be safely used in shell command strings.
 * Handles already-quoted paths and escapes embedded double quotes.
 */
export function quoteShellPath(filePath: string): string {
    // Strip existing surrounding quotes to normalize
    let normalized = filePath;
    if (normalized.length >= 2 && normalized.startsWith('"') && normalized.endsWith('"')) {
        normalized = normalized.slice(1, -1);
    }

    if (!normalized.includes(' ')) {
        return normalized;
    }

    // Escape any embedded double quotes
    const escaped = normalized.replace(/"/g, '\\"');
    return `"${escaped}"`;
}

export function isSupportedVersion(ballerinaExtInstance: BallerinaExtension, supportedRelease: VERSION,
    supportedVersion: number): boolean {
    const ballerinaVersion: string = ballerinaExtInstance.ballerinaVersion.toLocaleLowerCase();
    const isPreview: boolean = ballerinaVersion.includes(VERSION.PREVIEW);
    const isAlpha: boolean = ballerinaVersion.includes(VERSION.ALPHA);
    if ((supportedRelease == VERSION.BETA && (isAlpha || isPreview)) || (supportedRelease == VERSION.ALPHA &&
        isPreview)) {
        return false;
    }

    const isBeta: boolean = ballerinaVersion.includes(VERSION.BETA);
    if ((!isAlpha && !isBeta && !isPreview) || (supportedRelease == VERSION.ALPHA && isBeta)) {
        return true;
    }

    if ((supportedRelease == VERSION.ALPHA && isAlpha) || (supportedRelease == VERSION.BETA && isBeta)) {
        const digits = ballerinaVersion.replace(/[^0-9]/g, "");
        const versionNumber = +digits;
        if (supportedVersion <= versionNumber) {
            return true;
        }
    }
    return false;
}

/**
 * Creates a version object for comparison.
 * 
 * @param major Major version number
 * @param minor Minor version number  
 * @param patch Patch version number
 * @returns A version object with major, minor, and patch components
 * 
 * @example
 * // Version 2201.1.30
 * createVersionNumber(2201, 1, 30)
 * // Version 2201.12.10
 * createVersionNumber(2201, 12, 10)
 */
export function createVersionNumber(
    major: number,
    minor: number,
    patch: number
): SemanticVersion {
    return { major, minor, patch };
}

/**
 * Compares two versions using semantic versioning rules.
 * Returns true if current version >= minimum version.
 * 
 * @param current Current version components
 * @param minimum Minimum required version components
 * @returns true if current >= minimum
 */
function compareVersions(
    current: SemanticVersion,
    minimum: SemanticVersion
): boolean {
    // Compare major version first
    if (current.major !== minimum.major) {
        return current.major > minimum.major;
    }

    // Major versions are equal, compare minor
    if (current.minor !== minimum.minor) {
        return current.minor > minimum.minor;
    }

    // Major and minor are equal, compare patch
    return current.patch >= minimum.patch;
}

/**
 * Compares the current Ballerina version against a minimum required version.
 * Only returns true for GA (non-preview/alpha/beta) versions that meet or exceed the minimum.
 * 
 * @param ballerinaExtInstance The Ballerina extension instance
 * @param minSupportedVersion Minimum version (use createVersionNumber helper to generate)
 * @returns true if current version is GA and meets minimum requirement
 * 
 * @example
 * // Check if version is at least 2201.1.30
 * isSupportedSLVersion(ext, createVersionNumber(2201, 1, 30))
 */
export function isSupportedSLVersion(
    ballerinaExtInstance: BallerinaExtension,
    minSupportedVersion: SemanticVersion
) {
    const ballerinaVersion: string = ballerinaExtInstance.ballerinaVersion.toLocaleLowerCase();
    const isGA: boolean = !ballerinaVersion.includes(VERSION.ALPHA) && !ballerinaVersion.includes(VERSION.BETA) && !ballerinaVersion.includes(VERSION.PREVIEW);

    if (!isGA) {
        return false;
    }

    // Parse current version
    const regex = /(\d+)\.(\d+)\.(\d+)/;
    const match = ballerinaVersion.match(regex);
    if (!match) {
        return false;
    }

    const currentVersion = {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3])
    };

    // Compare versions component by component
    return compareVersions(currentVersion, minSupportedVersion);
}

export function checkIsBI(uri: Uri): boolean {
    if (isInWI()) {
        return true;
    }

    const config = workspace.getConfiguration('ballerina', uri);
    const inspected = config.inspect<boolean>('isBI');

    if (inspected) {
        const valuesToCheck = [
            inspected.workspaceFolderValue,
            inspected.workspaceValue,
            inspected.globalValue
        ];
        return valuesToCheck.find(value => value === true) !== undefined; // Return true if isBI is set to true
    }
    return false; // Return false if isBI is not set
}

export function isInWI(): boolean {
    return !!extensions.getExtension(WI_EXTENSION_ID);
}

/**
 * ICP (Integration Control Plane) ships inside the WSO2 Integrator installation, so it is only
 * offered when the Integrator extension is present. Users running the Ballerina extension on its
 * own get no ICP commands, status bar item, or ICP sections in the overview webviews.
 */
export function isICPSupported(): boolean {
    return isInWI();
}

export function isInDevant(): boolean {
    return !!process.env.CLOUD_STS_TOKEN;
}

export async function checkIsBallerinaPackage(uri: Uri): Promise<boolean> {
    const ballerinaTomlPath = path.join(uri.fsPath, 'Ballerina.toml');

    // First check if the file exists
    if (!fs.existsSync(ballerinaTomlPath)) {
        return false;
    }

    try {
        const tomlValues = await getProjectTomlValues(uri.fsPath);
        return tomlValues?.package !== undefined;
    } catch (error) {
        // If there's an error reading the file, it's not a valid Ballerina project
        console.error(`Error reading package Ballerina.toml: ${error}`);
        return false;
    }
}


export async function checkIsBallerinaWorkspace(uri: Uri): Promise<boolean> {
    const ballerinaTomlPath = path.join(uri.fsPath, 'Ballerina.toml');

    // First check if the file exists
    if (!fs.existsSync(ballerinaTomlPath)) {
        return false;
    }

    try {
        const tomlValues = await getWorkspaceTomlValues(uri.fsPath);
        return tomlValues?.workspace !== undefined && tomlValues.workspace?.packages !== undefined;
    } catch (error) {
        // If there's an error reading the file, it's not a valid Ballerina workspace
        console.error(`Error reading workspace Ballerina.toml: ${error}`);
        return false;
    }
}

export async function hasMultipleBallerinaPackages(uri: Uri): Promise<boolean> {
    const packages = await getBallerinaPackages(uri);
    return packages.length > 1;
}

export async function getBallerinaPackages(uri: Uri): Promise<string[]> {
    try {
        const ballerinaTomlPattern = `**${path.sep}Ballerina.toml`;
        const tomls = await workspace.findFiles(
            new RelativePattern(uri.fsPath, ballerinaTomlPattern)
        );

        if (tomls.length === 0) {
            return [];
        }

        // Collect valid package paths (Ballerina.toml files with [package] section)
        const packagePaths: string[] = [];

        for (const toml of tomls) {
            const projectRoot = path.dirname(toml.fsPath);
            try {
                const tomlValues = await getProjectTomlValues(projectRoot);
                // Only count as a package if it has a package section
                if (tomlValues?.package !== undefined) {
                    packagePaths.push(projectRoot);
                }
            } catch (error) {
                // Skip invalid TOML files
                console.error(`Error reading Ballerina.toml at ${toml.fsPath}: ${error}`);
            }
        }

        return packagePaths;
    } catch (error) {
        console.error(`Error checking for multiple Ballerina packages: ${error}`);
        return [];
    }
}

export function getOrgPackageName(projectPath: string): { orgName: string, packageName: string } {
    const ballerinaTomlPath = path.join(projectPath, 'Ballerina.toml');

    // Regular expressions for Ballerina.toml parsing
    const ORG_REGEX = /\[package\][\s\S]*?org\s*=\s*["']([^"']*)["']/;
    const NAME_REGEX = /\[package\][\s\S]*?name\s*=\s*["']([^"']*)["']/;

    if (!fs.existsSync(ballerinaTomlPath)) {
        return { orgName: '', packageName: '' };
    }

    try {
        const tomlContent = fs.readFileSync(ballerinaTomlPath, 'utf8');

        // Extract org name and package name
        const orgName = tomlContent.match(ORG_REGEX)?.[1] || '';
        const packageName = tomlContent.match(NAME_REGEX)?.[1] || '';

        return { orgName, packageName };
    } catch (error) {
        console.error(`Error reading Ballerina.toml: ${error}`);
        return { orgName: '', packageName: '' };
    }
}

export async function getProjectTomlValues(projectPath: string): Promise<Partial<PackageTomlValues> | undefined> {
    const ballerinaTomlPath = path.join(projectPath, 'Ballerina.toml');
    if (fs.existsSync(ballerinaTomlPath)) {
        const tomlContent = await fs.promises.readFile(ballerinaTomlPath, 'utf-8');
        try {
            return parse(tomlContent) as Partial<PackageTomlValues>;
        } catch (error) {
            console.error("Failed to load Ballerina.toml content for project at path: ", projectPath, error);
            return;
        }
    }
}

export async function getWorkspaceTomlValues(workspacePath: string): Promise<Partial<WorkspaceTomlValues> | undefined> {
    const ballerinaTomlPath = path.join(workspacePath, 'Ballerina.toml');
    if (fs.existsSync(ballerinaTomlPath)) {
        const tomlContent = await fs.promises.readFile(ballerinaTomlPath, 'utf-8');
        try {
            return parse(tomlContent) as Partial<WorkspaceTomlValues>;
        } catch (error) {
            console.error("Failed to load Ballerina.toml content for workspace at path: ", workspacePath, error);
            return;
        }
    }
}

export function fetchScope(uri: Uri): SCOPE {
    const config = workspace.getConfiguration('ballerina', uri);
    const inspected = config.inspect<SCOPE>('scope');

    if (inspected) {
        const valuesToCheck = [
            inspected.workspaceFolderValue,
            inspected.workspaceValue,
            inspected.globalValue
        ];
        const scope = valuesToCheck.find(value => value !== undefined) as SCOPE;
        if (scope) {
            // Create BI files if the scope is set
            setupBIFiles(uri.fsPath);
        }
        return scope;
    }
}

export function setupBIFiles(projectDir: string): void {
    BI_PROJECT_FILES.forEach(file => {
        const filePath = path.join(projectDir, file);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '');
        }
    });
}

export function getOrgAndPackageName(projectInfo: ProjectInfo, projectPath: string): { orgName: string, packageName: string } {
    if (!projectPath || !projectInfo) {
        return { orgName: '', packageName: '' };
    }

    if (projectInfo.children?.length) {
        const matchedProject = projectInfo.children.find(
            (child) => isSamePath(child.projectPath, projectPath)
        );

        if (matchedProject) {
            return {
                orgName: matchedProject.org || matchedProject.orgName,
                packageName: matchedProject.title || matchedProject.name
            };
        }
    }

    return {
        orgName: projectInfo.org || projectInfo.orgName,
        packageName: projectInfo.title || projectInfo.name
    };
}

export async function isLibraryProject(projectPath: string): Promise<boolean> {
    const libBalPath = path.join(projectPath, 'lib.bal');

    if (fs.existsSync(libBalPath)) {
        const libBalContent = fs.readFileSync(libBalPath, 'utf8');
        return libBalContent.includes(`import ${VALIDATOR_PACKAGE_NAME} as _;`);
    }
    return false;
}
