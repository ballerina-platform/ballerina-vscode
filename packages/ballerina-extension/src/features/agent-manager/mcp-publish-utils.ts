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

// Pure helpers for publishing an MCP server to Agent Manager, kept free of `vscode` so they unit test directly.

import * as fs from "fs";
import * as path from "path";
import { Document, isMap, isSeq, parseDocument } from "yaml";
import type { AgentManagerMcpSourceStep } from "@wso2/ballerina-core";
import type { McpProxyEndpoint, McpProxyRequestBody } from "./client";
import type { SourceFacts } from "./github";

/** The MCP revision Agent Manager's console registers proxies with. */
export const MCP_SPEC_VERSION = "2025-06-18";
export const PROXY_ENDPOINT_ID = "primary";
const DEFAULT_PROXY_VERSION = "1.0.0";
// Agent Manager names each gateway artifact `<proxy>-<endpoint>-<environment id without hyphens>` and caps it at 100 characters.
const MAX_PROXY_HANDLE = 100 - PROXY_ENDPOINT_ID.length - 32 - 2;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

export interface McpServiceDeclaration {
    /** The service's base path, always starting with `/`. */
    basePath: string;
    /** The listener port, when the source declares it as a number literal. */
    port?: number;
}

const SERVICE = /service\s+mcp:\w*Service\s+(?:([^\s{]+)\s+)?on\s+([^{]+?)\s*\{/;
const INLINE_LISTENER = /new\s+mcp:\w*Listener\s*\(\s*(?:port\s*=\s*)?(\d+)/;
const NAMED_LISTENER = (name: string) =>
    new RegExp(`listener\\s+mcp:\\w*Listener\\s+${name}\\s*=\\s*(?:check\\s+)?new\\s*(?:mcp:\\w*Listener)?\\s*\\(\\s*(?:port\\s*=\\s*)?(\\d+)`);

// A local trace toggle the agent flow keeps out of Git; it never declares services.
const LOCAL_ONLY_SOURCES = new Set(["trace_enabled.bal"]);

/** The package's Ballerina sources, including its modules, so a service declared in either is found. */
export function readMcpSources(projectPath: string): string[] {
    const balIn = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
        .filter((file) => file.endsWith(".bal") && !LOCAL_ONLY_SOURCES.has(file))
        .map((file) => fs.readFileSync(path.join(dir, file), "utf-8"));
    const modulesDir = path.join(projectPath, "modules");
    const modules = fs.existsSync(modulesDir)
        ? fs.readdirSync(modulesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(modulesDir, entry.name))
        : [];
    return [projectPath, ...modules].flatMap(balIn);
}

/**
 * Where the Git repository for this project belongs. WSO2 Cloud builds a Ballerina workspace from its root, so a
 * package inside one goes in the workspace's repository; a standalone package gets its own.
 */
export function repositoryRootFor(projectPath: string): string {
    const parent = path.dirname(projectPath);
    const workspaceToml = path.join(parent, "Ballerina.toml");
    return fs.existsSync(workspaceToml) && /^\s*\[workspace\]/m.test(fs.readFileSync(workspaceToml, "utf-8")) ? parent : projectPath;
}

/** Finds the first `ballerina/mcp` service across the given sources, and the port of the listener it attaches to. */
export function findMcpService(sources: string[]): McpServiceDeclaration | undefined {
    const text = sources.join("\n");
    const service = SERVICE.exec(text);
    if (!service) {
        return undefined;
    }
    const attachment = service[2].trim();
    const port = INLINE_LISTENER.exec(attachment)?.[1]
        ?? (/^\w+$/.test(attachment) ? NAMED_LISTENER(attachment).exec(text)?.[1] : undefined);
    return { basePath: normalizeServicePath(service[1]), port: port ? Number(port) : undefined };
}

/** Turns a Ballerina service path (`/mcp`, `"mcp"`, `/ai\-tools`, or none) into a URL path. */
export function normalizeServicePath(raw?: string): string {
    if (!raw) {
        return "/";
    }
    const unquoted = /^"(.*)"$/.exec(raw)?.[1] ?? raw.replace(/\\(.)/g, "$1");
    const trimmed = unquoted.replace(/^\/+|\/+$/g, "");
    return trimmed ? `/${trimmed}` : "/";
}

/**
 * The URL Agent Manager's proxy forwards to. WSO2 Cloud's endpoint exposes the listener's root (base path `/`),
 * so MCP clients append the service's own path; a URL that already ends with it is kept as entered.
 */
export function upstreamMcpUrl(endpointUrl: string, servicePath: string): string {
    let url: URL;
    try {
        url = new URL(endpointUrl.trim());
    } catch {
        throw new Error("Enter the endpoint URL WSO2 Cloud shows for this MCP server, starting with https://.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("Enter the endpoint URL WSO2 Cloud shows for this MCP server, starting with https://.");
    }
    // The service path is appended to the URL's path, which a query string or fragment would end up after.
    if (url.search || url.hash) {
        throw new Error("Remove the query string or fragment from the endpoint URL.");
    }
    const pathname = url.pathname.replace(/\/+$/, "");
    const suffix = servicePath === "/" ? "" : servicePath;
    const fullPath = suffix && !pathname.endsWith(suffix) ? `${pathname}${suffix}` : pathname;
    return `${url.origin}${fullPath}`;
}

/** A kebab-case proxy id short enough for Agent Manager's gateway artifact names. */
export function toProxyHandle(name: string): string {
    const handle = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return handle.slice(0, MAX_PROXY_HANDLE).replace(/-+$/, "") || "mcp-server";
}

/** The server's advertised version when it is semantic, which Agent Manager's console expects; otherwise 1.0.0. */
export function proxyVersion(serverVersion: unknown): string {
    return typeof serverVersion === "string" && SEMVER.test(serverVersion.trim()) ? serverVersion.trim() : DEFAULT_PROXY_VERSION;
}

export interface ComponentYamlUpdate {
    content: string;
    changed: boolean;
}

/**
 * Exposes the MCP listener through WSO2 Cloud at base path `/`. Without it, WSO2 Cloud derives the base path from
 * the service path, and MCP clients that append that path again reach `/mcp/mcp`. The document is edited in place,
 * so other endpoints, keys, comments and formatting are kept. Throws when the existing file isn't valid YAML.
 */
export function withMcpEndpoint(existing: string | undefined, port: number): ComponentYamlUpdate {
    const doc: Document = existing?.trim() ? parseDocument(existing) : new Document({ schemaVersion: "1.2" });
    if (doc.errors.length > 0) {
        throw new Error(`.choreo/component.yaml isn't valid YAML: ${doc.errors[0].message}`);
    }
    const before = JSON.stringify(doc.toJS() ?? null);
    if (!isMap(doc.contents)) {
        doc.contents = doc.createNode({ schemaVersion: "1.2" }) as Document["contents"];
    }
    if (!doc.has("schemaVersion")) {
        doc.set("schemaVersion", "1.2");
    }
    let endpoints = doc.get("endpoints");
    if (!isSeq(endpoints)) {
        endpoints = doc.createNode([]);
        doc.set("endpoints", endpoints);
    }
    const items = isSeq(endpoints) ? endpoints.items : [];
    const current = items.find((item) => isMap(item) && Number(item.getIn(["service", "port"])) === port);
    if (isMap(current)) {
        if (!current.has("type")) {
            current.set("type", "REST");
        }
        current.setIn(["service", "basePath"], "/");
    } else {
        items.push(doc.createNode({ name: "mcp", displayName: "MCP", type: "REST", networkVisibilities: ["Public"], service: { port, basePath: "/" } }));
    }
    return { content: doc.toString(), changed: JSON.stringify(doc.toJS()) !== before };
}

export interface McpUpstreamAuth {
    type: "api-key";
    header: string;
    value?: string;
}

export interface McpCapabilities {
    tools: unknown[];
    resources: unknown[];
    prompts: unknown[];
}

export interface McpProxyRequestInput {
    handle: string;
    name: string;
    version: string;
    description?: string;
    context?: string;
    url: string;
    auth?: McpUpstreamAuth;
    capabilities?: McpCapabilities;
    environmentId: string;
    /** The endpoint as Agent Manager returned it, so an update keeps its policies, security and scope bindings. */
    existingEndpoint?: McpProxyEndpoint;
}

/**
 * The create or update body for an Agent Manager MCP proxy with one endpoint in one environment.
 * New endpoints use Agent Identity (OAuth): Ballerina agents can't send the custom header API-key security needs.
 */
export function buildMcpProxyRequest(input: McpProxyRequestInput): McpProxyRequestBody {
    const { existingEndpoint } = input;
    const { environments: _environments, ...kept } = existingEndpoint ?? {};
    return {
        id: input.handle,
        name: input.name,
        version: input.version,
        description: input.description,
        context: input.context ?? `/default/${input.handle}`,
        mcpSpecVersion: MCP_SPEC_VERSION,
        endpoints: [{
            ...kept,
            id: existingEndpoint?.id ?? PROXY_ENDPOINT_ID,
            upstream: { ...existingEndpoint?.upstream, main: input.auth ? { url: input.url, auth: input.auth } : { url: input.url } },
            capabilities: input.capabilities ?? existingEndpoint?.capabilities,
            security: existingEndpoint?.security ?? { enabled: true, identity: { enabled: true } },
            environments: [{ environmentUuid: input.environmentId }],
        }],
    };
}

/** The Git state that decides what WSO2 Cloud can build: the agent flow's facts, minus its GitHub-only ones. */
export type McpSourceFacts = Pick<SourceFacts, "gitMissing" | "root" | "hasRemotes" | "branch" | "upstreamBranch" | "dirty" | "ahead">;

/**
 * The next thing to do before WSO2 Cloud, which builds from the remote repository, sees the latest code.
 * Worded as plain Git steps: which files changed, and why, is the extension's concern rather than the user's.
 */
export function mcpSourceStep(facts: McpSourceFacts): AgentManagerMcpSourceStep | undefined {
    if (facts.gitMissing) {
        return { id: "gitMissing", message: "Git isn't installed. WSO2 Cloud builds this server from a Git repository.", actionLabel: "Download Git" };
    }
    if (!facts.root || !facts.hasRemotes) {
        return { id: "publishRepo", message: "WSO2 Cloud builds from a remote Git repository. Publish this project to GitHub first.", actionLabel: "Publish to GitHub" };
    }
    if (!facts.branch) {
        return { id: "detached", message: "Check out a branch so WSO2 Cloud has one to build.", actionLabel: "Check Out a Branch" };
    }
    if (facts.dirty > 0) {
        return { id: "commit", message: "Commit and push your changes. WSO2 Cloud builds from your remote repository.", actionLabel: "Review and Commit" };
    }
    if (!facts.upstreamBranch) {
        return { id: "publishBranch", message: `Push ${facts.branch} to your remote repository. WSO2 Cloud builds from there.`, actionLabel: "Publish Branch" };
    }
    if (facts.ahead > 0) {
        return { id: "push", message: "Push your commits. WSO2 Cloud builds from your remote repository.", actionLabel: "Push" };
    }
    return undefined;
}
