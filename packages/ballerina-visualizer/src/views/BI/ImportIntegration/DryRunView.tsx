/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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

import { ActionButtons, Button, Typography } from "@wso2/ui-toolkit";
import { useBiWsContext } from "../wsManager/WsClientContext";
import { useEffect, useMemo, useState } from "react";
import { MigrationLogs } from "./components/MigrationLogs";
import { MigrationStatusContent } from "./components/MigrationStatusContent";
import { BodyText, ButtonWrapper, StepWrapper } from "./styles";
import { DryRunViewProps, MigrationReportJSON } from "./types";
import { getMigrationDisplayState, handleMultiProjectReportOpening } from "./utils";

export function DryRunView({
    migrationState,
    migrationLogs,
    migrationCompleted,
    migrationSuccessful,
    migrationResponse,
    projects,
    isMultiProject,
    onNext,
    onDone,
    onBack,
    toolPullFailed,
    toolPullFailureMessage,
    migrationToolCommandName,
}: DryRunViewProps) {
    const [isLogsOpen, setIsLogsOpen] = useState(true);
    const { wsClient } = useBiWsContext();

    const parsedReportData = useMemo(() => {
        if (!migrationResponse?.jsonReport) return null;
        try {
            const reportData = typeof migrationResponse.jsonReport === "string"
                ? JSON.parse(migrationResponse.jsonReport)
                : migrationResponse.jsonReport;
            return reportData as MigrationReportJSON;
        } catch (error) {
            console.error("Failed to parse dry run report JSON:", error);
            return null;
        }
    }, [migrationResponse?.jsonReport]);

    useEffect(() => {
        if (migrationCompleted) {
            setIsLogsOpen(false);
        } else if (migrationLogs.length > 0) {
            setIsLogsOpen(true);
        }
    }, [migrationCompleted, migrationLogs.length]);

    const handleViewReport = async () => {
        try {
            if (migrationResponse?.report) {
                await handleMultiProjectReportOpening(migrationResponse, projects, wsClient);
                await wsClient.openMigrationReport({
                    reportContent: migrationResponse.report,
                    fileName: "dry-run-report.html",
                });
            }
        } catch (error) {
            console.error("Failed to open dry run report:", error);
        }
    };

    const handleSaveReport = async () => {
        try {
            if (!migrationResponse?.report) return;
            const hasMultipleProjects = isMultiProject && projects && projects.length > 0;
            if (hasMultipleProjects) {
                const projectReports: { [projectName: string]: string } = {};
                projects.forEach((project) => {
                    if (project.projectName && project.report) {
                        projectReports[project.projectName] = project.report;
                    }
                });
                await wsClient.saveMigrationReport({
                    reportContent: migrationResponse.report,
                    defaultFileName: "aggregate_dry_run_report.html",
                    projectReports,
                });
            } else {
                await wsClient.saveMigrationReport({
                    reportContent: migrationResponse.report,
                    defaultFileName: "dry-run-report.html",
                });
            }
        } catch (error) {
            console.error("Failed to save dry run report:", error);
        }
    };

    const displayState = getMigrationDisplayState(migrationCompleted, migrationSuccessful, !!parsedReportData);

    if (toolPullFailed) {
        return (
            <>
                <div>
                    <Typography variant="h2">Tool Installation Failed</Typography>
                    <BodyText>
                        {toolPullFailureMessage || "An error occurred while installing the migration tool."}
                    </BodyText>
                    <BodyText style={{ marginTop: 12 }}>
                        You can install the tool manually by running the following command in your terminal:
                    </BodyText>
                    <pre style={{
                        fontFamily: "var(--vscode-editor-font-family, monospace)",
                        background: "color-mix(in srgb, var(--vscode-editor-background) 80%, var(--vscode-panel-border))",
                        border: "1px solid var(--vscode-panel-border)",
                        borderRadius: 6,
                        padding: "8px 12px",
                        marginTop: 8,
                        fontSize: "0.9em",
                        overflowX: "auto",
                    }}>
                        {`bal tool pull ${migrationToolCommandName ?? "migrate-mule"}`}
                    </pre>
                </div>
                <ButtonWrapper>
                    <Button appearance="secondary" onClick={onBack ?? onDone}>Back</Button>
                </ButtonWrapper>
            </>
        );
    }

    let headerText: string;
    let headerDesc: string;
    if (displayState.isSuccess) {
        headerText = "Dry Run Report Generated Successfully!";
        headerDesc = isMultiProject
            ? "Dry run for your multi-project integration is complete. Review the report and proceed to configure and start the migration."
            : "Dry run completed. Review the report and proceed to configure and start the migration.";
    } else if (displayState.isFailed) {
        headerText = "Dry Run Failed";
        headerDesc = "The dry run encountered errors and could not be completed.";
    } else {
        headerText = "Dry Run in Progress...";
        headerDesc = isMultiProject
            ? "Please wait while we perform the dry run for your multi-project integration."
            : "Please wait while we perform the dry run.";
    }

    return (
        <>
            <div>
                <Typography variant="h2">{headerText}</Typography>
                <BodyText>{headerDesc}</BodyText>
            </div>
            <StepWrapper>
                <MigrationStatusContent
                    state={displayState}
                    migrationState={migrationState}
                    migrationResponse={migrationResponse}
                    parsedReportData={parsedReportData}
                    onViewReport={handleViewReport}
                    onSaveReport={handleSaveReport}
                    isMultiProject={isMultiProject}
                />
            </StepWrapper>

            <MigrationLogs
                migrationLogs={migrationLogs}
                migrationCompleted={migrationCompleted}
                isLogsOpen={isLogsOpen}
                onToggleLogs={() => setIsLogsOpen(!isLogsOpen)}
                showHeader={!(migrationCompleted && !migrationSuccessful)}
            />

            <ButtonWrapper>
                <ActionButtons
                    primaryButton={{
                        text: "Configure Destination",
                        onClick: onNext,
                        disabled: !migrationCompleted || !migrationSuccessful,
                    }}
                    secondaryButton={{
                        text: "Done",
                        onClick: onDone,
                        disabled: false,
                    }}
                />
            </ButtonWrapper>
        </>
    );
}
