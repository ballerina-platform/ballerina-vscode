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

import React from "react";
import styled from "@emotion/styled";
import { Icon, ThemeColors } from "@wso2/ui-toolkit";
import { FindRow } from "./findRows";
import { MethodPill, rowGlyph } from "./FindPanel";

const Banner = styled.div<{ isolated: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 6px 0 12px;
    border-radius: 6px;
    background-color: ${ThemeColors.SURFACE};
    border: 1px solid ${(props) => (props.isolated ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT)};
    font-family: "GilmerRegular";
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE};
    white-space: nowrap;
`;

const Mode = styled.span`
    font-family: "GilmerMedium";
`;

const Dot = styled.span`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const Name = styled.span`
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 220px;
    font-family: var(--vscode-editor-font-family);
    & > span {
        overflow: hidden;
        text-overflow: ellipsis;
    }
`;

const Actions = styled.span`
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 4px;
`;

const TextButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-family: "GilmerMedium";
    font-size: 12px;
    cursor: pointer;
    &:hover {
        background-color: ${ThemeColors.SURFACE_CONTAINER};
        border-color: ${ThemeColors.PRIMARY};
        color: ${ThemeColors.PRIMARY};
    }
    &:focus-visible {
        outline: 2px solid ${ThemeColors.HIGHLIGHT};
        outline-offset: 1px;
    }
`;

const Kbd = styled.kbd`
    font-family: var(--vscode-editor-font-family);
    font-size: 10px;
    line-height: 16px;
    padding: 0 4px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 3px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const ICON_BOX = { width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" };
const codicon = (name: string) => <Icon name={name} isCodicon={true} sx={{ ...ICON_BOX, fontSize: 14 }} iconSx={{ fontSize: 14, lineHeight: 1 }} />;

export interface PinBannerProps {
    row: FindRow;
    isolated: boolean;
    onIsolate: () => void;
    onExitIsolation: () => void;
    onUnpin: () => void;
}

// Top-centre while something is pinned: says what is pinned and offers Isolate; once isolated, says so and offers
// the way out. Neither mode is left by clicking the canvas, only from here or with Esc.
export function PinBanner({ row, isolated, onIsolate, onExitIsolation, onUnpin }: PinBannerProps) {
    return (
        <Banner role="status" isolated={isolated}>
            {codicon(isolated ? "eye" : "pinned")}
            <Mode>{isolated ? "Isolated view" : "Pinned"}</Mode>
            <Dot>·</Dot>
            <Name>
                {rowGlyph(row, 14)}
                {row.accessor && <MethodPill method={row.accessor}>{row.accessor}</MethodPill>}
                <span>{row.label}</span>
            </Name>
            <Actions>
                {isolated ? (
                    <TextButton type="button" title="Show the whole canvas again" onClick={onExitIsolation}>
                        Exit isolated view
                        <Kbd>esc</Kbd>
                    </TextButton>
                ) : (
                    <>
                        <TextButton type="button" title="Show only this flow and hide everything else" onClick={onIsolate}>
                            Isolate
                        </TextButton>
                        <TextButton type="button" title="Clear the pin and fit the whole canvas" onClick={onUnpin}>
                            Unpin
                            <Kbd>esc</Kbd>
                        </TextButton>
                    </>
                )}
            </Actions>
        </Banner>
    );
}
