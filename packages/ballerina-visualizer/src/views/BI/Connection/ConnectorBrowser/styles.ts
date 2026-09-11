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

export const CONTENT_HEIGHT = "calc(100vh - 56px)";

const CONTENT_INSET = 16;
const SCROLLBAR_WIDTH = 10;

export const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: ${CONTENT_HEIGHT};
`;

export const HeaderArea = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: ${CONTENT_INSET}px ${CONTENT_INSET}px 12px;
    flex-shrink: 0;
`;

export const ScrollArea = styled.div`
    flex: 1;
    overflow-y: auto;
    scrollbar-gutter: stable;
    padding: 0 ${CONTENT_INSET - SCROLLBAR_WIDTH}px ${CONTENT_INSET}px ${CONTENT_INSET}px;
    &::-webkit-scrollbar {
        width: ${SCROLLBAR_WIDTH}px;
    }
    &::-webkit-scrollbar-track {
        background: transparent;
    }
    &::-webkit-scrollbar-thumb {
        background: transparent;
        border-radius: 5px;
        border: 3px solid transparent;
        background-clip: content-box;
    }
    &:hover::-webkit-scrollbar-thumb {
        background: ${ThemeColors.OUTLINE_VARIANT};
        background-clip: content-box;
    }
`;

export const Tag = styled.div`
    flex-shrink: 0;
    padding: 1px 8px;
    border-radius: 4px;
    font-size: 10px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

export const Row = styled.button`
    display: grid;
    align-items: start;
    width: 100%;
    box-sizing: border-box;
    padding: 12px;
    background: transparent;
    color: ${ThemeColors.ON_SURFACE};
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:hover,
    &[data-active="true"] {
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
    }

    &:focus-visible {
        outline: 1px solid ${ThemeColors.PRIMARY};
        outline-offset: -1px;
    }
`;

type RowIconProps = { box: number; icon: number; offset?: number };

export const RowIcon = styled.div<RowIconProps>`
    position: relative;
    width: ${({ box }: RowIconProps) => box}px;
    height: ${({ box }: RowIconProps) => box}px;
    margin-top: ${({ offset = 0 }: RowIconProps) => offset}px;
    display: flex;
    align-items: center;
    justify-content: center;

    & > *:not(.action-badge) {
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        font-size: ${({ icon }: RowIconProps) => icon}px !important;
    }

    & > *:not(.action-badge) svg,
    & > *:not(.action-badge) img,
    & > svg,
    & > img {
        width: ${({ icon }: RowIconProps) => icon}px !important;
        height: ${({ icon }: RowIconProps) => icon}px !important;
        object-fit: contain;
    }
`;

export const RowText = styled.div`
    min-width: 0;
`;

export const RowLabel = styled.div`
    font-size: 13px;
    font-weight: 500;
    color: ${ThemeColors.ON_SURFACE};
`;

export const RowDescription = styled.div`
    font-size: 12px;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
`;

export const RowChevron = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 2px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    opacity: 0.7;
`;

export const EmptyState = styled.div`
    padding: 24px 16px;
    font-size: 13px;
    text-align: center;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;
