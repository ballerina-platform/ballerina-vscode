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

import styled from "@emotion/styled";

const Pill = styled.span<{ isPassing: boolean }>`
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 12px;
    white-space: nowrap;
    background: ${(p: { isPassing: boolean }) =>
        p.isPassing ? "rgba(76, 175, 80, 0.2)" : "rgba(244, 67, 54, 0.15)"};
    color: ${(p: { isPassing: boolean }) =>
        p.isPassing
            ? "var(--vscode-editorGutter-addedBackground, #2ea043)"
            : "var(--vscode-editorGutter-deletedBackground, #f85149)"};
    border: 1px solid
        ${(p: { isPassing: boolean }) =>
        p.isPassing
            ? "rgba(76, 175, 80, 0.4)"
            : "rgba(244, 67, 54, 0.4)"};
`;

const MinRate = styled.span`
    margin-left: 6px;
    font-weight: 400;
    color: var(--vscode-descriptionForeground);
`;

export const toPercent = (rate: number) => `${(rate * 100).toFixed(0)}%`;

// `bal test` names the rows of a `string[][]` data provider by index.
export const outcomeLabel = (id: string) => (/^\d+$/.test(id) ? `Query ${Number(id) + 1}` : id);

interface PassRatePillProps {
    passRate: number;
    minPassRate: number;
    isPassing: boolean;
    /** Summarises a history of runs by its most recent one. */
    latest?: boolean;
}

export function PassRatePill({ passRate, minPassRate, isPassing, latest }: PassRatePillProps) {
    const min = toPercent(minPassRate);
    const title = latest
        ? `Pass rate of the latest run. The evaluation passes at ${min} or higher.`
        : `Average pass rate across runs. The evaluation passes at ${min} or higher.`;
    return (
        <Pill isPassing={isPassing} title={title}>
            {latest ? "Latest pass rate" : "Pass rate"} {toPercent(passRate)}
            {!isPassing && <MinRate>· needs {min}</MinRate>}
        </Pill>
    );
}
