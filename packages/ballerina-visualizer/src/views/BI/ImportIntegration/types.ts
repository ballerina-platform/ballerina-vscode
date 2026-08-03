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

import { DownloadProgress, ImportIntegrationResponse, MigrationTool, ProjectMigrationResult, ProjectRequest } from "@wso2/ballerina-core";

export interface FinalIntegrationParams {
    importSourcePath: string;
    type: string;
    parameters?: Record<string, any>;
}

export enum CoverageLevel {
    HIGH = "high",
    MEDIUM = "medium",
    LOW = "low"
}

export interface CoverageOverview {
    projects?: number;
    unitName: string;
    coveragePercentage: number;
    coverageLevel: CoverageLevel;
    totalElements: number;
    migratableElements: number;
    nonMigratableElements: number;
}


export interface MigrationReportJSON {
    coverageOverview: CoverageOverview;
}

export interface ImportIntegrationFormProps {
    selectedIntegration: MigrationTool | null;
    migrationTools: MigrationTool[];
    pullIntegrationTool: (commandName: string, version: string) => void;
    pullingTool: boolean;
    toolPullProgress: DownloadProgress | null;
    setImportParams: (params: FinalIntegrationParams) => void;
    onSelectIntegration: (selectedIntegration: MigrationTool) => void;
    onNext: () => void;
    onBack: () => void;
}

export interface MigrationProgressProps {
    migrationState: string | null;
    migrationLogs: string[];
    migrationCompleted: boolean;
    migrationSuccessful: boolean;
    migrationResponse: ImportIntegrationResponse | null;
    projects: ProjectMigrationResult[];
    isMultiProject: boolean;
    onStartAIEnhancement: () => void;
    onDone: () => void;
    onOpenProject: () => void;
    onBack: () => void;
    toolPullFailed?: boolean;
    toolPullFailureMessage?: string | null;
    migrationToolCommandName?: string;
}

export interface DryRunViewProps {
    migrationState: string | null;
    migrationLogs: string[];
    migrationCompleted: boolean;
    migrationSuccessful: boolean;
    migrationResponse: ImportIntegrationResponse | null;
    projects: ProjectMigrationResult[];
    isMultiProject: boolean;
    onNext: () => void;
    onDone: () => void;
    onBack?: () => void;
    toolPullFailed?: boolean;
    toolPullFailureMessage?: string | null;
    migrationToolCommandName?: string;
}

export interface ConfigureProjectFormProps {
    isMultiProject: boolean;
    /** Absolute path to the original source project (e.g. Mule XML directory). */
    importSourcePath?: string;
    onNext: (project: ProjectRequest, aiFeatureUsed: boolean) => Promise<void> | void;
    onBack: () => void;
}

export interface MigrationDisplayState {
    isInProgress: boolean;
    isSuccess: boolean;
    isFailed: boolean;
    hasReportData: boolean;
    showButtonsInStep: boolean;
    showButtonsAfterLogs: boolean;
}
