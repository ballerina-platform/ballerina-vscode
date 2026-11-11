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
import { MARKETPLACE_ITEM_UNAVAILABLE } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon, ProgressRing } from "@wso2/ui-toolkit";
import { debounce } from "lodash";
import ButtonCard from "../../../../components/ButtonCard";
import { BodyTinyInfo } from "../../../styles";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { hasCloudProject } from "../../../../providers/cloud-project";
import { useQuery } from "@tanstack/react-query";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { GetMarketplaceItemsParams, MarketplaceItem } from "@wso2/wso2-platform-core";
import {
    ConnectorsGrid,
    FilterButton,
    FilterButtons,
    Section,
    SectionHeader,
    SectionTitle,
} from "../AddConnectionPopup/styles";
import {
    ConnectionFilterType,
    DevantConnectionFlow,
    filterConnectionMarketplaceItems,
    getKnownAvailableNode,
    INTERNAL_SERVICES,
    ProgressWrap,
    cardSubtitle,
    errorMessageOf,
    latestOnly,
} from "./utils";

// Number of connections rendered in the list.
const CONNECTIONS_PAGE_SIZE = 24;

// Knowledge base services have to be filtered out client-side to keep the visible count stable we over-fetch a fixed multiple of
// the page size and trim back to CONNECTIONS_PAGE_SIZE.
//
// Note: If more than (LIMIT - CONNECTIONS_PAGE_SIZE) of the first fetched items get filtered out, 
// the list renders FEWER than CONNECTIONS_PAGE_SIZE and there is no "load more" to recover the rest.
// Also every (debounced) search request also fetches this many items.
const MARKETPLACE_OVERFETCH_MULTIPLIER = 4;
const MARKETPLACE_OVERFETCH_LIMIT = CONNECTIONS_PAGE_SIZE * MARKETPLACE_OVERFETCH_MULTIPLIER;

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

/**
 * The WSO2 Cloud services of the selected environment. Those that can't be connected, or any before the
 * integration is deployed, are shown disabled with the reason.
 */
export function DevantConnectorList(props: DevantConnectorListProps) {
    const { onItemSelect, fileName, target, searchText } = props;
    const { platformExtState, platformRpcClient } = usePlatformExtContext();
    const { rpcClient } = useRpcContext();
    const [filterType, setFilterType] = useState<ConnectionFilterType>("all");

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

    // The listing doesn't say what kind of service an endpoint is; the endpoint itself does, and picks the form.
    // Only the latest pick is acted on, so a service picked while an earlier one is being read replaces it.
    const withServiceType = useMemo(
        () =>
            latestOnly(async (listed: MarketplaceItem): Promise<MarketplaceItem> => {
                if (listed.resourceType !== "SERVICE" || listed.isThirdParty) {
                    return listed;
                }
                try {
                    const endpoint = await platformRpcClient?.getMarketplaceItem({
                        orgId: platformExtState?.session?.org.handle,
                        serviceId: listed.serviceId,
                    });
                    return endpoint?.serviceType ? { ...listed, serviceType: endpoint.serviceType } : listed;
                } catch (error) {
                    console.error(`Couldn't read the type of ${listed.name}; it is offered as a REST API: ${errorMessageOf(error)}`);
                    return listed;
                }
            }),
        [platformRpcClient, platformExtState?.session?.org.handle],
    );

    const handleMarketplaceItemClick = async (listed: MarketplaceItem) => {
        const picked = await withServiceType(listed);
        if (!picked) {
            return;
        }
        const item = picked.value;
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
        org: platformExtState?.session?.org.uuid,
        project: platformExtState?.selectedContext?.projectName,
        debouncedSearch: debouncedSearchText,
        isLoggedIn: platformExtState.isLoggedIn,
        component: platformExtState?.selectedIntegration?.integration.id,
        // whether a service can be connected to is per environment
        env: platformExtState?.selectedEnv?.id,
    };

    const getMarketPlaceParams: GetMarketplaceItemsParams = {
        limit: MARKETPLACE_OVERFETCH_LIMIT,
        offset: 0,
        networkVisibilityFilter: "all",
        networkVisibilityprojectId: platformExtState?.selectedContext?.projectName,
        sortBy: "createdTime",
        query: debouncedSearchText || undefined,
        searchContent: false,
    };

    if (filterType === INTERNAL_SERVICES) {
        getMarketPlaceParams.isThirdParty = false;
    }
    if (filterType === "third-party-services") {
        getMarketPlaceParams.isThirdParty = true;
        getMarketPlaceParams.networkVisibilityFilter = "org,project,public";
    }

    const { data: marketplaceServices, isLoading: isLoadingMarketplace, error: marketplaceError } = useQuery({
        queryKey: ["marketplace-services", filterType, reactQueryKey],
        queryFn: () =>
            platformRpcClient?.getMarketplaceItems({
                orgId: platformExtState?.session?.org.handle,
                request: getMarketPlaceParams,
            }),
        enabled:
            // The list is for the selected environment, which is read once the project is linked.
            filterType !== "databases" && hasCloudProject(platformExtState) && !!platformExtState?.selectedEnv,
        select: (data) => ({
            ...data,
            data: filterConnectionMarketplaceItems(data.data, CONNECTIONS_PAGE_SIZE),
        }),
    });

    const { data: marketplaceDbs, isLoading: isLoadingDbs } = useQuery({
        queryKey: ["marketplace-dbs", platformExtState?.selectedContext?.projectName],
        queryFn: () =>
            platformRpcClient?.getMarketplaceDatabases({
                orgId: platformExtState?.session?.org.handle,
            }),
        enabled:
            ["databases", "all"].includes(filterType) && hasCloudProject(platformExtState),
    });

    // A just-linked project's environments are still being read: the services follow them.
    // Why there is no environment, once that is known; the services wait for one until then.
    const envsError = platformExtState?.selectedEnv ? undefined : platformExtState?.envsError;
    const isWaitingForEnv = filterType !== "databases" && !platformExtState?.selectedEnv && !envsError;
    const isLoading = isLoadingMarketplace || isLoadingDbs || isWaitingForEnv;

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

    const servicesError = envsError ?? (marketplaceError ? errorMessageOf(marketplaceError) : undefined);
    const showServicesError = !!servicesError && filterType !== "databases" && !isLoading;
    // Connections are made for a deployed integration: before that the services are listed, not offered.
    const notDeployed = !platformExtState?.selectedIntegration;
    const showNotDeployed = notDeployed && !showServicesError && filterType !== "databases";

    let emptyText = "No resources in WSO2 Cloud";
    if (filterType === INTERNAL_SERVICES) {
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
                            active={filterType === INTERNAL_SERVICES}
                            onClick={() => setFilterType(INTERNAL_SERVICES)}
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
                {showServicesError && (
                    <BodyTinyInfo style={{ paddingBottom: "10px" }}>
                        Couldn't list the services in WSO2 Cloud: {servicesError}
                    </BodyTinyInfo>
                )}
                {showNotDeployed && (
                    <BodyTinyInfo style={{ paddingBottom: "10px" }}>
                        <VSCodeLink onClick={() => platformRpcClient?.deployIntegrationInDevant()}>
                            Deploy this integration
                        </VSCodeLink>{" "}
                        to WSO2 Cloud to connect it to these services.
                    </BodyTinyInfo>
                )}
                {/* After a failed listing, "no resources" would say something nobody knows. */}
                {!(showServicesError && items.length === 0) && (
                    <ConnectionSection
                        emptyText={emptyText}
                        loading={isLoading}
                        data={items}
                        searchText={searchText}
                        renderItem={(item) => {
                            // A service the integration can't connect to now is shown with the reason, not hidden.
                            const unavailable = item.properties?.[MARKETPLACE_ITEM_UNAVAILABLE];
                            const blocked = !!unavailable || (notDeployed && item.resourceType === "SERVICE");
                            return (
                                <div style={{ height: "100%", ...(blocked ? { opacity: 0.6 } : {}) }}>
                                    <ButtonCard
                                        fillHeight
                                        id={`connector-${item.resourceId}`}
                                        title={item.name}
                                        description={cardSubtitle(item, unavailable)}
                                        icon={<Codicon name="package" />}
                                        onClick={() => handleMarketplaceItemClick(item)}
                                        disabled={loadingBalOrgConnectors || blocked}
                                        tooltip={unavailable ?? (blocked ? "Deploy this integration to WSO2 Cloud first." : undefined)}
                                    />
                                </div>
                            );
                        }}
                    />
                )}
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
