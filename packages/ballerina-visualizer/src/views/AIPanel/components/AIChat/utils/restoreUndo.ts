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
 * Pure helpers behind "Restore Checkpoint" + "Undo". A restore runs on a single click and the
 * panel offers to take it back, the way an editor's rewind does, instead of asking first. These
 * stay out of `AIChat/index.tsx` so they can be tested without rendering the panel.
 */

/** The turns a restore drops from the panel, kept so an undo can put them back unchanged. */
export interface PendingRestoreUndo<M> {
    /** Messages removed by the restore, in order. Absent when the panel reloaded since, so it reloads them from the extension. */
    removedMessages?: M[];
    removedTurns: number;
}

/**
 * Splits the transcript where a restore truncates it: the message carrying the checkpoint and
 * everything after it go, matching `restoreThreadToCheckpoint` on the extension side.
 */
export function splitAtCheckpoint<M extends { checkpointId?: string }>(
    messages: M[],
    checkpointId: string
): { kept: M[]; removed: M[] } {
    const index = messages.findIndex((message) => message.checkpointId === checkpointId);
    if (index === -1) {
        return { kept: messages, removed: [] };
    }
    return { kept: messages.slice(0, index), removed: messages.slice(index) };
}

const BADGE = /<badge\b[^>]*>([\s\S]*?)<\/badge>/g;
const ATTACHMENT = /<attachment>[\s\S]*?<\/attachment>/g;

/**
 * The prompt text of a stored user message, ready to go back into the input box: badges keep
 * their visible text (`/ask`, a skill name), and attachment markers are dropped, since the files
 * themselves were not kept and cannot be re-attached.
 */
export function toRestoredPromptText(content: string): string {
    return content.replace(ATTACHMENT, "").replace(BADGE, "$1").trim();
}

/** Label for the undo bar, e.g. "Restored checkpoint · 2 turns removed". */
export function describeRestore(removedTurns: number): string {
    return `Restored checkpoint · ${removedTurns} ${removedTurns === 1 ? "turn" : "turns"} removed`;
}
