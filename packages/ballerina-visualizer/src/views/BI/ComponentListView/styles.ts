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
import styled from "@emotion/styled";
import { Typography, ThemeColors } from "@wso2/ui-toolkit";
import { Chip, ChipRow, FilterBarBase, SearchSlot as SearchSlotBase } from "../components/ChipFilterBar.styles";

export const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 80vh;
    flex-direction: column;
`;

export const Container = styled.div({
    display: "flex",
    flexDirection: "column",
    gap: 10,
});

export const AddPanel = styled.div({
    position: "relative", // Add this line to position the close button absolutely
    display: "flex",
    flexDirection: "column",
    gap: 32,
    padding: 16,
});

// ── Filter bar (colored category chips + compact search), mirroring the Create
//    wizard's Integration Type step so the Add-Artifact screen reads the same.
//    Shared building blocks live in ChipFilterBar.styles.ts; only the bar's own
//    padding differs between the two call sites. ──

export const FilterBar = styled(FilterBarBase)`
    padding: 8px 16px 12px;
    /* Library mode omits ChipRow entirely (no categories to filter by) — without its
       flex:1 to push against, keep the search box pinned to the right on its own. */
    justify-content: flex-end;
`;

// Wider than the wizard's chip bar — this screen has more room to spare.
export const SearchSlot = styled(SearchSlotBase)`
    width: 420px;
`;

export { Chip, ChipRow };

export const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 0;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 13px;
`;

export const ClearSearchButton = styled.button`
    padding: 0;
    border: none;
    background: none;
    color: var(--vscode-textLink-foreground);
    font-size: 13px;
    cursor: pointer;
    &:hover {
        text-decoration: underline;
    }
`;

export const PanelViewMore = styled.div<{ disabled?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 10px;
    opacity: ${(props: { disabled: boolean }) => (props.disabled ? 0.5 : 1)};
    pointer-events: ${(props: { disabled: boolean }) => (props.disabled ? "none" : "auto")};
`;

export const CardGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
    width: 100%;
`;

export const Title = styled(Typography)`
    margin: 4px 0;
    font-size: 16px;
`;

export const Card = styled.div`
    border: 2px solid ${(props: { active: boolean }) => (props.active ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT)};
    background-color: ${(props: { active: boolean }) => (props.active ? ThemeColors.PRIMARY_CONTAINER : ThemeColors.SURFACE_DIM)};
    cursor: pointer;
    &:hover {
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
        border: 2px solid ${ThemeColors.PRIMARY};
    }
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    max-width: 42rem;
    padding: 16px;
    border-radius: 4px;
    cursor: pointer;
`;

export const TitleWrapper = styled.div`
    display: flex;
    flex-direction: column;
`;
