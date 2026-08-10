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

/**
 * @jest-environment node
 *
 * Guards the ambient status label against the field-name mismatch that made every
 * file tool render the generic "Editing files": describeToolCall read `file_path`,
 * but emitFileToolCall emits `{ fileName }`. A wrong key here fails silently — the
 * label still renders, just without the file name — so it needs a test rather than
 * a type check.
 */

import { describeToolCall } from '../features/ai/state/toolLabels';

describe('describeToolCall', () => {
    describe('the fileName key the file tools actually emit', () => {
        // Mirrors emitFileToolCall: toolInput is { fileName: <path> }.
        it.each([
            ['file_write', 'Editing service.bal'],
            ['file_edit', 'Editing service.bal'],
            ['file_batch_edit', 'Editing service.bal'],
        ])('%s names the file', (toolName, expected) => {
            expect(describeToolCall(toolName, { fileName: '/tmp/proj/service.bal' })).toBe(expected);
        });

        it('file_read names the file', () => {
            expect(describeToolCall('file_read', { fileName: '/tmp/proj/types.bal' }))
                .toBe('Reading types.bal');
        });
    });

    it('still reads file_path, for tools that pass raw Zod input through', () => {
        // e.g. migration_source_read / the MCP bridge, whose schema field is file_path.
        expect(describeToolCall('file_read', { file_path: '/tmp/proj/main.bal' }))
            .toBe('Reading main.bal');
    });

    it('prefers fileName when a tool somehow carries both', () => {
        expect(describeToolCall('file_write', { fileName: 'a.bal', file_path: 'b.bal' }))
            .toBe('Editing a.bal');
    });

    describe('falls back to the generic label when no usable path is present', () => {
        it.each([
            ['input missing', undefined],
            ['empty object', {}],
            ['empty string', { fileName: '' }],
            ['non-string', { fileName: 42 }],
        ])('%s', (_case, toolInput) => {
            expect(describeToolCall('file_write', toolInput)).toBe('Editing files');
        });
    });

    it('reduces a bare filename to itself', () => {
        expect(describeToolCall('file_write', { fileName: 'main.bal' })).toBe('Editing main.bal');
    });

    it('labels non-file tools without touching the path logic', () => {
        expect(describeToolCall('getCompilationErrors')).toBe('Checking for errors');
        expect(describeToolCall('runTests')).toBe('Running tests');
    });

    it('names the tool behind an MCP call, and falls back for unknown tools', () => {
        expect(describeToolCall('mcp__github__create_issue')).toBe('Using create_issue');
        expect(describeToolCall('some_future_tool')).toBe('Running some_future_tool');
    });
});
