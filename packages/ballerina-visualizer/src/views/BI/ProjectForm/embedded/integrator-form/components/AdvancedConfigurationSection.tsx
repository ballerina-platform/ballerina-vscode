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

import React, { useCallback, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Codicon, TextField } from "@wso2/ui-toolkit";
import {
    Description,
    FieldGroup,
    Note,
    SubSectionDivider,
    SubSectionLabel,
    SignInHint,
    SignInHintButton
} from "../styles";
import { CollapsibleSection } from "./CollapsibleSection";
import { sanitizePackageName, sanitizeProjectHandle } from "../utils";
import { useSignIn } from "../hooks/useSignIn";

export interface ConfigurationData {
    packageName: string;
    orgName: string;
    version: string;
    projectHandle?: string;
}

export interface Organization {
    id?: number | string;
    handle: string;
    name: string;
}

export interface AdvancedConfigurationSectionProps {
    /** Whether the section is expanded */
    isExpanded: boolean;
    /** Callback when the section is toggled */
    onToggle: () => void;
    /** The advanced configuration data */
    data: ConfigurationData;
    /** Callback when the advanced configuration data changes */
    onChange: (data: Partial<ConfigurationData>) => void;
    /** Whether the package is a library */
    isLibrary?: boolean;
    /** Error message for org name validation */
    orgNameError?: string | null;
    /** Error message for package name validation */
    packageNameError?: string | null;
    /** Error message for project handle validation */
    projectHandleError?: string | null;
    /** Organizations list — when provided, renders a dropdown instead of a free-text field */
    organizations?: Organization[];
    /** Whether the section contains validation errors */
    hasError?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Absolutely-positioned suggestion list rendered below the text field. */
const SuggestionList = styled.ul`
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 1000;
    margin: 0;
    padding: 4px 0;
    list-style: none;
    background-color: var(--vscode-editor-background);
    border: 1px solid var(--vscode-list-dropBackground);
    max-height: 160px;
    overflow-y: auto;
`;

interface SuggestionItemProps {
    isActive: boolean;
}

const SuggestionItem = styled.li<SuggestionItemProps>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    cursor: pointer;
    font-size: var(--vscode-font-size);
    font-family: var(--vscode-font-family);
    color: var(--vscode-editor-foreground);
    background-color: ${({ isActive }: SuggestionItemProps) =>
        isActive ? "var(--vscode-editor-selectionBackground)" : "transparent"};
    /* Overflow is handled per-child: SuggestionName truncates, SuggestionHandle never wraps. */
    overflow: hidden;
`;

/**
 * Primary text within a suggestion row. Truncates with an ellipsis when the
 * container is too narrow; `min-width: 0` is required to allow flex shrinking
 * past the intrinsic text width.
 */
const SuggestionName = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
`;

/**
 * Secondary handle shown after the name — muted color and slightly smaller
 * font make it visually subordinate without hiding it entirely.
 */
const SuggestionHandle = styled.span`
    flex-shrink: 0;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
`;

/** Wrapper that establishes a stacking context so the suggestion list overlaps siblings. */
const OrgComboboxWrapper = styled.div`
    position: relative;
`;

export interface OrgFieldProps {
    organizations?: Organization[];
    orgName: string;
    orgNameError?: string | null;
    description: string;
    isSigningIn: boolean;
    onOrgChange: (value: string) => void;
    onSignIn: () => void;
    onCancelSignIn: () => void;
}

export function OrgField({ organizations, orgName, orgNameError, description, isSigningIn, onOrgChange, onSignIn, onCancelSignIn }: OrgFieldProps) {
    const hasOrgs = organizations !== undefined && organizations.length > 0;

    // Track which suggestion is keyboard-highlighted (index into filteredSuggestions).
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    // Whether the suggestion list is visible.
    const [isOpen, setIsOpen] = useState(false);
    const listRef = useRef<HTMLUListElement>(null);

    /** Suggestions filtered by the current input value against both handle and name. */
    const filteredSuggestions = hasOrgs
        ? (organizations as Organization[]).filter((org) => {
              const query = orgName.toLowerCase();
              return (
                  org.handle.toLowerCase().includes(query) ||
                  org.name.toLowerCase().includes(query)
              );
          })
        : [];

    const openList = useCallback(() => {
        if (hasOrgs) {
            setIsOpen(true);
        }
    }, [hasOrgs]);

    const closeList = useCallback(() => {
        setIsOpen(false);
        setActiveIndex(-1);
    }, []);

    const handleTextChange = useCallback(
        (value: string) => {
            onOrgChange(value);
            setActiveIndex(-1);
            // Show the list whenever the user is typing and there are candidates.
            setIsOpen(hasOrgs);
        },
        [onOrgChange, hasOrgs]
    );

    const handleSelectSuggestion = useCallback(
        (handle: string) => {
            onOrgChange(handle);
            closeList();
        },
        [onOrgChange, closeList]
    );

    /**
     * Keyboard navigation: ArrowDown/ArrowUp move through suggestions, Enter
     * confirms, Escape dismisses without changing value.
     */
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (!isOpen || filteredSuggestions.length === 0) {
                return;
            }
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setActiveIndex((prev) =>
                        prev < filteredSuggestions.length - 1 ? prev + 1 : 0
                    );
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    setActiveIndex((prev) =>
                        prev > 0 ? prev - 1 : filteredSuggestions.length - 1
                    );
                    break;
                case "Enter":
                    if (activeIndex >= 0 && activeIndex < filteredSuggestions.length) {
                        e.preventDefault();
                        handleSelectSuggestion(filteredSuggestions[activeIndex].handle);
                    }
                    break;
                case "Escape":
                    closeList();
                    break;
                default:
                    break;
            }
        },
        [isOpen, filteredSuggestions, activeIndex, handleSelectSuggestion, closeList]
    );

    return (
        <>
            <OrgComboboxWrapper>
                <TextField
                    onTextChange={handleTextChange}
                    value={orgName}
                    label="Organization Name"
                    errorMsg={orgNameError || undefined}
                    onFocus={openList}
                    onBlur={closeList}
                    onKeyDown={handleKeyDown}
                />
                {isOpen && filteredSuggestions.length > 0 && (
                    <SuggestionList ref={listRef} role="listbox" aria-label="Organization suggestions">
                        {filteredSuggestions.map((org, index) => (
                            <SuggestionItem
                                key={org.handle}
                                role="option"
                                aria-selected={index === activeIndex}
                                isActive={index === activeIndex}
                                // Use onMouseDown instead of onClick so the event fires before
                                // the TextField's onBlur, which would close the list first.
                                onMouseDown={(e: React.MouseEvent) => {
                                    e.preventDefault();
                                    handleSelectSuggestion(org.handle);
                                }}
                            >
                                <Codicon
                                    name="organization"
                                    iconSx={{ fontSize: "13px", color: "var(--vscode-descriptionForeground)" }}
                                    sx={{ display: "flex", flexShrink: 0 }}
                                />
                                <SuggestionName>{org.name}</SuggestionName>
                                <SuggestionHandle>&middot;&nbsp;{org.handle}</SuggestionHandle>
                            </SuggestionItem>
                        ))}
                    </SuggestionList>
                )}
            </OrgComboboxWrapper>
            <Description>{description}</Description>
            {!hasOrgs && (
                <SignInHint>
                    <Codicon
                        name="account"
                        iconSx={{ color: "var(--vscode-descriptionForeground)" }}
                        sx={{ display: "flex" }}
                    />
                    <span>Sign in to pick from your organizations —</span>
                    <SignInHintButton type="button" onClick={isSigningIn ? onCancelSignIn : onSignIn}>
                        {isSigningIn ? (
                            <>
                                <Codicon
                                    name="loading"
                                    iconSx={{ fontSize: "11px", animation: "codicon-spin 1.5s steps(30) infinite" }}
                                />
                                Signing in...
                                <Codicon
                                    name="close"
                                    iconSx={{ fontSize: "10px" }}
                                />
                            </>
                        ) : (
                            "Sign In"
                        )}
                    </SignInHintButton>
                </SignInHint>
            )}
        </>
    );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function AdvancedConfigurationSection({
    isExpanded,
    onToggle,
    data,
    onChange,
    isLibrary,
    orgNameError,
    packageNameError,
    projectHandleError,
    organizations,
    hasError
}: AdvancedConfigurationSectionProps) {
    const { isSigningIn, handleSignIn, handleCancelSignIn } = useSignIn();

    const createWithinProject = data.projectHandle !== undefined;

    return (
        <CollapsibleSection
            isExpanded={isExpanded}
            onToggle={onToggle}
            icon="gear"
            title="Advanced Configurations"
            hasError={hasError}
        >
            {createWithinProject && (
                <>
                    <SubSectionLabel>Project</SubSectionLabel>
                    <FieldGroup>
                        <OrgField
                            organizations={organizations}
                            orgName={data.orgName}
                            orgNameError={orgNameError}
                            description="The organization that owns this project."
                            isSigningIn={isSigningIn}
                            onOrgChange={(value) => onChange({ orgName: value })}
                            onSignIn={handleSignIn}
                            onCancelSignIn={handleCancelSignIn}
                        />
                    </FieldGroup>
                    <FieldGroup>
                        <TextField
                            onTextChange={(value) => onChange({ projectHandle: sanitizeProjectHandle(value, { trimTrailing: false }) })}
                            value={data.projectHandle}
                            label="Project ID"
                            errorMsg={projectHandleError || undefined}
                        />
                        <Description>Unique identifier for your project in various contexts.</Description>
                    </FieldGroup>
                    <SubSectionDivider />
                </>
            )}
            <SubSectionLabel>Ballerina Package</SubSectionLabel>
            <Note style={{ marginBottom: "16px" }}>
                {createWithinProject
                    ? `This ${isLibrary ? "library" : "integration"} is generated as a Ballerina package. Specify the package name and version to be assigned.`
                    : `This ${isLibrary ? "library" : "integration"} is generated as a Ballerina package. Specify the organization, package name and version to be assigned.`}
            </Note>
            <FieldGroup>
                <TextField
                    onTextChange={(value) => onChange({ packageName: sanitizePackageName(value) })}
                    value={data.packageName}
                    label="Package Name"
                    errorMsg={packageNameError || undefined}
                />
                <Description>Specify the package name.</Description>
            </FieldGroup>
            {!createWithinProject && (
                <FieldGroup>
                    <OrgField
                        organizations={organizations}
                        orgName={data.orgName}
                        orgNameError={orgNameError}
                        description="The organization that owns this package."
                        isSigningIn={isSigningIn}
                        onOrgChange={(value) => onChange({ orgName: value })}
                        onSignIn={handleSignIn}
                        onCancelSignIn={handleCancelSignIn}
                    />
                </FieldGroup>
            )}
            <FieldGroup>
                <TextField
                    onTextChange={(value) => onChange({ version: value })}
                    value={data.version}
                    label="Package Version"
                    placeholder="0.1.0"
                />
                <Description>Version of the package.</Description>
            </FieldGroup>
        </CollapsibleSection>
    );
}
