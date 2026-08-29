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
import { Codicon, ProgressRing } from "@wso2/ui-toolkit";
import { useQuery } from "@tanstack/react-query";
import { GetMarketplaceItemsParams, MarketplaceItem } from "@wso2/wso2-platform-core";
import ButtonCard from "../../../../components/ButtonCard";
import { BodyTinyInfo } from "../../../styles";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { ConnectorsGrid, Section, SectionHeader, SectionTitle } from "../AddConnectionPopup/styles";
import { ProgressWrap } from "./utils";

// Devant tags knowledge base services with this tag.
const KB_TAG = "knowledge-base-as-service";
const isKnowledgeBase = (item: MarketplaceItem) => item.tags?.includes(KB_TAG) ?? false;

interface CloudKnowledgeBasePageProps {
    // Opens a blank CloudKnowledgeBase create form (manual entry, no Devant service pre-selected).
    onCreateNew: () => void;
    // Selecting an existing cloud KB service runs the auto-provisioned create flow.
    onSelectExisting: (item: MarketplaceItem) => void;
}

/**
 * Intermediate page shown when the "WSO2 Cloud Knowledge Base" box is selected. Offers creating a
 * new knowledge base manually, and lists the existing WSO2 Cloud knowledge bases to connect to.
 */
export function CloudKnowledgeBasePage(props: CloudKnowledgeBasePageProps) {
    const { onCreateNew, onSelectExisting } = props;
    const { platformExtState, platformRpcClient } = usePlatformExtContext();

    const isSignedIn = !!platformExtState?.isLoggedIn && !!platformExtState?.selectedContext?.project;

    const getMarketPlaceParams: GetMarketplaceItemsParams = {
        limit: 24,
        offset: 0,
        networkVisibilityFilter: "all",
        networkVisibilityprojectId: platformExtState?.selectedContext?.project?.id,
        sortBy: "createdTime",
        searchContent: false,
    };

    const { data: knowledgeBases, isLoading } = useQuery({
        queryKey: [
            "kb-marketplace-services",
            platformExtState?.selectedContext?.org?.uuid,
            platformExtState?.selectedContext?.project?.id,
        ],
        queryFn: () =>
            platformRpcClient?.getMarketplaceItems({
                orgId: platformExtState?.selectedContext?.org?.id?.toString(),
                request: getMarketPlaceParams,
            }),
        enabled: isSignedIn,
        select: (data) => ({ ...data, data: (data?.data || []).filter(isKnowledgeBase) }),
    });

    const items: MarketplaceItem[] = knowledgeBases?.data || [];

    return (
        <>
            <Section>
                <ConnectorsGrid>
                    <ButtonCard
                        id="create-new-cloud-kb"
                        title="Manually Config WSO2 Cloud Knowledge Base"
                        description="Add configurations for the Knowledge Base connection."
                        icon={<Codicon name="add" />}
                        onClick={onCreateNew}
                    />
                </ConnectorsGrid>
            </Section>

            <div style={{ height: 16 }} />

            {isSignedIn && (
                <Section>
                    <SectionHeader>
                        <SectionTitle variant="h4">Existing WSO2 Cloud Knowledge Bases</SectionTitle>
                    </SectionHeader>
                    {isLoading ? (
                        <ProgressWrap>
                            <ProgressRing />
                        </ProgressWrap>
                    ) : items.length === 0 ? (
                        <BodyTinyInfo style={{ paddingBottom: "10px" }}>
                            No knowledge bases found in your WSO2 Cloud organization
                        </BodyTinyInfo>
                    ) : (
                        <ConnectorsGrid>
                            {items.map((item) => (
                                <ButtonCard
                                    key={item.resourceId}
                                    id={`kb-connector-${item.resourceId}`}
                                    title={item.name}
                                    description={item.description}
                                    icon={<Codicon name="database" />}
                                    onClick={() => onSelectExisting(item)}
                                />
                            ))}
                        </ConnectorsGrid>
                    )}
                </Section>
            )}
        </>
    );
}
