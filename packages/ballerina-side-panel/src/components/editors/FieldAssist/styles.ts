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
import { css, keyframes } from "@emotion/react";
import { ThemeColors } from "@wso2/ui-toolkit";
import { FIELD_BORDER, FIELD_RADIUS } from "../MultiModeExpressionEditor/ChipExpressionEditor/constants";
import { StandardChip } from "../MultiModeExpressionEditor/ChipExpressionEditor/chipStyles";
import type { ReviewSide } from "./AssistHost";

// Copilot's accent and input look, so the helper reads as the same assistant as the orb chat.
const COPILOT_ACCENT = "var(--vscode-button-background)";
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
// Suggested answers and starters: an accent edge so they read as buttons on the open banner's tint.
const CHOICE_BORDER = `color-mix(in srgb, ${COPILOT_ACCENT} 50%, transparent)`;
// The open banner's tint, opaque so the thread scrolling under its pinned prompt never shows through.
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


// This popover hangs below its button, so it drops from it.
const dropIn = keyframes`
    from { opacity: 0; transform: translateY(-8px); }
`;

const liftOut = keyframes`
    to { opacity: 0; transform: translateY(-8px); }
`;

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

    export const ChangeSummary = styled.div`
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        column-gap: 12px;
        padding: 2px 4px;
        color: var(--vscode-foreground);
        overflow-wrap: anywhere;
        animation: ${fade} 150ms ${EASE_OUT};
        & > button {
            margin-left: auto;
        }
    `;









    export const Reveal = styled.div<{ closing?: boolean; gap?: "above" | "below"; still?: boolean }>`
        display: grid;
        grid-template-rows: 1fr;
        padding-top: ${({ gap }) => (gap === "above" ? "6px" : 0)};
        padding-bottom: ${({ gap }) => (gap === "below" ? "8px" : 0)};
        /* Some forms lay their rows out with align-items: flex-start, which would shrink the card to its content. */
        align-self: stretch;
        pointer-events: ${({ closing }) => (closing ? "none" : "auto")};
        animation: ${({ closing }) => (closing ? collapse : expand)} ${({ closing }) => (closing ? "120ms" : "180ms")} ${EASE_OUT} both;
        /* Remounted open after a form rebuild: nothing replays its entrance, except the loading shimmer. */
        ${({ still, closing }) => (still && !closing ? `animation: none; & *:not([role="status"]) { animation: none; }` : "")}
        & > * {
            min-height: 0;
            overflow: hidden;
        }
        @media (prefers-reduced-motion: reduce) {
            animation-name: ${({ closing }) => (closing ? fadeOut : fade)};
        }
    `;

    export const Card = styled.div`
        display: flex;
        flex-direction: column;
        max-height: 520px;
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
        &[aria-pressed="true"] {
            color: ${COPILOT_ACCENT};
        }
    `;








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
            /* The popover's 14px corner, inside its 1px border. */
            border-radius: 0 0 13px 13px;
            background-color: var(--vscode-editorWidget-background, ${ThemeColors.SURFACE_DIM});
        }
    `;

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

    // Under the field being reviewed, pointing up at it, or beside the form, pointing across at it; its padding plus the buttons' corners make its own.
    // The review card is one of Copilot's surfaces, so it takes the thread popover's background and border.
    const CARD_BACKGROUND = `var(--vscode-editorWidget-background, ${ThemeColors.SURFACE_DIM})`;
    const CARD_BORDER = `var(--vscode-editorWidget-border, ${FIELD_BORDER})`;

    // Beside the form it floats over the canvas or margin: above stacked panels (2010+), below modals (2100).
    export const ChangeCard = styled.div<{ beside?: boolean }>`
        position: ${({ beside }) => (beside ? "fixed" : "relative")};
        z-index: ${({ beside }) => (beside ? 2090 : "auto")};
        --change-diff-max-height: ${({ beside }) => (beside ? "min(320px, 50vh)" : "120px")};
        box-sizing: border-box;
        margin-top: ${({ beside }) => (beside ? 0 : "10px")};
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid ${CARD_BORDER};
        border-radius: var(--vscode-cornerRadius-large, 8px);
        background: ${CARD_BACKGROUND};
        box-shadow: ${({ beside }) => (beside
            ? "0 2px 4px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.16)"
            : "0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.06)")};
        color: var(--vscode-foreground);
        font-family: var(--vscode-font-family);
        font-size: 13px;
        line-height: 18px;
        animation: ${fade} 150ms ${EASE_OUT};
        @media (prefers-reduced-motion: reduce) {
            animation: none;
        }
    `;

    // Points at the field: up from under it, or across from the side the card sits on; beside, its top follows the field.
    const CARET_EDGES: Record<"under" | ReviewSide, string> = {
        under: `top: -6px; left: 24px; border-top: 1px solid ${CARD_BORDER}; border-left: 1px solid ${CARD_BORDER};`,
        start: `right: -6px; border-top: 1px solid ${CARD_BORDER}; border-right: 1px solid ${CARD_BORDER};`,
        end: `left: -6px; border-bottom: 1px solid ${CARD_BORDER}; border-left: 1px solid ${CARD_BORDER};`,
    };

    export const ChangeCaret = styled.span<{ side?: ReviewSide }>`
        position: absolute;
        ${({ side }) => CARET_EDGES[side ?? "under"]}
        width: 10px;
        height: 10px;
        box-sizing: border-box;
        transform: rotate(45deg);
        background: ${CARD_BACKGROUND};
        pointer-events: none;
    `;

    export const ChangeCardHead = styled.div`
        display: flex;
        align-items: center;
        gap: 2px;
        min-height: 24px;
        & > span:first-of-type {
            flex-grow: 1;
        }
    `;

    export const ReviewCount = styled.span`
        font-size: 12px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    `;

    // Revise asks again, at the start; the decision on this change, Undo then Keep, ends the row.
    export const ChangeActions = styled.div`
        display: flex;
        align-items: center;
        gap: 8px;
        & > :first-of-type {
            margin-right: auto;
        }
    `;

    export const GhostAction = styled.button`
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 24px;
        padding: 0 6px;
        border: none;
        border-radius: var(--vscode-cornerRadius-small, 4px);
        background: none;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        font-family: var(--vscode-font-family);
        font-size: 12px;
        line-height: 18px;
        cursor: pointer;
        & > * {
            color: ${COPILOT_ACCENT};
        }
        &:hover {
            color: var(--vscode-foreground);
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        &[aria-pressed="true"] {
            color: var(--vscode-foreground);
            background-color: var(--vscode-toolbar-activeBackground, var(--vscode-toolbar-hoverBackground));
        }
        &:focus-visible {
            outline: 2px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }
    `;

    export const HeadLink = styled.button`
        height: 24px;
        padding: 0 4px;
        border: none;
        border-radius: var(--vscode-cornerRadius-small, 4px);
        background: none;
        color: var(--vscode-textLink-foreground);
        font: inherit;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        &:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        &:focus-visible {
            outline: 2px solid var(--vscode-focusBorder);
            outline-offset: 2px;
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

    // Prose, such as a prompt, keeps the body font; values that are code use the editor's.
    export const Diff = styled.div<{ prose?: boolean }>`
        padding: 6px 8px;
        border: 1px solid ${FIELD_BORDER};
        border-radius: ${FIELD_RADIUS};
        background-color: var(--vscode-input-background);
        font-family: ${({ prose }) => (prose ? "inherit" : "var(--vscode-editor-font-family, monospace)")};
        font-size: ${({ prose }) => (prose ? "inherit" : "var(--vscode-editor-font-size, 12px)")};
        line-height: 20px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        max-height: var(--change-diff-max-height, 160px);
        overflow-y: auto;
    `;

    // One line of a value change; the bar says whether it is the old value, the new one, or an edit that marks both.
    export const DiffLine = styled.div<{ kind: "add" | "remove" | "edit" }>`
        display: flex;
        gap: 6px;
        padding-left: 6px;
        border-left: 2px solid ${({ kind }) => ({ add: ADDED, remove: REMOVED, edit: COPILOT_ACCENT })[kind]};
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

    // A word only one of the two values has, tinted like the editor's diff.
    export const Changed = styled.span<{ kind: "del" | "ins" }>`
        border-radius: 2px;
        text-decoration: ${({ kind }) => (kind === "del" ? "line-through" : "none")};
        background-color: ${({ kind }) => (kind === "del"
            ? "var(--vscode-diffEditor-removedTextBackground, rgba(255, 0, 0, 0.2))"
            : "var(--vscode-diffEditor-insertedTextBackground, rgba(156, 204, 44, 0.2))")};
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
        font-family: var(--vscode-font-family);
        font-size: 12px;
        line-height: 18px;
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

    // The change card shares the input's background, so its prompt takes the field's border to show.
    export const ReviseBox = styled(InputBox)`
        border-color: ${FIELD_BORDER};
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
        border: 1px solid ${CHOICE_BORDER};
        border-radius: var(--vscode-cornerRadius-medium, 6px);
        background-color: var(--vscode-input-background);
        color: var(--vscode-foreground);
        font: inherit;
        font-size: 12px;
        line-height: 18px;
        cursor: pointer;
        ${pressable}
        &:hover {
            border-color: ${COPILOT_ACCENT};
            background-color: color-mix(in srgb, ${COPILOT_ACCENT} 18%, var(--vscode-input-background));
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
        border: 1px solid ${CHOICE_BORDER};
        border-radius: var(--vscode-cornerRadius-medium, 6px);
        background-color: var(--vscode-input-background);
        color: var(--vscode-foreground);
        font: inherit;
        text-align: left;
        cursor: pointer;
        ${pressable}
        &:hover {
            border-color: ${COPILOT_ACCENT};
            background-color: color-mix(in srgb, ${COPILOT_ACCENT} 18%, var(--vscode-input-background));
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

    export const Tag = styled.span`
        display: inline-block;
        margin-left: 6px;
        padding: 0 5px;
        border-radius: var(--vscode-cornerRadius-small, 4px);
        font-size: 11px;
        line-height: 16px;
        color: var(--vscode-badge-foreground);
        background-color: var(--vscode-badge-background, rgba(128, 128, 128, 0.25));
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



    export const WasChip = styled(StandardChip)`
        margin: 0 2px;
        line-height: 1.4;
        cursor: default;
    `;
}


// Set on a field the form's Copilot changed, so the reveal and the edit check can find it.
export const CHANGED_FIELD = "data-copilot-changed";

// Inputs inside a changed field read these; the field's toolkit inputs take them through their parts.
export const changedFieldStyles = css`
    div[${CHANGED_FIELD}] {
        --field-changed-border: ${COPILOT_ACCENT};
        --field-changed-background: color-mix(in srgb, ${COPILOT_ACCENT} 6%, var(--vscode-input-background));
    }
    div[${CHANGED_FIELD}] vscode-dropdown::part(control),
    div[${CHANGED_FIELD}] vscode-text-field::part(root),
    div[${CHANGED_FIELD}] vscode-text-area::part(control) {
        border-color: var(--field-changed-border);
        background: var(--field-changed-background);
    }
`;
