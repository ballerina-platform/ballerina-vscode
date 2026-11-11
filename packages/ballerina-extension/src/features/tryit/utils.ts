/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { exec, execSync } from 'child_process';
import { debug } from '../../utils';
import * as os from 'os';
import * as fs from 'fs';
import * as vscode from 'vscode';

export const TRYIT_TEMPLATE = `/*
### {{#if isResourceMode}}Try Resource: '{{resourceMethod}} {{resourcePath}}'{{else}}Try Service: '{{serviceName}}' (http://localhost:{{port}}{{trim basePath}}){{/if}}
{{info.description}}
*/

{{#each paths}}
{{#each this}}
{{#unless ../../isResourceMode}}/*
#### {{uppercase @key}} {{@../key}}

{{#if parameters}}
{{#with (groupParams parameters)}}
{{#if path}}
**Path Parameters:**
{{#each path}}
- \`{{name}}\` [{{schema.type}}]{{#if description}} - {{description}}{{/if}}{{#if required}} (Required){{/if}}
{{/each}}
{{/if}}

{{#if query}}
**Query Parameters:**
{{#each query}}
- \`{{name}}\` [{{schema.type}}]{{#if description}} - {{description}}{{/if}}{{#if required}} (Required){{/if}}
{{/each}}
{{/if}}

{{#if header}}
**Header Parameters:**
{{#each header}}
- \`{{name}}\` [{{schema.type}}]{{#if description}} - {{description}}{{/if}}{{#if required}} (Required){{/if}}
{{/each}}
{{/if}}
{{/with}}
{{/if}}
*/
{{/unless}}
###
{{uppercase @key}} http://localhost:{{../../port}}{{trim ../../basePath}}{{{@../key}}}{{queryParams parameters}}{{#if parameters}}{{headerParams parameters}}{{/if}}
{{#if requestBody}}Content-Type: {{getContentType requestBody}}

{{generateRequestBody requestBody}}
{{/if}}

{{/each}}
{{/each}}`;

export const HTTPYAC_CONFIG_TEMPLATE = `
const fs = require('fs');
const path = require('path');

// Define the log file path relative to the config file location
const LOG_FILE_PATH = path.join(__dirname, '{{errorLogFile}}');

// Helper function to format error groups
const formatErrorGroup = (title, params) => {
  if (params.length === 0) return '';
  return \`\${title}:\\n\${params.map(p => \`  - \${p}\`).join('\\n')}\\n\`;
};

module.exports = {
  configureHooks: function (api) {
    api.hooks.onRequest.addHook('validatePlaceholders', function (request) {
      const missingParams = {
        path: [],
        query: [],
        header: []
      };

      // Check URL path parameters
      const url = new URL(request.url);
      const decodedPath = decodeURIComponent(url.pathname);
      const pathParamRegex = /[{]([^{}]+)[}]/g;
      const pathMatches = [...decodedPath.matchAll(pathParamRegex)];
      
      pathMatches.forEach(match => {
        missingParams.path.push(match[1]);
      });

      // Check query parameters
      for (const [key, value] of url.searchParams.entries()) {
        if (value === '{?}') {
          missingParams.query.push(key);
        }
      }

      // Check headers
      for (const [key, value] of Object.entries(request.headers || {})) {
        if (value === '{?}') {
          missingParams.header.push(key);
        }
      }

      // Check if any parameters are missing
      const hasMissingParams = Object.values(missingParams)
        .some(group => group.length > 0);

      if (hasMissingParams) {
        const errorMessage = [
          \`Request to "\${request.url}" has missing required parameters:\\n\`,
          formatErrorGroup('Path Parameters', missingParams.path),
          formatErrorGroup('Query Parameters', missingParams.query),
          formatErrorGroup('Header Parameters', missingParams.header),
          '\\nPlease provide values for these parameters before sending the request.'
        ].filter(Boolean).join('\\n');

        // Write to log file
        fs.writeFileSync(LOG_FILE_PATH, errorMessage, 'utf8');
      }
    });
  }
};`;

// Retrieve the platform-specific commands
const platform = os.platform();

export interface Process {
    processName: string;
    pid: string;
    command: string;
    ports: number[];
}

const canonicalPathCache = new Map<string, string>();

export function findRunningBallerinaProcesses(projectPath: string): Promise<Process[]> {
    // Match the canonical path the JVM records for -XX:HeapDumpPath
    // (case-insensitive filesystems can hand us a differently-cased path).
    let resolvedPath = canonicalPathCache.get(projectPath);
    if (!resolvedPath) {
        try { resolvedPath = fs.realpathSync.native(projectPath); } catch { resolvedPath = projectPath; }
        canonicalPathCache.set(projectPath, resolvedPath);
    }

    // Execute the 'ps' command to retrieve running processes with command
    return new Promise((resolve, reject) => {
        exec(getPSCommand(platform, `-XX:HeapDumpPath=${resolvedPath}`), (error, stdout) => {
            if (error) {
                debug(`Failed to detect running Ballerina processes: ${error.message}`);
                return reject(error);
            }

            // Parse the output of the 'ps' command
            const out = stdout.trim().split('\n');
            const processes = platform === 'win32' ? out.slice(2) : out; // Exclude the header and separator rows

            // Extract the service name, PID, and command information
            let balProcesses = processes.map((service) => {
                const [, processName, pid, command] = service.trim().match(/(\S+)\s+(\d+)\s+(.+)/) || [];
                const ports = pid ? getServicePorts(pid) : [];
                return { processName, pid, command, ports };
            });

            // Display the service information
            balProcesses = balProcesses.filter((process) => process.ports && process.ports.length > 0);
            if (balProcesses.length > 0) {
                debug(`Found ${balProcesses.length} Ballerina process(es) with listening ports`);
                balProcesses.forEach((service) => {
                    debug(`Process ${service.pid} listening on port(s): ${service.ports.join(', ')}`);
                });
            }

            return resolve(balProcesses);
        });
    });
}

// Function to retrieve the port information of services using the related Ballerina program's process ID (PID)
function getServicePorts(pid: string): number[] {
    try {
        const output: string = execSync(getLSOFCommand(platform, pid), { encoding: 'utf-8' });
        if (isNaN(output.trim() as any)) {
            const listeningConnectionRegex = /^n(?:\*|localhost):(\d+)\b$/;
            let ports: number[];
            if (platform === "win32") {
                ports = output
                    .trim()
                    .split(/\r?\n/)
                    .map(line => parseInt(line.trim()))
                    .filter((port): port is number => port !== null);
            } else {
                ports = output
                    .split(/\r?\n/)
                    .map(line => line.trim())
                    .filter(line => listeningConnectionRegex.test(line))
                    .map(line => {
                        const match = line.match(listeningConnectionRegex);
                        return match ? parseInt(match[1]) : null; // Convert port number to integer
                    })
                    .filter((port): port is number => port !== null);
            }
            return ports;
        } else {
            return [parseInt(output.trim())];
        }
    } catch (error) {
        // ignore port retrieval errors as some processes may not have listening ports
    }
    return [];
}

// Function to get the platform-specific 'ps' command
function getPSCommand(platform: string, searchStr: string): string {
    switch (platform) {
        case 'darwin':
            return `ps -A -o comm,pid,command | grep -iF -e "${searchStr}"`;
        case 'linux':
            return `ps -A -o comm,pid,cmd | grep -iF -e "${searchStr}"`;
        case 'win32':
            return `powershell -command "Get-CimInstance -query \\"select * from win32_process WHERE commandLine LIKE '%${searchStr.replaceAll("\\", "\\\\")}%'\\" | Format-Table Name,ProcessId,commandLine | Out-String -Width 512"`;
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}

// Function to get the platform-specific 'lsof' command
function getLSOFCommand(platform: string, pid: string): string {
    switch (platform) {
        case 'darwin':
            return `lsof -a -i -p ${pid} -P -F nP`;
        case 'linux':
            return `lsof -a -i -p ${pid} -P -F nP`;
        case 'win32':
            return `powershell -command "Get-NetTCPConnection -OwningProcess ${pid} | Where-Object { $_.State -eq 'Listen' } | Select-Object -ExpandProperty LocalPort"`;
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}

export async function waitForBallerinaService(projectDir: string): Promise<void> {
    const maxAttempts = 100; // Try for 10 seconds
    const timeout = 100; // 100ms

    let attempt = 0;
    while (attempt < maxAttempts) {
        const runningProcesses = await findRunningBallerinaProcesses(projectDir);
        if (runningProcesses.length > 0) {
            return;
        }

        await new Promise(resolve => setTimeout(resolve, timeout));
        attempt++;
    }
    throw new Error('Timed out waiting for Ballerina service(s) to start');
}

/**
 * Centralized error handling function for Try It feature
 */
export function handleError(error, context: string, showToUser = true): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (showToUser) {
        vscode.window.showErrorMessage(`${context}: ${errorMessage}`);
    }

    console.error(`[${context}]`, error);
}

/**
 * Singleton class to manage the language client reference
 */
export class ClientManager {
    private static instance: ClientManager;
    private langClient: any = undefined;

    private constructor() { }

    public static getInstance(): ClientManager {
        if (!ClientManager.instance) {
            ClientManager.instance = new ClientManager();
        }
        return ClientManager.instance;
    }

    public setClient(client: any): void {
        this.langClient = client;
    }

    public getClient(): any {
        if (!this.langClient) {
            throw new Error('Language client is not initialized');
        }
        return this.langClient;
    }

    public hasClient(): boolean {
        return !!this.langClient;
    }
}

// Export singleton instance
export const clientManager = ClientManager.getInstance();
