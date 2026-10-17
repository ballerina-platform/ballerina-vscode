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
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon, LinkButton, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { useQuery } from "@tanstack/react-query";
import { GetMarketplaceItemsParams, MarketplaceItem } from "@wso2/wso2-platform-core";
import ButtonCard from "../../../../components/ButtonCard";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { ConnectorsGrid } from "../AddConnectionPopup/styles";
import { isKnowledgeBaseService } from "./utils";

const Page = styled.div<{ inset?: boolean }>`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: 24px;
    padding-inline: ${({ inset }: { inset?: boolean }) => (inset ? "16px" : "0")};
`;

const Intro = styled.p`
    margin: 0;
    max-width: 62ch;
    font-size: 13px;
    line-height: 1.5;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const Group = styled.section`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const ExistingGroup = styled(Group)`
    flex: 1;
    min-height: 0;
`;

const GroupLabel = styled.h4`
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
`;

const Placeholder = styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 32px 24px;
    border: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    text-align: center;
`;

const PlaceholderIcon = styled.div`
    margin-bottom: 2px;
    opacity: 0.45;
    font-size: 24px;
`;

const PlaceholderTitle = styled.p`
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
`;

const PlaceholderText = styled.p`
    margin: 0;
    max-width: 46ch;
    font-size: 13px;
    line-height: 1.5;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const Scroller = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
`;

interface CloudKnowledgeBasePageProps {
    inset?: boolean;
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
    const { inset, onCreateNew, onSelectExisting } = props;
    const { rpcClient } = useRpcContext();
    const { platformExtState, platformRpcClient, devantConsoleUrl, loginToDevant, onLinkDevantProject } =
        usePlatformExtContext();

    const isLoggedIn = !!platformExtState?.isLoggedIn;
    const isSignedIn = isLoggedIn && !!platformExtState?.selectedContext?.project;

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
        select: (data) => ({ ...data, data: (data?.data || []).filter(isKnowledgeBaseService) }),
    });

    const items: MarketplaceItem[] = knowledgeBases?.data || [];

    const openConsole = () =>
        rpcClient.getCommonRpcClient().openExternalUrl({
            url: `${devantConsoleUrl}/organizations/${platformExtState?.selectedContext?.org?.handle}`,
        });

    const placeholder = (icon: string, title: string, text: string, action: { label: string; icon: string; onClick: () => void }) => (
        <Placeholder>
            <PlaceholderIcon>
                <Codicon name={icon} sx={{ fontSize: 24, width: 24, height: 24 }} />
            </PlaceholderIcon>
            <PlaceholderTitle>{title}</PlaceholderTitle>
            <PlaceholderText>{text}</PlaceholderText>
            <LinkButton onClick={action.onClick} sx={{ marginTop: 6, fontSize: 13 }}>
                <Codicon name={action.icon} sx={{ fontSize: 16, width: 16, height: 16 }} />
                {action.label}
            </LinkButton>
        </Placeholder>
    );

    const renderExisting = () => {
        if (!isLoggedIn) {
            return placeholder(
                "cloud",
                "Not signed in to WSO2 Cloud",
                "Sign in to reuse a knowledge base your organization already manages — embeddings, storage and access are handled for you.",
                { label: "Sign In to WSO2 Cloud", icon: "sign-in", onClick: loginToDevant }
            );
        }
        if (!isSignedIn) {
            return placeholder(
                "link",
                "No WSO2 Cloud project linked",
                "Link this integration to a project to browse the knowledge bases it can use.",
                { label: "Link a WSO2 Cloud Project", icon: "link", onClick: onLinkDevantProject }
            );
        }
        if (isLoading) {
            return (
                <Placeholder>
                    <ProgressRing />
                </Placeholder>
            );
        }
        if (items.length === 0) {
            return placeholder(
                "database",
                "No knowledge bases yet",
                "Create one in the WSO2 Cloud console to share it across integrations, or configure this connection manually above.",
                { label: "Open WSO2 Cloud Console", icon: "link-external", onClick: openConsole }
            );
        }
        return (
            <Scroller>
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
            </Scroller>
        );
    };

    return (
        <Page inset={inset}>
            <Intro>
                A knowledge base gives the agent documents to retrieve from. Connect one managed in WSO2 Cloud, or
                configure the connection yourself.
            </Intro>

            <Group>
                <GroupLabel>Configure manually</GroupLabel>
                <ButtonCard
                    id="create-new-cloud-kb"
                    title="Manually Config WSO2 Cloud Knowledge Base"
                    description="Add configurations for the Knowledge Base connection."
                    icon={<Codicon name="add" />}
                    onClick={onCreateNew}
                />
            </Group>

            <ExistingGroup>
                <GroupLabel>Existing in WSO2 Cloud</GroupLabel>
                {renderExisting()}
            </ExistingGroup>
        </Page>
    );
}
