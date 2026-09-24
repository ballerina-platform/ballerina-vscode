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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { EvaluationOutcomeResult, EvaluationReportTestResult, EvaluationRun } from "./types";
import { Codicon } from "@wso2/ui-toolkit";
import { RunPassRateChart } from "./RunPassRateChart";
import { PassRatePill, toPercent } from "../../components/PassRatePill";

// Without minPassRate, `bal test` reports a plain test that must pass on its one run.
const PLAIN_TEST_MIN_PASS_RATE = 1;

// ── Card shell ──────────────────────────────────────────────────────────────

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

const StatusChip = styled.span<{ isPassed: boolean }>`
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
    background: ${(p: { isPassed: boolean }) =>
        p.isPassed ? "rgba(76, 175, 80, 0.2)" : "rgba(244, 67, 54, 0.15)"};
    color: ${(p: { isPassed: boolean }) =>
        p.isPassed
            ? "var(--vscode-editorGutter-addedBackground, #2ea043)"
            : "var(--vscode-editorGutter-deletedBackground, #f85149)"};
`;

// ── Stats bar (inside card header) ──────────────────────────────────────────

const StatsRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--vscode-panel-border);
`;

const StatItem = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 20px;
    gap: 2px;
`;

const StatValue = styled.span`
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
    color: var(--vscode-editor-foreground);
`;

const StatLabel = styled.span`
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    white-space: nowrap;
`;

const StatDivider = styled.div`
    width: 1px;
    height: 28px;
    background: var(--vscode-panel-border);
`;

const ChartSection = styled.div`
    padding: 14px 18px;
    border-top: 1px solid var(--vscode-panel-border);
`;

const ChartTitle = styled.h3`
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-editor-foreground);
    margin: 0 0 10px 0;
`;

// ── Failure summary section ─────────────────────────────────────────────────

const FailureSummarySection = styled.div`
    padding: 14px 18px;
    border-top: 1px solid var(--vscode-panel-border);
`;

const SectionTitle = styled.h3`
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-editor-foreground);
    margin: 0 0 10px 0;
`;

const FailureSummaryBlock = styled.div`
    padding: 8px 12px;
    background: rgba(244, 67, 54, 0.08);
    border-left: 3px solid var(--vscode-editorGutter-deletedBackground, #f85149);
    border-radius: 0 4px 4px 0;
    font-size: 12px;
    color: var(--vscode-editorGutter-deletedBackground, #f85149);
`;

// ── Evaluation runs section ─────────────────────────────────────────────────

const RunsSection = styled.div`
    padding: 14px 18px;
    border-top: 1px solid var(--vscode-panel-border);
`;

const RunSubheader = styled.div`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
`;

// ── Outcome list (vertical) ─────────────────────────────────────────────────

const OutcomeList = styled.div`
    display: flex;
    flex-direction: column;
`;

const OutcomeRow = styled.div<{ clickable: boolean }>`
    display: flex;
    align-items: center;
    padding: 8px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    cursor: ${(p: { clickable: boolean }) => (p.clickable ? "pointer" : "default")};

    &:last-child {
        border-bottom: none;
    }

    &:hover {
        background: ${(p: { clickable: boolean }) =>
        p.clickable ? "var(--vscode-list-hoverBackground)" : "transparent"};
    }
`;

const OutcomeIcon = styled.span<{ passed: boolean }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    font-size: 11px;
    flex-shrink: 0;
    margin-right: 10px;
    background: ${(p: { passed: boolean }) =>
        p.passed ? "rgba(76, 175, 80, 0.2)" : "rgba(244, 67, 54, 0.15)"};
    color: ${(p: { passed: boolean }) =>
        p.passed
            ? "var(--vscode-editorGutter-addedBackground, #2ea043)"
            : "var(--vscode-editorGutter-deletedBackground, #f85149)"};
`;

const OutcomeName = styled.span`
    flex: 1;
    font-size: 13px;
    color: var(--vscode-editor-foreground);
`;

const OutcomeStatus = styled.span<{ passed: boolean }>`
    font-size: 11px;
    font-weight: 600;
    margin-left: 12px;
    white-space: nowrap;
    color: ${(p: { passed: boolean }) =>
        p.passed
            ? "var(--vscode-editorGutter-addedBackground, #2ea043)"
            : "var(--vscode-editorGutter-deletedBackground, #f85149)"};
`;

const ExpandArrow = styled.span<{ expanded: boolean }>`
    font-size: 10px;
    margin-left: 6px;
    color: var(--vscode-descriptionForeground);
    transition: transform 0.15s;
    transform: rotate(${(p: { expanded: boolean }) => (p.expanded ? "180deg" : "0deg")});
`;

const OutcomeErrorBlock = styled.div`
    padding: 8px 12px 8px 38px;
    background: rgba(244, 67, 54, 0.06);
    font-size: 12px;
    color: var(--vscode-editorGutter-deletedBackground, #f85149);
    border-bottom: 1px solid var(--vscode-panel-border);
`;

// ── Component ───────────────────────────────────────────────────────────────

interface ReportTestCardProps {
    test: EvaluationReportTestResult;
    moduleName: string;
}

export function ReportTestCard({ test, moduleName }: ReportTestCardProps) {
    const evalSummary = test.evaluationSummary;
    const isPassing = test.status === "PASSED";

    const passRate = evalSummary ? evalSummary.observedPassRate : (isPassing ? 1 : 0);
    const minPassRate = evalSummary ? evalSummary.targetPassRate : PLAIN_TEST_MIN_PASS_RATE;
    const totalRuns = evalSummary ? evalSummary.evaluationRuns.length : 1;

    return (
        <Card>
            {/* Header: test name, status, stats */}
            <CardHeader>
                <CardTitleRow>
                    <TestName>{test.name}</TestName>
                    <CardBadges>
                        <StatusChip isPassed={isPassing}>
                            {isPassing ? "Passed" : "Failed"}
                        </StatusChip>
                        <PassRatePill passRate={passRate} minPassRate={minPassRate} isPassing={isPassing} />
                    </CardBadges>
                </CardTitleRow>
                <CardMeta>{moduleName}</CardMeta>

                <StatsRow>
                    <StatItem>
                        <StatValue>{totalRuns}</StatValue>
                        <StatLabel>Total Runs</StatLabel>
                    </StatItem>
                    <StatDivider />
                    <StatItem>
                        <StatValue>{toPercent(passRate)}</StatValue>
                        <StatLabel>Pass Rate</StatLabel>
                    </StatItem>
                    <StatDivider />
                    <StatItem>
                        <StatValue>{toPercent(minPassRate)}</StatValue>
                        <StatLabel>Min Pass Rate</StatLabel>
                    </StatItem>
                </StatsRow>
            </CardHeader>

            {/* Pass rate chart (only when more than 1 run) */}
            {evalSummary && evalSummary.evaluationRuns.length > 1 && (
                <ChartSection>
                    <ChartTitle>Pass Rate by Run</ChartTitle>
                    <RunPassRateChart
                        runs={evalSummary.evaluationRuns}
                        targetPassRate={evalSummary.targetPassRate}
                    />
                </ChartSection>
            )}

            {/* Failure summary (only when test failed) */}
            {test.failureMessage && (
                <FailureSummarySection>
                    <SectionTitle>Failure Summary</SectionTitle>
                    <FailureSummaryBlock>
                        {test.failureMessage}
                    </FailureSummaryBlock>
                </FailureSummarySection>
            )}

            {/* Evaluation runs with vertical outcome list */}
            {evalSummary && evalSummary.evaluationRuns.length > 0 && (
                <RunsSection>
                    <SectionTitle>Evaluation Runs</SectionTitle>
                    {evalSummary.evaluationRuns.map((run) => (
                        <EvalRunBlock key={run.id} run={run} />
                    ))}
                </RunsSection>
            )}
        </Card>
    );
}

const hasErrorDetails = (outcome: EvaluationOutcomeResult) => !outcome.passed && !!outcome.errorMessage;

function EvalRunBlock({ run }: { run: EvaluationRun }) {
    const [expandedErrors, setExpandedErrors] = useState<Set<string>>(
        () => new Set(run.outcomes.filter(hasErrorDetails).map((outcome) => outcome.id))
    );

    const toggleError = (id: string) => {
        setExpandedErrors((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    return (
        <>
            <RunSubheader>
                Run {run.id} ({(run.passRate * 100).toFixed(0)}% pass rate)
            </RunSubheader>
            <OutcomeList>
                {run.outcomes.map((outcome) => {
                    const hasError = hasErrorDetails(outcome);
                    const isExpanded = expandedErrors.has(outcome.id);

                    return (
                        <React.Fragment key={outcome.id}>
                            <OutcomeRow
                                clickable={hasError}
                                onClick={hasError ? () => toggleError(outcome.id) : undefined}
                            >
                                <OutcomeIcon passed={outcome.passed}>
                                    {outcome.passed ? "\u2713" : "\u2717"}
                                </OutcomeIcon>
                                <OutcomeName>{outcome.id}</OutcomeName>
                                <OutcomeStatus passed={outcome.passed}>
                                    {outcome.passed ? "PASSED" : "FAILED"}
                                </OutcomeStatus>
                                {hasError && (
                                    <ExpandArrow expanded={isExpanded}>
                                        <Codicon name="chevron-down" />
                                    </ExpandArrow>
                                )}
                            </OutcomeRow>
                            {isExpanded && outcome.errorMessage && (
                                <OutcomeErrorBlock>
                                    {outcome.errorMessage}
                                </OutcomeErrorBlock>
                            )}
                        </React.Fragment>
                    );
                })}
            </OutcomeList>
        </>
    );
}
