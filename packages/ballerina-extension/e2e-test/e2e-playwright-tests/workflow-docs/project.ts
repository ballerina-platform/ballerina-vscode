/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.org)
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

import * as fs from 'fs';
import * as path from 'path';
import { newProjectPath } from '../utils/helpers';
import { DocJourney as Journey } from './doc-journey';

// What a journey checks outside the UI: the source the designer wrote, the running service, its log.

export function findFile(dir: string, name: string): string | undefined {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !['target', 'node_modules', '.git', '.vscode'].includes(entry.name)) {
            const found = findFile(full, name);
            if (found) {
                return found;
            }
        } else if (entry.name === name) {
            return full;
        }
    }
    return undefined;
}

export async function httpPost(url: string, body: unknown): Promise<{ status: number; body: string }> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.text() };
}

// Waits for a line in the integrated terminal, where Run prints the integration's log. The terminal draws with the DOM
// renderer (set in the profile), so its rows are readable text.
export async function waitForTerminal(j: Journey, pattern: RegExp, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let text = '';
    while (Date.now() < deadline) {
        text = (await j.page.locator('.xterm-rows').allInnerTexts().catch(() => [])).join('\n');
        if (pattern.test(text)) {
            return text;
        }
        await j.page.waitForTimeout(1000);
    }
    throw new Error(`The terminal never showed ${pattern} in ${timeoutMs} ms. Last lines:\n${text.split('\n').slice(-15).join('\n')}`);
}

// Whether a TCP port on this machine is free to listen on.
export async function portFree(port: number): Promise<boolean> {
    const net = await import('net');
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => server.close(() => resolve(true)));
        server.listen(port, '0.0.0.0');
    });
}

// "Running executable" prints before the listener binds; wait until the port takes a connection.
export async function waitForPort(port: number, timeoutMs = 120000): Promise<void> {
    const net = await import('net');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const open = await new Promise<boolean>((resolve) => {
            const socket = net.connect(port, '127.0.0.1');
            socket.once('connect', () => { socket.destroy(); resolve(true); });
            socket.once('error', () => resolve(false));
        });
        if (open) {
            return;
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Nothing listened on port ${port} within ${timeoutMs / 1000}s`);
}

// The default HTTP listener's port: 9090 as the pages use, or a free one set as `defaultListenerPort` in Config.toml
// when 9090 is taken on this machine.
export async function listenerPort(j: Journey, packageDir: string): Promise<number> {
    if (await portFree(9090)) {
        return 9090;
    }
    let port = 9190;
    while (!(await portFree(port))) {
        port++;
    }
    const file = path.join(packageDir, 'Config.toml');
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    // Replace an entry a previous run left, or extend an existing table; a second table would not parse.
    const updated = /^defaultListenerPort\s*=.*$/m.test(existing)
        ? existing.replace(/^defaultListenerPort\s*=.*$/m, `defaultListenerPort = ${port}`)
        : /^\[ballerina\.http\]\s*$/m.test(existing)
            ? existing.replace(/^\[ballerina\.http\]\s*$/m, `[ballerina.http]\ndefaultListenerPort = ${port}`)
            : `${existing.trimEnd()}\n\n[ballerina.http]\ndefaultListenerPort = ${port}\n`;
    fs.writeFileSync(file, updated);
    console.log(`port 9090 is taken on this machine; the integration listens on ${port} for this run`);
    void j;
    return port;
}
