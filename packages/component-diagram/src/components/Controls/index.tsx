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

import React from "react";

import styled from "@emotion/styled";
import { DiagramEngine } from "@projectstorm/react-diagrams-core";
import { Icon, ThemeColors } from "@wso2/ui-toolkit";
import { TopologyOrientation } from "../AgentTopologyDiagram/types";

const Container = styled.div<{}>`
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;

    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 1000;
`;

const GroupContainer = styled.div<{}>`
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0;

    & > *:not(:last-child) {
        border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    }

    & > *:first-child {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
    }

    & > *:last-child {
        border-top-left-radius: 0;
        border-top-right-radius: 0;
    }

    & > *:not(:first-child):not(:last-child) {
        border-radius: 0;
    }
`;

const Button = styled.div<{}>`
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 8px;
    border-radius: 4px;
    background-color: ${ThemeColors.SURFACE};
    fill: ${ThemeColors.ON_SURFACE};
    width: 32px;
    height: 32px;
    cursor: pointer;

    &:hover {
        background-color: ${ThemeColors.SURFACE_CONTAINER};
    }

    &:active {
        background-color: ${ThemeColors.SURFACE_CONTAINER};
    }
`;

const CleanupIconWrapper = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const BeakerBadge = styled.span`
    position: absolute;
    bottom: -2px;
    right: -2px;
    color: var(--vscode-editorWarning-foreground, #cca700);
    line-height: 1;
`;

interface ControlsProps {
    engine: DiagramEngine;
    onCleanupTestServices?: () => void;
    orientation?: TopologyOrientation;
    onToggleOrientation?: () => void;
}

export function Controls(props: ControlsProps) {
    const { engine, onCleanupTestServices, orientation, onToggleOrientation } = props;

    const handleZoomToFit = () => {
        if (engine.getCanvas()?.getBoundingClientRect) {
            engine.zoomToFitNodes({ margin: 40, maxZoom: 1 });
            engine.repaintCanvas();
        }
    };

    const onZoom = (zoomIn: boolean) => {
        const delta: number = zoomIn ? +5 : -5;
        engine.getModel().setZoomLevel(engine.getModel().getZoomLevel() + delta);
        engine.repaintCanvas();
    };

    return (
        <Container>
            {onCleanupTestServices && (
                <Button onClick={onCleanupTestServices} title="Clean up test services">
                    <CleanupIconWrapper>
                        <Icon name="bi-clean" isCodicon={false} sx={{ width: 16, height: 16, fontSize: 16 }} />
                        <BeakerBadge><Icon name="beaker" isCodicon={true} iconSx={{ fontSize: 12 }} sx={{ width: 8, height: 8 }} /></BeakerBadge>
                    </CleanupIconWrapper>
                </Button>
            )}
            {onToggleOrientation && (
                <Button
                    onClick={onToggleOrientation}
                    title={orientation === "vertical" ? "Lay out left to right" : "Lay out top to bottom"}
                    data-testid="topology-orientation-toggle"
                >
                    <Icon
                        name="arrow-swap"
                        isCodicon={true}
                        sx={{ width: 16, height: 16, fontSize: 16, transform: orientation === "vertical" ? "none" : "rotate(90deg)" }}
                        iconSx={{ fontSize: 16 }}
                    />
                </Button>
            )}
            <Button onClick={handleZoomToFit}>
                <Icon name="bi-fit-screen" sx={{ width: 16, height: 16, fontSize: 16 }} />
            </Button>
            <GroupContainer>
                <Button onClick={() => onZoom(true)}>
                    <Icon name="bi-plus" sx={{ width: 16, height: 16, fontSize: 16 }} />
                </Button>
                <Button onClick={() => onZoom(false)}>
                    <Icon name="bi-minus" sx={{ width: 16, height: 16, fontSize: 16 }} />
                </Button>
            </GroupContainer>
        </Container>
    );
}

export default Controls;
