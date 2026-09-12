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

// Regression coverage for the file edit tools' replacement core.
//
// The tools used to pass `new_string` as the replacement argument of replace/replaceAll, so
// JS expanded `$` patterns in it. An end-anchored Ballerina regex (re `...$`) yielded
// `` $` `` and spliced the head of the file in at the match point, multiplying the file.

import * as path from 'path';
import { applyEdit, contentsEquivalent, replaceLiteral } from '../features/ai/utils/edit-replacement';

describe('replaceLiteral / applyEdit — $ substitution patterns are inserted literally', () => {
    const file = [
        'import ballerina/http;',
        '',
        'function validate(string id) returns boolean {',
        '    return true;',
        '}',
        '',
    ].join('\n');
    const target = '    return true;';

    it('keeps a backtick regex literal anchored with $ intact', () => {
        const payload = '    return id.matches(re `^ORD-[0-9]{6}$`);';
        const result = applyEdit(file, target, payload, false);

        expect(result).toBe(file.replace(target, () => payload));
        expect(result).toContain('re `^ORD-[0-9]{6}$`');
        // The head of the file must not be spliced in at the match point.
        expect(result.split('import ballerina/http;')).toHaveLength(2);
        expect(result.length).toBeLessThan(file.length + payload.length);
    });

    it('does not collapse $$ in a string template', () => {
        const payload = '    return string `Price: $${amount}`;';
        expect(applyEdit(file, target, payload, false)).toContain('string `Price: $${amount}`');
    });

    it.each([
        ['$&  (whole match)', 'a$&b'],
        ["$'  (suffix)", "a$'b"],
        ['$`  (prefix)', 'a$`b'],
        ['$1  (capture group)', 'a$1b'],
        ['$$  (escaped dollar)', 'a$$b'],
    ])('inserts %s verbatim', (_label, payload) => {
        expect(replaceLiteral('X', 'X', payload, false)).toBe(payload);
        expect(replaceLiteral('X', 'X', payload, true)).toBe(payload);
    });

    it('does not multiply the file when replace_all hits many matches', () => {
        let source = '';
        for (let i = 1; i <= 6; i++) {
            source += `function f${i}() returns string {\n    return "x";\n}\n`;
        }
        const payload = '    return string `amt: $`;';
        const result = applyEdit(source, '    return "x";', payload, true);

        // Growth must be bounded by the payload delta, not by the file size.
        expect(result.length).toBe(source.length + 6 * (payload.length - '    return "x";'.length));
        // Every function must still appear exactly once; a self-similar dup is unrecoverable.
        for (let i = 1; i <= 6; i++) {
            expect(result.split(`function f${i}()`)).toHaveLength(2);
        }
    });

    it('replaces only the first match when replaceAll is false', () => {
        expect(applyEdit('a a a', 'a', 'b', false)).toBe('b a a');
        expect(applyEdit('a a a', 'a', 'b', true)).toBe('b b b');
    });

    it('writes the replacement as the whole file for an empty edit on an empty file', () => {
        expect(applyEdit('', '', 'hello', false)).toBe('hello');
        expect(applyEdit('   \n', '', 'hello', false)).toBe('hello');
    });
});

describe('contentsEquivalent', () => {
    it('ignores EOL style', () => {
        expect(contentsEquivalent('a\r\nb\r\n', 'a\nb\n')).toBe(true);
    });

    it('ignores trailing whitespace and final-newline fixups applied on save', () => {
        expect(contentsEquivalent('a   \nb\t\n', 'a\nb')).toBe(true);
        expect(contentsEquivalent('a\nb\n\n\n', 'a\nb')).toBe(true);
    });

    it('still reports real content differences', () => {
        expect(contentsEquivalent('a\nb', 'a\nc')).toBe(false);
        // Leading indentation is significant in Ballerina and must not be normalised away.
        expect(contentsEquivalent('    a', 'a')).toBe(false);
    });
});

// The per-file lock must key off the same path the tools operate on: path.resolve drops the
// project root for an absolute-looking file_path that validateFilePath still accepts.
describe('lock key path normalization', () => {
    const root = path.join(path.sep, 'tmp', 'proj');

    it.each(['main.bal', 'sub/main.bal'])('agrees with path.join for the relative path %s', (p) => {
        expect(path.join(root, p)).toBe(path.resolve(root, p));
    });

    it('keeps an absolute-looking file_path inside the project root', () => {
        const abs = `${path.sep}main.bal`;
        expect(path.join(root, abs)).toBe(path.join(root, 'main.bal'));
        // The bug: resolve escapes the root, so it would not collide with the plain spelling.
        expect(path.resolve(root, abs)).not.toBe(path.join(root, abs));
    });
});
