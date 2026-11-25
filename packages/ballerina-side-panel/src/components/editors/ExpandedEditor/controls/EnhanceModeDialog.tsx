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

import React, { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { TextArea, Button, Typography, ThemeColors, Icon } from "@wso2/ui-toolkit";
import { PromptMode } from "@wso2/ballerina-core";

interface EnhanceModeDialogProps {
    isOpen: boolean;
    isLoading?: boolean;
    onEnhance: (mode: PromptMode, instructions?: string) => void;
    onClose: () => void;
    promptMode?: PromptMode;
    isGeneration?: boolean;
}

const fadeIn = keyframes`
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
`;

const slideUp = keyframes`
    from {
        opacity: 0;
        transform: translateY(15px) scale(0.98);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
`;

const PopupContainer = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 30000;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none;
`;

const Overlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: color-mix(in srgb, ${ThemeColors.SECONDARY_CONTAINER} 80%, transparent);
    z-index: 29999;
    animation: ${fadeIn} 0.2s ease-out forwards;
    will-change: opacity;
`;

const PopupBox = styled.div`
    width: 600px;
    max-width: 90vw;
    max-height: 90vh;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 6px;
    background-color: var(--vscode-editor-background);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
    z-index: 30001;
    font-family: var(--font-family);
    pointer-events: auto;
    outline: none;
    animation: ${slideUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    will-change: transform, opacity;
`;

const PopupHeader = styled.header`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 22px 24px;
    background-color: var(--vscode-editor-background);
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    font-family: GilmerRegular;
`;

const PopupContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px 24px;
    overflow-y: auto;
    flex: 1;
`;

const SectionTitle = styled.div`
    font-size: 13px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin-bottom: 6px;
`;

const DialogActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding: 16px 24px;
    background-color: var(--vscode-editor-background);
    border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const DescriptionText = styled.div`
    font-size: 13px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    line-height: 1.5;
    margin-bottom: 4px;
`;

const CloseButton = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:hover {
        background-color: color-mix(in srgb, ${ThemeColors.ON_SURFACE_VARIANT} 12%, transparent);
    }
`;

export const EnhanceModeDialog: React.FC<EnhanceModeDialogProps> = ({
    isOpen,
    isLoading = false,
    onEnhance,
    onClose,
    promptMode = PromptMode.DEFAULT,
    isGeneration = false
}) => {
    const [customInstructions, setCustomInstructions] = useState("");

    const popupBoxRef = useRef<HTMLDivElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    // Reset state when dialog opens
    useEffect(() => {
        if (isOpen) {
            setCustomInstructions("");
        }
    }, [isOpen]);

    const handleEnhanceTrigger = () => {
        if (isGeneration && !customInstructions.trim()) return;
        const parts: string[] = [];
        if (customInstructions.trim()) {
            parts.push(customInstructions.trim());
        }
        const combined = parts.join(". ") || undefined;
        onEnhance(promptMode, combined);
    };

    const handleClose = () => {
        if (!isLoading) {
            setCustomInstructions("");
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape" && !isLoading) {
            e.preventDefault();
            handleClose();
        } else if (e.key === "Enter" && e.ctrlKey && !isLoading) {
            // Ctrl+Enter is also the form's save shortcut.
            e.preventDefault();
            e.stopPropagation();
            handleEnhanceTrigger();
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <Overlay onClick={handleClose} />
            <PopupContainer>
                <PopupBox ref={popupBoxRef} onKeyDown={handleKeyDown} tabIndex={-1}>
                    <PopupHeader>
                        <Typography variant="h3" sx={{ margin: 0, gap: "8px", display: "flex", alignItems: "center" }}>
                            <Icon name="wand-magic-sparkles-solid" sx={{ width: "14px", height: "14px", fontSize: "14px", color: "var(--vscode-button-background)" }} />
                            {isGeneration ? "Generate Prompt with AI" : "Enhance Prompt with AI"}
                        </Typography>
                        <CloseButton onClick={handleClose} style={{ opacity: isLoading ? 0.5 : 1 }}>
                            <Icon
                                name="bi-close"
                                sx={{
                                    fontSize: '16px',
                                    width: '16px',
                                    height: '16px',
                                    color: ThemeColors.ON_SURFACE_VARIANT,
                                }}
                            />
                        </CloseButton>
                    </PopupHeader>

                    <PopupContent>
                        <DescriptionText>
                            {isGeneration
                                ? "Describe what you'd like the prompt to do, and AI will generate one for you."
                                : "Let AI enhance and refine your prompt. Add custom instructions below, or click Enhance for a quick improvement."
                            }
                        </DescriptionText>

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <SectionTitle>
                                {isGeneration
                                    ? <span style={{ fontWeight: 600 }}>What should this prompt do?</span>
                                    : <><span style={{ fontWeight: 600 }}>Custom instructions</span> (Optional)</>
                                }
                            </SectionTitle>
                            <TextArea
                                ref={textAreaRef}
                                placeholder={isGeneration
                                    ? "e.g., A customer support agent that handles refund requests politely..."
                                    : "Describe how you'd like the prompt improved..."
                                }
                                value={customInstructions}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCustomInstructions(e.target.value)}
                                rows={3}
                                disabled={isLoading}
                                style={{ fontSize: '13px', fontFamily: 'inherit', width: '100%' }}
                            />
                        </div>
                    </PopupContent>

                    <DialogActions>
                        <Button appearance="secondary" onClick={handleClose} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button appearance="primary" onClick={handleEnhanceTrigger} disabled={isLoading || (isGeneration && !customInstructions.trim())}>
                            {isLoading
                                ? (isGeneration ? "Generating..." : "Optimizing...")
                                : (isGeneration ? "Generate" : "Enhance")
                            }
                        </Button>
                    </DialogActions>
                </PopupBox>
            </PopupContainer>
        </>
    );
};
