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
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Icon, Typography } from "@wso2/ui-toolkit";
import React, { useCallback, useState } from "react";
import { ShaderOrb } from "../../../../../components/AgentStatusOrb/ShaderOrb";
import {
    Gloss,
    IconOverlay,
    ORB_COLORS,
    ORB_ENERGY,
    Sphere,
} from "../../../../../components/AgentStatusOrb/shared";

const WELCOME_ORB_SIZE = 58;

const PanelWrapper = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
`;

const TopSpacer = styled.div`
    flex-grow: 1;
    min-height: 24px;
`;

const BottomSpacer = styled.div`
    flex-grow: 1;
    min-height: 48px;
`;

const Content = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: 100%;
    max-width: 360px;
    align-self: center;
`;

const WelcomeOrbHalo = styled.div`
    position: relative;
    width: 86px;
    height: 86px;
    display: flex;
    align-items: center;
    justify-content: center;

    &::before {
        content: "";
        position: absolute;
        inset: -14px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(107, 92, 232, 0.28), rgba(241, 78, 35, 0.12) 42%, transparent 70%);
        filter: blur(8px);
        pointer-events: none;
    }

    @media (forced-colors: active) {
        &::before {
            display: none;
        }
    }
`;

const WelcomeOrb = styled.div`
    position: relative;
    width: ${WELCOME_ORB_SIZE}px;
    height: ${WELCOME_ORB_SIZE}px;
    flex: none;
`;

const GuideChip = styled.div`
    margin: 42px auto 0;
    padding: 8px 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background-color: var(--vscode-menu-background, var(--vscode-editor-background));
    color: var(--vscode-menu-foreground, var(--vscode-editor-foreground));
    border-radius: 16px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border));
    box-shadow: 0 1px 3px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.05));
    
    &:hover {
        background-color: var(--vscode-menubar-selectionBackground, var(--vscode-list-hoverBackground));
        transform: translateY(-1px);
        box-shadow: 0 2px 4px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.1));
    }
    
    &:active {
        transform: translateY(0);
        box-shadow: 0 1px 2px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.05));
        opacity: 0.9;
    }
`;

interface WelcomeMessageProps {
    isOnboarding?: boolean;
}

const WelcomeMessage: React.FC<WelcomeMessageProps> = ({ isOnboarding = false }) => {
    const { rpcClient } = useRpcContext();
    const [webglFailed, setWebglFailed] = useState(false);
    const handleWebglFailed = useCallback(() => setWebglFailed(true), []);

    return (
        <PanelWrapper>
            <TopSpacer />
            <Content>
                <WelcomeOrbHalo>
                    <WelcomeOrb role="img" aria-label="WSO2 Integrator Copilot">
                        {webglFailed ? (
                            <Sphere colors={ORB_COLORS.idle} energy={ORB_ENERGY.idle} />
                        ) : (
                            <ShaderOrb
                                colors={ORB_COLORS.idle}
                                energy={ORB_ENERGY.idle}
                                size={WELCOME_ORB_SIZE}
                                onContextFailed={handleWebglFailed}
                            />
                        )}
                        <Gloss />
                        <IconOverlay>
                            <Icon
                                name="bi-ai-chat"
                                sx={{ width: 24, height: 24 }}
                                iconSx={{ fontSize: "24px", color: "#ffffff", cursor: "default" }}
                            />
                        </IconOverlay>
                    </WelcomeOrb>
                </WelcomeOrbHalo>
                <Typography
                    variant="h2"
                    sx={{
                        color: "var(--vscode-foreground)",
                        textAlign: "center",
                        margin: "12px 0",
                    }}
                >
                    WSO2 Integrator Copilot
                </Typography>
                <Typography
                    variant="body1"
                    sx={{
                        color: "var(--vscode-descriptionForeground)",
                        textAlign: "center",
                        fontSize: 14,
                        marginTop: "16px",
                    }}
                >
                    I can help you build, update, and understand your integration. Tell me what you’d like to do.
                </Typography>
                <Typography
                    variant="body1"
                    sx={{
                        color: "var(--vscode-descriptionForeground)",
                        textAlign: "center",
                        fontSize: 14,
                        marginTop: "36px",
                    }}
                >
                    Use <b>/</b> for commands
                </Typography>
                <Typography
                    variant="body1"
                    sx={{
                        color: "var(--vscode-descriptionForeground)",
                        textAlign: "center",
                        fontSize: 14,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        marginTop: "12px",
                    }}
                >
                    <Icon name="Paperclip" sx={{ fontSize: "16px", verticalAlign: "-3px", marginRight: "-4px" }} />
                    Add files and context
                </Typography>
                {isOnboarding && (
                    <GuideChip
                        onClick={() =>
                            rpcClient.getCommonRpcClient().openExternalUrl({
                                url: "https://youtu.be/5klLsz1alPE",
                            })
                        }
                    >
                        <Icon isCodicon name="play" iconSx={{ fontSize: "16px", color: "inherit" }} />
                        Watch Getting Started Guide
                    </GuideChip>
                )}
            </Content>
            <BottomSpacer />
        </PanelWrapper>
    );
};

export default WelcomeMessage;
