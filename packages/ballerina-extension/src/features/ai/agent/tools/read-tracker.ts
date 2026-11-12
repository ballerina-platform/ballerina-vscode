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

import { createHash } from "crypto";
import * as path from "path";
import type { SeenFile } from "@wso2/ballerina-core";

export type ReadStatus = "fresh" | "unread" | "stale";

function digest(text: string): string {
    return createHash("sha1").update(text).digest("hex");
}

function toolResultIds(messages: readonly unknown[] | undefined): Set<string> {
    const ids = new Set<string>();
    for (const message of messages ?? []) {
        const content = (message as { content?: unknown })?.content;
        if (!Array.isArray(content)) {
            continue;
        }
        for (const part of content) {
            if (part?.type === "tool-result" && typeof part.toolCallId === "string") {
                ids.add(part.toolCallId);
            }
        }
    }
    return ids;
}

/**
 * File content the agent has seen. A file counts only while the tool call that showed it has its result in
 * the history the model is sent, so reverts, checkpoint restores, compaction restarts and stops all carry over.
 */
export class ReadTracker {
    private readonly latest = new Map<string, string>();
    /** This turn's entries, saved with its generation. */
    readonly seen: SeenFile[] = [];

    constructor(private readonly root: string) {}

    static fromHistory(
        root: string,
        generations: readonly { modelMessages?: readonly unknown[]; seenFiles?: readonly SeenFile[] }[]
    ): ReadTracker {
        const tracker = new ReadTracker(root);
        for (const generation of generations) {
            if (!generation.seenFiles?.length) {
                continue;
            }
            const sent = toolResultIds(generation.modelMessages);
            for (const file of generation.seenFiles) {
                if (sent.has(file.toolCallId)) {
                    tracker.latest.set(file.path, file.digest);
                }
            }
        }
        return tracker;
    }

    status(fullPath: string, raw: string): ReadStatus {
        const known = this.latest.get(this.key(fullPath));
        if (known === undefined) {
            return "unread";
        }
        return known === digest(raw) ? "fresh" : "stale";
    }

    observe(fullPath: string, raw: string, toolCallId?: string): void {
        const entry = { path: this.key(fullPath), digest: digest(raw) };
        this.latest.set(entry.path, entry.digest);
        if (toolCallId) {
            this.seen.push({ toolCallId, ...entry });
        }
    }

    forget(fullPath: string): void {
        this.latest.delete(this.key(fullPath));
    }

    /** A compaction restart starts the model's history at its summary, so nothing read before it counts. */
    reset(): void {
        this.latest.clear();
        this.seen.length = 0;
    }

    private key(fullPath: string): string {
        return path.relative(this.root, fullPath).split(path.sep).join("/");
    }
}

export const unreadMessage = (filePath: string, readTool: string) =>
    `Read '${filePath}' with ${readTool} before changing it. The file exists and has not been read in this conversation, so this change could overwrite code you have not seen.`;

export const staleMessage = (filePath: string, readTool: string) =>
    `'${filePath}' has changed since you last read it (the user or another tool edited it). Read it again with ${readTool} before changing it, so your change does not undo theirs.`;
