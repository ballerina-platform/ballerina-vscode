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

import { ImportIntegrationResponse, ProjectMigrationResult } from "@wso2/ballerina-core";
import { CoverageLevel, MigrationDisplayState } from "./types";
import { BiWsClient } from "../wsManager/WsClient";

export const SELECTION_TEXT = "To begin, choose a source platform from the options above.";

export const sanitizeProjectName = (name: string): string => {
    return name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
};

export const getCoverageLevel = (level: CoverageLevel): string => {
    if (level.toLowerCase() === CoverageLevel.HIGH) return "HIGH COVERAGE";
    if (level.toLowerCase() === CoverageLevel.MEDIUM) return "MEDIUM COVERAGE";
    return "LOW COVERAGE";
};

export const getCoverageColor = (level: CoverageLevel): string => {
    if (level.toLowerCase() === CoverageLevel.HIGH) return "var(--vscode-charts-green)";
    if (level.toLowerCase() === CoverageLevel.MEDIUM) return "var(--vscode-charts-orange)";
    return "var(--vscode-charts-red)";
};

export const getMigrationProgressHeaderData = (state: MigrationDisplayState, isMultiProject: boolean = false) => {
    let headerText;
    let headerDesc;

    if (state.isSuccess) {
        if (isMultiProject) {
            headerText = "Static Migration Completed";
            headerDesc =
                "Your integration project has been successfully migrated through static mapping. You can now move on to configuring your project, with the option to enhance it further using AI.";
        } else {
            headerText = "Static Migration Completed";
            headerDesc =
                "Your integration project has been successfully migrated through static mapping. You can now move on to configuring your project, with the option to enhance it further using AI.";
        }
    } else if (state.isFailed) {
        headerText = "Migration Failed";
        headerDesc = "The migration process encountered errors and could not be completed.";
    } else if (state.isInProgress) {
        if (isMultiProject) {
            headerText = "Static Migration in Progress...";
            headerDesc = "Please wait while we migrate your multi-project integration.";
        } else {
            headerText = "Static Migration in Progress...";
            headerDesc = "Please wait while we set up your new integration project.";
        }
    }

    return { headerText, headerDesc };
};

export const getMigrationDisplayState = (
    migrationCompleted: boolean,
    migrationSuccessful: boolean,
    hasReportData: boolean
): MigrationDisplayState => ({
    isInProgress: !migrationCompleted,
    isSuccess: migrationCompleted && migrationSuccessful,
    isFailed: migrationCompleted && !migrationSuccessful,
    hasReportData,
    showButtonsInStep: migrationCompleted && migrationSuccessful,
    showButtonsAfterLogs: !migrationCompleted || (migrationCompleted && !migrationSuccessful)
});

export const handleMultiProjectReportOpening = async (
    migrationResponse: ImportIntegrationResponse,
    projects: Array<ProjectMigrationResult>,
    wsClient: BiWsClient
): Promise<void> => {
    // Build a map of project reports from the projects array
    const subProjectReports: { [projectName: string]: string } = {};

    projects.forEach((project) => {
        if (project.projectName && project.report) {
            subProjectReports[project.projectName] = project.report;
        }
    });

    // Store the sub-project reports via RPC so they can be retrieved on link clicks
    if (Object.keys(subProjectReports).length > 0) {
        try {
            await wsClient.storeSubProjectReports({
                reports: subProjectReports
            });
            console.log("Stored sub-project reports:", Object.keys(subProjectReports));
        } catch (error) {
            console.warn("Failed to store sub-project reports:", error);
            // Fail gracefully - the reports just won't be available for clicking
        }
    }
}
