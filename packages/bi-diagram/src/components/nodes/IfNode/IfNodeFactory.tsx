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

import React from "react";
import { AbstractReactFactory, GenerateModelEvent, GenerateWidgetEvent } from "@projectstorm/react-canvas-core";
import { DiagramEngine } from "@projectstorm/react-diagrams-core";
import { NodeTypes } from "../../../resources/constants";
import { IfNodeModel } from "./IfNodeModel";
import { IfNodeWidget } from "./IfNodeWidget";
import { MatchNodeWidget } from "./MatchNodeWidget";
import { DiffTooltip } from "../../DiffTooltip";

export class IfNodeFactory extends AbstractReactFactory<IfNodeModel, DiagramEngine> {
    constructor() {
        super(NodeTypes.IF_NODE);
    }

    generateModel(event: GenerateModelEvent): IfNodeModel {
        return new IfNodeModel(event.initialConfig);
    }

    generateReactWidget(event: GenerateWidgetEvent<IfNodeModel>) {
        if (event.model.node.codedata.node === "MATCH") {
            return (
                <DiffTooltip node={event.model.node}>
                    <MatchNodeWidget engine={this.engine} model={event.model} />
                </DiffTooltip>
            );
        }
        return (
            <DiffTooltip node={event.model.node}>
                <IfNodeWidget engine={this.engine} model={event.model} />
            </DiffTooltip>
        );
    }
}
