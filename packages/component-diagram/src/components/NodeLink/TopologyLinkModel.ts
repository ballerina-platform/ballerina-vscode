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
import { TopologyEdgeKind } from "../AgentTopologyDiagram/types";

export interface TopologyLinkModelOptions {
    edgeId?: string;
    kind?: TopologyEdgeKind;
    gated?: boolean;
    gatedBy?: string[];
    bow?: number;
}

// Solid = an entry point runs this agent, or the next step of an ordered handler; dotted = a trigger sends an
// event into a durable agent's inlet; dashed = agent-to-agent delegation, with a lock when the hand-off is gated.
// A link carries no other label: a condition or a step number is a fact about one call site, and an edge stands
// for a whole handler.
export class TopologyLinkModel extends DefaultLinkModel {
    edgeId = "";
    kind: TopologyEdgeKind = "trigger";
    gated = false;
    gatedBy: string[] = [];
    bow = 0;
    // Where the layout bends this edge.
    via: { x: number; y: number }[] = [];
    // Ports face each other vertically when the topology is laid out top to bottom.
    vertical = false;
    // Top to bottom, a row's edge steps sideways to this cross position before it drops; other edges drop from their port.
    lane?: number;

    constructor(options: TopologyLinkModelOptions = {}) {
        super({
            type: TOPOLOGY_LINK,
            width: 1.5,
            color: ThemeColors.OUTLINE_VARIANT,
            selectedColor: ThemeColors.PRIMARY,
            curvyness: 0,
        });
        this.edgeId = options.edgeId ?? "";
        this.kind = options.kind ?? "trigger";
        this.gated = Boolean(options.gated);
        this.gatedBy = options.gatedBy ?? [];
        this.bow = options.bow ?? 0;
    }
}
