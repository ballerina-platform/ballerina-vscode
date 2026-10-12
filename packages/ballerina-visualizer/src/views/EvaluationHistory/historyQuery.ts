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

import { Evaluation } from "@wso2/ballerina-core";
import { EvaluationRunDataPoint, EvaluationTestHistory } from "./types";
import { outcomeLabel } from "../../components/PassRatePill";

export type HistoryStatus = "all" | "failing" | "passing";
export type HistoryRange = "24h" | "7d" | "30d" | "all";
export type HistorySort = "latest" | "rate" | "failures" | "name";

export interface HistoryQuery {
    search: string;
    status: HistoryStatus;
    /** Every agent when undefined. */
    agents?: string[];
    includeDeleted: boolean;
    range: HistoryRange;
    sort: HistorySort;
}

/** Evaluations in the code by function name; undefined while discovery is unavailable. */
export type EvaluationsByName = Map<string, Evaluation>;

export interface HistoryView {
    visible: EvaluationTestHistory[];
    deleted: EvaluationTestHistory[];
    agents: string[];
    /** Rows (queries or threads) whose name or failure message matches the search. */
    rowMatches: Map<string, number>;
}

const DAY = 24 * 60 * 60 * 1000;
const RANGE_MS: Record<HistoryRange, number> = { "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY, all: Infinity };

const latestRun = (test: EvaluationTestHistory): EvaluationRunDataPoint => test.runs[test.runs.length - 1];
const isPassing = (test: EvaluationTestHistory): boolean => latestRun(test).passRate >= latestRun(test).targetPassRate;
const failedRuns = (test: EvaluationTestHistory): number => test.runs.filter((run) => run.status !== "PASSED").length;

const STATUS_TESTS: Record<HistoryStatus, (test: EvaluationTestHistory) => boolean> = {
    all: () => true,
    failing: (test) => !isPassing(test),
    passing: isPassing,
};

const SORTS: Record<HistorySort, (a: EvaluationTestHistory, b: EvaluationTestHistory) => number> = {
    latest: (a, b) => Date.parse(latestRun(b).date) - Date.parse(latestRun(a).date),
    rate: (a, b) => latestRun(a).passRate - latestRun(b).passRate,
    failures: (a, b) => failedRuns(b) - failedRuns(a),
    name: (a, b) => a.testName.localeCompare(b.testName),
};

const withinRange = (tests: EvaluationTestHistory[], range: HistoryRange, now: number): EvaluationTestHistory[] =>
    tests
        .map((test) => ({ ...test, runs: test.runs.filter((run) => now - Date.parse(run.date) <= RANGE_MS[range]) }))
        .filter((test) => test.runs.length > 0);

const countRowMatches = (test: EvaluationTestHistory, needle: string): number => {
    const rows = test.runs.flatMap((run) => run.evaluationRuns.flatMap((evalRun) => evalRun.outcomes))
        .filter((outcome) => outcomeLabel(outcome.id).toLowerCase().includes(needle)
            || outcome.errorMessage?.toLowerCase().includes(needle));
    return new Set(rows.map((outcome) => outcome.id)).size;
};

const describes = (test: EvaluationTestHistory, evaluation: Evaluation | undefined, needle: string): boolean =>
    [test.testName, evaluation?.template?.label, ...(evaluation?.agents.map((agent) => agent.name) ?? [])]
        .some((text) => text?.toLowerCase().includes(needle));

export function applyHistoryQuery(tests: EvaluationTestHistory[], evaluations: EvaluationsByName | undefined,
    query: HistoryQuery, now = Date.now()): HistoryView {
    const inRange = withinRange(tests, query.range, now);
    const isDeleted = (test: EvaluationTestHistory) => !!evaluations && !evaluations.has(test.testName);
    const agentsOf = (test: EvaluationTestHistory) => evaluations?.get(test.testName)?.agents.map((agent) => agent.name) ?? [];
    const inAgentScope = (test: EvaluationTestHistory) => isDeleted(test)
        ? query.includeDeleted
        : !query.agents || !evaluations || agentsOf(test).some((agent) => query.agents.includes(agent));

    const needle = query.search.trim().toLowerCase();
    const rowMatches = new Map<string, number>();
    const matchesSearch = (test: EvaluationTestHistory) => {
        if (!needle || describes(test, evaluations?.get(test.testName), needle)) {
            return true;
        }
        const rows = countRowMatches(test, needle);
        rowMatches.set(test.testName, rows);
        return rows > 0;
    };

    return {
        // Remembered choices may name a status or sort that no longer exists.
        visible: inRange.filter(inAgentScope).filter(matchesSearch)
            .filter(STATUS_TESTS[query.status] ?? STATUS_TESTS.all)
            .sort(SORTS[query.sort] ?? SORTS.latest),
        deleted: inRange.filter(isDeleted),
        agents: [...new Set(inRange.flatMap(agentsOf))].sort(),
        rowMatches,
    };
}
