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

import { removeReportTests, reportHtmlPath } from '../utils/evaluation-report';

const test = (name: string, status: string) => ({ name, status });

describe('removeReportTests', () => {
    it('drops the tests and recounts a single-package report', () => {
        const report = {
            totalTests: 3, passed: 1, failed: 1, skipped: 1,
            moduleStatus: [{
                name: 'math', totalTests: 3, passed: 1, failed: 1, skipped: 1,
                tests: [test('a', 'PASSED'), test('b', 'FAILURE'), test('c', 'SKIPPED')],
            }],
        };

        expect(removeReportTests(report, new Set(['b']))).toBe(true);
        expect(report.moduleStatus[0].tests.map((t) => t.name)).toEqual(['a', 'c']);
        expect(report).toMatchObject({ totalTests: 2, passed: 1, failed: 0, skipped: 1 });
        expect(report.moduleStatus[0]).toMatchObject({ totalTests: 2, passed: 1, failed: 0, skipped: 1 });
    });

    it('recounts every package and the workspace total', () => {
        const report = {
            totalTests: 3, passed: 2, failed: 1, skipped: 0,
            packages: [
                { totalTests: 2, passed: 1, failed: 1, skipped: 0,
                    moduleStatus: [{ tests: [test('a', 'PASSED'), test('b', 'FAILURE')] }] },
                { totalTests: 1, passed: 1, failed: 0, skipped: 0, moduleStatus: [{ tests: [test('c', 'PASSED')] }] },
            ],
        };

        expect(removeReportTests(report, new Set(['b']))).toBe(true);
        expect(report).toMatchObject({ totalTests: 2, passed: 2, failed: 0 });
        expect(report.packages[0]).toMatchObject({ totalTests: 1, passed: 1, failed: 0 });
        expect(report.packages[1]).toMatchObject({ totalTests: 1, passed: 1, failed: 0 });
    });

    it('reports when no test is left', () => {
        const report = { moduleStatus: [{ tests: [test('a', 'FAILURE')] }] };

        expect(removeReportTests(report, new Set(['a']))).toBe(false);
    });
});

describe('reportHtmlPath', () => {
    it('names the HTML report of a run', () => {
        expect(reportHtmlPath('/p/tests/evaluation-reports/2026-09-24_06-38-27-258_test_results.json'))
            .toBe('/p/tests/evaluation-reports/2026-09-24_06-38-27-258_index.html');
    });
});
