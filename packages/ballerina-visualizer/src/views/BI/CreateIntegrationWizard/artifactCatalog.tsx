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

import { ServiceModel, TriggerModelsResponse } from "@wso2/ballerina-core";

import {
    ARTIFACT_CATEGORY_META,
    ArtifactCard,
    ArtifactCategoryKey,
    AUTOMATION_CARD,
    INTEGRATION_API_CARDS,
    WORKFLOW_CARD,
    DURABLE_AGENT_CARD,
} from "../components/artifactCards";
import { isBetaModule } from "../ComponentListView/componentListUtils";
import { getEntryNodeIcon } from "../ComponentListView/EventIntegrationPanel";
import { getFileIntegrationIcon } from "../ComponentListView/FileIntegrationPanel";
import { effectiveTriggerKind } from "../ComponentListView/triggerKind";

/**
 * The Integration Type step's catalog: composes the shared card data and
 * category copy from `components/artifactCards.tsx` (the same source the
 * in-project ComponentListView panels read) into the wizard's ordered category
 * sections, and expands the dynamically discovered trigger cards.
 */

export type { ArtifactCard, ArtifactCategoryKey, ArtifactKind } from "../components/artifactCards";

/** Trigger types resolved dynamically via `getTriggerModels`. */
export type DynamicTriggerType = "event" | "file" | "mcp";

/** Marker expanded at render time into `triggersToCards(triggers, <type>)`. */
export type DynamicCardSource = `dynamic:${DynamicTriggerType}`;

/** An ordered category section of the Integration Type step. */
export interface ArtifactCategory {
    key: ArtifactCategoryKey;
    title: string;
    description: string;
    /** Short label shown in the category rail (falls back to `title`). */
    shortTitle?: string;
    /** Codicon name shown beside the rail label. */
    icon?: string;
    /** Static cards and/or dynamic trigger markers, in display order. */
    cards: (ArtifactCard | DynamicCardSource)[];
}

/**
 * Converts trigger models into artifact cards, replicating the per-panel
 * filtering, icon resolution, and beta badging:
 * - `event` mirrors EventIntegrationPanel, `mcp` mirrors the trigger cards in AIAgentPanel
 *   (dotted module names dashed in ids, `getEntryNodeIcon`, `isBetaModule` badges).
 * - `file` mirrors FileIntegrationPanel (raw module name in ids,
 *   `getFileIntegrationIcon`, no beta badge).
 *
 * @param triggers The trigger models fetched via `getTriggerModels`.
 * @param type The trigger type to include.
 * @returns The matching triggers as artifact cards, in response order.
 */
export function triggersToCards(triggers: TriggerModelsResponse, type: DynamicTriggerType): ArtifactCard[] {
    return triggers.local
        .filter((trigger) => effectiveTriggerKind(trigger) === type)
        .map((trigger) => triggerToCard(trigger, type));
}

function triggerToCard(item: ServiceModel, type: DynamicTriggerType): ArtifactCard {
    const artifactInfo = {
        org: item.orgName,
        packageName: item.packageName,
        moduleName: item.moduleName,
        version: item.version,
    };

    if (type === "file") {
        return {
            id: `trigger-${item.moduleName}`,
            kind: "service",
            displayName: item.name,
            icon: getFileIntegrationIcon(item),
            artifactInfo,
        };
    }

    return {
        id: `trigger-${item.moduleName.replace(/\./g, "-")}`,
        kind: "service",
        displayName: item.name,
        icon: getEntryNodeIcon(item),
        isBeta: isBetaModule(item.moduleName),
        artifactInfo,
    };
}

/** Builds a category section from the shared copy plus its cards. */
function category(key: ArtifactCategoryKey, cards: (ArtifactCard | DynamicCardSource)[]): ArtifactCategory {
    return { ...ARTIFACT_CATEGORY_META[key], cards };
}

/**
 * The wizard's category sections, in display order. Titles, descriptions, and
 * static cards come from the shared catalog, so they stay identical to the
 * in-project ComponentListView panels by construction.
 */
export const ARTIFACT_CATEGORIES: ArtifactCategory[] = [
    category("automation", [AUTOMATION_CARD]),
    category("workflow", [WORKFLOW_CARD, DURABLE_AGENT_CARD]),
    // TODO: Re-add `AI_CHAT_AGENT_CARD` (from ../components/artifactCards) as the
    // first card here once creating an AI chat agent from the pre-project wizard is
    // fully supported. It stays available on the in-project Add-Artifact screen
    // (ComponentListView/AIAgentPanel), which is why the card itself is untouched.
    category("ai-integration", ["dynamic:mcp"]),
    category("integration-as-api", [...INTEGRATION_API_CARDS]),
    category("event-integration", ["dynamic:event"]),
    category("file-integration", ["dynamic:file"]),
];
