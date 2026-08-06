// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { ChatNotify } from "@wso2/ballerina-core";

/**
 * In-memory per-run event buffer that powers **AI panel reconnection**.
 *
 * The agent run lives on the extension host independently of the webview (it is
 * tracked by the {@link chatStateStorage} singleton, keyed by
 * `(projectRootPath, threadId)`), so it keeps executing when the panel is
 * closed. But `ChatNotify` events are pushed to the webview fire-and-forget and
 * are silently dropped while no panel is registered. This store buffers every
 * emitted event (stamped with a monotonic `seq`) so that a panel which
 * (re)mounts can call `getRunStatus` and replay whatever it missed.
 *
 * This is the BI analogue of MI Copilot's `AgentEventHandler`.
 *
 * Scope/limitation: the buffer is in-memory only. It survives panel
 * close/reopen (the feature's requirement) but not an extension-host restart.
 */
export interface RunStatus {
    isRunning: boolean;
    events: ChatNotify[];
    /** Id of the buffered generation, if any. */
    generationId?: string;
    /** True when the buffer overflowed and its earliest events were evicted (replay can't rebuild the full turn). */
    truncated: boolean;
}

interface RunState {
    isRunning: boolean;
    /** Monotonic within the current run (reset on `beginRun`); stable under buffer eviction. */
    seqCounter: number;
    /**
     * Events of the current run. Reset on `beginRun`. Kept after `endRun` until the
     * turn's transcript is durably persisted as `uiResponse` (`clearBuffer`, driven by
     * `updateChatMessage`) — so a run that finished while the panel was closed stays
     * replayable across reopens until the replay's own `save_chat` round-trip lands.
     */
    runBuffer: BufferedRunEvent[];
    /** Approximate serialized size used to bound buffers containing large tool payloads. */
    bufferedBytes: number;
    generationId?: string;
    /** Set when the buffer cap evicted this run's earliest events. */
    truncated: boolean;
}

interface BufferedRunEvent {
    event: ChatNotify;
    /** First and last raw sequence represented by this entry. */
    firstSeq: number;
    lastSeq: number;
    /**
     * Adjacent streamed text chunks are stored together. This keeps a long text
     * stream from exhausting the event cap while still allowing an exact
     * `sinceSeq` response without duplicating chunks already seen by the panel.
     */
    contentChunks?: Array<{ seq: number; content: string }>;
    sizeBytes: number;
}

/** Per-run structured-event cap. Adjacent content deltas count as one entry. */
const MAX_BUFFERED_EVENTS = 5000;
/** Per-run approximate serialized byte cap. */
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
/** Retain buffers for at most this many distinct runs; evict the oldest beyond it. */
const MAX_RETAINED_RUNS = 20;

export class RunEventStore {
    private runs = new Map<string, RunState>();

    constructor(
        private readonly limits = {
            maxEvents: MAX_BUFFERED_EVENTS,
            maxBytes: MAX_BUFFERED_BYTES,
            maxRuns: MAX_RETAINED_RUNS,
        }
    ) {}

    private key(projectRootPath: string, threadId: string): string {
        return `${projectRootPath}::${threadId}`;
    }

    private getOrCreate(key: string): RunState {
        let state = this.runs.get(key);
        if (!state) {
            state = { isRunning: false, seqCounter: 0, runBuffer: [], bufferedBytes: 0, truncated: false };
            this.runs.set(key, state);
        }
        return state;
    }

    private eventSize(event: ChatNotify): number {
        try {
            return Buffer.byteLength(JSON.stringify(event), "utf8");
        } catch {
            return 1024;
        }
    }

    /** Evict the oldest inactive runs so the store doesn't grow unbounded across many workspaces. */
    private evictStaleRuns(): void {
        // Map preserves insertion order; never evict a run that is still active.
        for (const key of this.runs.keys()) {
            if (this.runs.size <= this.limits.maxRuns) {
                break;
            }
            if (!this.runs.get(key)?.isRunning) {
                this.runs.delete(key);
            }
        }
    }

    /** Marks the start of a run and clears its previous buffer. */
    beginRun(projectRootPath: string, threadId: string, generationId: string): void {
        const key = this.key(projectRootPath, threadId);
        const state = this.getOrCreate(key);
        if (state.isRunning && state.generationId === generationId) {
            return;
        }
        state.isRunning = true;
        state.seqCounter = 0;
        state.runBuffer = [];
        state.bufferedBytes = 0;
        state.truncated = false;
        state.generationId = generationId;
        this.evictStaleRuns();
    }

    /** Marks the end of a run. Keeps the buffer so an in-flight poll can still pick up a terminal event. */
    endRun(projectRootPath: string, threadId: string, generationId: string): void {
        const key = this.key(projectRootPath, threadId);
        const state = this.runs.get(key);
        if (state?.generationId === generationId) {
            state.isRunning = false;
        }
    }

    /**
     * Stamps `seq`/`generationId` on an event about to be sent to the panel and
     * buffers it under the explicitly identified run. Returns the same (mutated)
     * event so the caller can forward it. A stale or unrelated emitter is a
     * no-op instead of being attributed to whichever run started most recently.
     */
    stamp(
        projectRootPath: string,
        threadId: string,
        generationId: string,
        event: ChatNotify
    ): ChatNotify {
        const state = this.runs.get(this.key(projectRootPath, threadId));
        if (!state || !state.isRunning || state.generationId !== generationId) {
            return event;
        }

        const seq = ++state.seqCounter;
        event.seq = seq;
        event.generationId = generationId;

        const eventBytes = this.eventSize(event);
        const last = state.runBuffer[state.runBuffer.length - 1];
        if (event.type === "content_block" && last?.contentChunks) {
            last.contentChunks.push({ seq, content: event.content });
            last.lastSeq = seq;
            last.sizeBytes += eventBytes;
            state.bufferedBytes += eventBytes;
        } else {
            const storedEvent = { ...event } as ChatNotify;
            state.runBuffer.push({
                event: storedEvent,
                firstSeq: seq,
                lastSeq: seq,
                contentChunks: event.type === "content_block"
                    ? [{ seq, content: event.content }]
                    : undefined,
                sizeBytes: eventBytes,
            });
            state.bufferedBytes += eventBytes;
        }

        // Bound memory on pathologically long runs by dropping the oldest grouped
        // entries. `seq` remains monotonic and `truncated` prevents the client from
        // treating the retained tail as a complete transcript.
        while (
            state.runBuffer.length > this.limits.maxEvents
            || state.bufferedBytes > this.limits.maxBytes
        ) {
            const removed = state.runBuffer.shift();
            if (!removed) {
                break;
            }
            state.bufferedBytes = Math.max(0, state.bufferedBytes - removed.sizeBytes);
            state.truncated = true;
        }
        return event;
    }

    /**
     * Returns the run status for a reconnecting panel.
     * - `sinceSeq` provided → polling mode: only events with `seq > sinceSeq`.
     *   Returned whether or not the run is still active, so a poll can pick up a
     *   terminal event that was dropped.
     * - `sinceSeq` omitted → initial reconnect: the full buffer. A buffer only
     *   exists while its turn's transcript is not yet durably persisted
     *   (`clearBuffer` drops it once `uiResponse` is saved), so returning it is
     *   never a duplicate of chat history — it is either a live run or a
     *   finished-while-closed turn awaiting recovery.
     */
    getRunStatus(projectRootPath: string, threadId: string, sinceSeq?: number): RunStatus {
        const state = this.runs.get(this.key(projectRootPath, threadId));
        if (!state) {
            return { isRunning: false, events: [], truncated: false };
        }
        const events = state.runBuffer.flatMap((entry): ChatNotify[] => {
            if (sinceSeq === undefined || sinceSeq < 0) {
                if (entry.contentChunks) {
                    return [{
                        ...entry.event,
                        content: entry.contentChunks.map(chunk => chunk.content).join(""),
                        seq: entry.lastSeq,
                    } as ChatNotify];
                }
                return [{ ...entry.event }];
            }
            if (entry.lastSeq <= sinceSeq) {
                return [];
            }
            if (!entry.contentChunks) {
                return [{ ...entry.event }];
            }
            const missedChunks = entry.contentChunks.filter(chunk => chunk.seq > sinceSeq);
            if (missedChunks.length === 0) {
                return [];
            }
            return [{
                ...entry.event,
                content: missedChunks.map(chunk => chunk.content).join(""),
                seq: missedChunks[missedChunks.length - 1].seq,
            } as ChatNotify];
        });
        return { isRunning: state.isRunning, events, generationId: state.generationId, truncated: state.truncated };
    }

    /** True while any thread in the workspace has a live run. */
    hasActiveRun(projectRootPath: string): boolean {
        const prefix = `${projectRootPath}::`;
        for (const [key, state] of this.runs) {
            if (state.isRunning && key.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Drops the buffered events for a generation once its transcript has been
     * durably persisted as `uiResponse` (replay is no longer needed). No-op if
     * the buffer belongs to a different generation.
     */
    clearBuffer(projectRootPath: string, threadId: string, generationId: string): void {
        const key = this.key(projectRootPath, threadId);
        const state = this.runs.get(key);
        if (!state || state.generationId !== generationId) {
            return;
        }
        state.runBuffer = [];
        state.bufferedBytes = 0;
        state.truncated = false;
        state.generationId = undefined;
    }
}

export const runEventStore = new RunEventStore();
