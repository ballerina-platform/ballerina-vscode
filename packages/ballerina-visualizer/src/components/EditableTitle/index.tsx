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

import React, { ReactNode, useCallback, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Codicon } from "@wso2/ui-toolkit";

const EditableTitleWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    outline: none;
    min-width: 0;

    &:is(:hover, :focus-visible) .edit-title-icon-wrapper {
        opacity: 1;
        max-width: 28px;
    }
`;

const EditTitleIconWrapper = styled.div`
    opacity: 0;
    max-width: 0;
    overflow: hidden;
    flex-shrink: 0;
    transition: opacity 0.2s, max-width 0.2s;
    display: flex;
    align-items: center;
`;

const TitleInput = styled.input<{ $hasError?: boolean }>`
    font-weight: bold;
    font-size: 1.5rem;
    margin-bottom: 0;
    margin-top: 0;
    background: transparent;
    border: none;
    border-bottom: 2px solid ${({ $hasError }: { $hasError?: boolean }) => $hasError
        ? 'var(--vscode-inputValidation-errorBorder)'
        : 'var(--vscode-focusBorder)'};
    color: var(--vscode-foreground);
    outline: none;
    padding: 0;
    font-family: inherit;
    min-width: 120px;
    width: auto;
    @media (min-width: 768px) {
        font-size: 1.875rem;
    }
`;

const TitleValidationMessage = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: var(--vscode-inputValidation-errorForeground, var(--vscode-errorForeground));
    background: var(--vscode-inputValidation-errorBackground, transparent);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    border-radius: 2px;
    padding: 2px 6px;
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    white-space: nowrap;
    z-index: 10;
`;

interface EditableTitleProps {
    /** The current title value (used to seed the input and detect no-op edits). */
    title: string;
    /** Called with the new title when the user commits. Throw to keep edit mode open. */
    onCommit: (newTitle: string) => Promise<void>;
    /** Returns an error message for the given value, or "" if valid. */
    validate?: (value: string) => string;
    /** Optional style overrides for the input (e.g. to match a specific font size). */
    inputStyle?: React.CSSProperties;
    /** The title element rendered in non-editing state (e.g. <ProjectTitle>). */
    children: ReactNode;
}

export function EditableTitle({ title, onCommit, validate, inputStyle, children }: EditableTitleProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [error, setError] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const restoreFocus = () => setTimeout(() => { wrapperRef.current?.focus(); }, 0);

    const startEditing = useCallback(() => {
        setInputValue(title);
        setError("");
        setIsEditing(true);
        setTimeout(() => { inputRef.current?.select(); }, 0);
    }, [title]);

    const commitEdit = useCallback(async () => {
        const trimmed = inputValue.trim();
        const currentError = validate ? validate(trimmed) : "";
        if (!trimmed || currentError) {
            setError("");
            setIsEditing(false);
            restoreFocus();
            return;
        }
        if (trimmed === title) {
            setIsEditing(false);
            restoreFocus();
            return;
        }
        try {
            await onCommit(trimmed);
            setIsEditing(false);
            restoreFocus();
        } catch {
            // Keep edit mode open so the user can correct or cancel.
        }
    }, [inputValue, title, onCommit, validate]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
        } else if (e.key === "Escape") {
            setError("");
            setIsEditing(false);
            restoreFocus();
        }
    }, []);

    return (
        <div style={{ position: "relative" }}>
            {isEditing ? (
                <>
                    <TitleInput
                        ref={inputRef}
                        value={inputValue}
                        size={Math.max(inputValue.length, 8)}
                        $hasError={!!error}
                        aria-label="Edit name"
                        style={inputStyle}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setError(validate ? validate(e.target.value) : "");
                        }}
                        onKeyDown={handleKeyDown}
                        onBlur={commitEdit}
                        autoFocus
                    />
                    {error && (
                        <TitleValidationMessage>
                            <Codicon name="info" sx={{ fontSize: '12px', flexShrink: 0 }} />
                            {error}
                        </TitleValidationMessage>
                    )}
                </>
            ) : (
                <EditableTitleWrapper
                    ref={wrapperRef}
                    role="button"
                    tabIndex={0}
                    onClick={startEditing}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            startEditing();
                        }
                    }}
                    title="Click to edit name"
                    aria-label="Edit name"
                >
                    {children}
                    <EditTitleIconWrapper className="edit-title-icon-wrapper">
                        <Codicon name="edit" sx={{ color: 'var(--vscode-descriptionForeground)', fontSize: '14px', width: '16px' }} />
                    </EditTitleIconWrapper>
                </EditableTitleWrapper>
            )}
        </div>
    );
}
