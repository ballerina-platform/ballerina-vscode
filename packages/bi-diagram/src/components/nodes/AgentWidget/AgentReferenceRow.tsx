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
/** @jsxImportSource @emotion/react */
import React from "react";
import styled from "@emotion/styled";
import { Icon, ThemeColors } from "@wso2/ui-toolkit";

const Divider = styled.div`
    width: 100%;
    height: 1px;
    background-color: ${ThemeColors.OUTLINE_VARIANT};
`;

const ReferenceRow = styled.div<{ noLabel: boolean }>`
    display: flex;
    align-items: center;
    justify-content: ${(props: { noLabel: boolean }) => (props.noLabel ? "flex-end" : "space-between")};
    gap: 8px;
    width: 100%;
    z-index: 2;
`;

const ReferenceName = styled.span`
    flex: 1;
    min-width: 0;
    padding-left: 4px;
    color: ${ThemeColors.ON_SURFACE};
    font-family: monospace;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const OpenAgentButton = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 6px 10px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 6px;
    color: ${ThemeColors.ON_SURFACE};
    font-family: "GilmerRegular";
    font-size: 12px;
    cursor: pointer;
    z-index: 2;
    transition: border-color 0.15s ease, background-color 0.15s ease;

    &:hover {
        border-color: ${ThemeColors.PRIMARY};
        background-color: ${ThemeColors.SURFACE_BRIGHT};
    }
`;

function ChipGlyph({ name, size = 14 }: { name: string; size?: number }) {
    return (
        <Icon
            name={name}
            sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size }}
            // The glyph's own box (not just its container) needs to be a flex item too, so the
            // font's own ascent/descent can't throw the icon off-center within it.
            iconSx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: size, fontSize: size, lineHeight: 1 }}
        />
    );
}

export type AgentReferenceRowProps = {
    // Text identifying the referenced agent, e.g. a call site's connection variable. Omit it
    // when the box title already names the agent, so the row just carries the open button.
    label?: string;
    buttonLabel?: string;
    clickable: boolean;
    onOpen: (event: React.SyntheticEvent) => void;
    onButtonHoverChange: (hovered: boolean) => void;
};

// Read-only agent metadata (model/tools/memory) lives in the property panel now; this row only opens the agent.
export function AgentReferenceRow({ label, buttonLabel = "Open Agent", clickable, onOpen, onButtonHoverChange }: AgentReferenceRowProps) {
    if (!label && !clickable) {
        return null;
    }
    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(event);
        }
    };
    return (
        <>
            <Divider />
            <ReferenceRow data-testid="agent-reference-row" noLabel={!label}>
                {label && <ReferenceName>{label}</ReferenceName>}
                {clickable && (
                    <OpenAgentButton
                        data-testid="open-agent-button"
                        role="button"
                        tabIndex={0}
                        title={buttonLabel}
                        onClick={onOpen}
                        onKeyDown={handleKeyDown}
                        onMouseEnter={() => onButtonHoverChange(true)}
                        onMouseLeave={() => onButtonHoverChange(false)}
                    >
                        {buttonLabel}
                        <ChipGlyph name="bi-arrow-outward" size={13} />
                    </OpenAgentButton>
                )}
            </ReferenceRow>
        </>
    );
}
