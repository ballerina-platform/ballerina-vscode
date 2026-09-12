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

import { CompletionItem } from "@wso2/ui-toolkit";
import { INPUT_MODE_MAP, InputMode, TokenType, CompoundTokenSequence, TokenMetadata, DocumentType, TokenPattern } from "./types";
import { getPrimaryInputType, getSecondaryInputType, InputType } from "@wso2/ballerina-core";
import { FnSignatureDocumentation } from "@wso2/ui-toolkit";
import { AVERAGE_HELPER_PANE_HEIGHT } from "./CodeUtils";

export const TOKEN_LINE_OFFSET_INDEX = 0;
export const TOKEN_START_CHAR_OFFSET_INDEX = 1;
export const TOKEN_LENGTH_INDEX = 2;
export const TOKEN_TYPE_INDEX = 3;
export const TOKEN_MODIFIERS_INDEX = 4;

export const TOKEN_TYPE_INDEX_MAP: { [key: number]: TokenType } = {
    0: TokenType.VARIABLE,
    1: TokenType.FUNCTION,
    2: TokenType.PARAMETER,
    3: TokenType.TYPE_CAST,
    4: TokenType.VALUE,
    5: TokenType.START_EVENT,
    6: TokenType.END_EVENT
};

const getTokenTypeFromIndex = (index: number): TokenType => {
    return TOKEN_TYPE_INDEX_MAP[index] || TokenType.VARIABLE;
};

export const getInputModeFromTypes = (inputType: InputType): InputMode | undefined => {
    if (!inputType) return;

    if (inputType.fieldType === "SQL_QUERY") {
        return InputMode.SQL;
    }

    if (inputType.fieldType === "TEXT") {
        return InputMode.TEXT;
    }
    if (inputType.fieldType === "EXPRESSION") {
        return InputMode.EXP;
    }
    if (inputType.fieldType === "NUMBER") {
        return InputMode.NUMBER;
    }
    if (inputType.fieldType === "SINGLE_SELECT") {
        return InputMode.SELECT;
    }
    if (inputType.fieldType === "EXPRESSION_SET") {
        return InputMode.ARRAY;
    }
    if (inputType.fieldType === "TEXT_SET") {
        return InputMode.TEXT_ARRAY;
    }
    if (inputType.fieldType === "PROMPT") {
        return InputMode.PROMPT;
    }
    if (inputType.fieldType === "FLAG") {
        return InputMode.BOOLEAN;
    }
    if (inputType.fieldType === "RECORD_MAP_EXPRESSION") {
        return InputMode.RECORD;
    }
    if (inputType.fieldType === "REPEATABLE_MAP") {
        return InputMode.MAP;
    }
    if (inputType.fieldType === "REPEATABLE_LIST") {
        return InputMode.ARRAY;
    }
    if (inputType.fieldType === "ACTION_EXPRESSION") {
        return InputMode.SELECT;
    }

    //default behaviour
    return getInputModeFromBallerinaType(inputType.ballerinaType);
};

export const getInputModeFromBallerinaType = (ballerinaType: string): InputMode => {
    return INPUT_MODE_MAP[ballerinaType];
}

export const getDefaultExpressionMode = (inputTypes: InputType[]): InputMode => {
    const primaryInputType = getPrimaryInputType(inputTypes);
    return getInputModeFromTypes(primaryInputType);
}
export const getSecondaryMode = (inputTypes: InputType[]): InputMode => {
    const secondaryInputType = getSecondaryInputType(inputTypes);
    return getInputModeFromTypes(secondaryInputType);
}

export const getAbsoluteColumnOffset = (value: string, line: number, column: number) => {
    const lines = value.split("\n");
    let cumulativeLength = 0;
    if (line < 0 || line >= lines.length) throw new Error("Invalid line number");
    for (let i = 0; i < lines.length; i++) {
        if (i === line) {
            return cumulativeLength + column;
        }
        cumulativeLength += lines[i].length + 1;
    }
}

export const getLineFromAbsoluteOffset = (value: string, absoluteOffset: number) => {
    const lines = value.split("\n");
    let cumulativeLength = 0;

    for (let i = 0; i < lines.length; i++) {
        cumulativeLength += lines[i].length;
        if (cumulativeLength >= absoluteOffset) {
            return i;
        }
        cumulativeLength += 1;
    }
    return lines.length - 1;
}

export const getTokenChunks = (tokens: number[]) => {
    const chunkSize = 5;
    const tokenChunks = [];
    for (let i = 0; i < tokens.length; i += chunkSize) {
        tokenChunks.push(tokens.slice(i, i + chunkSize));
    }
    return tokenChunks;
};

// Parsed token with absolute positions
export type ParsedToken = {
    id: number;
    start: number;
    end: number;
    type: TokenType;
}

export const getParsedExpressionTokens = (tokens: number[], value: string): ParsedToken[] => {
    const chunks = getTokenChunks(tokens);
    let currentLine = 0;
    let currentChar = 0;
    const tokenObjects: ParsedToken[] = [];

    let tokenId = 0;
    for (let chunk of chunks) {
        const deltaLine = chunk[TOKEN_LINE_OFFSET_INDEX];
        const deltaStartChar = chunk[TOKEN_START_CHAR_OFFSET_INDEX];
        const length = chunk[TOKEN_LENGTH_INDEX];
        const type = chunk[TOKEN_TYPE_INDEX];

        currentLine += deltaLine;
        if (deltaLine === 0) {
            currentChar += deltaStartChar;
        } else {
            currentChar = deltaStartChar;
        }

        const absoluteStart = getAbsoluteColumnOffset(value, currentLine, currentChar);
        const absoluteEnd = absoluteStart + length;

        tokenObjects.push({ id: tokenId++, start: absoluteStart, end: absoluteEnd, type: getTokenTypeFromIndex(type) });
    }
    return tokenObjects;
}

// Returns the set of token indices that sit inside a properly closed ${...} range.
// Tokens inside an unclosed ${ are orphans; the LSP treats following text as expression context.
export const getTokenIndicesInClosedExpressionRanges = (tokens: ParsedToken[]): Set<number> => {
    const insideClosedRange = new Set<number>();
    let pending: number[] = [];
    let isOpen = false;
    for (let i = 0; i < tokens.length; i++) {
        const type = tokens[i].type;
        if (type === TokenType.START_EVENT) {
            pending = [];
            isOpen = true;
        } else if (type === TokenType.END_EVENT && isOpen) {
            pending.forEach(idx => insideClosedRange.add(idx));
            pending = [];
            isOpen = false;
        } else if (isOpen) {
            pending.push(i);
        }
    }
    return insideClosedRange;
}

export const getWordBeforeCursorPosition = (textBeforeCursor: string): string => {
    const match = textBeforeCursor.match(/\b\w+$/);
    const lastMatch = match ? match[match.length - 1] : "";
    return textBeforeCursor.endsWith(lastMatch) ? lastMatch : '';
};

export const filterCompletionsByPrefixAndType = (completions: CompletionItem[], prefix: string): CompletionItem[] => {
    if (!prefix) {
        return completions.filter(completion =>
            completion.kind === 'field' || completion.kind === 'function'
        ).sort((a, b) => {
            if (a.kind === 'field' && b.kind === 'function') return -1;
            if (a.kind === 'function' && b.kind === 'field') return 1;
            return 0;
        });
    }

    return completions.filter(completion =>
        (completion.kind === 'function' || completion.kind === 'variable' || completion.kind === 'field' || completion.kind === 'enum-member') &&
        completion.label.toLowerCase().startsWith(prefix.toLowerCase())
    );
};

const splitTopLevelFields = (body: string): Record<string, string> => {
    const fields: Record<string, string> = {};
    let depth = 0;
    let quote: string | null = null;
    let segmentStart = 0;

    const push = (endExclusive: number) => {
        const segment = body.slice(segmentStart, endExclusive).trim();
        if (!segment) return;
        const colon = segment.indexOf(':');
        if (colon === -1) return;
        const key = segment.slice(0, colon).trim();
        const value = segment.slice(colon + 1).trim();
        if (key) fields[key] = value;
    };

    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (quote) {
            if (c === '\\') { i++; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === '\'' || c === '`') { quote = c; continue; }
        if (c === '{' || c === '[' || c === '(') { depth++; continue; }
        if (c === '}' || c === ']' || c === ')') { depth--; continue; }
        if (c === ',' && depth === 0) {
            push(i);
            segmentStart = i + 1;
        }
    }
    push(body.length);
    return fields;
};

/**
 * Extracts metadata for document tokens
 * Pattern: ${<ai:DocumentType>{content: <value>, metadata?: {...}}}
 */
export const extractDocumentMetadata = (
    tokens: ParsedToken[],
    startIndex: number,
    endIndex: number,
    docText: string
): TokenMetadata | null => {
    const startToken = tokens[startIndex];
    const endToken = tokens[endIndex];
    const fullValue = docText.substring(startToken.start, endToken.end);

    const prefixMatch = fullValue.match(/^\$\{<ai:(\w+)>\{/);
    if (!prefixMatch) {
        return null;
    }
    const documentType = prefixMatch[1] as DocumentType;
    const bodyStart = prefixMatch[0].length;

    let depth = 1;
    let bodyEnd = -1;
    let quote: string | null = null;
    for (let i = bodyStart; i < fullValue.length; i++) {
        const c = fullValue[i];
        if (quote) {
            if (c === '\\') { i++; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === '\'' || c === '`') { quote = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) {
                if (fullValue[i + 1] !== '}') return null;
                bodyEnd = i;
                break;
            }
        }
    }
    if (bodyEnd === -1) {
        return null;
    }

    const body = fullValue.slice(bodyStart, bodyEnd);
    const fields = splitTopLevelFields(body);
    const content = fields.content?.trim() ?? '';
    if (!content) {
        return null;
    }

    return {
        content,
        fullValue,
        documentType,
        fields
    };
};

/**
 * Extracts metadata for variable tokens
 * Pattern: ${variableName}
 */
export const extractVariableMetadata = (
    tokens: ParsedToken[],
    startIndex: number,
    endIndex: number,
    docText: string
): TokenMetadata | null => {
    const startToken = tokens[startIndex];
    const endToken = tokens[endIndex];
    const fullValue = docText.substring(startToken.start, endToken.end);
    const variableRegex = /\$\{([^}]+)\}/;
    const match = fullValue.match(variableRegex);

    if (!match) {
        return null;
    }

    const content = match[1].trim();

    return {
        content,
        fullValue
    };
};

// Token patterns for detecting compound token sequences
// Patterns are checked in priority order (higher priority number = higher priority)
export const TOKEN_PATTERNS: readonly TokenPattern[] = [
    {
        kind: 'anchored',
        name: TokenType.DOCUMENT,
        startSequence: [TokenType.START_EVENT, TokenType.TYPE_CAST],
        endType: TokenType.END_EVENT,
        extractor: extractDocumentMetadata,
        priority: 2
    },
    {
        kind: 'fixed',
        name: TokenType.VARIABLE,
        sequence: [TokenType.START_EVENT, TokenType.VARIABLE, TokenType.END_EVENT],
        extractor: extractVariableMetadata,
        priority: 1
    }
];

const matchPatternAt = (
    pattern: TokenPattern,
    tokens: ParsedToken[],
    i: number,
    usedIndices: Set<number>
): { startIndex: number; endIndex: number } | null => {
    if (pattern.kind === 'fixed') {
        const length = pattern.sequence.length;
        if (i + length > tokens.length) return null;
        for (let j = 0; j < length; j++) {
            if (usedIndices.has(i + j)) return null;
            if (tokens[i + j]?.type !== pattern.sequence[j]) return null;
        }
        return { startIndex: i, endIndex: i + length - 1 };
    }

    const prefixLength = pattern.startSequence.length;
    if (i + prefixLength > tokens.length) return null;
    for (let j = 0; j < prefixLength; j++) {
        if (usedIndices.has(i + j)) return null;
        if (tokens[i + j]?.type !== pattern.startSequence[j]) return null;
    }
    for (let k = i + prefixLength; k < tokens.length; k++) {
        if (usedIndices.has(k)) return null;
        if (tokens[k]?.type === pattern.endType) {
            return { startIndex: i, endIndex: k };
        }
    }
    return null;
};

// Detects compound token sequences based on defined patterns
export const detectTokenPatterns = (
    tokens: ParsedToken[],
    docText: string
): CompoundTokenSequence[] => {
    const compounds: CompoundTokenSequence[] = [];
    const usedIndices = new Set<number>();

    // Sort patterns by priority (higher priority first)
    const sortedPatterns = [...TOKEN_PATTERNS].sort((a, b) => b.priority - a.priority);

    for (const pattern of sortedPatterns) {
        for (let i = 0; i < tokens.length; i++) {
            const range = matchPatternAt(pattern, tokens, i, usedIndices);
            if (!range) continue;

            const { startIndex, endIndex } = range;
            const metadata = pattern.extractor(tokens, startIndex, endIndex, docText);
            if (!metadata) continue;

            compounds.push({
                startIndex,
                endIndex,
                tokenType: pattern.name,
                displayText: metadata.content,
                metadata,
                start: tokens[startIndex].start,
                end: tokens[endIndex].end
            });

            for (let j = startIndex; j <= endIndex; j++) {
                usedIndices.add(j);
            }
            i = endIndex;
        }
    }

    return compounds;
};



// Calculates helper pane position with editor right boundary overflow correction.
// When containerRect is provided and the pane would overflow the container's bottom,
// the pane is flipped upward (isFlipped=true) and top is anchored to the trigger's top edge.
// The ContextMenuContainer applies transform: translateY(-100%) when isFlipped to push it above.
export const calculateHelperPanePosition = (
    targetCoords: { bottom: number; left: number; top?: number },
    editorRect: DOMRect,
    helperPaneWidth: number,
    scrollTop: number = 0,
    containerRect?: DOMRect
): { top: number; left: number; isFlipped?: boolean } => {
    // Detect if the pane would overflow the container's bottom boundary
    const isFlipped = !!(
        containerRect &&
        (containerRect.bottom - targetCoords.bottom) < AVERAGE_HELPER_PANE_HEIGHT
    );

    // When flipped, anchor top to the trigger's top edge so translateY(-100%) places pane above it
    const anchorY = isFlipped && targetCoords.top !== undefined
        ? targetCoords.top
        : targetCoords.bottom;

    // Position relative to the editor container, accounting for scroll
    let top = anchorY - editorRect.top + scrollTop;
    let left = targetCoords.left - editorRect.left;

    // Add overflow correction for editor right boundary
    const editorRight = editorRect.left + editorRect.width;
    const paneRight = targetCoords.left + helperPaneWidth;
    const overflow = paneRight - editorRight;

    if (overflow > 0) {
        left -= overflow;
    }

    return { top, left, isFlipped: isFlipped || undefined };
};

export interface FunctionExtractionResult {
    finalValue: string;
    cursorAdjustment: number; // How much to adjust cursor position from base position
}

export const correctTokenStreamPositions = (
    tokenStream: number[],
    serializedValue: string,
    prefixLength: number,
    suffixLength: number
): number[] => {
    if (!tokenStream || tokenStream.length < 5) {
        return tokenStream;
    }

    if (prefixLength === 0 && suffixLength === 0) {
        return tokenStream;
    }

    const chunks = getTokenChunks(tokenStream);
    const correctedTokens: number[] = [];

    let currentLine = 0;
    let currentChar = 0;
    let previousLine = 0;
    let previousChar = 0;

    for (const chunk of chunks) {
        const deltaLine = chunk[TOKEN_LINE_OFFSET_INDEX];
        const deltaStartChar = chunk[TOKEN_START_CHAR_OFFSET_INDEX];
        const length = chunk[TOKEN_LENGTH_INDEX];
        const type = chunk[TOKEN_TYPE_INDEX];
        const modifiers = chunk[TOKEN_MODIFIERS_INDEX];

        // Calculate absolute position in raw expression
        currentLine += deltaLine;
        if (deltaLine === 0) {
            currentChar += deltaStartChar;
        } else {
            currentChar = deltaStartChar;
        }

        // Map to sanitized expression space
        let sanitizedLine = currentLine;
        let sanitizedChar = currentChar;

        if (currentLine === 0) {
            // First line: subtract prefix length
            sanitizedChar = Math.max(0, currentChar - prefixLength);
        }
        // For lines > 0, no adjustment needed as prefix is only on first line

        // Calculate deltas for the corrected token
        const correctedDeltaLine = sanitizedLine - previousLine;
        const correctedDeltaChar = correctedDeltaLine === 0
            ? sanitizedChar - previousChar
            : sanitizedChar;

        correctedTokens.push(
            correctedDeltaLine,
            correctedDeltaChar,
            length,
            type,
            modifiers
        );

        previousLine = sanitizedLine;
        previousChar = sanitizedChar;
    }

    return correctedTokens;
};

// Processes a value that ends with () or )}, extracting function arguments and creating placeholders
export const processFunctionWithArguments = async (
    value: string,
    extractArgsFromFunction: (value: string, cursorPosition: number) => Promise<{
        label: string;
        args: string[];
        currentArgIndex: number;
        documentation?: FnSignatureDocumentation;
    }>
): Promise<FunctionExtractionResult> => {
    try {
        // Extract the function definition from string templates like "${func()}"
        let functionDef = value;
        let prefix = '';
        let suffix = '';

        // Check if it's within a string template
        const stringTemplateMatch = value.match(/^(.*\$\{)([^}]+)(\}.*)$/);
        if (stringTemplateMatch) {
            prefix = stringTemplateMatch[1];
            functionDef = stringTemplateMatch[2];
            suffix = stringTemplateMatch[3];
        }

        // Calculate cursor position for extraction relative to the functionDef string
        let cursorPositionForExtraction = functionDef.length - 1;
        if (functionDef.endsWith(')}')) {
            cursorPositionForExtraction -= 1;
        }

        // Extract function signature from backend
        const fnSignature = await extractArgsFromFunction(functionDef, cursorPositionForExtraction);

        if (fnSignature && fnSignature.args && fnSignature.args.length > 0) {
            // Generate placeholder arguments: $1, $2, $3, etc.
            const placeholderArgs = fnSignature.args.map((_arg, index) => `$${index + 1}`);
            const updatedFunctionDef = functionDef.slice(0, -2) + '(' + placeholderArgs.join(', ') + ')';
            const finalValue = prefix + updatedFunctionDef + suffix;

            // Cursor adjustment is relative to the start of the inserted value
            const closingParenIndex = finalValue.lastIndexOf(")");
            const cursorAdjustment =
                closingParenIndex >= 0 ? closingParenIndex + 1 : finalValue.length;

            return { finalValue, cursorAdjustment };
        }
    } catch (error) {
        console.warn('Failed to extract function arguments:', error);
    }

    // Return original value if extraction failed or no arguments
    // Keep caret at the end of the inserted snippet.
    return { finalValue: value, cursorAdjustment: value.length };
};

export const normalizeEditorValue = (v: unknown) =>
    typeof v === 'string' ? v.trim() : v;

export const coerceChipEditorValue = (value: unknown): string | null | undefined =>
    typeof value === 'string' || value == null ? (value as string | null | undefined) : String(value);
