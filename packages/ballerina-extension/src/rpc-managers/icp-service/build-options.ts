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

// Pure Ballerina.toml edits behind the ICP toggle, kept free of vscode imports so they
// can be unit tested.

const SECTION_NAME = 'build-options';
const SECTION_HEADER = `[${SECTION_NAME}]`;

export const ICP_BUILD_OPTION_KEYS = ['observabilityIncluded', 'remoteManagement'];

// A key may be bare (`key`), basic-quoted (`"key"`) or literal-quoted (`'key'`); all three
// name the same key, so a quoted one must be matched or an edit would duplicate it.
// `lead` is everything up to the value and `trail` everything after it, such as a comment.
const KEY_VALUE = /^(\s*(?:([A-Za-z0-9_-]+)|"([^"\\]*)"|'([^']*)')\s*=\s*)("[^"]*"|'[^']*'|[^\s#]*)(.*)$/;

function keyValueOf(line: string): { key: string; lead: string; value: string; trail: string } | undefined {
    const match = line.match(KEY_VALUE);
    return match
        ? { key: match[2] ?? match[3] ?? match[4], lead: match[1], value: match[5], trail: match[6] }
        : undefined;
}

function keyOf(line: string): string | undefined {
    return keyValueOf(line)?.key;
}

// The name of a `[table]` or `[[array]]` header, tolerating a trailing comment, spacing
// inside the brackets and quoted segments.
function tableHeader(line: string): { name: string; isArray: boolean } | undefined {
    const match = line.match(/^\s*(\[\[?)([^\]#]*)\]\]?\s*(?:#.*)?$/);
    if (!match) {
        return undefined;
    }
    const name = match[2].split('.')
        .map(segment => segment.trim().replace(/^"(.*)"$|^'(.*)'$/, '$1$2'))
        .join('.');
    return { name, isArray: match[1] === '[[' };
}

function findSection(lines: string[]): { start: number; end: number } | undefined {
    const start = lines.findIndex(line => {
        const header = tableHeader(line);
        return header?.name === SECTION_NAME && !header.isArray;
    });
    if (start === -1) {
        return undefined;
    }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (tableHeader(lines[i])) {
            end = i;
            break;
        }
    }
    return { start, end };
}

// Split on either line ending and join back with the file's own, so a CRLF manifest is
// matched line by line and gets no LF-only lines added to it.
function splitLines(content: string): { lines: string[]; eol: string } {
    return { lines: content.split(/\r?\n/), eol: content.includes('\r\n') ? '\r\n' : '\n' };
}

function joinLines(lines: string[], eol: string): string {
    const content = lines.join(eol);
    return content.length > 0 && !content.endsWith(eol) ? content + eol : content;
}

// `build-options = { ... }` or `build-options.key = ...` before the first table: adding a
// `[build-options]` table next to it would define the table twice.
function hasInlineBuildOptions(lines: string[]): boolean {
    for (const line of lines) {
        if (tableHeader(line)) {
            return false;
        }
        if (/^\s*["']?build-options["']?\s*[.=]/.test(line)) {
            return true;
        }
    }
    return false;
}

/**
 * Sets every ICP build option to `true`, adding the `[build-options]` section or the
 * missing keys, and flipping keys that are present with any other value.
 */
export function addICPBuildOptions(content: string): string {
    const { lines, eol } = splitLines(content);
    const section = findSection(lines);

    if (!section) {
        if (hasInlineBuildOptions(lines)) {
            throw new Error(`Ballerina.toml sets ${SECTION_NAME} inline. Move it to a [${SECTION_NAME}] table and try again.`);
        }
        lines.push('', SECTION_HEADER, ...ICP_BUILD_OPTION_KEYS.map(key => `${key} = true`));
        return joinLines(lines, eol);
    }

    const missing: string[] = [];
    for (const key of ICP_BUILD_OPTION_KEYS) {
        const index = lines.slice(section.start + 1, section.end).findIndex(line => keyOf(line) === key);
        if (index === -1) {
            missing.push(`${key} = true`);
        } else {
            // Swap only the value, so the key's spelling and a trailing comment survive.
            const { lead, trail } = keyValueOf(lines[section.start + 1 + index]);
            lines[section.start + 1 + index] = `${lead}true${trail}`;
        }
    }
    lines.splice(section.start + 1, 0, ...missing);
    return joinLines(lines, eol);
}

/**
 * Whether every ICP build option is set to `true` in the `[build-options]` section.
 */
export function hasICPBuildOptions(content: string): boolean {
    const { lines } = splitLines(content);
    const section = findSection(lines);
    if (!section) {
        return false;
    }
    const values = new Map(lines.slice(section.start + 1, section.end)
        .map(keyValueOf)
        .filter(entry => entry !== undefined)
        .map(entry => [entry.key, entry.value]));
    return ICP_BUILD_OPTION_KEYS.every(key => values.get(key) === 'true');
}

/**
 * Removes the ICP build options, and the `[build-options]` section itself when nothing
 * else is left in it.
 */
export function removeICPBuildOptions(content: string): string {
    const { lines, eol } = splitLines(content);
    const section = findSection(lines);
    if (!section) {
        return content;
    }

    const remaining = lines.slice(section.start + 1, section.end)
        .filter(line => !ICP_BUILD_OPTION_KEYS.includes(keyOf(line) ?? ''));

    if (remaining.every(line => line.trim() === '')) {
        lines.splice(section.start, section.end - section.start);
    } else {
        lines.splice(section.start + 1, section.end - section.start - 1, ...remaining);
    }
    return joinLines(lines, eol);
}
