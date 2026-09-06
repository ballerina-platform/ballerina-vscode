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
import { LegendKind } from "./types";
import { SplitGlyph } from "./SplitGlyph";

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 6px;
    background-color: ${ThemeColors.SURFACE};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    font-family: "GilmerRegular";
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE};
`;

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const Line = styled.div<{ dashed?: boolean }>`
    width: 20px;
    height: 0;
    border-top: 1.5px ${(props) => (props.dashed ? "dashed" : "solid")} ${ThemeColors.ON_SURFACE};
`;

const SequenceSwatch = styled.div`
    position: relative;
    width: 20px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    &::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        border-top: 1.5px solid ${ThemeColors.ON_SURFACE};
    }
`;

const NumberSwatch = styled.div`
    position: relative;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid ${ThemeColors.ON_SURFACE};
    background-color: ${ThemeColors.SURFACE};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
`;

const GlyphSwatch = styled.div`
    width: 20px;
    display: flex;
    justify-content: center;
`;

const LEGEND_ROWS: Record<LegendKind, { label: string; explain: string; swatch: React.ReactNode }> = {
    trigger: {
        label: "Runs the agent",
        explain: "A trigger (an HTTP resource, a remote function, or main) runs this agent.",
        swatch: <Line />,
    },
    delegation: {
        label: "Delegates to",
        explain: "This agent uses the other agent as a tool.",
        swatch: <Line dashed />,
    },
    sequence: {
        label: "Runs in sequence",
        explain: "The same handler runs these agents in this order.",
        swatch: (
            <SequenceSwatch>
                <NumberSwatch>2</NumberSwatch>
            </SequenceSwatch>
        ),
    },
    condition: {
        label: "Runs one, by condition",
        explain: "Only one of these branches runs, depending on the condition shown on the edge.",
        swatch: (
            <GlyphSwatch>
                <SplitGlyph kind="if" size={20} />
            </GlyphSwatch>
        ),
    },
    fork: {
        label: "Runs all in parallel",
        explain: "These branches run at the same time.",
        swatch: (
            <GlyphSwatch>
                <SplitGlyph kind="fork" size={20} />
            </GlyphSwatch>
        ),
    },
    loop: {
        label: "Repeats in a loop",
        explain: "The handler runs this agent once per item (foreach) or while the condition holds (while); the loop header is under the node.",
        swatch: (
            <GlyphSwatch>
                <SplitGlyph kind="foreach" size={20} />
            </GlyphSwatch>
        ),
    },
};

const LEGEND_ORDER: LegendKind[] = ["trigger", "delegation", "sequence", "condition", "fork", "loop"];

export interface LegendProps {
    kinds: LegendKind[];
}

export function Legend({ kinds }: LegendProps) {
    if (kinds.length === 0) {
        return null;
    }
    const present = new Set(kinds);
    return (
        <Container>
            {LEGEND_ORDER.filter((kind) => present.has(kind)).map((kind) => (
                <Row key={kind} title={LEGEND_ROWS[kind].explain}>
                    {LEGEND_ROWS[kind].swatch}
                    <span>{LEGEND_ROWS[kind].label}</span>
                </Row>
            ))}
        </Container>
    );
}
