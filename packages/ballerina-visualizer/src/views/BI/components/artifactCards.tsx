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

import { ReactNode } from "react";
import { Icon } from "@wso2/ui-toolkit";
import { DIRECTORY_MAP } from "@wso2/ballerina-core";

/**
 * Single source of truth for the STATIC artifact cards and category copy shared by
 * `ComponentListView` (in-project add) and the wizard's type step. Only the DATA lives
 * here — each surface keeps its own layout and click behaviour. Card titles double as
 * search keys on both. Keep this module free of panel/step imports so both bundles can
 * import it without a cycle.
 */

/** The artifact kinds the Create Integration wizard can create. */
export type ArtifactKind = "automation" | "workflow" | "durable_agent" | "ai-agent" | "service";

/** A selectable artifact card, rendered as a `ButtonCard` on both surfaces. */
export interface ArtifactCard {
    id: string;
    kind: ArtifactKind;
    /** Card title. Doubles as the search key — see `cardMatchesSearch`. */
    displayName: string;
    description?: string;
    icon: ReactNode | string;
    isBeta?: boolean;
    /** The Ballerina module the card creates a service from, if any. */
    artifactInfo?: {
        org: string;
        packageName: string;
        moduleName: string;
        version?: string;
    };
    tooltip?: string;
}

export type ArtifactCategoryKey =
    | "automation"
    | "workflow"
    | "ai-integration"
    | "integration-as-api"
    | "event-integration"
    | "file-integration";

/** Heading and blurb for a category section, shown on both surfaces. */
export interface ArtifactCategoryMeta {
    key: ArtifactCategoryKey;
    title: string;
    description: string;
    /** Short label for the wizard's category rail/chips. */
    shortTitle: string;
    /** Codicon name shown beside the short label. */
    icon: string;
}

export const ARTIFACT_CATEGORY_META: Record<ArtifactCategoryKey, ArtifactCategoryMeta> = {
    automation: {
        key: "automation",
        title: "Automation",
        shortTitle: "Automation",
        icon: "sync",
        description: "Create an automation that can be invoked periodically or manually.",
    },
    workflow: {
        key: "workflow",
        title: "Durable Workflow",
        shortTitle: "Workflow",
        icon: "type-hierarchy",
        description: "Design static workflow logic that can be interrupted by events, use timer-based " +
            "activities, involve human tasks, and run for long periods with crash recovery enabled.",
    },
    "ai-integration": {
        key: "ai-integration",
        title: "AI Integration",
        shortTitle: "AI",
        icon: "hubot",
        description: "Create an integration that connects your system with AI capabilities.",
    },
    "integration-as-api": {
        key: "integration-as-api",
        title: "Integration as API",
        shortTitle: "API",
        icon: "globe",
        description: "Create an integration that can be exposed as an API in the specified protocol.",
    },
    "event-integration": {
        key: "event-integration",
        title: "Event Integration",
        shortTitle: "Event",
        icon: "broadcast",
        description: "Create an integration that can be triggered by an event.",
    },
    "file-integration": {
        key: "file-integration",
        title: "File Integration",
        shortTitle: "File",
        icon: "files",
        description: "Create an integration that can be triggered by the availability of files in a location.",
    },
};

export const AUTOMATION_CARD: ArtifactCard = {
    id: "automation",
    kind: "automation",
    displayName: "Automation",
    icon: <Icon name="bi-task" />,
};

export const WORKFLOW_CARD: ArtifactCard = {
    id: "workflow",
    kind: "workflow",
    displayName: "Durable Workflow",
    icon: <Icon name="bi-flowchart" />,
    tooltip: "Long-running workflow logic with events, timers, human tasks, and crash recovery."
};

export const DURABLE_AGENT_CARD: ArtifactCard = {
    id: "durable-agent",
    // It produces a workflow artifact like the card above; only the authoring model differs.
    kind: "durable_agent",
    displayName: "Durable Agentic Workflow",
    icon: <Icon name="bi-ai-agent" />,
    tooltip: "Agentic long-running workflow logic with events, timers, human tasks, and crash recovery."
};

export const AI_CHAT_AGENT_CARD: ArtifactCard = {
    id: "ai-agent-card",
    kind: "ai-agent",
    displayName: "Chat Agent Service",
    icon: <Icon name="bi-ai-agent" />,
};

/** TODO: Add the gRPC service card once gRPC support is working. */
export const INTEGRATION_API_CARDS: ArtifactCard[] = [
    {
        id: "http-service-card",
        kind: "service",
        displayName: "HTTP Service",
        icon: <Icon name="bi-globe" />,
        artifactInfo: {
            org: "ballerina",
            packageName: "http",
            moduleName: "http",
        },
    },
    {
        id: "graphql-service-card",
        kind: "service",
        displayName: "GraphQL Service",
        icon: <Icon name="bi-graphql" sx={{ color: "#e535ab" }} />,
        isBeta: true,
        artifactInfo: {
            org: "ballerina",
            packageName: "graphql",
            moduleName: "graphql",
        },
    },
    {
        id: "tcp-service-card",
        kind: "service",
        displayName: "TCP Service",
        icon: <Icon name="bi-tcp" />,
        isBeta: true,
        artifactInfo: {
            org: "ballerina",
            packageName: "tcp",
            moduleName: "tcp",
        },
    },
];

/** A supporting artifact (function, type, connection, …). Only exists inside an open package, so the pre-project wizard cannot offer them. */
export interface OtherArtifactCard {
    id: string;
    /** Card title. Doubles as the search key. */
    displayName: string;
    icon: ReactNode;
    /** Selects the creation view to open — see `OtherArtifactsPanel`. */
    directoryKey: DIRECTORY_MAP;
    isBeta?: boolean;
    /** Shown only when natural-programming support and experimental mode are on. */
    requiresNaturalFunctions?: boolean;
    /** Shown only inside a library package. */
    requiresLibrary?: boolean;
}

export const OTHER_ARTIFACT_CARDS: OtherArtifactCard[] = [
    {
        id: "bi-function",
        displayName: "Function",
        icon: <Icon name="bi-function" />,
        directoryKey: DIRECTORY_MAP.FUNCTION,
    },
    {
        id: "bi-ai-function",
        displayName: "Natural Function",
        icon: <Icon name="bi-ai-function" />,
        directoryKey: DIRECTORY_MAP.NP_FUNCTION,
        isBeta: true,
        requiresNaturalFunctions: true,
    },
    {
        id: "data-mapper",
        displayName: "Data Mapper",
        icon: <Icon name="dataMapper" />,
        directoryKey: DIRECTORY_MAP.DATA_MAPPER,
    },
    {
        id: "type",
        displayName: "Type",
        icon: <Icon name="bi-type" />,
        directoryKey: DIRECTORY_MAP.TYPE,
    },
    {
        id: "connection",
        displayName: "Connection",
        icon: <Icon name="bi-connection" />,
        directoryKey: DIRECTORY_MAP.CONNECTION,
    },
    {
        id: "agent",
        displayName: "Agent",
        icon: <Icon name="bi-ai-agent" />,
        directoryKey: DIRECTORY_MAP.AGENT,
    },
    {
        id: "agent-definition",
        displayName: "Agent Definition",
        icon: <Icon name="symbol-class" isCodicon={true} />,
        directoryKey: DIRECTORY_MAP.AGENT_DEFINITION,
        requiresLibrary: true,
    },
    {
        id: "configurable",
        displayName: "Configuration",
        icon: <Icon name="bi-config" />,
        directoryKey: DIRECTORY_MAP.CONFIGURABLE,
    },
];
