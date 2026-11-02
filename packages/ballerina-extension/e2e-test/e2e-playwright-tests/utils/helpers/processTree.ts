/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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

export interface ProcessEntry {
    pid: number;
    command: string;
}

interface ProcessRow extends ProcessEntry {
    ppid: number;
}

const WINDOWS_PROCESS_QUERY =
    'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.Name)" }';

// Every live process with its parent and command name, from ps or, on Windows, from Win32_Process.
function processTable(): ProcessRow[] {
    let table: string;
    try {
        table = process.platform === 'win32'
            ? execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_PROCESS_QUERY],
                { encoding: 'utf8', timeout: 20000 })
            : execFileSync('ps', ['-eo', 'pid=,ppid=,comm='], { encoding: 'utf8', timeout: 10000 });
    } catch {
        return [];
    }
    const rows: ProcessRow[] = [];
    for (const line of table.split(/\r?\n/)) {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
        if (match) {
            rows.push({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] });
        }
    }
    return rows;
}

// The processes under a pid, parents first: the extension host under Electron, the language server
// and any `bal run` under the extension host. Read before the root is killed, since killing it
// reparents them (or, on Windows, orphans them) and the tree is gone.
export function descendantPids(root: number): number[] {
    return descendants(root).map((entry) => entry.pid);
}

export function descendants(root: number): ProcessEntry[] {
    const childrenOf = new Map<number, ProcessEntry[]>();
    for (const row of processTable()) {
        (childrenOf.get(row.ppid) ?? childrenOf.set(row.ppid, []).get(row.ppid)!)
            .push({ pid: row.pid, command: row.command });
    }
    const found: ProcessEntry[] = [];
    const queue = [root];
    while (queue.length > 0) {
        for (const child of childrenOf.get(queue.shift()!) ?? []) {
            found.push(child);
            queue.push(child.pid);
        }
    }
    return found;
}

// The command names of live processes, as "<pid> <command>" lines, for the reap's log and its pid check.
export function commandsOf(pids: number[]): string[] {
    if (pids.length === 0) {
        return [];
    }
    if (process.platform === 'win32') {
        const wanted = new Set(pids);
        return processTable().filter((row) => wanted.has(row.pid)).map((row) => `${row.pid} ${row.command}`);
    }
    try {
        return execFileSync('ps', ['-o', 'pid=,comm=', '-p', pids.join(',')], { encoding: 'utf8', timeout: 10000 })
            .split('\n').map((line) => line.trim()).filter(Boolean);
    } catch {
        return [];
    }
}

// Kills a process tree. On Windows taskkill /T takes a live root and everything under it, so call it
// before the root is killed; the descendants collected earlier are then killed here, parents first.
export function killProcessTree(root: number, descendants: ProcessEntry[]): number {
    if (process.platform === 'win32') {
        try {
            execFileSync('taskkill', ['/PID', String(root), '/T', '/F'], { stdio: 'ignore', timeout: 10000 });
        } catch {
            // already gone
        }
    }
    return killPids(descendants);
}

// Kills remembered processes, each only while it is still listed under the command it was seen
// with: a pid of a short-lived helper can belong to an unrelated process by the time it is reaped.
export function killPids(entries: ProcessEntry[]): number {
    if (entries.length === 0) {
        return 0;
    }
    const live = new Map<number, string>();
    for (const line of commandsOf(entries.map((entry) => entry.pid))) {
        const match = line.match(/^(\d+)\s+(.*)$/);
        if (match) {
            live.set(Number(match[1]), match[2]);
        }
    }
    let killed = 0;
    for (const entry of entries) {
        if (live.get(entry.pid) !== entry.command) {
            continue;
        }
        try {
            // On Windows the signal is ignored and the process is terminated.
            process.kill(entry.pid, 'SIGKILL');
            killed++;
        } catch {
            // already gone
        }
    }
    return killed;
}
