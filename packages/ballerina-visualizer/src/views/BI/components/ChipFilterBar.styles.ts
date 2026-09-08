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
    /* Size to the chips' own content instead of claiming a flex:1 share of the
       bar — with a fixed-width search box that left a dead gap between the
       last chip and the search box. Still shrinks (with its own horizontal
       scroll) before it ever pushes the search box below its min-width. */
    flex: 0 1 auto;
    min-width: 0;
    overflow-x: auto;
    /* Keep chips on a single scrollable line. */
    flex-wrap: nowrap;
`;

/** Holds the search box, which grows to fill whatever space the chip row
 *  doesn't need — so it visibly tracks the bar's width instead of sitting at
 *  a fixed size — capped by a max-width so it never sprawls on a wide bar.
 *  margin-left: auto claims any space left over once it hits that cap, so
 *  the search box stays pinned to the right edge while the chip row (or
 *  nothing, in library mode) stays put on the left. */
export const SearchSlot = styled.div`
    flex: 1 1 auto;
    min-width: 160px;
    max-width: 320px;
    margin-left: auto;
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
