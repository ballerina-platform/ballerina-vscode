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
import { ThemeColors } from "@wso2/ui-toolkit";

// Shared "category chips + compact search" building blocks, used by both the
// Add-Artifact component list panel and the Create wizard's Integration Type
// step so the two screens read as one consistent filtering pattern.

/** Sticky bar housing a scrollable row of category chips plus a search box.
 *  Callers wrap this with their own padding (the two call sites differ
 *  slightly), everything else is shared. */
export const FilterBarBase = styled.div`
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    background-color: var(--vscode-editor-background);
`;

export const ChipRow = styled.div`
    display: flex;
    gap: 6px;
    /* Take the row, leaving the compact search box pinned to the right. */
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    /* Keep chips on a single scrollable line. */
    flex-wrap: nowrap;
`;

/** Holds the search box on the right of the chip row — narrow and de-emphasized
 *  so it doesn't compete with surrounding fields. */
export const SearchSlot = styled.div`
    flex-shrink: 0;
    width: 220px;
`;

export const Chip = styled.button<{ active?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 5px 12px;
    border-radius: 999px;
    /* One neutral accent for every chip — the active (filter) chip gets the
       primary color; others stay muted, matching the selected-card styling
       used elsewhere in the wizard. */
    border: 1px solid ${(props: { active?: boolean }) => (props.active ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT)};
    background-color: ${(props: { active?: boolean }) => (props.active ? ThemeColors.PRIMARY_CONTAINER : "transparent")};
    color: ${(props: { active?: boolean }) => (props.active ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE)};
    font-size: 12px;
    font-weight: ${(props: { active?: boolean }) => (props.active ? 600 : 500)};
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;
    &:hover {
        background-color: ${(props: { active?: boolean }) => (props.active ? ThemeColors.PRIMARY_CONTAINER : ThemeColors.SURFACE_DIM)};
        border-color: ${ThemeColors.PRIMARY};
    }
    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 1px;
    }
`;
