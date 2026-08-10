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

import React, { useEffect, useState } from "react";
import { AIMachineStateValue } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import styled from "@emotion/styled";
import AIChat from "./components/AIChat";
import { DisabledWindow } from "./DisabledSection";
import LoginPanel from "./LoginPanel";
import { LoadingRing } from "../../components/Loader";
import WaitingForLogin from "./WaitingForLoginSection";

const LoaderWrapper = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 50vh;
    width: 100vw;
`;

const ProgressRing = styled(VSCodeProgressRing)`
    height: 40px;
    width: 40px;
    margin-top: auto;
    padding: 4px;
`;

const AIPanel = (props: { state: AIMachineStateValue }) => {
    const { rpcClient } = useRpcContext();
    const [viewComponent, setViewComponent] = useState<React.ReactNode>();

    useEffect(() => {
        fetchContext();
    }, [props.state]);

    const renderUnknownState = (state: any) => {
        console.warn("Unknown AI Machine State:", state);
        return <h1>Unknown state: {JSON.stringify(state)}</h1>;
    };

    const fetchContext = () => {
        rpcClient
            .getAiPanelRpcClient()
            .getAIMachineSnapshot()
            .then((snapshot) => {
                console.log("AI Machine Snapshot:", snapshot);
                let component: React.ReactNode;

                if (typeof snapshot.state === "string") {
                    // Handle primary states
                    const primaryStateComponents = {
                        Initialize: <LoadingRing />,
                        Unauthenticated: <LoginPanel />,
                        Authenticated: <AIChat />,
                        Disabled: <DisabledWindow />,
                    };
                    component = primaryStateComponents[snapshot.state] || renderUnknownState(snapshot.state);
                } else if (typeof snapshot.state === "object" && snapshot.state.Authenticating) {
                    // Handle hierarchical Authenticating substates
                    const subState = snapshot.state.Authenticating;

                    if (subState === "determineFlow") {
                        component = <LoadingRing />;
                    } else if (["ssoFlow", "apiKeyFlow", "validatingApiKey", "awsBedrockFlow", "validatingAwsCredentials", "vertexAiFlow", "validatingVertexAiCredentials", "anthropicAwsFlow", "validatingAnthropicAwsCredentials", "awsUnifiedFlow"].includes(subState)) {
                        component = (
                            <WaitingForLogin
                                loginMethod={snapshot.context.loginMethod}
                                isValidating={subState === "validatingApiKey" || subState === "validatingAwsCredentials" || subState === "validatingVertexAiCredentials" || subState === "validatingAnthropicAwsCredentials"}
                                errorMessage={snapshot.context.errorMessage}
                            />
                        );
                    } else {
                        component = renderUnknownState(snapshot.state);
                    }
                } else {
                    component = renderUnknownState(snapshot.state);
                }

                setViewComponent(component);
            });
    };

    return (
        <div
            style={{
                height: "100%",
            }}
        >
            {!viewComponent ? (
                <LoaderWrapper>
                    <ProgressRing />
                </LoaderWrapper>
            ) : (
                <div style={{ height: "100%" }}>{viewComponent}</div>
            )}
        </div>
    );
};

export default AIPanel;
