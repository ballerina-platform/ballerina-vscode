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

import React, { useState, useEffect, useMemo } from "react";
import { AvailableNode, LinePosition } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon, ProgressRing } from "@wso2/ui-toolkit";
import { debounce } from "lodash";
import ButtonCard from "../../../../components/ButtonCard";
import { BodyTinyInfo } from "../../../styles";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { useQuery } from "@tanstack/react-query";
import { GetMarketplaceItemsParams, MarketplaceItem } from "@wso2/wso2-platform-core";
import {
    ConnectorsGrid,
    FilterButton,
    FilterButtons,
    Section,
    SectionHeader,
    SectionTitle,
} from "../AddConnectionPopup/styles";
import { DevantConnectionFlow, getKnownAvailableNode, isKnowledgeBaseService, ProgressWrap } from "./utils";

// Target number of connections to show. Knowledge base services can only be filtered out client-side
// (the marketplace tag filter is include-only), so over-fetch and trim to this size so filtered-out
// KBs don't shrink the visible connections list (or search results).
const CONNECTIONS_PAGE_SIZE = 24;
const MARKETPLACE_OVERFETCH_LIMIT = 100;

interface DevantConnectorListProps {
    onItemSelect: (
        flow: DevantConnectionFlow | null,
        item: MarketplaceItem,
        availableNode: AvailableNode | undefined,
    ) => void;
    fileName: string;
    target?: LinePosition;
    searchText?: string;
}

export function DevantConnectorList(props: DevantConnectorListProps) {
    const { onItemSelect, fileName, target, searchText } = props;
    const { platformExtState, platformRpcClient } = usePlatformExtContext();
    const { rpcClient } = useRpcContext();
    const [filterType, setFilterType] = useState<"all" | "internal-services" | "third-party-services" | "databases">(
        "all",
    );

    const [debouncedSearchText, setDebouncedSearchText] = useState(searchText || "");

    const debouncedSetSearch = useMemo(() => debounce((text: string) => setDebouncedSearchText(text), 500), []);

    useEffect(() => {
        debouncedSetSearch(searchText || "");
        return () => debouncedSetSearch.cancel();
    }, [searchText, debouncedSetSearch]);

    const { data: balOrgConnectors, isLoading: loadingBalOrgConnectors } = useQuery({
        queryKey: ["searchConnectors", fileName, target],
        queryFn: () =>
            rpcClient
                .getBIDiagramRpcClient()
                .search({ filePath: fileName, queryMap: { limit: 60, orgName: "ballerina" }, searchKind: "CONNECTOR" }),
    });

    const handleMarketplaceItemClick = (item: MarketplaceItem) => {
        // TODO: once we store the connector info in Devant side,
        // we should be able to open the correct form
        let availableNode: AvailableNode | undefined;
        if (item.serviceType === "REST") {
            availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerina", "http");
        } else if (item.serviceType === "GRAPHQL") {
            availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerina", "graphql");
        } else if (item.serviceType === "SOAP") {
            availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerina", "soap");
        } else if (item.serviceType === "GRPC") {
            availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerina", "grpc");
        } else if (item.resourceDetails?.databaseType === "postgres") {
            availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerinax", "postgresql");
        } else if (item.resourceDetails?.databaseType === "mysql") {
            availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerinax", "mysql");
        } else if (item.resourceDetails?.databaseType === "redis") {
            availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerinax", "redis");
        } else if (item.resourceDetails?.databaseType === "kafka") {
            availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerinax", "kafka");
        }

        if (item.resourceType === "DATABASE") {
            if (["postgres", "mysql"].includes(item.resourceDetails?.databaseType)) {
                onItemSelect(DevantConnectionFlow.CREATE_DATABASE_PERSIST_DB_SELECTED, item, availableNode);
            } else {
                console.error(
                    `Connection creation from type ${item.resourceDetails?.databaseType} is not supported yet.`,
                );
                return;
            }
        } else if (item.isThirdParty) {
            if (item.serviceType === "REST") {
                onItemSelect(DevantConnectionFlow.CREATE_THIRD_PARTY_OAS, item, availableNode);
            } else if (availableNode) {
                onItemSelect(DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER, item, availableNode);
            } else {
                onItemSelect(DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR, item, availableNode);
            }
        } else {
            if (item.serviceType === "REST") {
                onItemSelect(DevantConnectionFlow.CREATE_INTERNAL_OAS, item, availableNode);
            } else if (availableNode) {
                onItemSelect(DevantConnectionFlow.CREATE_INTERNAL_OTHER, item, availableNode);
            } else {
                onItemSelect(DevantConnectionFlow.CREATE_INTERNAL_OTHER_SELECT_BI_CONNECTOR, item, availableNode);
            }
        }
    };

    const reactQueryKey = {
        org: platformExtState?.selectedContext?.org?.uuid,
        project: platformExtState?.selectedContext?.project?.id,
        debouncedSearch: debouncedSearchText,
        isLoggedIn: platformExtState.isLoggedIn,
        component: platformExtState?.selectedComponent?.metadata?.id,
    };

    const getMarketPlaceParams: GetMarketplaceItemsParams = {
        limit: MARKETPLACE_OVERFETCH_LIMIT,
        offset: 0,
        networkVisibilityFilter: "all",
        networkVisibilityprojectId: platformExtState?.selectedContext?.project?.id,
        sortBy: "createdTime",
        query: debouncedSearchText || undefined,
        searchContent: false,
    };

    if (filterType === "internal-services") {
        getMarketPlaceParams.isThirdParty = false;
    }
    if (filterType === "third-party-services") {
        getMarketPlaceParams.isThirdParty = true;
        getMarketPlaceParams.networkVisibilityFilter = "org,project,public";
    }

    const { data: marketplaceServices, isLoading: isLoadingMarketplace } = useQuery({
        queryKey: ["marketplace-services", filterType, reactQueryKey],
        queryFn: () =>
            platformRpcClient?.getMarketplaceItems({
                orgId: platformExtState?.selectedContext?.org?.id?.toString(),
                request: getMarketPlaceParams,
            }),
        enabled:
            filterType !== "databases" && platformExtState.isLoggedIn && !!platformExtState?.selectedContext?.project,
        select: (data) => ({
            ...data,
            data: data.data
                .filter((item) => {
                    // Knowledge base services are listed under "Add Knowledge Base", not here.
                    if (isKnowledgeBaseService(item)) {
                        return false;
                    }
                    if (filterType === "internal-services") {
                        return item.component?.componentId !== platformExtState?.selectedComponent?.metadata?.id;
                    }
                    return true;
                })
                .slice(0, CONNECTIONS_PAGE_SIZE),
        }),
    });

    const { data: marketplaceDbs, isLoading: isLoadingDbs } = useQuery({
        queryKey: ["marketplace-dbs", platformExtState?.selectedContext?.project],
        queryFn: () =>
            platformRpcClient?.getMarketplaceDatabases({
                orgId: platformExtState?.selectedContext?.org?.id?.toString(),
            }),
        enabled:
            ["databases", "all"].includes(filterType) &&
            platformExtState.isLoggedIn &&
            !!platformExtState?.selectedContext?.project,
    });

    const isLoading = isLoadingMarketplace || isLoadingDbs;

    const items: MarketplaceItem[] = [];
    if (filterType === "databases") {
        items.push(
            ...(marketplaceDbs?.data?.filter((item) => item.name?.toLowerCase()?.includes(searchText?.toLowerCase())) ||
                []),
        );
    } else if (filterType === "all") {
        items.push(
            ...(marketplaceServices?.data || []),
            ...(marketplaceDbs?.data?.filter((item) => item.name?.toLowerCase()?.includes(searchText?.toLowerCase())) ||
                []),
        );
    } else {
        items.push(...(marketplaceServices?.data || []));
    }

    let emptyText = "No resources in WSO2 Cloud";
    if (filterType === "internal-services") {
        emptyText = "No services running";
    } else if (filterType === "third-party-services") {
        emptyText = "No third party services configured";
    } else if (filterType === "databases") {
        emptyText = "No databases running";
    }

    return (
        <>
            <Section>
                <SectionHeader>
                    <SectionTitle variant="h4">WSO2 Cloud Resources</SectionTitle>
                    <FilterButtons onClick={(e) => e.stopPropagation()}>
                        <FilterButton
                            title="All Services running or configured in WSO2 Cloud"
                            active={filterType === "all"}
                            onClick={() => setFilterType("all")}
                        >
                            All
                        </FilterButton>
                        <FilterButton
                            title="Services running in WSO2 Cloud"
                            active={filterType === "internal-services"}
                            onClick={() => setFilterType("internal-services")}
                        >
                            Internal Services
                        </FilterButton>
                        <FilterButton
                            title="Services configured in WSO2 Cloud"
                            active={filterType === "third-party-services"}
                            onClick={() => setFilterType("third-party-services")}
                        >
                            Third Party Services
                        </FilterButton>
                        <FilterButton
                            title="Databases in WSO2 Cloud"
                            active={filterType === "databases"}
                            onClick={() => setFilterType("databases")}
                        >
                            Databases
                        </FilterButton>
                    </FilterButtons>
                </SectionHeader>
                <ConnectionSection
                    emptyText={emptyText}
                    loading={isLoading}
                    data={items}
                    searchText={searchText}
                    renderItem={(item) => (
                        <ButtonCard
                            id={`connector-${item.resourceId}`}
                            title={item.name}
                            description={item.description}
                            icon={<Codicon name="package" />}
                            onClick={() => handleMarketplaceItemClick(item)}
                            disabled={loadingBalOrgConnectors}
                        />
                    )}
                />
            </Section>
        </>
    );
}

interface ConnectionSectionProps<T> {
    emptyText?: string;
    loading: boolean;
    data: T[];
    searchText: string;
    renderItem: (item: T) => React.ReactNode;
}

const ConnectionSection = <T,>({ emptyText, loading, data, searchText, renderItem }: ConnectionSectionProps<T>) => {
    return (
        <>
            {loading ? (
                <ProgressWrap>
                    <ProgressRing />
                </ProgressWrap>
            ) : (
                <>
                    {data?.length === 0 ? (
                        <>
                            {searchText ? (
                                <BodyTinyInfo style={{ paddingBottom: "10px" }}>
                                    {emptyText} in your WSO2 Cloud organization matching with "{searchText}"
                                </BodyTinyInfo>
                            ) : (
                                <BodyTinyInfo style={{ paddingBottom: "10px" }}>
                                    {emptyText} in your WSO2 Cloud organization
                                </BodyTinyInfo>
                            )}
                        </>
                    ) : (
                        <ConnectorsGrid>
                            {data?.map((item, index) => (
                                <React.Fragment key={index}>{renderItem(item)}</React.Fragment>
                            ))}
                        </ConnectorsGrid>
                    )}
                </>
            )}
        </>
    );
};
