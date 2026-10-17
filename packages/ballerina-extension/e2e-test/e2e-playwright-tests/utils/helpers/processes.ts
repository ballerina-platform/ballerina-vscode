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

import { execFileSync } from 'child_process';

// Processes the test VS Code starts outlive it: the `bal` launcher runs the language server's JVM as its own child,
// so stopping VS Code (or reloading its window) stops the launcher but leaves the JVM running. On a CI runner each one
// keeps its heap, and a long group runs out of memory. These helpers find what a VS Code started so it can be stopped
// with it. Only the test VS Code's own descendants are touched, never another editor's.

interface ProcessEntry {
    pid: number;
    ppid: number;
    command: string;
}

function listProcesses(): ProcessEntry[] {
    if (process.platform === 'win32') {
        return [];
    }
    try {
        const output = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,args='], { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });
        return output.split('\n').flatMap((line) => {
            const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
            return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }] : [];
        });
    } catch {
        return [];
    }
}

/** Every process below `rootPid`, children first walked breadth-first; empty on Windows. */
export function descendantProcesses(rootPid: number | undefined): ProcessEntry[] {
    if (!rootPid) {
        return [];
    }
    const processes = listProcesses();
    const found: ProcessEntry[] = [];
    let frontier = [rootPid];
    while (frontier.length > 0) {
        const parents = new Set(frontier);
        const children = processes.filter((entry) => parents.has(entry.ppid) && !found.some((f) => f.pid === entry.pid));
        found.push(...children);
        frontier = children.map((entry) => entry.pid);
    }
    return found;
}

/** The JVMs below `rootPid`: language servers and the programs `bal run` started. */
export function javaDescendants(rootPid: number | undefined): ProcessEntry[] {
    return descendantProcesses(rootPid).filter((entry) => /(^|\/)java(\s|$)/.test(entry.command));
}

/**
 * The entries still running, matched by pid and command so a reused pid is never mistaken for one. An orphan no longer
 * sits below the process that started it, so this looks across all processes.
 */
export function stillRunning(entries: ProcessEntry[]): ProcessEntry[] {
    if (entries.length === 0) {
        return [];
    }
    const running = new Map(listProcesses().map((entry) => [entry.pid, entry.command]));
    return entries.filter((entry) => running.get(entry.pid) === entry.command);
}

/** Sends SIGKILL to each pid still running; returns how many were stopped. */
export function killProcesses(entries: ProcessEntry[]): number {
    let stopped = 0;
    for (const entry of entries) {
        try {
            process.kill(entry.pid, 'SIGKILL');
            stopped++;
        } catch {
            // Already exited.
        }
    }
    return stopped;
}
