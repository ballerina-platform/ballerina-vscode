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
import { SearchBox, ThemeColors } from "@wso2/ui-toolkit";

export const HintText = styled.div`
    margin-top: 2px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    line-height: 1.5;
`;

export const MonospaceHint = styled(HintText)`
    margin-top: 8px;
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    word-break: break-all;
`;

export const SectionLabel = styled.div`
    color: var(--vscode-foreground);
    font-size: 13px;
    font-weight: 600;
`;

export const FormSection = styled.div`
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    margin-top: 16px;
`;

export const cardBox = `
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    display: flex;
    gap: 16px;
    padding: 16px;
    color: var(--vscode-foreground);
    border-radius: 8px;
`;

export const StatusRow = styled.div`
    ${cardBox}
    align-items: flex-start;
    border: 1px solid var(--vscode-panel-border);
`;

export const TemplateIconTile = styled.div<{ selected?: boolean; size?: number }>`
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: ${(props: { size?: number }) => props.size ?? 36}px;
    height: ${(props: { size?: number }) => props.size ?? 36}px;
    border-radius: 8px;
    color: ${(props: { selected?: boolean }) => props.selected
        ? 'var(--vscode-button-foreground)'
        : 'var(--vscode-descriptionForeground)'};
    background: ${(props: { selected?: boolean }) => props.selected
        ? 'var(--vscode-button-background)'
        : 'var(--vscode-editor-inactiveSelectionBackground)'};
    transition: background-color 0.15s ease, color 0.15s ease;
`;

export const GrowingContent = styled.div`
    min-width: 0;
    flex: 1;
`;

export const TitleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
`;

export const Badge = styled.span`
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    border-radius: 4px;
    background: ${ThemeColors.SURFACE_CONTAINER};
    font-size: 11px;
    font-weight: 500;
    line-height: 1.3;
    white-space: nowrap;
`;

export const NoticeBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
    margin-top: 12px;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    background-color: var(--vscode-editorWidget-background);
`;

export const NoticeTitle = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--vscode-foreground);
    font-size: 13px;
    font-weight: 500;
`;

export const ModalControls = styled.div`
    padding: 16px 20px;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

export const TemplateSearch = styled(SearchBox)`
    width: 100%;
`;

export const TemplateFilters = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 16px;
`;

export const TemplateFilter = styled.button<{ active: boolean }>`
    height: 28px;
    padding: 0 12px;
    color: ${(props: { active: boolean }) => props.active ? ThemeColors.ON_PRIMARY : ThemeColors.ON_SURFACE_VARIANT};
    border: 1px solid ${(props: { active: boolean }) => props.active ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    background: ${(props: { active: boolean }) => props.active ? ThemeColors.PRIMARY : 'transparent'};
    font-family: inherit;
    font-size: 12px;
    font-weight: ${(props: { active: boolean }) => props.active ? 600 : 400};
    cursor: pointer;

    &:hover {
        color: ${(props: { active: boolean }) => props.active ? ThemeColors.ON_PRIMARY : ThemeColors.ON_SURFACE};
        border-color: ${(props: { active: boolean }) => props.active ? ThemeColors.PRIMARY : ThemeColors.OUTLINE};
        background: ${(props: { active: boolean }) => props.active ? ThemeColors.PRIMARY : ThemeColors.SURFACE_CONTAINER};
    }
`;

export const TemplateResultsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    @media (max-width: 700px) {
        grid-template-columns: 1fr;
    }
`;

export const TemplateOption = styled.button<{ selected: boolean }>`
    display: flex;
    align-items: stretch;
    gap: 12px;
    padding: 16px;
    text-align: left;
    font-family: inherit;
    color: ${ThemeColors.ON_SURFACE};
    background: ${(props: { selected: boolean }) => props.selected
        ? `color-mix(in srgb, var(--vscode-button-background) 12%, ${ThemeColors.SURFACE_DIM})`
        : ThemeColors.SURFACE_DIM};
    border: 1px solid ${(props: { selected: boolean }) => props.selected
        ? 'var(--vscode-button-background)'
        : ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;

    &:hover, &:focus-visible {
        border-color: var(--vscode-button-background);
        background: ${(props: { selected: boolean }) => props.selected
        ? `color-mix(in srgb, var(--vscode-button-background) 16%, ${ThemeColors.SURFACE_DIM})`
        : `color-mix(in srgb, var(--vscode-button-background) 7%, ${ThemeColors.SURFACE_DIM})`};
        outline: none;
    }
`;

export const TemplateOptionContent = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
`;

export const TemplateOptionHeading = styled(TitleRow)`
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
`;

export const TemplateOptionDescription = styled(HintText)`
    margin-top: 6px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    line-height: 1.5;
`;

export const TemplateTags = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
    padding-top: 4px;
`;

export const EmptyTemplates = styled.div`
    display: grid;
    min-height: 240px;
    place-items: center;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    text-align: center;
`;
