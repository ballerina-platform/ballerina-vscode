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

import { NodeModel } from "@projectstorm/react-diagrams";
import { PortModelAlignment } from "@projectstorm/react-diagrams-core";
import { NodePortModel } from "../../NodePort";
import { NODE_LOCKED, NodeTypes } from "../../../resources/constants";
import { TopologyEntryNode } from "../../AgentTopologyDiagram/types";

export function rowPortName(handlerId: string): string {
    return `out::${handlerId}`;
}

// An entry point only originates edges, so it registers out ports only: one per handler row, and one on the
// card itself for the rows it has folded away.
export class ServiceNodeModel extends NodeModel {
    readonly node: TopologyEntryNode;
    protected portOut: NodePortModel;

    constructor(node: TopologyEntryNode) {
        super({
            id: node.id,
            type: NodeTypes.SERVICE_NODE,
            locked: NODE_LOCKED,
        });
        this.node = node;
        this.addOutPort("out");
        // Only a service draws rows; an automation's single handler leaves the card's own port.
        if (node.kind === "service") {
            node.handlers.forEach((handler) => this.addOutPort(rowPortName(handler.id)));
        }
    }

    addPort<T extends NodePortModel>(port: T): T {
        super.addPort(port);
        if (port.getOptions().name === "out") {
            this.portOut = port;
        }
        return port;
    }

    addOutPort(name: string): NodePortModel {
        return this.addPort(new NodePortModel({ in: false, name, alignment: PortModelAlignment.RIGHT }));
    }

    getOutPort(): NodePortModel {
        return this.portOut;
    }

    // The row's own port, or the card's when that row is folded away and has none rendered.
    getRowPort(handlerId: string | undefined): NodePortModel {
        const row = handlerId ? (this.getPort(rowPortName(handlerId)) as NodePortModel) : undefined;
        return row ?? this.portOut;
    }

    getHeight(): number {
        return this.height;
    }
}
