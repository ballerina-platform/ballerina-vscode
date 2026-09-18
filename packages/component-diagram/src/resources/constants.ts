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
}

export const NODE_LINK = "node-link";
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

// `Box`'s own row gap, and a row's (`StyledServiceBox`'s) own rendered height - shared with
// diagram.ts's row-layout math (ENTRY_ROW_HEIGHT etc. in getPortAnchorY/calculateEntryNodeHeight)
// so the two can't drift out of sync the way a bare number restated in both places could.
export const ENTRY_ROW_GAP = 8;
export const ENTRY_ROW_CONTENT_HEIGHT = 40;
// ServiceBox's own rendered height - same reasoning as ENTRY_ROW_CONTENT_HEIGHT above, so
// diagram.ts's row-layout math and styles.ts's CSS both compute this the same one way.
export const ENTRY_HEADER_CONTENT_HEIGHT = ENTRY_NODE_HEIGHT - NODE_PADDING;

// A workflow node's "in" port sits inside its play button (see PlayButtonCircle), not centered
// on the box like other entry nodes' - these let getPortAnchorY derive the port's real on-screen
// Y from the same numbers that position the button.
export const WORKFLOW_PLAY_BUTTON_TOP = 22;
export const WORKFLOW_PLAY_BUTTON_SIZE = 28;

// Shared "quiet but legible" strength for the diagram's structural lines - a node's resting
// border and a link both read as connective structure rather than content, so both derive from
// the same base foreground color at the same strength (see NodeLinkWidget.tsx's stroke-opacity
// and NODE_BORDER_COLOR below) instead of two different tokens that happen to look similar in
// only some themes - see the ON_SURFACE/OUTLINE_VARIANT contrast mismatch this replaced.
export const STRUCTURE_OPACITY = 0.7;
/** Resting border color for a node, matching a link's dimmed ON_SURFACE exactly (same source
 * color, same opacity) so borders and links read as one consistent line style. Hover states keep
 * using ThemeColors.HIGHLIGHT directly - only the resting color is shared here. */
export const NODE_BORDER_COLOR = `color-mix(in srgb, ${ThemeColors.ON_SURFACE} ${STRUCTURE_OPACITY * 100}%, transparent)`;

// position
export const NODE_GAP_Y = 100;
export const NODE_GAP_X = 160;
