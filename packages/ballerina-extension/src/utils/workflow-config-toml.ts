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
import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@iarna/toml';
import { window } from 'vscode';

// The configurables live in `workflow.management.rest`, the module that owns the HTTP listener.
const TABLE = 'ballerina.workflow.management.rest';
const KEY = 'enableManagementApi';
// An earlier toggle wrote these under `ballerina.workflow.management`, where none of them is a
// configurable, so they are cleared from there whenever the toggle runs.
const STALE_TABLE = 'ballerina.workflow.management';
const STALE_KEYS = [KEY, 'port', 'enableBasicAuth'];

const ALREADY_TRUE = /=[ \t]*true[ \t]*(?:#[^\r\n]*)?\r?$/;
// Captures around the value so a flip rewrites it alone, leaving any trailing comment.
const VALUE = /^([ \t]*[\w.]+[ \t]*=[ \t]*)("(?:[^"\\\r\n]|\\.)*"|'[^'\r\n]*'|[^#\r\n]*?)([ \t]*(?:#[^\r\n]*)?\r?)$/;

const LOG = '[WorkflowManagement]';

// The language server has already written the import into main.bal by the time this runs, so a
// Config.toml this editor leaves alone is a half-applied change: say so rather than letting the
// checkbox flip back with the reason in a console nobody is looking at.
function reportUnchanged(reason: string, enabled: boolean): void {
    const message = `Workflow management: ${reason}. Set ${KEY} = ${enabled} under [${TABLE}] `
        + 'in Config.toml by hand.';
    console.error(`${LOG} ${message}`);
    window.showWarningMessage(message);
}

/**
 * Turns the workflow management REST API on in Config.toml. Edits the file as text so that
 * comments, key order and formatting elsewhere are left byte for byte as the author wrote them.
 * Only `enableManagementApi` is written; every other setting keeps its module default.
 */
export function enableWorkflowManagementConfig(projectPath: string): void {
    const configPath = path.join(projectPath, 'Config.toml');
    const content = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
    const updated = withManagementApi(content, true);
    if (updated !== content) {
        fs.writeFileSync(configPath, updated, 'utf-8');
    }
}

/** Removes `enableManagementApi`, and the table too once nothing else is left in it. */
export function disableWorkflowManagementConfig(projectPath: string): void {
    const configPath = path.join(projectPath, 'Config.toml');
    if (!fs.existsSync(configPath)) {
        return;
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    const updated = withManagementApi(content, false);
    if (updated !== content) {
        fs.writeFileSync(configPath, updated, 'utf-8');
    }
}

type Toml = Record<string, any>;

/**
 * The text edit is line-based and knows one spelling of the table, so the parser is its safety
 * net: a file that does not parse is never touched, and an edit whose parsed result is not the
 * original with exactly this change applied — a key line that sat inside a multiline string, a
 * table written as dotted keys — is thrown away, and the file is left for the author.
 */
function withManagementApi(original: string, enabled: boolean): string {
    const before = parseToml(original);
    if (before === undefined) {
        reportUnchanged('Config.toml could not be parsed, so it was left unchanged', enabled);
        return original;
    }

    const content = dropStaleKeys(original);
    const table = findTable(content, TABLE);
    const key = table && keyLine(KEY).exec(table.body);
    let updated: string;
    if (!key) {
        updated = enabled ? appendKey(content, table) : content;
    } else {
        const start = table.bodyStart + key.index;
        const end = start + key[0].length;
        if (enabled) {
            updated = ALREADY_TRUE.test(key[0])
                ? content
                : content.slice(0, start) + key[0].replace(VALUE, '$1true$3') + content.slice(end);
        } else {
            updated = dropTableIfEmpty(content.slice(0, start) + content.slice(Math.min(end + 1, content.length)), TABLE);
        }
    }

    if (updated === original) {
        return original;
    }
    const after = parseToml(updated);
    let expected: boolean;
    try {
        expected = after !== undefined && isExpectedChange(before, after, enabled);
    } catch (error) {
        // The verifier is a safety net; a value it cannot compare must leave the file alone rather
        // than take the whole toggle down with it.
        console.error(`${LOG} Could not verify the edit:`, error);
        expected = false;
    }
    if (!expected) {
        reportUnchanged(`Config.toml declares ${TABLE} in a form this editor does not rewrite`, enabled);
        return original;
    }
    return updated;
}

function parseToml(content: string): Toml | undefined {
    try {
        return parse(content) as Toml;
    } catch {
        return undefined;
    }
}

// True when `after` is `before` with the stale keys gone and `enableManagementApi` set (or
// removed) under the REST table, and nothing else different.
function isExpectedChange(before: Toml, after: Toml, enabled: boolean): boolean {
    // structuredClone, not a JSON round trip: TOML carries dates, and integers outside the safe
    // range arrive as BigInt — JSON turns the first into a string and throws on the second.
    const expected = structuredClone(before);
    const management = expected.ballerina?.workflow?.management;
    if (management) {
        for (const stale of STALE_KEYS) {
            delete management[stale];
        }
        if (enabled) {
            management.rest = { ...(management.rest ?? {}), [KEY]: true };
        } else if (management.rest) {
            delete management.rest[KEY];
            if (Object.keys(management.rest).length === 0) {
                delete management.rest;
            }
        }
        if (Object.keys(management).length === 0) {
            delete expected.ballerina.workflow.management;
        }
    } else if (enabled) {
        expected.ballerina = expected.ballerina ?? {};
        expected.ballerina.workflow = expected.ballerina.workflow ?? {};
        expected.ballerina.workflow.management = { rest: { [KEY]: true } };
    }
    return sameValue(pruneEmpty(expected), pruneEmpty(after));
}

// `instanceof` is not safe here: structuredClone returns host-realm objects, which the test
// sandbox's Date does not recognise. The tag is realm-independent.
function isDate(value: unknown): value is Date {
    return Object.prototype.toString.call(value) === '[object Date]';
}

// Tables left with no keys are equivalent whether or not a header line remains for them.
function pruneEmpty(value: any): any {
    if (Array.isArray(value)) {
        return value.map(pruneEmpty);
    }
    if (value && typeof value === 'object' && !isDate(value)) {
        const out: Toml = {};
        for (const [k, v] of Object.entries(value)) {
            const pruned = pruneEmpty(v);
            if (!isEmptyTable(pruned)) {
                out[k] = pruned;
            }
        }
        return out;
    }
    return value;
}

// A table with nothing in it. Deliberately not "any object with no enumerable keys": a date has
// none either, and dropping those made two identical files compare as different.
function isEmptyTable(value: unknown): boolean {
    return !!value && typeof value === 'object' && !Array.isArray(value) && !isDate(value)
        && Object.keys(value).length === 0;
}

function sameValue(a: any, b: any): boolean {
    if (a === b) {
        return true;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
    }
    if (isDate(a) || isDate(b)) {
        return isDate(a) && isDate(b) && a.getTime() === b.getTime();
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every(k => k in b && sameValue(a[k], b[k]));
    }
    return false;
}

interface Table {
    headerStart: number;
    bodyStart: number;
    body: string;
}

function keyLine(key: string): RegExp {
    return new RegExp(`^[ \\t]*${key}[ \\t]*=[^\\n]*$`, 'm');
}

function findTable(content: string, name: string): Table | undefined {
    const header = new RegExp(`^[ \\t]*\\[${name.replace(/\./g, '\\.')}\\][ \\t]*(?:#[^\\r\\n]*)?$`, 'm')
        .exec(content);
    if (!header) {
        return undefined;
    }
    const newline = content.indexOf('\n', header.index + header[0].length);
    const bodyStart = newline === -1 ? content.length : newline + 1;
    const rest = content.slice(bodyStart);
    const next = /^[ \t]*\[/m.exec(rest);
    return { headerStart: header.index, bodyStart, body: next ? rest.slice(0, next.index) : rest };
}

function appendKey(content: string, table: Table | undefined): string {
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    if (table) {
        const head = content.slice(0, table.bodyStart);
        const separator = head === '' || head.endsWith('\n') ? '' : eol;
        return head + separator + `${KEY} = true${eol}` + content.slice(table.bodyStart);
    }
    let out = content;
    if (out.length > 0 && !out.endsWith('\n')) { out += eol; }
    if (out.length > 0 && !out.endsWith('\n\n') && !out.endsWith('\r\n\r\n')) { out += eol; }
    return out + `[${TABLE}]${eol}${KEY} = true${eol}`;
}

function dropStaleKeys(content: string): string {
    const table = findTable(content, STALE_TABLE);
    if (!table) {
        return content;
    }
    let body = table.body;
    for (const key of STALE_KEYS) {
        body = body.replace(new RegExp(`^[ \\t]*${key}[ \\t]*=[^\\n]*\\n?`, 'm'), '');
    }
    if (body === table.body) {
        return content;
    }
    const updated = content.slice(0, table.bodyStart) + body + content.slice(table.bodyStart + table.body.length);
    return dropTableIfEmpty(updated, STALE_TABLE);
}

function dropTableIfEmpty(content: string, name: string): string {
    const table = findTable(content, name);
    if (!table || table.body.trim() !== '') {
        return content;
    }
    return content.slice(0, table.headerStart) + content.slice(table.bodyStart + table.body.length);
}
