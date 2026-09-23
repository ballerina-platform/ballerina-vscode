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
import { Evaluation } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, ProgressRing, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { PopupModal, PopupModalStep } from "../../../components/PopupModal";
import { RelativeLoader } from "../../../components/RelativeLoader";
import {
    CloseButton,
    HeaderTitleContainer,
    PopupContent,
    PopupFooter,
    PopupHeader,
    PopupSubtitle,
    PopupTitle,
} from "../Connection/styles";
import { EvaluationRunStatus, useAgentEvaluations } from "./useAgentEvaluations";

const POPUP_MAX_WIDTH = 720;
const LLM_JUDGE = "LLM_JUDGE";

const List = styled.div`
    display: flex;
    flex-direction: column;
`;

const Row = styled.div`
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 10px 4px;
    & + & {
        border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    }
`;

const RowIcon = styled.div`
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    background: ${ThemeColors.SURFACE_CONTAINER};
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const RowText = styled.div`
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const RowName = styled(Typography)`
    margin: 0;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
`;

const RowDescription = styled.div`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const StatusLabel = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const Message = styled(Typography)`
    margin: 0;
    padding: 24px 0;
    text-align: center;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const ErrorMessage = styled(Typography)`
    margin: 0;
    color: ${ThemeColors.ERROR};
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

interface RowActionProps {
    status?: EvaluationRunStatus;
    isBusy: boolean;
    onRun: () => void;
    onStop: () => void;
}

function RowAction({ status, isBusy, onRun, onStop }: RowActionProps) {
    if (status === "running") {
        return (
            <StatusLabel title="In the current run">
                <ProgressRing sx={{ width: 14, height: 14 }} />
                Running
                <Button appearance="icon" tooltip="Stop" onClick={onStop}>
                    <Codicon name="debug-stop" />
                </Button>
            </StatusLabel>
        );
    }
    if (status === "queued") {
        return (
            <StatusLabel title="Waits for the current run to finish">
                Queued
                <Button appearance="icon" tooltip="Remove from queue" onClick={onStop}>
                    <Codicon name="close" />
                </Button>
            </StatusLabel>
        );
    }
    if (status === "stopping") {
        return <StatusLabel title="Waiting for the run to stop">Stopping…</StatusLabel>;
    }
    return (
        <Button appearance="icon" tooltip={isBusy ? "Add to queue" : "Run"} onClick={onRun}>
            <Codicon name="play" />
        </Button>
    );
}

interface AgentEvaluationsPopupProps {
    projectPath: string;
    agentName: string;
    onClose: () => void;
}

export function AgentEvaluationsPopup({ projectPath, agentName, onClose }: AgentEvaluationsPopupProps) {
    const { rpcClient } = useRpcContext();
    const { evaluations, error, run, stop, statusOf, isBusy } = useAgentEvaluations(projectPath, agentName);

    const openHistory = () => rpcClient.getCommonRpcClient().executeCommand({
        commands: ["ballerina.openEvaluationHistory", projectPath]
    });

    const renderRow = (evaluation: Evaluation) => (
        <Row key={evaluation.functionName}>
            <RowIcon>
                <Codicon name={evaluation.template?.kind === LLM_JUDGE ? "law" : "beaker"} />
            </RowIcon>
            <RowText>
                <RowName variant="body2">{evaluation.functionName}</RowName>
                <RowDescription title={evaluation.template?.description}>
                    {evaluation.template?.description || "Custom evaluation"}
                </RowDescription>
            </RowText>
            <RowAction
                status={statusOf(evaluation.functionName)}
                isBusy={isBusy}
                onRun={() => run([evaluation.functionName])}
                onStop={() => stop([evaluation.functionName])}
            />
        </Row>
    );

    const renderContent = () => {
        if (error) {
            return <ErrorMessage variant="body2">{error}</ErrorMessage>;
        }
        if (!evaluations) {
            return <RelativeLoader />;
        }
        if (evaluations.length === 0) {
            return (
                <Message variant="body2">
                    No evaluations run {agentName} yet. Add one from the Testing view to see it here.
                </Message>
            );
        }
        return <List>{evaluations.map(renderRow)}</List>;
    };

    return (
        <PopupModal onClose={onClose} autoHeight maxWidth={POPUP_MAX_WIDTH} ariaLabelledBy="agent-evaluations-title">
            {(close) => (
                <PopupModalStep>
                    <PopupHeader>
                        <HeaderTitleContainer>
                            <PopupTitle variant="h2" id="agent-evaluations-title">Evaluations</PopupTitle>
                            <PopupSubtitle variant="body2">Evaluations that run {agentName}</PopupSubtitle>
                        </HeaderTitleContainer>
                        <HeaderActions>
                            {isBusy && (
                                <Button appearance="secondary" onClick={() => stop()}>
                                    <Codicon name="debug-stop" sx={{ marginRight: 4 }} />
                                    Stop all
                                </Button>
                            )}
                            {!isBusy && evaluations?.length > 0 && (
                                <Button
                                    appearance="secondary"
                                    onClick={() => run(evaluations.map((evaluation) => evaluation.functionName))}
                                >
                                    <Codicon name="play" sx={{ marginRight: 4 }} />
                                    Run all
                                </Button>
                            )}
                            <CloseButton appearance="icon" onClick={close}>
                                <Codicon name="close" />
                            </CloseButton>
                        </HeaderActions>
                    </PopupHeader>
                    <PopupContent>{renderContent()}</PopupContent>
                    <PopupFooter>
                        <Button appearance="secondary" onClick={openHistory}>
                            <Codicon name="history" sx={{ marginRight: 4 }} />
                            View history
                        </Button>
                    </PopupFooter>
                </PopupModalStep>
            )}
        </PopupModal>
    );
}

export default AgentEvaluationsPopup;
