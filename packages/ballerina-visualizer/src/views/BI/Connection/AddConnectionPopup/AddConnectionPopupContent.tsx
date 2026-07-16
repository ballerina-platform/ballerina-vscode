/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { AvailableNode, Category, Item, LinePosition } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon, Icon, ThemeColors, Typography, ProgressRing } from "@wso2/ui-toolkit";
import { cloneDeep, debounce } from "lodash";
import ButtonCard from "../../../../components/ButtonCard";
import { ConnectorIcon } from "@wso2/bi-diagram";
import { BodyTinyInfo } from "../../../styles";
import { ArrowIcon, ConnectorOptionButtons, ConnectorOptionCard, ConnectorOptionContent, ConnectorOptionDescription, ConnectorOptionIcon, ConnectorOptionTitle, ConnectorOptionTitleContainer, ConnectorsGrid, ConnectorTypeLabel, CreateConnectorOptions, FilterButton, FilterButtons, IntroText, SearchContainer, Section, SectionHeader, SectionTitle, StyledSearchBox } from "./styles";
import { AddConnectionPopupProps } from "./index";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";

interface Props extends AddConnectionPopupProps {
    handleDatabaseConnection?: () => void;
    handleApiSpecConnection?: () => void;
    handleSelectConnector: (connector: AvailableNode, filteredCategories: Category[]) => void;
    DevantServicesSection?: React.ComponentType<{ searchText: string }>;
    selectionOnly?: boolean;
}

export function AddConnectionPopupContent(props: Props) {
    const {
        fileName,
        target,
        handleDatabaseConnection,
        handleApiSpecConnection,
        handleSelectConnector,
        DevantServicesSection,
        selectionOnly = false,
    } = props;
    const { rpcClient } = useRpcContext();
    const { platformExtState, loginToDevant, handleLinkWorkspace, platformRpcClient } = usePlatformExtContext();

    const [searchText, setSearchText] = useState<string>("");
    const [connectors, setConnectors] = useState<Category[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [fetchingInfo, setFetchingInfo] = useState(false);
    const [filterType, setFilterType] = useState<"All" | "Standard" | "Organization">("All");

    const fetchConnectors = useCallback((filter?: boolean) => {
        setFetchingInfo(true);
        const defaultPosition: LinePosition = { line: 0, offset: 0 };
        const position = target || defaultPosition;
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                position: {
                    startLine: position,
                    endLine: position,
                },
                filePath: fileName,
                queryMap: {
                    limit: 60,
                    filterByCurrentOrg: filter ?? filterType === "Organization",
                },
                searchKind: "CONNECTOR",
            })
            .then(async (model) => {
                console.log(">>> bi connectors", model);
                console.log(">>> bi filtered connectors", model.categories);
                setConnectors(model.categories);
            })
            .finally(() => {
                setIsSearching(false);
                setFetchingInfo(false);
            });
    }, [rpcClient, target, fileName, filterType]);

    useEffect(() => {
        setIsSearching(true);
        fetchConnectors();
    }, []);

    const handleSearch = useCallback((text: string) => {
        const defaultPosition: LinePosition = { line: 0, offset: 0 };
        const position = target || defaultPosition;
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                position: {
                    startLine: position,
                    endLine: position,
                },
                filePath: fileName,
                queryMap: {
                    q: text,
                    limit: 60,
                    filterByCurrentOrg: filterType === "Organization" ? true : false,
                },
                searchKind: "CONNECTOR",
            })
            .then(async (model) => {
                console.log(">>> bi searched connectors", model);
                console.log(">>> bi filtered connectors", model.categories);

                // When searching, the API might return a flat array of connectors instead of categories
                // Check if categories exist and have the proper structure (with items arrays)
                let normalizedCategories: Category[] = [];

                if (model.categories && Array.isArray(model.categories)) {
                    // Check if the first item is a category (has items) or a connector (has codedata)
                    const firstItem = model.categories[0];
                    if (firstItem && "items" in firstItem && Array.isArray(firstItem.items)) {
                        // Proper category structure - use as is
                        normalizedCategories = model.categories;
                    } else if (firstItem && "codedata" in firstItem) {
                        // Flat array of connectors - wrap in a category
                        normalizedCategories = [{
                            metadata: {
                                label: "Search Results",
                                description: ""
                            },
                            items: model.categories as unknown as AvailableNode[]
                        }];
                    }
                }

                console.log(">>> normalized categories for search", normalizedCategories);
                setConnectors(normalizedCategories);
            })
            .finally(() => {
                setIsSearching(false);
            });
    }, [rpcClient, target, fileName, filterType]);

    const debouncedSearch = useMemo(
        () => debounce(handleSearch, 1100),
        [handleSearch]
    );

    useEffect(() => {
        setIsSearching(true);
        debouncedSearch(searchText);
        return () => debouncedSearch.cancel();
    }, [searchText, debouncedSearch]);

    useEffect(() => {
        setIsSearching(true);
        fetchConnectors();
    }, [filterType, fetchConnectors]);

    useEffect(() => {
        rpcClient?.onProjectContentUpdated((state: boolean) => {
            if (state) {
                fetchConnectors();
            }
        });
    }, [rpcClient, fetchConnectors]);

    const handleOnSearch = (text: string) => {
        setSearchText(text);
    };

    const filterItems = (items: Item[]): Item[] => {
        return items
            .map((item) => {
                if ("items" in item) {
                    const filteredItems = filterItems(item.items);
                    return {
                        ...item,
                        items: filteredItems,
                    };
                } else {
                    const lowerCaseTitle = item.metadata.label.toLowerCase();
                    const lowerCaseDescription = item.metadata.description?.toLowerCase() || "";
                    const lowerCaseSearchText = searchText.toLowerCase();
                    if (
                        lowerCaseTitle.includes(lowerCaseSearchText) ||
                        lowerCaseDescription.includes(lowerCaseSearchText)
                    ) {
                        return item;
                    }
                }
            })
            .filter(Boolean);
    };

    const filteredCategories = cloneDeep(connectors).map((category) => {
        if (!category || !category.items) {
            return category;
        }
        // Only apply client-side filtering if there's no search text (backend already filtered)
        if (searchText) {
            // When searching, show all items from backend results
            return category;
        }
        category.items = filterItems(category.items);
        return category;
    }).filter((category) => {
        if (!category) {
            return false;
        }
        // When searching, show all categories that have items
        if (searchText) {
            return category.items && category.items.length > 0;
        }
        // Standard & All: exclude Local (Local only appears in search results)
        // Organization: backend pre-filters with filterByCurrentOrg - show all returned
        if (filterType === "Organization") {
            return true;
        }
        return category.metadata.label !== "Local";
    });

    const isLoading = isSearching || fetchingInfo;

    const openLearnMoreURL = () => {
        rpcClient.getCommonRpcClient().openExternalUrl({
            url: 'https://ballerina.io/learn/publish-packages-to-ballerina-central/'
        })
    };

    const getConnectorCreationOptions = () => {
        if (!searchText || searchText.trim() === "") {
            // No search - show both options
            return { showApiSpec: true, showDatabase: true };
        }

        const lowerSearchText = searchText.toLowerCase().trim();

        // Database-related keywords
        const databaseKeywords = [
            "database", "db", "mysql", "postgresql", "postgres", "mssql", "sql server",
            "sqlserver", "oracle", "sqlite", "mariadb", "mongodb", "cassandra",
            "redis", "dynamodb", "table", "schema", "query", "sql"
        ];

        // API-related keywords
        const apiKeywords = [
            "api", "http", "https", "rest", "graphql", "soap", "wsdl", "openapi",
            "swagger", "endpoint", "service", "client", "request", "response",
            "json", "xml", "yaml", "websocket", "rpc"
        ];

        const isDatabaseSearch = databaseKeywords.some(keyword => lowerSearchText.includes(keyword));
        const isApiSearch = apiKeywords.some(keyword => lowerSearchText.includes(keyword));

        // If search matches database keywords, show only database option
        if (isDatabaseSearch && !isApiSearch) {
            return { showApiSpec: false, showDatabase: true };
        }

        // If search matches API keywords, show only API spec option
        if (isApiSearch && !isDatabaseSearch) {
            return { showApiSpec: true, showDatabase: false };
        }

        // If both or neither match, show both options
        return { showApiSpec: true, showDatabase: true };
    };

    const connectorOptions = getConnectorCreationOptions();
    
    return (
        <>
            {!selectionOnly && platformExtState?.isExtInstalled && !platformExtState?.isLoggedIn && (
                <>
                    {!platformExtState?.hasPossibleComponent ? (
                        <IntroText>
                            <VSCodeLink onClick={() => platformRpcClient.deployIntegrationInDevant()}>
                                Deploy integration
                            </VSCodeLink>{" "}
                            or{" "}
                            <VSCodeLink onClick={handleLinkWorkspace}>
                                associate workspace
                            </VSCodeLink>{" "}
                            with a WSO2 Cloud project in order to connect with cloud dependencies
                        </IntroText>
                    ) : <IntroText>
                        <VSCodeLink onClick={loginToDevant}>
                            Login
                        </VSCodeLink>{" "}
                        to WSO2 Cloud in order to connect with cloud dependencies
                    </IntroText>
                    }
                </>
            )}
            {!selectionOnly && ((platformExtState?.isLoggedIn && platformExtState?.selectedContext?.project) ? (
                <IntroText>
                    To establish your connection, first define a connector. You may create a custom connector using an
                    API specification. Alternatively, you can select one of the pre-built
                    connectors below or connect to services running in WSO2 Cloud or services configured in WSO2 Cloud. You will
                    then be guided to provide the required details to complete the connection setup.
                </IntroText>
            ) : (
                <IntroText>
                    To establish your connection, first define a connector. You may create a custom connector using an
                    API specification or by introspecting a database. Alternatively, you can select one of the pre-built
                    connectors below. You will then be guided to provide the required details to complete the connection
                    setup.
                </IntroText>
            ))}

            <SearchContainer>
                <StyledSearchBox
                    value={searchText}
                    placeholder="Search connectors..."
                    onChange={handleOnSearch}
                    size={60}
                />
            </SearchContainer>

            {!selectionOnly && (connectorOptions.showApiSpec || connectorOptions.showDatabase) && (
                <Section>
                    <SectionTitle variant="h4">Create New Connector</SectionTitle>
                    <CreateConnectorOptions>
                        {connectorOptions.showApiSpec && handleApiSpecConnection && (
                            <ConnectorOptionCard onClick={handleApiSpecConnection}>
                                <ConnectorOptionIcon>
                                    <Icon name="bi-api-spec" sx={{ fontSize: 24, width: 24, height: 24 }} />
                                </ConnectorOptionIcon>
                                <ConnectorOptionContent>
                                    <ConnectorOptionTitle>Connect via API Specification</ConnectorOptionTitle>
                                    <ConnectorOptionDescription>
                                        Import an OpenAPI or WSDL file to create a connector
                                    </ConnectorOptionDescription>
                                    <ConnectorOptionButtons>
                                        <ConnectorTypeLabel>
                                            OpenAPI
                                        </ConnectorTypeLabel>
                                        <ConnectorTypeLabel>
                                            WSDL
                                        </ConnectorTypeLabel>
                                    </ConnectorOptionButtons>
                                </ConnectorOptionContent>
                                <ArrowIcon>
                                    <Codicon name="chevron-right" />
                                </ArrowIcon>
                            </ConnectorOptionCard>
                        )}
                        {/* Database connection option */}
                        {connectorOptions.showDatabase && handleDatabaseConnection && (
                            <ConnectorOptionCard onClick={handleDatabaseConnection}>
                                <ConnectorOptionIcon>
                                    <Icon name="bi-db" sx={{ fontSize: 24, width: 24, height: 24 }} />
                                </ConnectorOptionIcon>
                                <ConnectorOptionContent>
                                    <ConnectorOptionTitleContainer>
                                        <ConnectorOptionTitle>Connect to a Database</ConnectorOptionTitle>
                                    </ConnectorOptionTitleContainer>
                                    <ConnectorOptionDescription>
                                        Enter credentials to introspect and discover database tables
                                    </ConnectorOptionDescription>
                                    <ConnectorOptionButtons>
                                        <ConnectorTypeLabel>
                                            MySQL
                                        </ConnectorTypeLabel>
                                        <ConnectorTypeLabel>
                                            MSSQL
                                        </ConnectorTypeLabel>
                                        <ConnectorTypeLabel>
                                            PostgreSQL
                                        </ConnectorTypeLabel>
                                    </ConnectorOptionButtons>
                                </ConnectorOptionContent>
                                <ArrowIcon>
                                    <Codicon name="chevron-right" />
                                </ArrowIcon>
                            </ConnectorOptionCard>
                        )}
                    </CreateConnectorOptions>
                </Section>
            )}

            {!selectionOnly && DevantServicesSection && <DevantServicesSection searchText={searchText} />}

            <Section>
                <SectionHeader>
                    <SectionTitle variant="h4" $compactTypography={selectionOnly}>
                        {selectionOnly ? "Available Connectors" : "Pre-built Connectors"}
                    </SectionTitle>
                    <FilterButtons>
                        <FilterButton
                            active={filterType === "All"}
                            $compactTypography={selectionOnly}
                            onClick={() => setFilterType("All")}
                        >
                            All
                        </FilterButton>
                        <FilterButton
                            active={filterType === "Standard"}
                            $compactTypography={selectionOnly}
                            onClick={() => setFilterType("Standard")}
                        >
                            Standard
                        </FilterButton>
                        <FilterButton
                            active={filterType === "Organization"}
                            $compactTypography={selectionOnly}
                            onClick={() => setFilterType("Organization")}
                        >
                            Organization
                        </FilterButton>
                    </FilterButtons>
                </SectionHeader>
                {isLoading && (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "24px" }}>
                        <ProgressRing />
                    </div>
                )}
                {!isLoading && filteredCategories && filteredCategories.length > 0 && (
                    <ConnectorsGrid>
                        {filteredCategories.map((category, index) => {
                            if (!category.items || category.items.length === 0) {
                                return null;
                            }

                            return (
                                <React.Fragment key={category.metadata.label + index}>
                                    {category.items.map((connector, connectorIndex) => {
                                        const availableNode = connector as AvailableNode;
                                        if (!("codedata" in connector)) {
                                            return null;
                                        }
                                        return (
                                            <ButtonCard
                                                id={`connector-${availableNode.metadata.label.replace(/[ .]/g, "-").toLowerCase()}`}
                                                key={availableNode.metadata.label + connectorIndex}
                                                title={availableNode.metadata.label}
                                                description={
                                                    availableNode.codedata
                                                        ? availableNode.codedata.org +
                                                        " / " +
                                                        availableNode.codedata.module
                                                        : availableNode.metadata.description || ""
                                                }
                                                truncate={true}
                                                icon={
                                                    availableNode.metadata.icon ? (
                                                        <ConnectorIcon url={availableNode.metadata.icon} />
                                                    ) : (
                                                        <Codicon name="package" />
                                                    )
                                                }
                                                onClick={() => handleSelectConnector(availableNode, filteredCategories)}
                                            />
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </ConnectorsGrid>
                )}
                {!isLoading && (!filteredCategories || filteredCategories.length === 0) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", padding: "24px" }}>
                        {filterType === "Organization" ? (
                            <>
                                <BodyTinyInfo
                                    style={{
                                        textAlign: "center",
                                        fontSize: selectionOnly ? "13px" : undefined,
                                    }}
                                >
                                    No connectors found in your organization. You can create and publish connectors to Ballerina Central.
                                </BodyTinyInfo>
                                <BodyTinyInfo
                                    style={{
                                        textAlign: "center",
                                        color: 'var(--vscode-descriptionForeground)',
                                        fontSize: selectionOnly ? "13px" : undefined,
                                    }}
                                >
                                    Learn how to{' '}
                                    <span
                                        style={{
                                            color: 'var(--vscode-textLink-foreground)',
                                            cursor: 'pointer',
                                            textDecoration: 'underline'
                                        }}
                                        onClick={() => {
                                            openLearnMoreURL();
                                        }}
                                    >
                                        publish packages to Ballerina Central
                                    </span>
                                </BodyTinyInfo>
                            </>
                        ) : (
                            <Typography
                                variant="body2"
                                sx={{
                                    color: ThemeColors.ON_SURFACE_VARIANT,
                                    fontSize: selectionOnly ? "13px" : undefined,
                                }}
                            >
                                No connectors found.
                            </Typography>
                        )}
                    </div>
                )}
            </Section>
        </>
    );
}
