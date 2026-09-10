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

export enum NodeTypes {
    LISTENER_NODE = "listener-node",
    ENTRY_NODE = "entry-node",
    CONNECTION_NODE = "connection-node",
    AGENT_CARD_NODE = "agent-card-node",
    TRIGGER_NODE = "trigger-node",
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

// position
export const NODE_GAP_Y = 100;
export const NODE_GAP_X = 160;

// agent topology
export const AGENT_CARD_WIDTH = 280;
export const AGENT_CARD_MIN_HEIGHT = 112;
// One fade for everything hover focus lights or recedes: links, chips and nodes.
export const FOCUS_FADE_MS = 260;
export const TRIGGER_SIZE = 56;
export const TRIGGER_LABEL_WIDTH = 232;
export const TRIGGER_LABEL_GAP = 14;
export const TRIGGER_NODE_WIDTH = TRIGGER_LABEL_WIDTH + TRIGGER_LABEL_GAP + TRIGGER_SIZE;
export const TRIGGER_LABEL_BLOCK_HEIGHT = 34;
export const TRIGGER_STACKED_HEIGHT = TRIGGER_LABEL_BLOCK_HEIGHT + TRIGGER_LABEL_GAP + TRIGGER_SIZE;
export const TOPOLOGY_GAP_X = 160;
export const TOPOLOGY_GAP_X_MAX = 520;
export const TOPOLOGY_GAP_Y = 64;
export const TOPOLOGY_ROW_GAP = 120;
export const TOPOLOGY_COLUMN_GAP = 48;
export const LAYOUT_FIT_MARGIN = 40;
// How far apart, per step, edges that arrive at one node spread along its port side.
export const ARRIVAL_BOW_PX = 40;
