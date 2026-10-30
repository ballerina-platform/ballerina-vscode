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

const SECTION_HEADER = '[build-options]';

export const ICP_BUILD_OPTION_KEYS = ['observabilityIncluded', 'remoteManagement'];

function keyOf(line: string): string | undefined {
    return line.match(/^\s*([A-Za-z0-9_-]+)\s*=/)?.[1];
}

function isTableHeader(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('[') && trimmed.endsWith(']');
}

function findSection(lines: string[]): { start: number; end: number } | undefined {
    const start = lines.findIndex(line => line.trim() === SECTION_HEADER);
    if (start === -1) {
        return undefined;
    }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (isTableHeader(lines[i])) {
            end = i;
            break;
        }
    }
    return { start, end };
}

function withTrailingNewline(content: string): string {
    return content.length > 0 && !content.endsWith('\n') ? content + '\n' : content;
}

/**
 * Sets every ICP build option to `true`, adding the `[build-options]` section or the
 * missing keys, and flipping keys that are present with any other value.
 */
export function addICPBuildOptions(content: string): string {
    const lines = content.split('\n');
    const section = findSection(lines);

    if (!section) {
        lines.push('', SECTION_HEADER, ...ICP_BUILD_OPTION_KEYS.map(key => `${key} = true`));
        return withTrailingNewline(lines.join('\n'));
    }

    const missing: string[] = [];
    for (const key of ICP_BUILD_OPTION_KEYS) {
        const index = lines.slice(section.start + 1, section.end).findIndex(line => keyOf(line) === key);
        if (index === -1) {
            missing.push(`${key} = true`);
        } else {
            lines[section.start + 1 + index] = `${key} = true`;
        }
    }
    lines.splice(section.start + 1, 0, ...missing);
    return withTrailingNewline(lines.join('\n'));
}

/**
 * Removes the ICP build options, and the `[build-options]` section itself when nothing
 * else is left in it.
 */
export function removeICPBuildOptions(content: string): string {
    const lines = content.split('\n');
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
    return withTrailingNewline(lines.join('\n'));
}
