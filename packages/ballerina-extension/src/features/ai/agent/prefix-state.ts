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
 * The append-only prompt prefix (pure).
 *
 * Claude Sonnet 5.5 binds every signed thinking block to the bytes before it: the top-level system
 * prompt, the tool set and every earlier message. So within one history the agent never rewrites
 * what it already sent. The top-level system prompt holds fixed text only; what changes between
 * turns (the skills listing, the deferred-tools listing, MCP tools coming and going, the Natural
 * Programming note) goes into a `role: "system"` message after the turn's user message, as the
 * difference from what earlier turns said. The state that difference is taken against is stored
 * on each generation, so a revert rolls it back and a compaction restart starts it over.
 *
 * When the base itself changes (an extension update changed the system prompt or a built-in
 * tool), there is no append-only form: the base is re-frozen, and every reasoning part before
 * that generation is dropped from later requests, which the API allows.
 */

import { createHash } from 'crypto';
import type { ModelMessage, SystemModelMessage } from 'ai';
import type { AgentPrefixState, FrozenToolDefinition } from '@wso2/ballerina-core/lib/state-machine-types';
import { getSkillsListing } from './skills/listing';
import { TOOL_SEARCH_TOOL_NAME } from './tools/tool-search';

export type { AgentPrefixState };

/** A tool as the request sends it, for `hashPrefixBase`. */
export interface ToolDescription {
    name: string;
    description?: string;
    inputSchema: unknown;
    providerOptions?: unknown;
}

/** The live inputs for one turn's prefix. */
export interface LivePrefix {
    /** `hashPrefixBase` of the top-level system prompt and the built-in tools. */
    baseHash: string;
    /** Every skill, enabled or not. */
    skills: ReadonlyArray<{ name: string; trigger: string }>;
    /** Built-in tools sent with `deferLoading`. */
    deferredBuiltIns: readonly string[];
    /** MCP tools of the servers connected now. */
    mcpTools: readonly FrozenToolDefinition[];
    /** The Natural Programming note this turn's operation needs, if any. */
    npNote?: string;
    /**
     * Whether the request can carry `role: "system"` messages and `tool_addition`/`tool_removal`
     * blocks. Without them the notice rides the user message, and a late MCP tool is announced in
     * text and loaded with `tool_search`, like any deferred tool.
     */
    systemMessages: boolean;
}

export interface TurnPrefix {
    /** Stored on this generation; the next turn diffs against it. `mcpTools` is left out when unchanged. */
    state: AgentPrefixState;
    /** The turn's notice, sent after its user message; absent when nothing changed. */
    systemMessage?: SystemModelMessage;
    /** MCP tool definitions to send, sorted by name: the frozen ones, then any new ones. */
    mcpTools: FrozenToolDefinition[];
    /** Frozen MCP tools whose server is not connected now; calling one answers "not connected". */
    disconnected: ReadonlySet<string>;
}

/** By UTF-16 code unit, not locale: what this sorts is hashed and sent, so it must not depend on the host. */
export const byName = (a: { name: string }, b: { name: string }) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

function hashText(...parts: string[]): string {
    const hash = createHash('sha256');
    for (const part of parts) {
        hash.update(part);
        hash.update('\0');
    }
    return hash.digest('hex');
}

/**
 * The base a history is bound to: the top-level system text and each built-in tool's name,
 * description, input schema and provider options, by name.
 */
export function hashPrefixBase(systemText: string, builtInTools: readonly ToolDescription[]): string {
    const tools = [...builtInTools].sort(byName);
    return hashText(systemText, JSON.stringify(tools.map(t => [t.name, t.description ?? '', t.inputSchema, t.providerOptions ?? null])));
}

export function isAgentPrefixState(value: unknown): value is AgentPrefixState {
    const v = value as AgentPrefixState | undefined;
    return !!v && typeof v === 'object'
        && typeof v.baseHash === 'string'
        && (v.mcpTools === undefined || Array.isArray(v.mcpTools))
        && Array.isArray(v.skills)
        && Array.isArray(v.removedTools);
}

/**
 * The state the previous turns left, from the latest generation in the model's history that sent
 * anything, with its MCP definitions filled in from the latest generation that stored them. A
 * generation stopped before its first step saved no messages; its state was never sent, so it is
 * skipped. `undefined` means none of the history was sent with a state (no history, or a thread
 * from before this state existed).
 */
export function previousPrefixState(
    historyGenerations: ReadonlyArray<{ id: string; modelMessages?: unknown[]; prefixState?: AgentPrefixState }>,
    currentGenerationId: string,
): AgentPrefixState | undefined {
    const sent = historyGenerations.filter(g => g.id !== currentGenerationId && g.modelMessages?.length);
    const latest = sent[sent.length - 1]?.prefixState;
    if (!latest || latest.mcpTools) {
        return latest;
    }
    const mcpTools = [...sent].reverse().find(g => g.prefixState?.mcpTools)?.prefixState?.mcpTools ?? [];
    return { ...latest, mcpTools };
}

/**
 * The index of the generation whose base change dropped the reasoning before it, or -1. Only a
 * generation that sent something counts.
 */
export function reasoningResetIndex(
    historyGenerations: ReadonlyArray<{ modelMessages?: unknown[]; prefixState?: AgentPrefixState }>,
): number {
    for (let i = historyGenerations.length - 1; i >= 0; i--) {
        const generation = historyGenerations[i];
        if (generation.modelMessages?.length && generation.prefixState?.reasoningReset) {
            return i;
        }
    }
    return -1;
}

/** The messages without reasoning parts; an assistant message left empty is dropped. */
export function dropReasoning<T extends { role: string; content: unknown }>(messages: readonly T[]): T[] {
    const out: T[] = [];
    for (const message of messages) {
        if (message.role !== 'assistant' || !Array.isArray(message.content)) {
            out.push(message);
            continue;
        }
        const content = (message.content as Array<{ type?: string }>).filter(part => part?.type !== 'reasoning' && part?.type !== 'redacted-reasoning');
        if (content.length === 0) {
            continue;
        }
        out.push(content.length === message.content.length ? message : { ...message, content });
    }
    return out;
}

function deferredToolsListing(names: readonly string[]): string {
    if (names.length === 0) { return ''; }
    return `The following deferred tools are available. Only their names are known until you load them: call ${TOOL_SEARCH_TOOL_NAME} to load a deferred tool before calling it.\n\n${[...names].sort().join('\n')}`;
}

export const NP_MODE_OFF_NOTE = 'Natural Programming mode is off for this request; the earlier Natural Programming note no longer applies.';

/**
 * Works out this turn's prefix from the previous state and the live inputs. A missing previous
 * state, or one sent with another base, starts the prefix over: everything is listed again, and
 * when the history holds earlier turns their reasoning is dropped. Otherwise only what changed
 * since the previous state is said.
 */
export function planTurnPrefix(previous: AgentPrefixState | undefined, hasHistory: boolean, live: LivePrefix): TurnPrefix {
    const npHash = live.npNote ? hashText(live.npNote) : undefined;
    const liveNames = new Set(live.mcpTools.map(t => t.name));
    const frozen = previous?.mcpTools ?? [];
    const fresh = !previous || previous.baseHash !== live.baseHash;

    let mcpTools: FrozenToolDefinition[];
    let skills: string[];
    let removedTools: string[];
    let added: string[] = [];
    let dropped: string[];
    const sections: string[] = [];

    if (fresh) {
        // The history can still name an MCP tool whose server is gone (a tool_addition, a call): the
        // API rejects a reference to a tool missing from `tools`, so those stay, as disconnected.
        const carried = hasHistory ? frozen.filter(t => !liveNames.has(t.name)) : [];
        dropped = carried.map(t => t.name).filter(name => !previous!.removedTools.includes(name)).sort();
        // And a tool the history removed whose server is back needs adding again.
        added = hasHistory && previous ? previous.removedTools.filter(name => liveNames.has(name)).sort() : [];
        mcpTools = [...live.mcpTools, ...carried].sort(byName);
        skills = live.skills.map(s => s.name);
        removedTools = carried.map(t => t.name).sort();
        sections.push(
            deferredToolsListing([...live.deferredBuiltIns, ...live.mcpTools.map(t => t.name)]),
            getSkillsListing(live.skills),
            live.npNote ?? '');
    } else {
        const frozenNames = new Set(frozen.map(t => t.name));
        const removed = new Set(previous.removedTools);
        const newTools = live.mcpTools.filter(t => !frozenNames.has(t.name));
        const reconnected = frozen.filter(t => removed.has(t.name) && liveNames.has(t.name)).map(t => t.name);
        dropped = frozen.filter(t => !removed.has(t.name) && !liveNames.has(t.name)).map(t => t.name).sort();
        reconnected.forEach(name => removed.delete(name));
        dropped.forEach(name => removed.add(name));
        added = [...newTools.map(t => t.name), ...reconnected].sort();
        mcpTools = [...frozen, ...newTools].sort(byName);
        const listedSkills = new Set(previous.skills);
        const newSkills = live.skills.filter(s => !listedSkills.has(s.name));
        skills = [...previous.skills, ...newSkills.map(s => s.name)];
        removedTools = [...removed].sort();
        sections.push(getSkillsListing(newSkills));
        if (npHash !== previous.npHash) {
            sections.push(live.npNote ?? NP_MODE_OFF_NOTE);
        }
    }

    if (added.length > 0) {
        sections.push(live.systemMessages
            ? `These MCP tools are now available: ${added.join(', ')}.`
            : `These deferred MCP tools are now available; call ${TOOL_SEARCH_TOOL_NAME} to load one before calling it: ${added.join(', ')}.`);
    }
    if (dropped.length > 0) {
        sections.push(`These MCP tools are no longer available, because their server disconnected: ${dropped.join(', ')}.`);
    }
    const toolChanges = live.systemMessages ? [
        ...added.map(toolName => ({ type: 'tool_addition' as const, toolName })),
        ...dropped.map(toolName => ({ type: 'tool_removal' as const, toolName })),
    ] : [];
    // Any tool change comes with its own section, so a message without text has nothing to say.
    const text = sections.filter(Boolean).join('\n\n');

    return {
        state: {
            baseHash: live.baseHash,
            // Stored only when it changed (the definitions can be large); `previousPrefixState` fills it in.
            ...(fresh || mcpTools.length !== frozen.length ? { mcpTools } : {}),
            skills,
            removedTools,
            ...(npHash ? { npHash } : {}),
            ...(fresh && hasHistory ? { reasoningReset: true } : {}),
        },
        systemMessage: text
            ? { role: 'system', content: text, ...(toolChanges.length > 0 ? { providerOptions: { anthropic: { toolChanges } } } : {}) }
            : undefined,
        mcpTools,
        disconnected: new Set(mcpTools.filter(t => !liveNames.has(t.name)).map(t => t.name)),
    };
}

function asSystemReminder(content: string): { type: 'text'; text: string } {
    return { type: 'text', text: `<system-reminder>\n${content}\n</system-reminder>` };
}

/**
 * The turn's leading messages as sent and saved: the user message, then its notice as a system
 * message. A request that cannot carry `role: "system"` messages gets the notice folded into the
 * user message as a closing `<system-reminder>`, which is just as append-only: the user message is
 * new on this turn.
 */
export function turnLeadMessages(userContent: unknown[], turn: TurnPrefix, systemMessages: boolean): ModelMessage[] {
    if (!turn.systemMessage) {
        return [{ role: 'user', content: userContent } as ModelMessage];
    }
    return systemMessages
        ? [{ role: 'user', content: userContent } as ModelMessage, turn.systemMessage]
        : [{ role: 'user', content: [...userContent, asSystemReminder(turn.systemMessage.content)] } as ModelMessage];
}

/**
 * The history as a request that cannot carry `role: "system"` messages takes it: each one turned
 * into a user `<system-reminder>`. Only a thread first sent on another login has any, so only that
 * thread's prefix changes; the provider merges the adjacent user messages.
 */
export function historyForRequest(messages: readonly ModelMessage[], systemMessages: boolean): readonly ModelMessage[] {
    if (systemMessages || !messages.some(message => message.role === 'system')) {
        return messages;
    }
    // The rewrite changes what the earlier thinking is bound to, and this login sends no binding
    // control, so that thinking is dropped.
    return dropReasoning(messages.map(message => message.role === 'system' && typeof message.content === 'string'
        ? { role: 'user', content: [asSystemReminder(message.content)] } as ModelMessage
        : message));
}
