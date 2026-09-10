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

import React from "react";
import styled from "@emotion/styled";
import { NodeIcon } from "@wso2/bi-diagram";
import { HandlerConstruct, HandlerLogic } from "./types";

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
`;

// NodeIcon's If glyph is a fixed 24 px svg that ignores the size it is passed, so the wrapper sizes it.
const IconBox = styled.div<{ size: number }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: ${(props) => props.size}px;
    height: ${(props) => props.size}px;
    flex: none;

    svg {
        width: ${(props) => props.size}px;
        height: ${(props) => props.size}px;
        display: block;
    }
`;

const NODE_KIND: Record<HandlerLogic, "IF" | "FORK" | "FOREACH"> = { branch: "IF", fork: "FORK", loop: "FOREACH" };

const CONSTRUCT_WORD: Record<HandlerConstruct["kind"], string> = {
    if: "If",
    match: "Match",
    fork: "Fork",
    while: "While",
    foreach: "Foreach",
};

const CLOSING_LINE: Record<HandlerLogic, string> = {
    branch: "Open the flow to see which condition leads where.",
    fork: "Open the flow to see what runs together.",
    loop: "Open the flow to see what repeats.",
};

const MAX_LABELS = 3;

// What the source actually says, one line per construct: `Foreach · ticket in payload.tickets`.
function constructLine(construct: HandlerConstruct): string {
    const word = CONSTRUCT_WORD[construct.kind];
    if (construct.labels.length === 0) {
        return word;
    }
    const shown = construct.labels.slice(0, MAX_LABELS).join(", ");
    const rest = construct.labels.length - MAX_LABELS;
    return `${word} · ${shown}${rest > 0 ? `, +${rest} more` : ""}`;
}

export function logicTooltip(logic: HandlerLogic, constructs: HandlerConstruct[]): string {
    const lines = constructs.filter((construct) => construct.logic === logic).map(constructLine);
    return [...lines, CLOSING_LINE[logic]].join("\n");
}

export interface LogicBadgeProps {
    kinds: HandlerLogic[];
    // Omitted where the badge is only a swatch, as in the legend, which explains itself in its own row.
    constructs?: HandlerConstruct[];
    size?: number;
}

// The flow diagram's own If, Fork and loop glyphs at label size: a mark saying there is logic in this handler
// that the canvas does not draw.
export function LogicBadge({ kinds, constructs, size = 14 }: LogicBadgeProps) {
    if (kinds.length === 0) {
        return null;
    }
    return (
        <Row>
            {kinds.map((kind) => (
                <IconBox key={kind} size={size} title={constructs?.length ? logicTooltip(kind, constructs) : undefined}>
                    <NodeIcon type={NODE_KIND[kind]} size={size} />
                </IconBox>
            ))}
        </Row>
    );
}
