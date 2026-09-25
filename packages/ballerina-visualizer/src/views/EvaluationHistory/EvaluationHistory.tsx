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

import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Evaluation, EvaluationHistoryFilter, GetEvaluationsResponse } from "@wso2/ballerina-core";
import { EvaluationHistoryData, EvaluationTestHistory } from "./types";
import { SummaryBar } from "./SummaryBar";
import { TestCard } from "./TestCard";
import { HistoryToolbar } from "./HistoryToolbar";
import { applyHistoryQuery, EvaluationsByName, HistoryQuery } from "./historyQuery";

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
    padding-bottom: 12px;
`;

const PageHeader = styled.header`
    padding: 24px 24px 0;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
`;

const PageTitle = styled.div`
    font-size: 20px;
    font-weight: 600;
    color: var(--vscode-editor-foreground);
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
`;

const PageSubtitle = styled.div`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
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

const DEFAULT_QUERY: HistoryQuery = { search: "", status: "all", includeDeleted: false, range: "all", sort: "latest" };
// Cleared after opening, so later re-renders don't scroll back to the card.
const FOCUS_MS = 5000;

type RememberedQuery = Pick<HistoryQuery, "status" | "range" | "sort">;

const readFilter = (container: HTMLElement | null): EvaluationHistoryFilter => {
    try {
        return JSON.parse(container?.getAttribute("data-filter") || "{}");
    } catch {
        return {};
    }
};

const storageKey = (projectPath: string) => `evaluation-history:${projectPath}`;

const readRemembered = (projectPath: string): Partial<RememberedQuery> => {
    try {
        return JSON.parse(localStorage.getItem(storageKey(projectPath)) || "{}");
    } catch {
        return {};
    }
};

const remember = (projectPath: string, { status, range, sort }: HistoryQuery) => {
    try {
        localStorage.setItem(storageKey(projectPath), JSON.stringify({ status, range, sort }));
    } catch { /* the choices simply are not kept */ }
};

const toEvaluationsByName = (evaluations: Evaluation[]): EvaluationsByName =>
    new Map(evaluations.map((evaluation) => [evaluation.functionName, evaluation]));

const initialQuery = (filter: EvaluationHistoryFilter, evaluations: EvaluationsByName,
    remembered: Partial<RememberedQuery>): HistoryQuery => {
    const names = [...(filter.testNames ?? []), ...(filter.focus ? [filter.focus] : [])];
    const agents = [...(filter.agents ?? []),
        ...names.flatMap((name) => evaluations.get(name)?.agents.map((agent) => agent.name) ?? [])];
    return {
        ...DEFAULT_QUERY,
        ...remembered,
        ...(filter.focus ? { status: "all", range: "all" } : {}),
        agents: agents.length > 0 ? [...new Set(agents)] : undefined,
        includeDeleted: names.some((name) => !evaluations.has(name)),
    };
};

const countRuns = (tests: EvaluationTestHistory[]): number =>
    new Set(tests.flatMap((test) => test.runs.map((run) => run.jsonReportPath ?? run.date))).size;

export function EvaluationHistory() {
    const { rpcClient } = useRpcContext();
    const [data, setData] = useState<EvaluationHistoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [projectPath, setProjectPath] = useState("");
    const [evaluations, setEvaluations] = useState<EvaluationsByName>();
    const [query, setQuery] = useState<HistoryQuery>(DEFAULT_QUERY);
    const [focus, setFocus] = useState<string>();
    const filterAppliedRef = useRef(false);

    useEffect(() => {
        const container = document.getElementById("webview-container");
        const resolvedProjectPath = container?.getAttribute("data-project-path") ?? "";
        const filter = readFilter(container);
        setProjectPath(resolvedProjectPath);
        setFocus(filter.focus);
        setQuery({ ...DEFAULT_QUERY, ...readRemembered(resolvedProjectPath) });

        let cancelled = false;
        let latestFetchId = 0;
        const applyDiscovery = (discovered?: Evaluation[]) => {
            const byName = discovered && toEvaluationsByName(discovered);
            setEvaluations(byName);
            if (byName && !filterAppliedRef.current) {
                filterAppliedRef.current = true;
                setQuery(initialQuery(filter, byName, readRemembered(resolvedProjectPath)));
            }
        };
        const fetchHistory = (isInitial: boolean) => {
            const fetchId = ++latestFetchId;
            const testManager = rpcClient.getTestManagerRpcClient();
            Promise.all([
                testManager.getEvaluationHistory({ projectPath: resolvedProjectPath }),
                testManager.getEvaluations({ projectPath: resolvedProjectPath })
                    .catch((): GetEvaluationsResponse | undefined => undefined),
            ])
                .then(([response, discovery]) => {
                    if (cancelled || fetchId !== latestFetchId) { return; }
                    applyDiscovery(discovery && !discovery.errorMsg ? discovery.evaluations : undefined);
                    setData(response.data);
                    setLoading(false);
                })
                .catch(() => {
                    if (cancelled || fetchId !== latestFetchId) { return; }
                    if (isInitial) {
                        setData({ tests: [], totalRunFiles: 0, projectNames: [] });
                    }
                    setLoading(false);
                });
        };

        fetchHistory(true);
        const unsubscribe = rpcClient.onEvaluationHistoryUpdated(() => fetchHistory(false));
        const clearFocus = setTimeout(() => setFocus(undefined), FOCUS_MS);

        return () => {
            cancelled = true;
            unsubscribe();
            clearTimeout(clearFocus);
        };
    }, []);

    const view = useMemo(() => applyHistoryQuery(data?.tests ?? [], evaluations, query), [data, evaluations, query]);

    const changeQuery = (next: HistoryQuery) => {
        setQuery(next);
        remember(projectPath, next);
    };

    if (loading) {
        return (
            <LoadingContainer>
                <Loader />
            </LoadingContainer>
        );
    }

    if (!data) return null;

    const projectLabel = data.projectNames.join(", ") || "Unknown";
    const deletedNames = new Set(view.deleted.map((test) => test.testName));
    const deleteHistory = (testNames: string[], reportPaths?: string[]) =>
        rpcClient.getTestManagerRpcClient().deleteEvaluationHistory({ projectPath, testNames, reportPaths });

    return (
        <Page>
            <PageHeader>
                <PageTitle>Evaluation History</PageTitle>
                <PageSubtitle>Project: {projectLabel}</PageSubtitle>
            </PageHeader>

            {data.tests.length > 0 ? (
                <>
                    <HistoryToolbar
                        query={query}
                        onChange={changeQuery}
                        agents={view.agents}
                        deletedCount={view.deleted.length}
                        onDeleteDeletedHistory={() => deleteHistory([...deletedNames])}
                    />
                    <SummaryBar data={{ ...data, tests: view.visible, totalRunFiles: countRuns(view.visible) }} />
                    {view.visible.map((test) => (
                        <TestCard
                            key={test.testName}
                            history={test}
                            projectPath={projectPath}
                            deleted={deletedNames.has(test.testName)}
                            focused={focus === test.testName}
                            rowMatches={view.rowMatches.get(test.testName)}
                            onDeleteHistory={(reportPaths) => deleteHistory([test.testName], reportPaths)}
                        />
                    ))}
                    {view.visible.length === 0 && (
                        <EmptyState>
                            <EmptyTitle>No evaluations match these filters</EmptyTitle>
                            <EmptySub>Try another search, status, agent or date range.</EmptySub>
                        </EmptyState>
                    )}
                </>
            ) : (
                <EmptyState>
                    <EmptyTitle>No evaluation results found</EmptyTitle>
                    <EmptySub>
                        Run an evaluation test to see history here.
                    </EmptySub>
                </EmptyState>
            )}
        </Page>
    );
}
