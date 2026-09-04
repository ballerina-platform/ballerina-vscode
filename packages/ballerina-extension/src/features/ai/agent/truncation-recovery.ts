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

import { LanguageModelUsage, ModelMessage } from 'ai';

/**
 * Resuming a turn the model cut short at its per-response output limit.
 *
 * Split from `AgentExecutor` as the only pure part of that flow. Deliberately import-free:
 * importing the tool registry for two tool-name constants would pull in `ballerina-core`
 * and its ESM deps, which is what makes the executor itself untestable.
 */

/**
 * Resume budget for a turn that ran out of output room. Bounded because each resume
 * re-sends the whole context, so a model that keeps truncating would loop indefinitely.
 */
export const MAX_TRUNCATION_RETRIES = 2;

/**
 * Handed back to the model as a user turn after its response was cut off mid-tool-call.
 *
 * The re-verify step earns its place: the missing change is usually the one that would have
 * made the earlier edits consistent. Tool names are parameters, not imports, so they stay
 * checked against the registry at the call site — see the note on this module.
 */
export function buildTruncationRecoveryNote(batchEditTool: string, singleEditTool: string): string {
    return `<system_reminder>
Your previous response was cut off because it reached the maximum output length for a single response. The tool call you were writing when that happened was never executed, so the change it carried did NOT reach the project. Tool calls you made earlier in this turn did run, and their edits are already saved to disk.

Before continuing:
1. Re-check the files you already changed in this turn and the current state of the project. Because that last change is missing, the code may be inconsistent, half-updated, or no longer compile.
2. Then finish the remaining work.

Make the remaining changes as several small edits instead of one large one — prefer a ${batchEditTool} with a few focused hunks, or several separate ${singleEditTool} calls, over rewriting a whole file in one call. Rewriting a large file in a single call will hit the same limit again.

Do not start the task over, and do not repeat edits that already succeeded — continue from where you stopped. You do not need to explain this message to the user, though you may briefly mention that you are completing the change in smaller steps.
</system_reminder>`;
}

/** Sums usage across the attempts of one turn, so a resumed turn is costed as a whole. */
export function addUsage(a: LanguageModelUsage | undefined, b: LanguageModelUsage | undefined): LanguageModelUsage {
    return {
        ...(b ?? {}),
        inputTokens: (a?.inputTokens ?? 0) + (b?.inputTokens ?? 0),
        outputTokens: (a?.outputTokens ?? 0) + (b?.outputTokens ?? 0),
        totalTokens: (a?.totalTokens ?? 0) + (b?.totalTokens ?? 0),
        inputTokenDetails: {
            ...(b?.inputTokenDetails ?? {}),
            cacheReadTokens: (a?.inputTokenDetails?.cacheReadTokens ?? 0) + (b?.inputTokenDetails?.cacheReadTokens ?? 0),
            cacheWriteTokens: (a?.inputTokenDetails?.cacheWriteTokens ?? 0) + (b?.inputTokenDetails?.cacheWriteTokens ?? 0),
        },
    } as LanguageModelUsage;
}

/**
 * Strips assistant tool calls that never produced a result, and any assistant message left
 * empty by that.
 *
 * A truncated response can leave a tool call the provider never closed. Anthropic rejects a
 * request whose tool_use has no matching tool_result, so re-sending the partial turn verbatim
 * would turn a recoverable truncation into a hard 400.
 */
export function dropDanglingToolCalls(messages: ModelMessage[]): ModelMessage[] {
    const resolved = new Set<string>();
    for (const message of messages) {
        if (message.role !== 'tool' || !Array.isArray(message.content)) { continue; }
        for (const part of message.content) {
            const id = (part as any)?.toolCallId;
            if (id) { resolved.add(id); }
        }
    }
    return messages
        .map(message => {
            if (message.role !== 'assistant' || !Array.isArray(message.content)) { return message; }
            const kept = message.content.filter(
                part => (part as any)?.type !== 'tool-call' || resolved.has((part as any).toolCallId)
            );
            return kept.length === message.content.length ? message : { ...message, content: kept } as ModelMessage;
        })
        .filter(message => !(Array.isArray(message.content) && message.content.length === 0));
}
