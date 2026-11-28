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

import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Codicon, Icon, ThemeColors } from "@wso2/ui-toolkit";
import { matchType, splitTypeQuery, TypeOption } from "./typeSearch";

export interface TypeSection {
    title: string;
    options: TypeOption[];
    // Shown under the title, e.g. while a search is still running.
    note?: string;
}

interface TypePickerProps {
    query: string;
    sections: TypeSection[];
    loading: boolean;
    // A plain name no type has yet; offered at the end, never selected by default.
    createName?: string;
    // The field being typed into: its arrow, Enter, Tab and Escape keys drive the list.
    input?: HTMLElement | null;
    width?: number;
    onPick: (option: TypeOption) => void;
    onCreate?: (name: string) => void;
    onClose: () => void;
}

// The same surface, rows and selection as the expression autocomplete.
namespace S {
    export const Panel = styled.div<{ width?: number }>`
        width: ${({ width }: { width?: number }) => (width ? `${width}px` : "320px")};
        max-height: 340px;
        display: flex;
        flex-direction: column;
        padding: 4px;
        border: 1px solid var(--vscode-dropdown-border);
        border-radius: 8px;
        background-color: var(--vscode-editorWidget-background);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
        font-family: var(--vscode-font-family);
        font-size: 13px;
    `;
    export const List = styled.div`
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
    `;
    export const SectionTitle = styled.div`
        display: flex;
        justify-content: space-between;
        padding: 6px 8px 2px;
        font-size: 11px;
        font-weight: 600;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    `;
    export const Row = styled.div<{ active: boolean }>`
        display: flex;
        align-items: center;
        gap: 8px;
        height: 26px;
        padding: 0 8px;
        border-radius: 4px;
        cursor: pointer;
        color: ${ThemeColors.ON_SURFACE};
        background-color: ${({ active }: { active: boolean }) => (active ? "color-mix(in srgb, var(--vscode-focusBorder) 25%, transparent)" : "transparent")};
    `;
    export const Name = styled.span`
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    `;
    export const Matched = styled.span`
        font-weight: 600;
        color: var(--vscode-editorSuggestWidget-highlightForeground, var(--vscode-textLink-foreground));
    `;
    export const Tag = styled.span`
        flex: 0 1000 auto;
        min-width: 24px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 11px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    `;
    export const Message = styled.div`
        padding: 6px 8px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    `;
    export const Footer = styled.div`
        margin-top: 4px;
        padding-top: 4px;
        border-top: 1px solid var(--vscode-dropdown-border);
    `;
}

const CARET_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);
const CREATE_ROW = "create";

const optionKey = (option: TypeOption) => `${option.source}:${option.module ?? ""}:${option.item.name}`;

function HighlightedName({ name, query }: { name: string; query: string }) {
    const typed = splitTypeQuery(query).name;
    const match = typed ? matchType(name, typed) : undefined;
    if (!match) {
        return <S.Name title={name}>{name}</S.Name>;
    }
    const end = match.start + typed.length;
    return (
        <S.Name title={name}>
            {name.slice(0, match.start)}
            <S.Matched>{name.slice(match.start, end)}</S.Matched>
            {name.slice(end)}
        </S.Name>
    );
}

export function TypePicker({ query, sections, loading, createName, input, width, onPick, onCreate, onClose }: TypePickerProps) {
    const options = sections.flatMap((section) => section.options);
    const rowKeys = [...options.map(optionKey), ...(createName && onCreate ? [CREATE_ROW] : [])];
    const rowCount = rowKeys.length;
    // The row an arrow key or the pointer chose, by key, so it stays chosen while results arrive.
    const [chosen, setChosen] = useState<string>();
    const chosenIndex = chosen === undefined ? -1 : rowKeys.indexOf(chosen);
    // Otherwise, while typing, Enter takes the best match; with nothing typed it does nothing.
    const active = chosenIndex >= 0 ? chosenIndex : (query && options.length > 0 ? 0 : -1);
    const setActive = (index: number) => setChosen(rowKeys[index]);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => setChosen(undefined), [query]);
    useEffect(() => {
        listRef.current?.querySelector("[data-active=true]")?.scrollIntoView({ block: "nearest" });
    }, [active]);

    const choose = (index: number) => {
        if (index < options.length) {
            onPick(options[index]);
        } else if (createName) {
            onCreate?.(createName);
        }
    };

    // Kept in a ref so the field's listener always sees the latest list without re-binding on every keystroke.
    const keys = useRef<(event: KeyboardEvent) => void>();
    keys.current = (event: KeyboardEvent) => {
        // The cursor still moves; stopping the event only keeps the editor from closing this panel.
        if (CARET_KEYS.has(event.key)) {
            event.stopPropagation();
            return;
        }
        const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
        const accept = (event.key === "Enter" || event.key === "Tab") && active >= 0;
        if (step && rowCount > 0) {
            setActive(active < 0 ? (step > 0 ? 0 : rowCount - 1) : (active + step + rowCount) % rowCount);
        } else if (accept) {
            choose(active);
        } else if (event.key === "Escape") {
            onClose();
        } else {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
    };
    useEffect(() => {
        if (!input) {
            return;
        }
        // Capture phase, so the editor's own key handling (which would close this panel) never sees these keys.
        const onKeyDown = (event: KeyboardEvent) => keys.current?.(event);
        input.addEventListener("keydown", onKeyDown, true);
        return () => input.removeEventListener("keydown", onKeyDown, true);
    }, [input]);

    const row = (option: TypeOption, index: number) => (
        <S.Row
            key={optionKey(option)}
            role="option"
            aria-selected={index === active}
            active={index === active}
            data-active={index === active}
            data-testid={`type-helper-item-${option.item.name}`}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(index)}
            onClick={() => choose(index)}
        >
            <Icon name="bi-type" sx={{ width: "16px", height: "16px", color: ThemeColors.ON_SURFACE_VARIANT }} iconSx={{ fontSize: "16px" }} />
            <HighlightedName name={option.item.name} query={query} />
            {option.module && <S.Tag>{option.module}</S.Tag>}
        </S.Row>
    );

    const visible = sections.filter((section) => section.options.length > 0 || section.note);
    const starts = visible.map((_, i) => visible.slice(0, i).reduce((sum, section) => sum + section.options.length, 0));
    return (
        <S.Panel width={width} role="listbox" aria-label="Types">
            <S.List ref={listRef}>
                {loading && <S.Message>Loading types…</S.Message>}
                {visible.map((section, i) => (
                    <div key={section.title}>
                        <S.SectionTitle>
                            {section.title}
                            {section.note && <span>{section.note}</span>}
                        </S.SectionTitle>
                        {section.options.map((option, j) => row(option, starts[i] + j))}
                    </div>
                ))}
                {!loading && options.length === 0 && (
                    <S.Message>{query ? `No types match ${query}.` : "No types available here."}</S.Message>
                )}
            </S.List>
            {createName && onCreate && (
                <S.Footer>
                    <S.Row
                        role="option"
                        aria-selected={active === options.length}
                        active={active === options.length}
                        data-active={active === options.length}
                        data-testid="add-type-completion"
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActive(options.length)}
                        onClick={() => onCreate(createName)}
                    >
                        <Codicon name="add" />
                        <S.Name>Create Type {createName}</S.Name>
                    </S.Row>
                </S.Footer>
            )}
        </S.Panel>
    );
}
