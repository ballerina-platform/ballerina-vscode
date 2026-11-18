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
import styled from "@emotion/styled";
import { Button } from "@wso2/ui-toolkit";

const Overlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    transition: all 0.2s ease;
`;

const DialogContainer = styled.div`
    background-color: var(--vscode-editor-background);
    border-radius: 8px;
    padding: 24px;
    width: 420px;
    max-width: 90%;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    border: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
    transition: transform 0.2s ease, opacity 0.2s ease;
    animation: dialogFadeIn 0.2s ease;

    @keyframes dialogFadeIn {
        from {
            opacity: 0;
            transform: translateY(-8px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;

const Title = styled.h3`
    margin-top: 0;
    margin-bottom: 16px;
    color: var(--vscode-foreground);
    font-weight: 500;
    font-size: 16px;
    letter-spacing: 0.01em;
`;

const Text = styled.p`
    margin-bottom: 12px;
    font-size: 14px;
    color: var(--vscode-foreground);
    opacity: 0.9;
`;

const TextArea = styled.textarea`
    width: 100%;
    height: 60px; /* Reduced height */
    padding: 8px 10px; /* Slightly reduced padding */
    margin-top: 10px; /* Less space below */
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-focusBorder);
    border-radius: 4px;
    resize: vertical;
    font-family: inherit;
    font-size: 14px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    box-sizing: border-box;
    box-shadow: 0 0 0 1px var(--vscode-focusBorder, transparent);
    &:focus {
        outline: none;
    }
    &::placeholder {
        color: var(--vscode-input-placeholderForeground, rgba(255, 255, 255, 0.4));
    }
`;

const Notice = styled.p`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 0px; /* Remove extra space below */
    margin-top: 8px; /* Add a little space above */
    opacity: 0.8;
    line-height: 1.4;
`;

const ButtonContainer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 4px;
`;

const PredefinedButton = styled(Button)<{ selected?: boolean }>`
    background: ${({ selected = false }: { selected?: boolean }) =>
        selected ? "var(--vscode-button-background)" : "var(--vscode-editorWidget-background)"};
    color: var(--vscode-button-foreground);
    border: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
    box-shadow: none;
    &:hover {
        background: var(--vscode-button-hoverBackground);
    }
`;

const predefinedFeedbacks = ["The code has errors", "The response is too long", "The response was too slow"];

interface FeedbackDialogProps {
    isPositive: boolean;
    messageIndex: number;
    onCancel: () => void;
    onSubmit: (feedback: string) => void;
}

const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ isPositive, messageIndex, onCancel, onSubmit }) => {
    const [feedbackText, setFeedbackText] = useState("");
    const [selectedFeedback, setSelectedFeedback] = useState<string | null>(null);

    const handlePredefinedClick = (feedback: string) => {
        setSelectedFeedback(feedback);
        setFeedbackText(feedback);
    };

    return (
        <Overlay>
            <DialogContainer>
                <Title>We value your feedback</Title>
                <Text>Help us understand what went wrong or share your thoughts:</Text>
                {/* TODO: Enable this after finalzing predefined feedbacks */}
                {/* <div style={{ display: 'flex', gap: 8, marginBottom: 8 , flexWrap: 'wrap'}}>
          {predefinedFeedbacks.map((item) => (
            <PredefinedButton
              key={item}
              selected={selectedFeedback === item}
              onClick={() => handlePredefinedClick(item)}
            >
              {item}
            </PredefinedButton>
          ))}
        </div> */}
                <TextArea
                    value={feedbackText}
                    onChange={(e) => {
                        setFeedbackText(e.target.value);
                        setSelectedFeedback(null);
                    }}
                    placeholder="Add a comment (optional)"
                    autoFocus
                />
                {!isPositive && (
                    <Notice>
                        By submitting, your feedback and the current conversation will be securely shared with Choreo Labs to
                        help us improve your experience.
                    </Notice>
                )}
                <ButtonContainer>
                    <Button appearance="secondary" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button appearance="primary" onClick={() => onSubmit(feedbackText)}>
                        Submit
                    </Button>
                </ButtonContainer>
            </DialogContainer>
        </Overlay>
    );
};

export default FeedbackDialog;
