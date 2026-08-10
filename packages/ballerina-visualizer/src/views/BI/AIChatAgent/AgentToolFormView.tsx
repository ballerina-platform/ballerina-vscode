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
import { NodePosition } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { View, ViewContent } from "@wso2/ui-toolkit";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { TitleBar } from "../../../components/TitleBar";
import { AgentToolForm } from "./AgentToolForm";

const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
    max-width: 600px;
    gap: 20px;
`;

interface AgentToolFormViewProps {
    projectPath: string;
    documentUri: string;
    functionName: string;
    position?: NodePosition;
    inClass: boolean;
}

export function AgentToolFormView(props: AgentToolFormViewProps) {
    const { projectPath, documentUri, functionName, position, inClass } = props;
    const { rpcClient } = useRpcContext();

    const lineRange = position
        ? {
              fileName: documentUri,
              startLine: { line: position.startLine, offset: position.startColumn },
              endLine: { line: position.endLine, offset: position.endColumn },
          }
        : undefined;

    const goBack = () => {
        rpcClient.getVisualizerRpcClient().goBack();
    };

    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar title="Agent Tool" subtitle="Build a tool that can be used by AI agents" />
            <ViewContent padding>
                <FormContainer>
                    <AgentToolForm
                        filePath={documentUri}
                        projectPath={projectPath}
                        editContext={{ functionName, inClass, lineRange: lineRange as any }}
                        nestedForm
                        onSave={goBack}
                        onBack={goBack}
                    />
                </FormContainer>
            </ViewContent>
        </View>
    );
}
