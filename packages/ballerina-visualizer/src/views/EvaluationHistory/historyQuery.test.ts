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
import { applyHistoryQuery, HistoryQuery } from "./historyQuery";
import { EvaluationTestHistory } from "./types";

const NOW = Date.parse("2026-09-25T12:00:00Z");
const HOUR = 60 * 60 * 1000;

const run = (hoursAgo: number, passRate: number, outcomes: { id: string; errorMessage?: string }[] = []) => ({
    date: new Date(NOW - hoursAgo * HOUR).toISOString(),
    passRate,
    targetPassRate: 0.8,
    status: passRate >= 0.8 ? "PASSED" as const : "FAILURE" as const,
    evaluationRuns: [{ id: 1, passRate, outcomes: outcomes.map((o) => ({ ...o, passed: !o.errorMessage })) }],
});

const history = (testName: string, runs: EvaluationTestHistory["runs"]): EvaluationTestHistory =>
    ({ testName, projectName: "MathTutor", runs });

const evaluation = (functionName: string, agent: string, label = "Clarity") =>
    ({ functionName, agents: [{ name: agent }], template: { label } }) as unknown as Evaluation;

const tests = [
    history("evalTutorClarity", [run(50, 1), run(30, 0), run(2, 1, [{ id: "0", errorMessage: "late penalty wrong" }])]),
    history("evalGradingTone", [run(100, 0), run(1, 0.5)]),
    history("oldDeletedEval", [run(3, 1)]),
];
const evaluations = new Map([
    ["evalTutorClarity", evaluation("evalTutorClarity", "mathTutorAgent")],
    ["evalGradingTone", evaluation("evalGradingTone", "gradingAgent", "Tone")],
]);
const query = (change: Partial<HistoryQuery> = {}): HistoryQuery =>
    ({ search: "", status: "all", includeDeleted: false, range: "all", sort: "name", ...change });
const names = (change: Partial<HistoryQuery>) =>
    applyHistoryQuery(tests, evaluations, query(change), NOW).visible.map((test) => test.testName);

describe("applyHistoryQuery", () => {
    it("hides deleted evaluations until they are included", () => {
        expect(names({})).toEqual(["evalGradingTone", "evalTutorClarity"]);
        expect(names({ includeDeleted: true })).toContain("oldDeletedEval");
    });

    it("keeps only the selected agents' evaluations", () => {
        expect(names({ agents: ["gradingAgent"] })).toEqual(["evalGradingTone"]);
    });

    it("drops runs outside the date range, and evaluations left without runs", () => {
        const view = applyHistoryQuery(tests, evaluations, query({ range: "24h" }), NOW);
        expect(view.visible.map((test) => [test.testName, test.runs.length])).toEqual([["evalGradingTone", 1], ["evalTutorClarity", 1]]);
    });

    it("finds evaluations by name, template, agent, row name or failure message", () => {
        expect(names({ search: "tone" })).toEqual(["evalGradingTone"]);
        expect(names({ search: "mathTutor" })).toEqual(["evalTutorClarity"]);
        expect(names({ search: "Query 1" })).toEqual(["evalTutorClarity"]);
        const view = applyHistoryQuery(tests, evaluations, query({ search: "late penalty" }), NOW);
        expect(view.visible.map((test) => test.testName)).toEqual(["evalTutorClarity"]);
        expect(view.rowMatches.get("evalTutorClarity")).toBe(1);
    });

    it("filters by the latest run's status and sorts by pass rate", () => {
        expect(names({ status: "failing" })).toEqual(["evalGradingTone"]);
        expect(names({ sort: "rate" })).toEqual(["evalGradingTone", "evalTutorClarity"]);
    });

    it("shows everything when discovery is unavailable", () => {
        const view = applyHistoryQuery(tests, undefined, query({ agents: ["gradingAgent"] }), NOW);
        expect(view.visible).toHaveLength(3);
        expect(view.deleted).toHaveLength(0);
    });
});
