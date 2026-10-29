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

import { Position, Range } from 'vscode';
import { trackRange } from '../features/scan/range-tracking';

const range = (sl: number, sc: number, el: number, ec: number) => new Range(new Position(sl, sc), new Position(el, ec));
const change = (r: Range, text: string) => ({ range: r, text });
const plain = (r: Range | undefined) => r && [r.start.line, r.start.character, r.end.line, r.end.character];

describe('trackRange', () => {
    const finding = range(5, 4, 5, 20);

    it('keeps a range before the change', () => {
        expect(plain(trackRange(finding, [change(range(8, 0, 8, 0), 'x\n')]))).toEqual([5, 4, 5, 20]);
    });

    it('moves a range down by the lines inserted above it', () => {
        expect(plain(trackRange(finding, [change(range(2, 0, 2, 0), 'a\nb\n')]))).toEqual([7, 4, 7, 20]);
    });

    it('moves a range up by the lines deleted above it', () => {
        expect(plain(trackRange(finding, [change(range(1, 0, 3, 0), '')]))).toEqual([3, 4, 3, 20]);
    });

    it('moves a range below an annotation inserted at its start', () => {
        const annotation = '@scan:Suppress {rules: ["ballerina:1"], reason: ""}\n    ';
        expect(plain(trackRange(finding, [change(range(5, 4, 5, 4), annotation)]))).toEqual([6, 4, 6, 20]);
    });

    it('shifts the columns of a range after text typed earlier on its line', () => {
        expect(plain(trackRange(finding, [change(range(5, 0, 5, 0), '  ')]))).toEqual([5, 6, 5, 22]);
    });

    it('does not grow a range with text typed right after it', () => {
        expect(plain(trackRange(finding, [change(range(5, 20, 5, 20), ';')]))).toEqual([5, 4, 5, 20]);
    });

    it('drops a range that the change edits', () => {
        expect(trackRange(finding, [change(range(5, 10, 5, 12), 'xyz')])).toBeUndefined();
        expect(trackRange(finding, [change(range(5, 10, 5, 10), 'x')])).toBeUndefined();
    });

    it('tracks a position through several changes of one event', () => {
        const point = range(10, 4, 10, 4);
        const changes = [change(range(1, 0, 1, 0), 'import ballerina/scan;\n'), change(range(10, 4, 10, 4), '@a\n    ')];
        expect(plain(trackRange(point, changes))).toEqual([12, 4, 12, 4]);
    });
});
