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
import { ChangeTypeEnum, ModelState, NodePosition } from "@wso2/ballerina-core";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { DataMapper } from "@wso2/ballerina-data-mapper";
import { fetchDataMapperModelVersion, ReviewModelCache } from "./reviewModelCache";

const SpinnerContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const Container = styled.div`
    height: 100%;
    pointer-events: auto;
`;

const MessageContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: var(--vscode-descriptionForeground);
    padding: 0 24px;
    text-align: center;
`;

interface ItemMetadata {
    type: string;
    name: string;
    accessor?: string;
}

interface ReadonlyDataMapperDiagramProps {
    projectPath: string;
    filePath: string;
    position: NodePosition;
    name?: string;
    onModelLoaded?: (metadata: ItemMetadata) => void;
    /** True for the "Old" side, which the data-mapper LS service cannot serve — only the live file. */
    useFileSchema?: boolean;
    changeType: number;
    /** Session-scoped model cache owned by ReviewMode — survives toggle/navigation remounts. */
    modelCache: ReviewModelCache;
}

const noOp = () => { };
const noOpAsync = async () => { };

export function ReadonlyDataMapperDiagram(props: ReadonlyDataMapperDiagramProps): JSX.Element {
    const { filePath, position, name, onModelLoaded, useFileSchema, changeType, modelCache } = props;
    const { rpcClient } = useRpcContext();
    const [modelState, setModelState] = useState<ModelState | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        setModelState(null);
        setErrorMessage(null);
        // Only the live file has a model to fetch, so the old side never renders a diagram. Report
        // the name anyway, or the title would sit on "Loading..." for good.
        if (useFileSchema) {
            onModelLoaded?.({ type: "Data Mapper", name: name || "Unknown" });
            setErrorMessage(changeType === ChangeTypeEnum.DELETION
                ? "This data mapper was deleted."
                : "The previous version of this data mapper is unavailable.");
            return;
        }
        // A slower earlier request must not overwrite this render with the other version's model.
        let cancelled = false;
        fetchDataMapperModelVersion(rpcClient, modelCache, {
            filePath,
            position,
            name: name ?? "",
        })
            .then((model) => {
                if (cancelled) {
                    return;
                }
                if (model) {
                    setModelState({ model });
                    onModelLoaded?.({ type: "Data Mapper", name: name || model.rootViewId || "Unknown" });
                } else {
                    setErrorMessage("This diagram is unavailable for the selected version.");
                }
            })
            .catch((error) => {
                console.error("[Reviewing Changes] Error fetching data mapper model:", error);
                if (!cancelled) {
                    setErrorMessage("This diagram could not be loaded.");
                }
            });
        return () => {
            cancelled = true;
        };
    }, [filePath, position, name, useFileSchema, changeType, rpcClient, modelCache]);

    if (errorMessage) {
        return <MessageContainer>{errorMessage}</MessageContainer>;
    }

    if (!modelState) {
        return (
            <SpinnerContainer>
                <ProgressRing color={ThemeColors.PRIMARY} />
            </SpinnerContainer>
        );
    }

    return (
        <Container>
            <DataMapper
                modelState={modelState}
                name={name}
                reusable={false}
                onClose={noOp}
                onRefresh={noOpAsync}
                applyModifications={noOpAsync}
                addArrayElement={noOpAsync}
                convertToQuery={noOpAsync}
                addClauses={noOpAsync}
                deleteClause={noOpAsync}
                getClausePosition={async () => ({ line: 0, offset: 0 })}
                addSubMapping={noOpAsync}
                deleteMapping={noOpAsync}
                deleteSubMapping={noOpAsync}
                mapWithCustomFn={noOpAsync}
                mapWithTransformFn={noOpAsync}
                resolveOutput={noOpAsync}
                goToFunction={noOpAsync}
                enrichChildFields={noOpAsync}
                genUniqueName={async () => ""}
                getConvertedExpression={async () => ""}
                createConvertedVariable={noOpAsync}
                undoRedoGroup={() => null}
                handleView={noOp}
                generateForm={() => <></>}
                goToSource={noOp}
                expressionBar={{
                    completions: [],
                    isUpdatingSource: false,
                    triggerCompletions: noOp,
                    onCompletionSelect: noOp,
                    onSave: noOpAsync,
                    onCancel: noOp,
                    goToSource: noOpAsync,
                }}
            />
        </Container>
    );
}
