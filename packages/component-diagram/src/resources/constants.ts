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

import { ThemeColors } from "@wso2/ui-toolkit";

export enum NodeTypes {
    LISTENER_NODE = "listener-node",
    ENTRY_NODE = "entry-node",
    CONNECTION_NODE = "connection-node",
    AGENT_CARD_NODE = "agent-card-node",
    SERVICE_NODE = "service-node",
}

export const NODE_LINK = "node-link";
export const TOPOLOGY_LINK = "topology-link";
export const NODE_PORT = "node-port";
export const LOADING_OVERLAY = "loading-overlay";

export const AUTOMATION_LISTENER = "automation-listener";

export const NODE_LOCKED = false;

// sizing
export const ENTRY_NODE_WIDTH = 240;
export const ENTRY_NODE_HEIGHT = 64;
export const CON_NODE_WIDTH = ENTRY_NODE_WIDTH - 40;
export const CON_NODE_HEIGHT = ENTRY_NODE_HEIGHT;
export const LISTENER_NODE_WIDTH = CON_NODE_WIDTH;
export const LISTENER_NODE_HEIGHT = CON_NODE_HEIGHT;

export const NODE_BORDER_WIDTH = 1.5;
export const NODE_PADDING = 8;

// Shared "quiet but legible" strength for the diagram's structural lines - a node's resting
// border and a link both read as connective structure rather than content, so both derive from
// the same base foreground color at the same strength (see NodeLinkWidget.tsx's stroke-opacity
// and NODE_BORDER_COLOR below) instead of two different tokens that happen to look similar in
// only some themes - see the ON_SURFACE/OUTLINE_VARIANT contrast mismatch this replaced.
export const STRUCTURE_OPACITY = 0.45;
/** Resting border color for a node, matching a link's dimmed ON_SURFACE exactly (same source
 * color, same opacity) so borders and links read as one consistent line style. Hover states keep
 * using ThemeColors.HIGHLIGHT directly - only the resting color is shared here. */
export const NODE_BORDER_COLOR = `var(--vscode-contrastBorder, color-mix(in srgb, ${ThemeColors.ON_SURFACE} ${STRUCTURE_OPACITY * 100}%, transparent))`;
export const NODE_BG_HOVER_COLOR = ThemeColors.PRIMARY_CONTAINER;
export const NODE_HOVER_GLOW = `0 0 4px 1px ${ThemeColors.PRIMARY}`;

// position
export const NODE_GAP_Y = 100;
export const NODE_GAP_X = 160;

// agent topology
export const AGENT_CARD_WIDTH = 280;
export const AGENT_CARD_MIN_HEIGHT = 112;
// Inlets sit on a durable card's left border, one per channel, from the top; past two they fold into "+N".
export const INLET_TOP_OFFSET = 66;
export const INLET_PITCH = 24;
export const INLET_VISIBLE_MAX = 2;
// A plain workflow card names its human tasks as rows, like a service's handlers; past this many they fold
// into a "+N more" row, same row height as a service's.
export const WORKFLOW_ROW_CAP = 3;
// Air between a workflow card's header and its first task row, so the divider does not sit on the name.
export const WORKFLOW_TASKS_GAP = 10;
// A run into a durable card lands on its header glyph, clear of the inlets below; runs that share the card spread
// only this fraction of a step (16px at most) so none of them reaches an inlet.
export const DURABLE_RUN_PORT_OFFSET = 30;
export const DURABLE_ARRIVAL_BOW = 0.4;
// Gates and orphans wear the light-bulb yellow (the active border in high contrast); an event edge the charts' purple.
export const WARNING_COLOR = "var(--vscode-contrastActiveBorder, var(--vscode-editorLightBulb-foreground))";
// Set on the topology root from bi-diagram's data-event colour, so the overview's events match the durable node's icon.
export const EVENT_COLOR_VAR = "--topology-event-color";
export const EVENT_COLOR = `var(${EVENT_COLOR_VAR}, var(--vscode-terminal-ansiBrightMagenta))`;
// One fade for everything hover focus lights or recedes: links, chips and nodes.
export const FOCUS_FADE_MS = 260;
// The entry card: a service with its handlers as rows, or an automation with none.
export const ENTRY_CARD_WIDTH = 232;
export const ENTRY_HEADER_HEIGHT = 56;
export const ENTRY_ROW_HEIGHT = 36;
// The "+N more" row a folded card ends with.
export const ENTRY_FOOTER_HEIGHT = 30;
// Top to bottom a row's edge steps out of the card and drops down a lane beside it: the nearest lane this far
// from the card's edge, one more lane per row further out.
export const ROW_LANE_GAP = 20;
export const ROW_LANE_PITCH = 12;
// A card never folds below this many rows, however little canvas there is.
export const ENTRY_MIN_ROWS = 3;
// Top to bottom, the entry cards sit in one row across the canvas; this is the share of its height they may take
// before their rows fold, so the agents below them stay in view.
export const ENTRY_ROW_BAND = 0.4;

export const TOPOLOGY_GAP_X = 160;
export const TOPOLOGY_GAP_X_MAX = 520;
// Two columns have no column between them to give the canvas's spare room to.
export const TOPOLOGY_GAP_X_PAIR = 240;
export const TOPOLOGY_GAP_Y = 64;
export const TOPOLOGY_ROW_GAP = 120;
export const TOPOLOGY_COLUMN_GAP = 48;
export const LAYOUT_FIT_MARGIN = 40;
// How far apart, per step, edges that arrive at one node spread along its port side.
export const ARRIVAL_BOW_PX = 40;
