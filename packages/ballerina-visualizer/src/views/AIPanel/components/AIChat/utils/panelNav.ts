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

/** Full-page panels reachable from the chat. The chat itself is the empty stack. */
import type { AIPanelPrompt, AIPanelView } from "@wso2/ballerina-core";

/** The panel's surfaces are part of the cross-boundary payload, so core owns the union. */
export type PanelRoute = AIPanelView;

const PANEL_TITLES: Record<PanelRoute, string> = {
    settings: "Settings",
    mcp: "MCP Servers",
    skills: "Skills",
};

/** The arrow pops one level, so it has to name that level rather than always claiming the chat. */
export function backTooltipFor(panelStack: PanelRoute[]): string {
    return `Back to ${PANEL_TITLES[panelStack[panelStack.length - 2]] ?? "chat"}`;
}

/** Payloads that navigate instead of sending. Narrows so the caller's later field access stays typed. */
export type NavigationPrompt = Extract<AIPanelPrompt, { type: "view" } | { type: "thread" }>;

export function isNavigationPrompt(prompt: AIPanelPrompt): prompt is NavigationPrompt {
    return prompt?.type === "view" || prompt?.type === "thread";
}

/** What an initial prompt asks the panel to do before anything is sent. */
export type InitialPromptRoute =
    | { kind: "view"; view: PanelRoute }
    | { kind: "thread"; threadId: string }
    | { kind: "prompt" };

/**
 * Navigation-only payloads land the panel somewhere instead of sending something, so they skip the
 * prompt setup entirely.
 */
export function routeInitialPrompt(prompt: AIPanelPrompt): InitialPromptRoute {
    if (prompt?.type === "view") {
        return { kind: "view", view: prompt.view };
    }
    if (prompt?.type === "thread") {
        return { kind: "thread", threadId: prompt.threadId };
    }
    return { kind: "prompt" };
}
