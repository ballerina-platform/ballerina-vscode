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
    AgentManagerConfigForm,
    AgentManagerConfigInput,
    AgentManagerHostingMode,
    AgentManagerLink,
    AgentManagerLinkCandidate,
    AgentManagerSource,
    AgentManagerStatus,
    OpenAPISpec,
} from "@wso2/ballerina-core";
import { getSession, hasPermission, signIn, signOut } from "./auth";
import { offerCopilotMcp } from "./copilot";
import { buildConfigFields, CONFIG_FILE, readPackage, splitConfig, SplitConfig } from "./configurables";
import { injectedEnvNames, reconcileAgentConfigs } from "./bindings";
import {
    buildBranch, ensureGitIgnored, inspectSource, isExposed, isIgnored, linkCandidates, LOCAL_ONLY_FILES, openCommitView, Preparation, readFacts,
    SourceStepId, suggestCommitMessage, untrack,
} from "./github";
import {
    AgentManagerApiError,
    api,
    consoleUrl,
    DEFAULT_ENVIRONMENT,
    getRuntimeLogs,
    readLink,
    readManifest,
    removeLink,
    updateManifest,
    writeLink,
    writeProjectFile,
} from "./client";
import { extension } from "../../BalExtensionContext";
import { StateMachine } from "../../stateMachine";
import { TracerMachine } from "../tracing/tracer-machine";
import { getActiveTracingProvider, updateOrAddSection } from "../tracing/utils";

const EXTERNAL_TOKEN_EXPIRY = "720h";
export const OPENAPI_FILE = "openapi.yaml";
const DEV_TRACE_FILE = "trace_enabled.bal";
export const AMP_IMPORT_FILE = "agent_manager.bal";

let logChannel: vscode.OutputChannel | undefined;

function outputChannel(): vscode.OutputChannel {
    logChannel ??= vscode.window.createOutputChannel("Agent Manager");
    return logChannel;
}

export class UserCancelled extends Error { }

export function required<T>(value: T | undefined): T {
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
            const [candidates, canCreate, source] = await Promise.all([
                cachedCandidates(projectPath), hasPermission("agent:create"), sourceStatus(projectPath),
            ]);
            return { ...status, candidates, canCreate, source };
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

function describeError(error: unknown, instanceUrl?: string): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastStatusError) {
        lastStatusError = message;
        outputChannel().appendLine(message);
    }
    if (!(error instanceof AgentManagerApiError)) {
        return message;
    }
    if (error.status === 503) {
        return `Can't reach Agent Manager${instanceUrl ? ` at ${new URL(instanceUrl).host}` : ""}. Check that it's running and try again.`;
    }
    return error.status === 401 ? "Your Agent Manager session has expired. Sign in again to continue." : message;
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
        missingConfigLabels(projectPath, link).catch((): string[] => []),
    ]);
    const repo = agent.provisioning?.repository;
    const target = await buildBranch(projectPath, repo?.url, repo?.branch);
    const deployed = deployedCommit(deployment?.imageId) ?? build?.commitId;
    const newCommit = target?.tip && !(deployed && target.tip.startsWith(deployed)) ? target.tip : undefined;
    return {
        displayName: agent.displayName,
        repository: target?.repository,
        branch: repo?.branch,
        tracked: !!target?.tip,
        source,
        newCommit,
        newCommitMessage: newCommit && target?.message,
        crash: looksCrashed(deployment) ? await crashReason(link, usesDefaultModelProvider(projectPath)) : undefined,
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

const CONFIG_ERROR = /configurable|not configured|unused environment variable|as an environment variable|Config\.toml/i;
const STUCK_STARTING_MS = 3 * 60 * 1000;

// Agent Manager keeps reporting "in-progress" while a pod crash-loops, so a long start is treated as a crash.
function looksCrashed(deployment?: { status: string; lastDeployed?: string }): boolean {
    const status = deployment?.status ?? "";
    const stuck = /progress|pending|deploying/i.test(status) && !!deployment?.lastDeployed
        && Date.now() - new Date(deployment.lastDeployed).getTime() > STUCK_STARTING_MS;
    return stuck || /fail|error|crash/i.test(status);
}

// The last runtime error usually names the cause; config errors need the console, not a rebuild.
async function crashReason(link: AgentManagerLink, defaultProviderInCode: boolean): Promise<AgentManagerStatus["crash"]> {
    try {
        const lines = (await getRuntimeLogs(link, 15)).split("\n").map((line) => line.replace(/^\S+\s+/, "").trim());
        const reason = [...lines].reverse().find((line) => /^error:/i.test(line))?.replace(/^error:\s*/i, "");
        return reason ? { reason, config: CONFIG_ERROR.test(reason), defaultModelProvider: defaultProviderInCode && /wso2ProviderConfig/.test(reason) } : undefined;
    } catch {
        return undefined;
    }
}

function deployedCommit(imageId?: string): string | undefined {
    return imageId?.match(/:v\d+-([0-9a-f]{7,40})$/)?.[1];
}

const ACTIONS: Record<AgentManagerAction, (projectPath: string, config?: AgentManagerConfigInput, autoInstrumentation?: boolean) => Promise<string | void>> = {
    signIn: async () => {
        const session = required(await signIn());
        void offerCopilotMcp();
        return `Signed in to Agent Manager (${session.org}).`;
    },
    signOut: async () => signOut(),
    fixSource,
    setupExternal,
    pushAndRebuild,
    deployLatestBuild,
    regenerateToken,
    openInConsole: async (projectPath) => {
        await vscode.env.openExternal(vscode.Uri.parse(consoleUrl(await requireLink(projectPath))));
    },
    openTryIt: async (projectPath) => {
        const link = await requireLink(projectPath);
        await vscode.env.openExternal(vscode.Uri.parse(`${consoleUrl(link)}/environment/${link.environment}/tryOut`));
    },
    openDeploymentSettings: async (projectPath) => {
        const link = await requireLink(projectPath);
        const query = new URLSearchParams({ envId: link.environment, openConfigure: "open" });
        await vscode.env.openExternal(vscode.Uri.parse(`${consoleUrl(link)}/deployment?${query}`));
    },
    saveConfig,
    openBuildLogs,
    openRuntimeLogs,
    setRepoAccess,
    unlink: async (projectPath) => removeLink(projectPath),
};

export function runAction(projectPath: string, action: AgentManagerAction, config?: AgentManagerConfigInput, autoInstrumentation?: boolean): Promise<AgentManagerActionResponse> {
    return respond(() => ACTIONS[action](projectPath, config, autoInstrumentation));
}

/** Runs a user-facing step: shows its message or error, and treats a dismissed prompt as a quiet cancel. */
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

const CANDIDATES_CACHE_MS = 60_000;
const candidateCache = new Map<string, { at: number; candidates: AgentManagerLinkCandidate[] }>();

// Listing every project's agents is too heavy for each status poll.
async function cachedCandidates(projectPath: string): Promise<AgentManagerLinkCandidate[]> {
    const cached = candidateCache.get(projectPath);
    if (cached && Date.now() - cached.at < CANDIDATES_CACHE_MS) {
        return cached.candidates;
    }
    const candidates = await linkCandidates(projectPath);
    candidateCache.set(projectPath, { at: Date.now(), candidates });
    return candidates;
}

async function requireLink(projectPath: string): Promise<AgentManagerLink> {
    const link = await readLink(projectPath);
    if (!link) {
        throw new Error("This integration is not linked to an Agent Manager agent.");
    }
    return link;
}

async function newLink(projectPath: string, mode: AgentManagerHostingMode) {
    const session = await getSession() ?? required(await signIn());
    const project = await pickProject();
    const agent = await pickAgentName(projectPath, project, mode);
    const link: AgentManagerLink = {
        instanceUrl: session.instanceUrl,
        org: session.org,
        project,
        agent: agent.name,
        mode,
        environment: DEFAULT_ENVIRONMENT,
    };
    return { link, displayName: agent.displayName, existing: agent.existing };
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
    const displayName = required(await vscode.window.showInputBox({ title: "New Project Name (1/2)", ignoreFocusOut: true }));
    const name = toResourceName(displayName);
    await api.createProject(name, displayName);
    return name;
}

async function pickAgentName(projectPath: string, project: string, mode: AgentManagerHostingMode) {
    const agents = await api.listAgents(project);
    const displayName = required(await vscode.window.showInputBox({
        title: "Agent Name (2/2)",
        value: readPackageTitle(projectPath),
        validateInput: (value) => (toResourceName(value) ? undefined : "Use at least one letter or digit"),
        ignoreFocusOut: true,
    }));
    const name = toResourceName(displayName);
    const existing = agents.find((agent) => agent.name === name);
    if (!existing) {
        return { name, displayName, existing: false };
    }
    if (existing.provisioning.type !== mode) {
        throw new Error(`'${name}' already exists in '${project}' as a ${existing.provisioning.type}ly hosted agent.`);
    }
    const link = "Link to Existing Agent";
    required(await vscode.window.showWarningMessage(`'${name}' already exists in '${project}'.`, { modal: true }, link));
    return { name, displayName, existing: true };
}

async function setupExternal(projectPath: string): Promise<string> {
    const { link, displayName, existing } = await newLink(projectPath, "external");
    if (!existing) {
        await api.createExternalAgent(link.project, link.agent, displayName);
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
    const [token, otelEndpoint] = await Promise.all([
        api.generateToken(link, EXTERNAL_TOKEN_EXPIRY),
        api.getOtelEndpoint(link.environment),
    ]);
    writeAmpConfig(projectPath, otelEndpoint, token.token);
    writeLink(projectPath, link);
}

function writeAmpConfig(projectPath: string, otelEndpoint: string, apiKey: string): void {
    if (!readFacts(projectPath).root) {
        throw new Error("Initialize Git for this integration first, so Config.toml can be kept out of commits before the API key is written to it.");
    }
    const configPath = path.join(projectPath, "Config.toml");
    const content = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf-8") : "";
    const updated = updateOrAddSection(content, "ballerinax.amp", { otelEndpoint, apiKey });
    if (ensureGitIgnored(projectPath, "Config.toml")) {
        vscode.window.showInformationMessage("Added Config.toml to .gitignore.");
    }
    untrack(projectPath, "Config.toml");
    writeProjectFile(projectPath, configPath, updated.endsWith("\n") ? updated : updated + "\n");
}

export async function ensureDevTracingOff(projectPath: string): Promise<void> {
    if (getActiveTracingProvider(projectPath) !== "idetraceprovider") {
        return;
    }
    const turnOff = "Turn Off Dev-Time Tracing";
    required(await vscode.window.showWarningMessage(
        "Dev-time tracing is on for this integration.",
        {
            modal: true,
            detail: "Dev-time tracing sends traces to the local trace viewer and must be off before deploying. "
                + "Agent Manager instruments the hosted agent itself.",
        },
        turnOff
    ));
    TracerMachine.disable(projectPath);
}

async function pushAndRebuild(projectPath: string): Promise<string> {
    const link = await requireLink(projectPath);
    await requireGitHubSource(projectPath);
    await ensureDevTracingOff(projectPath);
    await warnIfDefaultModelProvider(projectPath);
    await reconcileAgentConfigs(projectPath, link);
    await api.triggerBuild(link);
    const repo = (await api.getAgent(link)).provisioning?.repository;
    return `Build started from the latest commit on ${repo?.branch ?? "the agent's branch"}.`;
}

export async function getConfigForm(projectPath: string): Promise<AgentManagerConfigForm> {
    try {
        return await loadConfigFields(projectPath, await readLink(projectPath));
    } catch (error) {
        return { fields: [], fileSaved: false, error: await describeActionError(error) };
    }
}

export async function loadConfigFields(projectPath: string, link?: AgentManagerLink): Promise<AgentManagerConfigForm> {
    const state = link?.mode === "internal" ? await api.getConfigState(link, CONFIG_FILE.mountPath) : { envKeys: [], fileSaved: false };
    const fields = await buildConfigFields(projectPath, state.envKeys, state.fileSaved, injectedEnvNames(projectPath));
    return { fields, fileSaved: state.fileSaved };
}

export function resolveConfig(fields: AgentManagerConfigField[], config?: AgentManagerConfigInput, allowMissing = false): SplitConfig {
    const split = splitConfig(fields, config ?? { values: {}, secrets: {} }, allowMissing);
    if (split.errors.length > 0) {
        throw new Error(split.errors.join(" "));
    }
    return split;
}

async function saveConfigFor(projectPath: string, link: AgentManagerLink, config: AgentManagerConfigInput): Promise<string> {
    const split = resolveConfig((await loadConfigFields(projectPath, link)).fields, config);
    if (split.env.length === 0 && !split.file) {
        return "Nothing to save.";
    }
    await api.updateConfigurations(link, split.env, split.file && { ...CONFIG_FILE, ...split.file });
    configCache.delete(projectPath);
    return `Saved configuration to Agent Manager (${link.environment}).`;
}

async function saveConfig(projectPath: string, config?: AgentManagerConfigInput): Promise<string> {
    return saveConfigFor(projectPath, await requireLink(projectPath), config ?? { values: {}, secrets: {} });
}

const CONFIG_CACHE_MS = 60_000;
const configCache = new Map<string, { at: number; labels: string[] }>();

// The language server call is too heavy for every status poll, so missing values are cached briefly.
async function missingConfigLabels(projectPath: string, link: AgentManagerLink): Promise<string[]> {
    const cached = configCache.get(projectPath);
    if (cached && Date.now() - cached.at < CONFIG_CACHE_MS) {
        return cached.labels;
    }
    const { fields } = await loadConfigFields(projectPath, link);
    const labels = fields.filter((f) => f.required && !f.saved && !f.unsupported).map((f) => f.label);
    configCache.set(projectPath, { at: Date.now(), labels });
    return labels;
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
    await vscode.env.openExternal(vscode.Uri.parse(`${consoleUrl(link)}/build?${query}`));
}

async function openRuntimeLogs(projectPath: string): Promise<void> {
    const link = await requireLink(projectPath);
    showLogs(`${link.agent} in ${link.environment}, last 30 minutes`, await getRuntimeLogs(link, 30));
}

function showLogs(title: string, logs: string): void {
    const channel = outputChannel();
    channel.clear();
    channel.appendLine(`# ${title}`);
    channel.appendLine(logs || "No log lines yet. Try again in a few seconds.");
    channel.show(true);
}

// Auto-instrumentation injects ballerinax.amp config vars; Ballerina exits on unused config vars unless the module is imported.
function ensureAmpInstrumentation(projectPath: string): boolean {
    if (hasAmpImport(projectPath)) {
        return false;
    }
    writeProjectFile(projectPath, path.join(projectPath, AMP_IMPORT_FILE), "import ballerinax/amp as _;\n");
    const tomlPath = path.join(projectPath, "Ballerina.toml");
    const toml = fs.readFileSync(tomlPath, "utf-8");
    if (!/observabilityIncluded\s*=\s*true/.test(toml)) {
        writeProjectFile(projectPath, tomlPath, updateOrAddSection(toml, "build-options", { observabilityIncluded: true }) + "\n");
    }
    return true;
}

// ---- GitHub preflight -------------------------------------------------------------------------

interface GitHubSource {
    repoUrl: string;
    repository: string;
    branch: string;
    commit: string;
    appPath: string;
    isPrivate?: boolean;
}

async function sourceStatus(projectPath: string): Promise<AgentManagerSource> {
    const { facts, ...source } = await inspectSource(projectPath, await readPreparation(projectPath));
    return source;
}

// Deploys build what is on GitHub, so the commit is the upstream one, not local HEAD.
async function requireGitHubSource(projectPath: string): Promise<GitHubSource> {
    const source = await inspectSource(projectPath, await readPreparation(projectPath));
    if (source.step?.blocking) {
        throw new Error(`${source.step.message} Resolve it in the Agent Manager panel, then deploy.`);
    }
    const { facts } = source;
    return {
        repoUrl: `https://github.com/${facts.repository}`,
        repository: facts.repository!,
        branch: facts.upstreamBranch!,
        commit: facts.remoteCommit!,
        appPath: facts.appPath ?? "/",
        isPrivate: source.isPrivate,
    };
}

export async function readPreparation(projectPath: string): Promise<Preparation> {
    const inRepo = !!readFacts(projectPath).root;
    return {
        openApiSpec: !fs.existsSync(path.join(projectPath, OPENAPI_FILE)),
        ampImport: !hasAmpImport(projectPath) && readManifest(projectPath).autoInstrumentation !== false,
        exposedFiles: LOCAL_ONLY_FILES.filter((file) => isExposed(projectPath, file, inRepo)),
        gitignore: LOCAL_ONLY_FILES.some((file) => !isIgnored(projectPath, file, inRepo)),
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
    } catch {
        stale = false;
    }
    specCache.set(projectPath, { key, stale });
    return stale;
}

function writeOpenApiSpec(projectPath: string, spec: object): void {
    writeProjectFile(projectPath, path.join(projectPath, OPENAPI_FILE), stringifyYaml(spec));
    specCache.delete(projectPath);
}

const reviewAndCommit = (projectPath: string) => openCommitView(projectPath, suggestCommitMessage(projectPath));
const runCommand = (command: string) => async () => {
    await vscode.commands.executeCommand(command);
};

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
    syncGitHub: (projectPath) => (readFacts(projectPath).dirty > 0 ? reviewAndCommit(projectPath) : runCommand("git.push")()),
    refreshSpec: async (projectPath) => {
        writeOpenApiSpec(projectPath, (await detectInterface(projectPath)).spec);
        return "Updated openapi.yaml. Commit and push it so Try It shows the current API.";
    },
};

async function fixSource(projectPath: string, _config?: AgentManagerConfigInput, autoInstrumentation?: boolean): Promise<string | void> {
    const { step } = await inspectSource(projectPath, await readPreparation(projectPath));
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
    const inRepo = !!readFacts(projectPath).root;
    const wanted = STANDARD_GITIGNORE.filter((entry) => !isIgnored(projectPath, entry, inRepo));
    if (wanted.length > 0) {
        const gitignorePath = path.join(projectPath, ".gitignore");
        const current = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf-8") : "";
        writeProjectFile(projectPath, gitignorePath, `${current.trimEnd()}${current ? "\n" : ""}${wanted.join("\n")}\n`);
        added.push(".gitignore");
    }
    LOCAL_ONLY_FILES.forEach((file) => untrack(projectPath, file));
    return added.length > 0 ? `Added ${added.join(", ")} for Agent Manager. Commit them with the rest of your code.` : undefined;
}

async function setRepoAccess(projectPath: string): Promise<string> {
    const link = await requireLink(projectPath);
    const git = await requireGitHubSource(projectPath);
    const secretRef = await chooseGitSecret(git.repository);
    await api.updateRepository(link, await api.getAgent(link), { secretRef });
    return `'${link.agent}' now clones ${git.repository} with the token ${secretRef}.`;
}

export async function chooseGitSecret(repository: string): Promise<string> {
    const name = repoSecretName(repository);
    const reuse = "Use Existing Token";
    if (await api.hasGitSecret(name) && required(await vscode.window.showInformationMessage(
        `Agent Manager already has a token for ${repository}.`, { modal: true }, reuse, "Replace Token")) === reuse) {
        return name;
    }
    return saveRepoToken(repository, await askGitToken(repository));
}

// Agent Manager caps secret names at 25 characters; the hash keeps same-named repos of different owners apart.
export function repoSecretName(repository: string): string {
    const hash = createHash("sha1").update(repository.toLowerCase()).digest("hex").slice(0, 4);
    return `${toResourceName(repository.split("/")[1]).slice(0, 15).replace(/-+$/, "")}-${hash}-git`;
}

/** Stores a token as this repository's git secret, replacing the old one: Agent Manager can't update a secret in place. */
export async function saveRepoToken(repository: string, token: string): Promise<string> {
    const name = repoSecretName(repository);
    if (await api.hasGitSecret(name)) {
        await api.deleteGitSecret(name);
    }
    // GitHub ignores the username for token auth, but Agent Manager's basic-auth secret requires one.
    await api.createGitSecret(name, repository.split("/")[0], token);
    return name;
}

async function askGitToken(repository: string): Promise<string> {
    return required(await vscode.window.showInputBox({
        title: "Personal Access Token",
        prompt: `Read-only access to the contents of ${repository}.`,
        placeHolder: "github_pat_…",
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim() ? undefined : "Enter a token"),
    })).trim();
}

// ---- Deriving the agent from the package -------------------------------------------------------

export function readPackageTitle(projectPath: string): string {
    const { title, name } = readPackage(projectPath);
    return title ?? (name || path.basename(projectPath));
}

export function hasAmpImport(projectPath: string): boolean {
    return /import\s+ballerinax\/amp\b/.test(readBalSources(projectPath));
}

export function toResourceName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 63).replace(/-+$/, "");
}

function balFiles(projectPath: string): string[] {
    return fs.readdirSync(projectPath).filter((file) => file.endsWith(".bal") && file !== DEV_TRACE_FILE);
}

function readBalSources(projectPath: string): string {
    return balFiles(projectPath)
        .map((file) => fs.readFileSync(path.join(projectPath, file), "utf-8"))
        .join("\n");
}

interface HttpInterface {
    port: number;
    basePath: string;
    schemaPath: string;
}

export async function prepareHttpInterface(projectPath: string): Promise<HttpInterface> {
    await warnIfMissingDependenciesToml(projectPath);
    const detected = await detectInterface(projectPath);
    return {
        port: detected.port || await askPort(),
        basePath: detected.basePath,
        schemaPath: `/${OPENAPI_FILE}`,
    };
}

async function detectInterface(projectPath: string): Promise<DetectedInterface> {
    const serviceFile = fs.readdirSync(projectPath)
        .filter((file) => file.endsWith(".bal"))
        .find((file) => /service\s+[^{;]*\bon\s+/.test(fs.readFileSync(path.join(projectPath, file), "utf-8")));
    if (!serviceFile) {
        throw new Error("No service found in this integration. A platform-hosted agent needs one to receive requests.");
    }
    const source = fs.readFileSync(path.join(projectPath, serviceFile), "utf-8");
    return /ai:Listener/.test(source)
        ? chatServiceInterface(projectPath, source)
        : httpServiceInterface(path.join(projectPath, serviceFile));
}

interface DetectedInterface {
    spec: object;
    port?: number;
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
        port: Number(server?.variables?.port?.default),
        basePath: server?.url?.replace(/^\{server\}:\{port\}/, "") || "/",
    };
}

// ai:Listener serves a fixed chat contract that the OpenAPI generator does not see.
function chatServiceInterface(projectPath: string, source: string): DetectedInterface {
    const explicitPort = /ai:Listener\s+\w+\s*=\s*new\s*\(\s*(?:listenOn\s*=\s*)?(\d+)/.exec(source)?.[1];
    const basePath = /service\s+(\/[^\s{]*)\s+on\s/.exec(source)?.[1]?.replace(/\\/g, "") ?? "/";
    return {
        spec: chatSpec(readPackageTitle(projectPath)),
        port: explicitPort ? Number(explicitPort) : defaultListenerPort(projectPath),
        basePath,
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

async function askPort(): Promise<number> {
    const port = required(await vscode.window.showInputBox({
        title: "HTTP port the agent listens on",
        validateInput: (value) => (/^\d+$/.test(value) ? undefined : "Enter a port number"),
        ignoreFocusOut: true,
    }));
    return Number(port);
}

const DEFAULT_PROVIDER_WARNED = "agentManager.defaultProviderWarned";

function usesDefaultModelProvider(projectPath: string): boolean {
    return /getDefaultModelProvider\s*\(/.test(readBalSources(projectPath));
}

// Warn once per project; deploying anyway stays allowed.
export async function warnIfDefaultModelProvider(projectPath: string): Promise<void> {
    const warned: string[] = extension.context.workspaceState.get(DEFAULT_PROVIDER_WARNED, []);
    if (warned.includes(projectPath) || !usesDefaultModelProvider(projectPath)) {
        return;
    }
    const proceed = "Deploy Anyway";
    required(await vscode.window.showWarningMessage(
        "This agent uses the default WSO2 model provider.",
        {
            modal: true,
            detail: "It signs in with a short-lived token from your WSO2 account, and that token expires, so the hosted agent "
                + "stops answering. Its configuration also can't be set as an environment variable in Agent Manager. "
                + "For a hosted agent, use a model provider with its own API key.",
        },
        proceed
    ));
    await extension.context.workspaceState.update(DEFAULT_PROVIDER_WARNED, [...warned, projectPath]);
}

async function warnIfMissingDependenciesToml(projectPath: string): Promise<void> {
    if (fs.existsSync(path.join(projectPath, "Dependencies.toml"))) {
        return;
    }
    const proceed = "Continue";
    required(await vscode.window.showWarningMessage(
        "Dependencies.toml is missing. The first Agent Manager build of a package without it can fail. Build locally once and commit it.",
        { modal: true },
        proceed
    ));
}

