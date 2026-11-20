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
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { Codicon, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { useQuery } from "@tanstack/react-query";
import { GetMarketplaceItemsParams, MarketplaceItem } from "@wso2/wso2-platform-core";
import ButtonCard from "../../../../components/ButtonCard";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { hasCloudProject } from "../../../../providers/cloud-project";
import { ConnectorsGrid } from "../AddConnectionPopup/styles";
import { CloudAccessNotice, useCloudAccessRefresh } from "./CloudAccessNotice";
import { MARKETPLACE_ITEM_UNAVAILABLE } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { cardSubtitle, errorMessageOf, isKnowledgeBaseService, knowledgeBaseName, ProgressWrap } from "./utils";
import { listAllMarketplaceItems } from "./devant-kb-utils";

// Every page is read, since knowledge bases are found by tag only after the host pages the list.
const KB_MARKETPLACE_FETCH_LIMIT = 50;

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

const GroupLabel = styled.h4`
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
`;

const GroupText = styled.p`
    margin: 0;
    max-width: 62ch;
    font-size: 13px;
    line-height: 1.5;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

interface CloudKnowledgeBasePageProps {
    inset?: boolean;
    // Opens a blank CloudKnowledgeBase create form (manual entry, no WSO2 Cloud service pre-selected).
    onCreateNew: () => void;
    // Selecting an existing knowledge base service connects to it and opens the pre-filled form.
    onSelectExisting?: (item: MarketplaceItem) => void;
}

/**
 * Intermediate page shown when the "WSO2 Cloud Knowledge Base" box is selected. Offers creating a
 * new knowledge base manually.
 */
export function CloudKnowledgeBasePage(props: CloudKnowledgeBasePageProps) {
    const { inset, onCreateNew, onSelectExisting } = props;
    const { platformExtState, platformRpcClient, handleLinkWorkspace } = usePlatformExtContext();
    // Access allowed from the Accounts menu is not announced by VS Code: read the sign-in again on open.
    useCloudAccessRefresh();

    const isSignedIn = hasCloudProject(platformExtState);
    // Cloud-v2 lists resources at project level, but creates a connection for a cloud integration.
    const notCreated = !platformExtState?.selectedIntegration;

    const getMarketPlaceParams: GetMarketplaceItemsParams = {
        limit: KB_MARKETPLACE_FETCH_LIMIT,
        offset: 0,
        networkVisibilityFilter: "all",
        networkVisibilityprojectId: platformExtState?.selectedContext?.projectName,
        sortBy: "createdTime",
        searchContent: false,
    };

    const {
        data: knowledgeBases,
        isLoading,
        error,
    } = useQuery({
        queryKey: [
            "kb-marketplace-services",
            platformExtState?.session?.org.uuid,
            platformExtState?.session?.org.handle,
            platformExtState?.selectedContext?.projectName,
            platformExtState?.selectedEnv?.id,
        ],
        queryFn: () =>
            listAllMarketplaceItems(platformRpcClient, platformExtState?.session?.org.handle, getMarketPlaceParams),
        enabled: isSignedIn && !!onSelectExisting,
        select: (data) => ({ ...data, data: (data?.data || []).filter(isKnowledgeBaseService) }),
    });

    const items: MarketplaceItem[] = knowledgeBases?.data || [];

    return (
        <Page inset={inset}>
            <Intro>
                A knowledge base gives the agent documents to retrieve from. Connect one managed in Choreo Cloud, or
                configure the connection yourself.
            </Intro>

            <Group>
                <GroupLabel>Configure manually</GroupLabel>
                <ButtonCard
                    id="create-new-cloud-kb"
                    title="Manually Config Choreo Cloud Knowledge Base"
                    description="Add configurations for the Knowledge Base connection."
                    icon={<Codicon name="add" />}
                    onClick={onCreateNew}
                />
            </Group>

            <CloudAccessNotice purpose="to use Choreo Cloud knowledge bases" />

            {!!onSelectExisting && platformExtState?.isLoggedIn && !isSignedIn && (
                <Group>
                    <GroupLabel>Existing in Choreo Cloud</GroupLabel>
                    {platformExtState.selectedContext?.foreignOrg ? (
                        <GroupText>
                            This workspace is linked to the Choreo Cloud organization{" "}
                            {platformExtState.selectedContext.orgHandle}. Sign in to that organization, or{" "}
                            <VSCodeLink onClick={handleLinkWorkspace}>associate the workspace</VSCodeLink> with a
                            project of yours, to see existing knowledge bases.
                        </GroupText>
                    ) : (
                        <GroupText>
                            <VSCodeLink onClick={handleLinkWorkspace}>Associate the workspace</VSCodeLink> with a Choreo
                            Cloud project to see existing knowledge bases.
                        </GroupText>
                    )}
                </Group>
            )}

            {isSignedIn && (
                <Group>
                    <GroupLabel>Existing in Choreo Cloud</GroupLabel>
                    {!onSelectExisting ? (
                        <GroupText>
                            Picking an existing Choreo Cloud knowledge base is not available yet. Configure the connection manually above.
                        </GroupText>
                    ) : (
                        <>
                            {notCreated && !error && (
                                <GroupText>
                                    <VSCodeLink onClick={() => platformRpcClient?.deployIntegrationInDevant()}>
                                        Create this integration
                                    </VSCodeLink>{" "}
                                    in Choreo Cloud to connect it to these knowledge bases. It doesn't have to be
                                    deployed.
                                </GroupText>
                            )}
                            {isLoading ? (
                                <ProgressWrap>
                                    <ProgressRing />
                                </ProgressWrap>
                            ) : error ? (
                                <GroupText>Could not load Choreo Cloud knowledge bases: {errorMessageOf(error)}</GroupText>
                            ) : items.length === 0 ? (
                                <GroupText>No knowledge bases found that this integration can connect to.</GroupText>
                            ) : (
                                <ConnectorsGrid>
                                    {items.map((item) => {
                                        // As in the services list: a knowledge base the integration can't connect to
                                        // now is shown with the reason, not hidden, and can't be picked.
                                        const unavailable = item.properties?.[MARKETPLACE_ITEM_UNAVAILABLE];
                                        const blocked = !!unavailable || notCreated;
                                        return (
                                            <div key={item.serviceId || item.resourceId} style={blocked ? { opacity: 0.6 } : undefined}>
                                                <ButtonCard
                                                    id={`kb-connector-${item.resourceId}`}
                                                    title={knowledgeBaseName(item)}
                                                    description={cardSubtitle(item, unavailable)}
                                                    icon={<Codicon name="database" />}
                                                    onClick={() => onSelectExisting(item)}
                                                    disabled={blocked}
                                                    tooltip={unavailable ?? (blocked ? "Create this integration in Choreo Cloud first." : undefined)}
                                                />
                                            </div>
                                        );
                                    })}
                                </ConnectorsGrid>
                            )}
                        </>
                    )}
                </Group>
            )}
        </Page>
    );
}
