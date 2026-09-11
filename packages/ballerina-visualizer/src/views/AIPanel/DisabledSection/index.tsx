/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { AIMachineEventType } from '@wso2/ballerina-core';
import { useRpcContext } from '@wso2/ballerina-rpc-client';

import { AlertBox } from "../AlertBox";

const Container = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 10px;
    gap: 8px;
`;

export const DisabledWindow = () => {
    const { rpcClient } = useRpcContext();

    const Retry = () => {
        rpcClient.sendAIStateEvent(AIMachineEventType.RETRY);
    };

    return (
        <Container>
            <AlertBox
                buttonTitle="Retry"
                onClick={Retry}
                subTitle={
                    "An error occurred while trying to establish a connection with the WSO2 Integrator Copilot server. Please click retry to try again."
                }
                title={"Error in establishing Connection"}
            />
        </Container>
    );
};
