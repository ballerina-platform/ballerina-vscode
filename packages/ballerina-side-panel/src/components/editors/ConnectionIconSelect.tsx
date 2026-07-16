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

import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Codicon, Icon, DefaultLlmIcon, getAIModuleIcon, ProgressRing } from "@wso2/ui-toolkit";
import { CodeData } from "@wso2/ballerina-core";

const ICON_SIZE = 16;

const NODE_ICON_MAP: Record<string, string> = {
    MODEL_PROVIDER: "bi-ai-model",
    VECTOR_STORE: "bi-db",
    EMBEDDING_PROVIDER: "bi-doc",
    DATA_LOADER: "bi-data-table",
    CHUNKER: "bi-cut",
    SHORT_TERM_MEMORY_STORE: "bi-memory",
    AGENT: "bi-ai-agent",
    AGENT_TYPE: "bi-ai-agent",
};

// Modules that always use node-type icons, skipping the icon URL fallback
const GENERIC_ICON_MODULES = new Set(["ai.devant", "ai"]);

// The non-URL icon for a node: its node-type glyph (bot for agents), else the default LLM glyph.
function getFallbackIcon(codedata: CodeData): React.ReactElement {
    const iconSx = { width: ICON_SIZE, height: ICON_SIZE, fontSize: ICON_SIZE };
    const nodeIcon = codedata.node && NODE_ICON_MAP[codedata.node];
    if (nodeIcon) return <Icon name={nodeIcon} sx={iconSx} />;
    return <DefaultLlmIcon size={ICON_SIZE} />;
}

// Renders the Central icon URL, falling back to the node's glyph when the image is missing/404s (e.g. an
// unpublished agent whose package icon doesn't resolve).
const UrlIcon: React.FC<{ url: string; fallback: React.ReactElement }> = ({ url, fallback }) => {
    const [errored, setErrored] = useState(false);
    if (errored) {
        return fallback;
    }
    return <img src={url} style={{ width: ICON_SIZE, height: ICON_SIZE }} onError={() => setErrored(true)} />;
};

export function getConnectionIcon(codedata: CodeData, iconUrl?: string): React.ReactElement {
    const iconSx = { width: ICON_SIZE, height: ICON_SIZE, fontSize: ICON_SIZE };

    // Check AI module icon map first (e.g. OpenAI, Anthropic, etc.)
    if (codedata.module) {
        const icon = getAIModuleIcon(codedata.module, ICON_SIZE);
        if (icon) return icon;
    }

    // WSO2 "ai" module: use bi-wso2 for model providers and embedding providers
    if (codedata.module === "ai") {
        if (codedata.node === "MODEL_PROVIDER" || codedata.node === "EMBEDDING_PROVIDER") {
            return <Icon name="bi-wso2" sx={iconSx} />;
        }
    }

    // Icon URL from metadata (fetched from Central) — skip for modules that prefer generic icons. Falls back to the
    // node glyph if the image fails to load.
    if (iconUrl && !(codedata.module && GENERIC_ICON_MODULES.has(codedata.module))) {
        return <UrlIcon url={iconUrl} fallback={getFallbackIcon(codedata)} />;
    }

    return getFallbackIcon(codedata);
}

// --- Select Item type ---

export interface ConnectionSelectItem {
    id: string;
    label: string;
    value: string;
    codedata?: CodeData;
    iconUrl?: string;
}

// --- Styled Components ---

const SelectContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    color: var(--vscode-editor-foreground);
`;

const SelectTrigger = styled.div<{ disabled?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    min-height: 26px;
    background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 2px;
    cursor: ${(props) => (props.disabled ? "not-allowed" : "pointer")};
    opacity: ${(props) => (props.disabled ? 0.5 : 1)};

    &:focus {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }
`;

const SelectedDisplay = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
`;

const SelectedLabel = styled.span`
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
`;

const Placeholder = styled.span`
    color: var(--vscode-input-placeholderForeground);
    font-size: 13px;
`;

const DropdownPanel = styled.div`
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 3333;
    background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 2px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    max-height: 200px;
    overflow-y: auto;
`;

const OptionItem = styled.div<{ selected?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    min-height: 26px;
    cursor: pointer;
    font-size: 13px;
    background: ${(props) =>
        props.selected ? "var(--vscode-list-activeSelectionBackground)" : "transparent"};
    color: ${(props) =>
        props.selected ? "var(--vscode-list-activeSelectionForeground)" : "inherit"};

    &:hover {
        background: ${(props) =>
        props.selected
            ? "var(--vscode-list-activeSelectionBackground)"
            : "var(--vscode-list-hoverBackground)"};
    }
`;

const OptionLabel = styled.span`
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Wrapper = styled.div`
    position: relative;
`;

const FieldLabel = styled.label`
    margin-bottom: 2px;
`;

// --- Component ---

interface ConnectionIconSelectProps {
    id: string;
    label?: string;
    items: ConnectionSelectItem[];
    value?: string;
    placeholder?: string;
    emptyMessage?: string;
    disabled?: boolean;
    required?: boolean;
    loading?: boolean;
    onChange: (value: string) => void;
}

export const ConnectionIconSelect: React.FC<ConnectionIconSelectProps> = ({
    id,
    label,
    items,
    value,
    placeholder = "Select...",
    emptyMessage = "No items available. Create one below.",
    disabled = false,
    required = false,
    loading = false,
    onChange,
}) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const isEmpty = items.length === 0;
    const selectedItem = items.find((item) => item.value === value);

    const handleSelect = (itemValue: string) => {
        onChange(itemValue);
        setOpen(false);
    };

    const focusOption = (index: number) => {
        const options = containerRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
        if (options && options[index]) {
            options[index].focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(!open);
        } else if (e.key === "Escape") {
            setOpen(false);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) {
                setOpen(true);
            }
            // Focus first option after render
            setTimeout(() => focusOption(0), 0);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) {
                setOpen(true);
            }
            setTimeout(() => focusOption(items.length - 1), 0);
        }
    };

    const handleOptionKeyDown = (e: React.KeyboardEvent, index: number, itemValue: string) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleSelect(itemValue);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            focusOption(index + 1 < items.length ? index + 1 : 0);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            focusOption(index - 1 >= 0 ? index - 1 : items.length - 1);
        } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            containerRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
        }
    };

    return (
        <SelectContainer>
            {label && (
                <FieldLabel htmlFor={id}>
                    {label}
                    {required && <span style={{ color: "var(--vscode-errorForeground)" }}> *</span>}
                </FieldLabel>
            )}
            <Wrapper ref={containerRef}>
                <SelectTrigger
                    id={id}
                    role="combobox"
                    aria-expanded={open}
                    aria-haspopup="listbox"
                    tabIndex={disabled || isEmpty || loading ? -1 : 0}
                    disabled={disabled || isEmpty || loading}
                    onClick={() => !disabled && !isEmpty && !loading && setOpen(!open)}
                    onKeyDown={handleKeyDown}
                >
                    <SelectedDisplay>
                        {loading ? (
                            <>
                                <ProgressRing sx={{ height: 16, width: 16 }} color="var(--vscode-input-placeholderForeground)" />
                                <Placeholder>Loading...</Placeholder>
                            </>
                        ) : selectedItem ? (
                            <>
                                {selectedItem.codedata && getConnectionIcon(selectedItem.codedata, selectedItem.iconUrl)}
                                <SelectedLabel>{selectedItem.label}</SelectedLabel>
                            </>
                        ) : (
                            <Placeholder>{isEmpty ? emptyMessage : placeholder}</Placeholder>
                        )}
                    </SelectedDisplay>
                    {!loading && !isEmpty && <Codicon name="chevron-down" sx={{ fontSize: 14, flexShrink: 0 }} />}
                </SelectTrigger>
                {open && items.length > 0 && (
                    <DropdownPanel role="listbox">
                        {items.map((item, index) => (
                            <OptionItem
                                key={item.id}
                                role="option"
                                aria-selected={item.value === value}
                                selected={item.value === value}
                                tabIndex={0}
                                onClick={() => handleSelect(item.value)}
                                onKeyDown={(e: React.KeyboardEvent) => handleOptionKeyDown(e, index, item.value)}
                            >
                                {item.codedata && getConnectionIcon(item.codedata, item.iconUrl)}
                                <OptionLabel>{item.label}</OptionLabel>
                            </OptionItem>
                        ))}
                    </DropdownPanel>
                )}
            </Wrapper>
        </SelectContainer>
    );
};
