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

import React, { useState } from "react";
import { MACHINE_VIEW, EVENT_TYPE, DownloadProgress } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import styled from "@emotion/styled";
import { Button, Codicon, Icon, ThemeColors } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";

const Wrapper = styled.div`
    max-width: 1000px;
    margin: 0 auto;
    padding: 32px 20px;
    height: calc(100vh - 40px);
    overflow-y: auto;
    font-family: var(--vscode-font-family);
`;

const HeaderSection = styled.div`
    margin-bottom: 32px;
    padding: 20px 0;
`;

const Headline = styled.h1`
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: var(--vscode-foreground);
    line-height: 1.3;
`;

const Caption = styled.p`
    font-size: 14px;
    line-height: 1.4;
    font-weight: 400;
    color: var(--vscode-descriptionForeground);
    margin: 0;
    max-width: 700px;
`;

const GetStartedSection = styled.div`
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    padding: 16px 20px;
    margin-bottom: 24px;
`;

const GetStartedTitle = styled.h2`
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: var(--vscode-foreground);
`;

const GetStartedText = styled.p`
    font-size: 13px;
    margin: 0;
    color: var(--vscode-descriptionForeground);
    line-height: 1.4;
`;

const MainActionsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 32px;

    @media (max-width: 900px) {
        grid-template-columns: 1fr;
        gap: 12px;
    }
`;

interface ActionCardProps {
    isPrimary?: boolean;
    disabled?: boolean;
}

const ActionCard = styled.div<ActionCardProps>`
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    transition: border-color 0.2s ease;
    cursor: ${(props: ActionCardProps) => (props.disabled ? "not-allowed" : "pointer")};
    opacity: ${(props: ActionCardProps) => (props.disabled ? 0.6 : 1)};
    min-height: 180px;

    &:hover {
        ${(props: ActionCardProps) =>
        !props.disabled &&
        `
            border-color: ${ThemeColors.PRIMARY};
            box-shadow: 0 0 0 2px ${ThemeColors.PRIMARY_CONTAINER};
        `}
    }
`;

interface CardIconProps {
    isPrimary?: boolean;
}

const CardIconContainer = styled.div`
    display: flex;
    justify-content: flex-start;
    margin-bottom: 12px;
`;

const CardIcon = styled.div<CardIconProps>`
    width: 32px;
    height: 32px;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${ThemeColors.ON_SURFACE};
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    flex-shrink: 0;
    & > div {
        margin-left: -4px;
    }
`;

const CardContent = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    text-align: left;
`;

const CardTitle = styled.h3`
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: var(--vscode-foreground);
    line-height: 1.3;
`;

const CardDescription = styled.p`
    font-size: 13px;
    line-height: 1.4;
    margin: 0 0 16px 0;
    color: var(--vscode-descriptionForeground);
    flex: 1;
`;

const StyledButton = styled(Button)`
    height: 36px;
    font-size: 13px;
    font-weight: 400;
    border-radius: 2px;
    align-self: flex-start;
`;

const ButtonContent = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
`;

const UpdateNotice = styled.div`
    background: var(--vscode-inputValidation-warningBackground);
    border: 1px solid var(--vscode-inputValidation-warningBorder);
    border-radius: 3px;
    padding: 16px;
    margin-bottom: 20px;
`;

const UpdateTitle = styled.h4`
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: var(--vscode-inputValidation-warningForeground);
`;

const UpdateDescription = styled.p`
    font-size: 13px;
    margin: 0 0 12px 0;
    color: var(--vscode-foreground);
    line-height: 1.4;
`;

const ProgressBarWrapper = styled.div`
    display: flex;
    align-items: center;
    margin-top: 8px;
`;

const ProgressBarContainer = styled.div`
    width: 100%;
    height: 3px;
    background-color: var(--vscode-progressBar-background);
    border-radius: 1px;
    overflow: hidden;
    position: relative;
    opacity: 0.3;
`;

interface ProgressIndicatorProps {
    percentage: number;
}

const ProgressIndicator = styled.div<ProgressIndicatorProps>`
    position: absolute;
    width: ${(props: ProgressIndicatorProps) => `${props.percentage}%`};
    height: 100%;
    background-color: var(--vscode-progressBar-background);
    border-radius: 1px;
    transition: width 0.3s ease;
    opacity: 1;
`;

type WelcomeViewProps = {
    isBISupported: boolean;
};

export function WelcomeView(props: WelcomeViewProps) {
    const { rpcClient } = useRpcContext();
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState<DownloadProgress>(null);

    const goToCreateProject = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIProjectForm,
            },
        });
    };

    const openGettingStartedGuide = () => {
        rpcClient.getCommonRpcClient().openExternalUrl({
            url: "https://bi.docs.wso2.com/get-started/quick-start-guide/",
        });
    };

    const openSamples = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BISamplesView,
            },
        });
    };

    const importExternalIntegration = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIImportIntegration,
            },
        });
    };

    const updateBallerina = () => {
        setIsLoading(true);
        rpcClient.getCommonRpcClient().executeCommand({ commands: ["ballerina.update-ballerina-visually"] });
    };

    rpcClient?.onDownloadProgress((response: DownloadProgress) => {
        setIsLoading(true);
        setProgress(response);
    });

    return (
        <Wrapper>
            {/* Header Section */}
            <HeaderSection>
                <Headline>Choreo Integrator: BI for VS Code</Headline>
                <Caption>
                    A comprehensive integration solution that simplifies your digital transformation journey.
                    Streamlines connectivity among applications, services, data, and cloud using a user-friendly
                    low-code graphical designing experience.
                </Caption>
            </HeaderSection>

            {/* Get Started Section */}
            <GetStartedSection>
                <GetStartedTitle>Get Started Quickly</GetStartedTitle>
                <GetStartedText>
                    New to Choreo Integrator: BI? Start here! Explore step-by-step tutorials to help you get up and running
                    with ease. <VSCodeLink onClick={openGettingStartedGuide}>Read the guide</VSCodeLink>.
                </GetStartedText>
            </GetStartedSection>

            {/* Update Notice for Unsupported Version */}
            {!props.isBISupported && (
                <UpdateNotice>
                    <UpdateTitle>Update Required</UpdateTitle>
                    <UpdateDescription>
                        Your current Ballerina distribution is not supported. Please update to version 2201.12.3 or
                        above to access all features.
                    </UpdateDescription>
                    <StyledButton appearance="primary" onClick={updateBallerina} disabled={isLoading}>
                        <ButtonContent>
                            {isLoading ? (
                                <>
                                    <Codicon name="sync" iconSx={{ fontSize: 16 }} />
                                    {progress ? `${progress.percentage || 0}%` : "Updating..."}
                                </>
                            ) : (
                                <>
                                    <Icon name="bi-update" iconSx={{ fontSize: 16 }} />
                                    Update Now
                                </>
                            )}
                        </ButtonContent>
                    </StyledButton>
                    {isLoading && progress && (
                        <div style={{ marginTop: 10 }}>
                            <ProgressBarWrapper>
                                <ProgressBarContainer>
                                    <ProgressIndicator percentage={progress.percentage} />
                                </ProgressBarContainer>
                            </ProgressBarWrapper>
                            <UpdateDescription style={{ marginTop: 8, fontSize: "0.85em" }}>
                                {progress.message}
                            </UpdateDescription>
                        </div>
                    )}
                    {isLoading && (
                        <UpdateDescription style={{ marginTop: 12, fontSize: "0.85em", fontStyle: "italic" }}>
                            Please restart VS Code after updating the Ballerina distribution
                        </UpdateDescription>
                    )}
                </UpdateNotice>
            )}

            {/* Main Action Cards */}
            <MainActionsGrid>
                {/* Create New Integration Card */}
                <ActionCard
                    disabled={!props.isBISupported}
                    onClick={props.isBISupported ? goToCreateProject : undefined}
                >
                    <CardIconContainer>
                        <CardIcon isPrimary={true}>
                            <Icon name="bi-plus-fill" iconSx={{ fontSize: 18 }} />
                        </CardIcon>
                    </CardIconContainer>
                    <CardContent>
                        <CardTitle>Create New Integration</CardTitle>
                        <CardDescription>
                            Ready to build? Start a new integration using our intuitive graphical designer.
                        </CardDescription>
                        <StyledButton
                            appearance="primary"
                            disabled={!props.isBISupported}
                            onClick={(e) => {
                                e.stopPropagation();
                                goToCreateProject();
                            }}
                        >
                            <ButtonContent>
                                <Icon name="bi-plus" iconSx={{ fontSize: 14 }} sx={{ display: "flex", justifyContent: "center" }} />
                                Create New Integration
                            </ButtonContent>
                        </StyledButton>
                    </CardContent>
                </ActionCard>

                {/* Import External Integration Card */}
                <ActionCard
                    disabled={!props.isBISupported}
                    onClick={props.isBISupported ? importExternalIntegration : undefined}
                >
                    <CardIconContainer>
                        <CardIcon>
                            <Icon name="bi-convert" iconSx={{ fontSize: 18 }} />
                        </CardIcon>
                    </CardIconContainer>
                    <CardContent>
                        <CardTitle>Import External Integration</CardTitle>
                        <CardDescription>
                            Have an integration from another platform? Import your MuleSoft or TIBCO integration
                            and continue building.
                        </CardDescription>
                        <StyledButton
                            appearance="secondary"
                            disabled={!props.isBISupported}
                            onClick={(e) => {
                                e.stopPropagation();
                                importExternalIntegration();
                            }}
                        >
                            <ButtonContent>
                                <Icon name="bi-convert" iconSx={{ fontSize: 14 }} />
                                Import External Integration
                            </ButtonContent>
                        </StyledButton>
                    </CardContent>
                </ActionCard>

                {/* Explore Samples Card */}
                <ActionCard onClick={openSamples}>
                    <CardIconContainer>
                        <CardIcon>
                            <Icon name="bi-bookmark" iconSx={{ fontSize: 18 }} />
                        </CardIcon>
                    </CardIconContainer>
                    <CardContent>
                        <CardTitle>Explore Pre-Built Samples</CardTitle>
                        <CardDescription>
                            Need inspiration? Browse through sample integrations to see how Choreo Integrator: BI handles
                            real-world integrations.
                        </CardDescription>
                        <StyledButton
                            appearance="secondary"
                            onClick={(e) => {
                                e.stopPropagation();
                                openSamples();
                            }}
                        >
                            <ButtonContent>
                                <Icon name="bi-bookmark" iconSx={{ fontSize: 14 }} />
                                Explore Samples
                            </ButtonContent>
                        </StyledButton>
                    </CardContent>
                </ActionCard>
            </MainActionsGrid>
        </Wrapper>
    );
}
