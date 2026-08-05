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
import { Button, Typography, ThemeColors, SearchBox } from "@wso2/ui-toolkit";

export const PopupContent = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

export const FormContainer = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 16px 20px 0;
`;

export const LoaderWrapper = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
`;

export const EmptyState = styled.div`
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 16px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
`;

export const Footer = styled.div`
    padding: 16px 20px;
    display: flex;
    justify-content: center;
    align-items: center;
`;

export const FooterButton = styled(Button)`
    width: 100% !important;
    min-width: 0 !important;
    display: flex !important;
    justify-content: center;
    align-items: center;
`;

export const IntroText = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    line-height: 1.5;
    margin: 0;
`;

export const SearchContainer = styled.div`
    width: 100%;
`;

export const StyledSearchBox = styled(SearchBox)`
    width: 100%;
`;

export const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

// Pre-built agents section: fills the remaining popup height so the loader / empty state center vertically.
export const ResultsSection = styled(Section)`
    flex: 1;
`;

export const SectionTitle = styled(Typography)`
    font-size: 14px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

export const SectionHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    gap: 12px;
`;

export const SectionHeaderRight = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

export const CreateAgentOptions = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

export const AgentOptionCard = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
        border-color: ${ThemeColors.PRIMARY};
    }
`;

export const AgentOptionIcon = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    flex-shrink: 0;
`;

export const AgentOptionContent = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

export const AgentOptionTitle = styled(Typography)`
    font-size: 14px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

export const AgentOptionDescription = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin: 0;
`;

export const ArrowIcon = styled.div`
    display: flex;
    align-items: center;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

export const FilterButtons = styled.div`
    display: flex;
    gap: 4px;
    align-items: center;
`;

export const FilterButton = styled.button<{ active?: boolean }>`
    font-size: 12px;
    padding: 6px 12px;
    height: 28px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: ${(props: { active?: boolean }) => (props.active ? 600 : 400)};
    background-color: ${(props: { active?: boolean }) =>
        props.active ? ThemeColors.PRIMARY : "transparent"};
    color: ${(props: { active?: boolean }) =>
        props.active ? ThemeColors.ON_PRIMARY : ThemeColors.ON_SURFACE_VARIANT};
    transition: all 0.2s ease;

    &:hover {
        background-color: ${(props: { active?: boolean }) =>
        props.active ? ThemeColors.PRIMARY : ThemeColors.SURFACE_CONTAINER};
        color: ${(props: { active?: boolean }) =>
        props.active ? ThemeColors.ON_PRIMARY : ThemeColors.ON_SURFACE};
    }
`;

export const AgentsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    margin-top: 8px;
`;

