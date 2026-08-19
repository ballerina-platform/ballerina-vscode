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

import { useCallback, useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { ProjectStructureArtifactResponse } from "@wso2/ballerina-core";
import { Codicon, Icon, Popover, SearchBox, ThemeColors } from "@wso2/ui-toolkit";

const AGENT_ACCENT = "var(--vscode-button-background)";
const ICON_SIZE = 18;

const Strip = styled.div`
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    min-width: 0;
    background-color: var(--vscode-editorWidget-background);
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const SCROLL_BUTTON_WIDTH = 36;
const FADE_WIDTH = 32;

const ScrollArea = styled.div`
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
`;

const ScrollButton = styled.button<{ $side: "left" | "right" }>`
    position: absolute;
    top: 0;
    bottom: 0;
    ${(props: { $side: "left" | "right" }) => (props.$side === "left" ? "left: 0;" : "right: 0;")}
    display: flex;
    align-items: center;
    justify-content: center;
    width: ${SCROLL_BUTTON_WIDTH}px;
    padding: 0;
    border: none;
    cursor: pointer;
    z-index: 1;
    color: var(--vscode-foreground);
    background-color: var(--vscode-editorWidget-background);

    &:hover {
        color: var(--vscode-foreground);
        box-shadow: inset 0 0 0 999px var(--vscode-list-hoverBackground);
    }
`;

const FadeEdge = styled.div<{ $side: "left" | "right" }>`
    position: absolute;
    top: 0;
    bottom: 0;
    ${(props: { $side: "left" | "right" }) =>
        props.$side === "left"
            ? `left: ${SCROLL_BUTTON_WIDTH}px;`
            : `right: ${SCROLL_BUTTON_WIDTH}px;`}
    width: ${FADE_WIDTH}px;
    pointer-events: none;
    background: linear-gradient(
        to ${(props: { $side: "left" | "right" }) => (props.$side === "left" ? "left" : "right")},
        transparent,
        var(--vscode-editorWidget-background)
    );
`;

const TabList = styled.div`
    display: flex;
    align-items: stretch;
    flex: 1;
    min-width: 0;
    gap: 2px;
    padding: 0 8px;
    overflow-x: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar {
        display: none;
    }
`;

const Tab = styled.button<{ active: boolean }>`
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 40px;
    max-width: 220px;
    border: none;
    background: none;
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
    font-size: 13px;
    color: ${(props: { active: boolean }) =>
        props.active ? "var(--vscode-foreground)" : "var(--vscode-descriptionForeground)"};
    box-shadow: ${(props: { active: boolean }) =>
        props.active ? `inset 0 -2px 0 0 ${AGENT_ACCENT}` : "none"};
    transition: color 120ms ease, background-color 120ms ease;

    &:hover {
        color: var(--vscode-foreground);
        background-color: var(--vscode-toolbar-hoverBackground);
    }
`;

const TabLabel = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
`;

const AddTab = styled(Tab)`
    color: var(--vscode-foreground);
    gap: 6px;
    padding: 0 12px 0 10px;
    border-left: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const PickerButton = styled(Tab)`
    color: var(--vscode-foreground);
    padding: 0 14px;
    border-left: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const PickerPanel = styled.div`
    display: flex;
    flex-direction: column;
    width: 280px;
    max-height: 320px;
    padding: 8px;
    gap: 6px;
    border-radius: 8px;
    background: ${ThemeColors.SURFACE_DIM};
    color: var(--vscode-foreground);
`;

const PickerList = styled.div`
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    min-height: 0;
    scrollbar-width: thin;

    &::-webkit-scrollbar {
        width: 8px;
    }

    &::-webkit-scrollbar-thumb {
        border-radius: 4px;
        background: var(--vscode-scrollbarSlider-background);
    }

    &::-webkit-scrollbar-thumb:hover {
        background: var(--vscode-scrollbarSlider-hoverBackground);
    }
`;

const PickerRow = styled.button<{ active: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    font-size: 13px;
    background: ${(props: { active: boolean }) =>
        props.active ? "var(--vscode-list-activeSelectionBackground)" : "transparent"};
    color: ${(props: { active: boolean }) =>
        props.active ? "var(--vscode-list-activeSelectionForeground)" : "var(--vscode-foreground)"};

    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

const PickerLabel = styled.span`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const PickerEmpty = styled.div`
    padding: 8px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const GLYPH_SX = { fontSize: ICON_SIZE, width: ICON_SIZE, height: ICON_SIZE };
const GLYPH_ICON_SX = { fontSize: ICON_SIZE, color: "inherit" };
const ACTION_ICON_SX = { fontSize: 16, color: "inherit" };

export function agentKey(agent: ProjectStructureArtifactResponse): string {
    return `${agent.path}::${agent.position?.startLine ?? 0}`;
}

function AgentGlyph() {
    return <Icon name="bi-ai-agent" sx={GLYPH_SX} iconSx={GLYPH_ICON_SX} />;
}

function ScrollEdge({ side, onScroll }: { side: "left" | "right"; onScroll: () => void }) {
    const label = `Scroll tabs ${side}`;
    return (
        <>
            <FadeEdge $side={side} />
            <ScrollButton $side={side} onClick={onScroll} title={label} aria-label={label}>
                <Codicon name={side === "left" ? "chevron-left" : "chevron-right"} iconSx={ACTION_ICON_SX} />
            </ScrollButton>
        </>
    );
}

interface AgentTabsProps {
    agents: ProjectStructureArtifactResponse[];
    selectedKey: string;
    onSelect: (agent: ProjectStructureArtifactResponse) => void;
    onAdd: () => void;
}

export function AgentTabs({ agents, selectedKey, onSelect, onAdd }: AgentTabsProps) {
    const activeRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [fade, setFade] = useState({ start: false, end: false });
    const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
    const [pickerQuery, setPickerQuery] = useState("");

    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [selectedKey]);

    const syncFade = useCallback(() => {
        const list = listRef.current;
        if (!list) {
            return;
        }
        const max = list.scrollWidth - list.clientWidth;
        setFade({ start: list.scrollLeft > 1, end: list.scrollLeft < max - 1 });
    }, []);

    useEffect(() => {
        const list = listRef.current;
        if (!list) {
            return;
        }
        const onWheel = (event: WheelEvent) => {
            if (list.scrollWidth <= list.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
                return;
            }
            event.preventDefault();
            list.scrollLeft += event.deltaY;
        };
        list.addEventListener("wheel", onWheel, { passive: false });

        const observer = new ResizeObserver(syncFade);
        observer.observe(list);
        syncFade();

        return () => {
            list.removeEventListener("wheel", onWheel);
            observer.disconnect();
        };
    }, [syncFade]);

    useEffect(syncFade, [agents, selectedKey, syncFade]);

    const scrollByPage = (direction: -1 | 1) => {
        const list = listRef.current;
        if (list) {
            list.scrollBy({ left: direction * list.clientWidth * 0.8, behavior: "smooth" });
        }
    };

    const overflowing = fade.start || fade.end;
    const query = pickerQuery.trim().toLowerCase();
    const matches = query ? agents.filter((agent) => agent.name.toLowerCase().includes(query)) : agents;

    const closePicker = () => {
        setPickerAnchor(null);
        setPickerQuery("");
    };

    return (
        <Strip>
            <ScrollArea>
                <TabList ref={listRef} onScroll={syncFade}>
                    {agents.map((agent) => {
                        const key = agentKey(agent);
                        const active = key === selectedKey;
                        return (
                            <Tab
                                key={key}
                                ref={active ? activeRef : undefined}
                                active={active}
                                onClick={() => onSelect(agent)}
                                title={agent.name}
                            >
                                <AgentGlyph />
                                <TabLabel>{agent.name}</TabLabel>
                            </Tab>
                        );
                    })}
                </TabList>
                {fade.start && <ScrollEdge side="left" onScroll={() => scrollByPage(-1)} />}
                {fade.end && <ScrollEdge side="right" onScroll={() => scrollByPage(1)} />}
            </ScrollArea>
            {overflowing && (
                <PickerButton
                    active={false}
                    onClick={(event) => setPickerAnchor(event.currentTarget)}
                    title="Find an agent"
                    aria-label="Find an agent"
                >
                    <Codicon name="search" iconSx={{ fontSize: 16, color: "inherit" }} />
                </PickerButton>
            )}
            <Popover
                open={Boolean(pickerAnchor)}
                anchorEl={pickerAnchor}
                handleClose={closePicker}
                sx={{
                    padding: 0,
                    borderRadius: 8,
                    overflow: "hidden",
                    backgroundColor: ThemeColors.SURFACE_DIM,
                }}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
                <PickerPanel>
                    <SearchBox
                        value={pickerQuery}
                        placeholder="Search agents"
                        iconPosition="start"
                        autoFocus
                        onChange={setPickerQuery}
                        sx={{ width: "100%" }}
                    />
                    <PickerList>
                        {matches.map((agent) => {
                            const key = agentKey(agent);
                            return (
                                <PickerRow
                                    key={key}
                                    active={key === selectedKey}
                                    onClick={() => {
                                        onSelect(agent);
                                        closePicker();
                                    }}
                                    title={agent.name}
                                >
                                    <AgentGlyph />
                                    <PickerLabel>{agent.name}</PickerLabel>
                                    {key === selectedKey && <Codicon name="check" iconSx={{ fontSize: 14 }} />}
                                </PickerRow>
                            );
                        })}
                        {matches.length === 0 && <PickerEmpty>No agent matches “{pickerQuery}”.</PickerEmpty>}
                    </PickerList>
                </PickerPanel>
            </Popover>
            <AddTab active={false} onClick={onAdd} title="Add an agent to this project">
                <Icon name="bi-plus" sx={GLYPH_SX} iconSx={GLYPH_ICON_SX} />
                <TabLabel>Add Agent</TabLabel>
            </AddTab>
        </Strip>
    );
}
