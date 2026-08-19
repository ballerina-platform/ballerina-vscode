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

import { flushSync } from "react-dom";
import { DiagramEngine, DiagramModel, NodeModel } from "@projectstorm/react-diagrams";
import { NodeTypes } from "../../../resources/constants";
import { BaseAgentNodeModel } from "../BaseAgentNodeModel";

export const AGENT_FOCUS_MIN_ZOOM = 25;
export const AGENT_FOCUS_FIT_PADDING = 5;
export const AGENT_FOCUS_FIT_ANIMATION_MS = 300;
const MIN_FITTABLE_CANVAS = 50;

function isAgentFocusType(node: NodeModel): boolean {
    const type = node.getType();
    return type === NodeTypes.AGENT_NODE || type === NodeTypes.AGENT_CALL_NODE || type === NodeTypes.TYPED_AGENT_NODE;
}

export function isSingleAgentFocusNode(nodes: NodeModel[]): boolean {
    return nodes.length === 1 && isAgentFocusType(nodes[0]);
}

export function findAgentFocusNode(nodes: NodeModel[]): BaseAgentNodeModel | undefined {
    return nodes.find(isAgentFocusType) as BaseAgentNodeModel | undefined;
}

export function positionAgentFocusNode(node: BaseAgentNodeModel): void {
    const { lw, y } = node.node.viewState;
    node.setPosition(-lw, y);
}

/** The horizontal span the node actually paints — the reserved box is wider and not symmetric. */
function measureAgentNodeInkX(nodeElement: Element): { left: number; right: number } | null {
    const row = nodeElement.querySelector("[data-testid='agent-node'],[data-testid='typed-agent-node']") ?? nodeElement;
    let left = Infinity;
    let right = -Infinity;
    for (const child of Array.from(row.children)) {
        const rect = child.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            continue;
        }
        if (child instanceof SVGSVGElement) {
            try {
                const bbox = child.getBBox();
                const viewBox = child.viewBox.baseVal;
                if (bbox.width > 0 && viewBox && viewBox.width > 0) {
                    const scale = rect.width / viewBox.width;
                    const inkLeft = rect.left + (bbox.x - viewBox.x) * scale;
                    left = Math.min(left, inkLeft);
                    right = Math.max(right, inkLeft + bbox.width * scale);
                    continue;
                }
            } catch {
                // fall back to the layout box
            }
        }
        left = Math.min(left, rect.left);
        right = Math.max(right, rect.right);
    }
    return left === Infinity ? null : { left, right };
}

export interface AgentFocusFitTarget {
    targetZoomPct: number;
    targetOffsetX: number;
    targetOffsetY: number;
}

/** Fits the agent node's painted width into the canvas, capped at 100% zoom, and centers it. */
export function computeAgentFocusFit(
    canvas: HTMLElement,
    diagramEngine: DiagramEngine,
    agentNode: BaseAgentNodeModel,
    embedded: boolean
): AgentFocusFitTarget | null {
    let nodeElement: Element;
    try {
        nodeElement = diagramEngine.getNodeElement(agentNode);
    } catch {
        return null;
    }

    const model = diagramEngine.getModel();
    const currentZoom = model.getZoomLevel() / 100;
    const nodeRect = nodeElement.getBoundingClientRect();
    const topLeft = diagramEngine.getRelativeMousePoint({ clientX: nodeRect.left, clientY: nodeRect.top });
    const contentHeight = nodeRect.height / currentZoom;
    const contentCenterY = topLeft.y + contentHeight / 2;

    const ink = measureAgentNodeInkX(nodeElement);
    const contentWidth = (ink ? ink.right - ink.left : nodeRect.width) / currentZoom;
    const inkLeftX = ink
        ? diagramEngine.getRelativeMousePoint({ clientX: ink.left, clientY: nodeRect.top }).x
        : topLeft.x;
    const contentCenterX = inkLeftX + contentWidth / 2;

    const { width: canvasWidth, height: canvasHeight } = canvas.getBoundingClientRect();

    if (canvasWidth < MIN_FITTABLE_CANVAS || canvasHeight < MIN_FITTABLE_CANVAS) {
        return null;
    }

    const fitZoomPct = ((canvasWidth - AGENT_FOCUS_FIT_PADDING * 2) / contentWidth) * 100;
    const targetZoomPct = Math.min(100, Math.max(AGENT_FOCUS_MIN_ZOOM, fitZoomPct));
    const zoom = targetZoomPct / 100;

    const verticalBias = embedded ? 0 : 40;
    const targetOffsetX = canvasWidth / 2 - contentCenterX * zoom;
    const targetOffsetY = canvasHeight / 2 - verticalBias - contentCenterY * zoom;

    return { targetZoomPct, targetOffsetX, targetOffsetY };
}

/** CSS-transform animation instead of per-frame setZoomLevel/setOffset, which desyncs link routing. */
export function animateAgentFocusFit(
    canvas: HTMLElement,
    model: DiagramModel,
    diagramEngine: DiagramEngine,
    target: AgentFocusFitTarget
): void {
    const { targetZoomPct, targetOffsetX, targetOffsetY } = target;
    const startZoomPct = model.getZoomLevel();
    const startOffsetX = model.getOffsetX();
    const startOffsetY = model.getOffsetY();
    const scale = targetZoomPct / startZoomPct;
    // transform-origin 0 0: translate(A) scale(s) maps p -> s*p + A, so A = target - s*start.
    const translateX = targetOffsetX - scale * startOffsetX;
    const translateY = targetOffsetY - scale * startOffsetY;

    if (Math.abs(scale - 1) < 0.001 && Math.abs(translateX) < 0.5 && Math.abs(translateY) < 0.5) {
        return;
    }

    canvas.style.transformOrigin = "0 0";
    canvas.style.transition = "none";
    canvas.style.transform = "translate(0px, 0px) scale(1)";
    void canvas.offsetWidth;
    canvas.style.transition = `transform ${AGENT_FOCUS_FIT_ANIMATION_MS}ms ease-in-out`;
    canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;

    const finalize = () => {
        canvas.removeEventListener("transitionend", finalize);
        clearTimeout(fallback);
        canvas.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        flushSync(() => {
            model.setZoomLevel(targetZoomPct);
            model.setOffset(targetOffsetX, targetOffsetY);
            diagramEngine.repaintCanvas();
        });
        canvas.style.transition = "none";
        canvas.style.transform = "translate(0px, 0px) scale(1)";
    };
    canvas.addEventListener("transitionend", finalize, { once: true });
    const fallback = setTimeout(finalize, AGENT_FOCUS_FIT_ANIMATION_MS + 100);
}
