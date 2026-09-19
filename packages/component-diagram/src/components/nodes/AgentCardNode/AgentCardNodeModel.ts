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
import { TopologyAgentNode } from "../../AgentTopologyDiagram/types";

export class AgentCardNodeModel extends NodeModel {
    readonly node: TopologyAgentNode;
    protected portIn: NodePortModel;
    protected portOut: NodePortModel;

    constructor(node: TopologyAgentNode) {
        super({
            id: node.id,
            type: NodeTypes.AGENT_CARD_NODE,
            locked: NODE_LOCKED,
        });
        this.node = node;
        this.addInPort("in");
        this.addOutPort("out");
    }

    addPort<T extends NodePortModel>(port: T): T {
        super.addPort(port);
        if (port.getOptions().in) {
            this.portIn = port;
        } else {
            this.portOut = port;
        }
        return port;
    }

    addInPort(label: string): NodePortModel {
        return this.addPort(new NodePortModel({ in: true, name: label, alignment: PortModelAlignment.LEFT }));
    }

    addOutPort(label: string): NodePortModel {
        return this.addPort(new NodePortModel({ in: false, name: label, alignment: PortModelAlignment.RIGHT }));
    }

    getInPort(): NodePortModel {
        return this.portIn;
    }

    getOutPort(): NodePortModel {
        return this.portOut;
    }

    getHeight(): number {
        return this.height;
    }
}
