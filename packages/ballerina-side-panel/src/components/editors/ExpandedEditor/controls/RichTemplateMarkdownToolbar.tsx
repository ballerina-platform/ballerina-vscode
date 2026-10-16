/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React, { useState, useRef, useEffect } from "react";
import styled from "@emotion/styled";
import { ThemeColors, Icon, Switch } from "@wso2/ui-toolkit";
import { EditorView } from "prosemirror-view";
import {
    toggleBold,
    toggleItalic,
    toggleLink,
    toggleHeading,
    toggleBlockquote,
    toggleBulletList,
    toggleOrderedList,
    isMarkActive,
    isNodeActive,
    isListActive,
    undoCommand,
    redoCommand,
    canUndo,
    canRedo
} from "../../MultiModeExpressionEditor/RichTextTemplateEditor/plugins/markdownCommands";
import {
    insertTable,
    isInTable,
    addRowAfter,
    addColumnAfter,
    deleteRow,
    deleteColumn,
    deleteTable
} from "../../MultiModeExpressionEditor/RichTextTemplateEditor/plugins/tablePlugin";
import { HelperPaneToggleButton } from "../../MultiModeExpressionEditor/ChipExpressionEditor/components/HelperPaneToggleButton";
import { LinkDialog } from "./LinkDialog";
import { TableDialog } from "./TableDialog";

const ToolbarContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding: 8px 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px 4px 0 0;
    flex-wrap: wrap;
    font-family: GilmerMedium;
`;

const ToolbarButtonGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
`;

const ToolbarButton = styled.button<{ isActive?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background-color: ${(props: { isActive?: boolean }) => props.isActive ? ThemeColors.SECONDARY_CONTAINER : 'transparent'};
    color: ${ThemeColors.ON_SURFACE};
    border: 1px solid ${(props: { isActive?: boolean }) => props.isActive ? ThemeColors.OUTLINE : 'transparent'};
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
        background-color: ${ThemeColors.SECONDARY_CONTAINER};
        border-color: ${ThemeColors.OUTLINE};
    }

    &:active:not(:disabled) {
        background-color: ${ThemeColors.SECONDARY_CONTAINER};
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &:focus-visible {
        outline: 2px solid ${ThemeColors.PRIMARY};
        outline-offset: 2px;
    }
`;

const ToolbarDivider = styled.div`
    width: 1px;
    height: 24px;
    background-color: ${ThemeColors.OUTLINE_VARIANT};
    margin: 0 4px;
`;

const SplitButtonContainer = styled.div`
    position: relative;
    display: flex;
    align-items: center;
`;

const SplitButtonMain = styled(ToolbarButton)`
    border-radius: 4px 0 0 4px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-right: none;
    min-width: 40px;
    font-size: 12px;
    font-weight: 600;
`;

const SplitButtonDropdown = styled(ToolbarButton)`
    width: 24px;
    border-radius: 0 4px 4px 0;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const DropdownMenu = styled.div<{ isOpen: boolean }>`
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 120px;
    background-color: var(--vscode-dropdown-background);
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    display: ${(props: { isOpen: boolean }) => props.isOpen ? 'block' : 'none'};
    overflow: hidden;
`;

const DropdownItem = styled.button<{ size: number }>`
    width: 100%;
    padding: 8px 12px;
    background-color: transparent;
    color: ${ThemeColors.ON_SURFACE};
    border: none;
    text-align: left;
    cursor: pointer;
    font-size: ${(props: { size: number }) => {
        const sizes: { [key: number]: string } = {
            1: '16px',
            2: '15px',
            3: '14px',
            4: '13px',
            5: '12px',
            6: '11px'
        };
        return sizes[props.size] || '14px';
    }};
    font-weight: ${(props: { size: number }) => props.size <= 3 ? '600' : '500'};
    transition: background-color 0.2s ease;

    &:hover {
        background-color: ${ThemeColors.SECONDARY_CONTAINER};
    }

    &:active {
        background-color: ${ThemeColors.SECONDARY_CONTAINER};
    }

    &:focus-visible {
        outline: 2px solid ${ThemeColors.PRIMARY};
        outline-offset: -2px;
    }
`;

const MenuDropdownItem = styled.button`
    width: 100%;
    padding: 6px 12px;
    background-color: transparent;
    color: ${ThemeColors.ON_SURFACE};
    border: none;
    text-align: left;
    cursor: pointer;
    font-size: 12px;
    font-weight: 400;
    transition: background-color 0.2s ease;

    &:hover {
        background-color: ${ThemeColors.SECONDARY_CONTAINER};
    }

    &:focus-visible {
        outline: 2px solid ${ThemeColors.PRIMARY};
        outline-offset: -2px;
    }
`;

interface RichTemplateMarkdownToolbarProps {
    editorView: EditorView | null;
    isSourceView?: boolean;
    onToggleView?: () => void;
    hideHelperPaneToggle?: boolean;
    helperPaneToggle?: {
        ref: React.RefObject<HTMLButtonElement>;
        isOpen: boolean;
        onClick: () => void;
    };
    onEnhanceClick: () => void;
    isEnhancing: boolean;
    isInPreviewMode?: boolean;
    isEditorEmpty?: boolean;
}

export const RichTemplateMarkdownToolbar = React.forwardRef<HTMLDivElement, RichTemplateMarkdownToolbarProps>(({
    editorView,
    isSourceView = false,
    onToggleView,
    hideHelperPaneToggle = false,
    helperPaneToggle,
    onEnhanceClick,
    isEnhancing,
    isInPreviewMode = false,
    isEditorEmpty = false
}, ref) => {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    const [currentHeadingLevel, setCurrentHeadingLevel] = useState(1);
    const [isHeadingDropdownOpen, setIsHeadingDropdownOpen] = useState(false);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
    const [selectedTextForLink, setSelectedTextForLink] = useState("");
    const [isTableDialogOpen, setIsTableDialogOpen] = useState(false);
    const [isTableDropdownOpen, setIsTableDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const tableDropdownRef = useRef<HTMLDivElement>(null);

    // Update toolbar state when editor state changes
    React.useEffect(() => {
        if (!editorView) return;

        const updateListener = () => {
            forceUpdate();
        };

        editorView.dom.addEventListener('input', updateListener);
        editorView.dom.addEventListener('click', updateListener);
        editorView.dom.addEventListener('keyup', updateListener);

        return () => {
            editorView.dom.removeEventListener('input', updateListener);
            editorView.dom.removeEventListener('click', updateListener);
            editorView.dom.removeEventListener('keyup', updateListener);
        };
    }, [editorView]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsHeadingDropdownOpen(false);
            }
        };

        if (isHeadingDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isHeadingDropdownOpen]);

    // Close table dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (tableDropdownRef.current && !tableDropdownRef.current.contains(event.target as Node)) {
                setIsTableDropdownOpen(false);
            }
        };

        if (isTableDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isTableDropdownOpen]);

    // Prevent buttons from taking focus away from the editor
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    const executeCommand = (command: (state: any, dispatch?: any, view?: any) => boolean) => {
        if (!editorView) return;
        const didChange = command(editorView.state, editorView.dispatch, editorView);
        if (didChange) {
            forceUpdate();
        }
        editorView.focus();
    };

    const handleHeader = (level?: number) => {
        const headingLevel = level ?? currentHeadingLevel;
        executeCommand(toggleHeading(headingLevel));
        if (level !== undefined) {
            setCurrentHeadingLevel(level);
            setIsHeadingDropdownOpen(false);
        }
    };

    const toggleHeadingDropdown = () => setIsHeadingDropdownOpen(!isHeadingDropdownOpen);

    const handleLinkButtonClick = () => {
        if (!editorView) return;

        const schema = editorView.state.schema;
        const { from, to } = editorView.state.selection;

        // If already has link, remove it immediately
        if (from !== to && editorView.state.doc.rangeHasMark(from, to, schema.marks.link)) {
            executeCommand(toggleLink());
            return;
        }

        // Get selected text if any to pre-fill title field
        const selectedText = editorView.state.doc.textBetween(from, to, ' ');
        setSelectedTextForLink(selectedText);
        setIsLinkDialogOpen(true);
    };

    const handleInsertLink = (href: string, title?: string) => {
        executeCommand(toggleLink(href, title));
        setIsLinkDialogOpen(false);
    };

    const handleInsertTable = (rows: number, cols: number) => {
        executeCommand(insertTable(rows, cols));
        setIsTableDialogOpen(false);
    };

    const schema = editorView?.state.schema;

    const isBoldActive = editorView && schema ? isMarkActive(editorView.state, schema.marks.strong) : false;
    const isItalicActive = editorView && schema ? isMarkActive(editorView.state, schema.marks.em) : false;
    const isLinkActive = editorView && schema ? isMarkActive(editorView.state, schema.marks.link) : false;

    const isCurrentHeadingActive = editorView && schema
        ? isNodeActive(editorView.state, schema.nodes.heading, { level: currentHeadingLevel })
        : false;

    const isBlockquoteActive = editorView && schema ? isNodeActive(editorView.state, schema.nodes.blockquote) : false;
    const isBulletListActive = editorView && schema ? isListActive(editorView.state, schema.nodes.bullet_list) : false;
    const isOrderedListActive = editorView && schema ? isListActive(editorView.state, schema.nodes.ordered_list) : false;

    const isUndoAvailable = editorView ? canUndo(editorView.state) : false;
    const isRedoAvailable = editorView ? canRedo(editorView.state) : false;
    const cursorInTable = editorView ? isInTable(editorView.state) : false;

    return (
        <ToolbarContainer ref={ref}>
            <ToolbarButtonGroup>
                {!hideHelperPaneToggle && helperPaneToggle && (
                    <>
                        <HelperPaneToggleButton
                            ref={helperPaneToggle.ref}
                            disabled={!editorView}
                            isOpen={helperPaneToggle.isOpen}
                            onClick={helperPaneToggle.onClick}
                            sx={{ marginBottom: 0, width: '90px' }}
                            title="Toggle Helper Panel (Ctrl+/ or Cmd+/)"
                            displayText="Insert"
                        />

                        <ToolbarDivider />
                    </>
                )}

                <ToolbarButton
                    title="Undo (Ctrl+Z / Cmd+Z)"
                    disabled={!editorView || !isUndoAvailable}
                    onClick={() => executeCommand(undoCommand)}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="bi-undo" sx={{ width: "20px", height: "20px", fontSize: "20px" }} />
                </ToolbarButton>

                <ToolbarButton
                    title="Redo (Ctrl+Y / Cmd+Y)"
                    disabled={!editorView || !isRedoAvailable}
                    onClick={() => executeCommand(redoCommand)}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="bi-redo" sx={{ width: "20px", height: "20px", fontSize: "20px" }} />
                </ToolbarButton>

                <ToolbarDivider />

                <ToolbarButton
                    title="Bold"
                    disabled={!editorView}
                    isActive={isBoldActive}
                    onClick={() => executeCommand(toggleBold)}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="bi-bold" sx={{ width: "20px", height: "20px", fontSize: "20px" }} />
                </ToolbarButton>

                <ToolbarButton
                    title="Italic"
                    disabled={!editorView}
                    isActive={isItalicActive}
                    onClick={() => executeCommand(toggleItalic)}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="bi-italic" sx={{ width: "20px", height: "20px", fontSize: "20px" }} />
                </ToolbarButton>

                <ToolbarButton
                    title="Insert Link"
                    disabled={!editorView}
                    isActive={isLinkActive}
                    onClick={handleLinkButtonClick}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="bi-link" sx={{ width: "20px", height: "20px", fontSize: "20px" }} />
                </ToolbarButton>

                <ToolbarDivider />

                <SplitButtonContainer ref={dropdownRef}>
                    <SplitButtonMain
                        title={`Heading ${currentHeadingLevel}`}
                        disabled={!editorView}
                        isActive={isCurrentHeadingActive}
                        onClick={() => handleHeader()}
                        onMouseDown={handleMouseDown}
                    >
                        H{currentHeadingLevel}
                    </SplitButtonMain>
                    <SplitButtonDropdown
                        title="Select heading level"
                        disabled={!editorView}
                        onClick={toggleHeadingDropdown}
                        onMouseDown={handleMouseDown}
                    >
                        <Icon name="bi-arrow-down" sx={{ width: "16px", height: "16px", fontSize: "16px" }} />
                    </SplitButtonDropdown>
                    <DropdownMenu isOpen={isHeadingDropdownOpen}>
                        {[1, 2, 3, 4, 5, 6].map((level) => (
                            <DropdownItem
                                key={level}
                                size={level}
                                onClick={() => handleHeader(level)}
                                onMouseDown={handleMouseDown}
                            >
                                Heading {level}
                            </DropdownItem>
                        ))}
                    </DropdownMenu>
                </SplitButtonContainer>

                <ToolbarButton
                    title="Blockquote"
                    disabled={!editorView}
                    isActive={isBlockquoteActive}
                    onClick={() => executeCommand(toggleBlockquote)}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="bi-quote" sx={{ width: "20px", height: "20px", fontSize: "20px" }} />
                </ToolbarButton>

                <ToolbarDivider />

                <ToolbarButton
                    title="Bulleted List"
                    disabled={!editorView}
                    isActive={isBulletListActive}
                    onClick={() => executeCommand(toggleBulletList)}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="bi-bulleted" sx={{ width: "20px", height: "20px", fontSize: "20px" }} />
                </ToolbarButton>

                <ToolbarButton
                    title="Numbered List"
                    disabled={!editorView}
                    isActive={isOrderedListActive}
                    onClick={() => executeCommand(toggleOrderedList)}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="bi-numbered" sx={{ width: "20px", height: "20px", fontSize: "20px" }} />
                </ToolbarButton>

                <ToolbarDivider />

                <SplitButtonContainer ref={tableDropdownRef}>
                    <SplitButtonMain
                        title="Insert Table"
                        disabled={!editorView || cursorInTable}
                        onClick={() => setIsTableDialogOpen(true)}
                        onMouseDown={handleMouseDown}
                    >
                        <Icon name="bi-table" sx={{ width: "20px", height: "20px", fontSize: "20px" }} />
                    </SplitButtonMain>
                    <SplitButtonDropdown
                        title="Table operations"
                        disabled={!editorView || !cursorInTable}
                        onClick={() => setIsTableDropdownOpen(!isTableDropdownOpen)}
                        onMouseDown={handleMouseDown}
                    >
                        <Icon name="bi-arrow-down" sx={{ width: "16px", height: "16px", fontSize: "16px" }} />
                    </SplitButtonDropdown>
                    <DropdownMenu isOpen={isTableDropdownOpen}>
                        <MenuDropdownItem
                            onClick={() => { executeCommand(addRowAfter); setIsTableDropdownOpen(false); }}
                            onMouseDown={handleMouseDown}
                        >
                            Add Row Below
                        </MenuDropdownItem>
                        <MenuDropdownItem
                            onClick={() => { executeCommand(addColumnAfter); setIsTableDropdownOpen(false); }}
                            onMouseDown={handleMouseDown}
                        >
                            Add Column After
                        </MenuDropdownItem>
                        <MenuDropdownItem
                            onClick={() => { executeCommand(deleteRow); setIsTableDropdownOpen(false); }}
                            onMouseDown={handleMouseDown}
                        >
                            Delete Row
                        </MenuDropdownItem>
                        <MenuDropdownItem
                            onClick={() => { executeCommand(deleteColumn); setIsTableDropdownOpen(false); }}
                            onMouseDown={handleMouseDown}
                        >
                            Delete Column
                        </MenuDropdownItem>
                        <MenuDropdownItem
                            onClick={() => { executeCommand(deleteTable); setIsTableDropdownOpen(false); }}
                            onMouseDown={handleMouseDown}
                        >
                            Delete Table
                        </MenuDropdownItem>
                    </DropdownMenu>
                </SplitButtonContainer>

                <ToolbarDivider />

                <ToolbarButton
                    title={isEditorEmpty ? "Generate Prompt with AI" : "Enhance Prompt with AI"}
                    disabled={!editorView || isEnhancing || isInPreviewMode}
                    onClick={onEnhanceClick}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="wand-magic-sparkles-solid" sx={{ width: "16px", height: "16px", fontSize: "16px" }} />
                </ToolbarButton>
            </ToolbarButtonGroup>

            {onToggleView && (
                <Switch
                    checked={isSourceView}
                    leftLabel="Preview"
                    rightLabel="Source"
                    onChange={onToggleView}
                    checkedColor="var(--vscode-button-background)"
                    checkedBorder="1px solid color-mix(in srgb, var(--vscode-dropdown-border) 75%, transparent)"
                    enableTransition={false}
                    sx={{
                        borderColor: ThemeColors.OUTLINE_VARIANT
                    }}
                />
            )}

            <LinkDialog
                isOpen={isLinkDialogOpen}
                onClose={() => setIsLinkDialogOpen(false)}
                onInsert={handleInsertLink}
                initialTitle={selectedTextForLink}
            />

            <TableDialog
                isOpen={isTableDialogOpen}
                onClose={() => setIsTableDialogOpen(false)}
                onInsert={handleInsertTable}
            />
        </ToolbarContainer>
    );
});

RichTemplateMarkdownToolbar.displayName = 'RichTemplateMarkdownToolbar';
