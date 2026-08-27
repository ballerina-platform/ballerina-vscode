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

import React from "react";
import { Icon } from "@wso2/ui-toolkit";
import { ConnectorIcon } from "@wso2/bi-diagram";
import { AvailableNode } from "@wso2/ballerina-core";
import ButtonCard from "../../../../components/ButtonCard";
import { RelativeLoader } from "../../../../components/RelativeLoader";
import {
    AgentsGrid,
    EmptyState,
    IntroText,
    LoaderWrapper,
    PopupContent,
    ResultsSection,
} from "./styles";

interface PackageAgentsViewProps {
    packageNode: AvailableNode;
    agents: AvailableNode[];
    isLoading: boolean;
    onSelect: (agent: AvailableNode) => void;
}

/** Picks one definition out of a package that declares several. */
export function PackageAgentsView(props: PackageAgentsViewProps) {
    const { packageNode, agents, isLoading, onSelect } = props;
    const { org, module, version } = packageNode.codedata;

    return (
        <PopupContent>
            <IntroText>
                {`Choose an agent definition from ${org}/${module}:${version}.`}
            </IntroText>

            <ResultsSection>
                {isLoading && <LoaderWrapper><RelativeLoader /></LoaderWrapper>}
                {!isLoading && agents.length === 0 && (
                    <EmptyState>No agent definitions found in this package.</EmptyState>
                )}
                {!isLoading && agents.length > 0 && (
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
