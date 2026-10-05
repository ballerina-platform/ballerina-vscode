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
    AgentManagerSource,
    AgentManagerStatus,
    OpenAPISpec,
} from "@wso2/ballerina-core";
import { getSession, signIn, signOut } from "./auth";
import { offerCopilotMcp } from "./copilot";
import { buildConfigFields, CONFIG_FILE, readPackage, splitConfig, SplitConfig } from "./configurables";
import {
    ensureGitIgnored, inspectSource, isExposed, isIgnored, LOCAL_ONLY_FILES, openCommitView, Preparation, readFacts, renameRemote,
    SourceStepId, suggestCommitMessage, untrack,
} from "./github";
import {
    AgentManagerApiError,
    api,
    consoleUrl,
    getRuntimeLogs,
    readLink,
    removeLink,
    writeLink,
    writeProjectFile,
} from "./client";
import { extension } from "../../BalExtensionContext";
import { StateMachine } from "../../stateMachine";
import { TracerMachine } from "../tracing/tracer-machine";
import { getActiveTracingProvider, updateOrAddSection } from "../tracing/utils";

const EXTERNAL_TOKEN_EXPIRY = "720h";
const OPENAPI_FILE = "openapi.yaml";
const DEV_TRACE_FILE = "trace_enabled.bal";
const AMP_IMPORT_FILE = "agent_manager.bal";

let logChannel: vscode.OutputChannel | undefined;

function outputChannel(): vscode.OutputChannel {
    logChannel ??= vscode.window.createOutputChannel("Agent Manager");
    return logChannel;
}

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
            await api.listProjects();
            return { ...status, source: await sourceStatus(projectPath) };
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
    const deployed = deployedCommit(deployment?.imageId) ?? build?.commitId;
    const newCommit = source.remoteCommit && !(deployed && source.remoteCommit.startsWith(deployed)) ? source.remoteCommit : undefined;
    return {
        displayName: agent.displayName,
        ampTracing: hasAmpImport(projectPath),
        branch: agent.provisioning?.repository?.branch,
        source,
        newCommit,
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

interface ActionOptions {
    ampTracing?: boolean;
}

const ACTIONS: Record<AgentManagerAction, (projectPath: string, config?: AgentManagerConfigInput, options?: ActionOptions) => Promise<string | void>> = {
    signIn: async () => {
        const session = await signIn();
        if (session) {
            void offerCopilotMcp();
        }
        return session && `Signed in to Agent Manager (${session.org}).`;
    },
    signOut: async () => signOut(),
    chooseDeployTarget: async (projectPath) => {
        deployTargets.set(projectPath, await chooseDeployTarget(projectPath));
    },
    hostOnPlatform,
    enableAmpTracing,
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
    openTraces: async (projectPath) => {
        const link = await requireLink(projectPath);
        await vscode.env.openExternal(vscode.Uri.parse(`${consoleUrl(link)}/environment/${link.environment}/observability/traces`));
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

export async function runAction(
    projectPath: string,
    action: AgentManagerAction,
    config?: AgentManagerConfigInput,
    options?: ActionOptions
): Promise<AgentManagerActionResponse> {
    try {
        const message = await ACTIONS[action](projectPath, config, options);
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
        // Agent Manager deploys to the pipeline's first environment, which self-hosted AMP names 'default'.
        environment: "default",
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
    await writeLink(projectPath, link);
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

async function ensureDevTracingOff(projectPath: string): Promise<void> {
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

type DeployTarget = Awaited<ReturnType<typeof newLink>> & { git: GitHubSource; iface?: HttpInterface; secretRef?: string };

// Every prompt runs here, before the config popup opens, so nothing pops up behind it.
const deployTargets = new Map<string, DeployTarget>();

async function chooseDeployTarget(projectPath: string): Promise<DeployTarget> {
    const git = await requireGitHubSource(projectPath);
    await ensureDevTracingOff(projectPath);
    await warnIfDefaultModelProvider(projectPath);
    const target = { ...(await newLink(projectPath, "internal")), git };
    if (!target.existing) {
        return { ...target, iface: await prepareHttpInterface(projectPath), secretRef: await ensureRepoAccess(git) };
    }
    const agent = await api.getAgent(target.link);
    return { ...target, secretRef: agent.provisioning?.repository?.secretRef ? undefined : await ensureRepoAccess(git) };
}

async function hostOnPlatform(projectPath: string, config?: AgentManagerConfigInput): Promise<string> {
    const target = deployTargets.get(projectPath) ?? await chooseDeployTarget(projectPath);
    deployTargets.delete(projectPath);
    const { link, displayName, existing, git, iface, secretRef } = target;
    if (!existing) {
        const split = resolveConfig((await loadConfigFields(projectPath)).fields, config);
        await api.createInternalAgent(link.project, {
            name: link.agent,
            displayName,
            repoUrl: git.repoUrl,
            branch: git.branch,
            appPath: git.appPath,
            port: iface!.port,
            basePath: iface!.basePath,
            schemaPath: iface!.schemaPath,
            secretRef,
            autoInstrumentation: hasAmpImport(projectPath),
            env: split.env,
            file: split.file && { ...CONFIG_FILE, ...split.file },
        });
    } else {
        if (secretRef) {
            await api.updateRepository(link, await api.getAgent(link), { secretRef });
        }
        if (config) {
            await saveConfigFor(projectPath, link, config);
        }
    }
    await writeLink(projectPath, link);
    return `'${link.agent}' created in Agent Manager. Building from ${git.branch}@${git.commit.slice(0, 7)}.`;
}

async function pushAndRebuild(projectPath: string): Promise<string> {
    const link = await requireLink(projectPath);
    const git = await requireGitHubSource(projectPath);
    await ensureDevTracingOff(projectPath);
    await warnIfDefaultModelProvider(projectPath);
    await switchBranchIfNeeded(link, git.branch);
    await api.triggerBuild(link, git.commit);
    return `Build started for ${git.branch}@${git.commit.slice(0, 7)}.`;
}

async function switchBranchIfNeeded(link: AgentManagerLink, branch: string): Promise<void> {
    const agent = await api.getAgent(link);
    const agentBranch = agent.provisioning?.repository?.branch;
    if (!agentBranch || agentBranch === branch) {
        return;
    }
    const switchAction = `Build from ${branch}`;
    required(await vscode.window.showWarningMessage(
        `Build from '${branch}' instead of '${agentBranch}'?`,
        { modal: true, detail: `'${link.agent}' builds from '${agentBranch}'. Switching makes future builds use '${branch}'.` },
        switchAction
    ));
    await api.updateRepository(link, agent, { branch });
}

export async function getConfigForm(projectPath: string): Promise<AgentManagerConfigForm> {
    try {
        const linked = await readLink(projectPath);
        const target = linked ? undefined : deployTargets.get(projectPath);
        const link = linked ?? (target?.existing ? target.link : undefined);
        const summary = target && { agentName: target.displayName, project: target.link.project, repository: target.git.repository, branch: target.git.branch, existing: target.existing, tracing: hasAmpImport(projectPath) };
        return { ...(await loadConfigFields(projectPath, link)), target: summary };
    } catch (error) {
        return { fields: [], fileSaved: false, error: await describeActionError(error) };
    }
}

async function loadConfigFields(projectPath: string, link?: AgentManagerLink): Promise<AgentManagerConfigForm> {
    const state = link?.mode === "internal" ? await api.getConfigState(link, CONFIG_FILE.mountPath) : { envKeys: [], fileSaved: false };
    return { fields: await buildConfigFields(projectPath, state.envKeys, state.fileSaved), fileSaved: state.fileSaved };
}

function resolveConfig(fields: AgentManagerConfigField[], config?: AgentManagerConfigInput): SplitConfig {
    const split = splitConfig(fields, config ?? { values: {}, secrets: {} });
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

async function readPreparation(projectPath: string): Promise<Preparation> {
    const inRepo = !!readFacts(projectPath).root;
    return {
        ampImport: !hasAmpImport(projectPath),
        openApiSpec: !fs.existsSync(path.join(projectPath, OPENAPI_FILE)),
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

const SOURCE_FIXES: Record<SourceStepId, (projectPath: string, options?: ActionOptions) => Promise<string | void>> = {
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
    pull: runCommand("git.pull"),
    syncGitHub: (projectPath) => (readFacts(projectPath).dirty > 0 ? reviewAndCommit(projectPath) : runCommand("git.push")()),
    refreshSpec: async (projectPath) => {
        writeOpenApiSpec(projectPath, (await detectInterface(projectPath)).spec);
        return "Updated openapi.yaml. Commit and push it so Try It shows the current API.";
    },
    moved: async (projectPath) => {
        await renameRemote(projectPath, readFacts(projectPath));
        return "Updated the remote to the repository's new name.";
    },
};

async function fixSource(projectPath: string, _config?: AgentManagerConfigInput, options?: ActionOptions): Promise<string | void> {
    const { step } = await inspectSource(projectPath, await readPreparation(projectPath));
    return step && SOURCE_FIXES[step.id as SourceStepId](projectPath, options);
}

async function enableAmpTracing(projectPath: string): Promise<string | void> {
    const added = ensureAmpInstrumentation(projectPath);
    const link = await readLink(projectPath);
    if (link?.mode === "internal" && !(await api.getAutoInstrumentation(link))) {
        await api.updateConfigurations(link, [], undefined, true);
    }
    return added ? "Auto-instrumentation is on. Commit and push the change, then rebuild to collect traces." : undefined;
}

const STANDARD_GITIGNORE = ["target/", "generated/", ...LOCAL_ONLY_FILES];

async function prepareProject(projectPath: string, options?: ActionOptions): Promise<string> {
    const prep = await readPreparation(projectPath);
    const added: string[] = [];
    if (prep.ampImport && options?.ampTracing !== false && ensureAmpInstrumentation(projectPath)) {
        added.push(AMP_IMPORT_FILE);
    }
    if (prep.openApiSpec) {
        writeOpenApiSpec(projectPath, (await detectInterface(projectPath)).spec);
        added.push(OPENAPI_FILE);
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
    return `Added ${added.join(", ")} for Agent Manager. Commit them with the rest of your code.`;
}

async function ensureRepoAccess(git: GitHubSource): Promise<string | undefined> {
    return await isPrivateRepo(git) ? chooseGitSecret(git.repository) : undefined;
}

async function setRepoAccess(projectPath: string): Promise<string> {
    const link = await requireLink(projectPath);
    const git = await requireGitHubSource(projectPath);
    const secretRef = await chooseGitSecret(git.repository);
    await api.updateRepository(link, await api.getAgent(link), { secretRef });
    return `'${link.agent}' now clones ${git.repository} with the token ${secretRef}.`;
}

async function isPrivateRepo(git: GitHubSource): Promise<boolean> {
    if (git.isPrivate !== undefined) {
        return git.isPrivate;
    }
    const isPrivate = "Private";
    const choice = required(await vscode.window.showWarningMessage(
        `Couldn't check whether ${git.repository} is private.`,
        { modal: true, detail: "Agent Manager needs a read-only token to clone a private repository." },
        isPrivate,
        "Public"
    ));
    return choice === isPrivate;
}

async function chooseGitSecret(repository: string): Promise<string> {
    const name = toResourceName(`${repository.replace("/", "-")}-git`);
    const exists = await api.hasGitSecret(name);
    const reuse = "Use Existing Token";
    if (exists && required(await vscode.window.showInformationMessage(
        `Agent Manager already has a token for ${repository}.`, { modal: true }, reuse, "Replace Token")) === reuse) {
        return name;
    }
    const { username, token } = await askGitCredentials(repository);
    if (exists) {
        await api.deleteGitSecret(name);
    }
    await api.createGitSecret(name, username, token);
    return name;
}

async function askGitCredentials(repository: string): Promise<{ username: string; token: string }> {
    const username = required(await vscode.window.showInputBox({
        title: "Private repository: GitHub username",
        prompt: `Agent Manager needs a read-only token to clone ${repository}.`,
        ignoreFocusOut: true,
    }));
    const token = required(await vscode.window.showInputBox({
        title: "Private repository: GitHub personal access token",
        prompt: "Fine-grained token with read access to Contents on this repository only.",
        password: true,
        ignoreFocusOut: true,
    }));
    return { username, token };
}

// ---- Deriving the agent from the package -------------------------------------------------------

function readPackageTitle(projectPath: string): string {
    const { title, name } = readPackage(projectPath);
    return title ?? (name || path.basename(projectPath));
}

function hasAmpImport(projectPath: string): boolean {
    return /import\s+ballerinax\/amp\b/.test(readBalSources(projectPath));
}

function toResourceName(value: string): string {
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

async function prepareHttpInterface(projectPath: string): Promise<HttpInterface> {
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
async function warnIfDefaultModelProvider(projectPath: string): Promise<void> {
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

