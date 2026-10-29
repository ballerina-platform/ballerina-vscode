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

import React, { ReactNode } from 'react';
import styled from '@emotion/styled';
import { Tooltip } from '@wso2/ui-toolkit';
import { TypeModifierTooltip } from '@wso2/ballerina-side-panel';

export interface SyntaxToggleItem {
    id: string;
    /** The syntax the toggle writes, shown as the toggle itself, e.g. `[]`. */
    glyph: ReactNode;
    title: string;
    description: string;
    example?: string;
    pressed: boolean;
    disabled?: boolean;
    onToggle: () => void;
}

/** The class of a syntax toggle that is off, for a row to reveal those only while it is in use. */
const SYNTAX_TOGGLE_OFF_CLASS = 'syntax-toggle-off';

/**
 * Hides the syntax toggles that are off within a row until the row is hovered or holds the focus, so a resting row
 * shows only what is set on it.
 */
export const revealSyntaxTogglesOnHover = `
    .${SYNTAX_TOGGLE_OFF_CLASS} {
        display: none;
    }
    &:hover .${SYNTAX_TOGGLE_OFF_CLASS},
    &:focus-within .${SYNTAX_TOGGLE_OFF_CLASS} {
        display: inline-flex;
    }
`;

const Group = styled.div`
    display: flex;
    align-items: center;
    gap: 1px;
    height: 100%;
    padding-right: 2px;
`;

// A glyph that reads as the syntax it writes: dim while off, in the accent colour on a soft tint while on.
const Glyph = styled.button`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 3px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    opacity: 0.7;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    transition: background-color 0.12s ease, color 0.12s ease, opacity 0.12s ease;

    &[aria-pressed="true"] {
        color: var(--vscode-focusBorder);
        background-color: color-mix(in srgb, var(--vscode-focusBorder) 16%, transparent);
        opacity: 1;
    }

    &:hover:not(:disabled) {
        opacity: 1;
        background-color: var(--vscode-toolbar-hoverBackground);
    }

    &[aria-pressed="true"]:hover:not(:disabled) {
        background-color: color-mix(in srgb, var(--vscode-focusBorder) 26%, transparent);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
    }

    &:disabled {
        cursor: default;
        opacity: 0.35;
    }

    .codicon {
        font-size: 13px;
    }
`;

/**
 * Toggles placed inside a field at the point where the syntax they write goes, e.g. after a type for `[]` and `?`,
 * so the field reads as the code it produces.
 */
export function SyntaxToggles(props: { items: SyntaxToggleItem[] }) {
    const { items } = props;
    if (items.length === 0) {
        return null;
    }
    return (
        <Group>
            {items.map((item) => (
                <Tooltip
                    key={item.id}
                    position="bottom-end"
                    containerSx={{ display: 'inline-flex' }}
                    className={item.pressed ? undefined : SYNTAX_TOGGLE_OFF_CLASS}
                    content={<TypeModifierTooltip title={item.title} description={item.description} example={item.example} />}
                >
                    <Glyph
                        type="button"
                        aria-pressed={item.pressed}
                        aria-label={`${item.title}: ${item.description}`}
                        disabled={item.disabled}
                        data-testid={`syntax-toggle-${item.id}`}
                        // Keep the focus in the field, so the type helper does not open or close under the click.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                            e.stopPropagation();
                            item.onToggle();
                        }}
                    >
                        {item.glyph}
                    </Glyph>
                </Tooltip>
            ))}
        </Group>
    );
}
