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

import React, { useCallback, useEffect, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { SqFlow, ParentMetadata, NodePosition } from "@wso2/ballerina-core";
import { Diagram } from "@wso2/sequence-diagram";
import styled from "@emotion/styled";
import { ThemeColors } from "@wso2/ui-toolkit";
import { STNode } from "@wso2/syntax-tree";
import { debounce } from "lodash";
import { DIAGRAM_REFRESH_DEBOUNCE_MS } from "../diagramRefreshDebounce";
const Container = styled.div`
    width: 100%;
    height: calc(100vh - 50px);
    position: relative;
`;

const ExperimentalLabel = styled.div`
    position: fixed;
    top: 120px;
    left: 12px;
    background-color: ${ThemeColors.SURFACE_DIM};
    color: ${ThemeColors.ON_SURFACE};
    padding: 4px 8px;
    font-size: 12px;
    border-radius: 4px;
    z-index: 1000;
`;

const MessageContainer = styled.div({
    width: "100%",
    height: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
});

interface BISequenceDiagramProps {
    onUpdate: () => void;
    onReady: (fileName?: string, parentMetadata?: ParentMetadata, position?: NodePosition) => void;
}

export function BISequenceDiagram(props: BISequenceDiagramProps) {
    const { onUpdate, onReady } = props;

    const { rpcClient } = useRpcContext();
    const [flowModel, setModel] = useState<SqFlow>(undefined);

    useEffect(() => {
        getSequenceModel();
    }, []);

    const debouncedGetSequenceModel = useCallback(
        debounce(() => {
            getSequenceModel();
        }, DIAGRAM_REFRESH_DEBOUNCE_MS),
        []
    );

    useEffect(() => {
        rpcClient.onProjectContentUpdated((content) => {
            debouncedGetSequenceModel();
        });
        return () => {
            debouncedGetSequenceModel.cancel();
        };
    }, []);

    const getSequenceModel = () => {
        onUpdate();
        rpcClient
            .getSequenceDiagramRpcClient()
            .getSequenceModel()
            .then((model) => {
                if (model && "participants" in model.sequenceDiagram) {
                    setModel(model.sequenceDiagram);
                }
                // TODO: handle SequenceModelDiagnostic
            })
            .finally(() => {
                // onReady(undefined, undefined, undefined);
            });
    };

    console.log(">>> visualizer: flow model", flowModel);

    return (
        <>
            <Container>
                <ExperimentalLabel>Experimental</ExperimentalLabel>
                {flowModel && (
                    <Diagram
                        model={flowModel}
                        onClickParticipant={() => {}}
                        onAddParticipant={() => {}}
                        onReady={onReady}
                    />
                )}
                {!flowModel && <MessageContainer>Loading sequence diagram ...</MessageContainer>}
            </Container>
        </>
    );
}
