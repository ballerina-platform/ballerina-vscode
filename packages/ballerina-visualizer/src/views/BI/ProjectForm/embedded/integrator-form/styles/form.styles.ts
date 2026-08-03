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

export const ProjectSectionContainer = styled.div`
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 20px;
    transition: border-color 0.2s ease;

    &:focus-within {
        border-color: var(--vscode-focusBorder);
    }
`;

export const ProjectSectionLabel = styled.div`
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: var(--vscode-descriptionForeground);
    padding: 7px 12px;
    background: var(--vscode-sideBar-background);
    border-bottom: 1px solid var(--vscode-panel-border);
`;

export const ProjectFieldCollapse = styled.div<{ isVisible: boolean }>`
    max-height: ${({ isVisible }: { isVisible: boolean }) => (isVisible ? "200px" : "0")};
    opacity: ${({ isVisible }: { isVisible: boolean }) => (isVisible ? 1 : 0)};
    overflow: hidden;
    transition: max-height 0.25s ease, opacity 0.2s ease;
    padding: ${({ isVisible }: { isVisible: boolean }) => (isVisible ? "12px 12px 12px 12px" : "0 12px")};
`;

export const SkipOptionRow = styled.div`
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--vscode-panel-border);
    padding: 10px 12px;
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

export const ProjectSection = styled.div`
    margin-bottom: 24px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--vscode-panel-border);
`;

// ========== Page Layout Styles ==========

export const PageWrapper = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    max-height: 100vh;
    box-sizing: border-box;
    overflow: hidden;
`;

export const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
    max-width: 800px;
    width: 100%;
    margin: 0 auto;
`;

export const TitleContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 32px;
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
    overflow: ${(props: { isExpanded: boolean }) => props.isExpanded ? 'visible' : 'hidden'};
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
    max-height: ${(props: { isExpanded: boolean }) => props.isExpanded ? '2000px' : '0'};
    opacity: ${(props: { isExpanded: boolean }) => props.isExpanded ? 1 : 0};
    overflow: ${(props: { isExpanded: boolean }) => props.isExpanded ? 'visible' : 'hidden'};
    transition: max-height 0.3s ease, opacity 0.2s ease;
    padding: ${(props: { isExpanded: boolean }) => props.isExpanded ? '16px' : '0 16px'};
    border-top: ${(props: { isExpanded: boolean }) => props.isExpanded ? '1px solid var(--vscode-panel-border)' : 'none'};
`;

// ========== Radio Button / Project Type Styles ==========

export const ProjectTypeContainer = styled.div`
    margin-top: 16px;
    margin-bottom: 8px;
`;

export const ProjectTypeLabel = styled.div`
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-foreground);
    margin-bottom: 12px;
`;

export const RadioGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

export const RadioOption = styled.label<{ isSelected: boolean }>`
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid ${(props: { isSelected: boolean }) =>
        props.isSelected ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)'};
    background-color: ${(props: { isSelected: boolean }) =>
        props.isSelected ? 'var(--vscode-list-hoverBackground)' : 'transparent'};
    transition: all 0.15s ease;

    &:hover {
        border-color: var(--vscode-focusBorder);
        background-color: var(--vscode-list-hoverBackground);
    }
`;

export const RadioInput = styled.input`
    appearance: none;
    width: 16px;
    height: 16px;
    border: 1px solid var(--vscode-checkbox-border);
    border-radius: 50%;
    background: var(--vscode-checkbox-background);
    cursor: pointer;
    margin-top: 2px;
    flex-shrink: 0;
    position: relative;

    &:checked {
        border-color: var(--vscode-focusBorder);
        background: var(--vscode-focusBorder);
    }

    &:checked::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--vscode-checkbox-background);
    }
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

export const Note = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 12px;
    padding: 8px 10px;
    background-color: var(--vscode-textBlockQuote-background);
    border-left: 3px solid var(--vscode-textBlockQuote-border);
    border-radius: 0 4px 4px 0;
`;

export const ResolvedPathText = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 6px;
    word-break: break-all;
`;

// ========== Cloud Duplicate Error Action Row ==========

export const CloudErrorActionRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
`;

export const ActionLink = styled.button`
    padding: 0;
    background: none;
    border: none;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    white-space: nowrap;

    &:hover {
        color: var(--vscode-textLink-activeForeground);
        text-decoration: underline;
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

export const ActionSeparator = styled.span`
    color: var(--vscode-descriptionForeground);
`;

export const SubSectionLabel = styled.div`
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 12px;
`;

export const SubSectionDivider = styled.div`
    height: 1px;
    background: var(--vscode-panel-border);
    margin: 16px 0;
`;

export const SignInHint = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

export const SignInHintButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0;
    background: none;
    border: none;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    white-space: nowrap;

    &:hover:not(:disabled) {
        color: var(--vscode-textLink-activeForeground);
        text-decoration: underline;
    }

    &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;
