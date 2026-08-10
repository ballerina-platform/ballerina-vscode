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

import { DefaultLinkModel } from "@projectstorm/react-diagrams";
import { LINK_COLOR, LINK_HOVERED_COLOR, NODE_GAP_Y, NODE_LINK, NodeTypes } from "../../resources/constants";
import { Branch, FlowNode, FlowNodeDiffState, LinePosition, NodeModel } from "../../utils/types";

export const LINK_BOTTOM_OFFSET = 30;

export interface NodeLinkModelOptions {
    id?: string;
    label?: string;
    showAddButton?: boolean; // default true
    showButtonAlways?: boolean; // default false
    showArrow?: boolean; // default true
    brokenLine?: boolean; // default false
    disabled?: boolean; // default false
    alignBottom?: boolean; // default false
    diffState?: FlowNodeDiffState; // review diff lane the link belongs to
    linkCounter?: number;
    onAddClick?: () => void;
}

export class NodeLinkModel extends DefaultLinkModel {
    linkId: string;
    label: string;
    sourceNode: NodeModel;
    targetNode: NodeModel;
    topNode: FlowNode | Branch; // top statement node or parent block node
    target: LinePosition;
    // options
    showArrow = true;
    showAddButton = true;
    showButtonAlways = false;
    brokenLine = false;
    disabled = false;
    alignBottom = false;
    diffState: FlowNodeDiffState | undefined = undefined;
    linkBottomOffset = LINK_BOTTOM_OFFSET;
    linkCounter?: number;
    onAddClick?: () => void;

    constructor(label?: string);
    constructor(options: NodeLinkModelOptions);
    constructor(options: NodeLinkModelOptions | string) {
        super({
            type: NODE_LINK,
            width: 10,
            color: LINK_COLOR,
            selectedColor: LINK_HOVERED_COLOR,
            curvyness: 0,
        });
        if (options) {
            if (typeof options === "string" && options.length > 0) {
                this.label = options;
                this.linkBottomOffset = LINK_BOTTOM_OFFSET + 40;
            } else {
                if ((options as NodeLinkModelOptions).id) {
                    this.linkId = (options as NodeLinkModelOptions).id;
                }
                if ((options as NodeLinkModelOptions).label) {
                    this.label = (options as NodeLinkModelOptions).label;
                }
                if ((options as NodeLinkModelOptions).showAddButton === false) {
                    this.showAddButton = (options as NodeLinkModelOptions).showAddButton;
                }
                if ((options as NodeLinkModelOptions).showButtonAlways === true) {
                    this.showButtonAlways = (options as NodeLinkModelOptions).showButtonAlways;
                }
                if ((options as NodeLinkModelOptions).showArrow === false) {
                    this.showArrow = (options as NodeLinkModelOptions).showArrow;
                }
                if ((options as NodeLinkModelOptions).brokenLine === true) {
                    this.brokenLine = (options as NodeLinkModelOptions).brokenLine;
                }
                if ((options as NodeLinkModelOptions).disabled === true) {
                    this.disabled = (options as NodeLinkModelOptions).disabled;
                }
                if ((options as NodeLinkModelOptions).alignBottom === true) {
                    this.alignBottom = (options as NodeLinkModelOptions).alignBottom;
                }
                if ((options as NodeLinkModelOptions).diffState) {
                    this.diffState = (options as NodeLinkModelOptions).diffState;
                }
                if ((options as NodeLinkModelOptions).linkCounter) {
                    this.linkCounter = (options as NodeLinkModelOptions).linkCounter;
                }
            }
            if ((options as NodeLinkModelOptions).onAddClick) {
                this.onAddClick = (options as NodeLinkModelOptions).onAddClick;
            }
        }
    }

    setSourceNode(node: NodeModel) {
        this.sourceNode = node;
    }

    setTargetNode(node: NodeModel) {
        this.targetNode = node;
    }

    setTopNode(node: FlowNode | Branch) {
        this.topNode = node;
    }

    getTopNode(): FlowNode | Branch {
        return this.topNode;
    }

    setTarget(target: LinePosition) {
        this.target = target;
    }

    getTarget(): LinePosition {
        return this.target;
    }

    setDisabled(disabled: boolean) {
        this.disabled = disabled;
    }

    isDisabled(): boolean {
        return this.disabled;
    }

    setBrokenLine(brokenLine: boolean) {
        this.brokenLine = brokenLine;
    }

    isBrokenLine(): boolean {
        return this.brokenLine;
    }

    getSVGPath(): string {
        if (this.points.length != 2) {
            return "";
        }

        let source = this.getFirstPoint().getPosition();
        let target = this.getLastPoint().getPosition();
        // bending y position
        let bendY = this.alignBottom ? target.y : source.y + this.linkBottomOffset;

        // is lines are straight?
        let tolerance = 10;
        let isStraight = Math.abs(source.y - target.y) <= tolerance || Math.abs(source.x - target.x) <= tolerance;
        if (isStraight) {
            let path = `M ${source.x} ${source.y} `;
            path += `L ${target.x} ${target.y}`;
            return path;
        }

        // generate 2 angle lines
        let curveOffset = Math.min(Math.abs(source.x - target.x) / 2, Math.abs(source.y - target.y) / 2, 10);
        // is the target on the right?
        let isRight = source.x < target.x;

        let path = `M ${source.x} ${source.y} `;
        path += `L ${source.x} ${bendY - curveOffset} `;
        if (isRight) {
            path += `A ${curveOffset},${curveOffset} 0 0 0 ${source.x + curveOffset},${bendY} `;
            if (!this.alignBottom) {
                path += `L ${target.x - curveOffset} ${bendY} `;
                path += `A ${curveOffset},${curveOffset} 0 0 1 ${target.x},${bendY + curveOffset} `;
            }
        } else {
            path += `A ${curveOffset},${curveOffset} 0 0 1 ${source.x - curveOffset},${bendY} `;
            if (!this.alignBottom) {
                path += `L ${target.x + curveOffset} ${bendY} `;
                path += `A ${curveOffset},${curveOffset} 0 0 0 ${target.x},${bendY + curveOffset} `;
            }
        }
        path += `L ${target.x} ${target.y}`;
        return path;
    }

    // get add button position
    getAddButtonPosition(): { x: number; y: number } {
        if (this.points.length != 2 && !this.showAddButton) {
            return { x: 0, y: 0 };
        }

        let source = this.getFirstPoint().getPosition();
        let target = this.getLastPoint().getPosition();

        // For branch links with labels
        if (this.label && !this.alignBottom) {
            // Calculate bend position
            const bendY = source.y + this.linkBottomOffset;
            // Position in the middle between bend and target
            return {
                x: target.x,
                y: bendY + NODE_GAP_Y / 2,
            };
        }

        // is lines are straight?
        let tolerance = 10;
        let isStraight = Math.abs(source.y - target.y) <= tolerance || Math.abs(source.x - target.x) <= tolerance;
        if (isStraight) {
            return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 - 5 };
        }

        // generate for 2 angle lines
        const diffY = Math.abs(source.y - target.y);
        return {
            x: this.alignBottom ? source.x : target.x,
            y: this.alignBottom ? source.y + Math.min(diffY, NODE_GAP_Y) / 2 : target.y - NODE_GAP_Y / 2,
        };
    }

    // show node arrow. default true. but target node is a EmptyNodeModel, then false
    showArrowToNode(): boolean {
        if (this.showArrow === false) {
            return this.showArrow;
        }
        if (this.points.length != 2) {
            return false;
        }
        if (this.targetNode?.getType() === NodeTypes.EMPTY_NODE) {
            return false;
        }
        return true;
    }
}
