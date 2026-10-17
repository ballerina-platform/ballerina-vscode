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

import React, { useEffect, useRef, useState } from "react";
import { Icon, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { ConnectorIcon } from "@wso2/bi-diagram";
import { AvailableNode, BISearchResponse } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { debounce } from "lodash";
import ButtonCard from "../../../../components/ButtonCard";
import { RelativeLoader } from "../../../../components/RelativeLoader";
import { CreateNewSection } from "./CreateNewSection";
import {
    AgentsGrid,
    AgentsLoadingCard,
    EmptyState,
    FilterButton,
    FilterButtons,
    IntroText,
    LoaderWrapper,
    PopupContent,
    ResultsSection,
    SectionHeader,
    SectionTitle,
    StyledSearchBox,
} from "./styles";

type AgentFilter = "All" | "Project" | "Organization";
export interface AddAgentPopupContentProps {
    projectPath: string;
    onOpenAgentForm: (agent?: AvailableNode) => void;
    onOpenPackage: (agent: AvailableNode, agents: AvailableNode[]) => void;
    onOpenDefinition: () => void;
    onOpenDurable: () => void;
    inFlow?: boolean;
    dependencyMode?: boolean;
    onAgentSelectedForDependency?: (agent: AvailableNode) => void;
    onGenericAgentSelected?: () => void;
}

const toAgents = (model: BISearchResponse): AvailableNode[] =>
    (model.categories ?? []).flatMap((category) => (category.items ?? []) as AvailableNode[]);

const moduleId = (agent: AvailableNode): string =>
    `${agent.codedata.org}/${agent.codedata.module}:${agent.codedata.version}`;

const FILTER_TO_SOURCE: Record<AgentFilter, string> = {
    All: "all",
    Project: "local",
    Organization: "organization",
};

export function AddAgentPopupContent(props: AddAgentPopupContentProps) {
    const {
        projectPath,
        onOpenAgentForm,
        onOpenPackage,
        onOpenDefinition,
        onOpenDurable,
        inFlow,
        dependencyMode,
        onAgentSelectedForDependency,
        onGenericAgentSelected,
    } = props;
    const { rpcClient } = useRpcContext();
    const [searchText, setSearchText] = useState("");
    const [filterType, setFilterType] = useState<AgentFilter>("All");
    const [agents, setAgents] = useState<AvailableNode[]>([]);
    const [isExpanding, setIsExpanding] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingOrgAgents, setIsLoadingOrgAgents] = useState(false);
    const [isWorkspace, setIsWorkspace] = useState(false);
    const searchRequestRef = useRef(0);
    const previousFilterRef = useRef<AgentFilter | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        rpcClient
            .getCommonRpcClient()
            .getWorkspaceType()
            .then((result) => {
                if (cancelled) return;
                setIsWorkspace(
                    ["MULTIPLE_PROJECTS", "BALLERINA_WORKSPACE", "VSCODE_WORKSPACE"].includes(result?.type)
                );
            })
            .catch(() => {
            });
        return () => {
            cancelled = true;
        };
    }, [rpcClient]);

    // Org packages need a Central round trip, so they are merged in after the offline results render.
    const loadOrganizationAgents = (request: number) => {
        setIsLoadingOrgAgents(true);
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                filePath: projectPath,
                queryMap: { limit: 60, source: FILTER_TO_SOURCE.Organization },
                searchKind: "AGENT",
            })
            .then((model) => {
                if (request !== searchRequestRef.current) {
                    return;
                }
                const orgAgents = toAgents(model);
                setAgents((current) => {
                    const seen = new Set(current.map(moduleId));
                    return [...current, ...orgAgents.filter((agent) => !seen.has(moduleId(agent)))];
                });
            })
            .catch((error) => {
                console.error("Error loading organization agents:", error);
                rpcClient.getCommonRpcClient().showErrorMessage({
                    message: "Failed to load organization agents. Please try again.",
                });
            })
            .finally(() => {
                if (request === searchRequestRef.current) {
                    setIsLoadingOrgAgents(false);
                }
            });
    };

    const runSearch = (text: string, filter: AgentFilter) => {
        const request = ++searchRequestRef.current;
        setIsSearching(true);
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                filePath: projectPath,
                queryMap: {
                    ...(text ? { q: text } : {}),
                    limit: 60,
                    source: FILTER_TO_SOURCE[filter],
                },
                searchKind: "AGENT",
            })
            .then((model) => {
                if (request === searchRequestRef.current) {
                    setAgents(toAgents(model));
                    if (!text && filter === "All") {
                        loadOrganizationAgents(request);
                    }
                }
            })
            .finally(() => {
                if (request === searchRequestRef.current) {
                    setIsSearching(false);
                }
            });
    };

    const debouncedSearch = debounce((text: string, filter: AgentFilter) => runSearch(text, filter), 1100);

    useEffect(() => {
        const filterChanged = previousFilterRef.current !== filterType;
        previousFilterRef.current = filterType;
        setIsLoadingOrgAgents(false);
        if (!searchText || filterChanged) {
            runSearch(searchText, filterType);
            return;
        }
        searchRequestRef.current += 1;
        debouncedSearch(searchText, filterType);
        return () => debouncedSearch.cancel();
    }, [searchText, filterType, rpcClient, projectPath]);

    const handleCustomAgent = () => onOpenAgentForm();

    // A resolved agent (codedata.object set) routes to the dependency callback or the configure view.
    const selectResolvedAgent = (agent: AvailableNode) => {
        if (dependencyMode) {
            onAgentSelectedForDependency?.(agent);
            return;
        }
        onOpenAgentForm(agent);
    };

    // Central results name a package; expand it so the user picks which definition to instantiate.
    // Resolve before navigating: a single-definition package should go straight to its form.
    const expandPackage = async (agent: AvailableNode) => {
        const { org, module, version } = agent.codedata;
        setIsExpanding(true);
        try {
            const model = await rpcClient.getBIDiagramRpcClient().search({
                filePath: projectPath,
                queryMap: { package: `${org}/${module}:${version}` },
                searchKind: "AGENT",
            });
            const found = toAgents(model);
            if (found.length === 1) {
                selectResolvedAgent(found[0]);
                return;
            }
            onOpenPackage(agent, found);
        } catch (error) {
            console.error("Error expanding agent package:", error);
            rpcClient.getCommonRpcClient().showErrorMessage({
                message: "Failed to load the agent package. Please try again.",
            });
        } finally {
            setIsExpanding(false);
        }
    };

    const handleSelectAgent = (agent: AvailableNode) => {
        if (!agent.codedata.object) {
            expandPackage(agent);
            return;
        }
        selectResolvedAgent(agent);
    };

    return (
        <PopupContent>
            <IntroText>
                {dependencyMode
                    ? "Choose the agent this definition should delegate to. The selected agent will be passed into this definition when it is created."
                    : "To add an agent, create a one-off agent for this project, create a reusable agent definition that can be shared across projects, or select one of the pre-built agents below. You will then be guided to provide the required details to complete the agent setup."}
            </IntroText>

            <CreateNewSection
                dependencyMode={dependencyMode}
                onCreateAgent={handleCustomAgent}
                onCreateDurableAgent={inFlow ? undefined : onOpenDurable}
                onCreateDefinition={onOpenDefinition}
                onGenericAgent={onGenericAgentSelected}
            />

            <ResultsSection>
                <SectionHeader>
                    <SectionTitle variant="h4">{dependencyMode ? "Agent Types" : "Pre-built Agents"}</SectionTitle>
                    <FilterButtons>
                        <FilterButton
                            active={filterType === "All"}
                            onClick={() => setFilterType("All")}
                        >
                            All
                        </FilterButton>
                        {isWorkspace && (
                            <FilterButton
                                active={filterType === "Project"}
                                onClick={() => setFilterType("Project")}
                            >
                                Project
                            </FilterButton>
                        )}
                        <FilterButton
                            active={filterType === "Organization"}
                            onClick={() => setFilterType("Organization")}
                        >
                            Organization
                        </FilterButton>
                    </FilterButtons>
                </SectionHeader>
                <StyledSearchBox
                    value={searchText}
                    placeholder="Search pre-built agents..."
                    onChange={setSearchText}
                    size={60}
                />
                {isExpanding || ((isSearching || isLoadingOrgAgents) && agents.length === 0) ? (
                    <LoaderWrapper>
                        <RelativeLoader />
                    </LoaderWrapper>
                ) : agents.length === 0 ? (
                    <EmptyState>
                        {filterType === "Project"
                            ? "No agents found in this project."
                            : filterType === "Organization"
                                ? "No agents found in your organization."
                                : !searchText
                                    ? "No agents found. Type to search for agents from other organizations."
                                    : "No agents found."}
                    </EmptyState>
                ) : (
                    <AgentsGrid>
                        {agents.map((agent) => {
                            const key = `${agent.codedata.org}/${agent.codedata.module}/${agent.metadata.label}`;
                            return (
                                <ButtonCard
                                    id={`agent-${key}`}
                                    key={key}
                                    title={agent.metadata.label}
                                    description={`${agent.codedata.org} / ${agent.codedata.module}`}
                                    truncate={true}
                                    icon={
                                        <ConnectorIcon
                                            url={agent.metadata.icon}
                                            fallbackIcon={
                                                <Icon
                                                    name="bi-ai-agent"
                                                    sx={{ fontSize: 24, width: 24, height: 24 }}
                                                />
                                            }
                                        />
                                    }
                                    onClick={() => handleSelectAgent(agent)}
                                />
                            );
                        })}
                        {isLoadingOrgAgents && (
                            <AgentsLoadingCard>
                                <ProgressRing color={ThemeColors.PRIMARY} sx={{ width: 16, height: 16 }} />
                            </AgentsLoadingCard>
                        )}
                    </AgentsGrid>
                )}
            </ResultsSection>
        </PopupContent>
    );
}
