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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { Button, Icon, ThemeColors } from "@wso2/ui-toolkit";
import { FIELD_RADIUS } from "../../MultiModeExpressionEditor/ChipExpressionEditor/constants";

interface RefinementBarProps {
    onRefine: (instructions: string) => void;
    onRetry: () => void;
    onReject: () => void;
    onAccept: () => void;
    isEnhancing: boolean;
    versionCount: number;
    currentVersionIndex: number;
    onVersionNavigate: (index: number) => void;
    showDiff: boolean;
    onToggleDiff: () => void;
    isGeneration?: boolean;
}

const BarContainer = styled.div`
    display: flex;
    flex-direction: column;
    padding: 12px 0 0;
    background-color: var(--vscode-editor-background);
    border-top: 1px solid var(--vscode-panel-border); 
    gap: 6px;
`;

const InputSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const InputWrapper = styled.div`
    display: flex;
    gap: 4px;
    align-items: center;
    position: relative;
`;

const RefineInput = styled.input`
    flex: 1;
    padding: 6px 10px;
    padding-right: 36px; /* Space for send button if absolute, or just padding */
    font-size: 13px;
    font-family: inherit;
    border: 1px solid var(--vscode-input-border);
    border-radius: ${FIELD_RADIUS};
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    outline: none;
    height: 32px;
    box-sizing: border-box;

    &::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }
`;

const SendButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border: none;
    border-radius: 4px;
    background-color: ${ThemeColors.PRIMARY}; 
    border: 1px solid var(--vscode-dropdown-border);
    color: ${ThemeColors.ON_PRIMARY};
    cursor: pointer;
    transition: opacity 0.2s;

    &:hover:not(:disabled) {
        opacity: 0.9;
    }

    &:disabled {
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        cursor: not-allowed;
    }
`;

const FooterRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--vscode-panel-border);
    margin-top: 4px;
    padding-top: 12px;
`;

const VersionControl = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
`;

const NavButton = styled.button`
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 2px;
    border-radius: 3px;

    &:hover:not(:disabled) {
        background-color: var(--vscode-list-hoverBackground);
        color: var(--vscode-foreground);
    }
    &:disabled {
        opacity: 0.3;
        cursor: default;
    }
`;

const DiffToggleButton = styled.button<{ isActive?: boolean }>`
    background: ${props => props.isActive ? 'var(--vscode-list-hoverBackground)' : 'none'};
    border: 1px solid ${props => props.isActive ? 'var(--vscode-focusBorder)' : 'transparent'};
    color: ${props => props.isActive ? 'var(--vscode-foreground)' : 'inherit'};
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 2px 4px;
    border-radius: 3px;
    gap: 4px;
    font-size: 11px;

    &:hover:not(:disabled) {
        background-color: var(--vscode-list-hoverBackground);
        color: var(--vscode-foreground);
    }
    &:disabled {
        opacity: 0.3;
        cursor: default;
    }
`;

const ActionGroup = styled.div`
    display: flex;
    gap: 8px;
`;

export const RefinementBar: React.FC<RefinementBarProps> = ({
    onRefine,
    onRetry,
    onReject,
    onAccept,
    isEnhancing,
    versionCount,
    currentVersionIndex,
    onVersionNavigate,
    showDiff,
    onToggleDiff,
    isGeneration = false,
}) => {
    const [refineText, setRefineText] = useState("");

    const handleSend = () => {
        const text = refineText.trim();
        if (!text) return;
        setRefineText("");
        onRefine(text);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <BarContainer>
            <InputSection>
                <InputWrapper>
                    <RefineInput
                        type="text"
                        placeholder="Describe how to refine the prompt..."
                        value={refineText}
                        onChange={(e) => setRefineText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isEnhancing}
                        autoFocus
                    />
                    <SendButton
                        onClick={handleSend}
                        disabled={isEnhancing || !refineText.trim()}
                        title="Send refinement"
                    >
                        <Icon name="bi-send" sx={{ fontSize: "16px", width: "16px", height: "16px" }} />
                    </SendButton>
                </InputWrapper>
            </InputSection>

            <FooterRow>
                <VersionControl>
                    <DiffToggleButton
                        onClick={onToggleDiff}
                        disabled={isEnhancing}
                        isActive={showDiff}
                        title={showDiff ? "Hide changes" : "Show changes"}
                    >
                        <Icon name="diff" isCodicon sx={{ fontSize: "14px" }} />
                    </DiffToggleButton>
                    {versionCount > 1 ? (
                        <>
                            <NavButton
                                onClick={() => onVersionNavigate(currentVersionIndex - 1)}
                                disabled={isEnhancing || currentVersionIndex <= 0}
                            >
                                <Icon name="chevron-left" isCodicon sx={{ fontSize: "14px" }} />
                            </NavButton>
                            <span>
                                {currentVersionIndex === 0 ? (isGeneration ? "Generated" : "Original") : `Version ${currentVersionIndex}`} / {versionCount - 1}
                            </span>
                            <NavButton
                                onClick={() => onVersionNavigate(currentVersionIndex + 1)}
                                disabled={isEnhancing || currentVersionIndex >= versionCount - 1}
                            >
                                <Icon name="chevron-right" isCodicon sx={{ fontSize: "14px" }} />
                            </NavButton>
                        </>
                    ) : (
                        <span>{isGeneration ? "Generated Version" : "Original Version"}</span>
                    )}
                </VersionControl>

                <ActionGroup>
                    <Button
                        appearance="secondary"
                        onClick={onReject}
                        disabled={isEnhancing}
                        sx={{ color: 'var(--vscode-descriptionForeground)' }}
                    >
                        Discard
                    </Button>
                    <Button
                        appearance="primary"
                        onClick={onAccept}
                        disabled={isEnhancing}
                    >
                        <Icon name="bi-check" sx={{ fontSize: "16px", marginRight: "4px" }} />
                        Keep This
                    </Button>
                </ActionGroup>
            </FooterRow>
        </BarContainer>
    );
};
