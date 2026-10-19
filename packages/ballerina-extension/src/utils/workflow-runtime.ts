/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
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
import * as net from 'net';
import * as path from 'path';
import { parse } from '@iarna/toml';
import { WorkflowRuntimeMode, WorkflowRuntimeStatusResponse } from '@wso2/ballerina-core';

// Defaults of the `ballerina/workflow` configurables.
const DEFAULT_MODE: WorkflowRuntimeMode = 'LOCAL';
const DEFAULT_URL = 'localhost:7233';
const MODES: WorkflowRuntimeMode[] = ['LOCAL', 'IN_MEMORY', 'SELF_HOSTED', 'CLOUD'];
const PROBE_TIMEOUT_MS = 1500;

export interface WorkflowRuntimeConfig {
    mode: WorkflowRuntimeMode;
    url: string;
}

export function readWorkflowRuntimeConfig(projectPath: string): WorkflowRuntimeConfig {
    const configPath = path.join(projectPath, 'Config.toml');
    let table: Record<string, unknown> = {};
    try {
        if (fs.existsSync(configPath)) {
            const toml = parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>;
            table = toml?.ballerina?.workflow ?? {};
        }
    } catch (error) {
        console.warn('[WorkflowRuntime] Config.toml could not be parsed; assuming module defaults:', error);
    }
    const mode = typeof table.mode === 'string' && MODES.includes(table.mode as WorkflowRuntimeMode)
        ? table.mode as WorkflowRuntimeMode
        : DEFAULT_MODE;
    const url = typeof table.url === 'string' && table.url.trim() !== '' ? table.url.trim() : DEFAULT_URL;
    return { mode, url };
}

export function probeWorkflowRuntime(url: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<boolean> {
    const target = parseHostPort(url);
    if (!target) {
        return Promise.resolve(false);
    }
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        const finish = (reachable: boolean) => {
            if (settled) { return; }
            settled = true;
            socket.destroy();
            resolve(reachable);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
        socket.connect(target.port, target.host);
    });
}

// Accepts `host:port`, `[v6]:port` and a `scheme://` prefix.
export function parseHostPort(url: string): { host: string; port: number } | undefined {
    const bare = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/.*$/, '');
    const match = /^(?:\[([^\]]+)\]|([^:]+)):(\d{1,5})$/.exec(bare);
    if (!match) {
        return undefined;
    }
    const port = Number(match[3]);
    if (port < 1 || port > 65535) {
        return undefined;
    }
    return { host: match[1] ?? match[2], port };
}

export async function getWorkflowRuntimeStatus(projectPath: string): Promise<WorkflowRuntimeStatusResponse> {
    const { mode, url } = readWorkflowRuntimeConfig(projectPath);
    // A managed runtime is authenticated; a TCP probe says nothing useful about it.
    if (mode === 'IN_MEMORY' || mode === 'CLOUD') {
        return { mode, url };
    }
    return { mode, url, reachable: await probeWorkflowRuntime(url) };
}
