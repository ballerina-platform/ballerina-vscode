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


import React, { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_CHIP_COLOR, DropAction, HighlightedText, setDraggedInsert } from "@wso2/ballerina-side-panel";
import { Icon, Tooltip } from "@wso2/ui-toolkit";
import { HelperPaneIconType, getHelperPaneIcon } from "../HelperPaneNew/utils/iconUtils";
import { canExpand, DataItem, displayPath } from "./useDataTree";
import { S } from "./styles";

const ARROW_TURN = { down: 0, right: -90, left: 90 };

// The icon font has only a down arrow, so the other directions turn it.
export function Arrow({ direction }: { direction: keyof typeof ARROW_TURN }) {
    return (
        <Icon
            name="bi-arrow-down"
            sx={{ width: "16px", height: "16px", transform: `rotate(${ARROW_TURN[direction]}deg)` }}
            iconSx={{ fontSize: "16px" }}
        />
    );
}

// The browser snapshots the drag image at dragstart, so the chip only has to exist for that moment.
const setChipDragImage = (event: React.DragEvent, text: string) => {
    const doc = event.currentTarget.ownerDocument;
    const chip = doc.createElement("div");
    chip.textContent = text;
    chip.style.cssText = `position: fixed; top: -100px; left: 0; padding: 2px 8px; border-radius: 4px;
        font: 12px var(--vscode-editor-font-family, monospace); white-space: nowrap; color: var(--vscode-editor-foreground);
        background: linear-gradient(${DEFAULT_CHIP_COLOR.background}, ${DEFAULT_CHIP_COLOR.background}) var(--vscode-input-background);
        border: 1px solid ${DEFAULT_CHIP_COLOR.border};`;
    doc.body.appendChild(chip);
    event.dataTransfer.setDragImage(chip, 12, chip.offsetHeight / 2);
    setTimeout(() => chip.remove());
};

export const dragProps = (text: string, action: DropAction, onStart?: () => void) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
        event.dataTransfer.setData("text/plain", text);
        event.dataTransfer.effectAllowed = "copy";
        setChipDragImage(event, text);
        setDraggedInsert(action);
        onStart?.();
    },
    onDragEnd: () => setDraggedInsert(null),
});

interface SectionProps {
    title: string;
    children: React.ReactNode;
}

// An opened group names its section in its own header, so the section shows only its rows.
export const InGroup = createContext(false);
// What the search box holds, so rows can mark where it matches.
export const SearchQuery = createContext("");
// Which rows open: a condition also opens values to comparisons.
export const CanOpen = createContext(canExpand);

export function Section({ title, children }: SectionProps) {
    const inGroup = useContext(InGroup);
    return (
        <S.Section>
            {!inGroup && <S.SectionTitle>{title}</S.SectionTitle>}
            {children}
        </S.Section>
    );
}

const moduleOf = (type: string) => type.match(/^(\w+):/)?.[1];

// Rows drop `readonly`, and nested rows the module prefix an ancestor already shows; the row's tooltip keeps the full type.
const shortType = (type: string, module?: string) => {
    const short = type.replace(/\s*&\s*readonly\b|\breadonly\s*&\s*/g, "");
    return module ? short.replace(new RegExp(`\\b${module}:`, "g"), "") : short;
};

interface DataNodeProps {
    item: DataItem;
    depth: number;
    module?: string;
    onInsert?: (value: string) => void;
    fetchFields: (parent: DataItem) => Promise<DataItem[]>;
    defaultExpanded?: boolean;
}

export function DataNode(props: DataNodeProps) {
    const { depth, module, onInsert, fetchFields } = props;
    const query = useContext(SearchQuery);
    const canOpen = useContext(CanOpen);
    const [index, setIndex] = useState(0);
    const item = props.item.elementOf ? { ...props.item, path: `${props.item.elementOf}[${index}]` } : props.item;
    const [expanded, setExpanded] = useState(!!props.defaultExpanded);
    const [fields, setFields] = useState<DataItem[]>();
    const expandable = canOpen(item) && fields?.length !== 0;

    useEffect(() => {
        setFields(undefined);
        if (expanded) {
            fetchFields(item).then(setFields);
        }
    }, [item.path]);

    const insert = () => onInsert?.(item.path);

    // A named type can turn out to hold nothing to open (a string alias, a union of string values); the click then inserts it.
    const toggle = () => {
        if (!expanded && !fields) {
            fetchFields(item).then((found) => {
                setFields(found);
                if (found.length === 0) {
                    setExpanded(false);
                    insert();
                }
            });
        }
        setExpanded(!expanded);
    };

    return (
        <>
            <S.Row
                role="treeitem"
                tabIndex={-1}
                aria-expanded={expandable ? expanded : undefined}
                aria-level={depth + 1}
                depth={depth}
                title={`${displayPath(item.path)}: ${item.type}`}
                onClick={expandable ? toggle : insert}
                {...dragProps(item.path, (target) => target.insert(item.path))}
            >
                <S.Chevron>{expandable && <Arrow direction={expanded ? "down" : "right"} />}</S.Chevron>
                {item.enumMember && getHelperPaneIcon(HelperPaneIconType.VALUE, "16px")}
                <S.Name>{item.elementOf ? `Item ${index}` : <HighlightedText text={displayPath(item.name)} query={query} />}</S.Name>
                {item.elementOf && <IndexStepper index={index} onChange={setIndex} />}
                <S.Type title={item.type}>{shortType(item.type, module)}</S.Type>
                {expandable && onInsert && (
                    <Tooltip content={`Insert ${displayPath(item.path)}`} containerSx={{ display: "inline-flex", flexShrink: 0 }}>
                        <S.InsertButton
                            data-insert
                            tabIndex={-1}
                            aria-label={`Insert ${displayPath(item.path)}`}
                            // An empty title keeps the row's own title from showing over the tooltip.
                            title=""
                            onClick={(event) => {
                                event.stopPropagation();
                                insert();
                            }}
                        >
                            <Icon name="bi-return" sx={{ width: "16px", height: "16px" }} iconSx={{ fontSize: "16px" }} />
                        </S.InsertButton>
                    </Tooltip>
                )}
            </S.Row>
            {expanded && (
                <S.Children depth={depth}>
                    {!fields && <S.Note depth={depth + 1}>Loading…</S.Note>}
                    {fields?.map((field) => (
                        <DataNode key={field.path} {...props} defaultExpanded={false} item={field} depth={depth + 1} module={module ?? moduleOf(item.type)} />
                    ))}
                </S.Children>
            )}
        </>
    );
}

function IndexStepper({ index, onChange }: { index: number; onChange: (index: number) => void }) {
    const step = (by: number) => (event: React.MouseEvent) => {
        event.stopPropagation();
        onChange(Math.max(0, index + by));
    };
    return (
        <S.Stepper>
            <S.StepperButton aria-label="Previous Item" title="Previous Item" disabled={index === 0} onClick={step(-1)}>
                <Arrow direction="left" />
            </S.StepperButton>
            <S.StepperButton aria-label="Next Item" title="Next Item" onClick={step(1)}>
                <Arrow direction="right" />
            </S.StepperButton>
        </S.Stepper>
    );
}

const levelOf = (row: HTMLElement) => Number(row.getAttribute("aria-level") ?? 1);
// A click opens a record row, so Enter inserts it through its Insert button.
const insertOrRun = (row: HTMLElement) => (row.querySelector<HTMLElement>("[data-insert]") ?? row).click();

// Up and Down move, Right and Left open and close, Enter inserts; Left on a closed field goes to its parent, on a top row (like Backspace) back.
export const treeKeyDown = (onLeaveTop: () => void, onBack?: () => void) => (event: React.KeyboardEvent<HTMLElement>) => {
    // Skips the rows of a section that stays mounted while hidden.
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>("[role=treeitem]")].filter((row) => row.getClientRects().length > 0);
    const row = event.target as HTMLElement;
    const index = rows.indexOf(row);
    const expanded = row.getAttribute("aria-expanded");
    const actions: Record<string, () => void> = {
        ArrowDown: () => rows[index + 1]?.focus(),
        ArrowUp: () => (index > 0 ? rows[index - 1].focus() : onLeaveTop()),
        ArrowRight: () => expanded === "false" && row.click(),
        ArrowLeft: () => {
            if (expanded === "true") {
                row.click();
            } else if (levelOf(row) > 1) {
                rows.slice(0, index).reverse().find((other) => levelOf(other) < levelOf(row))?.focus();
            } else {
                onBack?.();
            }
        },
        Backspace: () => onBack?.(),
        Enter: () => insertOrRun(row),
    };
    const action = index >= 0 && actions[event.key];
    if (action) {
        event.preventDefault();
        action();
    }
};
