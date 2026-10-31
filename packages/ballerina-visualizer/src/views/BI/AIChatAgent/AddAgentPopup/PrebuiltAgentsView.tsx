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

import React, { ReactNode, useEffect, useRef, useState } from "react";
import { Codicon, Icon, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { ConnectorIcon } from "@wso2/bi-diagram";
import { AvailableNode, BISearchResponse } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { debounce } from "lodash";
import ButtonCard from "../../../../components/ButtonCard";
import {
    AgentsGrid,
    AgentsLoadingCard,
    EmptyState,
    FilterButton,
    FilterButtons,
    IntroText,
    ResultsSection,
    SectionHeader,
    StyledSearchBox,
} from "./styles";

type AgentFilter = "All" | "Project" | "Organization";

export const toAgents = (model: BISearchResponse): AvailableNode[] =>
    (model.categories ?? []).flatMap((category) => (category.items ?? []) as AvailableNode[]);

const moduleId = (agent: AvailableNode): string =>
    `${agent.codedata.org}/${agent.codedata.module}:${agent.codedata.version}`;

const agentKey = (agent: AvailableNode): string =>
    `${agent.codedata.org}/${agent.codedata.module}/${agent.metadata.label}`;

const FILTER_TO_SOURCE: Record<AgentFilter, string> = {
    All: "all",
    Project: "local",
    Organization: "organization",
};

const EMPTY_MESSAGES: Record<AgentFilter, string> = {
    All: "Definitions your organization publishes to Ballerina Central show here. Search to find public ones.",
    Project: "No agent definitions found in this project.",
    Organization: "No agent definitions found in your organization.",
};

const NO_MATCH_MESSAGE = "No agent definitions match your search.";

// Package summaries are Markdown, and the tooltip shows plain text.
const summaryOf = (agent: AvailableNode): string | undefined => agent.metadata.description?.replace(/\*\*|__|`/g, "");

// A span, since ButtonCard sizes a leading div icon to 24px.
const newDefinitionIcon = (
    <span style={{ display: "flex", justifyContent: "center", width: 24 }}>
        <Codicon name="add" iconSx={{ fontSize: 16, color: ThemeColors.PRIMARY }} />
    </span>
);

const TOKEN_DOCS_URL = "https://ballerina.io/learn/publish-packages-to-ballerina-central/#obtain-an-access-token";
const DEFINITIONS_DOCS_URL =
    "https://wso2.com/integration-platform/docs/saas/develop-and-test/integration-artifacts/ai-integrations/agents/definitions";

export function useAgentSearch(projectPath: string, searchText: string, filterType: AgentFilter) {
    const { rpcClient } = useRpcContext();
    const [agents, setAgents] = useState<AvailableNode[]>([]);
    const [isSearching, setIsSearching] = useState(true);
    const [isLoadingOrgAgents, setIsLoadingOrgAgents] = useState(false);
    const searchRequestRef = useRef(0);
    const previousFilterRef = useRef<AgentFilter | undefined>(undefined);

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

    return { agents, isSearching, isLoadingOrgAgents };
}

function DocsLink({ url, children }: { url: string; children: ReactNode }) {
    const { rpcClient } = useRpcContext();

    const openDocs = (event: React.MouseEvent) => {
        event.preventDefault();
        rpcClient.getCommonRpcClient().openExternalUrl({ url });
    };

    return (
        <VSCodeLink href="#" onClick={openDocs}>
            {children}
        </VSCodeLink>
    );
}

function TokenHint() {
    return (
        <IntroText>
            To see your organization's private definitions, add a Ballerina Central access token and reload the
            window. <DocsLink url={TOKEN_DOCS_URL}>How to Add a Token</DocsLink>
        </IntroText>
    );
}

export function DefinitionsIntro() {
    return (
        <IntroText sx={{ fontSize: 13 }}>
            Reuse an agent published in this project or your organization.{" "}
            <DocsLink url={DEFINITIONS_DOCS_URL}>Learn More</DocsLink>
        </IntroText>
    );
}

export interface PrebuiltAgentsViewProps {
    projectPath: string;
    heading: ReactNode;
    dependencyMode?: boolean;
    onCreateDefinition?: () => void;
    onOpenAgentForm: (agent?: AvailableNode) => void;
    onOpenPackage: (agent: AvailableNode) => void;
    onAgentSelectedForDependency?: (agent: AvailableNode) => void;
    isAgentHidden?: (agent: AvailableNode) => boolean;
}

export function PrebuiltAgentsView(props: PrebuiltAgentsViewProps) {
    const {
        projectPath,
        heading,
        dependencyMode,
        onCreateDefinition,
        onOpenAgentForm,
        onOpenPackage,
        onAgentSelectedForDependency,
        isAgentHidden,
    } = props;
    const { rpcClient } = useRpcContext();
    const [searchText, setSearchText] = useState("");
    const [filterType, setFilterType] = useState<AgentFilter>("All");
    const [isWorkspace, setIsWorkspace] = useState(false);
    const [hasToken, setHasToken] = useState<boolean>();
    const { agents, isSearching, isLoadingOrgAgents } = useAgentSearch(projectPath, searchText, filterType);

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
        rpcClient
            .getCommonRpcClient()
            .hasCentralPATConfigured()
            .then((configured) => !cancelled && setHasToken(configured))
            .catch(() => {
            });
        return () => {
            cancelled = true;
        };
    }, [rpcClient]);

    const isVisible = (agent: AvailableNode) => !isAgentHidden?.(agent);
    const visibleAgents = agents.filter(isVisible);
    const isLoading = (isSearching && visibleAgents.length === 0) || isLoadingOrgAgents;
    const filters: AgentFilter[] = isWorkspace ? ["All", "Project", "Organization"] : ["All", "Organization"];

    // A resolved agent (codedata.object set) routes to the dependency callback or the configure view.
    const selectResolvedAgent = (agent: AvailableNode) => {
        if (dependencyMode) {
            onAgentSelectedForDependency?.(agent);
            return;
        }
        onOpenAgentForm(agent);
    };

    // Central results name a package, which its own level expands into definitions.
    const handleSelectAgent = (agent: AvailableNode) => {
        if (!agent.codedata.object) {
            onOpenPackage(agent);
            return;
        }
        selectResolvedAgent(agent);
    };

    return (
        <ResultsSection>
            <SectionHeader>
                {heading}
                <FilterButtons role="group" aria-label="Source">
                    {filters.map((filter) => (
                        <FilterButton
                            key={filter}
                            active={filterType === filter}
                            aria-pressed={filterType === filter}
                            onClick={() => setFilterType(filter)}
                        >
                            {filter}
                        </FilterButton>
                    ))}
                </FilterButtons>
            </SectionHeader>
            <StyledSearchBox
                value={searchText}
                placeholder="Search agent definitions..."
                onChange={setSearchText}
                size={60}
            />
            <AgentsGrid>
                {onCreateDefinition && (
                    <ButtonCard
                        id="agent-new-definition"
                        title="New Agent Definition"
                        description="Share and reuse an agent."
                        truncate={true}
                        icon={newDefinitionIcon}
                        onClick={onCreateDefinition}
                    />
                )}
                {visibleAgents.map((agent) => {
                    const key = agentKey(agent);
                    return (
                        <ButtonCard
                            id={`agent-${key}`}
                            key={key}
                            title={agent.metadata.label}
                            description={`${agent.codedata.org} / ${agent.codedata.module}`}
                            tooltip={summaryOf(agent)}
                            tooltipMaxWidth={280}
                            truncate={true}
                            icon={
                                <ConnectorIcon
                                    url={agent.metadata.icon}
                                    fallbackIcon={
                                        <Icon name="bi-ai-agent" sx={{ fontSize: 24, width: 24, height: 24 }} />
                                    }
                                />
                            }
                            onClick={() => handleSelectAgent(agent)}
                        />
                    );
                })}
                {isLoading && (
                    <AgentsLoadingCard>
                        <ProgressRing color={ThemeColors.PRIMARY} sx={{ width: 16, height: 16 }} />
                    </AgentsLoadingCard>
                )}
            </AgentsGrid>
            {!isLoading && visibleAgents.length === 0 && (
                <EmptyState>{searchText ? NO_MATCH_MESSAGE : EMPTY_MESSAGES[filterType]}</EmptyState>
            )}
            {hasToken === false && filterType !== "Project" && <TokenHint />}
        </ResultsSection>
    );
}
