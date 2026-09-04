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

import { ModelMessage } from 'ai';
import {
    MAX_TRUNCATION_RETRIES,
    buildTruncationRecoveryNote,
    addUsage,
    dropDanglingToolCalls,
} from '../features/ai/agent/truncation-recovery';

describe('dropDanglingToolCalls', () => {
    const assistant = (...content: any[]): ModelMessage => ({ role: 'assistant', content } as ModelMessage);
    const toolResult = (toolCallId: string): ModelMessage =>
        ({ role: 'tool', content: [{ type: 'tool-result', toolCallId, toolName: 't', output: 'ok' }] } as ModelMessage);
    const call = (toolCallId: string) => ({ type: 'tool-call', toolCallId, toolName: 't', input: {} });

    it('drops a tool call that never produced a result', () => {
        // The whole point: re-sending an unanswered tool_use makes Anthropic reject the
        // resume request outright, turning a recoverable truncation into a hard failure.
        const out = dropDanglingToolCalls([
            assistant({ type: 'text', text: 'rewriting the client' }, call('cut-off')),
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].content).toEqual([{ type: 'text', text: 'rewriting the client' }]);
    });

    it('keeps tool calls that were answered', () => {
        const messages = [assistant(call('done')), toolResult('done')];
        const out = dropDanglingToolCalls(messages);
        expect(out).toEqual(messages);
    });

    it('keeps the answered call and drops only the dangling one from the same message', () => {
        const out = dropDanglingToolCalls([
            assistant(call('done'), call('cut-off')),
            toolResult('done'),
        ]);
        expect(out[0].content).toEqual([call('done')]);
    });

    it('removes an assistant message left empty, which the API also rejects', () => {
        const out = dropDanglingToolCalls([
            assistant({ type: 'text', text: 'first' }),
            assistant(call('cut-off')),
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].content).toEqual([{ type: 'text', text: 'first' }]);
    });

    it('returns the same references when nothing is dangling', () => {
        // Resuming is the hot path for a large generation; leave untouched turns alone.
        const messages = [assistant({ type: 'text', text: 'hi' })];
        expect(dropDanglingToolCalls(messages)[0]).toBe(messages[0]);
    });

    it('leaves string-content and empty message lists alone', () => {
        expect(dropDanglingToolCalls([])).toEqual([]);
        const plain = [{ role: 'assistant', content: 'plain text' } as ModelMessage];
        expect(dropDanglingToolCalls(plain)).toEqual(plain);
    });
});

describe('addUsage', () => {
    const usage = (input: number, output: number, read = 0, write = 0) => ({
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
        inputTokenDetails: { cacheReadTokens: read, cacheWriteTokens: write },
    }) as any;

    it('sums tokens and cache details across attempts', () => {
        // A resumed turn is billed as several API calls; reporting only the last one would
        // understate cost exactly on the turns that cost the most.
        const total = addUsage(usage(100, 20, 5, 7), usage(300, 40, 11, 13));
        expect(total.inputTokens).toBe(400);
        expect(total.outputTokens).toBe(60);
        expect(total.totalTokens).toBe(460);
        expect(total.inputTokenDetails?.cacheReadTokens).toBe(16);
        expect(total.inputTokenDetails?.cacheWriteTokens).toBe(20);
    });

    it('treats a missing accumulator as zero, so the first attempt passes through', () => {
        expect(addUsage(undefined, usage(10, 2, 1, 1))).toMatchObject({ inputTokens: 10, outputTokens: 2 });
    });

    it('tolerates absent fields on either side', () => {
        expect(addUsage({} as any, undefined)).toMatchObject({ inputTokens: 0, outputTokens: 0 });
    });
});

describe('buildTruncationRecoveryNote', () => {
    const note = buildTruncationRecoveryNote('file_batch_edit', 'file_edit');

    it('tells the model its last edit never landed and earlier ones did', () => {
        expect(note).toMatch(/did NOT reach the project/);
        expect(note).toMatch(/already saved to disk/);
    });

    it('names the edit tools it is given, so the advice tracks the registry', () => {
        expect(note).toContain('file_batch_edit');
        expect(note).toContain('file_edit');
        expect(buildTruncationRecoveryNote('a_tool', 'b_tool')).toContain('a_tool');
    });

    it('asks the model to re-check already-applied edits before continuing', () => {
        expect(note).toMatch(/Re-check the files you already changed/);
    });

    it('tells the model not to restart or repeat successful edits', () => {
        expect(note).toMatch(/Do not start the task over/);
    });

    it('bounds the resume budget', () => {
        expect(MAX_TRUNCATION_RETRIES).toBeGreaterThan(0);
        expect(MAX_TRUNCATION_RETRIES).toBeLessThanOrEqual(3);
    });
});
