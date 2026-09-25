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

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { CheckBox, Codicon, Dropdown, Icon, SearchBox } from "@wso2/ui-toolkit";
import { HistoryQuery, HistoryRange, HistorySort, HistoryStatus } from "./historyQuery";

const Bar = styled.div`
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 0 24px 16px;
    padding: 10px 0;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
`;

const Search = styled.div`
    flex: 1 1 280px;
    min-width: 0;
`;

const AgentPicker = styled.div`
    position: relative;
`;

const PickerButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 8px;
    border-radius: 2px;
    border: 1px solid var(--vscode-dropdown-border);
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
`;

const Menu = styled.div`
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 260px;
    padding: 4px;
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 4px;
    background: var(--vscode-dropdown-background);
    box-shadow: 0 4px 16px var(--vscode-widget-shadow);
    z-index: 10;
`;

const MenuItem = styled.div`
    padding: 4px 6px;
    border-radius: 3px;

    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

const MenuDivider = styled.div`
    height: 1px;
    margin: 4px 2px;
    background: var(--vscode-menu-separatorBackground, var(--vscode-dropdown-border));
`;

const MenuHint = styled.div`
    padding: 2px 6px 6px 30px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
`;

const MenuAction = styled.button`
    display: block;
    width: 100%;
    padding: 5px 6px;
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--vscode-textLink-foreground);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;

    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

const STATUS_ITEMS: { value: HistoryStatus; content: string }[] = [
    { value: "all", content: "All statuses" },
    { value: "failing", content: "Failing" },
    { value: "passing", content: "Passing" },
];

const RANGE_ITEMS: { value: HistoryRange; content: string }[] = [
    { value: "24h", content: "Last 24 hours" },
    { value: "7d", content: "Last 7 days" },
    { value: "30d", content: "Last 30 days" },
    { value: "all", content: "All time" },
];

const SORT_ITEMS: { value: HistorySort; content: string }[] = [
    { value: "latest", content: "Sort: latest run" },
    { value: "rate", content: "Sort: lowest pass rate" },
    { value: "failures", content: "Sort: most failed runs" },
    { value: "name", content: "Sort: name" },
];

const isTyping = (element: Element | null) =>
    !!element && (/INPUT|TEXTAREA|SELECT/.test(element.tagName) || element.tagName.startsWith("VSCODE-"));

const agentsLabel = (agents: string[] | undefined, includeDeleted: boolean) => {
    const base = !agents ? "All agents" : agents.length === 1 ? agents[0] : `${agents.length} agents`;
    return includeDeleted ? `${base} + deleted` : base;
};

interface HistoryToolbarProps {
    query: HistoryQuery;
    onChange: (query: HistoryQuery) => void;
    agents: string[];
    deletedCount: number;
    onDeleteDeletedHistory: () => void;
}

export function HistoryToolbar({ query, onChange, agents, deletedCount, onDeleteDeletedHistory }: HistoryToolbarProps) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const pickerRef = useRef<HTMLDivElement>(null);
    const update = (change: Partial<HistoryQuery>) => onChange({ ...query, ...change });

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "/" && !isTyping(document.activeElement)) {
                event.preventDefault();
                searchRef.current?.querySelector<HTMLElement>("vscode-text-field, input")?.focus();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(() => {
        if (!pickerOpen) {
            return;
        }
        const onPointerDown = (event: MouseEvent) => {
            if (!pickerRef.current?.contains(event.target as Node)) {
                setPickerOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, [pickerOpen]);

    const toggleAgent = (agent: string) => {
        const current = query.agents ?? [];
        const next = current.includes(agent) ? current.filter((name) => name !== agent) : [...current, agent];
        update({ agents: next.length > 0 ? next : undefined });
    };

    return (
        <Bar>
            <Search ref={searchRef}>
                <SearchBox
                    value={query.search}
                    placeholder="Search evaluations, queries, threads and failure messages (/)"
                    onChange={(search) => update({ search })}
                    sx={{ width: "100%" }}
                />
            </Search>
            <Dropdown id="history-status" aria-label="Status" items={STATUS_ITEMS} value={query.status}
                onValueChange={(status) => update({ status: status as HistoryStatus })} />
            <AgentPicker ref={pickerRef}>
                <PickerButton aria-expanded={pickerOpen} onClick={() => setPickerOpen(!pickerOpen)}>
                    <Icon name="bi-ai-agent" sx={{ width: 14, height: 14 }} iconSx={{ fontSize: "14px" }} />
                    {agentsLabel(query.agents, query.includeDeleted)}
                    <Codicon name="chevron-down" />
                </PickerButton>
                {pickerOpen && (
                    <Menu>
                        <MenuItem>
                            <CheckBox label="All agents" checked={!query.agents} onChange={() => update({ agents: undefined })} />
                        </MenuItem>
                        {agents.map((agent) => (
                            <MenuItem key={agent}>
                                <CheckBox label={agent} checked={!!query.agents?.includes(agent)}
                                    onChange={() => toggleAgent(agent)} />
                            </MenuItem>
                        ))}
                        {deletedCount > 0 && (
                            <>
                                <MenuDivider />
                                <MenuItem>
                                    <CheckBox label={`Include deleted evaluations (${deletedCount})`}
                                        checked={query.includeDeleted}
                                        onChange={(includeDeleted) => update({ includeDeleted })} />
                                </MenuItem>
                                <MenuHint>They are in past reports but no longer in the code.</MenuHint>
                                {query.includeDeleted && (
                                    <MenuAction onClick={onDeleteDeletedHistory}>
                                        Delete the history of deleted evaluations
                                    </MenuAction>
                                )}
                            </>
                        )}
                    </Menu>
                )}
            </AgentPicker>
            <Dropdown id="history-range" aria-label="Date range" items={RANGE_ITEMS} value={query.range}
                onValueChange={(range) => update({ range: range as HistoryRange })} />
            <Dropdown id="history-sort" aria-label="Sort" items={SORT_ITEMS} value={query.sort}
                onValueChange={(sort) => update({ sort: sort as HistorySort })} />
        </Bar>
    );
}
