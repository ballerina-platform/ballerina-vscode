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

import React from "react";
import { FormField } from "../Form/types";
import { Button, Icon, RequiredFormInput, ThemeColors, Tooltip } from "@wso2/ui-toolkit";
import { capitalize } from "./utils";
import styled from "@emotion/styled";

interface ReadonlyFieldProps {
    field: FormField;
}

const Container = styled.div`
    width: 100%;
`;

const Label = styled.div`
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    display: flex;
    flex-direction: row;
    margin-bottom: 4px;
`;

const Description = styled.div`
    font-family: var(--font-family);
    color: var(--vscode-list-deemphasizedForeground);
    margin-top: 4px;
    color: var(--vscode-list-deemphasizedForeground);
    margin-bottom: 4px;
    text-align: left;
`;

const InputContainer = styled.div`
    display: flex;
    align-items: stretch;
    color: var(--input-foreground);
    background: var(--input-background);
    border-radius: calc(var(--corner-radius)* 1px);
    border: calc(var(--border-width)* 1px) solid var(--dropdown-border);
    height: calc(var(--input-height)* 1px);
    min-width: var(--input-min-width);
    margin-top: 10px;
    overflow: hidden;
    cursor: not-allowed;
`;

const ExpressionRibbon = styled.div`
    background-color: ${ThemeColors.PRIMARY};
    opacity: 0.6;
    width: 24px;
    min-width: 24px;
    display: flex;
    justify-content: center;
    align-items: center;
    border-top-left-radius: 2px;
    border-bottom-left-radius: 2px;
`;

const ReadonlyChip = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(128, 128, 128, 0.15);
    border: 1px solid rgba(128, 128, 128, 0.4);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 12px;
    min-height: 20px;
    min-width: 25px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const ChipIcon = styled.i`
    display: flex;
    align-items: center;
    color: var(--vscode-editorInfo-foreground, var(--vscode-list-deemphasizedForeground));
    font-size: 14px;
`;

const Value = styled.span`
    flex: 1;
    display: flex;
    align-items: center;
    align-self: center;
    flex-wrap: wrap;
    padding: 4px calc(var(--design-unit) * 2px + 1px);
    overflow: hidden;
`;

const Placeholder = styled.span`
    color: var(--vscode-input-placeholderForeground);
`;

const LockContainer = styled.div`
    display: flex;
    align-items: center;
    align-self: center;
    margin-right: 4px;
`;

const StyledButton = styled(Button)`
    padding: 0;
    cursor: not-allowed;

    :host([disabled]) {
        opacity: 1 !important;
    }

    &.ms-Button--disabled {
        opacity: 1 !important;
    }

    & .codicon {
        opacity: 1 !important;
        color: var(--vscode-editor-foreground) !important;
    }
`;

/**
 * Returns the display value and whether it is an expression based on the
 * field's selected type.
 */
function getDisplayInfo(field: FormField): { displayValue: string; isExpression: boolean } {
    const value = typeof field.value === "string" ? field.value : String(field.value ?? "");
    const selectedType = field.types?.find(t => t.selected);
    const fieldType = selectedType?.fieldType ?? field.type;
    const isExpression = fieldType === "EXPRESSION";

    // Strip surrounding quotes only from simple string literals (no internal unescaped quotes)
    let displayValue = value;
    if (!isExpression && displayValue.startsWith('"') && displayValue.endsWith('"') && displayValue.length >= 2) {
        const inner = displayValue.slice(1, -1);
        // Only strip if there are no unescaped quotes inside
        if (!inner.match(/(?<!\\)"/)) {
            displayValue = inner;
        }
    }

    return { displayValue, isExpression };
}

/**
 * Renders an expression value, wrapping only ${...} interpolations in chips
 * and leaving surrounding text as plain text.
 */
function renderExpressionValue(value: string): React.ReactNode {
    const regex = /\$\{([^}]+)\}/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(value)) !== null) {
        if (match.index > lastIndex) {
            parts.push(value.slice(lastIndex, match.index));
        }
        parts.push(
            <ReadonlyChip key={match.index}>
                <ChipIcon className="fw-bi-variable" />
                {match[1]}
            </ReadonlyChip>
        );
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < value.length) {
        parts.push(value.slice(lastIndex));
    }

    // No interpolations found — render entire value as a single chip
    if (parts.length === 0 || (parts.length === 1 && typeof parts[0] === "string")) {
        return (
            <ReadonlyChip>
                <ChipIcon className="fw-bi-variable" />
                {value}
            </ReadonlyChip>
        );
    }

    return <>{parts}</>;
}

export function ReadonlyField(props: ReadonlyFieldProps) {
    const { field } = props;
    const { displayValue, isExpression } = getDisplayInfo(field);

    return (
        <Container data-testid={`readonly-field-${field.key}`}>
            <Label>
                <div style={{ color: "var(--vscode-editor-foreground)" }}>
                    <label>{capitalize(field.label)}</label>
                </div>
                {!field.optional && <RequiredFormInput />}
            </Label>
            {field.documentation && <Description>{field.documentation}</Description>}
            <InputContainer>
                {isExpression && (
                    <ExpressionRibbon>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            style={{ color: ThemeColors.ON_PRIMARY }}>
                            <path
                                fill="currentColor"
                                d="M12.42 5.29c-1.1-.1-2.07.71-2.17 1.82L10 10h2.82v2h-3l-.44 5.07A4.001 4.001 0 0 1 2 18.83l1.5-1.5c.33 1.05 1.46 1.64 2.5 1.3c.78-.24 1.33-.93 1.4-1.74L7.82 12h-3v-2H8l.27-3.07a4.01 4.01 0 0 1 4.33-3.65c1.26.11 2.4.81 3.06 1.89l-1.5 1.5c-.25-.77-.93-1.31-1.74-1.38M22 13.65l-1.41-1.41l-2.83 2.83l-2.83-2.83l-1.43 1.41l2.85 2.85l-2.85 2.81l1.43 1.41l2.83-2.83l2.83 2.83L22 19.31l-2.83-2.81z" />
                        </svg>
                    </ExpressionRibbon>
                )}
                <Value>
                    {!displayValue && field.placeholder
                        ? <Placeholder>{field.placeholder}</Placeholder>
                        : isExpression ? renderExpressionValue(displayValue) : displayValue}
                </Value>
                <LockContainer>
                    <Tooltip content="Read only field">
                        <StyledButton appearance="icon" disabled>
                            <Icon name="bi-lock" sx={{ fontSize: 16, width: 16, height: 16}} />
                        </StyledButton>
                    </Tooltip>
                </LockContainer>
            </InputContainer>
        </Container>
    );
}
