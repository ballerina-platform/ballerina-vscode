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

import { useEffect, useState } from "react";
import { BaseAgentNodeModel } from "../BaseAgentNodeModel";
import { useDiagramContext, useTraceAnimation } from "../../DiagramContext";
import { CHART_COLORS, getAIColor, isDarkTheme } from "../../NodeIcon";
import { getBoxSyncPulseAnimation, getSyncPulseAnimation } from "../agentNodeUtils";

export function useAgentNodeController(model: BaseAgentNodeModel) {
    const context = useDiagramContext();
    const traceAnimation = useTraceAnimation();
    const [isBoxHovered, setIsBoxHovered] = useState(false);
    const [agentIdHovered, setAgentIdHovered] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    const [menuButtonElement, setMenuButtonElement] = useState<HTMLElement | null>(null);
    const [aiColor, setAiColor] = useState(() => getAIColor());
    const [isDarkMode, setIsDarkMode] = useState(() => isDarkTheme());
    const cyanColor = isDarkMode ? CHART_COLORS.BRIGHT_CYAN : CHART_COLORS.CYAN;

    useEffect(() => {
        if (model.node.suggested) {
            model.setAroundLinksDisabled(true);
        }
    }, [model, model.node.suggested]);

    return {
        context,
        traceAnimation,
        isSelected: context.selectedNodeId === model.node.id,
        isBoxHovered,
        setIsBoxHovered,
        agentIdHovered,
        setAgentIdHovered,
        anchorEl,
        setAnchorEl,
        menuButtonElement,
        setMenuButtonElement,
        isMenuOpen: Boolean(anchorEl),
        aiColor,
        syncPulseAnimation: getSyncPulseAnimation(cyanColor),
        boxSyncPulseAnimation: getBoxSyncPulseAnimation(cyanColor),
        hasBreakpoint: model.hasBreakpoint(),
        isActiveBreakpoint: model.isActiveBreakpoint(),
        handleThemeChange: () => {
            setIsDarkMode(isDarkTheme());
            setAiColor(getAIColor());
        },
    };
}
