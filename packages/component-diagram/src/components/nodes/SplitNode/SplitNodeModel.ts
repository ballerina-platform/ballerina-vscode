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
import { TopologySplitNode } from "../../AgentTopologyDiagram/types";

export class SplitNodeModel extends NodeModel {
    readonly node: TopologySplitNode;
    private readonly portIn: NodePortModel;
    private readonly portOut: NodePortModel;

    constructor(node: TopologySplitNode) {
        super({
            id: node.id,
            type: NodeTypes.SPLIT_NODE,
            locked: NODE_LOCKED,
        });
        this.node = node;
        this.portIn = new NodePortModel({ in: true, name: "in", alignment: PortModelAlignment.LEFT });
        this.portOut = new NodePortModel({ in: false, name: "out", alignment: PortModelAlignment.RIGHT });
        super.addPort(this.portIn);
        super.addPort(this.portOut);
    }

    getInPort(): NodePortModel {
        return this.portIn;
    }

    getOutPort(): NodePortModel {
        return this.portOut;
    }
}
