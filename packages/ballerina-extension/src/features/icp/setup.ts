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

import * as https from 'https';
import { readContextDocument } from '@wso2/wso2-cloud-client';
import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { workspace, window } from 'vscode';
import { extension } from '../../BalExtensionContext';
import { parse, stringify } from '@iarna/toml';
import { getICPUrl, ICP_DEFAULT_PORT } from './index';

const ICP_SECRET_KEY_PREFIX = 'ICP_ORG_SECRET_';
const CREATE_ORG_SECRET_MUTATION = JSON.stringify({
    query: 'mutation CreateOrgSecret { createOrgSecret(environmentId: "750e8400-e29b-41d4-a716-446655440001") }'
});
const ORG_SECRETS_QUERY = JSON.stringify({
    query: 'query OrgSecrets { orgSecrets { keyId environmentId environmentName bound createdAt createdBy } }'
});

function isLoopback(hostname: string): boolean {
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}

function waitForPort(hostname: string, port: number, timeoutMs: number = 10000): Promise<boolean> {
    const start = Date.now();
    return new Promise((resolve) => {
        function tryConnect() {
            if (Date.now() - start > timeoutMs) {
                resolve(false);
                return;
            }
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.once('timeout', () => {
                socket.destroy();
                setTimeout(tryConnect, 500);
            });
            socket.once('error', () => {
                socket.destroy();
                setTimeout(tryConnect, 500);
            });
            socket.connect(port, hostname);
        }
        tryConnect();
    });
}

const REQUEST_TIMEOUT_MS = 10000;

function httpsPost(url: string, body: string, headers: Record<string, string>): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const options: https.RequestOptions = {
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
            rejectUnauthorized: !isLoopback(parsed.hostname),
            timeout: REQUEST_TIMEOUT_MS,
        };

        const req = https.request(options, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString();
                let data: any;
                try {
                    data = JSON.parse(raw);
                } catch {
                    data = raw;
                }
                resolve({ status: res.statusCode || 0, data });
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error(`Request to ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function getICPCredentials(): { username: string; password: string } {
    const config = workspace.getConfiguration('ballerina');
    return {
        username: config.get<string>('icpUsername') || 'admin',
        password: config.get<string>('icpPassword') || 'admin',
    };
}

function getGraphQLUrl(): string {
    const icpUrl = getICPUrl();
    try {
        const url = new URL(icpUrl);
        return `${url.origin}/graphql`;
    } catch {
        return `https://127.0.0.1:${ICP_DEFAULT_PORT}/graphql`;
    }
}

async function getICPToken(): Promise<string> {
    const icpUrl = getICPUrl();
    const { username, password } = getICPCredentials();
    const loginUrl = `${icpUrl}/auth/login`;

    const response = await httpsPost(
        loginUrl,
        JSON.stringify({ username, password }),
        { 'Content-Type': 'application/json' }
    );

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`ICP login failed with status ${response.status}: ${response.data?.message || JSON.stringify(response.data)}`);
    }

    const token = response.data?.token;
    if (!token || typeof token !== 'string') {
        throw new Error(`ICP login response missing token: ${JSON.stringify(response.data)}`);
    }

    return token;
}

async function createOrgSecret(token: string): Promise<string> {
    const graphqlUrl = getGraphQLUrl();

    const response = await httpsPost(
        graphqlUrl,
        CREATE_ORG_SECRET_MUTATION,
        {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        }
    );

    return response.data.data.createOrgSecret;
}

async function isSecretValid(token: string, secret: string): Promise<boolean> {
    const keyId = secret.split('.')[0];
    if (!keyId) {
        return false;
    }

    const graphqlUrl = getGraphQLUrl();
    const response = await httpsPost(
        graphqlUrl,
        ORG_SECRETS_QUERY,
        {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        }
    );

    const orgSecrets: { keyId: string }[] = response.data?.data?.orgSecrets || [];
    return orgSecrets.some(s => s.keyId === keyId);
}

export async function storeICPSecret(projectPath: string, secret: string): Promise<void> {
    await extension.context.secrets.store(`${ICP_SECRET_KEY_PREFIX}${projectPath}`, secret);
}

export async function getStoredICPSecret(projectPath: string): Promise<string | undefined> {
    return extension.context.secrets.get(`${ICP_SECRET_KEY_PREFIX}${projectPath}`);
}

export function getProjectHandle(projectPath: string): string {
    // projectPath is the package dir; project root is its parent
    const projectRoot = path.dirname(projectPath);
    // .wso2 is what the extensions write now; .choreo is read for repositories linked before the move.
    for (const dir of ['.wso2', '.choreo']) {
        const contextYaml = path.join(projectRoot, dir, 'context.yaml');
        try {
            const entries = readContextDocument(yaml.load(fs.readFileSync(contextYaml, 'utf-8')));
            const project = entries[0]?.project;
            if (project) {
                return project;
            }
        } catch {
            // file not found or parse error
        }
    }
    return 'default-project';
}

function getIntegrationName(projectPath: string): string {
    const ballerinaToml = path.join(projectPath, 'Ballerina.toml');
    try {
        const content = fs.readFileSync(ballerinaToml, 'utf-8');
        const data = parse(content) as Record<string, any>;
        if (data?.package?.name) {
            return data.package.name;
        }
    } catch {
        // file not found or parse error
    }
    return 'default-integration';
}

export function writeSecretToConfigToml(projectPath: string, secret: string): void {
    const configPath = path.join(projectPath, 'Config.toml');
    let config: Record<string, any> = {};

    if (fs.existsSync(configPath)) {
        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            config = parse(content) as Record<string, any>;
        } catch (error) {
            console.error('[ICP] Error reading Config.toml:', error);
        }
    }

    if (!config.wso2) { config.wso2 = {}; }
    if (!config.wso2.icp) { config.wso2.icp = {}; }
    if (!config.wso2.icp.runtime) { config.wso2.icp.runtime = {}; }
    if (!config.wso2.icp.runtime.bridge) { config.wso2.icp.runtime.bridge = {}; }

    const bridge = config.wso2.icp.runtime.bridge;
    bridge.secret = secret;
    if (!bridge.environment) { bridge.environment = 'dev'; }
    if (!bridge.project) { bridge.project = getProjectHandle(projectPath); }
    if (!bridge.integration) { bridge.integration = getIntegrationName(projectPath); }
    if (!bridge.runtime) { bridge.runtime = os.hostname(); }
    fs.writeFileSync(configPath, stringify(config as any), 'utf-8');
}

/**
 * Provisions an ICP secret by logging into the ICP server and calling the GraphQL API.
 * Stores the secret in VS Code SecretStorage and writes it to Config.toml.
 *
 * @returns The provisioned secret, or undefined if provisioning failed.
 */
export async function provisionICPSecret(projectPath: string): Promise<string | undefined> {
    try {
        const icpUrl = getICPUrl();
        const parsed = new URL(icpUrl);
        const port = parseInt(parsed.port || String(ICP_DEFAULT_PORT), 10);
        const hostname = parsed.hostname;

        const ready = await waitForPort(hostname, port);
        if (!ready) {
            throw new Error(`ICP server not reachable at ${hostname}:${port}`);
        }

        const token = await getICPToken();

        // Check if stored secret is still valid
        const stored = await getStoredICPSecret(projectPath);
        if (stored) {
            const valid = await isSecretValid(token, stored);
            console.log(`[ICP] Stored secret validation: keyId=${stored.split('.')[0]}, valid=${valid}`);
            if (valid) {
                writeSecretToConfigToml(projectPath, stored);
                return stored;
            }
            console.log('[ICP] Stored secret is invalid, creating a new one');
        } else {
            console.log('[ICP] No stored secret found, creating a new one');
        }
        const secret = await createOrgSecret(token);

        await storeICPSecret(projectPath, secret);
        writeSecretToConfigToml(projectPath, secret);

        return secret;
    } catch (error: any) {
        const message = error instanceof Error ? error.message : String(error);
        window.showWarningMessage(
            `Failed to provision ICP secret: ${message}. You can set it manually in Config.toml.`
        );
        return undefined;
    }
}
