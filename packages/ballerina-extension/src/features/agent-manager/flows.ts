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

import { createHash, randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { parse } from "@iarna/toml";
import { isDeepStrictEqual } from "util";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
    AgentManagerAction,
    AgentManagerActionResponse,
    AgentManagerConfigField,
    AgentManagerLink,
    AgentManagerLinkCandidate,
    AgentManagerSource,
    AgentManagerStatus,
    DIRECTORY_MAP,
    isSamePath,
    OpenAPISpec,
    ProjectStructureArtifactResponse,
} from "@wso2/ballerina-core";
import { AgentManagerApiError, getSession, signIn, signOut } from "./auth";
import { forgetCopilotMcpTokens } from "./copilot";
import { buildConfigFields, configEnvKey } from "./configurables";
import { injectedEnvNames, reconcileAgentConfigs } from "./bindings";
import {
    buildBranch, ensureGitIgnored, inspectSource, isExposed, isIgnored, linkCandidates, LOCAL_ONLY_FILES, Preparation, readFacts, SourceFacts, SourceStepId,
    untrack,
} from "./github";
import {
    api,
    consoleUrl,
    DEFAULT_ENVIRONMENT,
    MAX_RESOURCE_NAME,
    readLink,
    readManifest,
    removeLink,
    updateManifest,
    writeLink,
} from "./client";
import { extension } from "../../BalExtensionContext";
import { StateMachine } from "../../stateMachine";
import { TracerMachine } from "../tracing/tracer-machine";
import { getActiveTracingProvider, updateOrAddSection } from "../tracing/utils";
import { getProjectTomlValues } from "../../utils/config";

const EXTERNAL_TOKEN_EXPIRY = "720h";
const OPENAPI_FILE = "openapi.yaml";
const DEV_TRACE_FILE = "trace_enabled.bal";
const AMP_IMPORT_FILE = "agent_manager.bal";
const CACHE_MS = 60_000;

let logChannel: vscode.OutputChannel | undefined;
const outputChannel = () => (logChannel ??= vscode.window.createOutputChannel("Agent Manager"));

class UserCancelled extends Error { }

function required<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new UserCancelled();
    }
    return value;
}

export async function getStatus(projectPath: string): Promise<AgentManagerStatus> {
    const session = await getSession();
    if (!session) {
        return { signedIn: false };
    }
    const status: AgentManagerStatus = { signedIn: true, instanceUrl: session.instanceUrl, org: session.org };
    try {
        const link = await readLink(projectPath);
        if (!link) {
            // Listing every project's agents is too heavy for each status poll.
            const [candidates, source] = await Promise.all([
                cached(candidateCache, projectPath, () => linkCandidates(projectPath)), sourceStatus(projectPath),
            ]);
            return { ...status, candidates, source };
        }
        status.link = link;
        Object.assign(status, link.mode === "internal" ? await platformStatus(projectPath, link) : {});
    } catch (error) {
        if (error instanceof AgentManagerApiError && error.status === 401) {
            await signOut();
            return { signedIn: false };
        }
        status.unavailable = true;
        status.error = describeError(error, session.instanceUrl);
    }
    return status;
}

let lastStatusError: string | undefined;

const UNTRUSTED_CA = "isn't trusted by this machine. Add its CA certificate to your system's trust store, then try again.";
const CERTIFICATE_ERRORS: Record<string, string> = {
    SELF_SIGNED_CERT_IN_CHAIN: UNTRUSTED_CA,
    DEPTH_ZERO_SELF_SIGNED_CERT: UNTRUSTED_CA,
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: UNTRUSTED_CA,
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: UNTRUSTED_CA,
    CERT_HAS_EXPIRED: "has expired. Ask your Agent Manager administrator to renew it.",
    ERR_TLS_CERT_ALTNAME_INVALID: "doesn't match the address you entered. Use the hostname the certificate was issued for.",
};

function describeError(error: unknown, instanceUrl?: string): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastStatusError) {
        lastStatusError = message;
        outputChannel().appendLine(message);
    }
    if (error instanceof AgentManagerApiError && error.status === 401) {
        return "Your Agent Manager session has expired. Sign in again to continue.";
    }
    // fetch reports network and TLS failures as a TypeError whose cause carries the code.
    const code = (error as { cause?: { code?: string } }).cause?.code;
    const host = instanceUrl ? new URL(instanceUrl).host : "Agent Manager";
    if (code && CERTIFICATE_ERRORS[code]) {
        return `The certificate of ${host} ${CERTIFICATE_ERRORS[code]}`;
    }
    return error instanceof TypeError && message === "fetch failed" ? `Can't reach ${host}. Check that it's running and try again.` : message;
}

async function describeActionError(error: unknown): Promise<string> {
    const instanceUrl = (await getSession())?.instanceUrl;
    if (error instanceof AgentManagerApiError && error.status === 401) {
        await signOut();
    }
    return describeError(error, instanceUrl);
}

async function platformStatus(projectPath: string, link: AgentManagerLink): Promise<Partial<AgentManagerStatus>> {
    const [agent, build, deployment, source, missingConfig] = await Promise.all([
        api.getAgent(link), api.getLatestBuild(link), api.getDeployment(link), sourceStatus(projectPath),
        missingConfigNames(projectPath, link).catch((): string[] => []),
    ]);
    const repo = agent.provisioning?.repository;
    const deployed = deployment?.imageId?.match(/:v\d+-([0-9a-f]{7,40})$/)?.[1] ?? build?.commitId;
    return {
        displayName: agent.displayName,
        branch: repo?.branch,
        source,
        ...await branchFreshness(projectPath, repo, deployed),
        crashed: looksCrashed(deployment),
        missingConfig,
        build,
        deployment: deployment && {
            environment: link.environment,
            status: deployment.status,
            imageId: deployment.imageId,
            endpointUrl: deployment.endpoints?.[0]?.url,
            lastDeployed: deployment.lastDeployed,
        },
    };
}

// Compares the deployed commit with the tip of the branch the agent builds, not the branch this clone tracks.
async function branchFreshness(projectPath: string, repo?: { url?: string; branch?: string }, deployed?: string): Promise<Partial<AgentManagerStatus>> {
    const target = await buildBranch(projectPath, repo?.url, repo?.branch);
    const newCommit = target?.tip && !(deployed && target.tip.startsWith(deployed)) ? target.tip : undefined;
    return { repository: target?.repository, tracked: !!target?.tip, newCommit, newCommitMessage: newCommit && target?.message };
}

const STUCK_STARTING_MS = 3 * 60 * 1000;

// Agent Manager keeps reporting "in-progress" while a pod crash-loops, so a long start is treated as a crash.
function looksCrashed(deployment?: { status: string; lastDeployed?: string }): boolean {
    const status = deployment?.status ?? "";
    const stuck = /progress|pending|deploying/i.test(status) && !!deployment?.lastDeployed
        && Date.now() - new Date(deployment.lastDeployed).getTime() > STUCK_STARTING_MS;
    return stuck || /fail|error|crash/i.test(status);
}

const ACTIONS: Record<AgentManagerAction, (projectPath: string, autoInstrumentation?: boolean) => Promise<string | void>> = {
    signIn: async () => {
        const session = required(await signIn());
        return `Signed in to Agent Manager (${session.org}).`;
    },
    signOut: async () => {
        await forgetCopilotMcpTokens();
        await signOut();
    },
    fixSource,
    setupExternal,
    pushAndRebuild,
    deployLatestBuild,
    regenerateToken,
    openInConsole: async (projectPath) => {
        await vscode.env.openExternal(vscode.Uri.parse(await consoleUrl(await requireLink(projectPath))));
    },
    openTryIt: async (projectPath) => {
        const link = await requireLink(projectPath);
        await vscode.env.openExternal(vscode.Uri.parse(`${await consoleUrl(link)}/environment/${link.environment}/tryOut`));
    },
    openDeploymentSettings: async (projectPath) => {
        const link = await requireLink(projectPath);
        const query = new URLSearchParams({ envId: link.environment, openConfigure: "open" });
        await vscode.env.openExternal(vscode.Uri.parse(`${await consoleUrl(link)}/deployment?${query}`));
    },
    openBuildLogs,
    openRuntimeLogs: async (projectPath) => {
        const link = await requireLink(projectPath);
        await vscode.env.openExternal(vscode.Uri.parse(`${await consoleUrl(link)}/environment/${link.environment}/observability/logs`));
    },
    unlink: async (projectPath) => removeLink(projectPath),
};

export function runAction(projectPath: string, action: AgentManagerAction, autoInstrumentation?: boolean): Promise<AgentManagerActionResponse> {
    return respond(() => ACTIONS[action](projectPath, autoInstrumentation));
}

export async function respond(step: () => Promise<string | void>): Promise<AgentManagerActionResponse> {
    try {
        const message = await step();
        if (message) {
            vscode.window.showInformationMessage(message);
        }
        return { success: true, message: message || undefined };
    } catch (error) {
        if (error instanceof UserCancelled) {
            return { success: false };
        }
        const message = await describeActionError(error);
        vscode.window.showErrorMessage(`Agent Manager: ${message}`);
        return { success: false, message };
    }
}

type Cache<T> = Map<string, { at: number; value: T }>;
const candidateCache: Cache<AgentManagerLinkCandidate[]> = new Map();
const configCache: Cache<string[]> = new Map();

async function cached<T>(cache: Cache<T>, key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
        return hit.value;
    }
    const value = await load();
    cache.set(key, { at: Date.now(), value });
    return value;
}

async function requireLink(projectPath: string): Promise<AgentManagerLink> {
    const link = await readLink(projectPath);
    if (!link) {
        throw new Error("This integration is not linked to an Agent Manager agent.");
    }
    return link;
}


async function pickProject(): Promise<string> {
    const createNew = "$(add) Create New Project";
    const projects = await api.listProjects();
    const choice = required(await vscode.window.showQuickPick(
        [...projects.map((p) => ({ label: p.name, description: p.displayName })), { label: createNew }],
        { title: "Select Agent Manager Project (1/2)", ignoreFocusOut: true }
    ));
    if (choice.label !== createNew) {
        return choice.label;
    }
    const displayName = required(await vscode.window.showInputBox({
        title: "New Project Name (1/2)",
        validateInput: (value) => (toResourceName(value) ? undefined : "Use at least one letter"),
        ignoreFocusOut: true,
    }));
    const name = toResourceName(displayName);
    await ensureProject(name, displayName);
    return name;
}

// A project left behind by an earlier attempt that failed later on is reused, not reported as a conflict.
export async function ensureProject(name: string, displayName: string): Promise<void> {
    await api.createProject(name, displayName).catch((error) => {
        if (!(error instanceof AgentManagerApiError && error.status === 409)) {
            throw error;
        }
    });
}

async function pickAgentName(projectPath: string, project: string) {
    const agents = await api.listAgents(project);
    const displayName = required(await vscode.window.showInputBox({
        title: "Agent Name (2/2)",
        value: await readPackageTitle(projectPath),
        validateInput: (value) => (toResourceName(value) ? undefined : "Use at least one letter"),
        ignoreFocusOut: true,
    }));
    const name = toResourceName(displayName);
    const existing = agents.find((agent) => agent.name === name);
    if (!existing) {
        return { name, displayName, existing: false };
    }
    if (existing.provisioning.type !== "external") {
        throw new Error(`'${name}' already exists in '${project}' as a ${existing.provisioning.type}ly hosted agent.`);
    }
    const link = "Link to Existing Agent";
    required(await vscode.window.showWarningMessage(`'${name}' already exists in '${project}'.`, { modal: true }, link));
    return { name, displayName, existing: true };
}

async function setupExternal(projectPath: string): Promise<string> {
    const { instanceUrl, org } = await getSession() ?? required(await signIn());
    const project = await pickProject();
    const { name, displayName, existing } = await pickAgentName(projectPath, project);
    const link: AgentManagerLink = { instanceUrl, org, project, agent: name, mode: "external", environment: DEFAULT_ENVIRONMENT };
    if (!existing) {
        await api.createExternalAgent(project, name, displayName);
    }
    await issueExternalToken(projectPath, link);
    if (getActiveTracingProvider(projectPath) !== "amp") {
        TracerMachine.enable(projectPath, true);
    }
    return `Traces from '${link.agent}' now go to Agent Manager (${link.environment}). Run the integration to send them.`;
}

async function regenerateToken(projectPath: string): Promise<string> {
    await issueExternalToken(projectPath, await requireLink(projectPath));
    return "New Agent Manager token written to Config.toml. The previous token stays valid until it expires.";
}

async function issueExternalToken(projectPath: string, link: AgentManagerLink): Promise<void> {
    const [token, gatewayUrl] = await Promise.all([api.generateToken(link, EXTERNAL_TOKEN_EXPIRY), api.getGatewayUrl(link.environment)]);
    await writeAmpConfig(projectPath, `${gatewayUrl}/otel`, token.token);
    writeLink(projectPath, link);
}

async function writeAmpConfig(projectPath: string, otelEndpoint: string, apiKey: string): Promise<void> {
    if (!(await readFacts(projectPath)).root) {
        throw new Error("Initialize Git for this integration first, so Config.toml can be kept out of commits before the API key is written to it.");
    }
    const configPath = path.join(projectPath, "Config.toml");
    const content = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf-8") : "";
    const updated = updateOrAddSection(content, "ballerinax.amp", { otelEndpoint, apiKey });
    if (await ensureGitIgnored(projectPath, "Config.toml")) {
        vscode.window.showInformationMessage("Added Config.toml to .gitignore.");
    }
    await untrack(projectPath, "Config.toml");
    fs.writeFileSync(configPath, updated.endsWith("\n") ? updated : updated + "\n");
}

async function pushAndRebuild(projectPath: string): Promise<string> {
    const link = await requireLink(projectPath);
    await requireGitHubSource(projectPath);
    await warnIfDefaultModelProvider(projectPath);
    await reconcileAgentConfigs(projectPath, link);
    await api.triggerBuild(link);
    return "Build started from the latest commit on the agent's branch.";
}

export async function loadConfigFields(projectPath: string, link?: AgentManagerLink): Promise<AgentManagerConfigField[]> {
    const state = link?.mode === "internal" ? await api.getConfigState(link) : { envKeys: [], fileSaved: false };
    return buildConfigFields(projectPath, state.envKeys, state.fileSaved, injectedEnvNames(projectPath));
}

// Names to add in Agent Manager; Ballerina only reads env vars named BAL_CONFIG_VAR_<NAME>. The language server call is too heavy for every poll.
function missingConfigNames(projectPath: string, link: AgentManagerLink): Promise<string[]> {
    return cached(configCache, projectPath, async () => (await loadConfigFields(projectPath, link))
        .filter((f) => f.required && !f.saved)
        .map((f) => (f.target === "env" ? configEnvKey(f.label) : `${f.label} (Config.toml)`)));
}

async function deployLatestBuild(projectPath: string): Promise<string> {
    const link = await requireLink(projectPath);
    const build = await api.getLatestBuild(link);
    if (!build?.imageId) {
        throw new Error("No completed build to deploy.");
    }
    await api.deploy(link, build.imageId);
    return `Deploying ${build.name} to ${link.environment}.`;
}

async function openBuildLogs(projectPath: string): Promise<void> {
    const link = await requireLink(projectPath);
    const build = await api.getLatestBuild(link);
    if (!build) {
        throw new Error("No builds yet.");
    }
    const query = new URLSearchParams({ selectedBuild: build.name, panel: "logs" });
    await vscode.env.openExternal(vscode.Uri.parse(`${await consoleUrl(link)}/build?${query}`));
}

// Auto-instrumentation injects ballerinax.amp config vars; Ballerina exits on unused config vars unless the module is imported.
function ensureAmpInstrumentation(projectPath: string): boolean {
    if (hasAmpImport(projectPath)) {
        return false;
    }
    fs.writeFileSync(path.join(projectPath, AMP_IMPORT_FILE), "import ballerinax/amp as _;\n");
    const tomlPath = path.join(projectPath, "Ballerina.toml");
    const toml = fs.readFileSync(tomlPath, "utf-8");
    if (!/observabilityIncluded\s*=\s*true/.test(toml)) {
        fs.writeFileSync(tomlPath, updateOrAddSection(toml, "build-options", { observabilityIncluded: true }) + "\n");
    }
    return true;
}

async function sourceStatus(projectPath: string): Promise<AgentManagerSource> {
    const facts = await readFacts(projectPath);
    return inspectSource(projectPath, facts, await readPreparation(projectPath, facts));
}

async function requireGitHubSource(projectPath: string): Promise<AgentManagerSource> {
    const source = await sourceStatus(projectPath);
    if (source.step?.blocking) {
        throw new Error(`${source.step.message} Resolve it in the Agent Manager panel, then deploy.`);
    }
    return source;
}

export async function readPreparation(projectPath: string, facts?: SourceFacts): Promise<Preparation> {
    const inRepo = !!(facts ?? await readFacts(projectPath)).root;
    const [exposed, ignored] = await Promise.all([
        Promise.all(LOCAL_ONLY_FILES.map((file) => isExposed(projectPath, file, inRepo))),
        Promise.all(LOCAL_ONLY_FILES.map((file) => isIgnored(projectPath, file, inRepo))),
    ]);
    return {
        openApiSpec: !fs.existsSync(path.join(projectPath, OPENAPI_FILE)),
        ampImport: !hasAmpImport(projectPath) && readManifest(projectPath).autoInstrumentation !== false,
        exposedFiles: LOCAL_ONLY_FILES.filter((_, index) => exposed[index]),
        gitignore: ignored.some((isFileIgnored) => !isFileIgnored),
        buildFiles: [AMP_IMPORT_FILE, OPENAPI_FILE].filter((file) => fs.existsSync(path.join(projectPath, file))),
        staleSpec: await isSpecStale(projectPath),
    };
}

const specCache = new Map<string, { key: string; stale: boolean }>();

// Generating the spec is a language-server call, so it reruns only when a .bal file or the spec changes.
async function isSpecStale(projectPath: string): Promise<boolean> {
    const specPath = path.join(projectPath, OPENAPI_FILE);
    if (!fs.existsSync(specPath)) {
        return false;
    }
    const key = [OPENAPI_FILE, ...balFiles(projectPath)].map((file) => `${file}:${fs.statSync(path.join(projectPath, file)).mtimeMs}`).join("|");
    const cached = specCache.get(projectPath);
    if (cached?.key === key) {
        return cached.stale;
    }
    let stale = false;
    try {
        const generated = JSON.parse(JSON.stringify((await detectInterface(projectPath)).spec));
        stale = !isDeepStrictEqual(parseYaml(fs.readFileSync(specPath, "utf-8")), generated);
    } catch { }
    specCache.set(projectPath, { key, stale });
    return stale;
}

function writeOpenApiSpec(projectPath: string, spec: object): void {
    fs.writeFileSync(path.join(projectPath, OPENAPI_FILE), stringifyYaml(spec));
    specCache.delete(projectPath);
}

const runCommand = (command: string) => async () => {
    await vscode.commands.executeCommand(command);
};
const reviewAndCommit = runCommand("workbench.view.scm");

const SOURCE_FIXES: Record<SourceStepId, (projectPath: string, autoInstrumentation?: boolean) => Promise<string | void>> = {
    gitMissing: async () => {
        await vscode.env.openExternal(vscode.Uri.parse("https://git-scm.com/downloads"));
    },
    prepare: prepareProject,
    publishRepo: runCommand("github.publish"),
    nonGitHub: async () => undefined,
    detached: runCommand("git.checkout"),
    commitFirst: reviewAndCommit,
    publishBranch: runCommand("git.publish"),
    commit: reviewAndCommit,
    push: runCommand("git.push"),
    syncGitHub: async (projectPath) => ((await readFacts(projectPath)).dirty > 0 ? reviewAndCommit() : runCommand("git.push")()),
    refreshSpec: async (projectPath) => {
        writeOpenApiSpec(projectPath, (await detectInterface(projectPath)).spec);
        return "Updated openapi.yaml. Commit and push it so Try It shows the current API.";
    },
};

async function fixSource(projectPath: string, autoInstrumentation?: boolean): Promise<string | void> {
    const { step } = await sourceStatus(projectPath);
    return step && SOURCE_FIXES[step.id as SourceStepId](projectPath, autoInstrumentation);
}

const STANDARD_GITIGNORE = ["target/", "generated/", ...LOCAL_ONLY_FILES];

async function prepareProject(projectPath: string, autoInstrumentation = true): Promise<string | void> {
    const prep = await readPreparation(projectPath);
    const added: string[] = [];
    if (prep.openApiSpec) {
        writeOpenApiSpec(projectPath, (await detectInterface(projectPath)).spec);
        added.push(OPENAPI_FILE);
    }
    if (prep.ampImport && !autoInstrumentation) {
        updateManifest(projectPath, (manifest) => ({ ...manifest, autoInstrumentation: false }));
    } else if (prep.ampImport && ensureAmpInstrumentation(projectPath)) {
        added.push(AMP_IMPORT_FILE);
    }
    const inRepo = !!(await readFacts(projectPath)).root;
    const ignored = await Promise.all(STANDARD_GITIGNORE.map((entry) => isIgnored(projectPath, entry, inRepo)));
    const wanted = STANDARD_GITIGNORE.filter((_, index) => !ignored[index]);
    if (wanted.length > 0) {
        const gitignorePath = path.join(projectPath, ".gitignore");
        const current = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf-8") : "";
        fs.writeFileSync(gitignorePath, `${current.trimEnd()}${current ? "\n" : ""}${wanted.join("\n")}\n`);
        added.push(".gitignore");
    }
    for (const file of LOCAL_ONLY_FILES) {
        await untrack(projectPath, file);
    }
    return added.length > 0 ? `Added ${added.join(", ")} for Agent Manager. Commit them with the rest of your code.` : undefined;
}

// Every secret for a repository shares this prefix; the hash keeps same-named repos of different owners apart.
export function repoSecretPrefix(repository: string): string {
    const hash = createHash("sha1").update(repository.toLowerCase()).digest("hex").slice(0, 4);
    const base = toResourceName(repository.split("/")[1] ?? "").slice(0, 13).replace(/-+$/, "") || "repo";
    return `${base}-${hash}-`;
}

// Secrets are org-wide and other agents may build with an existing one, so a new token always gets a new secret.
export async function saveRepoToken(repository: string, token: string): Promise<string> {
    const name = `${repoSecretPrefix(repository)}${randomBytes(2).toString("hex")}`;
    // GitHub ignores the username for token auth, but Agent Manager's basic-auth secret requires one.
    await api.createGitSecret(name, repository.split("/")[0], token);
    return name;
}

export async function readPackageTitle(projectPath: string): Promise<string> {
    const pkg = (await getProjectTomlValues(projectPath))?.package;
    return pkg?.title ?? (pkg?.name || path.basename(projectPath));
}

export function hasAmpImport(projectPath: string): boolean {
    return /import\s+ballerinax\/amp\b/.test(readBalSources(projectPath));
}

export function toResourceName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+/, "").slice(0, MAX_RESOURCE_NAME).replace(/-+$/, "");
}

function balFiles(projectPath: string): string[] {
    return fs.readdirSync(projectPath).filter((file) => file.endsWith(".bal") && file !== DEV_TRACE_FILE);
}

function readBalSources(projectPath: string): string {
    return balFiles(projectPath)
        .map((file) => fs.readFileSync(path.join(projectPath, file), "utf-8"))
        .join("\n");
}

export async function prepareHttpInterface(projectPath: string) {
    const detected = await detectInterface(projectPath);
    return { port: detected.port, basePath: detected.basePath, schemaPath: `/${OPENAPI_FILE}` };
}

const HTTP_LISTENER_MODULES = ["http", "ai"];

export function requireHttpEntryPoint(projectPath: string): ProjectStructureArtifactResponse {
    const project = StateMachine.context().projectStructure?.projects.find((candidate) => isSamePath(candidate.projectPath, projectPath));
    if (!project) {
        throw new Error("This integration hasn't finished loading. Try again in a moment.");
    }
    const service = project.directoryMap[DIRECTORY_MAP.SERVICE]?.find((candidate) => HTTP_LISTENER_MODULES.includes(candidate.moduleName ?? ""));
    if (!service) {
        throw new Error("Agent Manager can only host agents that receive HTTP requests. "
            + "Run this agent on your own infrastructure and register it as an externally-hosted agent under Management.");
    }
    return service;
}

async function detectInterface(projectPath: string): Promise<DetectedInterface> {
    const service = requireHttpEntryPoint(projectPath);
    return service.moduleName === "ai"
        ? { spec: chatSpec(await readPackageTitle(projectPath)), ...chatServiceAddress(projectPath, fs.readFileSync(service.path, "utf-8")) }
        : httpServiceInterface(service.path);
}

interface DetectedInterface {
    spec: object;
    port: number;
    basePath: string;
}

async function httpServiceInterface(serviceFile: string): Promise<DetectedInterface> {
    const response = await StateMachine.langClient().convertToOpenAPI({
        documentFilePath: serviceFile,
        enableBalExtension: true,
    }) as OpenAPISpec;
    const spec = response.content?.[0]?.spec;
    if (response.error || !spec) {
        throw new Error(`Could not generate an OpenAPI spec for ${path.basename(serviceFile)}: ${response.error ?? "empty result"}`);
    }
    const server = spec.servers?.[0];
    delete spec.servers;
    return {
        spec,
        port: Number(server?.variables?.port?.default) || 9090,
        basePath: server?.url?.replace(/^(?:[a-z]+:\/\/)?[^/]*/i, "") || "/",
    };
}

// ai:Listener serves a fixed chat contract that the OpenAPI generator does not see.
function chatServiceAddress(projectPath: string, source: string): { port: number; basePath: string } {
    const explicitPort = /ai:Listener\s+\w+\s*=\s*new\s*\(\s*(?:listenOn\s*=\s*)?(\d+)/.exec(source)?.[1];
    return {
        port: explicitPort ? Number(explicitPort) : defaultListenerPort(projectPath),
        basePath: /service\s+(\/[^\s{]*)\s+on\s/.exec(source)?.[1]?.replace(/\\/g, "") ?? "/",
    };
}

function defaultListenerPort(projectPath: string): number {
    const configPath = path.join(projectPath, "Config.toml");
    const config: any = fs.existsSync(configPath) ? parse(fs.readFileSync(configPath, "utf-8")) : {};
    return Number(config.ballerina?.http?.defaultListenerPort) || 9090;
}

function chatSpec(title: string): object {
    return {
        openapi: "3.0.1",
        info: { title, version: "1.0.0" },
        paths: {
            "/chat": {
                post: {
                    operationId: "chat",
                    requestBody: {
                        required: true,
                        content: { "application/json": { schema: { $ref: "#/components/schemas/ChatRequest" } } },
                    },
                    responses: {
                        "200": {
                            description: "Agent reply",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/ChatResponse" } } },
                        },
                    },
                },
            },
        },
        components: {
            schemas: {
                ChatRequest: {
                    type: "object",
                    required: ["sessionId", "message"],
                    properties: { sessionId: { type: "string" }, message: { type: "string" } },
                },
                ChatResponse: { type: "object", properties: { message: { type: "string" } } },
            },
        },
    };
}

const DEFAULT_PROVIDER_WARNED = "agentManager.defaultProviderWarned";

function usesDefaultModelProvider(projectPath: string): boolean {
    return /getDefaultModelProvider\s*\(/.test(readBalSources(projectPath));
}

export async function warnIfDefaultModelProvider(projectPath: string): Promise<void> {
    const warned: string[] = extension.context.workspaceState.get(DEFAULT_PROVIDER_WARNED, []);
    if (warned.includes(projectPath) || !usesDefaultModelProvider(projectPath)) {
        return;
    }
    required(await vscode.window.showWarningMessage(
        "This agent uses the default WSO2 model provider.",
        {
            modal: true,
            detail: "It signs in with a short-lived token from your WSO2 account, and that token expires, so the hosted agent "
                + "stops answering. Its configuration also can't be set as an environment variable in Agent Manager. "
                + "For a hosted agent, use a model provider with its own API key.",
        },
        "Deploy Anyway"
    ));
    await extension.context.workspaceState.update(DEFAULT_PROVIDER_WARNED, [...warned, projectPath]);
}
