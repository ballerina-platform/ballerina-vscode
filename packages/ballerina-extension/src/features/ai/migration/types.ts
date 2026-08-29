// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

/** globalState key – only one pending enhancement is allowed at a time */
export const PENDING_MIGRATION_ENHANCEMENT_KEY = "ballerina.pendingMigrationEnhancement";

/**
 * Persistent globalState key that stores just the project root of the most
 * recently migrated project.  Unlike `PENDING_MIGRATION_ENHANCEMENT_KEY` this
 * entry is never TTL-expired so `getActiveMigrationSessionState` can always
 * locate the state file even if the webview mounts before
 * `checkAndRunPendingEnhancement` runs.
 */
export const MIGRATION_PROJECT_ROOT_KEY = "ballerina.migrationProjectRoot";

/** Hidden directory inside the project root that stores AI migration metadata. */
export const AI_MIGRATION_DIR = ".ballerina-ai-migration";

/** State TOML filename inside AI_MIGRATION_DIR. */
export const AI_ENHANCE_TOML_FILENAME = "state.toml";

/** Subdirectory inside AI_MIGRATION_DIR that holds per-stage transcript files. */
export const AI_TRANSCRIPT_DIR = "transcripts";

/** Filename for the structured summary written at pause / completion. */
export const AI_SUMMARY_FILENAME = "summary.md";

/**
 * Shape of the value stored in VS Code globalState before the
 * `vscode.openFolder` reload so that the enhancement pipeline can
 * be resumed in the freshly opened window.
 */
export interface PendingMigrationEnhancement {
    /** `true` when the AI enhancement feature was used (wizard or post-wizard). */
    aiFeatureUsed: boolean;
    projectRoot: string;
    /** epoch ms – used to discard stale entries (>10 min) */
    timestamp: number;
    /** Absolute path to the original source project (e.g. Mule XML directory). */
    sourcePath?: string;
}

/** Milliseconds before a stale pending-enhancement entry is discarded */
export const PENDING_ENHANCEMENT_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Shape of the `state.toml` file written inside `.ballerina-ai-migration/`.
 */
export interface EnhanceTomlData {
    /** `true` when the AI enhancement feature was used (wizard or post-wizard). */
    aiFeatureUsed: boolean;
    /** `true` once the AI enhancement pipeline has completed successfully for this project. */
    fullyEnhanced: boolean;
    /** Absolute path to the original source project (e.g. Mule XML directory). */
    sourcePath?: string;
    /** Relative paths of packages that have completed all enhancement stages. */
    completedPackages?: string[];
    /** Relative path of the package currently being enhanced. */
    currentPackage?: string;
    /** Zero-based index of the stage currently being run within `currentPackage`. */
    currentStage?: number;
    /** `true` when this project is a multi-package workspace (cross-dependent packages). */
    multiProject?: boolean;
    /** `true` when the migration ran with --keep-structure, preserving the original source file layout. */
    keepStructure?: boolean;
    /** The source integration platform ('mule' for MuleSoft, 'tibco' for TIBCO BusinessWorks). */
    sourcePlatform?: 'mule' | 'tibco';
}

/**
 * Runtime context derived from the toml, passed to all prompt-generation functions.
 * Adding a new wizard parameter here automatically makes it available to every stage prompt.
 */
export interface MigrationContext {
    /** The source integration platform. 'unknown' when the toml predates this field. */
    sourcePlatform: 'mule' | 'tibco' | 'unknown';
    keepStructure: boolean;
}

/**
 * Outcome of enhancing a single package in a multi-package workspace.
 */
export interface PackageEnhancementResult {
    /** Relative path of the package from the workspace root. */
    packagePath: string;
    /** Whether all stages completed successfully. */
    success: boolean;
    /** If `success` is false, a short description of what went wrong. */
    error?: string;
}

/**
 * Describes the current state of a migration AI enhancement session.
 * Mirrors `ActiveMigrationSession` from `@wso2/ballerina-core`.
 * Defined locally here to avoid cross-package build-order issues.
 */
export interface ActiveMigrationSessionLocal {
    isActive: boolean;
    /** `true` when the AI enhancement feature was used (wizard or post-wizard). */
    aiFeatureUsed: boolean;
    /** `true` once the enhancement pipeline has completed successfully (read from the toml). */
    fullyEnhanced: boolean;
}
