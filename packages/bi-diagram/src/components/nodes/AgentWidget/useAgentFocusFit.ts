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

import { useCallback, useEffect, useRef, useState } from "react";
import { DiagramEngine, NodeModel } from "@projectstorm/react-diagrams";
import { BaseAgentNodeModel } from "../BaseAgentNodeModel";
import { animateAgentFocusFit, computeAgentFocusFit, findAgentFocusNode, isSingleAgentFocusNode, positionAgentFocusNode } from "./agentFocusFit";

/** Owns the agent-focus-view's center-and-fit behavior: initial placement, manual fit-to-screen, and resize. */
export function useAgentFocusFit(diagramEngine: DiagramEngine, isAgentFocusView: boolean, embedded: boolean) {
    const [canvasVisible, setCanvasVisible] = useState(!(isAgentFocusView && embedded));
    const nodeObserverRef = useRef<ResizeObserver>();

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
                diagramEngine.repaintCanvas();
            }
            return true;
        },
        [diagramEngine, embedded]
    );

    /** Re-centers when the node's own footprint changes, e.g. the usage rail arriving from a later fetch. */
    const watchNodeSize = useCallback(
        (agentNode: BaseAgentNodeModel | undefined) => {
            nodeObserverRef.current?.disconnect();
            nodeObserverRef.current = undefined;
            if (!agentNode) {
                return;
            }
            let element: Element;
            try {
                element = diagramEngine.getNodeElement(agentNode);
            } catch {
                return;
            }
            let lastSize: { width: number; height: number } | undefined;
            const observer = new ResizeObserver((entries) => {
                // contentRect is the untransformed layout size, so canvas zoom never trips this.
                const { width, height } = entries[0].contentRect;
                const previous = lastSize;
                lastSize = { width, height };
                if (!previous) {
                    return; // the report ResizeObserver fires on observe()
                }
                if (Math.abs(previous.width - width) < 1 && Math.abs(previous.height - height) < 1) {
                    return;
                }
                fitToContainer(false);
            });
            observer.observe(element);
            nodeObserverRef.current = observer;
        },
        [diagramEngine, fitToContainer]
    );

    useEffect(() => () => nodeObserverRef.current?.disconnect(), []);

    const positionAndFit = useCallback(
        (nodes: NodeModel[]) => {
            if (!isAgentFocusView || !isSingleAgentFocusNode(nodes)) {
                return;
            }
            const agentNode = findAgentFocusNode(nodes);
            positionAgentFocusNode(agentNode);
            // Measured after paint: before it, the node still reports its previous size.
            requestAnimationFrame(() => {
                fitToContainer(false);
                diagramEngine.repaintCanvas();
                setCanvasVisible(true);
                watchNodeSize(agentNode);
            });
        },
        [isAgentFocusView, fitToContainer, diagramEngine, watchNodeSize]
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
                    // Animate only while the user is watching; the panel also resizes on blur.
                    fitToContainer(document.hasFocus());
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
