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

import React, { useEffect, useState } from "react";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import { ConnectorIcon } from "@wso2/bi-diagram";
import { AvailableNode, EVENT_TYPE, FlowNode, LineRange } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { cloneDeep, debounce } from "lodash";
import ButtonCard from "../../../../components/ButtonCard";
import { RelativeLoader } from "../../../../components/RelativeLoader";
import { FlowNodeForm } from "../../Forms/FlowNodeForm";
import { fetchAgentNodeTemplate, getEndOfFileLineRange, getNodeTemplate } from "../utils";
import { AgentInfoCard } from "./AgentInfoCard";
import {
    AgentOptionCard,
    AgentOptionContent,
    AgentOptionDescription,
    AgentOptionIcon,
    AgentOptionTitle,
    AgentsGrid,
    ArrowIcon,
    CreateAgentOptions,
    EmptyState,
    FilterButton,
    FilterButtons,
    FormContainer,
    IntroText,
    LoaderWrapper,
    PopupContent,
    ResultsSection,
    Section,
    SectionHeader,
    SectionHeaderRight,
    SectionTitle,
    SearchContainer,
    StyledSearchBox,
} from "./styles";

// Pre-built agent declarations are written to the project's dedicated agents file.
const AGENT_FILE_NAME = "agents.bal";

type AgentFilter = "All" | "Project" | "Organization";
// "create" = custom agent form inline; "configure" = initialize a selected pre-built agent.
export type AddAgentView = "gallery" | "configure" | "create";

export interface AddAgentPopupContentProps {
    projectPath: string;
    onClose?: () => void;
    view: AddAgentView;
    onViewChange: (view: AddAgentView) => void;
    // When opened from inside a flow: skip the focus-diagram redirect and call onAgentCreated instead.
    inFlow?: boolean;
    onAgentCreated?: (agentVarName: string) => void;
}

// Maps a UI filter tab to the backend AgentSearchCommand `source` parameter.
const FILTER_TO_SOURCE: Record<AgentFilter, string> = {
    All: "all",
    Project: "local",
    Organization: "organization",
};

export function AddAgentPopupContent(props: AddAgentPopupContentProps) {
    const { projectPath, onClose, view, onViewChange, inFlow, onAgentCreated } = props;
    const { rpcClient } = useRpcContext();
    const [searchText, setSearchText] = useState<string>("");
    const [filterType, setFilterType] = useState<AgentFilter>("All");
    const [agents, setAgents] = useState<AvailableNode[]>([]);
    const [isSearching, setIsSearching] = useState<boolean>(false);
    // "Project" agents come from sibling projects in the workspace, so the tab is only relevant in a workspace.
    const [isWorkspace, setIsWorkspace] = useState<boolean>(false);

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
                // Treat detection failures as a single project (hide the Project tab).
            });
        return () => {
            cancelled = true;
        };
    }, [rpcClient]);

    const [agentNode, setAgentNode] = useState<FlowNode>();
    const [agentFilePath, setAgentFilePath] = useState<string>("");
    const [targetLineRange, setTargetLineRange] = useState<LineRange>();
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    // The pre-built agent selected from the gallery, configured in the "configure" view.
    const [pendingAgent, setPendingAgent] = useState<AvailableNode>();

    // Load agent template for the "configure" and "create" views. Reset otherwise.
    useEffect(() => {
        if ((view !== "configure" && view !== "create") || (view === "configure" && !pendingAgent)) {
            setAgentNode(undefined);
            setTargetLineRange(undefined);
            setIsSubmitting(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const endOfFile = await getEndOfFileLineRange(AGENT_FILE_NAME, rpcClient);
                let template: FlowNode;
                if (view === "configure") {
                    // Resolve the target file (agents.bal) first and use it as the template context: passing the
                    // project directory breaks symbol resolution (no unique result name) and crashes same-package
                    // creation (documentId on a directory). The file may not exist yet — the LS tolerates that.
                    template = await getNodeTemplate(
                        rpcClient,
                        pendingAgent!.codedata,
                        endOfFile.fileName,
                        endOfFile.startLine
                    );
                    if (!template) {
                        throw new Error("No agent node template returned");
                    }
                } else {
                    // "create" view: load the built-in ai:Agent template.
                    template = await fetchAgentNodeTemplate(rpcClient, projectPath);
                }
                template.codedata.lineRange = endOfFile as any;
                if (cancelled) return;
                setAgentFilePath(endOfFile.fileName);
                setTargetLineRange(endOfFile);
                setAgentNode(template);
            } catch (error) {
                console.error("Error loading agent node template:", error);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [view, pendingAgent, rpcClient, projectPath]);

    // Fetches the gallery agent list. An empty query returns the default (in-memory cached) view;
    // a non-empty query triggers a local + central search for the selected source.
    const runSearch = (text: string, filter: AgentFilter) => {
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
                setAgents((model.categories ?? []).flatMap((category) => (category.items ?? []) as AvailableNode[]));
            })
            .finally(() => {
                setIsSearching(false);
            });
    };

    const debouncedSearch = debounce((text: string) => runSearch(text, filterType), 1100);

    // Initial open and tab switches fetch immediately; typing in the search box is debounced.
    useEffect(() => {
        if (view !== "gallery") {
            return;
        }
        runSearch(searchText, filterType);
    }, [view, filterType, rpcClient, projectPath]);

    useEffect(() => {
        if (view !== "gallery") {
            return;
        }
        debouncedSearch(searchText);
        return () => debouncedSearch.cancel();
    }, [searchText]);

    const handleCustomAgent = () => {
        setPendingAgent(undefined);
        onViewChange("create");
    };

    const handleCreateAgent = async (updatedNode?: FlowNode) => {
        if (!updatedNode) {
            return;
        }
        setIsSubmitting(true);
        try {
            const node = cloneDeep(updatedNode);

            // Pre-built agent (configure view): the user supplies the model via the form, so its value
            // is kept as-is.
            const endOfFile = await getEndOfFileLineRange(AGENT_FILE_NAME, rpcClient);
            node.codedata.lineRange = endOfFile as any;

            const sourceResponse = await rpcClient
                .getBIDiagramRpcClient()
                .getSourceCode({ filePath: endOfFile.fileName, flowNode: node });

            if (String(node.properties?.model?.value ?? "") === "check ai:getDefaultModelProvider()") {
                await rpcClient.getAIAgentRpcClient().configureDefaultModelProvider("model");
            }

            const agentVarName = String(node.properties?.variable?.value ?? "");

            // In-flow: don't navigate away. Close the popup and let the caller refresh the agent list.
            if (inFlow) {
                onAgentCreated?.(agentVarName);
                return;
            }

            // Redirect to the focused agent view for the newly created agent instead of going home.
            const agentArtifact =
                sourceResponse?.artifacts?.find((artifact) => artifact.isNew && artifact.name === agentVarName) ||
                sourceResponse?.artifacts?.find((artifact) => artifact.name === agentVarName);

            if (agentArtifact?.path && agentArtifact?.position) {
                // Pass only documentUri + position and let getView classify the artifact: a custom AgentType
                // class (module !== "ai") resolves to the AGENT_TYPE focus diagram, the built-in to AGENT.
                // Passing an explicit focus view would desync the post-save VIEW_UPDATE (see agent focus spec).
                await rpcClient.getVisualizerRpcClient().openView({
                    type: EVENT_TYPE.OPEN_VIEW,
                    location: {
                        documentUri: agentArtifact.path,
                        position: agentArtifact.position,
                        identifier: agentVarName,
                    },
                });
                return;
            }
            onClose?.();
        } catch (error) {
            console.error("Error creating custom agent:", error);
            setIsSubmitting(false);
        }
    };

    // Initialize a pre-built agent: open the class-init config form for the selected agent's codedata.
    const handleSelectAgent = (agent: AvailableNode) => {
        setPendingAgent(agent);
        onViewChange("configure");
    };

    const handleCreateNew = () => {
        // No-op for now. Wire up later.
    };

    if (view === "create") {
        const fieldOverrides = { type: { hidden: true } };
        const formNode = agentNode ? cloneDeep(agentNode) : undefined;
        return (
            <FormContainer>
                {formNode && targetLineRange ? (
                    <FlowNodeForm
                        fileName={agentFilePath}
                        node={formNode}
                        nodeFormTemplate={formNode}
                        targetLineRange={targetLineRange}
                        onSubmit={handleCreateAgent}
                        submitText={isSubmitting ? "Creating..." : "Create Agent"}
                        showProgressIndicator={isSubmitting}
                        disableSaveButton={isSubmitting}
                        footerActionButton
                        fieldOverrides={fieldOverrides}
                    />
                ) : (
                    <LoaderWrapper>
                        <RelativeLoader />
                    </LoaderWrapper>
                )}
            </FormContainer>
        );
    }

    if (view === "configure") {
        // Pre-built agent: show the model field so the user can supply the ModelProvider; the
        // predetermined result type is hidden.
        const fieldOverrides = { type: { hidden: true } };
        // Show the agent identity (icon + name + description) in a header card, and strip the description from the
        // form node so it isn't duplicated below the card (mirrors the connector configure popup).
        const formNode = agentNode ? cloneDeep(agentNode) : undefined;
        if (formNode?.metadata?.description) {
            delete formNode.metadata.description;
        }
        const cardDescription = pendingAgent?.metadata?.description || agentNode?.metadata?.description;
        return (
            <FormContainer>
                {formNode && targetLineRange ? (
                    <>
                        <AgentInfoCard
                            label={pendingAgent?.metadata?.label || ""}
                            description={cardDescription}
                            icon={pendingAgent?.metadata?.icon}
                        />
                        <FlowNodeForm
                            fileName={agentFilePath}
                            node={formNode}
                            nodeFormTemplate={formNode}
                            targetLineRange={targetLineRange}
                            onSubmit={handleCreateAgent}
                            submitText={isSubmitting ? "Adding..." : "Add Agent"}
                            showProgressIndicator={isSubmitting}
                            disableSaveButton={isSubmitting}
                            footerActionButton
                            fieldOverrides={fieldOverrides}
                        />
                    </>
                ) : (
                    <LoaderWrapper>
                        <RelativeLoader />
                    </LoaderWrapper>
                )}
            </FormContainer>
        );
    }

    return (
        <PopupContent>
            <IntroText>
                To add an agent, define a custom agent for this project or select one of the pre-built
                agents below. You will then be guided to provide the required details to complete the
                agent setup.
            </IntroText>

            <SearchContainer>
                <StyledSearchBox
                    value={searchText}
                    placeholder="Search agents..."
                    onChange={setSearchText}
                    size={60}
                />
            </SearchContainer>

            <Section>
                <SectionTitle variant="h4">Create New Agent</SectionTitle>
                <CreateAgentOptions>
                    <AgentOptionCard onClick={handleCustomAgent}>
                        <AgentOptionIcon>
                            <Icon name="bi-ai-agent" sx={{ fontSize: 24, width: 24, height: 24 }} />
                        </AgentOptionIcon>
                        <AgentOptionContent>
                            <AgentOptionTitle>Create Agent</AgentOptionTitle>
                            <AgentOptionDescription>
                                Create your own agent for this project
                            </AgentOptionDescription>
                        </AgentOptionContent>
                        <ArrowIcon>
                            <Codicon name="chevron-right" />
                        </ArrowIcon>
                    </AgentOptionCard>
                </CreateAgentOptions>
            </Section>

            <ResultsSection>
                <SectionHeader>
                    <SectionTitle variant="h4">Pre-built Agents</SectionTitle>
                    <SectionHeaderRight>
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
                    </SectionHeaderRight>
                </SectionHeader>
                {isSearching && agents.length === 0 ? (
                    <LoaderWrapper>
                        <RelativeLoader />
                    </LoaderWrapper>
                ) : agents.length === 0 ? (
                    <EmptyState>
                        {filterType === "Project"
                            ? "No agents found in this project."
                            : filterType === "Organization"
                            ? "No agents found in your organization."
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
                    </AgentsGrid>
                )}
            </ResultsSection>
        </PopupContent>
    );
}
