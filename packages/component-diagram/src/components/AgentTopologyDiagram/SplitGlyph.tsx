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
import { ThemeColors } from "@wso2/ui-toolkit";
import { NodeIcon } from "@wso2/bi-diagram";
import { SplitKind } from "./types";

// The flow diagram's If diamond, Fork square and loop square, shrunk to chip size. `size` is the box the
// glyph fits in; the diamond's square is scaled so its diagonal spans that box.
const Frame = styled.div<{ size: number }>`
    position: relative;
    width: ${(props) => props.size}px;
    height: ${(props) => props.size}px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
`;

const Shape = styled.div<{ side: number; diamond: boolean }>`
    position: absolute;
    width: ${(props) => props.side}px;
    height: ${(props) => props.side}px;
    box-sizing: border-box;
    border-radius: ${(props) => (props.diamond ? "3px" : "6px")};
    border: 1.5px solid ${ThemeColors.ON_SURFACE_VARIANT};
    background-color: ${ThemeColors.SURFACE_DIM};
    transform: ${(props) => (props.diamond ? "rotate(45deg)" : "none")};
`;

// NodeIcon's If glyph is a fixed 24 px SVG, so the wrapper sizes it.
const IconBox = styled.div<{ icon: number }>`
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: ${(props) => props.icon}px;
    height: ${(props) => props.icon}px;

    svg {
        width: ${(props) => props.icon}px;
        height: ${(props) => props.icon}px;
    }
`;

const NODE_KIND: Record<SplitKind, "IF" | "MATCH" | "FORK" | "WHILE" | "FOREACH"> = {
    if: "IF",
    match: "MATCH",
    fork: "FORK",
    while: "WHILE",
    foreach: "FOREACH",
};

export interface SplitGlyphProps {
    kind: SplitKind;
    size: number;
}

export function SplitGlyph({ kind, size }: SplitGlyphProps) {
    const diamond = kind === "if" || kind === "match";
    const side = diamond ? Math.round(size / Math.SQRT2) : Math.round(size * 0.8);
    const icon = Math.round(size * 0.42);
    return (
        <Frame size={size}>
            <Shape side={side} diamond={diamond} />
            <IconBox icon={icon}>
                <NodeIcon type={NODE_KIND[kind]} size={icon} />
            </IconBox>
        </Frame>
    );
}
