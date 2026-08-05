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
import { Typography, ThemeColors, SearchBox, Button } from "@wso2/ui-toolkit";

export const PopupContent = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
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

export const SectionTitle = styled(Typography)<{ $compactTypography?: boolean }>`
    font-size: ${(props: { $compactTypography?: boolean }) => props.$compactTypography ? "13px" : "14px"};
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

export const CreateConnectorOptions = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

export const ConnectorOptionCard = styled.div`
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

export const ConnectorOptionIcon = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    flex-shrink: 0;
`;

export const ConnectorOptionContent = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

export const ConnectorOptionTitleContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: space-between;
`;

export const ConnectorOptionTitle = styled(Typography)`
    font-size: 14px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

export const ConnectorOptionDescription = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin: 0;
`;

export const ConnectorOptionButtons = styled.div`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
`;

export const ConnectorTypeLabel = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    padding: 6px;
    border-radius: 4px;
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    margin: 0;
    display: inline-block;
`;

export const ArrowIcon = styled.div`
    display: flex;
    align-items: center;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

export const SectionHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
`;

export const FilterButtons = styled.div`
    display: flex;
    gap: 4px;
    align-items: center;
`;

export const FilterButton = styled.button<{ active?: boolean; $compactTypography?: boolean }>`
    font-size: ${(props: { $compactTypography?: boolean }) => props.$compactTypography ? "13px" : "12px"};
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

export const ConnectorsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
    margin-top: 8px;
`;

export const BackButton = styled(Button)`
    min-width: auto;
    padding: 4px;
`;

export const StepperContainer = styled.div`
    padding: 24px 32px;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

export const ConnectorDetailCard = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
    transition: all 0.2s ease;
    opacity: ${(props: { disabled?: boolean }) => (props.disabled ? 0.5 : 1)};
`;
