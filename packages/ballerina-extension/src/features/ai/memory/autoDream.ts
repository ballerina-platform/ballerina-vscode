// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { generateText, stepCountIs } from 'ai';
import { join } from 'path';
import { homedir } from 'os';
import {
    getMemoryDir,
    getGlobalMemoryDir,
    isAutoMemoryEnabled,
    ensureMemoryDirsExist,
    buildDreamSystemPrompt,
    getLockPath,
    readLastConsolidatedAt,
    tryAcquireLock,
    releaseLock,
    rollbackLock,
    countGenerationsSince,
    buildConsolidationPrompt,
    invalidateMemoryPromptCache,
} from '@wso2/copilot-utilities/auto-memory';
import { computeWorkspaceHash } from '@wso2/copilot-utilities/chat-persistence';
import { getAnthropicClient, ANTHROPIC_HAIKU } from '../utils/ai-client';
import { createMemoryTools } from './memoryTools';
import { resolveWorkspaceIdentity } from '../../../views/ai-panel/chatStateStorage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_HOURS_BETWEEN_DREAMS   = 24;
const MIN_GENERATIONS_SINCE_LAST = 10;
const SCAN_THROTTLE_MS           = 10 * 60 * 1000; // 10 minutes
const MS_PER_HOUR                = 3_600_000;

/** ~/.ballerina/copilot/workspaces/ */
const WORKSPACES_BASE_DIR = join(homedir(), '.ballerina', 'copilot', 'workspaces');

// ---------------------------------------------------------------------------
// Closure-scoped state — reset by initAutoDream()
// ---------------------------------------------------------------------------

export interface DreamContext {
    /** Workspace root path (workspacePath or projectPath). */
    workspacePath: string;
    onDreamStart?: () => void;
    onDreamComplete?: () => void;
    onDreamFail?: () => void;
}

type DreamRunner = (ctx: DreamContext) => void;

let runner: DreamRunner = () => { /* noop until init */ };

/** Callbacks for VS Code status bar visibility — injected from the extension layer. */
export interface DreamCallbacks {
    onDreamStart?: () => void;
    onDreamComplete?: () => void;
    onDreamFail?: () => void;
}

let dreamCallbacks: DreamCallbacks = {};

/** Registers status bar callbacks so activate.ts can show/hide the status bar item. */
export function setDreamCallbacks(callbacks: DreamCallbacks): void {
    dreamCallbacks = callbacks;
}

/** Optional provider for VS Code settings — injected from the extension layer. */
export type DreamSettingsProvider = () => { autoDreamEnabled: boolean };

let dreamSettingsProvider: DreamSettingsProvider = () => ({ autoDreamEnabled: true });

/** Registers a settings provider so the extension layer can gate on VS Code config. */
export function setDreamSettingsProvider(provider: DreamSettingsProvider): void {
    dreamSettingsProvider = provider;
}

function isDreamEnabled(): boolean {
    return isAutoMemoryEnabled()
        && memorySettingsProvider().autoMemoryEnabled
        && dreamSettingsProvider().autoDreamEnabled;
}

// ---------------------------------------------------------------------------
// Memory-enabled gate (governs save_memory tool registration)
// Moved here from extractMemories.ts so activate.ts has a single import point
// ---------------------------------------------------------------------------

/** Optional provider for VS Code autoMemory settings — injected from the extension layer. */
export type MemorySettingsProvider = () => { autoMemoryEnabled: boolean };

let memorySettingsProvider: MemorySettingsProvider = () => ({ autoMemoryEnabled: false });

/** Registers the VS Code autoMemory settings provider. */
export function setMemorySettingsProvider(provider: MemorySettingsProvider): void {
    memorySettingsProvider = provider;
}

/** Returns true when both the env-var gate and the VS Code setting allow auto-memory. */
export function isMemoryEnabled(): boolean {
    return isAutoMemoryEnabled() && memorySettingsProvider().autoMemoryEnabled;
}

/**
 * Initialises the auto-dream system. Must be called once at extension activation.
 */
export function initAutoDream(): void {
    // Per-workspace-hash state so two open workspaces don't interfere with each other.
    const dreamsInProgress = new Set<string>();
    const lastScanAtByHash = new Map<string, number>();

    runner = (ctx: DreamContext): void => {
        if (!isDreamEnabled()) { return; }
        const hash = computeWorkspaceHash(resolveWorkspaceIdentity(ctx.workspacePath));
        if (dreamsInProgress.has(hash)) { return; }

        dreamsInProgress.add(hash);
        const lastScanAt = lastScanAtByHash.get(hash) ?? 0;

        void (async () => {
            try {
                await runDream(ctx, lastScanAt, (t) => { lastScanAtByHash.set(hash, t); });
            } catch (e) {
                // Detached runner — swallow and log so a throw from any stage (dir setup,
                // lock acquisition, activity scan, or the LLM call) cannot surface as an
                // unhandled promise rejection.
                console.error('[autoDream] consolidation run failed:', e instanceof Error ? e.message : String(e));
            } finally {
                dreamsInProgress.delete(hash);
            }
        })();

    };
}

async function runDream(
    ctx: DreamContext,
    lastScanAt: number,
    setLastScanAt: (t: number) => void
): Promise<void> {
    const workspaceHash = computeWorkspaceHash(resolveWorkspaceIdentity(ctx.workspacePath));
    const workspaceDir  = getMemoryDir(workspaceHash);
    const globalDir     = getGlobalMemoryDir();

    const workspaceLockPath = getLockPath(workspaceDir);

    // --- Gate 1: Time gate (cheapest — one stat call) ---
    const lastWorkspaceDreamAt = readLastConsolidatedAt(workspaceLockPath);
    const hoursSince = (Date.now() - lastWorkspaceDreamAt) / MS_PER_HOUR;
    if (hoursSince < MIN_HOURS_BETWEEN_DREAMS) { return; }

    // --- Gate 2: Scan throttle ---
    const now = Date.now();
    if (now - lastScanAt < SCAN_THROTTLE_MS) { return; }
    setLastScanAt(now);

    // --- Gate 3: Activity gate (reads thread.json files) ---
    const generationCount = await countGenerationsSince(WORKSPACES_BASE_DIR, workspaceHash, lastWorkspaceDreamAt);
    if (generationCount < MIN_GENERATIONS_SINCE_LAST) { return; }

    // --- Acquire workspace lock (required) ---
    ensureMemoryDirsExist(workspaceHash);
    const workspacePriorMtime = tryAcquireLock(workspaceLockPath);
    if (workspacePriorMtime === null) { return; }

    // --- Try to acquire global lock (optional) ---
    const globalLockPath      = getLockPath(globalDir);
    const globalPriorMtime    = tryAcquireLock(globalLockPath);
    const hasGlobalLock       = globalPriorMtime !== null;

    const lastGlobalDreamAt = hasGlobalLock
        ? (globalPriorMtime ?? 0)
        : readLastConsolidatedAt(globalLockPath);

    try {
        ctx.onDreamStart?.();
        const model   = await getAnthropicClient(ANTHROPIC_HAIKU);
        const tools   = createMemoryTools(globalDir, workspaceDir);
        const system  = buildDreamSystemPrompt(globalDir, workspaceDir);
        const prompt  = buildConsolidationPrompt(globalDir, workspaceDir, {
            newGenerationCount:    generationCount,
            lastWorkspaceDreamAt,
            lastGlobalDreamAt,
            hasGlobalLock,
        });

        await generateText({
            model,
            system,
            messages: [{ role: 'user', content: prompt }],
            tools,
            stopWhen: [stepCountIs(30)],
        });

        // Clear the PID body so future dreams from this same extension host
        // are not blocked by the live-holder check in tryAcquireLock. The
        // mtime advances to "now" — which is the completion time we want
        // recorded as lastConsolidatedAt.
        releaseLock(workspaceLockPath);
        if (hasGlobalLock) { releaseLock(globalLockPath); }

        // Bust the 5-second TTL cache so the next turn picks up the consolidated memories.
        invalidateMemoryPromptCache(workspaceHash);

        console.log('[autoDream] consolidation complete');
        ctx.onDreamComplete?.();
    } catch (e: unknown) {
        console.error('[autoDream] consolidation failed:', e instanceof Error ? e.message : String(e));
        ctx.onDreamFail?.();
        rollbackLock(workspaceLockPath, workspacePriorMtime);
        if (hasGlobalLock && globalPriorMtime !== null) {
            rollbackLock(globalLockPath, globalPriorMtime);
        }
    }
}

/**
 * Runs memory consolidation directly, bypassing the time/activity gates.
 * Used by the consolidate_memories tool when the main agent explicitly requests it.
 */
export async function runConsolidation(ctx: Pick<DreamContext, 'workspacePath'>): Promise<void> {
    const workspaceHash    = computeWorkspaceHash(resolveWorkspaceIdentity(ctx.workspacePath));
    const workspaceDir     = getMemoryDir(workspaceHash);
    const globalDir        = getGlobalMemoryDir();
    const workspaceLockPath = getLockPath(workspaceDir);

    ensureMemoryDirsExist(workspaceHash);
    const workspacePriorMtime = tryAcquireLock(workspaceLockPath);
    if (workspacePriorMtime === null) {
        throw new Error('Consolidation already in progress — lock held by another process.');
    }

    const globalLockPath   = getLockPath(globalDir);
    const globalPriorMtime = tryAcquireLock(globalLockPath);
    const hasGlobalLock    = globalPriorMtime !== null;

    const lastWorkspaceDreamAt = workspacePriorMtime;
    const lastGlobalDreamAt    = hasGlobalLock
        ? (globalPriorMtime ?? 0)
        : readLastConsolidatedAt(globalLockPath);

    try {
        const model  = await getAnthropicClient(ANTHROPIC_HAIKU);
        const tools  = createMemoryTools(globalDir, workspaceDir);
        const system = buildDreamSystemPrompt(globalDir, workspaceDir);
        const prompt = buildConsolidationPrompt(globalDir, workspaceDir, {
            newGenerationCount: 0,
            lastWorkspaceDreamAt,
            lastGlobalDreamAt,
            hasGlobalLock,
        });

        await generateText({
            model,
            system,
            messages: [{ role: 'user', content: prompt }],
            tools,
            stopWhen: [stepCountIs(30)],
        });

        releaseLock(workspaceLockPath);
        if (hasGlobalLock) { releaseLock(globalLockPath); }
        invalidateMemoryPromptCache(workspaceHash);
    } catch (e) {
        rollbackLock(workspaceLockPath, workspacePriorMtime);
        if (hasGlobalLock && globalPriorMtime !== null) {
            rollbackLock(globalLockPath, globalPriorMtime);
        }
        throw e;
    }
}

/**
 * Triggers auto-dream fire-and-forget from handleStreamFinish.
 * Gates are checked internally — safe to call on every turn.
 */
export function executeAutoDream(ctx: DreamContext): void {
    const compose = (a?: () => void, b?: () => void): (() => void) | undefined =>
        (a || b) ? () => { a?.(); b?.(); } : undefined;
    runner({
        ...ctx,
        onDreamStart:    compose(ctx.onDreamStart,    dreamCallbacks.onDreamStart),
        onDreamComplete: compose(ctx.onDreamComplete, dreamCallbacks.onDreamComplete),
        onDreamFail:     compose(ctx.onDreamFail,     dreamCallbacks.onDreamFail),
    });
}
