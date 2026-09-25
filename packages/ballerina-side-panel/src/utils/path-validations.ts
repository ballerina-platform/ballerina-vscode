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

import {keywords} from "@wso2/ballerina-core";

export interface ParseError {
    position: number;
    message: string;
}

export interface SegmentParam {
    type: 'param' | 'rest-param' | 'const-param';
    annots: string[];
    typeDescriptor: string;
    paramName?: string;
    start: number;
    end: number;
}

export interface ParseResult {
    valid: boolean;
    errors: ParseError[];
    segments: Array<
        | { type: 'dot'; start: number; end: number }
        | { type: 'segment'; value: string; start: number; end: number }
        | SegmentParam
    >;
}

export function processSegment(
    segment: { value: string; start: number; end: number },
    result: ParseResult
) {
    const tokenResult = tokenize(segment.value, segment.start);
    result.errors.push(...tokenResult.errors);

    if (tokenResult.tokens.length !== 1) {
        result.errors.push({
            position: segment.start,
            message: `Invalid segment: ${segment.value}`
        });
        return;
    }

    result.segments.push({
        type: 'segment',
        value: segment.value,
        start: segment.start,
        end: segment.end
    });
}

function tokenize(content: string, offset: number): { tokens: Token[]; errors: ParseError[] } {
    const tokens: Token[] = [];
    const errors: ParseError[] = [];
    let pos = 0;

    while (pos < content.length) {
        const start = pos + offset;
        const c = content[pos];

        if (/\s/.test(c)) {
            pos++;
            continue;
        }
        const { value, newPos, error } = readUnquoted(content, pos, offset);
        pos = newPos;
        if (error) errors.push(error);
        if (value !== null) tokens.push({ value, start, end: pos + offset - 1 });
    }

    return { tokens, errors };
}


export function processParam(
    segment: { value: string; start: number; end: number },
    result: ParseResult
) {
    const content = segment.value.slice(1, -1);

    // split the content by spaces
    const tokens = content.split(/\s+/);
    let typeDescriptor = '';
    let paramName = '';
    if (tokens.length > 0) {
        typeDescriptor = tokens[0];
    }
    if (tokens.length > 1) {
        let paramNameStr = tokens[tokens.length - 1];
        if (!paramNameStr.startsWith('...')) {
            paramName = paramNameStr;
            let paramToken = { value: paramName, start: segment.start + 1, end: segment.end - 1 };
            validateParamName(paramToken, result);
        }
    }

    result.segments.push({
        type: 'param',
        annots: [],
        typeDescriptor,
        paramName,
        start: segment.start,
        end: segment.end
    });
}

function validateParamName(token: Token, result: ParseResult): string | undefined {
    if (!token) return undefined;
    if (!isValidIdentifier(token.value)) {
        result.errors.push({
            position: token.start,
            message: `Invalid parameter name: ${token.value}`
        });
    }
    if (keywords.includes(token.value)) {
        result.errors.push({
            position: token.start,
            message: `Usage of reserved keyword "${token.value}" as parameter name`
        });
    }
    return token.value;
}

// Helper functions and tokenization implementation

interface Token {
    value: string;
    start: number;
    end: number;
}

export function splitSegments(input: string): Array<{ value: string; start: number; end: number }> {
    const segments = [];
    let start = 0;
    let current = 0;

    while (current < input.length) {
        if (input[current] === '/') {
            if (start !== current) {
                segments.push({
                    value: input.substring(start, current),
                    start,
                    end: current - 1
                });
            }
            start = current + 1;
        }
        current++;
    }

    if (start < current) {
        segments.push({
            value: input.substring(start, current),
            start,
            end: current - 1
        });
    }

    return segments;
}

export function readUnquoted(content: string, pos: number, offset: number) {
    let value = '';
    const initial = content[pos];

    if (initial === '\\') {
        const nextChar = content[pos + 1];
        if (nextChar === '-' || nextChar === '\'' || nextChar === '\\' || nextChar === '.') {
            value += initial;
            value += nextChar;
            pos += 2;
        } else {
            return {
                value: null,
                newPos: pos + 1,
                error: { position: pos + offset, message: 'Backslash is not allowed' }
            };
        }
    } else {
        if (!isValidInitial(initial)) {
                return {
                    value: null as string | null,
                    newPos: pos + 1,
                    error: { position: pos + offset, message: `Invalid initial character: ${initial}` }
                };
            }
        value += initial;
        pos++;
    }

    while (pos < content.length) {
        const c = content[pos];
        if (/\s/.test(c) || c === ']' || c === '[') break;
        if (c === '/') {
            return {
                value: null,
                newPos: pos + 1,
                error: { position: pos + offset, message: 'Slash (/) is not allowed in segment' }
            };
        }
        if (isValidFollowing(c)) {
            value += c;
            pos++;
            continue;
        }
        const nextChar = content[pos + 1];

        if (c === '\\') {
            if (nextChar === '-' || nextChar === '\'' || nextChar === '\\' || nextChar === '.') {
                value += c;
                value += nextChar;
                pos += 2;
                continue;
            }
            return {
                value: null,
                newPos: pos + 1,
                error: { position: pos + offset, message: 'Backslash is not allowed' }
            };
        }

        return {
            value: null,
            newPos: pos + 1,
            error: { position: pos + offset, message: `Invalid character: ${c}` }
        };
    }

    return { value, newPos: pos, error: null };
}

function isValidInitial(c: string): boolean {
    // Allow ASCII letters, underscores, and Unicode identifier characters
    return /^[a-zA-Z_']$/.test(c) || isUnicodeIdentifierChar(c);
}

function isValidFollowing(c: string): boolean {
    // Allow ASCII letters, digits, underscores, dashes, and dots
    return /^[a-zA-Z0-9_.-]$/.test(c) || isUnicodeIdentifierChar(c);
}

function isValidIdentifier(value: string): boolean {
    // Check for unquoted identifiers with letters, digits, underscores, dashes, and dots
    if (/^[a-zA-Z_][a-zA-Z0-9_.-]*$/.test(value)) {
        return true;
    }
    // Check for quoted identifiers
    if (/^'[^']*'$/.test(value)) {
        return true;
    }
    return false;
}

function isUnicodeIdentifierChar(c: string): boolean {
    // Placeholder for Unicode identifier character validation
    // You can implement this based on your specific Unicode requirements
    return false;
}

export function isConstantLiteral(value: string): boolean {
    return value.startsWith('"') && value.endsWith('"');
}


export function parseBasePath(input: string): ParseResult {
    const result: ParseResult = {
        valid: false,
        errors: [],
        segments: []
    };

    if (!input || input === '') {
        result.valid = false;
        result.errors.push({ position: 0, message: 'base path cannot be empty' });
        return result;
    }

    // need to handle string literals
    if (input.startsWith('"')) {
        if (!input.endsWith('"')) {
            result.errors.push({ position: 0, message: 'string literal must end with a double quote' });
            return result;
        }
        result.valid = true;
        return result;
    }

    if (!input.startsWith('/')) {
        result.errors.push({ position: 0, message: 'base path must start with a slash (/) character' });
        return result;
    }

    if (input.includes('//')) {
        result.errors.push({ position: 0, message: 'cannot have two consecutive slashes (//)' });
        return result;
    }

    if (input.length > 1 && input.endsWith('/')) {
        result.errors.push({ position: input.length - 1, message: 'base path cannot end with a slash (/)' });
        return result;
    }

    const segments = splitSegments(input);
    for (const segment of segments) {
        processSegment(segment, result);
        if (keywords.includes(segment.value)) {
            result.errors.push({
                position: segment.start,
                message: `usage of reserved keyword "${segment.value}"`
            });
            return result;
        }
    }
    return result;
}

export function parseResourceActionPath(input: string): ParseResult {
    const result: ParseResult = {
        valid: false,
        errors: [],
        segments: []
    };

    if (!input || input === '') {
        result.valid = false;
        result.errors.push({ position: 0, message: 'path cannot be empty' });
        return result;
    }

    if (!input.startsWith('/')) {
        result.errors.push({ position: 0, message: 'base path must start with a slash (/) character' });
        return result;
    }

    if (input.includes('//')) {
        result.errors.push({ position: 0, message: 'cannot have two consecutive slashes (//)' });
        return result;
    }

    if (input.length > 1 && input.endsWith('/')) {
        result.errors.push({ position: input.length - 1, message: 'path cannot end with a slash (/)' });
        return result;
    }

    const segments = splitSegments(input);
    for (const segment of segments) {
        if (segment.value.startsWith('[') || segment.value.endsWith(']')) {
            continue;
        }
        processSegment(segment, result);
        if (keywords.includes(segment.value)) {
            result.errors.push({
                position: segment.start,
                message: `usage of reserved keyword "${segment.value}"`
            });
            return result;
        }
    }

    result.valid = result.errors.length === 0;
    return result;
}

/**
 * Validates a service resource function's path (e.g. `chat/[string room]`), the same rules the HTTP
 * resource form applies: no leading slash, `.` for the service root, and bracketed path params.
 */
export function parseResourceFunctionPath(input: string): ParseResult {
    const result: ParseResult = {
        valid: false,
        errors: [],
        segments: []
    };

    if (!input || input === '') {
        result.errors.push({ position: 0, message: 'path cannot be empty' });
        return result;
    }

    if (input === '.') {
        result.segments.push({ type: 'dot', start: 0, end: 0 });
        result.valid = true;
        return result;
    }

    if (input.startsWith('/')) {
        result.errors.push({ position: 0, message: 'path cannot start with a slash (/)' });
        return result;
    }

    if (input.includes('//')) {
        result.errors.push({ position: 0, message: 'cannot have two consecutive slashes (//)' });
        return result;
    }

    if (input.endsWith('/')) {
        result.errors.push({ position: input.length - 1, message: 'path cannot end with a slash (/)' });
        return result;
    }

    for (const segment of splitSegments(input)) {
        const opens = segment.value.startsWith('[');
        const closes = segment.value.endsWith(']');
        if (opens !== closes) {
            result.errors.push({
                position: opens ? segment.end : segment.start,
                message: `path parameter is missing its ${opens ? 'closing (])' : 'opening ([)'} bracket`
            });
        } else if (opens) {
            processParam(segment, result);
        } else {
            processSegment(segment, result);
            if (keywords.includes(segment.value)) {
                result.errors.push({
                    position: segment.start,
                    message: `usage of reserved keyword "${segment.value}"`
                });
            }
        }
    }

    result.valid = result.errors.length === 0;
    return result;
}
