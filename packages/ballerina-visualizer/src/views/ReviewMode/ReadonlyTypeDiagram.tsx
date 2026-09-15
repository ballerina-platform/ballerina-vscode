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
import { Type } from "@wso2/ballerina-core";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { TypeDiagram as TypeDesignDiagram } from "@wso2/type-diagram";
import { fetchTypesModel, ReviewModelCache } from "./reviewModelCache";

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

interface ReadonlyTypeDiagramProps {
    projectPath: string;
    filePath: string;
    onModelLoaded?: (metadata: ItemMetadata) => void;
    useFileSchema?: boolean;
    /** Session-scoped model cache owned by ReviewMode — survives toggle/navigation remounts. */
    modelCache: ReviewModelCache;
}

export function ReadonlyTypeDiagram(props: ReadonlyTypeDiagramProps): JSX.Element {
    const { filePath, onModelLoaded, useFileSchema, modelCache } = props;
    const { rpcClient } = useRpcContext();
    const [typesModel, setTypesModel] = useState<Type[] | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        setTypesModel(null);
        setErrorMessage(null);
        // Stale-response guard: a slower earlier request (e.g. after toggling Old/New)
        // must not overwrite this render with the other version's model.
        let cancelled = false;
        fetchTypesModel(rpcClient, modelCache, filePath, useFileSchema)
            .then((types) => {
                if (cancelled) {
                    return;
                }
                if (types) {
                    setTypesModel(types);

                    // Extract metadata from the types
                    if (onModelLoaded && types.length > 0) {
                        // If there's a single type, use it; otherwise show "Types" as plural
                        const firstType = types[0];
                        onModelLoaded({
                            type: "Type",
                            name:
                                types.length === 1
                                    ? firstType.name || "Unknown"
                                    : `${types.length} Types`,
                        });
                    } else if (onModelLoaded) {
                        // No types found
                        onModelLoaded({
                            type: "Type",
                            name: "No Types",
                        });
                    }
                } else {
                    // A resolved-but-empty response (e.g. the source is mid-edit and not
                    // parseable) previously left the spinner up forever.
                    setErrorMessage("The type diagram is unavailable for the selected version.");
                }
            })
            .catch((error) => {
                console.error("Error fetching types model:", error);
                if (!cancelled) {
                    setErrorMessage("The type diagram could not be loaded.");
                }
            });
        return () => {
            cancelled = true;
        };
    }, [filePath, useFileSchema, rpcClient, modelCache]);

    // No-op handlers for readonly mode
    const noOpHandler = () => {
        console.log("Diagram is in readonly mode");
    };

    if (errorMessage) {
        return <MessageContainer>{errorMessage}</MessageContainer>;
    }

    if (!typesModel) {
        return (
            <SpinnerContainer>
                <ProgressRing color={ThemeColors.PRIMARY} />
            </SpinnerContainer>
        );
    }

    return (
        <Container>
            <TypeDesignDiagram
                typeModel={typesModel}
                goToSource={noOpHandler}
                onTypeEdit={noOpHandler}
                onTypeDelete={noOpHandler}
                verifyTypeDelete={async () => true}
                readonly={true}
            />
        </Container>
    );
}
