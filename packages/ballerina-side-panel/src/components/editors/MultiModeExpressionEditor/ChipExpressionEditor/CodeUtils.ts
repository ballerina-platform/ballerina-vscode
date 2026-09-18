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

import { StateEffect, StateField, RangeSet, Transaction, SelectionRange, Annotation } from "@codemirror/state";
import { WidgetType, Decoration, ViewPlugin, EditorView, ViewUpdate } from "@codemirror/view";
import {
    filterCompletionsByPrefixAndType,
    getParsedExpressionTokens,
    detectTokenPatterns,
    getTokenIndicesInClosedExpressionRanges,
    ParsedToken
} from "./utils";
import { HELPER_PANE_WIDTH } from "./constants";
import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import { CompletionItem, FnSignatureDocumentation } from "@wso2/ui-toolkit";
import { ThemeColors } from "@wso2/ui-toolkit";
import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { TokenType, TokenMetadata, CompoundTokenSequence } from "./types";
import {
    CHIP_TEXT_STYLES,
    BASE_CHIP_STYLES,
    BASE_ICON_STYLES,
    getTokenIconClass,
    getTokenTypeColor,
    getChipDisplayContent,
    shouldRenderAsEmptySpace,
    isEditableValueChip
} from "./chipStyles";
import React from "react";

export type TokenStream = number[];

export type TokensChangePayload = {
    tokens: TokenStream;
};

export type CursorInfo = {
    top: number;
    left: number;
    position: SelectionRange;
    isFlipped?: boolean;
}

export const ProgrammerticSelectionChange = Annotation.define<boolean>();

export const SyncDocValueWithPropValue = Annotation.define<boolean>();

// Marks a value chip as "in edit mode": its chip decoration is suppressed so the underlying
// text renders as normal, directly-typable editor content (selectable, completable, etc.)
// instead of being hidden behind a Decoration.replace widget. Holds the document position of
// the chip's start (not an id - ids from a fresh LS token refresh aren't stable across edits),
// mapped through every transaction so it keeps pointing at the same logical value.
export const setActiveEditableTokenEffect = StateEffect.define<number | undefined>();

export const activeEditableTokenField = StateField.define<number | undefined>({
    create: () => undefined,
    update(value, tr) {
        // An external prop-value sync replaces the whole document out from under whatever was
        // locally being edited - mapping the old position through that wholesale replace would
        // produce a meaningless number, so treat the sync as authoritative and drop it instead.
        if (tr.annotation(SyncDocValueWithPropValue)) return undefined;

        // assoc=-1 so typing right at the tracked start extends the active chip backwards
        // (mirrors tokenField's start mapping below) instead of excluding the new leading
        // text from the highlighted box until the next LS-backed refresh.
        let mapped = value === undefined ? undefined : tr.changes.mapPos(value, -1);
        for (const effect of tr.effects) {
            if (effect.is(setActiveEditableTokenEffect)) {
                mapped = effect.value;
            }
        }
        return mapped;
    }
});

// Visual "box" styling applied (via a non-replacing mark, so the text stays live/editable)
// to the value chip currently in edit mode.
const activeChipMark = Decoration.mark({
    class: "cm-active-chip-box",
    attributes: {
        style: "border:1px solid var(--vscode-focusBorder, #007acc); border-radius:4px; padding:0 4px; margin:0 2px; background:var(--vscode-input-background);"
    }
});

export function createChip(text: string, type: TokenType, start: number, end: number, view: EditorView, metadata?: TokenMetadata) {
    class ChipWidget extends WidgetType {
        constructor(
            readonly text: string,
            readonly type: TokenType,
            readonly start: number,
            readonly end: number,
            readonly view: EditorView,
            readonly metadata?: TokenMetadata
        ) {
            super();
        }
        toDOM() {
            const span = document.createElement("span");
            span.dataset.chipWidget = "true";
            this.createChip(span);

            // Add click handler to select the chip text. Value chips also enter edit mode:
            // the chip decoration steps aside so the (now-selected) underlying text is directly
            // editable, and typing replaces the selection like any normal text edit.
            span.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.view.dispatch({
                    selection: { anchor: this.start, head: this.end },
                    ...(isEditableValueChip(this.type)
                        ? { effects: setActiveEditableTokenEffect.of(this.start) }
                        : {})
                });
                this.view.focus();
            });

            return span;
        }

        private createChip(span: HTMLSpanElement) {
            let displayText = getChipDisplayContent(this.type, this.text);
            if (this.type === TokenType.DOCUMENT) {
                displayText = this.metadata?.content || this.text;
            }

            if (this.metadata?.fullValue) {
                span.title = this.metadata.fullValue;
            }

            const colors = getTokenTypeColor(this.type);
            const isPlaceholder = shouldRenderAsEmptySpace(this.type, this.text);

            // Apply base styles to the chip container
            Object.assign(span.style, {
                ...BASE_CHIP_STYLES,
                background: isPlaceholder ? "transparent" : colors.background,
                border: `1px solid ${colors.border}`,
                marginRight: "2px",
                marginLeft: "2px",
            });

            if (!isPlaceholder) {
                // Create icon element for standard chip
                const icon = document.createElement("i");
                let iconClass = getTokenIconClass(this.type, this.metadata?.documentType);
                if (iconClass) {
                    icon.className = iconClass;
                }
                Object.assign(icon.style, {
                    ...BASE_ICON_STYLES,
                    color: colors.icon
                });
                span.appendChild(icon);
            }

            // Create text span with ellipsis handling
            const textSpan = document.createElement("span");
            textSpan.textContent = displayText;
            Object.assign(textSpan.style, CHIP_TEXT_STYLES);

            span.appendChild(textSpan);
        }

        ignoreEvent() {
            return false;
        }
        eq(other: ChipWidget) {
            return other.text === this.text
                && other.start === this.start
                && other.end === this.end
                && other.type === this.type
                && other.metadata?.fullValue === this.metadata?.fullValue;
        }
    }
    return Decoration.replace({
        widget: new ChipWidget(text, type, start, end, view, metadata),
        inclusive: false,
        block: false
    });
}

export const chipTheme = EditorView.theme({
    "&": {
        backgroundColor: "var(--vscode-input-background)"
    },
    ".cm-content": {
        caretColor: ThemeColors.ON_SURFACE,
        padding: "1px",
        paddingRight: "40px"
    },
    ".cm-editor": {
        padding: "1px",
    },
    ".cm-scroller": {
        paddingTop: "1px",
        paddingBottom: "1px",
    },
    "&.cm-editor .cm-cursor, &.cm-editor .cm-dropCursor": {
        borderLeftColor: ThemeColors.ON_SURFACE
    }
});

export const completionTheme = EditorView.theme({
    ".cm-tooltip.cm-tooltip-autocomplete": {
        backgroundColor: ThemeColors.SURFACE_BRIGHT,
        border: `1px solid ${ThemeColors.OUTLINE}`,
        borderRadius: "3px",
        padding: "2px 0px",
        maxHeight: "300px",
        maxWidth: "300px",
        overflow: "auto",
        zIndex: "3000",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
        animation: "fadeInUp 0.3s ease forwards",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
        fontFamily: "var(--vscode-font-family)",
        fontSize: "13px",
        listStyle: "none",
        margin: "0",
        padding: "0",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
        height: "25px",
        display: "flex",
        alignItems: "center",
        padding: "0px 5px",
        color: ThemeColors.ON_SURFACE,
        cursor: "pointer",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "rgba(0, 122, 204, 0.5)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li:hover": {
        backgroundColor: ThemeColors.OUTLINE_VARIANT,
    },
    ".cm-completionLabel": {
        flex: "1",
    },
    ".cm-completionDetail": {
        fontStyle: "italic",
        color: ThemeColors.ON_SURFACE_VARIANT,
        fontSize: "12px",
    },
});

export const tokensChangeEffect = StateEffect.define<TokensChangePayload>();
export const removeChipEffect = StateEffect.define<number>(); // contains token ID

export type TokenFieldState = {
    tokens: ParsedToken[];
    compounds: CompoundTokenSequence[];
};

export const tokenField = StateField.define<TokenFieldState>({
    create() {
        return { tokens: [], compounds: [] };
    },
    update(oldState, tr) {
        // Map existing positions through changes. For the chip currently in edit mode (and
        // only that one - see below), the end boundary uses assoc=1 so that typing right at
        // its end (e.g. continuing to fill in a chip you just started editing) extends its
        // range instead of leaving each new character just outside it, and the start boundary
        // uses assoc=-1 so typing at its very start (e.g. after pressing Home) is likewise kept
        // inside the tracked range instead of excluded. Every other token/compound keeps the
        // opposite, non-absorbing assoc (start=1, end=-1) so boundary typing next to a chip
        // that ISN'T being edited lands beside it as plain text instead of silently merging
        // into - and then, on the next Backspace, deleting along with - that chip's content.
        // The active token/compound's mapping must stay in sync with activeEditableTokenField's
        // own mapping above so the "is this the active chip" comparisons in buildDecorations
        // keep matching.
        const activeStartBeforeChange = tr.startState.field(activeEditableTokenField, false);

        let tokens = oldState.tokens.map(token => {
            const isActive = activeStartBeforeChange !== undefined && token.start === activeStartBeforeChange;
            return {
                ...token,
                start: tr.changes.mapPos(token.start, isActive ? -1 : 1),
                end: tr.changes.mapPos(token.end, isActive ? 1 : -1)
            };
        });

        // Compounds are never individually editable today - CompoundTokenSequence.tokenType is
        // TokenType.VARIABLE | TokenType.DOCUMENT, and isEditableValueChip only allows PARAMETER
        // and VALUE - so a compound's start can never equal activeStartBeforeChange, and it
        // always gets the plain, non-absorbing assoc.
        let compounds = oldState.compounds.map(compound => ({
            ...compound,
            start: tr.changes.mapPos(compound.start, 1),
            end: tr.changes.mapPos(compound.end, -1)
        }));

        // A chip is actively being edited: its containing expression is typically mid-edit
        // (often syntactically incomplete), so an LS-backed token refresh landing right now
        // would recompute the *whole* token stream from that transient/invalid parse - which
        // can misclassify or drop tokens for chips the user isn't even touching. Ignore it and
        // keep the locally-mapped tokens/compounds; the real refresh runs once editing commits
        // (Enter/blur, see buildNeedTokenRefetchListner and buildOnFocusOutListner). An external
        // prop-value sync overrides this: it replaces the whole document out from under any
        // local edit, so the locally-mapped positions are meaningless anyway and the refresh it
        // carries must be applied instead of skipped, or the token stream is stuck describing a
        // document that no longer exists until the next Enter/blur.
        const isEditingChip = activeStartBeforeChange !== undefined && !tr.annotation(SyncDocValueWithPropValue);

        for (let effect of tr.effects) {
            if (effect.is(tokensChangeEffect)) {
                if (isEditingChip) continue;

                const payload = effect.value;
                const currentValue = tr.newDoc.toString();

                tokens = getParsedExpressionTokens(payload.tokens, currentValue);

                // Detect compounds once when tokens change
                compounds = detectTokenPatterns(tokens, currentValue);

                return { tokens, compounds };
            }
            if (effect.is(removeChipEffect)) {
                const removingTokenId = effect.value;
                tokens = tokens.filter(token => token.id !== removingTokenId);

                // Recompute compounds after token removal
                const docText = tr.newDoc.toString();
                compounds = detectTokenPatterns(tokens, docText);

                return { tokens, compounds };
            }
        }
        return { tokens, compounds };
    }
});

export const iterateTokenStream = (
    tokens: ParsedToken[],
    compounds: CompoundTokenSequence[],
    content: string,
    callbacks: {
        onCompound: (compound: CompoundTokenSequence) => void;
        onToken: (token: ParsedToken, text: string) => void;
    }
) => {
    const docLength = content.length;

    const compoundsByStartIndex = new Map<number, CompoundTokenSequence[]>();
    const compoundTokenIndices = new Set<number>();

    for (const compound of compounds) {
        // Validate compound range
        if (compound.start < 0 || compound.end > docLength || compound.start >= compound.end) {
            continue;
        }

        // Group compounds by their starting token index
        const existing = compoundsByStartIndex.get(compound.startIndex) || [];
        existing.push(compound);
        compoundsByStartIndex.set(compound.startIndex, existing);

        // Mark all indices within this compound as consumed
        for (let i = compound.startIndex; i <= compound.endIndex; i++) {
            compoundTokenIndices.add(i);
        }
    }

    // The orphan filter only applies to interpolation-based editors (e.g. prompt/template)
    const hasInterpolation = tokens.some(token => token.type === TokenType.START_EVENT);
    const insideClosedRange = getTokenIndicesInClosedExpressionRanges(tokens);

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Check if any compounds begin at this token index
        const startingCompounds = compoundsByStartIndex.get(i);
        if (startingCompounds) {
            // Trigger callback for each compound starting here
            for (const compound of startingCompounds) {
                callbacks.onCompound(compound);
            }
        }

        // Check if the individual token is consumed by a compound
        if (compoundTokenIndices.has(i)) {
            continue;
        }

        // Skip START_EVENT and END_EVENT tokens
        if (token.type === TokenType.START_EVENT || token.type === TokenType.END_EVENT) {
            continue;
        }

        // Skip orphan tokens sitting inside an unclosed ${ (interpolation editors only)
        if (hasInterpolation && !insideClosedRange.has(i)) {
            continue;
        }

        // Validate token range
        if (token.start < 0 || token.end > docLength || token.start >= token.end) {
            continue;
        }

        const text = content.slice(token.start, token.end);
        callbacks.onToken(token, text);
    }
};

// All editable value-chip token ranges that actually get rendered as their own chip/box -
// i.e. the same set iterateTokenStream hands to buildDecorations below, not the raw
// tokenField.tokens array. A token absorbed into a compound sequence (e.g. one of several
// tokens inside a ${...} interpolation), an orphan token inside an unclosed interpolation, or
// a multi-line span never gets its own decoration, so it must also never be an activation
// target for boundary clicks or Tab/Shift-Tab - otherwise the editor can silently enter edit
// mode (and start suppressing LS token refreshes) for a token with no on-screen active box to
// show for it.
//
// Compounds are never individually editable today - CompoundTokenSequence.tokenType is
// TokenType.VARIABLE | TokenType.DOCUMENT, and isEditableValueChip only allows PARAMETER and
// VALUE - so onCompound never contributes a range here. If compound editing is ever supported,
// widen CompoundTokenSequence.tokenType and this function (and buildDecorations' onCompound
// branch below) need to be revisited together.
const getEditableChipRanges = (view: EditorView): { start: number; end: number }[] => {
    const tokenState = view.state.field(tokenField, false);
    if (!tokenState) return [];

    const docContent = view.state.doc.toString();
    const ranges: { start: number; end: number }[] = [];

    iterateTokenStream(tokenState.tokens, tokenState.compounds, docContent, {
        onCompound: () => { /* compounds are never individually editable today - see above */ },
        onToken: (token, text) => {
            if (text.includes('\n')) return;
            if (isEditableValueChip(token.type) && token.start < token.end) {
                ranges.push({ start: token.start, end: token.end });
            }
        }
    });

    return ranges.sort((a, b) => a.start - b.start);
};

export const chipPlugin = ViewPlugin.fromClass(
    class {
        decorations: RangeSet<Decoration>;
        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }
        update(update: ViewUpdate) {
            const hasTokensChangeEffect = update.transactions.some(tr =>
                tr.effects.some(e => e.is(tokensChangeEffect))
            );
            const hasActiveTokenEffect = update.transactions.some(tr =>
                tr.effects.some(e => e.is(setActiveEditableTokenEffect))
            );
            const hasDocOrViewportChange = update.docChanged || update.viewportChanged;
            if (hasDocOrViewportChange || hasTokensChangeEffect || hasActiveTokenEffect) {
                this.decorations = this.buildDecorations(update.view);
            }
        }
        buildDecorations(view: EditorView) {
            const widgets: any[] = []; // Type as any[] to allow pushing Range<Decoration>
            const { tokens, compounds } = view.state.field(tokenField);
            const activeStart = view.state.field(activeEditableTokenField, false);
            const docContent = view.state.doc.toString();

            iterateTokenStream(tokens, compounds, docContent, {
                onCompound: (compound) => {
                    const compoundText = docContent.slice(compound.start, compound.end);
                    if (compoundText.includes('\n')) {
                        return;
                    }

                    // Compounds are never individually editable today (see the note on
                    // getEditableChipRanges above), so they always render as a plain chip -
                    // never the live/editable activeChipMark box the branch below gives tokens.
                    widgets.push(
                        createChip(
                            compound.displayText,
                            compound.tokenType,
                            compound.start,
                            compound.end,
                            view,
                            compound.metadata
                        ).range(compound.start, compound.end)
                    );
                },
                onToken: (token, text) => {
                    if (text.includes('\n')) {
                        return;
                    }

                    if (
                        isEditableValueChip(token.type) &&
                        token.start === activeStart &&
                        token.start < token.end
                    ) {
                        widgets.push(activeChipMark.range(token.start, token.end));
                        return;
                    }

                    widgets.push(
                        createChip(
                            text,
                            token.type,
                            token.start,
                            token.end,
                            view
                        ).range(token.start, token.end)
                    );
                }
            });

            return Decoration.set(widgets, true);
        }
    },
    {
        decorations: v => v.decorations
    }
);

// A click that just misses a value chip's widget (lands on the sliver of plain text/gap right
// before or after it) resolves to a position exactly at that chip's start/end boundary but
// never reaches the widget's own click handler, so the click falls through to plain cursor
// placement and anything typed next lands beside the chip instead of inside it. This catches
// that case and activates the chip anyway, same as a direct hit.
export const chipBoundaryClickHandler = EditorView.domEventHandlers({
    click: (event, view) => {
        if (event.button !== 0) return false;
        if ((event.target as HTMLElement)?.closest('[data-chip-widget]')) return false;

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;

        // Only match against ranges that actually render as their own chip (see
        // getEditableChipRanges) - a raw token list would also match a token absorbed into a
        // compound sequence, which never gets its own decoration to activate.
        const hit = getEditableChipRanges(view).find(range => {
            if (pos === range.start) return true;
            if (pos !== range.end) return false;

            // A click resolving to a chip's end can also mean "well past it, in blank
            // space" - e.g. a trailing chip at the end of the document/line, where posAtCoords
            // clamps every click past it to this same position. Only treat it as a boundary
            // hit when the click is still on/at the chip's own rendered box; otherwise a chip
            // at the end of a field could never be clicked-past to place the caret after it.
            const endCoords = view.coordsAtPos(range.end, -1);
            return endCoords != null && event.clientX <= endCoords.right;
        });
        if (!hit) return false;

        event.preventDefault();
        view.dispatch({
            selection: { anchor: hit.start, head: hit.end },
            effects: setActiveEditableTokenEffect.of(hit.start)
        });
        view.focus();
        return true;
    }
});

// A chip only stays "active" (live, directly-editable text) while the selection remains
// inside its tracked range. If the selection moves elsewhere - a click on plain text, on a
// different non-editable chip, or arrow-key navigation past the chip's boundary - without an
// explicit commit (Enter) or the whole editor losing focus, neither of which fires here,
// clear the active state so the chip re-collapses and tokenField.update stops skipping
// LS-backed token refreshes on its account (see the isEditingChip check above).
export const activeChipSelectionGuard = EditorView.updateListener.of((update) => {
    if (!update.selectionSet || update.docChanged) return;

    const activeStart = update.state.field(activeEditableTokenField, false);
    if (activeStart === undefined) return;

    const tokenState = update.state.field(tokenField, false);
    if (!tokenState) return;

    const activeRange = tokenState.tokens.find(token => token.start === activeStart)
        ?? tokenState.compounds.find(compound => compound.start === activeStart);
    if (!activeRange) {
        // The tracked chip no longer exists - clear instead of leaving isEditingChip stuck
        // true, which would otherwise keep suppressing LS-backed token refreshes until an
        // unrelated Enter/blur happens to come along and clear it.
        update.view.dispatch({ effects: setActiveEditableTokenEffect.of(undefined) });
        return;
    }

    const { from, to } = update.state.selection.main;
    if (from < activeRange.start || to > activeRange.end) {
        update.view.dispatch({ effects: setActiveEditableTokenEffect.of(undefined) });
    }
});

const activateChipRange = (view: EditorView, range: { start: number; end: number }): boolean => {
    view.dispatch({
        selection: { anchor: range.start, head: range.end },
        effects: setActiveEditableTokenEffect.of(range.start)
    });
    view.focus();
    return true;
};

// Commits the chip currently in edit mode (re-collapses it back into a chip); falls through
// (returns false) when no chip is being edited. Kept separate from expressionEditorKeymap
// (and registered ahead of listContinuationKeymap - see ChipExpressionEditor.tsx) so
// committing a chip always takes priority over a host editor's own Enter handling, e.g. the
// prompt editor's list-continuation, instead of the chip getting stuck in edit mode while an
// unrelated Enter behavior fires first.
export const chipCommitKeymap = [
    {
        key: "Enter",
        run: (view: EditorView) => {
            const activeStart = view.state.field(activeEditableTokenField, false);
            if (activeStart === undefined) return false;
            view.dispatch({ effects: setActiveEditableTokenEffect.of(undefined) });
            return true;
        }
    }
];

export const expressionEditorKeymap = [
    {
        // While a chip is in edit mode, jumps to (and activates) the next editable chip after
        // it, so a multi-argument function call's placeholders can be filled without ever
        // touching the mouse. Only handles Tab while a chip is already active, and never wraps
        // past the last one - falling through (returning false) otherwise so Tab keeps its
        // normal job of moving focus out of the editor. Without both of those, a document that
        // merely contains a value/parameter chip (active or not) would permanently capture Tab
        // and trap keyboard focus inside the editor (WCAG 2.1.2).
        key: "Tab",
        run: (view: EditorView) => {
            const activeStart = view.state.field(activeEditableTokenField, false);
            if (activeStart === undefined) return false;

            const nextChip = getEditableChipRanges(view).find(chip => chip.start > activeStart);
            if (!nextChip) return false;

            return activateChipRange(view, nextChip);
        }
    },
    {
        // Mirror of Tab above: jumps to the previous editable chip. Same guards apply - only
        // while a chip is active, and never wraps past the first one.
        key: "Shift-Tab",
        run: (view: EditorView) => {
            const activeStart = view.state.field(activeEditableTokenField, false);
            if (activeStart === undefined) return false;

            const prevChip = [...getEditableChipRanges(view)].reverse().find(chip => chip.start < activeStart);
            if (!prevChip) return false;

            return activateChipRange(view, prevChip);
        }
    },
    {
        key: "Backspace",
        run: (view: EditorView) => {
            const state = view.state;
            const tokenState = state.field(tokenField, false);
            if (!tokenState) return false;

            const { tokens, compounds } = tokenState;
            const cursor = state.selection.main.head;
            const activeStart = state.field(activeEditableTokenField, false);

            // Check if cursor is within a compound token
            const affectedCompound = compounds.find(
                compound => compound.start < cursor && compound.end >= cursor
            );

            // Compounds are never individually editable today (see the note on
            // getEditableChipRanges above), so Backspace always removes the whole sequence -
            // there's no "compound is being edited, delete one character instead" case yet.
            if (affectedCompound) {
                // Delete all tokens in the compound sequence
                const effects = [];
                for (let i = affectedCompound.startIndex; i <= affectedCompound.endIndex; i++) {
                    effects.push(removeChipEffect.of(tokens[i].id));
                }

                view.dispatch({
                    effects,
                    changes: { from: affectedCompound.start, to: affectedCompound.end, insert: '' }
                });
                return true;
            }

            // Check for individual tokens (skip the one currently in edit mode - see above)
            const affectedToken = tokens.find((token: ParsedToken) => token.start < cursor && token.end >= cursor);

            if (affectedToken && affectedToken.start !== activeStart) {
                view.dispatch({
                    effects: removeChipEffect.of(affectedToken.id),
                    changes: { from: affectedToken.start, to: affectedToken.end, insert: '' }
                });
                return true;
            }
            return false;
        }
    },
    ...defaultKeymap,
    ...historyKeymap
];

export const AVERAGE_HELPER_PANE_HEIGHT = 250;

// Offset applied to coords.bottom so the helper pane opens just below the cursor line
const CURSOR_BOTTOM_OFFSET = 5;

/**
 * Shared position computation for all CodeMirror update listeners.
 * Detects whether the pane should flip above the cursor (when it would overflow the container
 * bottom) and applies right-edge overflow correction for the pane width.
 * All coordinates are viewport-relative (as returned by coordsAtPos), so no scrollTop needed.
 */
const computeCursorPositionInfo = (
    coords: { top: number; bottom: number; left: number },
    editorRect: DOMRect,
    containerRef?: React.RefObject<HTMLElement>
): { top: number; left: number; isFlipped: boolean } => {
    const isFlipped = !!(
        containerRef?.current &&
        coords.bottom + AVERAGE_HELPER_PANE_HEIGHT > containerRef.current.getBoundingClientRect().bottom
    );

    const anchorY = isFlipped ? coords.top : coords.bottom + CURSOR_BOTTOM_OFFSET;
    let relativeTop = anchorY - editorRect.top;
    let relativeLeft = coords.left - editorRect.left;

    const overflow = relativeLeft + HELPER_PANE_WIDTH - editorRect.width;
    if (overflow > 0) {
        relativeLeft -= overflow;
    }

    return { top: relativeTop, left: relativeLeft, isFlipped };
};

// this always returns the cursor position with correction for helper pane width overflow
// make sure all the dropdowns that use this handle has the same width
export const buildOnFocusListner = (
    onTrigger: (cursor: CursorInfo) => void,
    containerRef?: React.RefObject<HTMLElement>
) => {
    const shouldOpenHelperPaneListner = EditorView.updateListener.of((update) => {
        if (update.focusChanged) {
            if (!update.view.hasFocus) {
                return;
            }

            const cursorPosition = update.view.state.selection.main;
            const coords = update.view.coordsAtPos(cursorPosition.to);

            if (
                coords &&
                coords.top !== null &&
                coords.top !== undefined &&
                coords.left !== null &&
                coords.left !== undefined &&
                coords.bottom !== null &&
                coords.bottom !== undefined
            ) {
                const editorRect = update.view.dom.getBoundingClientRect();
                const { top: relativeTop, left: relativeLeft, isFlipped } = computeCursorPositionInfo(coords, editorRect, containerRef);

                onTrigger({ top: relativeTop, left: relativeLeft, position: cursorPosition, isFlipped });
            }
        }
    });
    return shouldOpenHelperPaneListner;
};

// this always returns the cursor position with correction for helper pane width overflow
// make sure all the dropdowns that use this handle has the same width
export const buildOnSelectionChange = (
    onTrigger: (cursor: CursorInfo) => void,
    containerRef?: React.RefObject<HTMLElement>
) => {
    const selectionListener = EditorView.updateListener.of((update) => {
        if (!update.selectionSet) return;
        if (update.docChanged) return;
        if (!update.view.hasFocus) return;

        const cursorPosition = update.state.selection.main;
        const coords = update.view.coordsAtPos(cursorPosition.to);

        if (coords && coords.top != null && coords.left != null) {
            const editorRect = update.view.dom.getBoundingClientRect();
            const { top: relativeTop, left: relativeLeft, isFlipped } = computeCursorPositionInfo(coords, editorRect, containerRef);

            onTrigger({ top: relativeTop, left: relativeLeft, position: cursorPosition, isFlipped });
        }
    });
    return selectionListener;
};

export const buildOnFocusOutListner = (onTrigger: () => void) => {
    const shouldOpenHelperPaneListner = EditorView.updateListener.of((update) => {
        if (update.focusChanged) {
            if (update.view.hasFocus) return;
            // Losing focus on the whole editor commits whichever chip was in edit mode.
            if (update.view.state.field(activeEditableTokenField, false) !== undefined) {
                update.view.dispatch({ effects: setActiveEditableTokenEffect.of(undefined) });
            }
            onTrigger();
        }
    });
    return shouldOpenHelperPaneListner;
};

export const buildNeedTokenRefetchListner = (onTrigger: () => void) => {
    const needTokenRefetchListner = EditorView.updateListener.of((update) => {
        const userEvent = update.transactions[0]?.annotation(Transaction.userEvent);

        // A chip was just committed (Enter) - the token refresh was held back while it was
        // being edited (see tokenField.update), so ask for a fresh one now.
        const chipJustCommitted = update.transactions.some(tr =>
            tr.effects.some(e => e.is(setActiveEditableTokenEffect) && e.value === undefined)
        );
        if (chipJustCommitted) {
            onTrigger();
            return;
        }

        if (update.docChanged && (userEvent === "undo" || userEvent === "redo")) {
            onTrigger();
            return;
        }

        // While a chip is active, tokenField.update discards any tokensChangeEffect anyway
        // (see the isEditingChip check there), so triggering a refetch here would just be a
        // wasted LS round-trip for a response that's thrown away the moment it lands.
        const isEditingChip = update.state.field(activeEditableTokenField, false) !== undefined;

        if (!isEditingChip && update.docChanged && (
            userEvent === "input.type" ||
            userEvent === "input.paste" ||
            userEvent === "delete.backward" ||
            userEvent === "delete.forward" ||
            userEvent === "delete.cut"
        )) {
            update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
                const insertedText = inserted.toString();
                if (insertedText.endsWith(' ')) {
                    onTrigger();
                }
            });
        }
    });
    return needTokenRefetchListner;
}

export const buildOnChangeListner = (
    onTrigeer: (newValue: string, cursor: CursorInfo) => void,
    containerRef?: React.RefObject<HTMLElement>
) => {
    const onChangeListner = EditorView.updateListener.of((update) => {
        const cursorPos = update.view.state.selection.main;
        const coords = update.view.coordsAtPos(cursorPos.to);

        if (update.transactions.some(tr => tr.annotation(SyncDocValueWithPropValue))) {
            return;
        }

        if (!coords || coords.top === null || coords.left === null) {
            throw new Error("Could not get cursor coordinates");
        }
        if (update.docChanged) {
            const editorRect = update.view.dom.getBoundingClientRect();
            const { top: relativeTop, left: relativeLeft, isFlipped } = computeCursorPositionInfo(coords, editorRect, containerRef);

            const newValue = update.view.state.doc.toString();
            const cursorInfo = {
                top: relativeTop,
                left: relativeLeft,
                position: cursorPos,
                isFlipped
            };
            onTrigeer(newValue, cursorInfo);
        }
    });
    return onChangeListner;
}

export const buildCompletionSource = (getCompletions: () => Promise<CompletionItem[]>) => {
    return async (context: CompletionContext): Promise<CompletionResult | null> => {
        const textBeforeCursor = context.state.doc.toString().slice(0, context.pos);
        const lastNonSpaceChar = textBeforeCursor.trimEnd().slice(-1);

        const word = context.matchBefore(/\w*/);
        if (lastNonSpaceChar !== '.' && (
            !word || (word.from === word.to && !context.explicit)
        )) {
            return null;
        }

        // Don't show completions for trigger characters
        if (lastNonSpaceChar === '+') {
            return null;
        }

        const completions = await getCompletions();
        const prefix = word.text;
        const filteredCompletions = filterCompletionsByPrefixAndType(completions, prefix);

        if (filteredCompletions.length === 0) {
            return null;
        }

        return {
            from: word.from,
            options: filteredCompletions.map(item => ({
                label: item.label,
                type: item.kind || "variable",
                detail: item.description,
                // Manipulating the value to handle the LSP snippet completions
                apply: item.value.replace(/\$\{(\d+):([^}]+)\}/g, '$2').replace(/\$[0-9]+/g, '').trim(),
            }))
        };
    };
};

export const buildHelperPaneKeymap = (getIsHelperPaneOpen: () => boolean, onClose: () => void, onToggle?: () => void) => {
    return [
        {
            key: "Escape",
            run: (_view: EditorView) => {
                if (!getIsHelperPaneOpen()) return false;
                onClose();
                return true;
            }
        },
        ...(onToggle ? [{
            key: "Ctrl-/",
            mac: "Cmd-/",
            run: (_view: EditorView) => {
                onToggle();
                return true;
            }
        }] : [])
    ];
};


export const extractTextContent = (content: any): string => {
    if (typeof content === 'string') {
        return content;
    }
    if (React.isValidElement(content)) {
        const props = (content as any).props;
        if (props) {
            if (typeof props.children === 'string') {
                return props.children;
            }
            if (Array.isArray(props.children)) {
                return props.children
                    .map((child: any) => extractTextContent(child))
                    .filter(Boolean)
                    .join(' ');
            }
            if (props.children && typeof props.children === 'object') {
                return extractTextContent(props.children);
            }
        }
    }
    if (Array.isArray(content)) {
        return content
            .map((item: any) => extractTextContent(item))
            .filter(Boolean)
            .join(' ');
    }
    return '';
};

export const parseMarkdownToDOM = (text: string, container: HTMLElement, codeBackground: string) => {
    const parseInline = (str: string, parent: HTMLElement) => {
        let remaining = str;

        while (remaining.length > 0) {
            const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
            const codeMatch = remaining.match(/^`([^`]+?)`/);

            if (boldMatch) {
                const bold = document.createElement('strong');
                bold.style.fontWeight = '600';
                parseInline(boldMatch[1], bold);
                parent.appendChild(bold);
                remaining = remaining.slice(boldMatch[0].length);
            } else if (codeMatch) {
                const code = document.createElement('code');
                code.textContent = codeMatch[1];
                code.style.cssText = `
                    background: ${codeBackground};
                    color: ${ThemeColors.PRIMARY};
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 11px;
                    border: 1px solid ${ThemeColors.OUTLINE};
                `;
                parent.appendChild(code);
                remaining = remaining.slice(codeMatch[0].length);
            } else {
                parent.appendChild(document.createTextNode(remaining[0]));
                remaining = remaining.slice(1);
            }
        }
    };

    const lines = text.split('\n');
    lines.forEach((line, index) => {
        if (index > 0) {
            container.appendChild(document.createElement('br'));
        }
        parseInline(line, container);
    });
};

export const createTooltipHeader = (label: string): HTMLDivElement => {
    const header = document.createElement("div");
    header.style.cssText = `
        padding: 8px 12px;
        background: ${ThemeColors.SURFACE_CONTAINER};
        border-bottom: 1px solid ${ThemeColors.OUTLINE};
        font-weight: 500;
        color: ${ThemeColors.PRIMARY};
        font-family: var(--vscode-editor-font-family);
    `;
    header.textContent = label;
    return header;
};

export const createSectionLabel = (text: string): HTMLDivElement => {
    const label = document.createElement("div");
    label.style.cssText = `
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
    `;
    label.textContent = text;
    return label;
};

export const createParametersSection = (args: string[], currentArgIndex: number): HTMLDivElement => {
    const section = document.createElement("div");
    section.style.cssText = `
        padding: 8px 12px;
        background: ${ThemeColors.SURFACE};
        border-bottom: 1px solid ${ThemeColors.OUTLINE};
    `;

    section.appendChild(createSectionLabel("Parameters"));

    args.forEach((arg, index) => {
        const isCurrent = index === currentArgIndex;
        const argDiv = document.createElement("div");
        argDiv.style.cssText = `
            padding: 4px 8px;
            margin: 2px 0;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            color: ${isCurrent ? ThemeColors.ON_SURFACE : ThemeColors.ON_SURFACE_VARIANT};
            background: ${isCurrent ? ThemeColors.SURFACE_CONTAINER : 'transparent'};
            font-weight: ${isCurrent ? '600' : '400'};
            border-left: ${isCurrent ? `3px solid ${ThemeColors.PRIMARY}` : '3px solid transparent'};
        `;
        argDiv.textContent = arg;
        section.appendChild(argDiv);
    });

    return section;
};

export const createDocumentationSection = (documentation: FnSignatureDocumentation): HTMLDivElement => {
    const section = document.createElement("div");
    section.style.cssText = `
        padding: 8px 12px;
        background: ${ThemeColors.SURFACE};
    `;

    section.appendChild(createSectionLabel("Documentation"));

    const docContent = document.createElement("div");
    docContent.style.cssText = `
        color: ${ThemeColors.ON_SURFACE};
        line-height: 1.5;
        font-size: 12px;
    `;

    if (documentation.fn) {
        const fnDoc = document.createElement("div");
        fnDoc.style.cssText = `margin-bottom: 8px;`;
        const text = extractTextContent(documentation.fn);
        if (text) {
            parseMarkdownToDOM(text, fnDoc, ThemeColors.SURFACE_CONTAINER);
        } else {
            fnDoc.textContent = 'Function documentation available';
        }
        docContent.appendChild(fnDoc);
    }

    if (documentation.args) {
        const argsDoc = document.createElement("div");
        argsDoc.style.cssText = `
            padding: 8px;
            background: ${ThemeColors.SURFACE_CONTAINER};
            border-radius: 3px;
            border-left: 3px solid ${ThemeColors.OUTLINE_VARIANT};
        `;

        argsDoc.appendChild(createSectionLabel("Arguments"));

        const argsDocText = document.createElement("div");
        argsDocText.style.cssText = `
            color: ${ThemeColors.ON_SURFACE};
            font-size: 12px;
        `;

        const text = extractTextContent(documentation.args);
        if (text) {
            parseMarkdownToDOM(text, argsDocText, ThemeColors.SURFACE);
        } else {
            argsDocText.textContent = 'Arguments documentation available';
        }

        argsDoc.appendChild(argsDocText);
        docContent.appendChild(argsDoc);
    }

    section.appendChild(docContent);
    return section;
};

export const createTooltipContainer = (): HTMLElement => {
    const dom = document.createElement("div");
    dom.style.cssText = `
        background: ${ThemeColors.SURFACE_BRIGHT};
        border: 1px solid ${ThemeColors.OUTLINE};
        border-radius: 4px;
        padding: 0;
        max-width: 500px;
        max-height: 200px;
        font-family: var(--vscode-font-family);
        font-size: 13px;
        box-shadow: 0 2px 8px ${ThemeColors.SURFACE_CONTAINER};
        overflow-y: auto;
        overflow-x: hidden;
    `;
    return dom;
};

export const createTooltipPositioningHandlers = (view: EditorView) => {
    let adjustmentObserver: MutationObserver | null = null;

    const adjustPosition = () => {
        const tooltipElements = view.dom.querySelectorAll('.cm-tooltip');
        if (tooltipElements.length === 0) return;

        const tooltip = tooltipElements[tooltipElements.length - 1] as HTMLElement;
        const editorRect = view.dom.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        const rightOverflow = (tooltipRect.left + tooltipRect.width) - (editorRect.left + editorRect.width);

        if (rightOverflow > 0) {
            const currentLeft = parseFloat(tooltip.style.left) || 0;
            const newLeft = currentLeft - rightOverflow - 10;
            tooltip.style.left = `${Math.max(0, newLeft)}px`;
        }
    };

    const mount = () => {
        requestAnimationFrame(() => {
            adjustPosition();

            const tooltipElements = view.dom.querySelectorAll('.cm-tooltip');
            if (tooltipElements.length > 0) {
                const tooltip = tooltipElements[tooltipElements.length - 1] as HTMLElement;
                adjustmentObserver = new MutationObserver(adjustPosition);
                adjustmentObserver.observe(tooltip, {
                    attributes: true,
                    attributeFilter: ['style']
                });
            }
        });
    };

    const destroy = () => {
        if (adjustmentObserver) {
            adjustmentObserver.disconnect();
        }
    };

    return { mount, destroy };
};

export const isSelectionOnToken = (from: number, to: number, view: EditorView): ParsedToken | undefined => {
    if (!view) return undefined;
    const { tokens, compounds } = view.state.field(tokenField);

    const matchingCompound = compounds.find(
        compound => compound.start === from && compound.end === to
    );
    if (matchingCompound) return undefined;

    const matchingToken = tokens.find(
        token => token.start === from && token.end === to
    );
    return matchingToken;
};