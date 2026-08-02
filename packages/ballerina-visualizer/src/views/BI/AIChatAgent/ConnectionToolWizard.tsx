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

import { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Category as PanelCategory, Node as PanelNode } from "@wso2/ballerina-side-panel";
import { AvailableNode, BISearchRequest, Item, LinePosition } from "@wso2/ballerina-core";
import { Button, ThemeColors } from "@wso2/ui-toolkit";

import { convertBICategoriesToSidePanelCategories } from "../../../utils/bi";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { fetchConnectorActions, normalizeConnectorSearchCategories } from "./connectorActions";
import { ConnectorActionList } from "./ConnectorActionList";
import { ConnectorList } from "./ConnectorList";
import { NEW_CONNECTION } from "../../../constants";

export enum WizardStep {
    CONNECTOR_LIST = "CONNECTOR_LIST",
    ACTION_LIST = "ACTION_LIST",
}

export interface ActionSelection {
    action: AvailableNode;
    connector?: AvailableNode;
    connectionName?: string;
}

interface ConnectionToolWizardProps {
    agentFilePath: string;
    target: LinePosition;
    existingConnectionCategories: PanelCategory[];
    onSelect: (selection: ActionSelection) => void;
    onStepChange?: (step: WizardStep, goBack?: () => void) => void;
}

const ErrorNotice = styled.div`
    margin: 12px 0;
    padding: 10px 12px;
    border: 1px solid ${ThemeColors.ERROR};
    border-radius: 4px;
    font-size: 13px;
    color: var(--vscode-foreground);
`;

const LoaderWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(100vh - 56px);
`;

export function ConnectionToolWizard(props: ConnectionToolWizardProps) {
    const { agentFilePath, target, existingConnectionCategories, onSelect, onStepChange } = props;
    const { rpcClient } = useRpcContext();

    const [step, setStep] = useState<WizardStep>(WizardStep.CONNECTOR_LIST);
    const [catalogCategories, setCatalogCategories] = useState<PanelCategory[]>([]);
    const [centralCategories, setCentralCategories] = useState<PanelCategory[]>([]);
    // Initial load only.
    const [loadingConnectors, setLoadingConnectors] = useState<boolean>(true);
    const [searchText, setSearchText] = useState<string>("");

    const [selectedConnector, setSelectedConnector] = useState<AvailableNode>();
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [actions, setActions] = useState<AvailableNode[]>([]);
    const [loadingActions, setLoadingActions] = useState<boolean>(false);
    const [actionError, setActionError] = useState<string>("");
    const latestConnectorRequest = useRef(0);
    const lastConnectorQuery = useRef<string | undefined>(undefined);
    const searchDebounce = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        void loadConnectors("");
    }, []);

    const goToConnectorList = () => {
        setStep(WizardStep.CONNECTOR_LIST);
        setSelectedConnector(undefined);
        setSelectedCategory("");
        setActions([]);
        setActionError("");
    };

    useEffect(() => {
        if (step === WizardStep.ACTION_LIST) {
            onStepChange?.(step, goToConnectorList);
        } else {
            onStepChange?.(step);
        }
    }, [step]);

    const loadConnectors = async (query: string) => {
        const requestId = ++latestConnectorRequest.current;
        lastConnectorQuery.current = query;
        try {
            const request: BISearchRequest = {
                position: { startLine: target, endLine: target },
                filePath: agentFilePath,
                queryMap: query.trim()
                    ? { q: query.trim(), limit: 60, offset: 0, connectorSet: "AGENT_TOOL" }
                    : { limit: 60, connectorSet: "AGENT_TOOL" },
                searchKind: "CONNECTOR",
            };
            const response = await rpcClient.getBIDiagramRpcClient().search(request);
            if (requestId !== latestConnectorRequest.current) {
                return;
            }
            const categories = normalizeConnectorSearchCategories(response?.categories as Item[]);
            const panelCategories = convertBICategoriesToSidePanelCategories(categories);
            if (query.trim()) {
                setCentralCategories(panelCategories);
            } else {
                setCatalogCategories(panelCategories);
                setCentralCategories([]);
            }
        } catch (error) {
            console.error(">>> Error searching connectors", error);
            if (requestId === latestConnectorRequest.current) {
                setCentralCategories([]);
            }
        } finally {
            if (requestId === latestConnectorRequest.current) {
                setLoadingConnectors(false);
            }
        }
    };

    const visibleConnectionCategories = useMemo(
        () => existingConnectionCategories.filter((category) => category.items?.length > 0),
        [existingConnectionCategories]
    );

    const handleSearchTextChange = (text: string) => {
        setSearchText(text);
        if (searchDebounce.current) {
            clearTimeout(searchDebounce.current);
        }
        if (!text.trim()) {
            setCentralCategories([]);
            lastConnectorQuery.current = "";
            return;
        }
        searchDebounce.current = setTimeout(() => {
            if (text !== lastConnectorQuery.current) {
                void loadConnectors(text);
            }
        }, 300);
    };

    useEffect(() => () => {
        if (searchDebounce.current) {
            clearTimeout(searchDebounce.current);
        }
    }, []);

    const handleSelectConnection = (connectionName: string, connectionActions: PanelNode[]) => {
        const actionNodes = connectionActions
            .map((item) => item.metadata as AvailableNode)
            .filter(Boolean);
        const first = actionNodes.at(0);
        setSelectedConnector({
            metadata: {
                label: connectionName,
                description: first?.metadata?.description ?? "",
                icon: first?.metadata?.icon,
            },
            codedata: first?.codedata,
            enabled: true,
        } as AvailableNode);
        setSelectedCategory("Connections");
        setActionError("");
        setActions(actionNodes);
        setStep(WizardStep.ACTION_LIST);
    };

    const handleSelectConnector = async (connector: AvailableNode, category?: string) => {
        setSelectedConnector(connector);
        setSelectedCategory(category ?? "");
        setActions([]);
        setActionError("");
        setStep(WizardStep.ACTION_LIST);
        setLoadingActions(true);
        try {
            const fetched = await fetchConnectorActions(rpcClient, connector);
            if (fetched.length === 0) {
                setActionError(
                    `No actions were found for ${connector.metadata?.label ?? "this connector"}. ` +
                    `You can still add it as a connection and create the tool from an action later.`
                );
            }
            setActions(fetched);
        } catch (error) {
            console.error(">>> Error fetching connector actions", error);
            setActionError(
                `Could not load the actions for ${connector.metadata?.label ?? "this connector"}. ` +
                `Check your internet connection and try again.`
            );
        } finally {
            setLoadingActions(false);
        }
    };

    // Connector list only; the action list has its own renderer.
    const handleListSelect = (nodeId: string, metadata?: any) => {
        const node = (metadata as { node: AvailableNode })?.node;
        if (!node) {
            return;
        }
        if (nodeId === NEW_CONNECTION) {
            void handleSelectConnector(node, (metadata as { category?: string })?.category);
            return;
        }
        // Already bound to its connection, so no connection step is needed.
        const connectionName = node.codedata?.parentSymbol;
        if (connectionName) {
            onSelect({ action: node, connectionName });
        }
    };

    return (
        <>
            {step === WizardStep.CONNECTOR_LIST && (
                <>
                    {loadingConnectors ? (
                        <LoaderWrapper>
                            <RelativeLoader />
                        </LoaderWrapper>
                    ) : (
                        <ConnectorList
                            connectionCategories={visibleConnectionCategories}
                            connectorCategories={catalogCategories}
                            extraCategories={centralCategories}
                            searchText={searchText}
                            onSearchTextChange={handleSearchTextChange}
                            onSelect={handleListSelect}
                            onSelectConnection={handleSelectConnection}
                            description="Pick an existing connection or a connector to browse its actions."
                        />
                    )}
                </>
            )}

            {step === WizardStep.ACTION_LIST && (
                <>
                    {loadingActions ? (
                        <LoaderWrapper>
                            <RelativeLoader message="Loading actions..." />
                        </LoaderWrapper>
                    ) : actionError ? (
                        <div style={{ padding: "0 16px" }}>
                            <ErrorNotice>{actionError}</ErrorNotice>
                            <Button appearance="secondary" onClick={goToConnectorList}>
                                Back to connectors
                            </Button>
                        </div>
                    ) : (
                        <ConnectorActionList
                            connector={selectedConnector}
                            actions={actions}
                            category={selectedCategory}
                            onSelect={(action) => onSelect({ action, connector: selectedConnector })}
                        />
                    )}
                </>
            )}

        </>
    );
}
