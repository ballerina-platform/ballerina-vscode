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
import { DefaultPortModel, DefaultPortModelOptions, LinkModel, PortModelAlignment } from "@projectstorm/react-diagrams";
import { NodeLinkModel } from "../NodeLink";
import { AbstractModelFactory } from "@projectstorm/react-canvas-core";
import { NODE_PORT } from "../../resources/constants";

export class NodePortModel extends DefaultPortModel {
    /**
     * Y offset (from its owning node's top) that this port's row actually renders at, stamped on
     * by `buildDiagramData` for GraphQL function/group ports once their layout is known - see
     * `computeGraphQLPortOffsets` and `getPortAnchorY` in `utils/diagram.ts`. Undefined for every
     * other port, which keep using `getPortAnchorY`'s static row-index math instead.
     */
    rowOffsetY?: number;

    constructor(isIn: boolean, name?: string, label?: string);
    constructor(options: DefaultPortModelOptions);
    constructor(options: DefaultPortModelOptions | boolean, name?: string, label?: string) {
        if (!!name) {
            options = {
                in: !!options,
                name: name,
                label: label,
            };
        }
        options = options as DefaultPortModelOptions;
        super({
            label: options.label || options.name,
            alignment: options.in ? PortModelAlignment.TOP : PortModelAlignment.BOTTOM,
            type: NODE_PORT,
            ...options,
        });
    }

    createLinkModel(factory?: AbstractModelFactory<LinkModel>): LinkModel {
        let link = super.createLinkModel();
        if (!link && factory) {
            return factory.generateModel({});
        }
        return link || new NodeLinkModel();
    }
}
