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

import React, { useMemo, useState } from "react";
import styled from "@emotion/styled";
import { Icon, ThemeColors } from "@wso2/ui-toolkit";
import { NodeIcon } from "@wso2/bi-diagram";
import { TriggerGlyph } from "./TriggerGlyph";
import { buildFindFacets, buildFindRows, FindFacet, FindRow } from "./findRows";
import { TopologyGraph } from "./types";
import { colors as methodColors } from "../nodes/EntryNode/components/styles";

// Same palette as the service node's own rows, so a method pill reads the same everywhere.
const DEFAULT_METHOD_COLOR = "#876036";
const methodColor = (accessor: string) => methodColors[accessor.toUpperCase() as keyof typeof methodColors] ?? DEFAULT_METHOD_COLOR;

const Panel = styled.div`
    display: flex;
    flex-direction: column;
    width: 352px;
    max-height: 60vh;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    font-family: "GilmerRegular";
    color: ${ThemeColors.ON_SURFACE};
    overflow: hidden;
`;

const Search = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 8px 12px;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const Input = styled.input`
    flex: 1;
    min-width: 0;
    padding: 4px 0;
    border: none;
    outline: none;
    background: transparent;
    color: ${ThemeColors.ON_SURFACE};
    font-family: "GilmerRegular";
    font-size: 13px;
    &::placeholder {
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    }
`;

const Facets = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 8px 10px;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const Facet = styled.button<{ active: boolean }>`
    display: flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid ${(props) => (props.active ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT)};
    background-color: ${(props) => (props.active ? ThemeColors.PRIMARY_CONTAINER : "transparent")};
    color: ${(props) => (props.active ? ThemeColors.ON_SURFACE : ThemeColors.ON_SURFACE_VARIANT)};
    font-family: "GilmerMedium";
    font-size: 11px;
    cursor: pointer;
    &:hover {
        border-color: ${(props) => (props.active ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE_VARIANT)};
        color: ${ThemeColors.ON_SURFACE};
    }
    &:focus-visible {
        outline: 2px solid ${ThemeColors.HIGHLIGHT};
        outline-offset: 1px;
    }
`;

const FacetCount = styled.span`
    font-family: var(--vscode-editor-font-family);
    font-size: 10.5px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const FacetDivider = styled.span`
    width: 1px;
    height: 16px;
    margin: 0 2px;
    background-color: ${ThemeColors.OUTLINE_VARIANT};
`;

const Results = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px;
`;

const GroupHeading = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 8px 4px;
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const Count = styled.span`
    font-family: var(--vscode-editor-font-family);
`;

const Empty = styled.div`
    padding: 22px 12px;
    text-align: center;
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const Hint = styled.div`
    display: flex;
    gap: 12px;
    padding: 7px 12px;
    border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const Kbd = styled.kbd`
    font-family: var(--vscode-editor-font-family);
    font-size: 10px;
    line-height: 16px;
    padding: 0 4px;
    margin-right: 4px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 3px;
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
    &[aria-pressed="true"] {
        color: ${ThemeColors.PRIMARY};
        background-color: ${ThemeColors.SURFACE_CONTAINER};
    }
    &:focus-visible {
        outline: 2px solid ${ThemeColors.HIGHLIGHT};
        outline-offset: 1px;
    }
`;

// Collapsed: one small chip that names the pinned story, or just opens the panel.
const Chip = styled.div<{ pinned: boolean }>`
    display: flex;
    align-items: center;
    gap: 4px;
    height: 32px;
    padding: 0 6px 0 12px;
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
    gap: 4px;
    height: 100%;
    max-width: 260px;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    & > span {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
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
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    font-family: "GilmerMedium";
    font-size: 12px;
`;

const LabelText = styled.span`
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    & mark {
        background: transparent;
        color: ${ThemeColors.PRIMARY};
    }
`;

export const MethodPill = styled.span<{ method: string }>`
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 9.5px;
    letter-spacing: 0.04em;
    color: #fff;
    background-color: ${(props) => methodColor(props.method)};
    border-radius: 3px;
    padding: 1px 5px;
    flex: none;
`;

const SubLabel = styled.span<{ via?: boolean }>`
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    color: ${(props) => (props.via ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE_VARIANT)};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    & mark {
        background: transparent;
        color: inherit;
        font-weight: 600;
    }
`;

// Codicons sit high in their line box next to Gilmer text; a flex wrapper centres the glyph on the row.
const ICON_BOX = { width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" };
const codicon = (name: string, size = 14) => <Icon name={name} isCodicon={true} sx={{ ...ICON_BOX, fontSize: size }} iconSx={{ fontSize: size, lineHeight: 1 }} />;
// The "View Agent" glyph the agent call node uses to jump to an instance.
const openGlyph = <Icon name="bi-arrow-outward" sx={{ ...ICON_BOX, fontSize: 16 }} iconSx={{ fontSize: 16, lineHeight: 1, display: "flex" }} />;

export function rowGlyph(row: FindRow, size: number) {
    if (row.entry) {
        return <TriggerGlyph glyphType={row.entry.glyphType} icon={row.entry.icon} size={size} />;
    }
    const kind = row.agent?.kind;
    return <NodeIcon type={kind === "workflow" ? "WORKFLOW_RUN" : kind === "durable" ? "DURABLE_AGENT_RUN" : "AGENT"} size={size} />;
}

// The matched run of the text in a <mark>, so the row says why it is in the list.
function highlight(text: string, query: string): React.ReactNode {
    const needle = query.trim().toLowerCase();
    const at = needle ? text.toLowerCase().indexOf(needle) : -1;
    if (at < 0) {
        return text;
    }
    return (
        <>
            {text.slice(0, at)}
            <mark>{text.slice(at, at + needle.length)}</mark>
            {text.slice(at + needle.length)}
        </>
    );
}

export interface FindPanelProps {
    graph: TopologyGraph;
    pinnedId?: string;
    open: boolean;
    onToggle: (open: boolean) => void;
    onPreview: (id?: string) => void;
    onPreviewFacet: (facet?: FindFacet) => void;
    onPin: (id: string) => void;
    onOpen: (row: FindRow) => void;
}

// Arrows move between rows; Enter pins (the button's click); Cmd/Ctrl+Enter opens; Esc folds the panel.
function rowKeyHandler(open: () => void, close: () => void) {
    return (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Escape") {
            event.stopPropagation();
            close();
            return;
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            open();
            return;
        }
        const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
        if (!step) {
            return;
        }
        event.preventDefault();
        const dialog = event.currentTarget.closest("[role='dialog']");
        const rows = [...(dialog?.querySelectorAll("[role='listbox'] button[aria-pressed]") ?? [])] as HTMLButtonElement[];
        const index = rows.indexOf(event.currentTarget) + step;
        if (index < 0) {
            (dialog?.querySelector("input") as HTMLInputElement | null)?.focus();
            return;
        }
        rows[index % rows.length]?.focus();
    };
}

interface ResultRowProps {
    row: FindRow;
    query: string;
    pinned: boolean;
    onPreview: (id?: string) => void;
    onPin: (id: string) => void;
    onOpen: (row: FindRow) => void;
    onClose: () => void;
}

function ResultRow({ row, query, pinned, onPreview, onPin, onOpen, onClose }: ResultRowProps) {
    return (
        <RowShell pinned={pinned} onMouseEnter={() => onPreview(row.id)} onMouseLeave={() => onPreview(undefined)}>
            <RowButton
                type="button"
                aria-pressed={pinned}
                title={pinned ? "Clear the pin" : row.group === "entry" ? "Pin this flow" : "Pin every flow through this agent"}
                onFocus={() => onPreview(row.id)}
                onBlur={() => onPreview(undefined)}
                onKeyDown={rowKeyHandler(() => onOpen(row), onClose)}
                onClick={() => onPin(row.id)}
            >
                {rowGlyph(row, 16)}
                <Labels>
                    <Label>
                        {row.accessor && <MethodPill method={row.accessor}>{row.accessor}</MethodPill>}
                        <LabelText>{highlight(row.label, query)}</LabelText>
                    </Label>
                    <SubLabel via={Boolean(row.via)}>{highlight(row.via ?? row.sublabel, query)}</SubLabel>
                </Labels>
            </RowButton>
            <IconButton type="button" data-open title="Open" aria-label={`Open ${row.label}`} onClick={() => onOpen(row)}>
                {openGlyph}
            </IconButton>
            {pinned && (
                <IconButton type="button" title="Clear the pin" aria-label="Clear the pin" onClick={() => onPin(row.id)}>
                    {codicon("close")}
                </IconButton>
            )}
        </RowShell>
    );
}

interface FacetBarProps {
    facets: FindFacet[];
    active?: FindFacet;
    onSelect: (facet?: FindFacet) => void;
    onPreview: (facet?: FindFacet) => void;
}

function FacetBar({ facets, active, onSelect, onPreview }: FacetBarProps) {
    const same = (a?: FindFacet, b?: FindFacet) => Boolean(a && b && a.group === b.group && a.kind === b.kind);
    const entryFacets = facets.filter((facet) => facet.group === "entry");
    const agentFacets = facets.filter((facet) => facet.group === "agent");
    const chip = (facet: FindFacet) => (
        <Facet
            key={`${facet.group}:${facet.kind}`}
            type="button"
            active={same(active, facet)}
            aria-pressed={same(active, facet)}
            onClick={() => onSelect(same(active, facet) ? undefined : facet)}
            onMouseEnter={() => onPreview(facet)}
            onMouseLeave={() => onPreview(undefined)}
        >
            {facet.kind}
            <FacetCount>{facet.count}</FacetCount>
        </Facet>
    );
    return (
        <Facets aria-label="Kinds">
            {entryFacets.map(chip)}
            {entryFacets.length > 0 && agentFacets.length > 0 && <FacetDivider />}
            {agentFacets.map(chip)}
        </Facets>
    );
}

// The chip when the panel is folded: "Find" with its key, or the pinned story with open and clear.
function FindChip({ pinned, onOpenPanel, onOpen, onClear }: { pinned?: FindRow; onOpenPanel: () => void; onOpen: () => void; onClear: () => void }) {
    return (
        <Chip pinned={Boolean(pinned)}>
            <ChipLabel type="button" aria-expanded={false} aria-label={pinned ? undefined : "Find entry points and agents"} title={pinned ? "Find entry points and agents" : "Find entry points and agents (/)"} onClick={onOpenPanel}>
                {pinned ? rowGlyph(pinned, 16) : codicon("search", 15)}
                {pinned?.accessor && <MethodPill method={pinned.accessor}>{pinned.accessor}</MethodPill>}
                <span>{pinned ? pinned.label : "Find"}</span>
                {!pinned && <Kbd style={{ marginLeft: 8, marginRight: 0 }}>/</Kbd>}
                {pinned && codicon("chevron-down", 12)}
            </ChipLabel>
            {pinned && (
                <>
                    <IconButton type="button" title="Open" aria-label={`Open ${pinned.label}`} onClick={onOpen}>
                        {openGlyph}
                    </IconButton>
                    <IconButton type="button" title="Clear the pin" aria-label="Clear the pin" onClick={onClear}>
                        {codicon("close")}
                    </IconButton>
                </>
            )}
        </Chip>
    );
}

// The package's entry points and agents, folded into a chip until asked for. One field searches both, kind chips
// narrow the list, hovering a row previews its story, clicking pins it (and fits the canvas to it) and folds the
// panel back to the chip, which then names the story and clears it with ✕.
export function FindPanel(props: FindPanelProps) {
    const { graph, pinnedId, open, onToggle, onPreview, onPreviewFacet, onPin, onOpen } = props;
    const [query, setQuery] = useState("");
    const [facet, setFacet] = useState<FindFacet>();
    const facets = useMemo(() => buildFindFacets(graph), [graph]);
    const everything = useMemo(() => buildFindRows(graph, ""), [graph]);
    const rows = useMemo(() => (query || facet ? buildFindRows(graph, query, facet) : everything), [graph, query, facet, everything]);
    const pinned = pinnedId ? [...everything.entries, ...everything.agents].find((row) => row.id === pinnedId) : undefined;
    const close = () => onToggle(false);

    if (!open) {
        return (
            <FindChip
                pinned={pinned}
                onOpenPanel={() => onToggle(true)}
                onOpen={() => pinned && onOpen(pinned)}
                onClear={() => pinned && onPin(pinned.id)}
            />
        );
    }

    const all = [...rows.entries, ...rows.agents];
    const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") {
            event.stopPropagation();
            if (query) {
                setQuery("");
            } else {
                close();
            }
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            (event.currentTarget.closest("[role='dialog']")?.querySelector("[role='listbox'] button[aria-pressed]") as HTMLButtonElement | null)?.focus();
        } else if (event.key === "Enter" && all.length > 0) {
            onPin(all[0].id);
        }
    };
    const group = (title: string, list: FindRow[]) =>
        list.length > 0 && (
            <>
                <GroupHeading>
                    <span>{title}</span>
                    <Count>{list.length}</Count>
                </GroupHeading>
                {list.map((row) => (
                    <ResultRow key={row.id} row={row} query={query} pinned={row.id === pinnedId} onPreview={onPreview} onPin={onPin} onOpen={onOpen} onClose={close} />
                ))}
            </>
        );
    return (
        <Panel role="dialog" aria-label="Find">
            <Search>
                {codicon("search")}
                <Input
                    autoFocus
                    type="text"
                    value={query}
                    placeholder="Search entry points, agents, tools…"
                    aria-label="Search entry points and agents"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={onInputKey}
                />
                <IconButton type="button" title="Hide Find" aria-label="Hide Find" onClick={close}>
                    {codicon("chevron-up", 12)}
                </IconButton>
            </Search>
            {facets.length >= 2 && <FacetBar facets={facets} active={facet} onSelect={setFacet} onPreview={onPreviewFacet} />}
            <Results role="listbox" aria-label="Results">
                {all.length === 0 ? (
                    <Empty>
                        Nothing matches “{query}”.
                        <br />
                        Try a path, an agent, a tool or a channel.
                    </Empty>
                ) : (
                    <>
                        {group("Entry points", rows.entries)}
                        {group("Agents", rows.agents)}
                    </>
                )}
            </Results>
            <Hint>
                <span><Kbd>↑↓</Kbd>move</span>
                <span><Kbd>↵</Kbd>pin</span>
                <span><Kbd>⌘↵</Kbd>open</span>
                <span><Kbd>esc</Kbd>close</span>
            </Hint>
        </Panel>
    );
}
