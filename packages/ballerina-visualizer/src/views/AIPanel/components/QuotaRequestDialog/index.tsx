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
import { Button } from "@wso2/ui-toolkit";

const QUOTA_CONTACT_EMAIL = "support@wso2.com";
const NOTE_MAX_LENGTH = 2000;

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
    height: 60px;
    padding: 8px 10px;
    margin-top: 10px;
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
    margin-bottom: 0px;
    margin-top: 8px;
    opacity: 0.8;
    line-height: 1.4;
`;

const ErrorText = styled.p`
    font-size: 12px;
    color: var(--vscode-errorForeground);
    margin-top: 8px;
    margin-bottom: 0px;
    line-height: 1.4;
`;

const ButtonContainer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 12px;
`;

interface QuotaRequestDialogProps {
    submitting?: boolean;
    error?: string;
    onCancel: () => void;
    onSubmit: (note: string) => void;
}

const QuotaRequestDialog: React.FC<QuotaRequestDialogProps> = ({ submitting, error, onCancel, onSubmit }) => {
    const [note, setNote] = useState("");

    return (
        <Overlay>
            <DialogContainer
                role="dialog"
                aria-modal="true"
                aria-labelledby="quota-request-title"
                aria-describedby="quota-request-desc"
            >
                <Title id="quota-request-title">Request additional quota</Title>
                <Text id="quota-request-desc">Let the team know you'd like more Integrator Copilot quota this week.</Text>
                <TextArea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a message (optional)"
                    aria-label="Message (optional)"
                    maxLength={NOTE_MAX_LENGTH}
                    autoFocus
                />
                <Notice>
                    Your WSO2 account email will be included with this request so the team can follow up.
                </Notice>
                <Notice>
                    Reach us at {QUOTA_CONTACT_EMAIL}.
                </Notice>
                {error && <ErrorText role="alert">{error}</ErrorText>}
                <ButtonContainer>
                    <Button appearance="secondary" onClick={onCancel} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button appearance="primary" onClick={() => onSubmit(note)} disabled={submitting}>
                        {submitting ? "Submitting..." : "Submit"}
                    </Button>
                </ButtonContainer>
            </DialogContainer>
        </Overlay>
    );
};

export default QuotaRequestDialog;
