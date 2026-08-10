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

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { Button, Item, Menu, MenuItem } from "@wso2/ui-toolkit";
import { DiagramEngine } from "@projectstorm/react-diagrams-core";
import { FlowNode } from "../../utils/types";
import { getCommentText } from "../../utils/diff";
import { getDiffStatePresentation } from "../../utils/node";
import { useDiagramContext } from "../DiagramContext";
import { MoreVertIcon } from "../../resources";
import {
    DIFF_ADDED_BG_COLOR,
    DIFF_ADDED_COLOR,
    DIFF_MODIFIED_BG_COLOR,
    DIFF_MODIFIED_COLOR,
    DIFF_REMOVED_BG_COLOR,
    DIFF_REMOVED_COLOR,
} from "../../resources/constants";

const ChipButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 3px;
    border-radius: 10px;
    font-size: 11px;
    padding: 2px 7px 2px 5px;
    height: 20px;
    background-color: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border: none;
    cursor: pointer;
    opacity: 0.85;
    white-space: nowrap;
    &:hover {
        opacity: 1;
    }
    svg {
        fill: currentColor;
        flex-shrink: 0;
    }
`;

const ChipLabel = styled.span`
    font-size: 11px;
    font-family: "GilmerMedium";
    line-height: 1;
`;

const NotePopoverContent = styled.div`
    padding: 10px 4px 10px 12px;
    max-width: 280px;
    min-width: 180px;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px;
`;

const NoteTextColumn = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
`;

const NoteText = styled.p`
    font-size: 13px;
    font-family: monospace;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    opacity: 0.85;
    padding-top: 2px;
`;

const RemovedNoteText = styled(NoteText)`
    color: ${DIFF_REMOVED_COLOR};
    text-decoration: line-through;
`;

const NoteVersionLabel = styled.span<{ accent: string }>`
    color: ${(props) => props.accent};
    font-family: var(--vscode-font-family);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
`;

const MenuButton = styled(Button)`
    border-radius: 5px;
    flex-shrink: 0;
`;

interface NodeNoteChipProps {
    commentNode: FlowNode;
    engine?: DiagramEngine;
    onOpen?: () => void;
    onClose?: () => void;
}

export function NodeNoteChip({ commentNode, engine, onOpen, onClose }: NodeNoteChipProps) {
    const { onNodeSelect, onDeleteNode, goToSource, readOnly } = useDiagramContext();

    const [chipButtonElement, setChipButtonElement] = useState<HTMLButtonElement | null>(null);
    const [notePos, setNotePos] = useState<{ top: number; left: number } | null>(null);
    const isNoteOpen = notePos !== null;

    const [menuButtonElement, setMenuButtonElement] = useState<HTMLElement | null>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
    const isMenuOpen = menuPos !== null;

    const getPos = (el: HTMLElement): { top: number; left: number } => {
        const rect = el.getBoundingClientRect();
        return { top: rect.bottom, left: rect.left };
    };

    // Re-anchor both popups whenever the canvas is panned or zoomed
    useEffect(() => {
        if (!isNoteOpen || !chipButtonElement || !engine) return;
        const handle = engine.getModel().registerListener({
            offsetUpdated: () => {
                setNotePos(getPos(chipButtonElement));
                if (menuButtonElement) setMenuPos(getPos(menuButtonElement));
            },
            zoomUpdated: () => {
                setNotePos(getPos(chipButtonElement));
                if (menuButtonElement) setMenuPos(getPos(menuButtonElement));
            },
        });
        return () => handle.deregister();
    }, [isNoteOpen, chipButtonElement, engine, menuButtonElement]);

    // Close note popup on click-outside
    useEffect(() => {
        if (!isNoteOpen) return;
        const handleClickOutside = () => {
            setNotePos(null);
            setMenuPos(null);
            onClose?.();
        };
        const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isNoteOpen]);

    // Close menu popup on click-outside (separate from note)
    useEffect(() => {
        if (!isMenuOpen) return;
        const handleClickOutside = () => setMenuPos(null);
        const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isMenuOpen]);

    const commentText = getCommentText(commentNode);
    const diffTextColor = "var(--vscode-editorWidget-foreground, var(--vscode-editor-foreground))";

    // Review-diff styling combines themed colors with a non-color label and border pattern.
    let chipDiffStyle: React.CSSProperties | undefined;
    let noteTextStyle: React.CSSProperties | undefined;
    const diffPresentation = getDiffStatePresentation(commentNode.diffState);
    switch (commentNode.diffState) {
        case "removed":
            chipDiffStyle = {
                backgroundColor: DIFF_REMOVED_BG_COLOR,
                borderColor: DIFF_REMOVED_COLOR,
                borderStyle: diffPresentation?.borderStyle,
                borderWidth: 1,
                color: diffTextColor,
                textDecoration: "line-through",
            };
            noteTextStyle = { color: diffTextColor, textDecoration: "line-through" };
            break;
        case "added":
            chipDiffStyle = {
                backgroundColor: DIFF_ADDED_BG_COLOR,
                borderColor: DIFF_ADDED_COLOR,
                borderStyle: diffPresentation?.borderStyle,
                borderWidth: 1,
                color: diffTextColor,
            };
            noteTextStyle = { color: diffTextColor };
            break;
        case "modified":
            chipDiffStyle = {
                backgroundColor: DIFF_MODIFIED_BG_COLOR,
                borderColor: DIFF_MODIFIED_COLOR,
                borderStyle: diffPresentation?.borderStyle,
                borderWidth: 1,
                color: diffTextColor,
            };
            noteTextStyle = { color: diffTextColor };
            break;
    }

    const handleChipClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        const el = e.currentTarget;
        setChipButtonElement(el);
        setNotePos(getPos(el));
        onOpen?.();
    };

    const handlePopoverClose = () => {
        setNotePos(null);
        setMenuPos(null);
        onClose?.();
    };

    const handleMenuOpen = (e: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        e.stopPropagation();
        const el = e.currentTarget as HTMLElement;
        setMenuButtonElement(el);
        setMenuPos(getPos(el));
    };

    const handleMenuClose = () => {
        setMenuPos(null);
    };

    const handleEdit = () => {
        onNodeSelect && onNodeSelect(commentNode);
        setMenuPos(null);
        setNotePos(null);
    };

    const handleGoToSource = () => {
        goToSource && goToSource(commentNode);
        setMenuPos(null);
        setNotePos(null);
    };

    const handleDelete = () => {
        onDeleteNode && onDeleteNode(commentNode);
        setMenuPos(null);
        setNotePos(null);
    };

    const menuItems: Item[] = [
        { id: "edit", label: "Edit", onClick: handleEdit },
        { id: "goToSource", label: "Source", onClick: handleGoToSource },
        { id: "delete", label: "Delete", onClick: handleDelete },
    ];

    return (
        <>
            <ChipButton
                style={chipDiffStyle}
                aria-label={diffPresentation ? `${diffPresentation.label} note` : "Note"}
                onClick={handleChipClick}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
                    <path d="m6 18l-2.3 2.3q-.475.475-1.088.213T2 19.575V4q0-.825.588-1.412T4 2h16q.825 0 1.413.588T22 4v12q0 .825-.587 1.413T20 18zm-.85-2H20V4H4v13.125zM4 16V4zm3-2h6q.425 0 .713-.288T14 13t-.288-.712T13 12H7q-.425 0-.712.288T6 13t.288.713T7 14m0-3h10q.425 0 .713-.288T18 10t-.288-.712T17 9H7q-.425 0-.712.288T6 10t.288.713T7 11m0-3h10q.425 0 .713-.288T18 7t-.288-.712T17 6H7q-.425 0-.712.288T6 7t.288.713T7 8" />
                </svg>
                <ChipLabel>
                    {diffPresentation ? `${diffPresentation.symbol} ${diffPresentation.label}` : "Note"}
                </ChipLabel>
            </ChipButton>

            {/* Note content popup */}
            {isNoteOpen && notePos && createPortal(
                <div
                    style={{
                        position: "fixed",
                        top: notePos.top,
                        left: notePos.left,
                        zIndex: 1300,
                        borderRadius: "6px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        backgroundColor: "var(--vscode-editorWidget-background, #1e1e1e)",
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <NotePopoverContent>
                        <NoteTextColumn>
                            {commentNode.diffPreviousText && (
                                <>
                                    <NoteVersionLabel accent={DIFF_REMOVED_COLOR}>Old</NoteVersionLabel>
                                    <RemovedNoteText>{commentNode.diffPreviousText}</RemovedNoteText>
                                    <NoteVersionLabel accent={DIFF_ADDED_COLOR}>New</NoteVersionLabel>
                                </>
                            )}
                            <NoteText
                                style={commentNode.diffPreviousText ? { ...noteTextStyle, color: DIFF_ADDED_COLOR } : noteTextStyle}
                            >
                                {commentText || "..."}
                            </NoteText>
                        </NoteTextColumn>
                        {!readOnly && (
                            <MenuButton appearance="icon" onClick={handleMenuOpen}>
                                <MoreVertIcon />
                            </MenuButton>
                        )}
                    </NotePopoverContent>
                </div>,
                document.body
            )}

            {/* Note actions menu */}
            {isMenuOpen && menuPos && createPortal(
                <div
                    style={{
                        position: "fixed",
                        top: menuPos.top,
                        left: menuPos.left,
                        zIndex: 1301,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        borderRadius: 0,
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <Menu>
                        {menuItems.map((item) => (
                            <MenuItem key={item.id} item={item} />
                        ))}
                    </Menu>
                </div>,
                document.body
            )}
        </>
    );
}
