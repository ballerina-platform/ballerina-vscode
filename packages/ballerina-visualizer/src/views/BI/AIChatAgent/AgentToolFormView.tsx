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

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { FlowNode, NodePosition } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ViewContent } from "@wso2/ui-toolkit";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { AssistView, TitleBar } from "../../../components/TitleBar";
import { AgentToolForm } from "./AgentToolForm";
import { AgentScopeProvider, scopeOf } from "./agentScope";

const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
    max-width: 600px;
    gap: 20px;
`;

interface AgentToolFormViewProps {
    projectPath: string;
    documentUri?: string;
    functionName?: string;
    position?: NodePosition;
    inClass: boolean;
    // The agent the page was opened from; a tool shared by several agents gets that one's context.
    agent?: FlowNode;
}

export function AgentToolFormView(props: AgentToolFormViewProps) {
    const { projectPath, documentUri, functionName, inClass, agent } = props;
    const { rpcClient } = useRpcContext();
    const [filePath, setFilePath] = useState(documentUri);
    const [position, setPosition] = useState(props.position);
    const [loads, setLoads] = useState(0);
    const handedOffRef = useRef(false);

    // Once Copilot takes a request into the project, the form reloads the tool from source until it is edited here again.
    useEffect(() => functionName ? rpcClient.onProjectContentUpdated(async () => {
        if (!handedOffRef.current) {
            return;
        }
        const response = await rpcClient.getBIDiagramRpcClient().getFunctionNode({ functionName, fileName: documentUri, projectPath });
        const range = response?.functionDefinition?.codedata?.lineRange;
        if (range) {
            setPosition({ startLine: range.startLine.line, startColumn: range.startLine.offset, endLine: range.endLine.line, endColumn: range.endLine.offset });
            setLoads((count) => count + 1);
        }
    }) : undefined, [documentUri, functionName, projectPath, rpcClient]);
    const editedHere = () => { handedOffRef.current = false; };

    useEffect(() => {
        if (!documentUri) {
            rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ["agents.bal"] })
                .then(({ filePath }) => setFilePath(filePath));
        }
    }, [documentUri, rpcClient]);

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
        <AssistView onHandedOff={() => { handedOffRef.current = true; }}>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar title="Agent Tool" subtitle="Build a tool that can be used by AI agents" />
            <ViewContent padding>
                <FormContainer onKeyDownCapture={editedHere} onPointerDownCapture={editedHere}>
                    <AgentScopeProvider value={scopeOf(agent, "TOOL")}>
                        {filePath && <AgentToolForm
                            key={loads}
                            filePath={filePath}
                            projectPath={projectPath}
                            editContext={functionName ? { functionName, inClass, lineRange: lineRange as any } : undefined}
                            isPublic={!functionName}
                            nestedForm
                            onSave={goBack}
                            onBack={goBack}
                        />}
                    </AgentScopeProvider>
                </FormContainer>
            </ViewContent>
        </AssistView>
    );
}
