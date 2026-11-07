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

import { useQuery } from "@tanstack/react-query";
import { VSCodePanelTab, VSCodePanelView, VSCodePanels } from "@vscode/webview-ui-toolkit/react";
import type { ConnectionListItem, MarketplaceItem } from "@wso2/wso2-platform-core";
import { useEffect, type FC, type ReactNode } from "react";
import styled from "@emotion/styled";
import { Badge, ProgressRing, Icon } from "@wso2/ui-toolkit";
import ReactMarkdown from "react-markdown";
import SwaggerUIReact from "swagger-ui-react";
import "@wso2/ui-toolkit/src/styles/swagger/styles.css";
import type SwaggerUIProps from "swagger-ui-react/swagger-ui-react";
import { Banner } from "../../../../components/Banner";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import {
    ConnectorDetailCard,
    ConnectorOptionButtons,
    ConnectorOptionContent,
    ConnectorOptionDescription,
    ConnectorOptionIcon,
    ConnectorOptionTitle,
    ConnectorTypeLabel,
} from "../AddConnectionPopup/styles";
import {
    ActionButton,
    ConnectorContentContainer,
    ConnectorInfoContainer,
    ConnectorProgressContainer,
    FooterContainer,
} from "../styles";
import { DevantConnectionFlow } from "./utils";

const StyledSummary = styled.p`
    margin-top: 1rem;
    font-size: 0.75rem;
`;

const StyledTagsContainer = styled.div`
    margin-top: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    opacity: 0.8;
`;

const StyledPanelsContainer = styled.div`
    margin-top: 1.25rem;
`;

const StyledApiDefinitionContainer = styled.div`
    width: 100%;
`;

const StyledNoPreviewContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2.5rem 1rem;
    text-align: center;
`;

const StyledNoPreviewTitle = styled.h4`
    font-weight: 600;
    font-size: 1.125rem;
    opacity: 0.7;
`;

const StyledNoPreviewText = styled.p`
    opacity: 0.5;
`;

export const SwaggerUI: FC<SwaggerUIProps> = (props) => {
    return <SwaggerUIReact {...props} />;
};

type Props = {
    item?: MarketplaceItem;
    onFlowChange: (flow: DevantConnectionFlow | null) => void;
    onNextClick: () => void;
    loading: boolean;
    importedConnection?: ConnectionListItem;
    saveButtonText?: string;
};

const disableAuthorizeAndInfoPlugin = () => ({
    wrapComponents: { info: () => (): any => null, authorizeBtn: () => (): any => null },
});

const disableTryItOutPlugin = () => ({
    statePlugins: {
        spec: {
            wrapSelectors: {
                servers: () => (): any[] => [],
                securityDefinitions: () => (): any => null,
                schemes: () => (): any[] => [],
                allowTryItOutFor: () => () => false,
            },
        },
    },
});

export const DevantConnectorMarketplaceInfo: FC<Props> = ({
    item,
    onNextClick,
    onFlowChange,
    loading,
    importedConnection,
    saveButtonText = "Continue",
}) => {
    const { platformRpcClient, platformExtState } = usePlatformExtContext();

    const {
        data: serviceIdl,
        error: serviceIdlError,
        isLoading: isLoadingIdl,
    } = useQuery({
        queryKey: [
            "marketplace_idl",
            {
                orgId: platformExtState?.session?.org.handle,
                resourceId: item?.resourceId,
                serviceId: item?.serviceId,
                type: item?.serviceType,
            },
        ],
        queryFn: () =>
            platformRpcClient?.getMarketplaceIdl({
                serviceId: item?.isThirdParty ? item.resourceId : item?.serviceId,
                orgId: platformExtState?.session?.org.handle,
            }),
        enabled: !!item,
    });

    useEffect(() => {
        if (serviceIdlError || (serviceIdl && (serviceIdl?.idlType !== "OpenAPI" || !serviceIdl?.content))) {
            let newFlow: DevantConnectionFlow;
            if (importedConnection) {
                if (item.isThirdParty) {
                    if (serviceIdl?.idlType === "TCP") {
                        newFlow = DevantConnectionFlow.IMPORT_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR;
                    } else {
                        newFlow = DevantConnectionFlow.IMPORT_THIRD_PARTY_OTHER;
                    }
                } else {
                    newFlow = DevantConnectionFlow.IMPORT_INTERNAL_OTHER;
                }
            } else {
                if (item.isThirdParty) {
                    if (serviceIdl?.idlType === "TCP") {
                        newFlow = DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR;
                    } else {
                        newFlow = DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER;
                    }
                } else {
                    newFlow = DevantConnectionFlow.CREATE_INTERNAL_OTHER;
                }
            }
            onFlowChange(newFlow);
        }
    }, [serviceIdl, serviceIdlError]);

    const panelTabs: { key: string; title: string; view: ReactNode }[] = [
        {
            key: "api-definition",
            title: "API Definition",
            view: (
                <StyledApiDefinitionContainer>
                    {serviceIdl?.content ? (
                        <>
                            {serviceIdl?.idlType === "OpenAPI" ? (
                                <SwaggerUI
                                    spec={getYamlString(serviceIdl?.content)}
                                    defaultModelExpandDepth={-1}
                                    docExpansion="list"
                                    tryItOutEnabled={false}
                                    plugins={[disableAuthorizeAndInfoPlugin, disableTryItOutPlugin]}
                                />
                            ) : (
                                <StyledNoPreviewContainer>
                                    <StyledNoPreviewTitle>No preview available</StyledNoPreviewTitle>
                                    <StyledNoPreviewText>
                                        The IDL for this service is not available for preview. Please download the IDL
                                        to view it.
                                    </StyledNoPreviewText>
                                </StyledNoPreviewContainer>
                            )}
                        </>
                    ) : (
                        <>
                            {isLoadingIdl && (
                                <ConnectorProgressContainer>
                                    <ProgressRing />
                                </ConnectorProgressContainer>
                            )}
                            {serviceIdlError && (
                                <Banner message="Failed to load API definition" variant="error"></Banner>
                            )}
                        </>
                    )}
                </StyledApiDefinitionContainer>
            ),
        },
    ];

    if (item?.description?.trim()) {
        panelTabs.unshift({
            key: "overview",
            title: "Overview",
            view: <ReactMarkdown>{item?.description?.trim()}</ReactMarkdown>,
        });
    }

    return (
        <ConnectorInfoContainer>
            <ConnectorContentContainer hasFooterButton>
                <ConnectorDetailCardItem item={item!} />
                {item?.summary?.trim() && <StyledSummary>{item?.summary?.trim()}</StyledSummary>}
                {(item?.tags?.length ?? 0) > 0 && (
                    <StyledTagsContainer>
                        {item?.tags?.map((tagItem) => (
                            <Badge key={tagItem}>{tagItem}</Badge>
                        ))}
                    </StyledTagsContainer>
                )}
                <StyledPanelsContainer>
                    <VSCodePanels>
                        {panelTabs.map((item) => (
                            <VSCodePanelTab id={`tab-${item?.key}`} key={`tab-${item?.key}`}>
                                {item?.title}
                            </VSCodePanelTab>
                        ))}
                        {panelTabs.map((item) => (
                            <VSCodePanelView id={`view-${item?.key}`} key={`view-${item?.key}`}>
                                {item?.view}
                            </VSCodePanelView>
                        ))}
                    </VSCodePanels>
                </StyledPanelsContainer>
            </ConnectorContentContainer>
            <FooterContainer>
                <ActionButton
                    appearance="primary"
                    onClick={onNextClick}
                    disabled={loading || isLoadingIdl}
                    buttonSx={{ width: "100%", height: "35px" }}
                >
                    {loading ? "Loading..." : saveButtonText}
                </ActionButton>
            </FooterContainer>
        </ConnectorInfoContainer>
    );
};

export const ConnectorDetailCardItem = ({ item }: { item: MarketplaceItem }) => {
    return (
        <ConnectorDetailCard>
            <ConnectorOptionIcon>
                <Icon name="APIResource" sx={{ fontSize: 24, width: 24, height: 24 }} />
            </ConnectorOptionIcon>
            <ConnectorOptionContent>
                <ConnectorOptionTitle>{item?.name}</ConnectorOptionTitle>
                <ConnectorOptionDescription>{item?.description}</ConnectorOptionDescription>
                <ConnectorOptionButtons>
                    {item?.serviceType && <ConnectorTypeLabel>{item?.serviceType}</ConnectorTypeLabel>}
                    {item?.version && <ConnectorTypeLabel>{item?.version}</ConnectorTypeLabel>}
                    {item?.status && <ConnectorTypeLabel>{item?.status}</ConnectorTypeLabel>}
                </ConnectorOptionButtons>
            </ConnectorOptionContent>
        </ConnectorDetailCard>
    );
};

const getYamlString = (yamlString: string) => {
    try {
        if (/%[0-9A-Fa-f]{2}/.test(yamlString)) {
            const decoded = decodeURIComponent(yamlString);
            // Basic heuristic to ensure decoding produced YAML-like content
            if (
                decoded !== yamlString &&
                (decoded.includes("\n") || decoded.includes(":") || /openapi/i.test(decoded))
            ) {
                return decoded;
            }
        }
        return yamlString;
    } catch {
        return yamlString;
    }
};
