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

import React, { useEffect, useState } from 'react';
import { DiagramEngine, DiagramModel } from '@projectstorm/react-diagrams';
import { NavigationWrapperCanvasWidget, ProgressRing, ThemeColors } from '@wso2/ui-toolkit';
import { createEntitiesEngine, entityModeller } from './utils';

import { DiagramContainer, useStyles } from './utils/CanvasStyles';

import './resources/assets/font/fonts.css';

import { dagreEngine } from './resources/constants';
import { DesignDiagramContext } from './components/common';
import { DiagramControls } from './components/Controls/DiagramControls';
import { OverlayLayerModel } from './components/OverlayLoader';
import { FilteringInfoBanner } from './components/FilteringInfoBanner';
import { Type, TypeFunctionModel } from '@wso2/ballerina-core';
import { focusToNode } from './utils/utils';
import { graphqlModeller } from './utils/model-mapper/entityModelMapper';

interface TypeDiagramProps {
    typeModel: Type[];
    rootService?: Type;
    isGraphql?: boolean;
    selectedNodeId?: string;
    focusedNodeId?: string;
    readonly?: boolean;
    updateFocusedNodeId?: (nodeId: string) => void;
    showProblemPanel?: () => void;
    goToSource: (node: Type) => void
    onFunctionOpen?: (node: Type, func: TypeFunctionModel) => void;
    onTypeEdit: (typeId: string, isGraphqlRoot?: boolean) => void;
    onTypeDelete: (typeId: string) => void;
    verifyTypeDelete: (typeId: string) => Promise<boolean>;
}

export interface ModelResult {
    model: DiagramModel;
    isFirstLevelDependenciesFiltered?: boolean;
}

export function TypeDiagram(props: TypeDiagramProps) {
    const { typeModel, showProblemPanel, selectedNodeId, goToSource, onFunctionOpen, focusedNodeId, readonly, updateFocusedNodeId, rootService, isGraphql, verifyTypeDelete } = props;

    const [diagramEngine] = useState<DiagramEngine>(createEntitiesEngine());
    const [diagramModel, setDiagramModel] = useState<DiagramModel>(undefined);
    const [hasDiagnostics, setHasDiagnostics] = useState<boolean>(false);
    const [selectedDiagramNode, setSelectedDiagramNode] = useState<string>(selectedNodeId);
    const [isFirstLevelFiltered, setIsFirstLevelFiltered] = useState<boolean>(false);

    useEffect(() => {
        drawDiagram(focusedNodeId);
    }, [typeModel, focusedNodeId, rootService]);

    useEffect(() => {
        setSelectedDiagramNode(selectedNodeId);
    }, [selectedNodeId]);

    const drawDiagram = (focusedNode?: string) => {

        let diagramModel: DiagramModel;


        // Create diagram model based on type
        if (isGraphql && rootService) {
            console.log("Modeling  graphql diagram");
            diagramModel = graphqlModeller(rootService, typeModel);
        } else if (typeModel && !isGraphql) {
            console.log("Modeling entity diagram", focusedNode, selectedNodeId);
            const modellerResult: ModelResult = entityModeller(typeModel, focusedNode);
            diagramModel = modellerResult.model;
            setIsFirstLevelFiltered(modellerResult.isFirstLevelDependenciesFiltered || false);
        }

        if (diagramModel) {
            // Setup initial model
            diagramModel.addLayer(new OverlayLayerModel());
            diagramEngine.setModel(diagramModel);
            setDiagramModel(diagramModel);

            // Layout and focus handling
            setTimeout(() => {
                dagreEngine.redistribute(diagramEngine.getModel());

                if (selectedNodeId) {
                    const selectedModel = diagramEngine.getModel().getNode(selectedNodeId);
                    focusToNode(selectedModel, diagramEngine.getModel().getZoomLevel(), diagramEngine);
                } else if (diagramEngine?.getCanvas()?.getBoundingClientRect) {
                    diagramEngine.zoomToFitNodes({ margin: 10, maxZoom: 1 });
                }

                // Cleanup and refresh
                diagramEngine.getModel().removeLayer(
                    diagramEngine.getModel().getLayers().find(layer => layer instanceof OverlayLayerModel)
                );
                diagramEngine.setModel(diagramModel);
                diagramEngine.repaintCanvas();
            }, 300);
        }
    }

    // const defaultOrg = useRef<string>('');

    const styles = useStyles();

    const onTypeEdit = (typeId: string, isGraphqlRoot?: boolean) => {
        console.log("Editing type: ", typeId, isGraphqlRoot);
        // setSelectedNodeId(typeId);
        props.onTypeEdit(typeId, isGraphqlRoot);
    }

    const updateSelectionOnDiagram = (nodeId: string) => {
        setSelectedDiagramNode(nodeId);
    }

    const onNodeDelete = (typeId: string) => {
        console.log("Deleting node: ", selectedDiagramNode);
        props.onTypeDelete(typeId);
    }

    let ctx = {
        selectedNodeId: selectedDiagramNode,
        setSelectedNodeId: updateSelectionOnDiagram,
        setHasDiagnostics,
        hasDiagnostics,
        focusedNodeId,
        readonly,
        setFocusedNodeId: updateFocusedNodeId,
        onEditNode: onTypeEdit,
        goToSource,
        onFunctionOpen,
        onNodeDelete,
        verifyTypeDelete
    }

    const refreshDiagram = () => {
        drawDiagram(focusedNodeId);
    };

    return (
        <DesignDiagramContext {...ctx}>
            {diagramEngine?.getModel() && diagramModel ? (
                <>
                    {isFirstLevelFiltered && <FilteringInfoBanner />}
                    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
                        <DiagramContainer data-testid="type-diagram">
                            <NavigationWrapperCanvasWidget
                                diagramEngine={diagramEngine}
                                className={styles.canvas}
                                focusedNode={diagramEngine?.getModel()?.getNode(selectedDiagramNode)}
                            />
                        </DiagramContainer>
                        <DiagramControls
                            engine={diagramEngine}
                            refreshDiagram={refreshDiagram}
                            showProblemPanel={showProblemPanel}
                        />
                    </div>
                </>
            ) : (
                <ProgressRing sx={{ color: ThemeColors.PRIMARY }} />
            )}
        </DesignDiagramContext>
    );
}
