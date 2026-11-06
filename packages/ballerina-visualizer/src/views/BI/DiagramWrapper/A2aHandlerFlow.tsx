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

import { useMemo } from "react";
import styled from "@emotion/styled";
import { Button } from "@wso2/ui-toolkit";
import { EVENT_TYPE } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Diagram } from "@wso2/bi-diagram";
import { handlerFlow, handlerSummary } from "./a2aHandlerSteps";

const OPERATIONS: Record<string, { title: string; description: string }> = {
    handleSubscribeToTask: { title: "Subscribe to task", description: "A caller reconnects to the live updates of a running task." },
    handleGetTask: { title: "Get task", description: "A caller reads the current state of a task." },
    handleListTasks: { title: "List tasks", description: "A caller lists the tasks it may see." },
    handleCancelTask: { title: "Cancel task", description: "A caller asks to stop a running task." },
    handleCreateTaskPushNotificationConfig: { title: "Create push notification config", description: "A caller registers a webhook for a task's updates." },
    handleGetTaskPushNotificationConfig: { title: "Get push notification config", description: "A caller reads one webhook registered for a task." },
    handleListTaskPushNotificationConfigs: { title: "List push notification configs", description: "A caller lists the webhooks registered for a task." },
    handleDeleteTaskPushNotificationConfig: { title: "Delete push notification config", description: "A caller removes a webhook registered for a task." },
    handleGetExtendedAgentCard: { title: "Get extended agent card", description: "An authenticated caller reads the richer card." },
};

const Bar = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--vscode-editorWidget-border);
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const Stack = styled.div`
    display: flex;
    flex-direction: column;
    height: calc(100vh - 150px);
`;

const DiagramBox = styled.div`
    flex: 1;
    min-height: 0;
    pointer-events: auto;
`;

const Mono = styled.span`
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    overflow-wrap: anywhere;
`;

interface A2aHandlerFlowProps {
    accessor: string;
    path: string;
    handlerMethod: string;
    onBack: () => void;
}

export function A2aHandlerFlow(props: A2aHandlerFlowProps) {
    const { accessor, path, handlerMethod, onBack } = props;
    const { rpcClient } = useRpcContext();
    const described = OPERATIONS[handlerMethod];
    const flow = useMemo(() => handlerFlow(handlerMethod, accessor, path), [handlerMethod, accessor, path]);

    if (!flow) {
        return null;
    }

    return (
        <Stack>
            <Bar>
                <Button appearance="secondary" onClick={onBack} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>Back to the resource</Button>
                <span>
                    <b>{described?.title ?? handlerMethod}.</b> {handlerSummary(handlerMethod)}{" "}
                    These are the default handler's steps from the <Mono>ballerina/a2a</Mono> library, read-only.
                </span>
            </Bar>
            <DiagramBox>
                <Diagram
                    model={flow}
                    readOnly={true}
                    openView={(location) => rpcClient.getVisualizerRpcClient().openView({
                        type: EVENT_TYPE.OPEN_VIEW,
                        location,
                    })}
                />
            </DiagramBox>
        </Stack>
    );
}

export default A2aHandlerFlow;
