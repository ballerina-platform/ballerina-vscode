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
import { TopologyTriggerNode } from "../../AgentTopologyDiagram/types";

// A trigger only originates edges (into agents), so it registers an out port only.
export class TriggerNodeModel extends NodeModel {
    readonly node: TopologyTriggerNode;
    protected portOut: NodePortModel;

    constructor(node: TopologyTriggerNode) {
        super({
            id: node.id,
            type: NodeTypes.TRIGGER_NODE,
            locked: NODE_LOCKED,
        });
        this.node = node;
        this.addOutPort("out");
    }

    addPort<T extends NodePortModel>(port: T): T {
        super.addPort(port);
        this.portOut = port;
        return port;
    }

    addOutPort(label: string): NodePortModel {
        return this.addPort(new NodePortModel({ in: false, name: label, alignment: PortModelAlignment.RIGHT }));
    }

    getOutPort(): NodePortModel {
        return this.portOut;
    }

    getHeight(): number {
        return this.height;
    }
}
