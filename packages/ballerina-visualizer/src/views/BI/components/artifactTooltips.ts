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

import type { ServiceModel } from "@wso2/ballerina-core";

/**
 * Tooltip copy for the artifact cards. Pure and free of UI imports so it can be unit tested
 * without pulling in `artifactCards.tsx`'s icon dependencies; re-exported from there.
 */

/** Width at which artifact card tooltips wrap and become expandable. Other `ButtonCard`s keep the default tooltip. */
export const ARTIFACT_TOOLTIP_MAX_WIDTH = 300;

/** How a trigger card is grouped: the AI panel lists `mcp` and `ai` triggers together. */
export type TriggerTooltipKind = "event" | "file" | "mcp";

/**
 * A trigger card's tooltip: the connector's own documentation, or a sentence built from its
 * name when the language server sends none. Shared by the side panels and the wizard so the
 * two always show the same text.
 */
export function triggerTooltip(
    item: Pick<ServiceModel, "name" | "moduleName" | "documentation">,
    kind: TriggerTooltipKind
): string {
    if (item.documentation) {
        return item.documentation;
    }
    switch (kind) {
        case "file":
            return `A service triggered by the availability of files via ${item.name}.`;
        case "mcp":
            return `An MCP tool provider service using the ${item.moduleName} module.`;
        default:
            return `A service triggered by ${item.name} events.`;
    }
}
