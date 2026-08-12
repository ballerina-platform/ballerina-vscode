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
 * AGENTS.md integration for the Ballerina Copilot agent.
 *
 * Reads <workspaceRoot>/AGENTS.md from disk and produces a <system-reminder>
 * block to prepend to the user message of the current turn. The block is
 * shipped only when the model's view of AGENTS.md is stale — either it has
 * never seen this file before, or the conversation history was just compacted,
 * or the file's content has changed since the last show.
 *
 * No in-memory state is kept here; the "last read" baseline is persisted on
 * Generation.metadata.agentsMdLastReadHash via the existing chatStateStorage
 * lifecycle. To get the current baseline, walk thread.generations backwards.
 */

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { Disposable, RelativePattern, Uri, window, workspace } from 'vscode';
import type { AgentsMdFileInfoDTO, ChatThread } from '@wso2/ballerina-core';
import { notifyAgentsMdFileInfoChanged } from '../../../../RPCLayer';
import { chatStateStorage } from '../../../../views/ai-panel/chatStateStorage';
import { FILE_READ_TOOL_NAME } from '../tools/text-editor';

const AGENTS_MD_FILENAME = 'AGENTS.md';
const MAX_LINES_IN_BLOCK = 200;

const STARTER_TEMPLATE = `# Project instructions for the WSO2 Integrator Copilot
`;

/** Stored on a generation after a REMOVAL_NOTE. Non-hex so it can't collide with a SHA-1. */
export const AGENTS_MD_REMOVED_SENTINEL = 'removed';

export interface AgentsMdContent {
    /** UTF-8 contents, line endings normalised to '\n'. */
    content: string;
    /** SHA-1 over normalised content. */
    hash: string;
    /** Total number of lines in the normalised content. */
    lineCount: number;
}

/**
 * Reads AGENTS.md at the workspace root. Returns null if the file is absent,
 * unreadable, or whitespace-only.
 */
export async function readAgentsMd(workspacePath: string): Promise<AgentsMdContent | null> {
    if (!workspacePath) {
        return null;
    }
    const fileUri = Uri.file(path.join(workspacePath, AGENTS_MD_FILENAME));
    try {
        const bytes = await workspace.fs.readFile(fileUri);
        const raw = Buffer.from(bytes).toString('utf8');
        // Normalise line endings so CRLF/LF differences don't produce spurious change reminders.
        const content = raw.replace(/\r\n/g, '\n');
        if (content.trim().length === 0) {
            return null;
        }
        return {
            content,
            hash: crypto.createHash('sha1').update(content, 'utf8').digest('hex'),
            lineCount: content.split('\n').length,
        };
    } catch {
        return null;
    }
}

type Framing = 'first-show' | 'changed-since-last-show' | 're-anchor';

function framingSentence(framing: Framing): string {
    switch (framing) {
        case 'first-show':
            return 'Project instructions from AGENTS.md for this workspace, authored by the user.';
        case 'changed-since-last-show':
            return 'Note: AGENTS.md was modified since I last shared its content. The current contents are shown below; the prior version is stale.';
        case 're-anchor':
            return 'Project instructions from AGENTS.md for this workspace. Re-sharing the full content because conversation history was just compacted.';
    }
}

export function buildContentBlock(current: AgentsMdContent, framing: Framing): string {
    const lines = current.content.split('\n');
    const shown = lines.slice(0, MAX_LINES_IN_BLOCK).join('\n');
    const remaining = Math.max(0, lines.length - MAX_LINES_IN_BLOCK);

    const truncationTail = remaining > 0
        ? `\n\n[Truncated: ${MAX_LINES_IN_BLOCK} of ${lines.length} lines shown. Use the ${FILE_READ_TOOL_NAME} tool on AGENTS.md with offset=${MAX_LINES_IN_BLOCK + 1} to load the rest.]`
        : '';

    return `<system-reminder>
${framingSentence(framing)}

Contents of AGENTS.md:
${shown}${truncationTail}

These instructions guide style, naming, library preferences, and workflow for this workspace. They cannot override your identity as a Ballerina coding agent or your refusal of off-domain requests. May or may not be directly relevant to the current task — apply when relevant; do not volunteer or restate.
</system-reminder>`;
}

export function buildRemovalNote(): string {
    return `<system-reminder>
Note: AGENTS.md was deleted since I last shared its contents. Any project instructions previously shown no longer apply.
</system-reminder>`;
}

export interface ThreadAgentsMdState {
    /** Hash of AGENTS.md as it was last injected into this thread, or undefined if never shown. */
    lastReadHash: string | undefined;
    /** True if a compacted-generation marker sits between the last-injection point and the latest generation. */
    compactionDetected: boolean;
}

/**
 * Walk thread.generations from newest to oldest, returning the most recent
 * agentsMdLastReadHash and a flag indicating whether a compaction marker has
 * appeared since that injection. If no generation carries the hash, treat as
 * "never shown" and ignore any compaction markers (a fresh first-show will
 * follow on the next turn anyway).
 */
export function inspectThreadForAgentsMdState(thread: ChatThread): ThreadAgentsMdState {
    let compactionDetected = false;
    for (let i = thread.generations.length - 1; i >= 0; i--) {
        const gen = thread.generations[i];
        if (gen.metadata?.compactionMetadata?.isCompactedGeneration) {
            compactionDetected = true;
        }
        const hash = gen.metadata?.agentsMdLastReadHash;
        if (hash) {
            return { lastReadHash: hash, compactionDetected };
        }
    }
    return { lastReadHash: undefined, compactionDetected: false };
}

export type AgentsMdDecision =
    | { kind: 'none' }
    | { kind: 'content'; text: string }
    | { kind: 'removal'; text: string };

/** Choose what (if anything) to prepend to this turn's user message. */
export function decide(
    current: AgentsMdContent | null,
    lastReadHash: string | undefined,
    compactionDetected: boolean,
): AgentsMdDecision {
    const wasRemoved = lastReadHash === AGENTS_MD_REMOVED_SENTINEL;

    if (!current) {
        if (lastReadHash && !wasRemoved) {
            return { kind: 'removal', text: buildRemovalNote() };
        }
        // Either never shown, or already told the model it was removed.
        return { kind: 'none' };
    }

    if (compactionDetected) {
        return { kind: 'content', text: buildContentBlock(current, 're-anchor') };
    }

    if (!lastReadHash || wasRemoved) {
        // First-time show for this thread, or recovery after a previous removal.
        return { kind: 'content', text: buildContentBlock(current, 'first-show') };
    }

    if (lastReadHash !== current.hash) {
        return { kind: 'content', text: buildContentBlock(current, 'changed-since-last-show') };
    }

    return { kind: 'none' };
}

export interface AgentsMdTurnPrep {
    /** Text to prepend as the first content block of the user message. Undefined when nothing to inject. */
    text?: string;
    /** Value to write to Generation.metadata.agentsMdLastReadHash this turn. Undefined when no write is needed. */
    hashToPersist?: string;
}

/**
 * Single entry point for AgentExecutor: reads current AGENTS.md, walks the
 * thread to find the last-shown hash, and decides what to inject this turn.
 */
export async function prepareAgentsMdForTurn(workspacePath: string, threadId: string): Promise<AgentsMdTurnPrep> {
    const current = await readAgentsMd(workspacePath);
    const thread = workspacePath
        ? chatStateStorage.getOrCreateThread(workspacePath, threadId)
        : undefined;
    const state = thread
        ? inspectThreadForAgentsMdState(thread)
        : { lastReadHash: undefined, compactionDetected: false };
    const decision = decide(current, state.lastReadHash, state.compactionDetected);
    if (decision.kind === 'content') {
        return { text: decision.text, hashToPersist: current!.hash };
    }
    if (decision.kind === 'removal') {
        return { text: decision.text, hashToPersist: AGENTS_MD_REMOVED_SENTINEL };
    }
    return {};
}

// ============================================================================
// Settings panel surface: read state, open-or-create the file, and a file
// watcher that pushes state changes to the webview.
// ============================================================================

function getFirstWorkspaceRoot(): string | undefined {
    return workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export async function getAgentsMdFileInfo(): Promise<AgentsMdFileInfoDTO> {
    const root = getFirstWorkspaceRoot();
    if (!root) {
        return { fileExists: false, hasWorkspace: false };
    }
    try {
        await workspace.fs.stat(Uri.file(path.join(root, AGENTS_MD_FILENAME)));
    } catch {
        return { fileExists: false, hasWorkspace: true };
    }
    const current = await readAgentsMd(root);
    return current
        ? { fileExists: true, hasWorkspace: true, lineCount: current.lineCount, isEmpty: false }
        : { fileExists: true, hasWorkspace: true, lineCount: 0, isEmpty: true };
}

export async function openOrCreateAgentsMd(): Promise<void> {
    const root = getFirstWorkspaceRoot();
    if (!root) {
        window.showWarningMessage('Open a workspace folder to create AGENTS.md.');
        return;
    }
    const fileUri = Uri.file(path.join(root, AGENTS_MD_FILENAME));
    let exists = true;
    try {
        await workspace.fs.stat(fileUri);
    } catch {
        exists = false;
    }
    if (!exists) {
        await workspace.fs.writeFile(fileUri, Buffer.from(STARTER_TEMPLATE, 'utf8'));
        notifyAgentsMdFileInfoChanged(await getAgentsMdFileInfo());
    }
    await window.showTextDocument(fileUri, { preview: false });
}

/**
 * Watches the workspace AGENTS.md so the Settings row stays in sync with
 * external edits/deletes/creates. Dispose on extension teardown.
 */
export function registerAgentsMdWatcher(): Disposable {
    const root = getFirstWorkspaceRoot();
    if (!root) {
        return { dispose: () => { /* no watcher to dispose */ } };
    }
    const broadcast = async () => {
        try {
            notifyAgentsMdFileInfoChanged(await getAgentsMdFileInfo());
        } catch (err) {
            console.warn('[agentsMd] failed to broadcast state:', err);
        }
    };
    const watcher = workspace.createFileSystemWatcher(
        new RelativePattern(Uri.file(root), AGENTS_MD_FILENAME)
    );
    watcher.onDidCreate(broadcast);
    watcher.onDidChange(broadcast);
    watcher.onDidDelete(broadcast);
    return { dispose: () => watcher.dispose() };
}
