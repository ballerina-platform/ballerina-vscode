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

import { useEffect, useMemo, useState } from "react";
import { EvalsetItem, Evaluation, EvaluationAction, EvaluationRunState } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

export type EvaluationRunStatus = "running" | "queued" | "stopping";

// A stopping evaluation that is run again shows as queued, since that is what happens next.
const STATUS_PRECEDENCE: EvaluationRunStatus[] = ["running", "queued", "stopping"];

const normalizeEvalsetPath = (filePath: string) => filePath.replace(/\\/g, "/").replace(/^\.\//, "");

export const isSameEvalset = (filePath?: string, other?: string) =>
    Boolean(filePath && other) && normalizeEvalsetPath(filePath) === normalizeEvalsetPath(other);

export function useAgentEvaluations(projectPath: string, agentName: string) {
    const { rpcClient } = useRpcContext();
    const [allEvaluations, setAllEvaluations] = useState<Evaluation[]>();
    const [evalsets, setEvalsets] = useState<EvalsetItem[]>();
    const [error, setError] = useState<string>();
    const [runState, setRunState] = useState<EvaluationRunState>({ projectPath, running: [], queued: [], stopping: [] });
    const [loadCount, setLoadCount] = useState(0);

    useEffect(() => {
        let active = true;
        rpcClient.getTestManagerRpcClient().getEvaluations({ projectPath }).then((response) => {
            if (!active) {
                return;
            }
            setAllEvaluations(response.evaluations);
            setError(response.errorMsg);
        });
        rpcClient.getTestManagerRpcClient().getEvalsets({ projectPath }).then((response) => {
            if (active) {
                setEvalsets(response.evalsets);
            }
        });
        return () => {
            active = false;
        };
    }, [rpcClient, projectPath, loadCount]);

    const evaluations = useMemo(() => allEvaluations?.filter((evaluation) =>
        evaluation.agents.some((agent) => agent.name === agentName)), [allEvaluations, agentName]);

    useEffect(() => {
        rpcClient.getTestManagerRpcClient().getEvaluationRunState({ projectPath }).then(setRunState);
        return rpcClient.onEvaluationRunStateChanged((state) => {
            if (state.projectPath === projectPath) {
                setRunState(state);
            }
        });
    }, [rpcClient, projectPath]);

    const testManager = rpcClient.getTestManagerRpcClient();
    const run = (functionNames: string[]) => testManager.runEvaluations({ projectPath, functionNames });
    const stop = (functionNames?: string[]) => testManager.stopEvaluations({ projectPath, functionNames });

    const statusOf = (functionName: string) =>
        STATUS_PRECEDENCE.find((status) => runState[status].includes(functionName));
    const isBusy = STATUS_PRECEDENCE.some((status) => runState[status].length > 0);

    const reload = () => setLoadCount((count) => count + 1);

    const runAction = async (functionName: string, action: EvaluationAction) => {
        await testManager.runEvaluationAction({ projectPath, functionName, action });
        if (action === "delete") {
            reload();
        }
    };

    const evalsetOf = (evaluation: Evaluation) =>
        evalsets?.find((evalset) => isSameEvalset(evalset.filePath, evaluation.evalSetFile));
    const openEvalset = (filePath: string) => testManager.runEvalsetAction({ projectPath, filePath, action: "open" });

    return {
        evaluations, error, run, stop, statusOf, isBusy, reload, runAction, evalsetOf, openEvalset,
    };
}
