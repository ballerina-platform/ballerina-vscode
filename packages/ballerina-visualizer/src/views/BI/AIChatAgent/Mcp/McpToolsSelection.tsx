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

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { Button, CheckBox, ThemeColors, SearchBox, Codicon, Divider, Typography, Dropdown, Tooltip, Icon } from "@wso2/ui-toolkit";
import type { OptionProps } from "@wso2/ui-toolkit";

export interface McpTool {
    name: string;
    description?: string;
}

export type ToolScopes = Record<string, string[]>;

// Utility function to clean up error messages
const formatErrorMessage = (error: string): string => {
    if (!error) return error;

    // Check if it's an HTML response (GitHub 404, etc.)
    if (error.includes('<!DOCTYPE') || error.includes('<html>')) {
        // Try to extract meaningful info from HTML
        const httpMatch = error.match(/HTTP (\d+):/i);
        if (httpMatch) {
            const statusCode = httpMatch[1];
            if (statusCode === '404') {
                return 'Server URL not found (404). Please check the URL and try again.';
            }
            if (statusCode === '422') {
                return 'Invalid request (422). The server URL may not be a valid MCP server.';
            }
            return `Server returned HTTP ${statusCode}. Please check the URL and try again.`;
        }
        return 'The server returned an HTML page instead of MCP tools. Please verify the URL is correct.';
    }

    // Truncate very long error messages
    if (error.length > 500) {
        return error.substring(0, 500) + '...';
    }

    return error;
};

interface McpToolsSelectionProps {
    tools: McpTool[];
    selectedTools: Set<string>;
    loading: boolean;
    error: string;
    onToolSelectionChange: (toolName: string, isSelected: boolean) => void;
    onSelectAll: () => void;
    serviceUrl?: string;
    showValidationError?: boolean;
    toolsInclude?: string;
    onToolsIncludeChange?: (value: string) => void;
    showDiscoverButton?: boolean;
    onDiscoverClick?: () => void;
    toolSource?: 'auto-fetched' | 'manual-discovery' | 'saved-mock' | null;
    resolutionError?: string;
    onRetryFetch?: () => void;
    toolScopes?: ToolScopes;
    onToolScopesChange?: (toolName: string, scopes: string[]) => void;
}

interface ToolsListProps {
    tools: McpTool[];
    selectedTools: Set<string>;
    loading: boolean;
    onToolSelectionChange: (toolName: string, isSelected: boolean) => void;
    searchQuery?: string;
    maxHeight?: string;
    toolScopes?: ToolScopes;
    onToolScopesChange?: (toolName: string, scopes: string[]) => void;
}

export const ToolsContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    width: 100%;
`;
export const ToolsHeader = styled.div<{ padding?: string }>`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: ${(props: { padding?: string }) => props.padding || '12px 12px 6px 12px'};
`;
export const ToolsTitle = styled.div`
    font-size: 14px;
    font-family: GilmerBold;
    margin-bottom: 2px;
    color: ${ThemeColors.ON_SURFACE};
`;
const ToolCheckboxContainer = styled.div<{ maxHeight?: string }>`
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: ${(props: { maxHeight?: string }) => props.maxHeight || '200px'};
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 0 12px 12px;
`;
const ToolCheckboxItem = styled.div<{ disabled?: boolean }>`
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 0;
    padding-right: 12px;
    cursor: ${(props: { disabled?: boolean }) => props.disabled ? 'default' : 'pointer'};
`;
export const ErrorMessage = styled.div<{ padding?: string; maxHeight?: string }>`
    color: ${ThemeColors.ERROR};
    font-size: 12px;
    padding: ${(props: { padding?: string }) => props.padding || '0 0 4px 12px'};
    ${(props: { maxHeight?: string }) => props.maxHeight ? `max-height: ${props.maxHeight}; overflow-y: auto;` : ''}
    word-break: break-word;
    white-space: pre-wrap;
`;
const WarningMessage = styled.div`
    color: ${ThemeColors.HIGHLIGHT};
    font-size: 12px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 6px;
`;
export const LoadingMessage = styled.div<{ padding?: string }>`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 12px;
    display: flex;
    align-items: center;
    padding: ${(props: { padding?: string }) => props.padding || '0 0 12px 12px'};
    gap: 8px;
`;
export const InlineSpinner = styled.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid ${ThemeColors.ON_SURFACE_VARIANT};
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const ToolDescription = styled.div<{ expanded: boolean }>`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: ${(props: { expanded: boolean }) => props.expanded ? 'unset' : '2'};
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const ReadMoreButton = styled.button`
    background: none;
    border: none;
    color: ${ThemeColors.PRIMARY};
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    margin-top: 4px;
    text-decoration: underline;
    &:hover {
        color: ${ThemeColors.PRIMARY};
        opacity: 0.8;
    }
    &:focus {
        outline: none;
    }
`;

export const InfoMessage = styled.div<{ padding?: string }>`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 12px;
    padding: ${(props: { padding?: string }) => props.padding || '0 12px'};
`;

const ScopeContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 12px 8px 44px;
`;

const ScopeTagsRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
`;

const ScopeTag = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE};
`;

const ScopeRemoveButton = styled.button`
    background: none;
    border: none;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    &:hover {
        color: ${ThemeColors.ERROR};
    }
`;

const ScopeInput = styled.input`
    background: transparent;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE};
    outline: none;
    min-width: 100px;
    width: auto;
    &:focus {
        border-color: ${ThemeColors.PRIMARY};
    }
    &::placeholder {
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    }
`;

const ScopeKeyButton = styled.button<{ hasScopes?: boolean }>`
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    position: relative;
    flex-shrink: 0;
    align-self: center;
    color: ${(props: { hasScopes?: boolean }) => props.hasScopes ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE_VARIANT};
    &:hover {
        background-color: ${ThemeColors.SURFACE_CONTAINER};
    }
`;

const ScopeBadge = styled.span`
    position: absolute;
    top: 0;
    right: 0;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: ${ThemeColors.PRIMARY};
`;

const ScopeTagInput: React.FC<{
    scopes: string[];
    onChange: (scopes: string[]) => void;
}> = ({ scopes, onChange }) => {
    const [inputValue, setInputValue] = useState('');

    const addScope = () => {
        const trimmed = inputValue.trim();
        if (trimmed && !scopes.includes(trimmed)) {
            onChange([...scopes, trimmed]);
        }
        setInputValue('');
    };

    const removeScope = (index: number) => {
        onChange(scopes.filter((_, i) => i !== index));
    };

    return (
        <ScopeContainer onClick={(e) => e.stopPropagation()}>
            <ScopeTagsRow>
                {scopes.map((scope, index) => (
                    <ScopeTag key={`${scope}-${index}`}>
                        {scope}
                        <ScopeRemoveButton onClick={() => removeScope(index)} aria-label={`Remove ${scope}`}>
                            <Codicon name="close" sx={{ fontSize: 10 }} />
                        </ScopeRemoveButton>
                    </ScopeTag>
                ))}
                <ScopeInput
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addScope();
                        }
                    }}
                    onBlur={addScope}
                    placeholder="Add scope..."
                />
            </ScopeTagsRow>
        </ScopeContainer>
    );
};

// Shared Modal Components
export const ModalContainer = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 30000;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: color-mix(in srgb, ${ThemeColors.SECONDARY_CONTAINER} 70%, transparent);
    font-family: GilmerRegular;
`;

export const ModalBox = styled.div<{ maxHeight?: string }>`
    width: 650px;
    max-height: ${(props: { maxHeight?: string }) => props.maxHeight || '80vh'};
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 16px;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
    box-shadow: 0 3px 8px rgb(0 0 0 / 0.2);
    z-index: 30001;
`;

export const ModalHeaderSection = styled.header`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-inline: 16px;
    margin-bottom: 8px;
`;

export const ModalContent = styled.div<{ marginTop?: string; padding?: string }>`
    flex: 1;
    overflow-y: auto;
    padding: ${(props: { padding?: string }) => props.padding || '0 16px'};
    ${(props: { marginTop?: string }) => props.marginTop ? `margin-top: ${props.marginTop};` : ''}
`;

export const SearchContainer = styled.div<{ padding?: string }>`
    padding: ${(props: { padding?: string }) => props.padding || '12px 16px'};
`;

const ExpandButton = styled.button`
    background: none;
    border: none;
    color: ${ThemeColors.ON_SURFACE};
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    &:hover {
        background-color: ${ThemeColors.SURFACE_CONTAINER};
    }
`;

const ToolItem: React.FC<{ tool: McpTool }> = ({ tool }) => {
    const [expanded, setExpanded] = useState(false);
    const [needsExpansion, setNeedsExpansion] = useState(false);
    const descriptionRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (descriptionRef.current && tool.description) {
            const lineHeight = 1.4;
            const fontSize = 12;
            const maxLines = 2;
            const maxHeight = fontSize * lineHeight * maxLines;
            setNeedsExpansion(descriptionRef.current.scrollHeight > maxHeight + 2);
        }
    }, [tool.description]);

    return (
        <div>
            <ToolsTitle>{tool.name}</ToolsTitle>
            {tool.description && (
                <div>
                    <ToolDescription ref={descriptionRef} expanded={expanded}>
                        {tool.description}
                    </ToolDescription>
                    {needsExpansion && (
                        <ReadMoreButton onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(!expanded);
                        }}>
                            {expanded ? 'Read less' : 'Read more'}
                        </ReadMoreButton>
                    )}
                </div>
            )}
        </div>
    );
};

// Reusable Tools List Component
const ToolsList: React.FC<ToolsListProps> = ({
    tools,
    selectedTools,
    loading,
    onToolSelectionChange,
    searchQuery = '',
    maxHeight = '200px',
    toolScopes,
    onToolScopesChange
}) => {
    const [expandedScopeTool, setExpandedScopeTool] = useState<string | null>(null);

    const filteredTools = useMemo(() => {
        if (!searchQuery.trim()) {
            return tools;
        }
        const query = searchQuery.toLowerCase();
        return tools.filter(tool =>
            tool.name.toLowerCase().includes(query) ||
            tool.description?.toLowerCase().includes(query)
        );
    }, [tools, searchQuery]);

    return (
        <ToolCheckboxContainer maxHeight={maxHeight}>
            {filteredTools.map((tool) => {
                const isSelected = selectedTools.has(tool.name);
                const scopes = toolScopes?.[tool.name] || [];
                const hasScopes = scopes.length > 0;
                const isScopeExpanded = expandedScopeTool === tool.name;

                return (
                    <div key={tool.name}>
                        <ToolCheckboxItem
                            disabled={loading}
                            onClick={() => !loading && onToolSelectionChange(tool.name, !isSelected)}
                        >
                            <CheckBox
                                label=""
                                checked={isSelected}
                                disabled={loading}
                                onChange={() => { }}
                            >
                            </CheckBox>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <ToolItem tool={tool} />
                            </div>
                            {isSelected && onToolScopesChange && (
                                <div style={{ display: "flex", alignSelf: "center" }}>
                                    <ScopeKeyButton
                                        hasScopes={hasScopes}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedScopeTool(isScopeExpanded ? null : tool.name);
                                        }}
                                        aria-label="Configure scopes"
                                        title={hasScopes ? `Scopes: ${scopes.join(', ')}` : 'Configure scopes'}
                                    >
                                        <Icon name="bi-shield-lock" sx={{ fontSize: 18, width: 18, height: 18 }} />
                                        {hasScopes && <ScopeBadge />}
                                    </ScopeKeyButton>
                                </div>
                            )}
                        </ToolCheckboxItem>
                        {isSelected && isScopeExpanded && onToolScopesChange && (
                            <ScopeTagInput
                                scopes={scopes}
                                onChange={(newScopes) => onToolScopesChange(tool.name, newScopes)}
                            />
                        )}
                    </div>
                );
            })}
            {filteredTools.length === 0 && searchQuery.trim() && (
                <div style={{ color: ThemeColors.ON_SURFACE_VARIANT, fontSize: '12px', padding: '8px 0' }}>
                    No tools found matching &quot;{searchQuery}&quot;
                </div>
            )}
        </ToolCheckboxContainer>
    );
};

// Tools Selection Modal Component
const ToolsSelectionModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    tools: McpTool[];
    selectedTools: Set<string>;
    loading: boolean;
    onToolSelectionChange: (toolName: string, isSelected: boolean) => void;
    onSelectAll: () => void;
    showValidationError?: boolean;
    toolScopes?: ToolScopes;
    onToolScopesChange?: (toolName: string, scopes: string[]) => void;
}> = ({ isOpen, onClose, tools, selectedTools, loading, onToolSelectionChange, onSelectAll, showValidationError = false, toolScopes, onToolScopesChange }) => {
    const [searchQuery, setSearchQuery] = useState('');

    if (!isOpen) return null;

    return createPortal(
        <ModalContainer onClick={onClose}>
            <ModalBox onClick={(e) => e.stopPropagation()}>
                <ModalHeaderSection>
                    <Typography sx={{ margin: "10px 0" }}>
                        Select MCP Tools
                    </Typography>
                    <div onClick={onClose} style={{ cursor: 'pointer' }}>
                        <Codicon name="close" />
                    </div>
                </ModalHeaderSection>
                <Divider sx={{ margin: 0 }} />
                <SearchContainer>
                    <SearchBox
                        placeholder="Search tools..."
                        onChange={(val: string) => setSearchQuery(val)}
                        value={searchQuery}
                        iconPosition="end"
                        aria-label="search-tools"
                        sx={{ width: '100%' }}
                    />
                </SearchContainer>
                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {showValidationError && selectedTools.size === 0 ? (
                        <div style={{ fontSize: '14px', color: ThemeColors.HIGHLIGHT }}>
                            Select at least one tool to continue
                        </div>
                    ) : (
                        <div style={{ fontSize: '14px', color: ThemeColors.ON_SURFACE_VARIANT }}>
                            {selectedTools.size} of {tools.length} selected
                        </div>
                    )}
                    {tools.length > 0 && (
                        <Button
                            onClick={onSelectAll}
                            disabled={loading}
                        >
                            {selectedTools.size === tools.length ? "Deselect All" : "Select All"}
                        </Button>
                    )}
                </div>
                <ModalContent>
                    <ToolsList
                        tools={tools}
                        selectedTools={selectedTools}
                        loading={loading}
                        onToolSelectionChange={onToolSelectionChange}
                        searchQuery={searchQuery}
                        toolScopes={toolScopes}
                        onToolScopesChange={onToolScopesChange}
                        maxHeight="50vh"
                    />
                </ModalContent>
            </ModalBox>
        </ModalContainer>,
        document.body
    );
};

// Export shared components and utilities
export { ToolsList, formatErrorMessage };
export type { ToolsListProps };

export const McpToolsSelection: React.FC<McpToolsSelectionProps> = ({
    tools,
    selectedTools,
    loading,
    error,
    onToolSelectionChange,
    onSelectAll,
    serviceUrl,
    showValidationError = false,
    toolsInclude = "all",
    onToolsIncludeChange,
    showDiscoverButton = false,
    onDiscoverClick,
    resolutionError = "",
    toolSource = null,
    onRetryFetch,
    toolScopes,
    onToolScopesChange
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const formattedError = useMemo(() => formatErrorMessage(error), [error]);

    const toolsIncludeOptions: OptionProps[] = [
        { id: "all", content: "All", value: "all" },
        { id: "selected", content: "Selected", value: "selected" }
    ];

    useEffect(() => {
        if (toolsInclude === "all" && selectedTools.size > 0) {
            // Clear all selections
            selectedTools.forEach(toolName => {
                onToolSelectionChange(toolName, false);
            });
        }
    }, [toolsInclude, selectedTools, onToolSelectionChange]);

    return (
        <>
            <Dropdown
                id="tools-include-dropdown"
                label="Tools to Include"
                items={toolsIncludeOptions}
                value={toolsInclude}
                onValueChange={(value: string) => onToolsIncludeChange?.(value)}
                containerSx={{ width: "100%" }}
            />

            {toolsInclude === "selected" && (
                <ToolsContainer>
                    <ToolsHeader>
                        <ToolsTitle>Available Tools</ToolsTitle>
                        {tools.length > 0 && (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                {showDiscoverButton && (toolSource === 'saved-mock' || toolSource === 'manual-discovery') && (
                                    <ExpandButton
                                        onClick={onDiscoverClick}
                                        title="Discover Tools"
                                        aria-label="Discover tools"
                                    >
                                        <Icon name="bi-ai-search" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', width: 18, height: 18, fontSize: 18 }} />
                                    </ExpandButton>
                                )}
                                <ExpandButton
                                    onClick={() => setIsModalOpen(true)}
                                    title="Expand view"
                                    aria-label="Expand tools selection"
                                >
                                    <Icon name="bi-expand-modal" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', width: 18, height: 18, fontSize: 18 }} />
                                </ExpandButton>
                                <Button
                                    onClick={onSelectAll}
                                    disabled={loading}
                                >
                                    {selectedTools.size === tools.length ? "Deselect All" : "Select All"}
                                </Button>
                            </div>
                        )}
                    </ToolsHeader>
                    {loading && (
                        <LoadingMessage>
                            <InlineSpinner />
                            Loading tools from MCP server...
                        </LoadingMessage>
                    )}
                    {showDiscoverButton && toolSource !== 'saved-mock' && toolSource !== 'manual-discovery' && toolSource !== 'auto-fetched' && !error && (
                        <>
                            <InfoMessage style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                {resolutionError || "Tools cannot be loaded. Server URL or authentication configuration cannot be resolved."}
                            </InfoMessage>
                            <div style={{ padding: '0 12px 12px 12px', display: 'flex', alignItems: 'center' }}>
                                <Button
                                    onClick={onDiscoverClick}
                                >
                                    <Icon name="bi-ai-search" sx={{ marginRight: '6px', width: 16, height: 16, fontSize: 16 }} />
                                    Discover Tools
                                </Button>
                                <Icon tooltip="Manually connect to the MCP server to retrieve available tools." name="bi-info" sx={{ fontSize: 18, width: 18, height: 18, marginLeft: '6px', verticalAlign: 'middle', color: ThemeColors.ON_SURFACE_VARIANT }} />
                            </div>
                        </>
                    )}
                    {error && (
                        <>
                            <InfoMessage>
                                Unable to load tools from MCP server.
                            </InfoMessage>
                            <ErrorMessage maxHeight="100px">{formattedError}</ErrorMessage>
                            {onRetryFetch && (
                                <div style={{ padding: '0 12px 12px 12px', display: 'flex', alignItems: 'center' }}>
                                    <Button
                                        onClick={onRetryFetch}
                                        disabled={loading}
                                        appearance="secondary"
                                    >
                                        <Icon name="bi-retry" sx={{ marginRight: '6px', width: 16, height: 16, fontSize: 16 }} />
                                        Retry
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                    {resolutionError && toolSource === 'saved-mock' && !error && (
                        <InfoMessage style={{ color: ThemeColors.HIGHLIGHT, marginBottom: "6px" }}>
                            {resolutionError}. Using saved tool selections.
                        </InfoMessage>
                    )}
                    {!loading && tools.length > 0 && (!showDiscoverButton || toolSource === 'saved-mock' || toolSource === 'manual-discovery' || toolSource === 'auto-fetched') && (
                        <>
                            {showValidationError && selectedTools.size === 0 ? (
                                <WarningMessage style={{ marginBottom: "6px" }}>
                                    Select at least one tool to continue
                                </WarningMessage>
                            ) : (
                                <InfoMessage style={{ marginBottom: "6px" }}>
                                    {selectedTools.size} of {tools.length} selected
                                </InfoMessage>
                            )}
                            <ToolsList
                                tools={tools}
                                selectedTools={selectedTools}
                                loading={loading}
                                onToolSelectionChange={onToolSelectionChange}
                                toolScopes={toolScopes}
                                onToolScopesChange={onToolScopesChange}
                            />
                        </>
                    )}
                    {!loading && !error && !showDiscoverButton && tools.length === 0 && serviceUrl?.trim() && (
                        <InfoMessage style={{ marginBottom: "12px" }}>
                            No tools available from this MCP server
                        </InfoMessage>
                    )}
                    {!loading && !error && !showDiscoverButton && tools.length === 0 && !serviceUrl?.trim() && (
                        <InfoMessage style={{ marginBottom: "12px" }}>
                            Enter a server URL to view available tools
                        </InfoMessage>
                    )}
                </ToolsContainer>
            )}

            <ToolsSelectionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                tools={tools}
                selectedTools={selectedTools}
                loading={loading}
                onToolSelectionChange={onToolSelectionChange}
                onSelectAll={onSelectAll}
                showValidationError={showValidationError}
                toolScopes={toolScopes}
                onToolScopesChange={onToolScopesChange}
            />
        </>
    );
}; 
