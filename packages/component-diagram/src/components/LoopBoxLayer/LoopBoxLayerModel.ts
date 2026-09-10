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
    AbstractModelFactory,
    BaseModel,
    BaseModelGenerics,
    CanvasEngine,
    CanvasEngineListener,
    CanvasModel,
    CanvasModelGenerics,
    FactoryBank,
    FactoryBankListener,
    LayerModel,
    LayerModelGenerics,
} from "@projectstorm/react-canvas-core";
import { DiagramEngine } from "@projectstorm/react-diagrams";
import { TOPOLOGY_LOOP_BOX_LAYER } from "../../resources/constants";

export interface LoopBoxLayerModelGenerics extends LayerModelGenerics {
    ENGINE: DiagramEngine;
}

// The dashed boxes around loop bodies are painted here, under every node and link.
export class LoopBoxLayerModel<G extends LoopBoxLayerModelGenerics = LoopBoxLayerModelGenerics> extends LayerModel<G> {
    constructor() {
        super({ type: TOPOLOGY_LOOP_BOX_LAYER, isSvg: false, transformed: true });
    }

    getChildModelFactoryBank(
        _engine: G["ENGINE"]
    ): FactoryBank<
        AbstractModelFactory<
            BaseModel<BaseModelGenerics>,
            CanvasEngine<CanvasEngineListener, CanvasModel<CanvasModelGenerics>>
        >,
        FactoryBankListener<
            AbstractModelFactory<
                BaseModel<BaseModelGenerics>,
                CanvasEngine<CanvasEngineListener, CanvasModel<CanvasModelGenerics>>
            >
        >
    > {
        throw new Error("Method not implemented.");
    }
}
