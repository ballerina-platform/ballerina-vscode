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

import React, { ReactNode, useEffect, useState } from "react";
import { Icon } from "@wso2/ui-toolkit";
import { ConnectorIcon } from "@wso2/bi-diagram";
import { AvailableNode } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import ButtonCard from "../../../../components/ButtonCard";
import { RelativeLoader } from "../../../../components/RelativeLoader";
import { toAgents } from "./PrebuiltAgentsView";
import {
    AgentsGrid,
    EmptyState,
    IntroText,
    LoaderWrapper,
    PopupContent,
    ResultsSection,
} from "./styles";

interface PackageAgentsViewProps {
    projectPath: string;
    packageNode: AvailableNode;
    isAgentHidden?: (agent: AvailableNode) => boolean;
    onSelect: (agent: AvailableNode) => void;
    renderForm?: (agent: AvailableNode) => ReactNode;
}

/** Loads a package's definitions; one opens its form in place, several are listed to pick from. */
export function PackageAgentsView(props: PackageAgentsViewProps) {
    const { projectPath, packageNode, isAgentHidden, onSelect, renderForm } = props;
    const { rpcClient } = useRpcContext();
    const [agents, setAgents] = useState<AvailableNode[]>();
    const { org, module, version } = packageNode.codedata;

    useEffect(() => {
        let cancelled = false;
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                filePath: projectPath,
                queryMap: { package: `${org}/${module}:${version}` },
                searchKind: "AGENT",
            })
            .then((model) => toAgents(model).filter((agent) => !isAgentHidden?.(agent)))
            .catch((error): AvailableNode[] => {
                console.error("Error expanding agent package:", error);
                rpcClient.getCommonRpcClient().showErrorMessage({
                    message: "Failed to load the agent package. Please try again.",
                });
                return [];
            })
            .then((found) => {
                if (cancelled) {
                    return;
                }
                setAgents(found);
                if (found.length === 1 && !renderForm) {
                    onSelect(found[0]);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Same loader as the form, so a single-definition package reads as one load.
    if (!agents) {
        return (
            <LoaderWrapper>
                <RelativeLoader />
            </LoaderWrapper>
        );
    }

    if (agents.length === 1 && renderForm) {
        return <>{renderForm(agents[0])}</>;
    }

    return (
        <PopupContent>
            <IntroText sx={{ fontSize: 13 }}>
                {`Choose an agent definition from ${org}/${module}:${version}.`}
            </IntroText>

            <ResultsSection>
                {agents.length === 0 && <EmptyState>No agent definitions found in this package.</EmptyState>}
                {agents.length > 0 && (
                    <AgentsGrid>
                        {agents.map((agent) => (
                            <ButtonCard
                                id={`agent-${agent.codedata.object}`}
                                key={agent.codedata.object}
                                title={agent.metadata.label}
                                description={agent.metadata.description}
                                truncate={true}
                                icon={
                                    <ConnectorIcon
                                        url={agent.metadata.icon}
                                        fallbackIcon={
                                            <Icon name="bi-ai-agent" sx={{ fontSize: 24, width: 24, height: 24 }} />
                                        }
                                    />
                                }
                                onClick={() => onSelect(agent)}
                            />
                        ))}
                    </AgentsGrid>
                )}
            </ResultsSection>
        </PopupContent>
    );
}
