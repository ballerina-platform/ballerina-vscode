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

import { FIELD_BORDER } from "@wso2/ballerina-side-panel";

const fadeIn = keyframes`
    from {
        opacity: 0;
    }
`;

export const CARD_WIDTH = 320;

const spin = keyframes`
    to {
        transform: rotate(360deg);
    }
`;

export namespace S {
    export const Container = styled.div`
        /* The search box reads this token: 0.8 of the 38px form controls, lighter for a header filter. */
        --input-height: calc(38 * 0.8);
        height: 100%;
        border-radius: inherit;
        display: flex;
        flex-direction: column;
        background-color: ${ThemeColors.SURFACE_DIM};
        font-family: GilmerRegular;
    `;

    // The search box starts 16px in, where the rows' icons do.
    export const Header = styled.div`
        display: flex;
        align-items: center;
        box-sizing: border-box;
        padding: 8px 16px;
        border-bottom: 1px solid var(--vscode-panel-border);
    `;

    export const Search = styled.div`
        position: relative;
        flex: 1;
        & vscode-text-field::part(control) {
            padding-right: 28px;
        }
    `;

    // Sits inside the search box's right edge; the box's own icon slot holds the search glyph.
    export const Clear = styled.button`
        position: absolute;
        top: 50%;
        right: 4px;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: none;
        border-radius: var(--vscode-cornerRadius-small, 4px);
        background: transparent;
        color: var(--vscode-descriptionForeground);
        cursor: pointer;
        &:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
            color: var(--vscode-foreground);
        }
    `;

    // Indent guide from the parent's chevron down along its fields.
    export const Children = styled.div<{ depth: number }>`
        position: relative;
        &::before {
            content: "";
            position: absolute;
            top: 0;
            bottom: 0;
            left: ${(props: { depth: number }) => 24 + props.depth * 16}px;
            width: 1px;
            background-color: var(--vscode-tree-indentGuidesStroke);
        }
    `;

    export const Tree = styled.div`
        flex: 1;
        overflow-y: auto;
        padding: 4px 0 8px;
        font-family: var(--vscode-font-family);
        font-size: 13px;
    `;

    export const Section = styled.section`
        & + & {
            margin-top: 8px;
        }
    `;

    // Sections are short and always open, so the title is a quiet label rather than a toggle.
    export const SectionTitle = styled.div`
        display: flex;
        align-items: center;
        height: 24px;
        padding: 4px 16px 0;
        font-size: 12px;
        font-weight: 500;
        color: var(--vscode-descriptionForeground);
    `;

    export const Row = styled.div<{ depth: number }>`
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 32px;
        margin: 0 8px;
        /* Only expandable rows draw a chevron; one level of indent puts children under the parent's icon. */
        padding: 0 8px 0 ${(props: { depth: number }) => 8 + props.depth * 16}px;
        border-radius: 4px;
        color: var(--vscode-editor-foreground);
        cursor: pointer;
        &:hover, &:focus-visible {
            background-color: ${ThemeColors.SURFACE_CONTAINER};
        }
        &:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }
    `;

    export const Chevron = styled.span`
        width: 16px;
        flex-shrink: 0;
        display: flex;
        justify-content: center;
        color: var(--vscode-descriptionForeground);
    `;

    export const InlineInput = styled.input<{ depth: number }>`
        display: block;
        box-sizing: border-box;
        width: calc(100% - ${(props: { depth: number }) => 32 + props.depth * 16}px);
        margin: 4px 16px 4px ${(props: { depth: number }) => 16 + props.depth * 16}px;
        padding: 3px 6px;
        border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
        border-radius: 3px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        font: inherit;
        &:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }
    `;

    export const Stepper = styled.span`
        display: inline-flex;
        gap: 2px;
    `;

    export const StepperButton = styled.button`
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        padding: 0;
        border: none;
        border-radius: 3px;
        background: transparent;
        color: var(--vscode-foreground);
        cursor: pointer;
        &:hover:not(:disabled) {
            background: var(--vscode-toolbar-hoverBackground);
        }
        &:disabled {
            opacity: 0.4;
            cursor: default;
        }
    `;

    export const InsertButton = styled(StepperButton)`
        display: none;
        flex-shrink: 0;
        [role="treeitem"]:hover > &, [role="treeitem"]:focus-visible > & {
            display: inline-flex;
        }
    `;

    // The name sizes to its text and the type pill gives way first.
    export const Name = styled.span`
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    `;

    // Quiet text rather than a pill, so the names lead; it gives way before the name does.
    export const Type = styled.span`
        flex: 0 1000 auto;
        min-width: 48px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: right;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
    `;

    export const Chips = styled.div`
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 4px 16px 6px;
    `;

    export const Chip = styled.button<{ active: boolean }>`
        height: 24px;
        padding: 0 8px;
        border-radius: var(--vscode-cornerRadius-medium, 6px);
        border: 1px solid ${(props: { active: boolean }) =>
            props.active ? "var(--vscode-focusBorder)" : "var(--vscode-panel-border)"};
        background: ${(props: { active: boolean }) =>
            props.active ? "color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent)" : "transparent"};
        color: ${(props: { active: boolean }) =>
            props.active ? "var(--vscode-foreground)" : "var(--vscode-descriptionForeground)"};
        font: inherit;
        font-size: 12px;
        cursor: pointer;
        &:hover {
            color: var(--vscode-foreground);
        }
    `;

    export const Operator = styled(Chip)`
        min-width: 32px;
        font-family: var(--vscode-editor-font-family, monospace);
    `;

    // Fills the space under the page header; the content scrolls on its own beside the browser.
    export const Page = styled.div`
        display: flex;
        flex: 1;
        min-height: 0;
    `;

    export const PageView = styled.div`
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
    `;






    export const HeaderButton = styled.button`
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 26px;
        height: 26px;
        margin-left: 8px;
        padding: 0;
        border: none;
        border-radius: var(--vscode-cornerRadius-small, 4px);
        background: transparent;
        color: var(--vscode-foreground);
        cursor: pointer;
        &:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
    `;

    export const Back = styled(HeaderButton)`
        width: 22px;
        height: 22px;
        margin-left: 0;
    `;

    // Names the open group under the search, so the back arrow always sits in the same place.
    export const GroupHeader = styled.div`
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        height: 36px;
        padding: 0 16px 0 10px;
        font-family: var(--vscode-font-family);
        font-size: 13px;
        font-weight: 500;
        color: var(--vscode-foreground);
    `;

    // An inset divider sets the groups apart from the flow's own values above them.
    export const Groups = styled.div`
        position: relative;
        margin-top: 8px;
        padding-top: 8px;
        &:not(:first-child)::before {
            content: "";
            position: absolute;
            top: 0;
            left: 16px;
            right: 16px;
            border-top: 1px solid var(--vscode-panel-border);
        }
    `;

    // Outside the tree, so it repeats the tree's font rather than the container's.
    export const Footer = styled.div`
        flex-shrink: 0;
        padding: 4px 0;
        border-top: 1px solid var(--vscode-panel-border);
        font-family: var(--vscode-font-family);
        font-size: 13px;
        & > button {
            margin-top: 0;
        }
    `;

    export const Empty = styled.div`
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 24px 16px 16px;
        color: var(--vscode-descriptionForeground);
        & > button {
            width: auto;
            margin: 0;
        }
    `;

    export const Count = styled.span`
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        color: var(--vscode-descriptionForeground);
    `;

    export const Module = styled.span`
        margin-left: 8px;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
    `;

    export const Link = styled.button`
        display: flex;
        align-items: center;
        gap: 8px;
        width: calc(100% - 16px);
        height: 32px;
        margin: 4px 8px 0;
        padding: 0 8px;
        border: none;
        border-radius: 4px;
        background: none;
        font: inherit;
        color: var(--vscode-textLink-foreground);
        cursor: pointer;
        &:hover {
            background-color: ${ThemeColors.SURFACE_CONTAINER};
        }
    `;

    // Pushed to the link's far edge, like a group row's chevron, for a link that opens a view.
    export const LinkChevron = styled.span`
        display: flex;
        margin-left: auto;
        color: var(--vscode-descriptionForeground);
    `;

    export const Spinner = styled.span`
        display: inline-flex;
        margin-right: 6px;
        vertical-align: middle;
        animation: ${spin} 1s linear infinite;
    `;

    export const Group = styled.div`
        padding: 8px 16px 2px;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
    `;

    // Rendered into the body: the side panel's transform would otherwise make it the card's containing block.
    export const Card = styled.div`
        position: fixed;
        z-index: 2100;
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: ${CARD_WIDTH}px;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid var(--vscode-editorHoverWidget-border);
        border-radius: var(--vscode-cornerRadius-medium, 6px);
        background-color: var(--vscode-editorHoverWidget-background);
        color: var(--vscode-editorHoverWidget-foreground);
        box-shadow: 0 4px 12px var(--vscode-widget-shadow);
        font-family: var(--vscode-font-family);
        font-size: 12px;
        pointer-events: none;
        animation: ${fadeIn} 120ms ease-out;
    `;

    export const CardSignature = styled.div`
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: var(--vscode-editor-font-family);
        overflow-wrap: anywhere;
    `;

    // Ends on an ellipsis rather than mid-line; a hover card is a summary, not the reference.
    export const CardText = styled.div`
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 8;
        overflow: hidden;
        line-height: 18px;
        color: var(--vscode-descriptionForeground);
        & p {
            margin: 0 0 4px;
        }
        & code {
            font-family: var(--vscode-editor-font-family);
        }
    `;

    export const Retry = styled.button`
        margin-left: 6px;
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        color: var(--vscode-textLink-foreground);
        cursor: pointer;
        &:hover {
            text-decoration: underline;
        }
    `;

    export const Note = styled.div<{ depth: number }>`
        padding: 6px 16px 6px ${(props: { depth: number }) => 16 + props.depth * 16}px;
        color: var(--vscode-descriptionForeground);
    `;
}
