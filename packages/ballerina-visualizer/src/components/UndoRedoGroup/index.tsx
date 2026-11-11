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
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Icon, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { UndoRedoStateResponse } from "@wso2/ballerina-core";
import { debouncedRedo, debouncedUndo } from "../../utils/debouncedUndoRedo";


const ButtonGroup = styled.div`
    display: flex;
    align-items: center;
    padding-right: 4px;
`;


export function UndoRedoGroup() {
    const { rpcClient } = useRpcContext();

    const [undoRedoState, setUndoRedoState] = useState<UndoRedoStateResponse>();
    const [undoing, setUndoing] = useState(false);
    const [redoing, setRedoing] = useState(false);

    const [undoDescription, setUndoDescription] = useState<string>();
    const [redoDescription, setRedoDescription] = useState<string>();

    useEffect(() => {
        rpcClient
            .getVisualizerRpcClient()
            .undoRedoState()
            .then((res) => {
                setUndoRedoState(res);
                setUndoDescription(res.nextUndoDescription);
                setRedoDescription(res.nextRedoDescription);
            });
    }, [undoing, redoing]);

    const handleUndo = async () => {
        setUndoing(true);
        await debouncedUndo(rpcClient);
        setUndoing(false);
    };

    const handleRedo = async () => {
        setRedoing(true);
        await debouncedRedo(rpcClient);
        setRedoing(false);
    };

    return (
        <ButtonGroup>
            <Button appearance="icon" onClick={handleUndo} disabled={!undoRedoState?.canUndo || undoing} tooltip={`Undo ${undoDescription || ""}`}>
                <span style={{ pointerEvents: "none" }}>
                    {undoing ? (
                        <ProgressRing color={ThemeColors.PRIMARY} sx={{ width: 16, height: 16 }} />
                    ) : (
                        <Icon sx={{ fontSize: "16px" }} name="bi-undo" />
                    )}
                </span>
            </Button>
            <Button appearance="icon" onClick={handleRedo} disabled={!undoRedoState?.canRedo || redoing} tooltip={`Redo ${redoDescription || ""}`}>
                <span style={{ pointerEvents: "none" }}>
                    {redoing ? (
                        <ProgressRing color={ThemeColors.PRIMARY} sx={{ width: 16, height: 16 }} />
                    ) : (
                        <Icon sx={{ fontSize: "16px" }} name="bi-redo" />
                    )}
                </span>
            </Button>
        </ButtonGroup>
    );
}
