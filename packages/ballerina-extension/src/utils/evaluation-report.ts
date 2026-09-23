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

// `bal test` names reports `<UTC timestamp>_test_results.json`.
export function parseReportDate(fileName: string): Date | undefined {
    const match = fileName.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{3})/);
    if (!match) {
        return undefined;
    }
    const [year, month, day, hour, minute, second, ms] = match.slice(1).map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
}

// moduleStatus can be at top level or nested under packages[]
export function reportModuleStatus(report: any): any[] {
    return report?.packages
        ? report.packages.flatMap((pkg: any) => pkg.moduleStatus ?? [])
        : report?.moduleStatus ?? [];
}

export function reportTestNames(report: any): string[] {
    return reportModuleStatus(report).flatMap((status) => (status.tests ?? []).map((test: any) => test.name));
}
