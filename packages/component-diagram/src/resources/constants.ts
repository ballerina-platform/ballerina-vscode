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

// position
export const NODE_GAP_Y = 100;
export const NODE_GAP_X = 160;
