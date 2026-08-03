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

import { ImportIntegrationResponse } from "@wso2/ballerina-core";
import { ProgressRing, Typography } from "@wso2/ui-toolkit";
import React from "react";
import { MigrationDisplayState, MigrationReportJSON } from "../types";
import { CoverageSummary } from "./CoverageSummary";
import { ReportButtons } from "./ReportButtons";
import styled from "@emotion/styled";

const StatusRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--wso2-brand-accent) 20%, var(--vscode-widget-border));
    background: color-mix(in srgb, var(--wso2-brand-accent) 6%, transparent);
    padding: 10px 12px;
`;

const StatusText = styled.span`
    color: var(--vscode-foreground);
`;

const ErrorBanner = styled(Typography)`
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--vscode-errorForeground) 30%, transparent);
    background: color-mix(in srgb, var(--vscode-errorForeground) 10%, transparent);
    padding: 10px 12px;
`;

interface MigrationStatusContentProps {
    state: MigrationDisplayState;
    migrationState: string | null;
    migrationResponse: ImportIntegrationResponse | null;
    parsedReportData: MigrationReportJSON | null;
    onViewReport: () => void;
    onSaveReport: () => void;
    isMultiProject?: boolean;
}

export const MigrationStatusContent: React.FC<MigrationStatusContentProps> = ({
    state,
    migrationState,
    migrationResponse,
    parsedReportData,
    onViewReport,
    onSaveReport,
    isMultiProject = false
}) => {
    if (state.isInProgress) {
        return (
            <StatusRow>
                <ProgressRing sx={{ width: 14, height: 14 }} color="var(--vscode-foreground)" />
                <StatusText>
                    {migrationState || "Starting migration..."}
                </StatusText>
            </StatusRow>
        );
    }

    if (state.isFailed) {
        return (
            <ErrorBanner variant="body3" sx={{ color: "var(--vscode-errorForeground)" }}>
                Migration error: {migrationResponse?.error ?? 'An unknown error occurred'}
            </ErrorBanner>
        );
    }

    if (state.isSuccess) {
        if (state.hasReportData && parsedReportData) {
            return (
                <CoverageSummary
                    reportData={parsedReportData}
                    onViewReport={onViewReport}
                    onSaveReport={onSaveReport}
                    isMultiProject={isMultiProject}
                />
            );
        } else {
            return (
                <>
                    {migrationResponse?.report && (
                        <ReportButtons onViewReport={onViewReport} onSaveReport={onSaveReport} isMultiProject={isMultiProject} />
                    )}
                </>
            );
        }
    }

    return null;
};
