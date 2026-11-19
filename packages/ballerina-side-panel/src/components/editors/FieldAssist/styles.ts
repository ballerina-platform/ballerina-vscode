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

import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { ThemeColors } from "@wso2/ui-toolkit";
import { FIELD_BORDER, FIELD_RADIUS } from "../MultiModeExpressionEditor/ChipExpressionEditor/constants";

// Copilot's accent and input look, so the helper reads as the same assistant as the orb chat.
const COPILOT_ACCENT = "var(--vscode-button-background)";
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const PANEL_PADDING = 6;
const ADDED = "var(--vscode-gitDecoration-addedResourceForeground, #81b88b)";
const REMOVED = "var(--vscode-gitDecoration-deletedResourceForeground, #c74e39)";

const rise = keyframes`
    from { opacity: 0; transform: translateY(-4px); }
`;

const fade = keyframes`
    from { opacity: 0; }
`;

const bubbleIn = keyframes`
    from { opacity: 0; transform: translateY(4px) scale(0.97); }
`;

const fadeOut = keyframes`
    to { opacity: 0; }
`;

// The orb chat's entry, mirrored: this popover hangs below its button, so it drops from it.
const dropIn = keyframes`
    from { opacity: 0; transform: translateY(-8px); }
`;

const liftOut = keyframes`
    to { opacity: 0; transform: translateY(-8px); }
`;

const WARNING = "var(--vscode-editorWarning-foreground, #cca700)";

const shimmer = keyframes`
    from { background-position: 100% 0; }
    to { background-position: -100% 0; }
`;

// Tactile press shared by every button in the helper.
const pressable = `
    transition: transform 100ms ${EASE_OUT}, background-color 150ms ease, color 150ms ease;
    &:active:not(:disabled) {
        transform: scale(0.96);
    }
    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 1px;
    }
`;

const expand = keyframes`
    from { grid-template-rows: 0fr; padding-top: 0; padding-bottom: 0; opacity: 0; }
`;

const collapse = keyframes`
    to { grid-template-rows: 0fr; padding-top: 0; padding-bottom: 0; opacity: 0; }
`;

export namespace S {
    // The header's button around the app's Copilot orb, which draws its own sphere, glow and states.
    export const HeaderOrb = styled.button`
        position: relative;
        flex-shrink: 0;
        width: 28px;
        height: 28px;
        padding: 0;
        border: none;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--vscode-foreground);
        background: none;
        transition: transform 100ms ${EASE_OUT};
        animation: ${fade} 180ms ${EASE_OUT};
        &:active {
            transform: scale(0.96);
        }
        &:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }
        /* Not while open: the thread below already says what it is. */
        @media (hover: hover) and (pointer: fine) {
            &:hover:not([aria-pressed="true"]) > span:last-child {
                opacity: 1;
                transform: none;
                transition-delay: 400ms;
            }
        }
        &:focus-visible:not([aria-pressed="true"]) > span:last-child {
            opacity: 1;
            transform: none;
        }
    `;

    // The orb's name, under it and flush with its right edge so it stays inside the panel.
    export const OrbTip = styled.span`
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 10;
        padding: 4px 8px;
        border: 1px solid var(--vscode-editorHoverWidget-border, ${FIELD_BORDER});
        border-radius: 4px;
        background-color: var(--vscode-editorHoverWidget-background, ${ThemeColors.SURFACE_DIM});
        box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
        color: var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground));
        font-family: var(--vscode-font-family);
        font-size: 12px;
        line-height: 18px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transform: translateY(-2px);
        transition: opacity 120ms ease, transform 120ms ${EASE_OUT};
        @media (prefers-reduced-motion: reduce) {
            transform: none;
        }
    `;

    // The first-use hint, a speech bubble from the orb; clicks reach the orb.
    export const OrbHint = styled(OrbTip)<{ shown: boolean }>`
        top: calc(100% + 10px);
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 13px;
        pointer-events: ${({ shown }) => (shown ? "auto" : "none")};
        cursor: pointer;
        opacity: ${({ shown }) => (shown ? 1 : 0)};
        transform: ${({ shown }) => (shown ? "none" : "translateY(-4px)")};
        transition: opacity 180ms ${EASE_OUT}, transform 180ms ${EASE_OUT};
        &::before {
            content: "";
            position: absolute;
            top: -5px;
            right: 10px;
            width: 8px;
            height: 8px;
            background: inherit;
            border-top: inherit;
            border-left: inherit;
            transform: rotate(45deg);
        }
    `;

    // Opens and closes a card in the form's flow; the borderless wrapper inside clips, so the row closes fully.
    export const Reveal = styled.div<{ closing?: boolean; gap?: "above" | "below" }>`
        display: grid;
        grid-template-rows: 1fr;
        padding-top: ${({ gap }) => (gap === "above" ? "6px" : 0)};
        padding-bottom: ${({ gap }) => (gap === "below" ? "8px" : 0)};
        /* Some forms lay their rows out with align-items: flex-start, which would shrink the card to its content. */
        align-self: stretch;
        pointer-events: ${({ closing }) => (closing ? "none" : "auto")};
        animation: ${({ closing }) => (closing ? collapse : expand)} ${({ closing }) => (closing ? "120ms" : "180ms")} ${EASE_OUT} both;
        & > * {
            min-height: 0;
            overflow: hidden;
        }
        @media (prefers-reduced-motion: reduce) {
            animation-name: ${({ closing }) => (closing ? fadeOut : fade)};
        }
    `;

    // The form's thread under the header's Copilot button, above the page and any popup; laid out as the orb's chat.
    export const OrbPopover = styled.div<{ closing?: boolean; detached?: boolean }>`
        position: fixed;
        pointer-events: ${({ closing }) => (closing ? "none" : "auto")};
        animation: ${({ closing }) => (closing ? liftOut : dropIn)} ${({ closing }) => (closing ? "120ms" : "180ms")} ${EASE_OUT} both;
        @media (prefers-reduced-motion: reduce) {
            animation-name: ${({ closing }) => (closing ? fadeOut : fade)};
        }
        /* The popover moves as one piece; the inline card's height reveal stays off here. */
        & > * {
            animation: none;
        }
        z-index: 3000;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
        border-radius: 14px;
        & [role="region"] {
            border-radius: 14px;
            font-size: 13px;
        }
        & .copilot-header {
            gap: 8px;
            padding: 10px 12px;
            cursor: ${({ detached }) => (detached ? "move" : "grab")};
            user-select: none;
        }
        /* A long thread scrolls under the header; the prompt stays pinned to the bottom. */
        & .copilot-panel {
            padding: 12px 12px 0;
            min-height: 0;
            overflow-y: auto;
        }
        & .copilot-prompt {
            position: sticky;
            bottom: 0;
            margin: 4px -12px 0;
            padding: 10px 12px;
            border-top: 1px solid var(--vscode-editorWidget-border, ${FIELD_BORDER});
            background-color: var(--vscode-editorWidget-background, ${ThemeColors.SURFACE_DIM});
        }
    `;

    export const Card = styled.div`
        display: flex;
        flex-direction: column;
        max-height: min(520px, var(--popover-max-height, 520px));
        border: 1px solid var(--vscode-editorWidget-border, ${FIELD_BORDER});
        border-radius: var(--vscode-cornerRadius-large, 8px);
        background-color: var(--vscode-editorWidget-background, ${ThemeColors.SURFACE_DIM});
        color: var(--vscode-foreground);
        font-family: var(--vscode-font-family);
        font-size: 12px;
        line-height: 18px;
    `;

    export const PopoverHeader = styled.div`
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        padding: 8px 8px 8px 12px;
        border-bottom: 1px solid var(--vscode-editorWidget-border, ${FIELD_BORDER});
        color: var(--vscode-foreground);
    `;

    export const PopoverTitle = styled.span`
        font-weight: 600;
    `;

    export const ScopeChip = styled.span`
        display: inline-flex;
        align-items: center;
        gap: 2px;
        min-width: 0;
        height: 20px;
        padding: 0 8px;
        border-radius: 10px;
        color: var(--vscode-foreground);
        background-color: color-mix(in srgb, ${COPILOT_ACCENT} 18%, transparent);
        animation: ${fade} 150ms ${EASE_OUT};
    `;

    export const ScopeLabel = styled.span`
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    `;

    export const ScopeMuted = styled.span`
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        animation: ${fade} 150ms ${EASE_OUT};
    `;

    export const HeaderSpacer = styled.span`
        flex: 1;
    `;

    export const HeaderButton = styled.button`
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: var(--vscode-cornerRadius-small, 4px);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        background: transparent;
        ${pressable}
        &:hover {
            color: ${ThemeColors.ON_SURFACE};
            background-color: var(--vscode-toolbar-hoverBackground);
        }
    `;

    export const PopoverBody = styled.div`
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
    `;

    export const FieldButton = styled.button<{ active?: boolean }>`
        width: 20px;
        height: 20px;
        padding: 0;
        border: none;
        border-radius: var(--vscode-cornerRadius-small, 4px);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        outline: none;
        /* Open reads as a pressed toolbar button, like the field's other buttons, not as a coloured one. */
        color: ${({ active }) => (active ? ThemeColors.ON_SURFACE : ThemeColors.ON_SURFACE_VARIANT)};
        background-color: ${({ active }) => (active ? "var(--vscode-toolbar-activeBackground, var(--vscode-toolbar-hoverBackground))" : "transparent")};
        ${pressable}
        &:hover {
            color: ${ThemeColors.ON_SURFACE};
            background-color: var(--vscode-toolbar-hoverBackground);
        }
    `;

    export const Panel = styled.div`
        margin-top: 6px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: ${PANEL_PADDING}px;
        border: 1px solid ${FIELD_BORDER};
        /* Concentric with the field-radius controls inside it. */
        border-radius: calc(${FIELD_RADIUS} + ${PANEL_PADDING}px);
        background-color: var(--vscode-editorWidget-background, ${ThemeColors.SURFACE_DIM});
        /* Set here, not inherited: the side panel's own font would reach the form-level helper only. */
        font-family: var(--vscode-font-family);
        font-size: 12px;
        line-height: 18px;
        animation: ${rise} 160ms ${EASE_OUT};
        @media (prefers-reduced-motion: reduce) {
            animation-name: ${fade};
        }
    `;

    // The shell inside the popover: the popover is the card, so the thread sits flat in it.
    export const EmbeddedPanel = styled.div`
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
    `;

    export const Hint = styled.div`
        padding: 0 2px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    `;

    export const History = styled.div`
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        padding: 2px 2px 0;
    `;

    // As in the Copilot orb's chat.
    export const Bubble = styled.div`
        max-width: 85%;
        padding: 6px 10px;
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 10px;
        color: var(--vscode-input-foreground);
        background-color: var(--vscode-input-background);
        font-size: 13px;
        line-height: normal;
        white-space: pre-wrap;
        overflow-wrap: break-word;
        transform-origin: right bottom;
        animation: ${bubbleIn} 160ms ${EASE_OUT};
        @media (prefers-reduced-motion: reduce) {
            animation-name: ${fade};
        }
    `;

    export const Status = styled.div`
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 6px;
        color: transparent;
        background: linear-gradient(90deg, ${ThemeColors.ON_SURFACE_VARIANT} 40%, ${COPILOT_ACCENT} 50%, ${ThemeColors.ON_SURFACE_VARIANT} 60%);
        background-size: 200% 100%;
        background-clip: text;
        -webkit-background-clip: text;
        animation: ${shimmer} 1.6s linear infinite;
        & > * {
            color: ${COPILOT_ACCENT};
        }
        @media (prefers-reduced-motion: reduce) {
            animation: none;
            color: ${ThemeColors.ON_SURFACE_VARIANT};
        }
    `;

    export const Message = styled.div`
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 4px 6px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        overflow-wrap: anywhere;
        animation: ${fade} 150ms ${EASE_OUT};
        /* One line box tall, so the icon centres on the first line however many lines wrap. */
        & > :first-child {
            flex: none;
            display: flex;
            align-items: center;
            height: 18px;
        }
    `;

    export const Proposal = styled.div`
        display: flex;
        flex-direction: column;
        gap: 6px;
        animation: ${fade} 150ms ${EASE_OUT};
    `;

    export const Diff = styled.div`
        padding: 6px 8px;
        border: 1px solid ${FIELD_BORDER};
        border-radius: ${FIELD_RADIUS};
        background-color: var(--vscode-input-background);
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: var(--vscode-editor-font-size, 12px);
        line-height: 20px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        max-height: 160px;
        overflow-y: auto;
    `;

    export const Changes = styled.div`
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 6px 8px;
        border: 1px solid ${FIELD_BORDER};
        border-radius: ${FIELD_RADIUS};
        background-color: var(--vscode-input-background);
        max-height: 240px;
        overflow-y: auto;
    `;

    export const ChangesHeading = styled.div`
        padding-top: 6px;
        border-top: 1px solid ${FIELD_BORDER};
        font-size: 11px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    `;

    export const Change = styled.div`
        display: flex;
        flex-direction: column;
        gap: 2px;
    `;

    export const ChangeLabel = styled.div`
        display: flex;
        align-items: center;
        gap: 4px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    `;

    export const ChangeMark = styled.span<{ removed?: boolean }>`
        width: 10px;
        text-align: center;
        color: ${({ removed }) => (removed ? REMOVED : ADDED)};
    `;

    // One line of a value change; the bar says whether it is the old value or the new one.
    export const DiffLine = styled.div<{ kind?: "add" | "remove" }>`
        display: flex;
        gap: 6px;
        /* An inline edit has no bar, so it lines up with its label. */
        padding-left: ${({ kind }) => (kind ? "6px" : "0")};
        border-left: ${({ kind }) => (kind ? `2px solid ${kind === "add" ? ADDED : REMOVED}` : "none")};
        & + & {
            margin-top: 2px;
        }
    `;

    export const LineSign = styled.span<{ removed?: boolean }>`
        flex-shrink: 0;
        width: 8px;
        user-select: none;
        color: ${({ removed }) => (removed ? REMOVED : ADDED)};
    `;

    export const OldValue = styled.span`
        min-width: 0;
        text-decoration: line-through;
        opacity: 0.6;
    `;

    export const NewValue = styled.span`
        min-width: 0;
    `;

    export const ChangeValue = styled.div`
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: var(--vscode-editor-font-size, 12px);
        line-height: 20px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    `;

    export const Inserted = styled.span`
        color: var(--vscode-foreground);
        background-color: var(--vscode-diffEditor-insertedTextBackground, rgba(156, 204, 44, 0.2));
        border-radius: 2px;
    `;

    export const Deleted = styled.span`
        text-decoration: line-through;
        opacity: 0.6;
        background-color: var(--vscode-diffEditor-removedTextBackground, rgba(255, 0, 0, 0.2));
        border-radius: 2px;
    `;

    export const Note = styled.div`
        padding: 0 2px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    `;

    export const Actions = styled.div`
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 2px;
    `;

    const ActionButton = styled.button`
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 24px;
        padding: 0 10px;
        border-radius: var(--vscode-cornerRadius-small, 4px);
        font-size: 12px;
        cursor: pointer;
        ${pressable}
    `;

    export const Primary = styled(ActionButton)`
        border: none;
        color: var(--vscode-button-foreground);
        background-color: var(--vscode-button-background);
        &:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    `;

    export const Secondary = styled(ActionButton)`
        border: 1px solid ${FIELD_BORDER};
        color: var(--vscode-foreground);
        background-color: transparent;
        &:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
    `;

    export const Key = styled.kbd`
        font-family: var(--vscode-font-family);
        font-size: 10px;
        line-height: 14px;
        padding: 0 4px;
        border: none;
        border-radius: 3px;
        box-shadow: none;
        color: inherit;
        opacity: 0.75;
        background-color: color-mix(in srgb, currentColor 16%, transparent);
    `;

    // As in the Copilot orb's chat: the input box, with the send button beside it.
    export const Prompt = styled.div`
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    export const InputBox = styled.div`
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 8px;
        background-color: var(--vscode-input-background);
        transition: border-color 150ms ease;
        &:focus-within {
            border-color: var(--vscode-focusBorder);
        }
    `;

    export const Input = styled.textarea`
        flex: 1;
        min-width: 0;
        max-height: 120px;
        padding: 0;
        border: none;
        outline: none;
        resize: none;
        field-sizing: content;
        font-family: var(--vscode-font-family);
        font-size: 13px;
        line-height: normal;
        color: var(--vscode-input-foreground);
        background: transparent;
        &::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
    `;

    export const Send = styled.button`
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--vscode-button-foreground);
        background-color: ${COPILOT_ACCENT};
        ${pressable}
        &:hover:not(:disabled) {
            background-color: var(--vscode-button-hoverBackground);
        }
        &:disabled {
            cursor: default;
            opacity: 0.4;
        }
    `;

    export const FixButton = styled.button`
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 4px;
        height: 20px;
        padding: 0 6px;
        border: none;
        border-radius: var(--vscode-cornerRadius-small, 4px);
        font-size: 12px;
        cursor: pointer;
        /* Tinted from the error box's own text colour, so it sits on the red rather than fighting it. */
        color: inherit;
        background-color: color-mix(in srgb, currentColor 10%, transparent);
        ${pressable}
        &:hover {
            background-color: color-mix(in srgb, currentColor 18%, transparent);
        }
    `;

    // Points from the popover to the orb it opened from; hidden once the popover is dragged away.
    export const PopoverCaret = styled.span`
        position: absolute;
        top: -6px;
        z-index: 1;
        width: 12px;
        height: 12px;
        box-sizing: border-box;
        transform: rotate(45deg);
        background-color: var(--vscode-editorWidget-background, ${ThemeColors.SURFACE_DIM});
        border-top: 1px solid var(--vscode-editorWidget-border, ${FIELD_BORDER});
        border-left: 1px solid var(--vscode-editorWidget-border, ${FIELD_BORDER});
    `;

    export const Starters = styled.div`
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 0 2px;
    `;

    // Under a hint they sit closer to the prompt they fill than to the hint; alone they line up with the prompt.
    export const StarterChips = styled.div<{ afterHint?: boolean }>`
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: ${({ afterHint }) => (afterHint ? "6px 0 -4px" : "0")};
        padding: 0 ${({ afterHint }) => (afterHint ? "2px" : "0")};
    `;

    export const Pill = styled.button`
        padding: 2px 10px;
        border: 1px solid var(--vscode-editorWidget-border, ${FIELD_BORDER});
        border-radius: 999px;
        background-color: transparent;
        color: var(--vscode-foreground);
        font: inherit;
        font-size: 12px;
        line-height: 18px;
        cursor: pointer;
        ${pressable}
        &:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        &:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 1px;
        }
    `;

    export const Reply = styled.div`
        padding: 2px 4px;
        color: var(--vscode-foreground);
        overflow-wrap: anywhere;
        animation: ${fade} 150ms ${EASE_OUT};
    `;

    export const Chip = styled.button`
        padding: 6px 10px;
        border: 1px solid var(--vscode-editorWidget-border, ${FIELD_BORDER});
        border-radius: var(--vscode-cornerRadius-medium, 6px);
        background-color: transparent;
        color: var(--vscode-foreground);
        font: inherit;
        text-align: left;
        cursor: pointer;
        ${pressable}
        &:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        &:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }
    `;

    export const Question = styled.div`
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 0 2px;
        animation: ${fade} 150ms ${EASE_OUT};
    `;

    export const Declined = styled.div`
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px 12px;
        border: 1px solid color-mix(in srgb, ${WARNING} 45%, transparent);
        border-radius: var(--vscode-cornerRadius-medium, 6px);
        background-color: color-mix(in srgb, ${WARNING} 8%, transparent);
        animation: ${fade} 150ms ${EASE_OUT};
    `;

    export const DeclinedTitle = styled.div`
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        & > :first-child {
            display: flex;
            color: ${WARNING};
        }
    `;

    export const Handoff = styled.div`
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 12px;
        border: 1px solid color-mix(in srgb, ${COPILOT_ACCENT} 45%, transparent);
        border-radius: var(--vscode-cornerRadius-medium, 6px);
        background-color: color-mix(in srgb, ${COPILOT_ACCENT} 8%, transparent);
        animation: ${fade} 150ms ${EASE_OUT};
    `;

    export const HandoffTitle = styled.div`
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
    `;

    export const HandoffActions = styled.div`
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 2px;
    `;

    export const Muted = styled.span`
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    `;

    export const ChangeRow = styled.label`
        display: flex;
        align-items: flex-start;
        gap: 8px;
        cursor: pointer;
        & > input {
            flex: none;
            margin: 3px 0 0;
            accent-color: var(--vscode-button-background);
        }
    `;

    export const ChangeBody = styled.div<{ off?: boolean }>`
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
        opacity: ${({ off }) => (off ? 0.55 : 1)};
    `;

    export const Tag = styled.span`
        display: inline-block;
        margin-left: 6px;
        padding: 0 5px;
        border-radius: var(--vscode-cornerRadius-small, 4px);
        font-size: 11px;
        line-height: 16px;
        color: var(--vscode-foreground);
        background-color: var(--vscode-badge-background, rgba(128, 128, 128, 0.25));
    `;

    export const AppliedBar = styled.div`
        display: flex;
        align-items: center;
        gap: 8px;
        align-self: stretch;
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 12px;
        padding: 6px 8px 6px 10px;
        border-radius: var(--vscode-cornerRadius-medium, 6px);
        font-family: var(--vscode-font-family);
        font-size: 13px;
        color: var(--vscode-foreground);
        background-color: color-mix(in srgb, ${COPILOT_ACCENT} 14%, transparent);
        animation: ${fade} 150ms ${EASE_OUT};
        & > span {
            flex: 1;
        }
    `;

    export const BarButton = styled.button`
        height: 22px;
        padding: 0 8px;
        border: 1px solid color-mix(in srgb, ${COPILOT_ACCENT} 60%, transparent);
        border-radius: var(--vscode-cornerRadius-small, 4px);
        background-color: transparent;
        color: var(--vscode-foreground);
        font: inherit;
        cursor: pointer;
        ${pressable}
        &:hover {
            background-color: color-mix(in srgb, ${COPILOT_ACCENT} 20%, transparent);
        }
    `;

    export const MarkWrap = styled.div`
        position: relative;
        margin-top: 4px;
    `;

    export const Mark = styled.button`
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0 6px;
        border: none;
        border-radius: var(--vscode-cornerRadius-small, 4px);
        font-family: var(--vscode-font-family);
        font-size: 11px;
        line-height: 18px;
        cursor: pointer;
        color: var(--vscode-foreground);
        background-color: color-mix(in srgb, ${COPILOT_ACCENT} 18%, transparent);
        &[aria-expanded="true"], &:hover {
            background-color: color-mix(in srgb, ${COPILOT_ACCENT} 30%, transparent);
        }
    `;

    export const MarkCard = styled.div`
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        z-index: 20;
        width: min(300px, 100%);
        box-sizing: border-box;
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        gap: 4px 10px;
        padding: 10px 12px;
        border: 1px solid var(--vscode-editorHoverWidget-border, ${FIELD_BORDER});
        border-radius: var(--vscode-cornerRadius-medium, 6px);
        background-color: var(--vscode-editorHoverWidget-background, ${ThemeColors.SURFACE_DIM});
        box-shadow: 0 4px 16px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
        font-family: var(--vscode-font-family);
        font-size: 12px;
        overflow-wrap: anywhere;
        & > button {
            grid-column: 1 / -1;
            justify-self: start;
            margin-top: 4px;
        }
    `;
}
