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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react";
import { Codicon, Confirm, Icon, ProgressRing, ThemeColors, Tooltip, Typography } from "@wso2/ui-toolkit";
import { isValidConfigurableName } from "./configurables";
import type { RenameConfirmation } from "./useConfigurableRename";

export const CONFIGURABLE_HELP =
    "Saves the value as a configurable, outside your code. It can be set again when you deploy.";

const INVALID_NAME = "Use letters, digits and _, and don't start with a digit.";

/**
 * The confirmation opens under the line, over the form; above the record editor's modal (2100) and its expanded
 * editor (2101) too, when the line is in it. Long names wrap rather than spill out of it.
 */
const CONFIRM_SX = { zIndex: 2200, overflowWrap: "anywhere" };

/** The spinner in place of the ✓ while the configurable is renamed, as big as the ✓. */
const PROGRESS_SX = { width: "14px", height: "14px", flexShrink: 0 };

const Wrapper = styled.div({
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
    fontSize: "12px",
    lineHeight: "18px",
    color: "var(--vscode-foreground)",
});

/** One line, never wrapped: a long name is cut short, so the rename and info icons stay beside it. */
const Line = styled.div({
    display: "flex",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: "6px",
    minHeight: "22px",
    minWidth: 0,
});

/** Keeps an item at its own width, so only the name gives way. */
const Fixed = styled.span({
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
});

const Toggle = styled("label", { shouldForwardProp: (prop) => prop !== "on" })<{ on: boolean }>(({ on }: { on: boolean }) => ({
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    gap: "6px",
    cursor: "pointer",
    color: on ? "var(--vscode-foreground)" : ThemeColors.ON_SURFACE_VARIANT,
}));

const Name = styled.span({
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "11.5px",
    padding: "0 6px",
    borderRadius: "3px",
    background: "var(--vscode-textCodeBlock-background)",
    color: "var(--vscode-textPreformat-foreground)",
});

const NameInput = styled("input", { shouldForwardProp: (prop) => prop !== "invalid" })<{ invalid: boolean }>(({ invalid }: { invalid: boolean }) => ({
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "11.5px",
    flexShrink: 1,
    minWidth: "80px",
    width: "220px",
    padding: "1px 6px",
    borderRadius: "3px",
    color: "var(--vscode-input-foreground)",
    background: "var(--vscode-input-background)",
    border: `1px solid ${invalid ? "var(--vscode-inputValidation-errorBorder)" : "var(--vscode-focusBorder)"}`,
    outline: "none",
}));

const IconButton = styled.button({
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    padding: "0 2px",
    border: 0,
    background: "transparent",
    color: ThemeColors.ON_SURFACE_VARIANT,
    cursor: "pointer",
});

const Problem = styled.span({
    color: "var(--vscode-errorForeground)",
});

const Note = styled.span({
    color: ThemeColors.ON_SURFACE_VARIANT,
});

export interface ConfigurableLineProps {
    /** The field's path in the record, which names the line's elements for tests. */
    path: string;
    /** Whether the field's value is made configurable. */
    on: boolean;
    /** The configurable's name, once the language server has worked it out or the user has given one. */
    name?: string;
    /** Why the field can't get this configurable, as the language server reports it. */
    error?: string;
    /** Whether the connection already uses this configurable, so renaming it renames it across the project. */
    existing?: boolean;
    /** Whether the name is being edited; `draft` holds what has been typed. */
    editing: boolean;
    draft?: string;
    /** Whether the configurable is being renamed across the project, so the name can't be edited meanwhile. */
    busy?: boolean;
    /** Asks the user to agree to renaming the configurable across the project, while they are asked. */
    confirmation?: RenameConfirmation;
    onToggle: (on: boolean) => void;
    onStartRename: () => void;
    onDraftChange: (draft: string) => void;
    onCommit: () => void;
    onCancel: () => void;
}

/**
 * The line under a connection field's value that makes it configurable: a checkbox, the configurable's generated
 * name, which the user can rename, and a tooltip saying what it does.
 */
export function ConfigurableLine(props: ConfigurableLineProps) {
    const { path, on, name, error, existing, editing, draft, busy, confirmation, onToggle, onStartRename, onDraftChange,
        onCommit, onCancel } = props;
    const invalidDraft = editing && draft !== undefined && !isValidConfigurableName(draft.trim());
    // The confirmation opens under the line, so it needs the line's element once drawn.
    const [lineElement, setLineElement] = useState<HTMLDivElement | null>(null);

    return (
        <Wrapper ref={setLineElement} data-testid={`record-form-configurable-${path}`}>
            <Line>
                <Toggle on={on}>
                    <VSCodeCheckbox
                        checked={on}
                        aria-label="Make configurable"
                        data-testid={`record-form-configurable-toggle-${path}`}
                        // vscode-checkbox also reports a change when React sets `checked`; only a change away from
                        // what the line shows is the user's.
                        onChange={(event: Event | React.FormEvent<HTMLElement>) => {
                            const checked = (event.target as HTMLInputElement).checked;
                            if (checked !== on) {
                                onToggle(checked);
                            }
                        }}
                    />
                    <Icon
                        name="configurable-icon"
                        sx={{ fontSize: "14px", width: "14px", height: "14px", display: "flex", alignItems: "center",
                            justifyContent: "center", cursor: "inherit" }}
                        iconSx={{ fontSize: "10.5px" }}
                    />
                    <span>Make configurable</span>
                </Toggle>
                {on && editing && (
                    <>
                        <NameInput
                            autoFocus
                            invalid={invalidDraft}
                            aria-label="Configurable name"
                            aria-invalid={invalidDraft}
                            data-testid={`record-form-configurable-name-input-${path}`}
                            disabled={busy}
                            value={draft ?? name ?? ""}
                            onChange={(event) => onDraftChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (busy) {
                                    return;
                                }
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    onCommit();
                                } else if (event.key === "Escape") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onCancel();
                                }
                            }}
                        />
                        {busy ? (
                            <Fixed role="status" aria-label="Renaming configurable"
                                data-testid={`record-form-configurable-renaming-${path}`}>
                                <ProgressRing sx={PROGRESS_SX} />
                            </Fixed>
                        ) : (
                            <IconButton type="button" aria-label="Done" onClick={onCommit}>
                                <Codicon name="check" />
                            </IconButton>
                        )}
                    </>
                )}
                {on && !editing && name && (
                    <>
                        <Name data-testid={`record-form-configurable-name-${path}`} title={name}>{name}</Name>
                        <IconButton
                            type="button"
                            aria-label="Rename configurable"
                            data-testid={`record-form-configurable-rename-${path}`}
                            onClick={onStartRename}
                        >
                            <Codicon name="edit" />
                        </IconButton>
                    </>
                )}
                <Fixed>
                    <Tooltip
                        content={<Typography variant="body3">{CONFIGURABLE_HELP}</Typography>}
                        // Opens below and inward, as the icon sits near the modal's right edge.
                        position="bottom-end"
                        sx={{ maxWidth: "300px", whiteSpace: "normal", pointerEvents: "none" }}
                    >
                        <Codicon name="info" sx={{ color: ThemeColors.ON_SURFACE_VARIANT, cursor: "help" }} />
                    </Tooltip>
                </Fixed>
            </Line>
            {on && editing && busy && <Note>Renaming and updating all references across the project…</Note>}
            {on && editing && existing && !busy && !invalidDraft && (
                <Note>Note: Renaming will update all references across the project</Note>
            )}
            {invalidDraft && <Problem role="alert">{INVALID_NAME}</Problem>}
            {on && !invalidDraft && error && <Problem role="alert">{error}</Problem>}
            {confirmation && lineElement && (
                <Confirm
                    isOpen={true}
                    anchorEl={lineElement}
                    anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                    transformOrigin={{ vertical: "top", horizontal: "left" }}
                    message={confirmation.message}
                    confirmText="Rename"
                    sx={CONFIRM_SX}
                    onConfirm={confirmation.onConfirm}
                />
            )}
        </Wrapper>
    );
}
