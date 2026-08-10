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

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SearchBox, View, ViewContent } from "@wso2/ui-toolkit";
import { isSamePath, SCOPE, TriggerModelsResponse } from "@wso2/ballerina-core";

import { TitleBar } from "../../../components/TitleBar";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { AddPanel, Chip, ChipRow, ClearSearchButton, Container, EmptyState, FilterBar, SearchSlot } from "./styles";
import { AutomationPanel } from "./AutomationPanel";
import { CentralSearchPanel } from "./CentralSearchPanel";
import { WorkflowPanel } from "./WorkflowPanel";
import { EventIntegrationPanel } from "./EventIntegrationPanel";
import { FileIntegrationPanel } from "./FileIntegrationPanel";
import { IntegrationAPIPanel } from "./IntegrationApiPanel";
import { OtherArtifactsPanel } from "./OtherArtifactsPanel";
import { AIAgentPanel } from "./AIAgentPanel";
import { useVisualizerContext } from "../../../Context";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ARTIFACT_CATEGORY_META, ArtifactCategoryKey } from "../components/artifactCards";

interface ComponentListViewProps {
    projectPath: string;
    scope: SCOPE;
};

const ALL_CATEGORY = "all";
/** Supporting artifacts (functions, types, connections, …) — in-project only. */
const OTHER_CATEGORY = "other";

type CategoryChipKey = typeof ALL_CATEGORY | ArtifactCategoryKey | typeof OTHER_CATEGORY;

/**
 * Category chips shown above the artifact panels. The integration categories and
 * their labels come from the shared catalog, so they stay in step with the Create
 * Integration wizard's type picker; "All" and "Other" are local to this screen.
 */
const CATEGORY_CHIPS: { key: CategoryChipKey; label: string }[] = [
    { key: ALL_CATEGORY, label: "All" },
    ...Object.values(ARTIFACT_CATEGORY_META).map((category) => ({
        key: category.key,
        label: category.shortTitle,
    })),
    { key: OTHER_CATEGORY, label: "Other" },
];

export function ComponentListView(props: ComponentListViewProps) {
    const { projectPath, scope } = props;
    const { rpcClient } = useRpcContext();
    const [triggers, setTriggers] = useState<TriggerModelsResponse>({ local: [] });
    // Tracked separately from `triggers`: an empty `local` list is a legitimate
    // result, so it can't stand in for "still fetching" without spinning forever.
    const [isLoadingTriggers, setIsLoadingTriggers] = useState<boolean>(true);
    const { cacheTriggers, setCacheTriggers } = useVisualizerContext();
    const [isNPSupported, setIsNPSupported] = useState<boolean>(false);
    const [isLibrary, setIsLibrary] = useState<boolean>(false);
    const [activeCategory, setActiveCategory] = useState<CategoryChipKey>(ALL_CATEGORY);
    // Page-level gallery search: filters every section's cards in place and, while active, adds a
    // "More on Ballerina Central" section — results there can belong to any category, which is why
    // search lives here rather than inside one section.
    const [searchQuery, setSearchQuery] = useState<string>("");
    const addPanelRef = useRef<HTMLDivElement>(null);
    const [noResults, setNoResults] = useState(false);

    useEffect(() => {
        getTriggers();

        rpcClient.getCommonRpcClient().isNPSupported().then((supported) => {
            setIsNPSupported(supported);
        });

        rpcClient.getBIDiagramRpcClient().getProjectStructure().then((res) => {
            const project = res.projects.find(project => isSamePath(project.projectPath, projectPath));
            if (project) {
                setIsLibrary(project.isLibrary ?? false);
            }
        });
    }, [rpcClient, projectPath]);

    const getTriggers = () => {
        if (cacheTriggers.local.length > 0) {
            setTriggers(cacheTriggers);
            setIsLoadingTriggers(false);
        } else {
            rpcClient
                .getServiceDesignerRpcClient()
                .getTriggerModels({ query: "" })
                .then((model) => {
                    console.log(">>> bi triggers", model);
                    setTriggers(model);
                    setCacheTriggers(model);
                })
                .catch((error: unknown) => console.error(">>> Error fetching trigger models", error))
                .finally(() => setIsLoadingTriggers(false));
        }
    };

    // Each panel below self-hides when nothing in it matches the search, so
    // rather than duplicating that per-panel matching logic here, just check
    // whether anything actually rendered into the panel container.
    useLayoutEffect(() => {
        setNoResults(!!addPanelRef.current && addPanelRef.current.childElementCount === 0);
    }, [searchQuery, activeCategory, triggers, isLoadingTriggers, isNPSupported, isLibrary, scope]);

    const title = isLibrary ? "Library Artifacts" : "Artifacts";
    const subtitle = isLibrary
        ? "Add reusable artifacts to your library"
        : "Add a new artifact to your integration";

    // Chips filter which category shows; search filters the cards within (each
    // panel self-hides when nothing in it matches). Library scope has only the
    // "Other" panel, so its chips are hidden — just the search remains.
    const showCategory = (key: CategoryChipKey) => activeCategory === ALL_CATEGORY || activeCategory === key;
    const q = searchQuery;

    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar title={title} subtitle={subtitle} />
            <ViewContent padding>
                <Container>
                    <FilterBar>
                        {!isLibrary && (
                            <ChipRow role="tablist" aria-label="Artifact categories">
                                {CATEGORY_CHIPS.map((chip) => (
                                    <Chip
                                        key={chip.key}
                                        role="tab"
                                        aria-selected={activeCategory === chip.key}
                                        active={activeCategory === chip.key}
                                        onClick={() => setActiveCategory(chip.key)}
                                    >
                                        {chip.label}
                                    </Chip>
                                ))}
                            </ChipRow>
                        )}
                        <SearchSlot>
                            <SearchBox
                                value={searchQuery}
                                placeholder="Search artifacts"
                                iconPosition="end"
                                onChange={setSearchQuery}
                                sx={{ width: "100%" }}
                            />
                        </SearchSlot>
                    </FilterBar>
                    <AddPanel ref={addPanelRef}>
                        {!isLibrary && (
                            <>
                                {showCategory("automation") && <AutomationPanel scope={scope} searchQuery={q} />}
                                {showCategory("workflow") && <WorkflowPanel searchQuery={q} />}
                                {showCategory("ai-integration") && <AIAgentPanel scope={scope} triggers={triggers} searchQuery={q} />}
                                {showCategory("integration-as-api") && <IntegrationAPIPanel scope={scope} searchQuery={q} />}
                                {showCategory("event-integration") && <EventIntegrationPanel triggers={triggers} isLoadingTriggers={isLoadingTriggers} scope={scope} searchQuery={q} />}
                                {showCategory("file-integration") && <FileIntegrationPanel triggers={triggers} isLoadingTriggers={isLoadingTriggers} scope={scope} searchQuery={q} />}
                                {q.trim() && <CentralSearchPanel query={q} triggers={triggers} />}
                            </>
                        )}
                        {showCategory(OTHER_CATEGORY) && (
                            <OtherArtifactsPanel isNPSupported={isNPSupported} isLibrary={isLibrary} searchQuery={q} />
                        )}
                    </AddPanel>
                    {noResults && q.trim() && (
                        <EmptyState>
                            <span>No artifacts match &ldquo;{q.trim()}&rdquo;.</span>
                            <ClearSearchButton onClick={() => setSearchQuery("")}>Clear search</ClearSearchButton>
                        </EmptyState>
                    )}
                </Container>
            </ViewContent>
        </View>
    );
}
