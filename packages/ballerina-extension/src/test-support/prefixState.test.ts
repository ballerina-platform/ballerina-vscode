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
 * The append-only prompt prefix: what a turn adds to the prefix earlier turns sent, and how that
 * state survives a reload, a revert and a base change. The history half runs the real chat store
 * over an in-memory "disk", as compactionRestart.test.ts does.
 */

const savedThreads = new Map<string, any>();
let savedMetadata: any;

jest.mock('@wso2/copilot-utilities/chat-persistence', () => ({
    CopilotPersistenceStore: class {
        saveThread(root: string, threadId: string, thread: unknown) {
            savedThreads.set(`${root}::${threadId}`, JSON.parse(JSON.stringify(thread)));
            return true;
        }
        loadThread(root: string, threadId: string) { return savedThreads.get(`${root}::${threadId}`); }
        listThreadIds(root: string) {
            return [...savedThreads.keys()]
                .filter((key) => key.startsWith(`${root}::`))
                .map((key) => key.slice(root.length + 2));
        }
        getWorkspaceMetadata() { return savedMetadata; }
        saveWorkspaceMetadata(_root: string, meta: unknown) { savedMetadata = meta; return true; }
        listCheckpoints() { return []; }
        loadCheckpoint() { return undefined; }
        deleteThread() { return true; }
        deleteCheckpoint() { return true; }
        saveCheckpoint() { return true; }
        loadCheckpoints() { return []; }
        deleteCheckpoints() { return true; }
    },
}));
jest.mock('../features/ai/state/ApprovalManager', () => ({
    approvalManager: { cancelAllPending: jest.fn() },
}));
jest.mock('../features/ai/utils/project/temp-project', () => ({
    cleanupTempProject: jest.fn(),
    getReviewBaselinePath: (p: string) => `${p}-review-baseline`,
}));

import {
    AgentPrefixState,
    dropReasoning,
    hashPrefixBase,
    LivePrefix,
    NP_MODE_OFF_NOTE,
    planTurnPrefix,
    previousPrefixState,
    reasoningResetIndex,
    historyForRequest,
    turnLeadMessages,
} from '../features/ai/agent/prefix-state';
import { SKILL_LISTING_HEADER } from '../features/ai/agent/skills/listing';
import { ChatStateStorage, chatStateStorage } from '../views/ai-panel/chatStateStorage';

const mcp = (name: string, description = `${name} tool`) => ({ name, description, inputSchema: { type: 'object', properties: {} } });

const live = (overrides: Partial<LivePrefix> = {}): LivePrefix => ({
    baseHash: 'base-1',
    skills: [{ name: 'data-map', trigger: 'mapping data' }, { name: 'user/review', trigger: 'reviewing' }],
    deferredBuiltIns: ['web_search', 'web_fetch'],
    mcpTools: [mcp('mcp__gh__create_issue'), mcp('mcp__gh__add_label')],
    systemMessages: true,
    ...overrides,
});

/** A turn's state as the next turn reads it back (`previousPrefixState` fills in the definitions). */
const asPrevious = (turn: { state: AgentPrefixState; mcpTools: any[] }): AgentPrefixState => ({ ...turn.state, mcpTools: turn.mcpTools });

/** The state after a first turn, for the later-turn cases. */
const firstState = (overrides: Partial<LivePrefix> = {}): AgentPrefixState => planTurnPrefix(undefined, false, live(overrides)).state;

describe('the first turn of a history', () => {
    it('lists every deferred tool and every skill in one system message', () => {
        const turn = planTurnPrefix(undefined, false, live());
        const text = turn.systemMessage?.content as string;
        expect(text).toContain('mcp__gh__add_label\nmcp__gh__create_issue\nweb_fetch\nweb_search');
        expect(text).toContain(`${SKILL_LISTING_HEADER}\n\n- data-map: mapping data\n- user/review: reviewing`);
        expect(turn.systemMessage?.providerOptions).toBeUndefined();
        expect(turn.mcpTools.map(t => t.name)).toEqual(['mcp__gh__add_label', 'mcp__gh__create_issue']);
        expect(turn.state.reasoningReset).toBeUndefined();
        expect(turn.state).toEqual({
            baseHash: 'base-1',
            mcpTools: turn.mcpTools,
            skills: ['data-map', 'user/review'],
            removedTools: [],
        });
    });

    it('adds the Natural Programming note when the operation has one', () => {
        const turn = planTurnPrefix(undefined, false, live({ npNote: 'NP mode.' }));
        expect(turn.systemMessage?.content).toMatch(/NP mode\.$/);
        expect(turn.state.npHash).toBeDefined();
    });
});

describe('a later turn', () => {
    it('sends nothing when nothing changed', () => {
        const turn = planTurnPrefix(firstState(), true, live());
        expect(turn.systemMessage).toBeUndefined();
        // Unchanged MCP definitions are not stored again.
        const { mcpTools, ...rest } = firstState();
        expect(turn.state).toEqual(rest);
        expect(turn.mcpTools).toEqual(mcpTools);
    });

    it('sends nothing for a removed skill, and keeps it in the state', () => {
        const turn = planTurnPrefix(firstState(), true, live({ skills: [{ name: 'data-map', trigger: 'mapping data' }] }));
        expect(turn.systemMessage).toBeUndefined();
        expect(turn.state.skills).toEqual(['data-map', 'user/review']);
    });

    it('lists only a new skill, under the listing header', () => {
        const skills = [...live().skills, { name: 'proj/deploy', trigger: 'deploying' }];
        const turn = planTurnPrefix(firstState(), true, live({ skills }));
        expect(turn.systemMessage?.content).toBe(`${SKILL_LISTING_HEADER}\n\n- proj/deploy: deploying`);
        expect(turn.state.skills).toEqual(['data-map', 'user/review', 'proj/deploy']);
    });

    it('adds a newly connected MCP tool with a tool_addition', () => {
        const turn = planTurnPrefix(firstState(), true, live({ mcpTools: [...live().mcpTools, mcp('mcp__jira__search')] }));
        expect(turn.systemMessage?.content).toBe('These MCP tools are now available: mcp__jira__search.');
        expect(turn.systemMessage?.providerOptions).toEqual({
            anthropic: { toolChanges: [{ type: 'tool_addition', toolName: 'mcp__jira__search' }] },
        });
        expect(turn.mcpTools.map(t => t.name)).toEqual(['mcp__gh__add_label', 'mcp__gh__create_issue', 'mcp__jira__search']);
    });

    it('keeps a tool definition as first sent when its server changes the schema', () => {
        const changed = { ...mcp('mcp__gh__add_label'), description: 'a new description' };
        const turn = planTurnPrefix(firstState(), true, live({ mcpTools: [changed, mcp('mcp__gh__create_issue')] }));
        expect(turn.systemMessage).toBeUndefined();
        expect(turn.mcpTools.find(t => t.name === 'mcp__gh__add_label')?.description).toBe('mcp__gh__add_label tool');
    });

    it('removes a disconnected tool once, keeps its definition, and adds it back on reconnect', () => {
        const disconnectedLive = live({ mcpTools: [mcp('mcp__gh__create_issue')] });
        const dropped = planTurnPrefix(firstState(), true, disconnectedLive);
        expect(dropped.systemMessage?.providerOptions).toEqual({
            anthropic: { toolChanges: [{ type: 'tool_removal', toolName: 'mcp__gh__add_label' }] },
        });
        expect([...dropped.disconnected]).toEqual(['mcp__gh__add_label']);
        expect(dropped.mcpTools.map(t => t.name)).toEqual(['mcp__gh__add_label', 'mcp__gh__create_issue']);
        expect(dropped.state.removedTools).toEqual(['mcp__gh__add_label']);

        const stillDown = planTurnPrefix(asPrevious(dropped), true, disconnectedLive);
        expect(stillDown.systemMessage).toBeUndefined();
        expect([...stillDown.disconnected]).toEqual(['mcp__gh__add_label']);

        const back = planTurnPrefix(asPrevious(stillDown), true, live());
        expect(back.systemMessage?.providerOptions).toEqual({
            anthropic: { toolChanges: [{ type: 'tool_addition', toolName: 'mcp__gh__add_label' }] },
        });
        expect(back.state.removedTools).toEqual([]);
        expect(back.disconnected.size).toBe(0);
    });

    it('sends the Natural Programming note when it starts or changes, and says when it ends', () => {
        const on = planTurnPrefix(firstState(), true, live({ npNote: 'NP mode.' }));
        expect(on.systemMessage?.content).toBe('NP mode.');
        expect(planTurnPrefix(asPrevious(on), true, live({ npNote: 'NP mode.' })).systemMessage).toBeUndefined();
        expect(planTurnPrefix(asPrevious(on), true, live({ npNote: 'NP mode, new docs.' })).systemMessage?.content).toBe('NP mode, new docs.');
        const off = planTurnPrefix(asPrevious(on), true, live());
        expect(off.systemMessage?.content).toBe(NP_MODE_OFF_NOTE);
        expect(off.state.npHash).toBeUndefined();
    });
});

describe('a request that cannot carry system messages or tool changes', () => {
    it('announces a new MCP tool in text, to be loaded with tool_search', () => {
        const turn = planTurnPrefix(firstState(), true, live({ systemMessages: false, mcpTools: [...live().mcpTools, mcp('mcp__jira__search')] }));
        expect(turn.systemMessage?.content).toBe('These deferred MCP tools are now available; call tool_search to load one before calling it: mcp__jira__search.');
        expect(turn.systemMessage?.providerOptions).toBeUndefined();
    });

    it('folds the notice into the user message as a closing reminder', () => {
        const parts = [{ type: 'text', text: '<User Query>\nhi\n</User Query>' }];
        const turn = planTurnPrefix(firstState(), true, live({ npNote: 'notice' }));
        expect(turnLeadMessages(parts, turn, false)).toEqual([{ role: 'user', content: [
            ...parts,
            { type: 'text', text: '<system-reminder>\nnotice\n</system-reminder>' },
        ] }]);
        expect(turnLeadMessages(parts, turn, true)).toEqual([{ role: 'user', content: parts }, turn.systemMessage]);
        expect(turnLeadMessages(parts, planTurnPrefix(firstState(), true, live()), false)).toEqual([{ role: 'user', content: parts }]);
    });

    it('turns system messages of a thread sent on another login into user reminders', () => {
        const history: any[] = [{ role: 'user', content: 'hi' }, { role: 'system', content: 'notice' }];
        expect(historyForRequest(history, false)).toEqual([
            { role: 'user', content: 'hi' },
            { role: 'user', content: [{ type: 'text', text: '<system-reminder>\nnotice\n</system-reminder>' }] },
        ]);
        expect(historyForRequest(history, true)).toBe(history);
    });

    it('drops the reasoning of a history whose system messages it rewrites, and only then', () => {
        const thought = { role: 'assistant', content: [{ type: 'reasoning', text: 'x' }, { type: 'text', text: 'done' }] };
        expect(historyForRequest([{ role: 'system', content: 'notice' }, thought] as any[], false)[1]).toEqual(
            { role: 'assistant', content: [{ type: 'text', text: 'done' }] });
        const plain: any[] = [{ role: 'user', content: 'hi' }, thought];
        expect(historyForRequest(plain, false)).toBe(plain);
    });
});

describe('a changed base', () => {
    it('lists everything again and drops the earlier reasoning', () => {
        const turn = planTurnPrefix(firstState(), true, live({ baseHash: 'base-2' }));
        expect(turn.state.reasoningReset).toBe(true);
        expect(turn.state.baseHash).toBe('base-2');
        expect(turn.systemMessage?.content).toContain(SKILL_LISTING_HEADER);
    });

    it('keeps an MCP tool the history names but whose server is gone, and removes it once', () => {
        const turn = planTurnPrefix(firstState(), true, live({ baseHash: 'base-2', mcpTools: [mcp('mcp__gh__create_issue')] }));
        expect(turn.mcpTools.map(t => t.name)).toEqual(['mcp__gh__add_label', 'mcp__gh__create_issue']);
        expect([...turn.disconnected]).toEqual(['mcp__gh__add_label']);
        expect(turn.state.removedTools).toEqual(['mcp__gh__add_label']);
        expect(turn.systemMessage?.content).not.toContain('\nmcp__gh__add_label\n');
        expect(turn.systemMessage?.providerOptions).toEqual({
            anthropic: { toolChanges: [{ type: 'tool_removal', toolName: 'mcp__gh__add_label' }] },
        });
        // A restart starts a new history, so nothing is carried.
        expect(planTurnPrefix(undefined, false, live({ mcpTools: [] })).mcpTools).toEqual([]);
    });

    it('adds back a tool the history removed whose server is connected again', () => {
        const down = planTurnPrefix(firstState(), true, live({ mcpTools: [mcp('mcp__gh__create_issue')] }));
        const turn = planTurnPrefix(asPrevious(down), true, live({ baseHash: 'base-2' }));
        expect(turn.systemMessage?.providerOptions).toEqual({
            anthropic: { toolChanges: [{ type: 'tool_addition', toolName: 'mcp__gh__add_label' }] },
        });
        expect(turn.state.removedTools).toEqual([]);
    });

    it('treats a history sent before this state existed the same way', () => {
        expect(planTurnPrefix(undefined, true, live()).state.reasoningReset).toBe(true);
    });

    it('hashes the tools by name, and changes with a description', () => {
        const a = { name: 'a', description: 'A', inputSchema: {} };
        const b = { name: 'b', description: 'B', inputSchema: {} };
        expect(hashPrefixBase('sys', [a, b])).toBe(hashPrefixBase('sys', [b, a]));
        expect(hashPrefixBase('sys', [a, b])).not.toBe(hashPrefixBase('sys', [a, { ...b, description: 'B2' }]));
        expect(hashPrefixBase('sys', [a])).not.toBe(hashPrefixBase('sys2', [a]));
    });
});

describe('reading the previous state', () => {
    it('takes the latest generation that sent something, skipping the current one', () => {
        const state = firstState();
        const generations = [
            { id: 'g1', modelMessages: [{}], prefixState: { ...state, skills: ['old'] } },
            { id: 'g2', modelMessages: [{}], prefixState: state },
            { id: 'g3', modelMessages: [] , prefixState: { ...state, skills: ['never sent'] } },
            { id: 'g4', modelMessages: [{}], prefixState: { ...state, skills: ['current'] } },
        ];
        expect(previousPrefixState(generations, 'g4')).toBe(state);
    });

    it('fills in the MCP definitions from the latest generation that stored them', () => {
        const state = firstState();
        const { mcpTools, ...withoutTools } = state;
        const generations = [
            { id: 'g1', modelMessages: [{}], prefixState: state },
            { id: 'g2', modelMessages: [{}], prefixState: { ...withoutTools, skills: ['later'] } },
        ];
        expect(previousPrefixState(generations, 'g3')).toEqual({ ...withoutTools, skills: ['later'], mcpTools });
    });

    it('finds the latest base change that was sent', () => {
        const reset = { ...firstState(), reasoningReset: true };
        expect(reasoningResetIndex([{ modelMessages: [{}], prefixState: reset }, { modelMessages: [{}] }])).toBe(0);
        expect(reasoningResetIndex([{ modelMessages: [], prefixState: reset }])).toBe(-1);
    });
});

describe('dropping reasoning', () => {
    it('removes reasoning parts and assistant messages left empty', () => {
        const messages: any[] = [
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: [{ type: 'reasoning', text: 'x' }] },
            { role: 'assistant', content: [{ type: 'reasoning', text: 'y' }, { type: 'text', text: 'done' }] },
            { role: 'assistant', content: 'plain' },
        ];
        expect(dropReasoning(messages)).toEqual([
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
            { role: 'assistant', content: 'plain' },
        ]);
    });
});

describe('the history the store replays', () => {
    const ROOT = '/workspace';
    const THREAD = 'default';
    const assistant = (text: string) => ({ role: 'assistant', content: [{ type: 'reasoning', text: `thinking ${text}` }, { type: 'text', text }] });

    function addTurn(id: string, modelMessages: any[], prefixState?: AgentPrefixState) {
        chatStateStorage.addGeneration(ROOT, THREAD, id, { generationType: 'agent' } as never, id);
        chatStateStorage.updateGeneration(ROOT, THREAD, id, { modelMessages, prefixState });
    }

    beforeEach(() => {
        savedThreads.clear();
        savedMetadata = undefined;
        (chatStateStorage as any).storage.clear();
        chatStateStorage.initializeWorkspace(ROOT);
    });

    it('keeps each turn system message, tool changes included, and the state across a reload', () => {
        const turn = planTurnPrefix(firstState(), true, live({ mcpTools: [...live().mcpTools, mcp('mcp__jira__search')] }));
        addTurn('gen-1', [...turnLeadMessages(['first'], planTurnPrefix(undefined, false, live()), true), assistant('one')], firstState());
        addTurn('gen-2', [...turnLeadMessages(['second'], turn, true), assistant('two')], turn.state);

        const restarted = new ChatStateStorage();
        restarted.initializeWorkspace(ROOT);
        const history = restarted.getChatHistoryForLLM(ROOT, THREAD);
        expect(history[4]).toEqual(turn.systemMessage);
        expect(restarted.getGenerations(ROOT, THREAD)[1].prefixState).toEqual(turn.state);
    });

    it('drops the reasoning before a base change, and only before it', () => {
        addTurn('gen-1', [{ role: 'user', content: 'first' }, assistant('one')], firstState());
        addTurn('gen-2', [{ role: 'user', content: 'second' }, assistant('two')], { ...firstState({ baseHash: 'base-2' }), reasoningReset: true });
        expect(chatStateStorage.getChatHistoryForLLM(ROOT, THREAD)).toEqual([
            { role: 'user', content: 'first' },
            { role: 'assistant', content: [{ type: 'text', text: 'one' }] },
            { role: 'user', content: 'second' },
            assistant('two'),
        ]);
    });
});
