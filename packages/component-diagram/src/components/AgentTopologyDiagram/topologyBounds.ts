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

import {
    AGENT_CARD_WIDTH,
    SPLIT_SIZE,
    TRIGGER_LABEL_WIDTH,
    TRIGGER_NODE_WIDTH,
    TRIGGER_SIZE,
    TRIGGER_STACKED_HEIGHT,
} from "../../resources/constants";
import { NodePosition, TopologyFocus, TopologyLayout, TopologyOrientation } from "./types";

export interface Bounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

// The box around a lit flow: its triggers, cards, splits, loop boxes and the bends of its edges.
export function focusBounds(layout: TopologyLayout, focus: TopologyFocus, orientation: TopologyOrientation): Bounds | undefined {
    const vertical = orientation === "vertical";
    const triggerSize = vertical ? { w: TRIGGER_LABEL_WIDTH, h: TRIGGER_STACKED_HEIGHT } : { w: TRIGGER_NODE_WIDTH, h: TRIGGER_SIZE };
    const boxes: { at: NodePosition; w: number; h: number }[] = [];
    focus.nodes.forEach((id) => {
        if (layout.agentPositions[id]) {
            boxes.push({ at: layout.agentPositions[id], w: AGENT_CARD_WIDTH, h: layout.cardHeights[id] });
        } else if (layout.triggerPositions[id]) {
            boxes.push({ at: layout.triggerPositions[id], ...triggerSize });
        } else if (layout.splitPositions[id]) {
            boxes.push({ at: layout.splitPositions[id], w: SPLIT_SIZE, h: SPLIT_SIZE });
        }
        const loopBox = layout.loopBoxes[id];
        if (loopBox) {
            boxes.push({ at: { x: loopBox.x, y: loopBox.y }, w: loopBox.width, h: loopBox.height });
        }
    });
    focus.edges.forEach((id) => (layout.edgeVias[id] ?? []).forEach((via) => boxes.push({ at: via, w: 0, h: 0 })));
    if (boxes.length === 0) {
        return undefined;
    }
    const left = Math.min(...boxes.map((box) => box.at.x));
    const top = Math.min(...boxes.map((box) => box.at.y));
    const right = Math.max(...boxes.map((box) => box.at.x + box.w));
    const bottom = Math.max(...boxes.map((box) => box.at.y + box.h));
    return { left, top, width: right - left, height: bottom - top };
}
