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
import React, { useEffect } from "react";
import { flushSync } from "react-dom";

import { DiagramEngine, NodeModel } from "@projectstorm/react-diagrams";
import { CustomCanvasWidget } from "@wso2/ui-toolkit";
import { clampOffset } from "../../utils/diagram";

interface NavigationWrapperCanvasProps {
    diagramEngine: DiagramEngine;
    className?: string;
    focusedNode?: NodeModel;
    disableZoom?: boolean;
    disableMouseEvents?: boolean;
    overflow?: string;
    cursor?: string;
}

export function NavigationWrapperCanvasWidget(props: NavigationWrapperCanvasProps) {
    const { diagramEngine, focusedNode, className } = props;
    const focusedNodeId = focusedNode?.getID();

    useEffect(() => {
        if (!focusedNode) {
            return;
        }
        const raf = requestAnimationFrame(() => {
            focusToNode(focusedNode, diagramEngine.getModel().getZoomLevel(), diagramEngine);
        });
        return () => cancelAnimationFrame(raf);
        // Only re-focus when the focused node's identity actually changes.
        // The node object is recreated on every diagram redraw; using its id
        // keeps a single animation per logical focus change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [diagramEngine, focusedNodeId]);

    return (
        <CustomCanvasWidget
            engine={diagramEngine as any}
            className={className}
            disableZoom={props.disableZoom}
            disableMouseEvents={props.disableMouseEvents}
            overflow={props.overflow}
            cursor={props.cursor}
        />
    );
}

const FOCUS_DURATION_MS = 350;

function focusToNode(node: NodeModel, currentZoomLevel: number, diagramEngine: DiagramEngine) {
    const canvas = diagramEngine?.getCanvas() as HTMLElement | undefined;
    const canvasBounds = canvas?.getBoundingClientRect();
    const nodeBounds = node?.getBoundingBox();
    if (!canvas || !canvasBounds || !nodeBounds) {
        return;
    }

    const model = diagramEngine.getModel();
    const zoomOffset = currentZoomLevel / 100;
    const centerX = canvasBounds.width / 2 - (nodeBounds.getTopLeft().x + nodeBounds.getWidth() / 2) * zoomOffset;
    const centerY = canvasBounds.height / 2 - (nodeBounds.getTopLeft().y + nodeBounds.getHeight() / 2) * zoomOffset;
    // Pan only as far as the pan limit allows; the limit would otherwise snap the canvas back once the pan ends.
    const { x: targetX, y: targetY } = clampOffset(diagramEngine, centerX, centerY) ?? { x: centerX, y: centerY };

    const startX = model.getOffsetX();
    const startY = model.getOffsetY();
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        return;
    }

    // GPU-accelerated CSS pan: translate the canvas root, then reconcile model
    // offset once when the transition ends. This avoids per-frame
    // repaintCanvas() calls (which re-route links and desync nodes vs. links).
    canvas.style.transition = "none";
    canvas.style.transform = "translate(0px, 0px)";
    // Force the browser to commit the reset before applying the transition.
    void canvas.offsetWidth;
    canvas.style.transition = `transform ${FOCUS_DURATION_MS}ms ease-in-out`;
    canvas.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

    const finalize = () => {
        canvas.removeEventListener("transitionend", finalize);
        clearTimeout(fallback);
        // Reset CustomCanvasWidget's `isMouseClicked` flag so the inner
        // transform layer does NOT add `transition: transform 0.5s` when we
        // commit the new model offset.
        canvas.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        // The pan limit measures the canvas on every offset change, so the outer translate goes first.
        canvas.style.transition = "none";
        canvas.style.transform = "translate(0px, 0px)";
        // flushSync forces React to commit the inner-layer transform update
        // synchronously, in this same task. Without this, React 18 batches
        // the repaint until after this task ends, so the browser paints one
        // frame with outer=0 + inner=start (snap back to origin) before the
        // inner offset commits.
        flushSync(() => {
            model.setOffset(targetX, targetY);
            diagramEngine.repaintCanvas();
        });
    };
    canvas.addEventListener("transitionend", finalize, { once: true });
    // Fallback in case `transitionend` is missed (tab backgrounded etc.).
    const fallback = setTimeout(finalize, FOCUS_DURATION_MS + 100);
}
