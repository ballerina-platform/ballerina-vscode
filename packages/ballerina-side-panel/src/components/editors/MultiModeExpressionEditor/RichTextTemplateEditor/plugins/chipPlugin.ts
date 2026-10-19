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

import { Plugin, PluginKey } from 'prosemirror-state';
import { Schema, NodeSpec, DOMOutputSpec } from 'prosemirror-model';
import { schema as markdownSchema } from 'prosemirror-markdown';
import { tableNodes } from 'prosemirror-tables';
import {
    getParsedExpressionTokens,
    detectTokenPatterns,
    getTokenIndicesInClosedExpressionRanges,
    ParsedToken
} from '../../ChipExpressionEditor/utils';
import {
    TokenType,
    TokenMetadata,
    CompoundTokenSequence
} from '../../ChipExpressionEditor/types';
import {
    getTokenTypeColor,
    getTokenIconClass,
    getChipDisplayContent,
    BASE_CHIP_STYLES,
    BASE_ICON_STYLES,
    CHIP_TEXT_STYLES
} from '../../ChipExpressionEditor/chipStyles';

export const chipPluginKey = new PluginKey('chipPlugin');

/**
 * Chip node specification - atomic inline node for variable/document chips
 */
const chipNodeSpec: NodeSpec = {
    inline: true,
    group: "inline",
    atom: true,
    selectable: false,
    draggable: true,
    attrs: {
        tokenType: { default: TokenType.VARIABLE },
        text: { default: "" },
        displayText: { default: "" },
        start: { default: 0 },
        end: { default: 0 },
        metadata: { default: null },
        diagnostic: { default: null }
    },
    toDOM: (node): DOMOutputSpec => {
        const { tokenType, text, displayText, metadata, diagnostic } = node.attrs;
        const chipElement = createChipElement(
            displayText || text,
            tokenType,
            metadata,
            diagnostic
        );

        return [
            'span',
            {
                class: chipElement.className,
                style: chipElement.style.cssText,
                title: chipElement.title,
                'data-token-type': tokenType,
                'data-text': text
            },
            // Add icon and text content
            ...Array.from(chipElement.childNodes).map(child => {
                if (child instanceof HTMLElement) {
                    return [
                        child.tagName.toLowerCase(),
                        {
                            class: child.className,
                            style: child.style.cssText
                        },
                        child.textContent || ""
                    ] as DOMOutputSpec;
                }
                return child.textContent || "";
            })
        ];
    },
    parseDOM: [{
        tag: "span.pm-chip",
        getAttrs: (dom) => {
            if (!(dom instanceof HTMLElement)) return false;
            return {
                tokenType: dom.getAttribute('data-token-type') || TokenType.VARIABLE,
                text: dom.getAttribute('data-text') || '',
                displayText: dom.textContent || '',
                start: 0,
                end: 0,
                metadata: null,
                diagnostic: null
            };
        }
    }]
};

export function createChipSchema(): Schema {
    const tNodes = tableNodes({
        tableGroup: "block",
        // A Markdown pipe-table cell holds one line of inline text, so no tables, lists or headings inside.
        cellContent: "paragraph+",
        cellAttributes: {
            alignment: {
                default: null,
                getFromDOM(dom: HTMLElement) {
                    return dom.style.textAlign || null;
                },
                setDOMAttr(value, attrs) {
                    if (value) {
                        attrs.style = ((attrs.style as string) || "") + `text-align: ${value};`;
                    }
                }
            }
        }
    });

    let nodes = markdownSchema.spec.nodes;
    for (const [name, spec] of Object.entries(tNodes)) {
        nodes = nodes.addToEnd(name, spec);
    }
    nodes = nodes.addToEnd('chip', chipNodeSpec);

    return new Schema({
        nodes,
        marks: markdownSchema.spec.marks
    });
}

export const chipSchema = createChipSchema();

export interface TokenUpdate {
    tokens: number[] | null;
    plainText: string;        // Plain text from doc.textContent (no markdown)
    wrappedText: string;      // Wrapped version sent to API (e.g., `text`)
}

interface ChipPluginState {
    tokenUpdate: TokenUpdate | null;
    lastProcessedTokens: string | null; // Track processed tokens to avoid re-processing
}

function createChipElement(
    text: string,
    type: TokenType,
    metadata?: TokenMetadata,
    diagnostic?: { severity: string; message: string }
): HTMLElement {
    const span = document.createElement('span');
    span.className = 'pm-chip';

    if (metadata?.fullValue) {
        span.title = metadata.fullValue;
    }

    // Determine display text
    let displayText = getChipDisplayContent(type, text);
    if (type === TokenType.DOCUMENT) {
        displayText = metadata?.content || text;
    }

    // Get colors
    const colors = getTokenTypeColor(type);

    // Apply base chip styles
    Object.assign(span.style, {
        ...BASE_CHIP_STYLES,
        background: colors.background,
        border: `1px solid ${colors.border}`
    });

    // Create icon element
    const icon = document.createElement('i');
    const iconClass = getTokenIconClass(type, metadata?.documentType);
    if (iconClass) {
        icon.className = iconClass;
    }
    Object.assign(icon.style, {
        ...BASE_ICON_STYLES,
        color: colors.icon
    });

    // Create text span
    const textSpan = document.createElement('span');
    textSpan.textContent = displayText;
    const textStyles: any = { ...CHIP_TEXT_STYLES };

    Object.assign(textSpan.style, textStyles);

    // Assemble chip
    span.appendChild(icon);
    span.appendChild(textSpan);

    return span;
}

function findDocPosition(doc: any, textOffset: number, bias: 'start' | 'end' = 'end'): number {
    // Clamp offset to valid range
    if (textOffset <= 0) return 0;
    if (textOffset > doc.textContent.length) return doc.content.size;

    let charCount = 0;
    let docPos = 0;

    doc.descendants((node: any, pos: number) => {
        // If we've found the position, stop traversing
        if (docPos > 0) return false;

        if (node.isText) {
            const textLength = node.text.length;

            // 'start' bias: prefer next text node at paragraph boundaries
            // 'end' bias: stay in current text node
            const found = bias === 'start'
                ? charCount + textLength > textOffset
                : charCount + textLength >= textOffset;

            if (found) {
                // This text node contains our target offset
                docPos = pos + (textOffset - charCount);
                return false;
            }

            charCount += textLength;
        }

        return true;
    });

    return docPos || 0;
}

function replaceTextWithChips(
    tr: any,
    schema: Schema,
    tokens: ParsedToken[],
    compounds: CompoundTokenSequence[],
    plainText: string
): any {
    const docLength = plainText.length;
    const replacements: Array<{ from: number; to: number; node: any }> = [];

    // Track which token indices are part of compounds
    const compoundsByStartIndex = new Map<number, CompoundTokenSequence[]>();
    const compoundTokenIndices = new Set<number>();

    // Process compounds
    for (const compound of compounds) {
        // Validate compound range
        if (compound.start < 0 || compound.end > docLength || compound.start >= compound.end) {
            continue;
        }

        // Group compounds by starting index
        const existing = compoundsByStartIndex.get(compound.startIndex) || [];
        existing.push(compound);
        compoundsByStartIndex.set(compound.startIndex, existing);

        // Mark indices as consumed
        for (let i = compound.startIndex; i <= compound.endIndex; i++) {
            compoundTokenIndices.add(i);
        }
    }

    // Collect compound chip nodes
    for (let i = 0; i < tokens.length; i++) {
        const startingCompounds = compoundsByStartIndex.get(i);
        if (startingCompounds) {
            for (const compound of startingCompounds) {
                if (compound.start < 0 || compound.end > docLength || compound.start >= compound.end) {
                    continue;
                }

                const chipNode = schema.nodes.chip.create({
                    tokenType: compound.tokenType,
                    text: plainText.slice(compound.start, compound.end),
                    displayText: compound.displayText,
                    start: compound.start,
                    end: compound.end,
                    metadata: compound.metadata,
                    diagnostic: null
                });

                const startDocPos = findDocPosition(tr.doc, compound.start, 'start');
                const endDocPos = findDocPosition(tr.doc, compound.end, 'end');

                replacements.push({ from: startDocPos, to: endDocPos, node: chipNode });
            }
        }
    }

    const insideClosedRange = getTokenIndicesInClosedExpressionRanges(tokens);

    // Collect individual token chip nodes
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Skip if token is part of compound
        if (compoundTokenIndices.has(i)) {
            continue;
        }

        // Skip START_EVENT and END_EVENT tokens
        if (token.type === TokenType.START_EVENT || token.type === TokenType.END_EVENT) {
            continue;
        }

        // Skip orphan tokens sitting inside an unclosed ${
        if (!insideClosedRange.has(i)) {
            continue;
        }

        // Validate token range
        if (token.start < 0 || token.end > docLength || token.start >= token.end) {
            continue;
        }

        const text = plainText.slice(token.start, token.end);
        const chipNode = schema.nodes.chip.create({
            tokenType: token.type,
            text,
            displayText: getChipDisplayContent(token.type, text),
            start: token.start,
            end: token.end,
            metadata: null,
            diagnostic: null
        });

        const startDocPos = findDocPosition(tr.doc, token.start, 'start');
        const endDocPos = findDocPosition(tr.doc, token.end, 'end');

        replacements.push({ from: startDocPos, to: endDocPos, node: chipNode });
    }

    // Sort replacements in reverse order (from end to start) to maintain positions
    replacements.sort((a, b) => b.from - a.from);

    // Apply all replacements
    for (const replacement of replacements) {
        tr.replaceRangeWith(replacement.from, replacement.to, replacement.node);
    }

    return tr;
}

export function createChipPlugin(
    schema: Schema,
    onChipClick?: (event: MouseEvent, chipPos: number, chipNode: any) => void
) {
    return new Plugin<ChipPluginState>({
        key: chipPluginKey,

        state: {
            init() {
                return { tokenUpdate: null, lastProcessedTokens: null };
            },

            apply(tr, value, _oldState, _newState) {
                // Check if tokens have been updated via meta
                const newTokenUpdate = tr.getMeta(chipPluginKey) as TokenUpdate | undefined;

                if (newTokenUpdate !== undefined) {
                    // Create a unique key for this token update to avoid reprocessing
                    const tokensKey = JSON.stringify({
                        tokens: newTokenUpdate.tokens,
                        plainText: newTokenUpdate.plainText
                    });

                    // Only process if tokens have actually changed
                    if (tokensKey !== value.lastProcessedTokens) {
                        return {
                            tokenUpdate: newTokenUpdate,
                            lastProcessedTokens: tokensKey
                        };
                    }
                }

                // Clear stale chip data on user edits so chips get re-created at correct positions
                if ((tr as any).docChanged && tr.getMeta('addToHistory') !== false) {
                    return { tokenUpdate: null, lastProcessedTokens: null };
                }

                return value;
            }
        },

        // Process token updates and replace text with chip nodes
        appendTransaction(_transactions, oldState, newState) {
            const pluginState = this.getState(newState);
            const oldPluginState = this.getState(oldState);

            // Check if we have new tokens to process
            if (pluginState?.tokenUpdate &&
                pluginState.lastProcessedTokens !== oldPluginState?.lastProcessedTokens &&
                pluginState.tokenUpdate.tokens) {

                const { tokens: tokenStream, plainText, wrappedText } = pluginState.tokenUpdate;

                // Parse tokens
                let parsedTokens = getParsedExpressionTokens(tokenStream, wrappedText);

                // Adjust token positions from wrapped to plain text
                const prefixLength = wrappedText.indexOf(plainText);
                if (prefixLength > 0) {
                    parsedTokens = parsedTokens.map(token => ({
                        ...token,
                        start: Math.max(0, token.start - Math.max(0, prefixLength)),
                        end: Math.max(0, token.end - Math.max(0, prefixLength))
                    }));
                }

                // Detect compounds
                const compounds = detectTokenPatterns(parsedTokens, plainText);

                // Create transaction to replace text with chips
                const tr = newState.tr;
                replaceTextWithChips(tr, schema, parsedTokens, compounds, plainText);

                // Mark this transaction as non-undoable since it's an automatic transformation
                tr.setMeta('addToHistory', false);

                return tr;
            }

            return null;
        },

        // Handle click events on chips
        props: {
            handleDOMEvents: {
                click: (view, event) => {
                    if (!onChipClick) return false;

                    const target = event.target as HTMLElement;
                    const chipElement = target.closest('.pm-chip');

                    if (chipElement) {
                        // Find the chip node at this position
                        const pos = view.posAtDOM(chipElement, 0);
                        const node = view.state.doc.nodeAt(pos);

                        if (node && node.type.name === 'chip') {
                            onChipClick(event, pos, node);
                            return true; // Event handled
                        }
                    }

                    return false; // Let other handlers process the event
                }
            }
        }
    });
}

export function updateChipTokens(view: any, tokenUpdate: TokenUpdate) {
    const tr = view.state.tr.setMeta(chipPluginKey, tokenUpdate);
    view.dispatch(tr);
}
