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

import styled from "@emotion/styled";

// ========== Form Layout Styles ==========

export const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

export const CheckboxContainer = styled.div`
    margin: 12px 0;
`;

export const Description = styled.div`
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    margin-top: 4px;
    text-align: left;
`;

export const SectionDivider = styled.div`
    height: 1px;
    background: var(--vscode-panel-border);
    margin: 24px 0 20px 0;
`;

export const OptionalSectionsLabel = styled.div`
    font-size: 11px;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 12px;
`;

// ---- Grouped form sections (titled blocks) ----

export const FormSection = styled.div`
    margin-bottom: 28px;

    &:last-child {
        margin-bottom: 0;
    }
`;

export const FormSectionHeader = styled.div`
    margin-bottom: 16px;
`;

export const FormSectionTitle = styled.div`
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

export const FormSectionCaption = styled.div`
    font-size: 12px;
    line-height: 1.5;
    color: var(--vscode-descriptionForeground);
    margin-top: 4px;
`;

// A subtle toggle row that visually reads as a transition between sections.
export const InlineToggle = styled.div`
    margin-top: 8px;
    padding: 14px 16px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    background-color: var(--vscode-sideBar-background);
`;

// ========== Page Layout Styles ==========

export const PageWrapper = styled.div`
    display: flex;
    flex-direction: column;
    max-height: 100vh;
    padding: 40px 120px;
    box-sizing: border-box;
    overflow: hidden;
`;

export const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
    max-width: 600px;
    overflow: hidden;
`;

export const TitleContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 24px;
    flex-shrink: 0;
`;

export const ScrollableContent = styled.div`
    flex: 1;
    overflow-y: auto;
    padding-right: 8px;
    min-height: 0;
`;

export const ButtonWrapper = styled.div`
    margin-top: 20px;
    padding-top: 16px;
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
`;

export const IconButton = styled.div`
    cursor: pointer;
    border-radius: 4px;
    width: 20px;
    height: 20px;
    font-size: 20px;
    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
    }
`;

// ========== Collapsible Section Styles ==========

export const CollapsibleSectionWrapper = styled.div<{ isExpanded: boolean }>`
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    margin-bottom: 12px;
    overflow: hidden;
    transition: border-color 0.2s ease;

    &:hover {
        border-color: var(--vscode-focusBorder);
    }
`;

export const CollapsibleHeader = styled.div<{ isExpanded: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    cursor: pointer;
    user-select: none;
    background-color: ${(props: { isExpanded: boolean }) => props.isExpanded 
        ? 'var(--vscode-sideBar-background)' 
        : 'transparent'};
    transition: background-color 0.2s ease;

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
`;

export const HeaderLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

export const HeaderTitle = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-foreground);
`;

export const HeaderSubtitle = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-left: 4px;
`;

export const ChevronIcon = styled.div<{ isExpanded: boolean }>`
    display: flex;
    align-items: center;
    transition: transform 0.2s ease;
    transform: ${(props: { isExpanded: boolean }) => props.isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};
    color: var(--vscode-descriptionForeground);
`;

export const CollapsibleContent = styled.div<{ isExpanded: boolean }>`
    max-height: ${(props: { isExpanded: boolean }) => props.isExpanded ? '500px' : '0'};
    opacity: ${(props: { isExpanded: boolean }) => props.isExpanded ? 1 : 0};
    overflow: hidden;
    transition: max-height 0.3s ease, opacity 0.2s ease;
    padding: ${(props: { isExpanded: boolean }) => props.isExpanded ? '16px' : '0 16px'};
    border-top: ${(props: { isExpanded: boolean }) => props.isExpanded ? '1px solid var(--vscode-panel-border)' : 'none'};
`;

// ========== Radio Button / Project Type Styles ==========

export const ProjectTypeContainer = styled.div`
    margin-top: 8px;
    margin-bottom: 24px;
`;

export const ProjectTypeLabel = styled.div`
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-foreground);
    margin-bottom: 12px;
`;

export const RadioGroup = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 10px;
`;

export const RadioOption = styled.label<{ isSelected: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid ${(props: { isSelected: boolean }) =>
        props.isSelected ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)'};
    background-color: ${(props: { isSelected: boolean }) =>
        props.isSelected ? 'color-mix(in srgb, var(--vscode-focusBorder) 8%, transparent)' : 'transparent'};
    transition: border-color 0.15s ease, background-color 0.15s ease;

    &:hover {
        border-color: var(--vscode-focusBorder);
        background-color: ${(props: { isSelected: boolean }) =>
            props.isSelected
                ? 'color-mix(in srgb, var(--vscode-focusBorder) 10%, transparent)'
                : 'var(--vscode-list-hoverBackground)'};
    }
`;

/** The radio input itself is visually hidden — selection is conveyed by the
 *  option card's border/background. It stays in the DOM for keyboard and form
 *  semantics; radio-group focus always lands on the selected card, so its blue
 *  border doubles as the focus indicator (no separate outline needed). */
export const RadioInput = styled.input`
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    padding: 0;
    opacity: 0;
    pointer-events: none;
`;

/** Rounded icon badge that fronts each option. */
export const RadioIcon = styled.div`
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--vscode-focusBorder) 14%, transparent);
    color: var(--vscode-foreground);
`;

export const RadioContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

export const RadioTitle = styled.span`
    font-size: 13px;
    color: var(--vscode-foreground);
`;

export const RadioDescription = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.4;
`;

export const SubSectionLabel = styled.div`
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 12px;
`;

export const SubSectionDivider = styled.div`
    height: 1px;
    background: var(--vscode-panel-border);
    margin: 16px 0;
`;

export const Note = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 12px;
    padding: 8px 10px;
    background-color: var(--vscode-textBlockQuote-background);
    border-left: 3px solid var(--vscode-textBlockQuote-border);
    border-radius: 0 4px 4px 0;
`;
