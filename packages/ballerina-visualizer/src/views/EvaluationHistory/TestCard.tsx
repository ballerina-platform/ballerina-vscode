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

import React from "react";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { EvaluationRunDataPoint, EvaluationTestHistory } from "./types";
import { SparklineChart } from "./SparklineChart";
import { RunHistoryTable } from "./RunHistoryTable";
import { PassRatePill } from "../../components/PassRatePill";

const Card = styled.section`
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    margin: 0 24px;
    margin-bottom: 16px;
    overflow: hidden;
`;

const CardHeader = styled.div`
    padding: 14px 18px 10px;
`;

const CardTitleRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 4px;
`;

const TestName = styled.h2`
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-editor-font-family, monospace);
    margin: 0;
`;

const CardBadges = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const CardMeta = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
`;

const Trend = styled.span<{ direction: "up" | "down" | "flat" }>`
    font-size: 12px;
    font-weight: ${(p: { direction: "up" | "down" | "flat" }) => (p.direction === "flat" ? 400 : 600)};
    color: ${(p: { direction: "up" | "down" | "flat" }) => {
        switch (p.direction) {
            case "up":
                return "var(--vscode-editorGutter-addedBackground, #2ea043)";
            case "down":
                return "var(--vscode-editorGutter-deletedBackground, #f85149)";
            default:
                return "var(--vscode-descriptionForeground)";
        }
    }};
`;

const SparklineWrap = styled.div`
    display: flex;
    align-items: stretch;
    padding: 0 18px 4px;
    border-bottom: 1px solid var(--vscode-panel-border);
`;

const SparklineLabels = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    padding: 6px 8px 6px 0;
    white-space: nowrap;
    min-width: 60px;
    text-align: right;
`;

interface TestCardProps {
    history: EvaluationTestHistory;
    projectPath?: string;
}

export function TestCard({ history, projectPath }: TestCardProps) {
    const { rpcClient } = useRpcContext();

    if (!history.runs.length) {
        return (
            <Card>
                <CardHeader>
                    <CardTitleRow>
                        <TestName>{history.testName}</TestName>
                    </CardTitleRow>
                    <CardMeta>0 runs &middot; {history.projectName}</CardMeta>
                </CardHeader>
            </Card>
        );
    }

    const latest = history.runs[history.runs.length - 1];
    const isPassing = latest.passRate >= latest.targetPassRate;

    let trendElement: React.ReactNode = null;
    if (history.runs.length >= 2) {
        const prev = history.runs[history.runs.length - 2].passRate;
        const diff = latest.passRate - prev;
        if (Math.abs(diff) > 0.001) {
            const arrow = diff > 0 ? "\u2191" : "\u2193";
            const direction = diff > 0 ? "up" : "down";
            trendElement = (
                <Trend direction={direction}>
                    {arrow} {Math.abs(diff * 100).toFixed(0)}%
                </Trend>
            );
        } else {
            trendElement = (
                <Trend direction="flat">&rarr; stable</Trend>
            );
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitleRow>
                    <TestName>{history.testName}</TestName>
                    <CardBadges>
                        {trendElement}
                        <PassRatePill
                            passRate={latest.passRate}
                            minPassRate={latest.targetPassRate}
                            isPassing={isPassing}
                        />
                    </CardBadges>
                </CardTitleRow>
                <CardMeta>
                    {history.runs.length} run
                    {history.runs.length !== 1 ? "s" : ""} &middot;{" "}
                    {history.projectName}
                </CardMeta>
            </CardHeader>

            <SparklineWrap>
                <SparklineLabels>
                    <span>100%</span>
                    <span>0%</span>
                </SparklineLabels>
                <SparklineChart
                    runs={history.runs}
                    onDotClick={(run: EvaluationRunDataPoint) => {
                        if (run.jsonReportPath) {
                            rpcClient.getTestManagerRpcClient().openEvaluationReport({ reportPath: run.jsonReportPath });
                        }
                    }}
                />
            </SparklineWrap>

            <RunHistoryTable runs={history.runs} projectPath={projectPath} />
        </Card>
    );
}
