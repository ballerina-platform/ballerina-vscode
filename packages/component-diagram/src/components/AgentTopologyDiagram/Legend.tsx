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
import { EVENT_COLOR, WARNING_COLOR } from "../../resources/constants";
import { LockChip } from "../NodeLink/TopologyLinkWidget";
import { LegendKind } from "./types";

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

const SWATCH_W = 24;
const SWATCH_H = 16;
const TIP = 6;

function Line({ dash, color = "currentColor" }: { dash?: string; color?: string }) {
    const y = SWATCH_H / 2;
    return (
        <svg width={SWATCH_W} height={SWATCH_H} style={{ flex: "none", overflow: "visible" }}>
            <line x1={0} y1={y} x2={SWATCH_W - TIP} y2={y} stroke={color} strokeWidth={1.5} strokeDasharray={dash} />
            <polygon points={`${SWATCH_W - TIP},${y - TIP / 2} ${SWATCH_W},${y} ${SWATCH_W - TIP},${y + TIP / 2}`} fill={color} />
        </svg>
    );
}

function LockSwatch() {
    return (
        <svg width={SWATCH_W} height={SWATCH_H} style={{ flex: "none", overflow: "visible" }}>
            <g transform={`translate(${SWATCH_W / 2} ${SWATCH_H / 2}) scale(0.75)`}>
                <LockChip at={{ x: 0, y: 0 }} />
            </g>
        </svg>
    );
}

const GateSwatch = styled.span`
    display: inline-block;
    margin: 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: ${WARNING_COLOR};
`;

const Swatch = styled.div`
    width: ${SWATCH_W}px;
    display: flex;
    justify-content: flex-start;
    flex: none;
`;

const LEGEND_ROWS: Record<LegendKind, { label: string; explain: string; swatch: React.ReactNode }> = {
    trigger: {
        label: "Runs the agent",
        explain: "A trigger (an HTTP resource, a remote function, or main) runs this agent.",
        swatch: <Swatch><Line /></Swatch>,
    },
    event: {
        label: "Sends an event",
        explain: "A trigger sends an event into one of this durable agent's channels while it runs.",
        swatch: <Swatch><Line dash="2 3" color={EVENT_COLOR} /></Swatch>,
    },
    delegation: {
        label: "Delegates to",
        explain: "This agent uses the other agent as a tool.",
        swatch: <Swatch><Line dash="4 3" /></Swatch>,
    },
    gate: {
        label: "Hand-off needs approval",
        explain: "This agent hands the request to the other agent only after a person releases it.",
        swatch: <Swatch><LockSwatch /></Swatch>,
    },
    people: {
        label: "Stops for a person",
        explain: "This durable agent waits for a person to release the marked call; hover the circle to see who.",
        swatch: <Swatch><GateSwatch /></Swatch>,
    },
};

const LEGEND_ORDER: LegendKind[] = ["trigger", "event", "delegation", "gate", "people"];

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
