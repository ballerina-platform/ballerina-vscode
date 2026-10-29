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

import React from "react";
import styled from "@emotion/styled";
import { Codicon, ThemeColors, Tooltip } from "@wso2/ui-toolkit";
import { canToggleModifier, parseTypeShape, toggleTypeModifier, TypeModifier } from "./typeModifiers";

export type TypeModifierLabels = Partial<Record<TypeModifier, string>>;

const DEFAULT_LABELS: Record<TypeModifier, string> = {
    list: "List",
    nullable: "Nullable",
    error: "Returns error",
};

/** What a modifier means and the syntax it writes, for the tooltip of any control that toggles it. */
export const TYPE_MODIFIER_INFO: Record<TypeModifier, { title: string; description: string; example: string }> = {
    list: {
        title: "List",
        description: "Holds a list of values instead of a single one.",
        example: "string[]",
    },
    nullable: {
        title: "Nullable",
        description: "The value can be nil.",
        example: "string?",
    },
    error: {
        title: "Returns error",
        description: "Can produce an error in place of the value.",
        example: "string|error",
    },
};

const STREAM_DESCRIPTIONS: Record<TypeModifier, { description: string; example: string }> = {
    list: { description: "Each value of the stream is a list.", example: "stream<string[]>" },
    nullable: { description: "Each value of the stream can be nil.", example: "stream<string?>" },
    error: { description: "The stream can end with an error.", example: "stream<string, error?>" },
};

const TooltipBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 240px;
    font-size: 12px;
`;

const TooltipTitle = styled.span`
    font-weight: 600;
`;

const TooltipExample = styled.code`
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-textPreformat-foreground);
`;

/**
 * The tooltip of a modifier toggle: what it means, and an example of the syntax it writes. The example is labelled as
 * one, as its `string` is not the type the user has in the field.
 */
export function TypeModifierTooltip(props: { title: string; description: string; example?: string; note?: string }) {
    const { title, description, example, note } = props;
    return (
        <TooltipBody>
            <TooltipTitle>{title}</TooltipTitle>
            <span>{description}</span>
            {example && <span>Example: <TooltipExample>{example}</TooltipExample></span>}
            {note && <span>{note}</span>}
        </TooltipBody>
    );
}

// Each toggle carries the symbol of what it adds, so its meaning reads before its label does.
const ICONS: Record<TypeModifier, string> = {
    list: "symbol-array",
    nullable: "circle-slash",
    error: "error",
};

const Bar = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
`;

// A pill that sits quietly while off and takes a soft tint of the accent colour while on.
const Chip = styled.button<{ pressed: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 10px 0 8px;
    border-radius: 6px;
    border: 1px solid ${(props: { pressed: boolean }) => props.pressed
        ? "color-mix(in srgb, var(--vscode-focusBorder) 55%, transparent)"
        : "var(--vscode-widget-border, " + ThemeColors.OUTLINE_VARIANT + ")"};
    background-color: ${(props: { pressed: boolean }) => props.pressed
        ? "color-mix(in srgb, var(--vscode-focusBorder) 16%, transparent)"
        : "transparent"};
    color: ${(props: { pressed: boolean }) => props.pressed
        ? "var(--vscode-foreground)"
        : "var(--vscode-descriptionForeground)"};
    font-family: var(--vscode-font-family);
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;

    .codicon {
        font-size: 14px;
        color: ${(props: { pressed: boolean }) => props.pressed ? "var(--vscode-focusBorder)" : "inherit"};
        transition: color 0.12s ease;
    }

    &:hover:not(:disabled) {
        color: var(--vscode-foreground);
        background-color: ${(props: { pressed: boolean }) => props.pressed
            ? "color-mix(in srgb, var(--vscode-focusBorder) 24%, transparent)"
            : "var(--vscode-toolbar-hoverBackground)"};
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }

    &:disabled {
        cursor: default;
        opacity: 0.45;
    }
`;

interface TypeModifierBarProps {
    /** The type as it stands in the field. */
    value: string;
    /** The toggles to offer, in the order to show them. */
    modifiers: TypeModifier[];
    /** Labels in the words of the context, e.g. "Nullable" for GraphQL; any left out take the defaults. */
    labels?: TypeModifierLabels;
    onChange: (value: string) => void;
    className?: string;
}

/**
 * A row of toggles under a type field that add or remove a list, nil or error without typing the syntax. The text of
 * the field stays the source of truth: each toggle shows what the text holds, and turning one rewrites the text.
 */
export function TypeModifierBar(props: TypeModifierBarProps) {
    const { value, modifiers, labels, onChange, className } = props;
    if (modifiers.length === 0) {
        return null;
    }
    const shape = parseTypeShape(value);

    return (
        <Bar role="group" aria-label="Type modifiers" className={className}>
            {modifiers.map((modifier) => {
                const pressed = shape[modifier];
                const enabled = canToggleModifier(shape, modifier);
                const label = labels?.[modifier] ?? DEFAULT_LABELS[modifier];
                const info = shape.stream ? { ...TYPE_MODIFIER_INFO[modifier], ...STREAM_DESCRIPTIONS[modifier] } : TYPE_MODIFIER_INFO[modifier];
                return (
                    <Tooltip
                        key={modifier}
                        position="bottom-start"
                        content={
                            <TypeModifierTooltip
                                title={label}
                                description={info.description}
                                example={info.example}
                                note={enabled ? undefined : "Enter a type first."}
                            />
                        }
                    >
                        <Chip
                            type="button"
                            pressed={pressed}
                            aria-pressed={pressed}
                            aria-label={`${label}: ${info.description}`}
                            disabled={!enabled}
                            data-testid={`type-modifier-${modifier}`}
                            onClick={() => onChange(toggleTypeModifier(value, modifier, !pressed))}
                        >
                            <Codicon name={ICONS[modifier]} sx={{ width: "14px", height: "14px" }} iconSx={{ fontSize: "14px" }} />
                            {label}
                        </Chip>
                    </Tooltip>
                );
            })}
        </Bar>
    );
}
