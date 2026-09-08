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
import { TopologyTriggerNode } from "./types";
import { TriggerGlyph } from "../nodes/TriggerNode/TriggerNodeWidget";

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 232px;
    max-height: 45vh;
    overflow-y: auto;
    padding: 6px;
    border-radius: 6px;
    background-color: ${ThemeColors.SURFACE};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    font-family: "GilmerRegular";
    color: ${ThemeColors.ON_SURFACE};
`;

const Heading = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 2px 6px 6px;
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const IconButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    /* Rows already turn SURFACE_CONTAINER on hover, so the button needs a brighter step of its own. */
    &:hover {
        background-color: ${ThemeColors.SURFACE_BRIGHT};
        color: ${ThemeColors.PRIMARY};
    }
    &:focus-visible {
        outline: 2px solid ${ThemeColors.HIGHLIGHT};
        outline-offset: 1px;
    }
`;

// Collapsed: one small chip that names the pinned flow, or just opens the list.
const Chip = styled.div<{ pinned: boolean }>`
    display: flex;
    align-items: center;
    gap: 2px;
    height: 28px;
    padding: 0 4px 0 8px;
    border-radius: 6px;
    background-color: ${(props) => (props.pinned ? ThemeColors.PRIMARY_CONTAINER : ThemeColors.SURFACE)};
    border: 1px solid ${(props) => (props.pinned ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT)};
    font-family: "GilmerMedium";
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE};
`;

const ChipLabel = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    &:focus-visible {
        outline: 2px solid ${ThemeColors.HIGHLIGHT};
        outline-offset: 1px;
    }
`;

// A row is a shell around the pin button and its trailing shortcuts, so the buttons never nest.
const RowShell = styled.div<{ pinned: boolean }>`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 2px;
    padding-right: 4px;
    border: 1px solid ${(props) => (props.pinned ? ThemeColors.PRIMARY : "transparent")};
    border-radius: 4px;
    background-color: ${(props) => (props.pinned ? ThemeColors.PRIMARY_CONTAINER : "transparent")};
    &:hover {
        background-color: ${ThemeColors.SURFACE_CONTAINER};
    }
    & > [data-open] {
        opacity: 0;
    }
    &:hover > [data-open],
    &:focus-within > [data-open] {
        opacity: 1;
    }
`;

const RowButton = styled.button`
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 5px 6px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    &:focus-visible {
        outline: 2px solid ${ThemeColors.HIGHLIGHT};
        outline-offset: -2px;
    }
`;

const Labels = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
`;

const Label = styled.span`
    font-family: "GilmerMedium";
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const SubLabel = styled.span`
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

// Codicons sit high in their line box next to Gilmer text; a flex wrapper centres the glyph on the row.
const ICON_BOX = { width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" };
const codicon = (name: string, size = 14) => <Icon name={name} isCodicon={true} sx={{ ...ICON_BOX, fontSize: size }} iconSx={{ fontSize: size, lineHeight: 1 }} />;
// The "View Agent" glyph the agent call node uses to jump to an instance.
const openGlyph = <Icon name="bi-function-flow" sx={{ ...ICON_BOX, fontSize: 16 }} iconSx={{ fontSize: 16, lineHeight: 1, display: "flex" }} />;

export interface FlowListProps {
    triggers: TopologyTriggerNode[];
    pinnedId?: string;
    open: boolean;
    onToggle: (open: boolean) => void;
    onPreview: (id?: string) => void;
    onPin: (id: string) => void;
    onOpen: (trigger: TopologyTriggerNode) => void;
}

// The package's entry points, folded into a chip until asked for. Hovering a row previews its flow, clicking pins it
// (and fits the canvas to it) and folds the list back to the chip, which then names the flow and clears it with ✕.
// An "Open flow" shortcut on each row (and on the pinned chip) does what clicking the trigger square does.
export function FlowList({ triggers, pinnedId, open, onToggle, onPreview, onPin, onOpen }: FlowListProps) {
    const pinned = triggers.find((trigger) => trigger.id === pinnedId);
    const openButton = (trigger: TopologyTriggerNode) => (
        <IconButton type="button" data-open title="Open flow" aria-label={`Open ${trigger.label1}`} onClick={() => onOpen(trigger)}>
            {openGlyph}
        </IconButton>
    );
    if (!open) {
        return (
            <Chip pinned={Boolean(pinned)}>
                <ChipLabel type="button" aria-expanded={false} title="Show entry points" onClick={() => onToggle(true)}>
                    {pinned ? <TriggerGlyph glyphType={pinned.glyphType} icon={pinned.icon} size={14} /> : codicon("list-unordered")}
                    <span>{pinned ? pinned.label1 : "Entry points"}</span>
                    {codicon("chevron-down", 12)}
                </ChipLabel>
                {pinned && openButton(pinned)}
                {pinned && (
                    <IconButton type="button" title="Clear the pinned flow" aria-label="Clear the pinned flow" onClick={() => onPin(pinned.id)}>
                        {codicon("close")}
                    </IconButton>
                )}
            </Chip>
        );
    }
    // Arrows move between rows; Enter pins (the button's click); Cmd/Ctrl+Enter opens the flow.
    const onRowKey = (trigger: TopologyTriggerNode) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onOpen(trigger);
            return;
        }
        const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
        if (!step) {
            return;
        }
        event.preventDefault();
        const rows = [...(event.currentTarget.closest("[role='listbox']")?.querySelectorAll("button[aria-pressed]") ?? [])] as HTMLButtonElement[];
        rows[(rows.indexOf(event.currentTarget) + step + rows.length) % rows.length]?.focus();
    };
    return (
        <Container role="listbox" aria-label="Entry points">
            <Heading>
                Entry points
                <IconButton type="button" title="Hide entry points" aria-label="Hide entry points" onClick={() => onToggle(false)}>
                    {codicon("chevron-up", 12)}
                </IconButton>
            </Heading>
            {triggers.map((trigger) => {
                const isPinned = trigger.id === pinnedId;
                return (
                    <RowShell key={trigger.id} pinned={isPinned} onMouseEnter={() => onPreview(trigger.id)} onMouseLeave={() => onPreview(undefined)}>
                        <RowButton
                            type="button"
                            aria-pressed={isPinned}
                            title={isPinned ? "Clear the pinned flow" : "Pin this flow"}
                            onFocus={() => onPreview(trigger.id)}
                            onBlur={() => onPreview(undefined)}
                            onKeyDown={onRowKey(trigger)}
                            onClick={() => onPin(trigger.id)}
                        >
                            <TriggerGlyph glyphType={trigger.glyphType} icon={trigger.icon} size={16} />
                            <Labels>
                                <Label>{trigger.label1}</Label>
                                {trigger.label2 && <SubLabel>{trigger.label2}</SubLabel>}
                            </Labels>
                        </RowButton>
                        {openButton(trigger)}
                        {isPinned && (
                            <IconButton type="button" title="Clear the pinned flow" aria-label="Clear the pinned flow" onClick={() => onPin(trigger.id)}>
                                {codicon("close")}
                            </IconButton>
                        )}
                    </RowShell>
                );
            })}
        </Container>
    );
}
