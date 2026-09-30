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

export interface MigrationToolPullFacts {
    toolName: string;
    /** Minimum tool version the language server accepts (`requiredVersion` in migration_tools.json). */
    requiredVersion: string;
    /** Whether `bal tool pull <tool>` finished successfully. */
    pullSucceeded: boolean;
    /**
     * The language server's verdict on the active tool after the pull: true when it meets
     * `requiredVersion`, false when it is older or missing, undefined when the check could not run.
     */
    activeToolCompatible: boolean | undefined;
    /** Last stderr line from the pull, if any, to explain a failure. */
    pullError?: string;
}

export interface MigrationToolPullOutcome {
    success: boolean;
    message: string;
}

/**
 * Decides whether the wizard may continue after an unpinned `bal tool pull`.
 *
 * The migration runs whichever tool version is active, so the language server's minimum-version
 * check decides, not the pull's exit status: a failed pull (offline, proxy, Central outage) is
 * fine when a compatible tool is already active, and a successful one is not enough when the
 * newest version compatible with the distribution is still below the minimum.
 */
export function decideMigrationToolPullOutcome(facts: MigrationToolPullFacts): MigrationToolPullOutcome {
    const { toolName, requiredVersion, pullSucceeded, activeToolCompatible, pullError } = facts;
    const reason = pullError ? ` ${pullError}` : "";

    if (activeToolCompatible === undefined) {
        // Without the language server's verdict, fall back to the pull result alone.
        return pullSucceeded
            ? { success: true, message: `Successfully pulled the latest '${toolName}'.` }
            : { success: false, message: `Failed to pull '${toolName}'.${reason}` };
    }

    if (activeToolCompatible) {
        return pullSucceeded
            ? { success: true, message: `Using the latest '${toolName}'.` }
            : {
                success: true,
                message: `Could not check for a newer '${toolName}'; using the installed version, `
                    + `which meets the required ${requiredVersion}.`,
            };
    }

    return pullSucceeded
        ? {
            success: false,
            message: `The latest '${toolName}' compatible with your Ballerina distribution is older than `
                + `the required ${requiredVersion}. Update Ballerina and try again.`,
        }
        : {
            success: false,
            message: `Failed to pull '${toolName}', and no installed version meets the required `
                + `${requiredVersion}.${reason}`,
        };
}
