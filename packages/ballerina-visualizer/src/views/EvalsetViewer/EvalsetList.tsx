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

import React, { useEffect, useState } from "react";
import { EvalsetItem, Evaluation } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Icon } from "@wso2/ui-toolkit";
import { TopNavigationBar } from "../../components/TopNavigationBar";
import { RelativeLoader } from "../../components/RelativeLoader";
import { isSameEvalset } from "../BI/AgentEvaluations/useAgentEvaluations";
import {
    CardIcon,
    Container,
    DeleteIconButton,
    EmptyState,
    PageHeader,
    PageWrapper,
    ThreadCard as EvalsetCard,
    ThreadListContainer as EvalsetGrid,
    ThreadMeta as EvalsetMeta,
    ThreadName as EvalsetName,
} from "./EvalsetViewer";

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const usageLabel = (users: string[]) =>
    users.length === 0 ? "Not used by any evaluation" : `Used by ${plural(users.length, "evaluation")}`;

export function EvalsetList({ projectPath }: { projectPath: string }) {
    const { rpcClient } = useRpcContext();
    const [evalsets, setEvalsets] = useState<EvalsetItem[]>();
    const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [loadCount, setLoadCount] = useState(0);
    const testManager = rpcClient.getTestManagerRpcClient();

    useEffect(() => {
        let active = true;
        rpcClient.getTestManagerRpcClient().getEvalsets({ projectPath }).then((response) => {
            if (active) {
                setEvalsets(response.evalsets);
            }
        });
        rpcClient.getTestManagerRpcClient().getEvaluations({ projectPath }).then((response) => {
            if (active) {
                setEvaluations(response.evaluations ?? []);
            }
        });
        return () => {
            active = false;
        };
    }, [rpcClient, projectPath, loadCount]);

    const reload = () => setLoadCount((count) => count + 1);

    const usersOf = (filePath: string) => evaluations
        .filter((evaluation) => isSameEvalset(evaluation.evalSetFile, filePath))
        .map((evaluation) => evaluation.functionName);

    const handleCreate = async () => {
        setIsCreating(true);
        await rpcClient.getCommonRpcClient().executeCommand({ commands: ["ballerina.createNewEvalset"] });
        setIsCreating(false);
        reload();
    };

    const handleOpen = (evalset: EvalsetItem) =>
        testManager.runEvalsetAction({ projectPath, filePath: evalset.filePath, action: "open" });

    const handleDelete = async (event: React.MouseEvent, evalset: EvalsetItem) => {
        event.stopPropagation();
        await testManager.runEvalsetAction({
            projectPath, filePath: evalset.filePath, action: "delete", usedBy: usersOf(evalset.filePath),
        });
        reload();
    };

    const renderEvalsets = () => {
        if (!evalsets) {
            return <RelativeLoader />;
        }
        if (evalsets.length === 0) {
            return (
                <EmptyState>
                    <div style={{ fontSize: "13px", fontWeight: 500 }}>No evalsets yet</div>
                    <div style={{ fontSize: "12px" }}>
                        Export a session from the trace view, or click "New Evalset" to start an empty one
                    </div>
                </EmptyState>
            );
        }
        return (
            <EvalsetGrid>
                {evalsets.map((evalset) => {
                    const users = usersOf(evalset.filePath);
                    return (
                        <EvalsetCard key={evalset.filePath} onClick={() => handleOpen(evalset)}>
                            <DeleteIconButton onClick={(event) => handleDelete(event, evalset)} title="Delete evalset">
                                <Icon name="bi-delete" iconSx={{ fontSize: "16px", display: "flex" }} sx={{ display: "flex", alignItems: "center", justifyContent: "center" }} />
                            </DeleteIconButton>
                            <EvalsetName><CardIcon name="collection" />{evalset.name}</EvalsetName>
                            <EvalsetMeta>
                                <div>{plural(evalset.threadCount, "thread")}</div>
                                <div title={users.join(", ")}>{usageLabel(users)}</div>
                            </EvalsetMeta>
                        </EvalsetCard>
                    );
                })}
            </EvalsetGrid>
        );
    };

    return (
        <PageWrapper>
            <TopNavigationBar projectPath={projectPath} />
            <Container>
                <PageHeader
                    title="Evalsets"
                    subtitle={evalsets ? plural(evalsets.length, "evalset") : "Loading…"}
                    onBack={() => rpcClient.getVisualizerRpcClient().goBack()}
                >
                    <Button onClick={handleCreate} disabled={isCreating} appearance="primary">
                        <Icon name="add" isCodicon sx={{ marginRight: "4px" }} />
                        New Evalset
                    </Button>
                </PageHeader>
                {renderEvalsets()}
            </Container>
        </PageWrapper>
    );
}
