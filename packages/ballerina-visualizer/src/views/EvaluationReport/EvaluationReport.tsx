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

import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon } from "@wso2/ui-toolkit";
import { EvaluationReportData } from "./types";
import { ReportSummaryBar } from "./ReportSummaryBar";
import { ReportTestCard } from "./ReportTestCard";

const Page = styled.div`
    font-family: var(
        --vscode-font-family,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif
    );
    font-size: var(--vscode-font-size, 13px);
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    height: 100vh;
    overflow-y: auto;
`;

const PageHeader = styled.header`
    padding: 24px 24px 0;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
`;

const PageTitleRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
`;

const PageTitle = styled.div`
    font-size: 20px;
    font-weight: 600;
    color: var(--vscode-editor-foreground);
`;

const PageSubtitle = styled.div`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const BackButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(
        --vscode-button-secondaryForeground,
        var(--vscode-editor-foreground)
    );
    cursor: pointer;
    white-space: nowrap;

    &:hover {
        background: var(
            --vscode-button-secondaryHoverBackground,
            var(--vscode-list-hoverBackground)
        );
    }
`;

const EmptyState = styled.div`
    text-align: center;
    padding: 64px 24px;
    color: var(--vscode-descriptionForeground);
`;

const EmptyTitle = styled.p`
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--vscode-editor-foreground);
`;

const EmptySub = styled.p`
    font-size: 13px;
`;


const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    width: 100%;
`;

const Loader = styled.div`
    width: 32px;
    aspect-ratio: 1;
    border-radius: 50%;
    border: 4px solid var(--vscode-button-background);
    animation: l20-1 0.8s infinite linear alternate,
        l20-2 1.6s infinite linear;

    @keyframes l20-1 {
        0% {
            clip-path: polygon(
                50% 50%,
                0 0,
                50% 0%,
                50% 0%,
                50% 0%,
                50% 0%,
                50% 0%
            );
        }
        12.5% {
            clip-path: polygon(
                50% 50%,
                0 0,
                50% 0%,
                100% 0%,
                100% 0%,
                100% 0%,
                100% 0%
            );
        }
        25% {
            clip-path: polygon(
                50% 50%,
                0 0,
                50% 0%,
                100% 0%,
                100% 100%,
                100% 100%,
                100% 100%
            );
        }
        50% {
            clip-path: polygon(
                50% 50%,
                0 0,
                50% 0%,
                100% 0%,
                100% 100%,
                50% 100%,
                0% 100%
            );
        }
        62.5% {
            clip-path: polygon(
                50% 50%,
                100% 0,
                100% 0%,
                100% 0%,
                100% 100%,
                50% 100%,
                0% 100%
            );
        }
        75% {
            clip-path: polygon(
                50% 50%,
                100% 100%,
                100% 100%,
                100% 100%,
                100% 100%,
                50% 100%,
                0% 100%
            );
        }
        100% {
            clip-path: polygon(
                50% 50%,
                50% 100%,
                50% 100%,
                50% 100%,
                50% 100%,
                50% 100%,
                0% 100%
            );
        }
    }

    @keyframes l20-2 {
        0% {
            transform: scaleY(1) rotate(0deg);
        }
        49.99% {
            transform: scaleY(1) rotate(135deg);
        }
        50% {
            transform: scaleY(-1) rotate(0deg);
        }
        100% {
            transform: scaleY(-1) rotate(-135deg);
        }
    }
`;

export function EvaluationReport() {
    const { rpcClient } = useRpcContext();
    const [data, setData] = useState<EvaluationReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reportPath, setReportPath] = useState("");

    const handleBackToHistory = () => {
        // Derive project path from report path: <projectPath>/tests/evaluation-reports/<file>.json
        const testsIdx = reportPath.lastIndexOf("/tests/evaluation-reports/");
        const backslashIdx = reportPath.lastIndexOf("\\tests\\evaluation-reports\\");
        const idx = Math.max(testsIdx, backslashIdx);
        const projectPath = idx > 0 ? reportPath.substring(0, idx) : undefined;

        const testNames = data?.moduleStatus.flatMap((mod) => mod.tests.map((test) => test.name)) ?? [];
        rpcClient
            .getCommonRpcClient()
            .executeCommand({
                commands: projectPath
                    ? ["ballerina.openEvaluationHistory", projectPath, { testNames }]
                    : ["ballerina.openEvaluationHistory"],
            });
    };

    useEffect(() => {
        const container = document.getElementById("webview-container");
        const rPath = container?.getAttribute("data-report-path") ?? "";
        setReportPath(rPath);

        rpcClient
            .getTestManagerRpcClient()
            .getEvaluationReport({ reportPath: rPath })
            .then((response) => {
                setData(response.data);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Failed to load evaluation report:", err);
                setError(err?.message || "Failed to load evaluation report");
                setData(null);
                setLoading(false);
            });
    }, []);


    if (loading) {
        return (
            <LoadingContainer>
                <Loader />
            </LoadingContainer>
        );
    }

    if (error || !data) {
        return (
            <EmptyState>
                <EmptyTitle>{error || "No report data available"}</EmptyTitle>
            </EmptyState>
        );
    }

    const evaluationTests = data.moduleStatus.flatMap((mod) =>
        mod.tests
            .filter((t) => t.isEvaluation)
            .map((t) => ({ test: t, moduleName: mod.name }))
    );

    return (
        <Page>
            <PageHeader>
                <PageTitleRow>
                    <PageTitle>Evaluation Report</PageTitle>
                    <BackButton onClick={handleBackToHistory}>
                        <Codicon name="history" />
                        Evaluation History
                    </BackButton>
                </PageTitleRow>
                <PageSubtitle>Project: {data.projectName}</PageSubtitle>
            </PageHeader>

            {evaluationTests.length > 0 ? (
                <>
                    <ReportSummaryBar data={data} />
                    {evaluationTests.map(({ test, moduleName }, i) => (
                        <ReportTestCard
                            key={i}
                            test={test}
                            moduleName={moduleName}
                        />
                    ))}
                </>
            ) : (
                <EmptyState>
                    <EmptyTitle>No evaluation results found</EmptyTitle>
                    <EmptySub>
                        This report does not contain any evaluation test
                        results.
                    </EmptySub>
                </EmptyState>
            )}
        </Page>
    );
}
