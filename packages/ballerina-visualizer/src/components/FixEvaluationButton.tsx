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

import { EvaluationRun } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Icon } from "@wso2/ui-toolkit";
import { submitPromptToCopilot } from "./AgentStatusOrb/copilotPanel";
import { outcomeLabel, toPercent } from "./PassRatePill";

const MAX_FAILED_ROWS = 10;

export interface FailedEvaluation {
    testName: string;
    projectName: string;
    passRate: number;
    minPassRate: number;
    failureMessage?: string;
    runs: EvaluationRun[];
    history?: { runs: number; passed: number };
}

function failedRows(runs: EvaluationRun[]): string[] {
    return runs
        .flatMap((run) => run.outcomes
            .filter((outcome) => !outcome.passed)
            .map((outcome) => `- run ${run.id}, ${outcomeLabel(outcome.id)}: ${outcome.errorMessage ?? "failed"}`))
        .slice(0, MAX_FAILED_ROWS);
}

function buildFixContext(evaluation: FailedEvaluation): string {
    const rows = failedRows(evaluation.runs);
    return [
        `The evaluation \`${evaluation.testName}\` in package \`${evaluation.projectName}\` failed with a pass rate ` +
            `of ${toPercent(evaluation.passRate)}; it needs ${toPercent(evaluation.minPassRate)}.`,
        evaluation.history && `It passed ${evaluation.history.passed} of its last ${evaluation.history.runs} runs.`,
        evaluation.failureMessage && `Failure: ${evaluation.failureMessage}`,
        rows.length > 0 && `Failed rows:\n${rows.join("\n")}`,
        `You MUST call invoke_skill with skillName="agent-evals" and follow its "Debugging a failing evaluation" section.`,
    ].filter(Boolean).join("\n\n");
}

export function FixEvaluationButton({ evaluation }: { evaluation: FailedEvaluation }) {
    const { rpcClient } = useRpcContext();

    const fix = () => {
        void submitPromptToCopilot(rpcClient, `Fix the failing evaluation ${evaluation.testName}`, {
            hiddenContext: buildFixContext(evaluation),
            newThread: true,
        });
    };

    return (
        <Button appearance="primary" tooltip="Ask Copilot why this evaluation fails and fix it" onClick={fix}>
            <Icon name="bi-ai-chat" sx={{ width: 14, height: 14, marginRight: 6 }} iconSx={{ fontSize: "14px" }} />
            Fix with Copilot
        </Button>
    );
}
