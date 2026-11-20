/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { FIELD_RADIUS } from "../../MultiModeExpressionEditor/ChipExpressionEditor/constants";
import React from "react";
import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { ProgressRing, ThemeColors } from "@wso2/ui-toolkit";

const gradientAnimation = keyframes`
    0% {
        background-position: 0% 50%;
    }
    50% {
        background-position: 100% 50%;
    }
    100% {
        background-position: 0% 50%;
    }
`;

const glowAnimation = keyframes`
    0%, 100% {
        box-shadow:
            0 0 4px color-mix(in srgb, var(--vscode-button-background) 15%, transparent),
            0 0 8px color-mix(in srgb, var(--vscode-button-background) 8%, transparent),
            0 0 12px color-mix(in srgb, var(--vscode-button-background) 4%, transparent);
    }
    50% {
        box-shadow:
            0 0 6px color-mix(in srgb, var(--vscode-button-background) 25%, transparent),
            0 0 12px color-mix(in srgb, var(--vscode-button-background) 12%, transparent),
            0 0 14px color-mix(in srgb, var(--vscode-button-background) 6%, transparent);
    }
`;

const dotCycle = keyframes`
    0% { content: ''; }
    25% { content: '.'; }
    50% { content: '..'; }
    75% { content: '...'; }
    100% { content: ''; }
`;

const OverlayContainer = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 0 0 ${FIELD_RADIUS} ${FIELD_RADIUS};
    padding: 3px; 
    
    /* Good UX: Indicates background work is happening */
    cursor: progress;

    background: linear-gradient(
        120deg,
        color-mix(in srgb, var(--vscode-button-background) 10%, transparent) 0%,
        color-mix(in srgb, var(--vscode-button-background) 40%, transparent) 25%,
        color-mix(in srgb, var(--vscode-button-background) 90%, transparent) 50%,
        color-mix(in srgb, var(--vscode-button-background) 40%, transparent) 75%,
        color-mix(in srgb, var(--vscode-button-background) 10%, transparent) 100%
    );
    background-size: 300% 300%;
    animation:
        ${gradientAnimation} 3s ease infinite,
        ${glowAnimation} 3s ease infinite;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 1900;
    gap: 16px;
    transition: opacity 0.3s ease;

    &::before {
        content: '';
        position: absolute;
        inset: 2px;
        border-radius: 0 0 calc(${FIELD_RADIUS} - 2px) calc(${FIELD_RADIUS} - 2px);
        background-color: color-mix(in srgb, var(--vscode-editor-background) 85%, transparent);
        backdrop-filter: blur(2px);
        z-index: 0;
    }
`;

const ContentWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    position: relative;
    z-index: 1;
`;

const LoadingText = styled.div`
    min-width: 140px;

    &::after {
        content: '';
        animation: ${dotCycle} 2s linear infinite;
        display: inline-block;
        width: 12px;
        text-align: left;
    }
`;

interface EnhancingOverlayProps {
    label?: string;
}

export const EnhancingOverlay: React.FC<EnhancingOverlayProps> = ({ label = "Enhancing Prompt" }) => {
    return (
        <OverlayContainer role="status" aria-label={label}>
            <ContentWrapper>
                <ProgressRing
                    sx={{ width: "16px", height: "16px" }}
                    color={ThemeColors.ON_SURFACE}
                />
                <LoadingText>
                    {label}
                </LoadingText>
            </ContentWrapper>
        </OverlayContainer>
    );
};
