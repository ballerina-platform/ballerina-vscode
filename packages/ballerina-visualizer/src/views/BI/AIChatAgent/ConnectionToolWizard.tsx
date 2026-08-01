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

import { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Category as PanelCategory, NodeList } from "@wso2/ballerina-side-panel";
import { AvailableNode, BISearchRequest, Category, LinePosition } from "@wso2/ballerina-core";
import { Button, ThemeColors } from "@wso2/ui-toolkit";

import { convertBICategoriesToSidePanelCategories } from "../../../utils/bi";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { fetchConnectorActions } from "./connectorActions";
import { ConnectorActionList } from "./ConnectorActionList";
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
    const [connectorCategories, setConnectorCategories] = useState<PanelCategory[]>([]);
    const [loadingConnectors, setLoadingConnectors] = useState<boolean>(true);
    const [searchText, setSearchText] = useState<string>("");

    const [selectedConnector, setSelectedConnector] = useState<AvailableNode>();
    const [selectedCategory, setSelectedCategory] = useState<string>("");
    const [actions, setActions] = useState<AvailableNode[]>([]);
    const [loadingActions, setLoadingActions] = useState<boolean>(false);
    const [actionError, setActionError] = useState<string>("");

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
        setLoadingConnectors(true);
        try {
            const request: BISearchRequest = {
                position: { startLine: target, endLine: target },
                filePath: agentFilePath,
                queryMap: query.trim() ? { q: query.trim(), limit: 30, offset: 0 } : { limit: 60 },
                searchKind: "CONNECTOR",
            };
            const response = await rpcClient.getBIDiagramRpcClient().search(request);
            const categories = (response?.categories ?? []) as Category[];
            // "Local" is empty in most projects.
            const withItems = categories.filter((category) => (category.items ?? []).length > 0);
            setConnectorCategories(convertBICategoriesToSidePanelCategories(withItems));
        } catch (error) {
            console.error(">>> Error searching connectors", error);
            setConnectorCategories([]);
        } finally {
            setLoadingConnectors(false);
        }
    };

    // Filtered here because onSearchTextChange disables NodeList's own filtering.
    const visibleConnectionCategories = useMemo(() => {
        const query = searchText.trim().toLowerCase();
        // "Connections" shows when empty, which would be a bare, unactionable header.
        const nonEmpty = existingConnectionCategories.filter((category) => category.items?.length > 0);
        if (!query) {
            return nonEmpty;
        }
        return nonEmpty
            .map((category) => ({
                ...category,
                items: category.items.filter((item) =>
                    "title" in item
                        ? item.title.toLowerCase().includes(query)
                        : (item.label ?? "").toLowerCase().includes(query)
                ),
            }))
            .filter((category) => category.items.length > 0);
    }, [existingConnectionCategories, searchText]);

    const connectorListCategories = useMemo(
        () => [...visibleConnectionCategories, ...connectorCategories],
        [visibleConnectionCategories, connectorCategories]
    );

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
                    {loadingConnectors && connectorListCategories.length === 0 ? (
                        <LoaderWrapper>
                            <RelativeLoader />
                        </LoaderWrapper>
                    ) : (
                        <NodeList
                            categories={connectorListCategories}
                            onSelect={handleListSelect}
                            onSearchTextChange={(text) => {
                                setSearchText(text);
                                void loadConnectors(text);
                            }}
                            title={"Connections"}
                            description={
                                "Pick an existing connection or a connector to browse its actions. "
                            }
                            searchPlaceholder={"Search connections and connectors"}
                            panelBodySx={{ height: "calc(100vh - 140px)" }}
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
