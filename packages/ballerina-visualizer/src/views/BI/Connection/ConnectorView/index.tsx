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

import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { AvailableNode, Category, FlowNode, Item, LinePosition } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, ProgressRing, SearchBox, SplitView, ThemeColors, TreeViewItem, Typography, View } from "@wso2/ui-toolkit";
import { cloneDeep, debounce } from "lodash";
import ButtonCard from "../../../../components/ButtonCard";
import { BodyText, BodyTinyInfo, TopBar } from "../../../styles";
import { ConnectorIcon } from "@wso2/bi-diagram";
import { TitleBar } from "../../../../components/TitleBar";
import { TopNavigationBar } from "../../../../components/TopNavigationBar";

const ViewWrapper = styled.div<{ isHalfView?: boolean }>`
    display: flex;
    flex-direction: column;
    height: ${(props: { isHalfView: boolean }) => (props.isHalfView ? "40vh" : "100%")};
    width: 100%;
`;

const Container = styled.div`
    padding: 0 20px;
    width: 100%;
    height: 100%;
    padding-bottom: 20px;
    display: flex;
    flex-direction: column;
`;

const ListContainer = styled.div<{ isPopupView?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
    margin-left: 20px;
    height: ${(props: { isPopupView: boolean }) => (props.isPopupView ? "30vh" : "calc(100vh - 200px)")};
`;

const GridContainer = styled.div<{ isHalfView?: boolean }>`
    display: grid;
    grid-template-columns: ${(props: { isHalfView: boolean }) =>
        props.isHalfView ? "unset" : "repeat(auto-fill, minmax(200px, 1fr))"};
    gap: 12px;
    width: 100%;
`;

const Row = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-top: 32px;
    width: 100%;
`;

const LabelRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
`;

const TreeViewItemContent = styled.div<{ isLoading: boolean }>`
    display: flex;
    align-items: center;
    height: 20px;
    opacity: ${(props: { isLoading: boolean }) => props.isLoading ? 0.5 : 1};
    cursor: ${(props: { isLoading: boolean }) => props.isLoading ? 'not-allowed' : 'pointer'};
    pointer-events: ${(props: { isLoading: boolean }) => props.isLoading ? 'none' : 'auto'};
`;

const StyledSearchInput = styled(SearchBox)`
    height: 30px;
`;

interface ConnectorViewProps {
    projectPath: string;
    fileName: string;
    targetLinePosition: LinePosition;
    onSelectConnector: (connector: AvailableNode) => void;
    onAddGeneratedConnector: () => void;
    onClose?: () => void;
    hideTitle?: boolean;
    openCustomConnectorView?: boolean;
    isPopupView?: boolean;
}

export function ConnectorView(props: ConnectorViewProps) {
    const {
        projectPath,
        fileName,
        targetLinePosition,
        onSelectConnector,
        onAddGeneratedConnector,
        onClose,
        hideTitle,
        openCustomConnectorView,
        isPopupView
    } = props;
    const { rpcClient } = useRpcContext();

    const [connectors, setConnectors] = useState<Category[]>([]);
    const [searchText, setSearchText] = useState<string>("");
    const [isSearching, setIsSearching] = useState(false);
    const [fetchingInfo, setFetchingInfo] = useState(false);
    const [selectedConnectorCategory, setSelectedConnectorCategory] = useState<string>(
        openCustomConnectorView ? "LocalConnectors" : "StandardLibrary"
    );

    useEffect(() => {
        setIsSearching(true);
        getConnectors();
    }, []);

    rpcClient?.onProjectContentUpdated((state: boolean) => {
        if (state) {
            getConnectors();
        }
    });

    const getConnectors = (filter?: boolean) => {
        setFetchingInfo(true);
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                position: {
                    startLine: targetLinePosition,
                    endLine: targetLinePosition,
                },
                filePath: fileName,
                queryMap: {
                    limit: 60,
                    filterByCurrentOrg:
                        filter ?? selectedConnectorCategory === "CurrentOrg" ?? false,
                },
                searchKind: "CONNECTOR"
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
    };

    useEffect(() => {
        setIsSearching(true);
        debouncedSearch(searchText);
        return () => debouncedSearch.cancel();
    }, [searchText]);

    const handleSearch = (text: string) => {
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                position: {
                    startLine: targetLinePosition,
                    endLine: targetLinePosition,
                },
                filePath: fileName,
                queryMap: {
                    q: text,
                    limit: 60,
                    filterByCurrentOrg:
                        selectedConnectorCategory === "CurrentOrg" ?
                            true : false,
                },
                searchKind: "CONNECTOR"
            })
            .then(async (model) => {
                console.log(">>> bi searched connectors", model);
                console.log(">>> bi filtered connectors", model.categories);
                setConnectors(model.categories);
            })
            .finally(() => {
                setIsSearching(false);
            });
    };
    const debouncedSearch = debounce(handleSearch, 1100);

    const handleOnSearch = (text: string) => {
        setSearchText(text);
    };

    const handleCategoryChange = (category: string) => {
        if (category !== selectedConnectorCategory) {
            setSelectedConnectorCategory(category);
            getConnectors(category === "CurrentOrg" ? true : false);
        }
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
        category.items = filterItems(category.items);
        return category;
    }).filter((category) => {
        if (selectedConnectorCategory === "LocalConnectors") {
            return category.metadata.label === "Local";
        } else {
            return category.metadata.label !== "Local";
        }
    });

    async function filterCategories(categories: Category[]): Promise<Category[]> {
        const localConnectors = (
            await rpcClient.getBIDiagramRpcClient().getOpenApiGeneratedModules({ projectPath: "" })
        ).modules;
        return categories.map((category) => {
            if (category.metadata.label === "Local") {
                const filteredItems = category.items.filter(
                    (item): item is AvailableNode =>
                        "codedata" in item && localConnectors.includes(item.codedata.module || "")
                );

                return { ...category, items: filteredItems };
            }

            return category;
        });
    }

    const openLearnMoreURL = () => {
        rpcClient.getCommonRpcClient().openExternalUrl({
            url: 'https://ballerina.io/learn/publish-packages-to-ballerina-central/'
        })
    };


    const isFullView = onClose === undefined;
    const isLoading = isSearching || fetchingInfo;

    return (
        <ViewWrapper isHalfView={hideTitle}>
            {isFullView && (
                <>
                    <TopNavigationBar projectPath={projectPath} />
                    <TitleBar title="Connectors" subtitle="Select a connector to integrate with external services" />
                </>
            )}
            <Container>
                {!isFullView && !hideTitle && (
                    <>
                        <TopBar>
                            <Typography variant="h2">Select a Connector</Typography>
                            {onClose && (
                                <Button appearance="icon" onClick={onClose}>
                                    <Codicon name="close" />
                                </Button>
                            )}
                        </TopBar>

                        <BodyText>
                            Select a connector to integrate with external services. Use search to quickly find the right
                            one.
                        </BodyText>
                    </>
                )}
                <Row>
                    <StyledSearchInput
                        value={searchText}
                        placeholder="Search connectors"
                        autoFocus={true}
                        onChange={handleOnSearch}
                        size={60}
                        sx={{ width: "100%", marginBottom: "10px" }}
                    />
                </Row>

                <SplitView sx={{ height: "100%", overflow: "hidden" }} defaultWidths={[20, 80]}>
                    <div style={{ marginTop: "24px", minWidth: "220px" }}>
                        <TreeViewItem
                            key={`StandardLibrary`}
                            id={`StandardLibrary`}
                            sx={{
                                backgroundColor: 'transparent',
                                height: '25px',
                                border: selectedConnectorCategory === "StandardLibrary"
                                    ? '1px solid var(--vscode-focusBorder)'
                                    : 'none'
                            }}
                            selectedId={`StandardLibrary`}
                        >
                            <TreeViewItemContent
                                isLoading={isLoading}
                                onClick={(e) => {
                                    handleCategoryChange("StandardLibrary");
                                }}
                            >
                                <Typography
                                    variant="body3"
                                    sx={{
                                        fontWeight: selectedConnectorCategory === "StandardLibrary"
                                            ? 'bold' : 'normal'
                                    }}
                                >
                                    {'Standard Libraries'}
                                </Typography>
                            </TreeViewItemContent>
                        </TreeViewItem>
                        <TreeViewItem
                            key={`CurrentOrg`}
                            id={`CurrentOrg`}
                            sx={{
                                backgroundColor: 'transparent',
                                height: '25px',
                                border: selectedConnectorCategory === "CurrentOrg"
                                    ? '1px solid var(--vscode-focusBorder)'
                                    : 'none'
                            }}
                            selectedId={`CurrentOrg`}
                        >
                            <TreeViewItemContent
                                isLoading={isLoading}
                                onClick={(e) => {
                                    handleCategoryChange("CurrentOrg");
                                }}
                            >
                                <Typography
                                    variant="body3"
                                    sx={{
                                        fontWeight: selectedConnectorCategory === "CurrentOrg"
                                            ? 'bold' : 'normal'
                                    }}
                                >
                                    {'Organization\'s Connectors'}
                                </Typography>
                            </TreeViewItemContent>
                        </TreeViewItem>
                        <TreeViewItem
                            key={`LocalConnectors`}
                            id={`LocalConnectors`}
                            sx={{
                                backgroundColor: 'transparent',
                                height: '25px',
                                border: selectedConnectorCategory === "LocalConnectors"
                                    ? '1px solid var(--vscode-focusBorder)'
                                    : 'none'
                            }}
                            selectedId={`LocalConnectors`}
                        >
                            <TreeViewItemContent
                                isLoading={isLoading}
                                onClick={(e) => {
                                    handleCategoryChange("LocalConnectors");
                                }}
                            >
                                <Typography
                                    variant="body3"
                                    sx={{
                                        fontWeight: selectedConnectorCategory === "LocalConnectors"
                                            ? 'bold' : 'normal'
                                    }}
                                >
                                    {'Custom Connectors'}
                                </Typography>
                            </TreeViewItemContent>
                        </TreeViewItem>
                    </div>
                    <ListContainer isPopupView={isPopupView}>
                        {selectedConnectorCategory === "CurrentOrg" && (
                            <LabelRow>
                                <Typography variant="h3">{'Organization\'s Connectors'}</Typography>
                            </LabelRow>
                        )}
                        {isLoading && (
                            <ListContainer>
                                <div
                                    style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}
                                >
                                    <ProgressRing />
                                </div>
                            </ListContainer>
                        )}
                        {selectedConnectorCategory === "CurrentOrg" && filteredCategories.length === 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", marginTop: '140px' }}>
                                <BodyTinyInfo style={{ textAlign: "center" }}>
                                    No connectors found in your organization. You can create and publish connectors to Ballerina Central.
                                </BodyTinyInfo>
                                <BodyTinyInfo style={{ textAlign: "center", color: 'var(--vscode-descriptionForeground)' }}>
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
                            </div>
                        )}
                        {/* Default connectors of LS is hardcoded and is sent with categories with item field */}
                        {!isLoading && filteredCategories && filteredCategories.length > 0 && (
                            <div>
                                {filteredCategories[0]?.items ? (
                                    filteredCategories.map((category, index) => {
                                        const isLocalConnectorCategory = category.metadata.label === "Local";
                                        const itemCount = category.items?.length || 0;
                                        const isLocalConnectorsEmpty = isLocalConnectorCategory && itemCount === 0;
                                        const label = category.metadata.label === "Local" ? "Custom Connectors" : category.metadata.label;

                                        if (!isLocalConnectorCategory && (!category.items || category.items.length === 0)) {
                                            return null;
                                        }

                                        return (
                                            <div key={category.metadata.label + index}>
                                                <LabelRow>
                                                    <Typography variant="h3">{label}</Typography>
                                                    {isLocalConnectorCategory && (
                                                        <Button
                                                            data-testid="add-connector-from-openapi"
                                                            appearance="icon"
                                                            tooltip={"Add a Connector from OpenAPI"}
                                                            onClick={onAddGeneratedConnector}
                                                        >
                                                            <Codicon name="add" />
                                                        </Button>
                                                    )}
                                                </LabelRow>
                                                {isLocalConnectorsEmpty ? (
                                                    <>
                                                        <BodyTinyInfo>
                                                            Generate connector using OpenAPI spec
                                                        </BodyTinyInfo>
                                                        <BodyTinyInfo style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
                                                            Can’t find what you need in the standard connectors? Create a custom connector using an OpenAPI specification.
                                                        </BodyTinyInfo>
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: '40px' }}>

                                                            <Button
                                                                data-testid="generate-connector-button"
                                                                sx={{ display: 'flex', justifySelf: 'flex-end' }}
                                                                appearance="primary"
                                                                onClick={onAddGeneratedConnector}
                                                            >
                                                                <Codicon name="add" sx={{ marginRight: 5 }} />
                                                                Generate a connector
                                                            </Button>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <GridContainer isHalfView={hideTitle}>
                                                        {category.items?.map((connector, index) => {
                                                            return (
                                                                <ButtonCard
                                                                    id={`connector-${connector.metadata.label.replace(/[ .]/g, "-").toLowerCase()}`}
                                                                    key={connector.metadata.label + index}
                                                                    title={connector.metadata.label}
                                                                    description={
                                                                        (connector as AvailableNode).codedata.org +
                                                                        " / " +
                                                                        (connector as AvailableNode).codedata.module
                                                                    }
                                                                    truncate={true}
                                                                    icon={
                                                                        connector.metadata.icon ? (
                                                                            <ConnectorIcon
                                                                                url={connector.metadata.icon}
                                                                            />
                                                                        ) : (
                                                                            <Codicon name="package" />
                                                                        )
                                                                    }
                                                                    onClick={() => {
                                                                        onSelectConnector(connector as AvailableNode);
                                                                    }}
                                                                />
                                                            );
                                                        })}
                                                    </GridContainer>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <GridContainer isHalfView={hideTitle}>
                                        {connectors.map((item, index) => {
                                            const connector = item as Item;
                                            return (
                                                <ButtonCard
                                                    id={`connector-${connector.metadata.label.replace(/[ .]/g, "-").toLowerCase()}`}
                                                    key={connector.metadata.label + index}
                                                    title={connector.metadata.label}
                                                    description={
                                                        (connector as AvailableNode).codedata.org +
                                                        " / " +
                                                        (connector as AvailableNode).codedata.module
                                                    }
                                                    icon={
                                                        connector.metadata.icon ? (
                                                            <ConnectorIcon url={connector.metadata.icon} />
                                                        ) : (
                                                            <Codicon name="package" />
                                                        )
                                                    }
                                                    onClick={() => {
                                                        onSelectConnector(connector as AvailableNode);
                                                    }}
                                                />
                                            );
                                        })}
                                    </GridContainer>
                                )}
                            </div>
                        )}
                    </ListContainer>
                </SplitView>
            </Container>
        </ViewWrapper>
    );
}

export default ConnectorView;
