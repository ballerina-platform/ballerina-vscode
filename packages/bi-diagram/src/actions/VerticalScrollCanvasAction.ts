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

import { flushSync } from "react-dom";
import { Action, ActionEvent, InputType } from "@projectstorm/react-canvas-core";
import { canvasGesture, isMac } from "../utils/diagram";

export interface PanAndZoomCanvasActionOptions {
    inverseZoom?: boolean;
}

// Wheels that report lines rather than pixels move about this far per line.
const LINE_HEIGHT_PX = 20;

export class VerticalScrollCanvasAction extends Action {
    constructor(options: PanAndZoomCanvasActionOptions = {}) {
        super({
            type: InputType.MOUSE_WHEEL,
            fire: (actionEvent: ActionEvent<any>) => {
                const { event } = actionEvent;
                for (let layer of this.engine.getModel().getLayers()) {
                    layer.allowRepaint(false);
                }

                const model = this.engine.getModel();
                event.stopPropagation();
                // A pinch arrives as a wheel with Ctrl held; the pan keys also turn scrolling into zoom.
                if (event.ctrlKey || event.metaKey || canvasGesture(this.engine).panKey) {
                    const oldZoomFactor = this.engine.getModel().getZoomLevel() / 100;

                    let scrollDelta = options.inverseZoom ? event.deltaY : -event.deltaY;
                    scrollDelta /= 3;

                    if (model.getZoomLevel() + scrollDelta > 10) {
                        model.setZoomLevel(model.getZoomLevel() + scrollDelta);
                    }

                    const zoomFactor = model.getZoomLevel() / 100;

                    const boundingRect = event.currentTarget.getBoundingClientRect();
                    const clientWidth = boundingRect.width;
                    const clientHeight = boundingRect.height;
                    // compute difference between rect before and after scroll
                    const widthDiff = clientWidth * zoomFactor - clientWidth * oldZoomFactor;
                    const heightDiff = clientHeight * zoomFactor - clientHeight * oldZoomFactor;
                    // compute mouse coords relative to canvas
                    const clientX = event.clientX - boundingRect.left;
                    const clientY = event.clientY - boundingRect.top;

                    // compute width and height increment factor
                    const xFactor = (clientX - model.getOffsetX()) / oldZoomFactor / clientWidth;
                    const yFactor = (clientY - model.getOffsetY()) / oldZoomFactor / clientHeight;

                    model.setOffset(
                        model.getOffsetX() - widthDiff * xFactor,
                        model.getOffsetY() - heightDiff * yFactor
                    );
                } else {
                    const sign = options.inverseZoom ? -1 : 1;
                    const unit = event.deltaMode === 1 ? LINE_HEIGHT_PX : 1;
                    // Off macOS, Shift turns a plain mouse wheel sideways.
                    const sideways = !isMac && event.shiftKey;
                    const dx = (sideways ? event.deltaY : event.deltaX) * unit;
                    const dy = (sideways ? 0 : event.deltaY) * unit;
                    model.setOffset(model.getOffsetX() - sign * dx, model.getOffsetY() - sign * dy);
                }
                // React defers renders from wheel events, so a step can miss its frame and the next one jumps twice as far.
                flushSync(() => this.engine.repaintCanvas());

                // re-enable rendering
                for (let layer of this.engine.getModel().getLayers()) {
                    layer.allowRepaint(true);
                }
            },
        });
    }
}
