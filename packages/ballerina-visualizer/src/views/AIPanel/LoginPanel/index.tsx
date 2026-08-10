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

import styled from "@emotion/styled";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AIMachineEventType } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Icon, ThemeColors, Typography } from "@wso2/ui-toolkit";
import React from "react";
import { Banner } from "../../../components/Banner";

const PanelWrapper = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow-y: auto;
    padding: 24px 16px;
`;

const TopSpacer = styled.div`
    flex-grow: 1;
    min-height: 24px;
`;

const EndSpacer = styled.div`
    flex-grow: 1;
`;

const HeaderContent = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-bottom: 32px;
`;

const Title = styled.h2`
    display: inline-flex;
    margin-top: 24px;
    margin-bottom: 8px;
    font-size: 18px;
    font-weight: 700;
`;

const BodyContent = styled.div`
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    max-width: 380px;
    align-self: center;
    gap: 0;
`;

const WSO2LoginButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    padding: 14px 20px;
    background-color: ${ThemeColors.PRIMARY};
    color: ${ThemeColors.ON_PRIMARY};
    border: none;
    border-radius: 6px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    &:hover {
        background-color: var(--vscode-button-hoverBackground);
    }
    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;

const RecommendedBadge = styled.div`
    margin-top: 8px;
    padding: 4px 0;
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    text-align: center;
`;

const SectionDivider = styled.div`
    display: flex;
    align-items: center;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    width: 100%;
    margin: 28px 0 16px;
    &::before,
    &::after {
        content: "";
        flex: 1;
        border-bottom: 1px solid var(--vscode-widget-border);
        margin: 0 10px;
    }
`;

const ProviderCard = styled.button`
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 14px 16px;
    background: none;
    border: 1px solid var(--vscode-widget-border);
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    margin-bottom: 8px;
    color: var(--vscode-foreground);
    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
    &:last-child {
        margin-bottom: 0;
    }
`;

const ProviderLogoWrapper = styled.div`
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const ProviderInfo = styled.div`
    flex: 1;
    min-width: 0;
`;

const ProviderName = styled.div`
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const ProviderDesc = styled.div`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
`;

const ChevronIcon = styled.span`
    color: ${ThemeColors.PRIMARY};
    font-size: 16px;
    flex-shrink: 0;
`;

const Footer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-top: 24px;
    width: 100%;
    max-width: 380px;
    align-self: center;
`;

const FooterDisclaimer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.5;
    text-align: center;
`;

const FooterLinks = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
`;

const FooterLink = styled.a`
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
    &:hover {
        text-decoration: underline;
    }
`;

const FooterDivider = styled.span`
    color: var(--vscode-widget-border);
`;

const InstallingContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
`;

const InstallButton = styled.button`
    width: 100%;
    padding: 10px 20px;
    background-color: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    &:hover:not(:disabled) {
        background-color: var(--vscode-button-secondaryHoverBackground);
    }
    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;


const LoginPanel: React.FC = () => {
    const { rpcClient } = useRpcContext();

    const { data: isPlatformAvailable, refetch: refetchPlatformAvailability } = useQuery({
        queryKey: ["platform-availability"],
        queryFn: () => rpcClient.getAiPanelRpcClient().isPlatformExtensionAvailable(),
    });

    const {
        mutate: installExtension,
        isPending: isInstallingExtension,
        error: installExtensionError,
    } = useMutation({
        mutationFn: async () => {
            return rpcClient.getCommonRpcClient().executeCommand({
                commands: ["workbench.extensions.installExtension", "wso2.wso2-integrator"],
            });
        },
        onSettled: () => refetchPlatformAvailability(),
    });

    const handleCopilotLogin = () => {
        rpcClient.sendAIStateEvent(AIMachineEventType.LOGIN);
    };

    const handleAnthropicKeyClick = () => {
        rpcClient.sendAIStateEvent(AIMachineEventType.AUTH_WITH_API_KEY);
    };

    const handleAwsClick = () => {
        rpcClient.sendAIStateEvent(AIMachineEventType.AUTH_WITH_AWS);
    };

    const handleVertexAiClick = () => {
        rpcClient.sendAIStateEvent(AIMachineEventType.AUTH_WITH_VERTEX_AI);
    };

    return (
        <PanelWrapper>
            <TopSpacer />
            <HeaderContent>
                <Icon
                    name="bi-ai-chat"
                    sx={{ width: 54, height: 54 }}
                    iconSx={{ fontSize: "54px", color: "var(--vscode-foreground)", cursor: "default" }}
                />
                <Title>Welcome to WSO2 Integrator Copilot</Title>
                <Typography
                    variant="body1"
                    sx={{
                        color: "var(--vscode-descriptionForeground)",
                        textAlign: "center",
                        maxWidth: 350,
                        fontSize: 14,
                    }}
                >
                    Your AI pair programmer for integration development
                </Typography>
            </HeaderContent>

            <BodyContent>
                {isPlatformAvailable ? (
                    <>
                        <WSO2LoginButton onClick={handleCopilotLogin}>
                            <Icon name="bi-wso2" sx={{ width: 22, height: 22 }} iconSx={{ fontSize: "22px", color: ThemeColors.ON_PRIMARY }} />
                            Login using your WSO2 Cloud account
                        </WSO2LoginButton>
                        <RecommendedBadge>
                            Recommended • Managed authentication • No API keys required
                        </RecommendedBadge>
                    </>
                ) : (
                    <InstallingContainer>
                        <Typography variant="body2" sx={{ textAlign: "center", color: "var(--vscode-descriptionForeground)" }}>
                            Install the WSO2 Integrator extension to sign in and use WSO2 Integrator Copilot.
                        </Typography>
                        <InstallButton
                            disabled={isInstallingExtension}
                            onClick={() => installExtension()}
                        >
                            Install WSO2 Integrator
                        </InstallButton>
                        {installExtensionError && (
                            <Banner
                                variant="error"
                                message={installExtensionError?.message || "Failed to install WSO2 Integrator"}
                            />
                        )}
                    </InstallingContainer>
                )}

                <SectionDivider>Use your own AI provider</SectionDivider>

                <ProviderCard onClick={handleAnthropicKeyClick}>
                    <ProviderLogoWrapper>
                        <Icon name="bi-anthropic" sx={{ width: 24, height: 24 }} iconSx={{ fontSize: "24px" }} />
                    </ProviderLogoWrapper>
                    <ProviderInfo>
                        <ProviderName>Anthropic API Key</ProviderName>
                        <ProviderDesc>Use your Anthropic API key to power Copilot</ProviderDesc>
                    </ProviderInfo>
                    <ChevronIcon>›</ChevronIcon>
                </ProviderCard>

                <ProviderCard onClick={handleAwsClick}>
                    <ProviderLogoWrapper>
                        <Icon name="bi-aws" sx={{ width: 28, height: 28 }} iconSx={{ fontSize: "28px" }} />
                    </ProviderLogoWrapper>
                    <ProviderInfo>
                        <ProviderName>AWS Bedrock</ProviderName>
                        <ProviderDesc>Use your AWS Bedrock account</ProviderDesc>
                    </ProviderInfo>
                    <ChevronIcon>›</ChevronIcon>
                </ProviderCard>

                <ProviderCard onClick={handleVertexAiClick}>
                    <ProviderLogoWrapper>
                        <Icon name="bi-vertex-ai" sx={{ width: 28, height: 28 }} iconSx={{ fontSize: "28px" }} />
                    </ProviderLogoWrapper>
                    <ProviderInfo>
                        <ProviderName>Google Vertex AI</ProviderName>
                        <ProviderDesc>Use your Google Vertex AI account</ProviderDesc>
                    </ProviderInfo>
                    <ChevronIcon>›</ChevronIcon>
                </ProviderCard>
            </BodyContent>

            <Footer>
                <FooterDisclaimer>
                    AI-generated content may contain mistakes. Always review generated changes.
                </FooterDisclaimer>
                <FooterLinks>
                    <FooterLink href="https://wso2.com/licenses/wso2-ai-services-terms-of-use/" target="_blank" rel="noopener noreferrer">
                        Terms of Use
                    </FooterLink>
                    <FooterDivider>|</FooterDivider>
                    <FooterLink href="https://wso2.com/privacy-policy/" target="_blank" rel="noopener noreferrer">
                        Data Handling &amp; Privacy
                    </FooterLink>
                </FooterLinks>
            </Footer>

            <EndSpacer />
        </PanelWrapper>
    );
};

export default LoginPanel;
