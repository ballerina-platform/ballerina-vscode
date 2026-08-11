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

import { useCallback, useEffect, useState } from "react";
import { DiagramEngine, NodeModel } from "@projectstorm/react-diagrams";
import { animateAgentFocusFit, computeAgentFocusFit, findAgentFocusNode, isSingleAgentFocusNode, positionAgentFocusNode } from "./agentFocusFit";

/** Owns the agent-focus-view's center-and-fit behavior: initial placement, manual fit-to-screen, and resize. */
export function useAgentFocusFit(diagramEngine: DiagramEngine, isAgentFocusView: boolean, embedded: boolean) {
    const [canvasVisible, setCanvasVisible] = useState(!(isAgentFocusView && embedded));

    const fitToContainer = useCallback(
        (animate: boolean) => {
            const canvas = diagramEngine.getCanvas();
            if (!canvas) {
                return false;
            }
            const agentNode = findAgentFocusNode(diagramEngine.getModel().getNodes());
            if (!agentNode) {
                return false;
            }
            const target = computeAgentFocusFit(canvas, diagramEngine, agentNode, embedded);
            if (!target) {
                return false;
            }
            if (animate) {
                animateAgentFocusFit(canvas, diagramEngine.getModel(), diagramEngine, target);
            } else {
                diagramEngine.getModel().setZoomLevel(target.targetZoomPct);
                diagramEngine.getModel().setOffset(target.targetOffsetX, target.targetOffsetY);
            }
            return true;
        },
        [diagramEngine, embedded]
    );

    // Animate only if a later redraw happens after the diagram is already visible.
    const positionAndFit = useCallback(
        (nodes: NodeModel[]) => {
            if (!isAgentFocusView || !isSingleAgentFocusNode(nodes)) {
                return;
            }
            positionAgentFocusNode(findAgentFocusNode(nodes));
            const alreadyVisible = canvasVisible;
            fitToContainer(alreadyVisible);
            requestAnimationFrame(() => {
                fitToContainer(alreadyVisible);
                diagramEngine.repaintCanvas();
                setCanvasVisible(true);
            });
        },
        [isAgentFocusView, canvasVisible, fitToContainer, diagramEngine]
    );

    // Re-fits when its container is resized (e.g. Copilot panel opening).
    useEffect(() => {
        if (!isAgentFocusView) {
            return;
        }
        let observer: ResizeObserver | undefined;
        let debounceTimer: ReturnType<typeof setTimeout> | undefined;
        let rafId: number | undefined;
        let cancelled = false;
        let lastFitSize: { width: number; height: number } | undefined;

        const trySetup = () => {
            if (cancelled) {
                return;
            }
            const canvas = diagramEngine.getCanvas();
            if (!canvas) {
                rafId = requestAnimationFrame(trySetup);
                return;
            }
            // Seed so the observer's own first report (fires on observe() with no resize) is a no-op.
            const initialRect = canvas.getBoundingClientRect();
            lastFitSize = { width: initialRect.width, height: initialRect.height };
            observer = new ResizeObserver((entries) => {
                const { width, height } = entries[0].contentRect;
                if (
                    lastFitSize &&
                    Math.abs(lastFitSize.width - width) < 1 &&
                    Math.abs(lastFitSize.height - height) < 1
                ) {
                    return;
                }
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    lastFitSize = { width, height };
                    fitToContainer(true);
                }, 120);
            });
            observer.observe(canvas);
        };
        trySetup();

        return () => {
            cancelled = true;
            if (rafId !== undefined) {
                cancelAnimationFrame(rafId);
            }
            clearTimeout(debounceTimer);
            observer?.disconnect();
        };
    }, [diagramEngine, isAgentFocusView, fitToContainer]);

    return { canvasVisible, fitToContainer, positionAndFit };
}
