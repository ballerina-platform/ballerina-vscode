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
import { AgentSelection, EntrySelection, TopologyFocus, TopologyOrientation, TriggerSelection } from "./types";

export interface TopologyContextState {
    readonly?: boolean;
    orientation: TopologyOrientation;
    onAgentSelect: (agent: AgentSelection) => void;
    onTriggerSelect: (trigger: TriggerSelection) => void;
    // An orphan card's "Add Trigger" link; falls back to opening the agent when absent.
    onAddTrigger?: (agent: AgentSelection) => void;
    // The service card's menu; the menu is hidden unless both are given.
    onConfigureEntry?: (entry: EntrySelection) => void;
    onDeleteEntry?: (entry: EntrySelection) => void;
    // Set while a node is hovered: what it is connected to lights up, everything else recedes.
    focus?: TopologyFocus;
    setHovered?: (id?: string) => void;
    // How many handler rows each entry card draws; the rest fold behind "Show N more".
    visibleRows?: Record<string, number>;
    onExpandEntry?: (entryId: string) => void;
}

export const TopologyContext = React.createContext<TopologyContextState>({
    orientation: "horizontal",
    onAgentSelect: () => {},
    onTriggerSelect: () => {},
});

export const useTopologyContext = () => React.useContext(TopologyContext);

export function TopologyContextProvider(props: { children: React.ReactNode; value: TopologyContextState }) {
    return <TopologyContext.Provider value={props.value}>{props.children}</TopologyContext.Provider>;
}
