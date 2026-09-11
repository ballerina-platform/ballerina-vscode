// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

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
/**
 * Subagent history on disk, next to the thread it belongs to:
 *
 *   <threadDir>/subagents/<task-subagent-xxxxxxxx>/history.jsonl   one ModelMessage per line
 *   <threadDir>/subagents/<task-subagent-xxxxxxxx>/metadata.json   { subagentType, description, createdAt }
 *
 * Port of the MI Copilot's `subagent_tool.ts` persistence. Plain `fs` so the module stays a leaf that
 * Jest can load without the submodule.
 */

import * as fs from "fs";
import * as path from "path";
import type { ModelMessage } from "ai";
import { SubagentMetadata, SubagentType } from "./types";

const SUBAGENTS_DIR = "subagents";
const HISTORY_FILE = "history.jsonl";
const METADATA_FILE = "metadata.json";

export class SubagentNotFoundError extends Error {
    constructor(id: string) {
        super(`Subagent with ID ${id} not found. Cannot resume.`);
        this.name = "SubagentNotFoundError";
    }
}

export function getSubagentDir(threadDir: string, subagentId: string): string {
    return path.join(threadDir, SUBAGENTS_DIR, subagentId);
}

export function saveSubagentRun(
    threadDir: string,
    subagentId: string,
    run: { subagentType: SubagentType; description: string; messages: ModelMessage[] }
): void {
    const dir = getSubagentDir(threadDir, subagentId);
    fs.mkdirSync(dir, { recursive: true });
    const history = run.messages.map(m => JSON.stringify(m)).join("\n") + "\n";
    writeAtomic(path.join(dir, HISTORY_FILE), history);
    const existing = loadSubagentMetadata(threadDir, subagentId);
    const metadata: SubagentMetadata = {
        subagentType: run.subagentType,
        description: run.description,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    writeAtomic(path.join(dir, METADATA_FILE), JSON.stringify(metadata, null, 2));
}

export function loadSubagentHistory(threadDir: string, subagentId: string): ModelMessage[] {
    const file = path.join(getSubagentDir(threadDir, subagentId), HISTORY_FILE);
    if (!fs.existsSync(file)) { throw new SubagentNotFoundError(subagentId); }
    return fs.readFileSync(file, "utf8")
        .split("\n")
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line) as ModelMessage);
}

export function loadSubagentMetadata(threadDir: string, subagentId: string): SubagentMetadata | null {
    const file = path.join(getSubagentDir(threadDir, subagentId), METADATA_FILE);
    if (!fs.existsSync(file)) { return null; }
    try {
        return JSON.parse(fs.readFileSync(file, "utf8")) as SubagentMetadata;
    } catch {
        return null;
    }
}

function writeAtomic(file: string, content: string): void {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, content, "utf8");
    fs.renameSync(tmp, file);
}
