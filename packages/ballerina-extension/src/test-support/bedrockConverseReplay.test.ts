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
 * Bedrock threads saved while the Copilot used the Converse API keep their reasoning signatures under
 * `bedrock` provider metadata. The InvokeModel provider reads a replayed signature from `anthropic`
 * only, so it drops that reasoning and keeps the text, which the API accepts. These tests send such a
 * history through the real provider with a stubbed fetch and read the request body it builds.
 */

import { createBedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { generateText, ModelMessage } from 'ai';

async function sendHistory(reasoningProviderOptions: Record<string, Record<string, string>>) {
    let body: any;
    const fetch = jest.fn(async (_url: string, init: RequestInit) => {
        body = JSON.parse(init.body as string);
        return new Response(JSON.stringify({
            id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5',
            content: [{ type: 'text', text: 'done' }],
            stop_reason: 'end_turn', stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const bedrock = createBedrockAnthropic({ region: 'us-east-1', apiKey: 'test-key', fetch: fetch as any });

    const messages: ModelMessage[] = [
        { role: 'user', content: 'Add a service.' },
        {
            role: 'assistant',
            content: [
                { type: 'reasoning', text: 'Planning the service.', providerOptions: reasoningProviderOptions },
                { type: 'text', text: 'I added the service.' },
            ],
        },
        { role: 'user', content: 'Now add a test.' },
    ];
    const result = await generateText({ model: bedrock('us.anthropic.claude-sonnet-5-5'), messages });
    return { assistant: body.messages[1], warnings: result.warnings };
}

describe('replaying a Converse-era Bedrock thread through InvokeModel', () => {
    it('drops reasoning signed under the bedrock key and keeps the text', async () => {
        const { assistant, warnings } = await sendHistory({ bedrock: { signature: 'converse-signature' } });

        expect(assistant.role).toBe('assistant');
        expect(assistant.content.map((block: { type: string }) => block.type)).toEqual(['text']);
        expect(assistant.content[0].text).toBe('I added the service.');
        expect(warnings).toEqual(expect.arrayContaining([
            expect.objectContaining({ message: 'unsupported reasoning metadata' }),
        ]));
    });

    it('replays reasoning signed under the anthropic key as a thinking block', async () => {
        const { assistant } = await sendHistory({ anthropic: { signature: 'invoke-signature' } });

        expect(assistant.content[0]).toEqual({ type: 'thinking', thinking: 'Planning the service.', signature: 'invoke-signature' });
        expect(assistant.content[1]).toMatchObject({ type: 'text', text: 'I added the service.' });
    });
});
