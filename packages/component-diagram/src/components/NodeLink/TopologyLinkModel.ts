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

import { DefaultLinkModel } from "@projectstorm/react-diagrams";
import { ThemeColors } from "@wso2/ui-toolkit";
import { TOPOLOGY_LINK } from "../../resources/constants";
import { EdgeChip } from "../AgentTopologyDiagram/types";

export interface TopologyLinkModelOptions {
    dashed?: boolean;
    arrow?: boolean;
    chips?: EdgeChip[];
    bow?: number;
}

// Solid = trigger edge, dashed = agent-to-agent delegation. Chips (sequence number /
// condition text) are the only labels a link carries; numbers mean order, text means
// condition, dashed means delegation -- nothing else on the canvas is dashed.
export class TopologyLinkModel extends DefaultLinkModel {
    dashed = false;
    arrow = true;
    chips: EdgeChip[] = [];
    bow = 0;
    // Where the layout bends this edge.
    via: { x: number; y: number }[] = [];
    // Ports face each other vertically when the topology is laid out top to bottom.
    vertical = false;

    constructor(options: TopologyLinkModelOptions = {}) {
        super({
            type: TOPOLOGY_LINK,
            width: 1.5,
            color: ThemeColors.OUTLINE_VARIANT,
            selectedColor: ThemeColors.PRIMARY,
            curvyness: 0,
        });
        this.dashed = Boolean(options.dashed);
        this.arrow = options.arrow !== false;
        this.chips = options.chips ?? [];
        this.bow = options.bow ?? 0;
    }
}
