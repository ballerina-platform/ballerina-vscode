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
import { NodePosition, CDModel } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Diagram } from "@wso2/component-diagram";
import { ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { fetchDesignModel, ReviewModelCache } from "./reviewModelCache";

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

interface ReadonlyComponentDiagramProps {
    projectPath: string;
    filePath: string;
    position: NodePosition;
    useFileSchema?: boolean;
    /** Session-scoped model cache owned by ReviewMode — survives toggle/navigation remounts. */
    modelCache: ReviewModelCache;
}

const EmptyMessage = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: var(--vscode-descriptionForeground);
    font-size: 14px;
`;

function isDesignModelEmpty(model: CDModel): boolean {
    return model.connections.length === 0
        && model.listeners.length === 0
        && model.services.length === 0
        && !model.automation;
}

export function ReadonlyComponentDiagram(props: ReadonlyComponentDiagramProps): JSX.Element {
    const { projectPath, useFileSchema, modelCache } = props;
    const { rpcClient } = useRpcContext();
    const [project, setProject] = useState<CDModel | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);

    useEffect(() => {
        setProject(null);
        setIsLoaded(false);
        setLoadFailed(false);
        // Stale-response guard: a slower earlier request (e.g. after toggling Old/New)
        // must not overwrite this render with the other version's model.
        let cancelled = false;
        fetchDesignModel(rpcClient, modelCache, projectPath, useFileSchema)
            .then((designModel) => {
                if (cancelled) {
                    return;
                }
                if (designModel) {
                    setProject(designModel);
                } else {
                    setLoadFailed(true);
                }
                setIsLoaded(true);
            })
            .catch((error) => {
                console.error("Error getting design model", error);
                if (!cancelled) {
                    setLoadFailed(true);
                    setIsLoaded(true);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [projectPath, useFileSchema, rpcClient, modelCache]);

    // No-op handlers for readonly mode
    const noOpHandler = () => {
        console.log("Diagram is in readonly mode");
    };

    if (!isLoaded) {
        return (
            <SpinnerContainer>
                <ProgressRing color={ThemeColors.PRIMARY} />
            </SpinnerContainer>
        );
    }

    // A load failure is not the same as a genuinely empty design — say which one it is,
    // and name the version actually being shown.
    const versionLabel = useFileSchema ? "previous" : "current";
    if (loadFailed) {
        return <EmptyMessage>The design diagram for the {versionLabel} version could not be loaded.</EmptyMessage>;
    }

    if (!project || isDesignModelEmpty(project)) {
        return (
            <EmptyMessage>
                No top-level constructs found in the {versionLabel} version
            </EmptyMessage>
        );
    }

    return (
        <Container>
            <Diagram
                project={project}
                readonly={true}
                onListenerSelect={noOpHandler as any}
                onServiceSelect={noOpHandler as any}
                onFunctionSelect={noOpHandler as any}
                onAutomationSelect={noOpHandler as any}
                onConnectionSelect={noOpHandler as any}
                onDeleteComponent={noOpHandler as any}
            />
        </Container>
    );
}
