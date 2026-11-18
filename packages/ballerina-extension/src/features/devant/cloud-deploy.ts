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

import * as vscode from "vscode";
import {
    CloudDeployAction, CloudDeployActionRequest, CloudDeployForm, CloudDeployReadiness, CloudDeployRequest, CloudDeployResponse, CloudDeploySource,
    CloudDeploySourceAction, CloudDeploySourceCheck, CloudDeployStatus, DIRECTORY_MAP, findDevantScope, hasWorkflowArtifacts, isSamePath, ProjectStructure,
} from "@wso2/ballerina-core";
import {
    AUTOMATION_WITH_LISTENER_WARNING, DevantScopes, getIntegrationScopeText, resolveIntegrationType, WICommandIds,
} from "@wso2/wso2-platform-core";
import { buildConsoleUrl, integrationTypeOf, type Component, type Environment, type IWso2PlatformExtensionAPI } from "@wso2/wso2-cloud-client";
import { connectPlatformAPI } from "../../utils/cloud-auth";
import { configs, reconcileAgentConfigs, usedConfigs } from "../agent-manager/bindings";
import { agentManagerCloudConsoleUrl, onCloudAgentManager } from "../agent-manager/auth";
import { api as agentManagerApi, consoleOrgUrl, envVariables } from "../agent-manager/client";
import { changesOutside, isExposed, LOCAL_ONLY_FILES, preparationState, pushBlocker, readFacts } from "../agent-manager/github";
import { commitAndPush, hasAmpImport, readPreparation } from "../agent-manager/flows";
import { ensureMcpEndpoint } from "../agent-manager/mcp-publish";
import { BiDiagramRpcManager } from "../../rpc-managers/bi-diagram/rpc-manager";
import { StateMachine } from "../../stateMachine";

type CloudApi = IWso2PlatformExtensionAPI;

// WSO2 Integrator runs every step of a WSO2 Cloud deploy; these are the commands its deploy form's steps are exposed as.
const WI_DEPLOY_COMMANDS = {
    GetDeployContext: "wso2.integrator.cloud.integration.getDeployContext",
    InspectSource: "wso2.integrator.cloud.integration.inspectSource",
    Deploy: "wso2.integrator.cloud.integration.deploy",
    DeployBuild: "wso2.integrator.cloud.integration.deployBuild",
    ConnectGitHub: "wso2.integrator.cloud.integration.connectGitHub",
    InstallGitHubApp: "wso2.integrator.cloud.integration.installGitHubApp",
};

interface WIDeployContext {
    signedIn: boolean;
    linkedProject?: { id: string; name: string };
    suggestedProjectName?: string;
    projects: { id: string; name: string }[];
    integrations: { fsPath: string; name: string; supportedIntegrationTypes: string[] }[];
}

type WIDeployResult =
    | { outcome: "submitted"; created: { id: string; name: string; displayName?: string; componentType?: Component["componentType"] }[]; failed: { name: string; error: string }[]; project?: { id: string; name: string } }
    | { outcome: "linkedExisting"; project?: { id: string; name: string } }
    | { outcome: "cancelled" }
    | { outcome: "failed"; message: string };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const workspaceDirOf = (projectPath: string) => StateMachine.context()?.workspacePath || projectPath;

async function signedInApi(): Promise<CloudApi | undefined> {
    const api = await connectPlatformAPI({ silent: true });
    return api?.isLoggedIn() ? api : undefined;
}

async function readSource(projectPath: string, outside = false): Promise<CloudDeploySource> {
    const facts = await readFacts(projectPath);
    return {
        repository: facts.repository,
        branch: facts.upstreamBranch ?? facts.branch,
        commit: facts.remoteCommit?.slice(0, 7),
        changedFiles: facts.dirty,
        otherChanges: outside ? await changesOutside(projectPath, facts) : undefined,
        changedConfigs: facts.changedConfigs,
        keptOut: await exposedLocalFiles(projectPath, !!facts.root),
        unpushedCommits: facts.ahead,
        blocker: pushBlocker(facts),
        missingOnRemote: facts.missingOnRemote,
    };
}

async function exposedLocalFiles(projectPath: string, inRepo: boolean): Promise<string[]> {
    const exposed = await Promise.all(LOCAL_ONLY_FILES.map((file) => isExposed(projectPath, file, inRepo)));
    return LOCAL_ONLY_FILES.filter((_, index) => exposed[index]);
}

// WSO2 Integrator matches a new integration to its folder only after its next context refresh, so a create made here is remembered until then.
const createdHere = new Map<string, {
    integration: { id: string; name: string; displayName: string; componentType?: Component["componentType"] };
    repository?: { branch?: string };
    project: string;
    org?: string;
    at: number;
}>();
/** How long a new integration may show as queued before its first build appears. */
const QUEUED_MS = 10 * 60 * 1000;

function linkedIntegration(api: CloudApi, projectPath: string) {
    const linked = api.getDirectoryIntegrations(projectPath).find((item) => isSamePath(item.fsPath, projectPath));
    const project = api.getSelectedContext()?.projectName;
    const created = createdHere.get(projectPath);
    // An integration created under another organization isn't this one's.
    if ((linked && project) || (created && created.org !== orgOf(api))) {
        createdHere.delete(projectPath);
    }
    return linked && project ? { ...linked, project } : createdHere.get(projectPath);
}

const orgOf = (api: CloudApi) => api.getAuthState().session?.org.handle;

// The create attaches an AI agent's LLM providers and MCP servers; a later push attaches the ones added since, as a self-hosted redeploy does.
export async function syncCloudAgentConfigs(projectPath: string): Promise<void> {
    try {
        const cloud = await signedInApi();
        const linked = cloud && linkedIntegration(cloud, projectPath);
        if (!linked || integrationTypeOf(linked.integration) !== "ai-agent") {
            return;
        }
        const synced = await onCloudAgentManager(async (session) => {
            const environment = await agentManagerApi.firstEnvironment(linked.project);
            // The manifest as saved: usedConfigs prunes entries the language server has not indexed yet, such as the one just added.
            await reconcileAgentConfigs(projectPath, {
                instanceUrl: session.instanceUrl, org: session.org, project: linked.project, agent: linked.integration.id, mode: "internal", environment,
            }, configs(projectPath));
            return true;
        });
        if (!synced) {
            vscode.window.showWarningMessage("Couldn't attach the change to the agent on Choreo Cloud: Agent Manager on Choreo Cloud isn't reachable with this sign-in.");
        }
    } catch (error) {
        vscode.window.showWarningMessage(`Couldn't attach the change to the agent on Choreo Cloud: ${errorText(error)}`);
    }
}

// Only an agent gets the Prepare step: its API definition, Git ignore rules and tracing import.
async function agentPreparation(projectPath: string): Promise<CloudDeployStatus["preparation"]> {
    return hasAgents(await projectOf(projectPath)) ? preparationState(projectPath, await readPreparation(projectPath)) : undefined;
}

export async function getCloudDeployStatus(projectPath: string, preparation = false): Promise<CloudDeployStatus> {
    const api = await signedInApi();
    if (!api) {
        createdHere.clear();
        return { signedIn: false };
    }
    const [source, prep] = await Promise.all([readSource(projectPath, preparation), preparation ? agentPreparation(projectPath) : undefined]);
    const session = api.getAuthState().session;
    const status: CloudDeployStatus = { signedIn: true, account: session?.user.displayName || session?.org.name, source, preparation: prep };
    const linked = linkedIntegration(api, projectPath);
    if (!linked) {
        return status;
    }
    const { integration, repository, project } = linked;
    status.integration = {
        name: integration.id, displayName: integration.displayName || integration.name, project, branch: repository?.branch, agent: integrationTypeOf(integration) === "ai-agent",
    };
    const created = createdHere.get(projectPath);
    status.pending = !!created && Date.now() - created.at < QUEUED_MS;
    try {
        return { ...status, ...await platformState(api, integration.id, project) };
    } catch (error) {
        return { ...status, error: errorText(error) };
    }
}

async function platformState(api: CloudApi, id: string, project: string): Promise<Pick<CloudDeployStatus, "build" | "deployment">> {
    const [builds, deployments] = await Promise.all([api.builds.list(id, project), api.deployments.listAll(id, project)]);
    const build = builds[0];
    const current = deployments.find((item) => item.deployment);
    const deployment = current?.deployment;
    return {
        build: build && { name: build.name ?? "", status: build.status ?? "Pending", commit: build.commit?.slice(0, 7) },
        deployment: current && deployment && {
            environment: current.environment.name,
            status: deployment.deploymentStatusV2 ?? "IN_PROGRESS",
            endpointUrl: deployment.invokeUrl ?? await externalEndpointUrl(api, id, current.environment.id, project),
            deployedAt: deployment.build?.deployedAt,
            commit: deployment.build?.commit?.sha?.slice(0, 7),
        },
    };
}

// An AI agent's deployment carries no invoke URL; its endpoint's public URL is the one to call.
async function externalEndpointUrl(api: CloudApi, id: string, environment: string, project: string): Promise<string | undefined> {
    const endpoints = await api.endpoints.listForEnvironment(id, environment, project).catch(() => []);
    const url = endpoints.find((endpoint) => endpoint.urls?.external?.host)?.urls?.external;
    return url && `${url.scheme ?? "https"}://${url.host}${url.port ? `:${url.port}` : ""}${url.path ?? ""}`;
}

async function projectOf(projectPath: string) {
    const structure = await new BiDiagramRpcManager().getProjectStructure();
    return structure?.projects.find((item) => isSamePath(item.projectPath, projectPath));
}

export function scopesOf(project: ProjectStructure): DevantScopes[] {
    const scopes = (project.directoryMap[DIRECTORY_MAP.SERVICE] ?? [])
        .map((service) => findDevantScope(service?.triggerKind ?? service?.kind, service?.moduleName))
        .filter((scope): scope is DevantScopes => scope !== undefined);
    if (hasWorkflowArtifacts(project)) {
        scopes.push(DevantScopes.WORKFLOW);
    }
    if (project.directoryMap[DIRECTORY_MAP.AUTOMATION]?.length > 0) {
        scopes.push(DevantScopes.AUTOMATION);
    }
    return [...new Set(scopes)];
}

async function firstEnvironment(api: CloudApi, project?: string): Promise<Environment | undefined> {
    const entry = project ? (await api.pipelines.ofProject(project).catch(() => undefined))?.entry : undefined;
    return entry ? api.environments.resolve(entry) : (await api.environments.list()).find((environment) => !environment.critical);
}

function integrationTypes(scopes: string[]): Pick<CloudDeployForm, "integrationTypes" | "integrationType" | "typeWarning"> {
    const resolution = resolveIntegrationType(scopes);
    const choices = resolution.kind === "ask" ? resolution.choices : [resolution.scope];
    return {
        integrationTypes: choices.map((value) => ({ value, label: getIntegrationScopeText(value) })),
        integrationType: choices[0],
        typeWarning: resolution.kind === "autoPickWithWarning" ? AUTOMATION_WITH_LISTENER_WARNING : undefined,
    };
}

const hasAgents = (project?: ProjectStructure) => (project?.directoryMap[DIRECTORY_MAP.AGENT]?.length ?? 0) > 0;

function deployScopes(project: ProjectStructure | undefined): DevantScopes[] {
    if (hasAgents(project)) {
        return [DevantScopes.AI_AGENT];
    }
    return project ? scopesOf(project) : [];
}

// Agent Builder deploys agents as AI agents, which WSO2 Cloud creates in Agent Manager, whatever service fronts them.
export async function getCloudDeployForm(projectPath: string): Promise<CloudDeployForm> {
    const project = await projectOf(projectPath);
    const name = project?.projectTitle || project?.projectName || "";
    const empty: CloudDeployForm = { name, projects: [], environment: "", integrationTypes: [] };
    const scopes = deployScopes(project);
    if (scopes.length === 0) {
        return { ...empty, error: "Add an artifact, such as a service or an automation, to deploy this integration." };
    }
    try {
        const context = await vscode.commands.executeCommand<WIDeployContext>(WI_DEPLOY_COMMANDS.GetDeployContext, {
            workspaceDir: workspaceDirOf(projectPath),
            integrations: [{ fsPath: projectPath, name, supportedIntegrationTypes: scopes }],
        });
        if (!context?.signedIn) {
            return { ...empty, error: "Sign in to Choreo Cloud to deploy." };
        }
        const api = await signedInApi();
        const environment = api && await firstEnvironment(api, context.linkedProject?.id);
        return {
            name: context.integrations[0]?.name ?? name,
            projects: context.projects.map((item) => ({ name: item.id, displayName: item.name })),
            linkedProject: context.linkedProject?.id,
            suggestedProject: context.suggestedProjectName,
            environment: environment?.name ?? "",
            ...integrationTypes(scopes),
            ...await attachedNames(projectPath, scopes),
        };
    } catch (error) {
        return { ...empty, error: errorText(error) };
    }
}

export async function inspectCloudDeploySource(projectPath: string, gitRemote?: string, branch?: string): Promise<CloudDeploySourceCheck> {
    try {
        const check = await vscode.commands.executeCommand<CloudDeploySourceCheck>(WI_DEPLOY_COMMANDS.InspectSource, {
            workspaceDir: workspaceDirOf(projectPath), gitRemote, branch,
        });
        // WSO2 Integrator asks for uncommitted metadata files to be pushed but offers no action for it.
        const uncommitted = check.readiness.refresh === "configDrift" || check.readiness.refresh === "dirtyRepo";
        return uncommitted && !check.readiness.action ? { ...check, readiness: { ...check.readiness, action: "sourceControl" } } : check;
    } catch (error) {
        const readiness: CloudDeployReadiness = { message: errorText(error), tone: "error", blocking: true };
        return { remotes: [], gitRemote: null, branches: [], branch: null, readiness };
    }
}

async function attachedNames(projectPath: string, scopes: DevantScopes[]): Promise<Pick<CloudDeployForm, "llmProviders" | "mcpServers">> {
    if (!scopes.includes(DevantScopes.AI_AGENT)) {
        return {};
    }
    const { modelConfig, mcpConfig } = await usedConfigs(projectPath, false);
    return { llmProviders: modelConfig.map((config) => config.handle), mcpServers: mcpConfig.map((config) => config.handle) };
}

// Agent Manager attaches these at create, and traces the agent when the source imports ballerinax/amp.
async function agentConfigs(projectPath: string) {
    const { modelConfig, mcpConfig } = await usedConfigs(projectPath);
    return {
        modelConfig: modelConfig.map((config) => ({ providerName: config.handle, environmentVariables: envVariables(config.env) })),
        mcpConfig: mcpConfig.map((config) => ({ proxyName: config.handle, environmentVariables: envVariables(config.env) })),
        autoInstrumentation: hasAmpImport(projectPath),
    };
}

export async function startCloudDeploy(request: CloudDeployRequest): Promise<CloudDeployResponse> {
    try {
        const configs = request.integrationType === DevantScopes.AI_AGENT ? await agentConfigs(request.projectPath) : {};
        const result = await vscode.commands.executeCommand<WIDeployResult>(WI_DEPLOY_COMMANDS.Deploy, {
            workspaceDir: workspaceDirOf(request.projectPath),
            buildPackLang: "ballerina",
            integration: { fsPath: request.projectPath, displayName: request.name, integrationType: request.integrationType, ...configs },
            project: request.newProject ? { newName: request.newProject } : { id: request.project },
            gitRemote: request.gitRemote,
            branch: request.branch,
            // The Deploy panel and wizard show the build and deploy progress.
            quiet: true,
        });
        return await deployResponse(request, result);
    } catch (error) {
        return { success: false, message: errorText(error) };
    }
}

async function deployResponse(request: CloudDeployRequest, result: WIDeployResult | undefined): Promise<CloudDeployResponse> {
    if (result?.outcome === "linkedExisting") {
        return { success: true };
    }
    if (result?.outcome !== "submitted") {
        return { success: false, message: result?.outcome === "failed" ? result.message : undefined };
    }
    const created = result.created[0];
    if (!created) {
        return { success: false, message: result.failed.map((item) => item.error).join(" ") || "The integration was not created." };
    }
    const project = result.project?.id ?? request.project ?? (await signedInApi())?.getSelectedContext()?.projectName ?? "";
    const displayName = created.displayName || request.name;
    const api = await signedInApi();
    const org = api && orgOf(api);
    createdHere.set(request.projectPath, {
        integration: { id: created.id, name: created.name, displayName, componentType: created.componentType }, repository: { branch: request.branch }, project, org, at: Date.now(),
    });
    return { success: true };
}

async function openOrgConsole(link: { section?: string; project?: string } = {}): Promise<void> {
    const api = await signedInApi();
    if (api) {
        const url = buildConsoleUrl(api.getPlatformConfig().consoleUrl, { orgHandle: api.getAuthState().session?.org.handle, ...link });
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }
}

type Action = (projectPath: string, request?: CloudDeployActionRequest) => Thenable<unknown>;

const SOURCE_ACTIONS: Record<CloudDeploySourceAction, Action> = {
    sourceControl: () => vscode.commands.executeCommand("workbench.scm.focus"),
    pushChanges: () => vscode.commands.executeCommand("git.push"),
    grantAccess: (projectPath, request) =>
        vscode.commands.executeCommand(WI_DEPLOY_COMMANDS.InstallGitHubApp, { workspaceDir: projectPath, gitRemote: request?.gitRemote }),
    authorize: (projectPath, request) => vscode.commands.executeCommand(WI_DEPLOY_COMMANDS.ConnectGitHub, { workspaceDir: projectPath, gitRemote: request?.gitRemote }),
    manageCredentials: () => openOrgConsole({ section: "settings/credentials" }),
};

async function deployLatestBuild(projectPath: string): Promise<void> {
    const api = await signedInApi();
    const linked = api && linkedIntegration(api, projectPath);
    if (!linked) {
        throw new Error("This project has no integration on Choreo Cloud.");
    }
    const result = await vscode.commands.executeCommand<CloudDeployResponse>(WI_DEPLOY_COMMANDS.DeployBuild, {
        integrationId: linked.integration.id, projectId: linked.project, quiet: true,
    });
    if (!result?.success) {
        throw new Error(result?.message ?? "Couldn't deploy the build.");
    }
}

// The console selects a build by the number ending its run name, `<integration>-<epoch ms>`.
function integrationBuildUrl(api: CloudApi, project: string, integration: string, buildName: string): string {
    const page = buildConsoleUrl(api.getPlatformConfig().consoleUrl, { orgHandle: api.getAuthState().session?.org.handle, project, integration, page: "build" });
    const buildId = /-(\d+)$/.exec(buildName)?.[1];
    return buildId ? `${page}?${new URLSearchParams({ buildId })}` : page;
}

// WSO2 Cloud manages an AI agent in Agent Manager, so its console page is the agent's there.
async function agentConsoleUrl(projectPath: string): Promise<string | undefined> {
    const api = await signedInApi();
    const linked = api && linkedIntegration(api, projectPath);
    const orgHandle = api?.getAuthState().session?.org.handle;
    if (!linked || !orgHandle || (linked.integration as Partial<Component>).componentType !== "aiAgent") {
        return undefined;
    }
    const project = encodeURIComponent(linked.project);
    return `${consoleOrgUrl(agentManagerCloudConsoleUrl(), orgHandle)}/project/${project}/agents/${encodeURIComponent(linked.integration.id)}`;
}

// The Try It page of the environment the agent deploys to, the pipeline's first, as a self-hosted agent's Try It opens it.
async function openTryIt(projectPath: string): Promise<unknown> {
    const api = await signedInApi();
    const project = api && linkedIntegration(api, projectPath)?.project;
    const agentUrl = await agentConsoleUrl(projectPath);
    const environment = project && agentUrl ? await onCloudAgentManager(() => agentManagerApi.firstEnvironment(project)) : undefined;
    if (!agentUrl || !environment) {
        return ACTIONS.openInConsole(projectPath);
    }
    return vscode.env.openExternal(vscode.Uri.parse(`${agentUrl}/environment/${encodeURIComponent(environment)}/tryOut`));
}

// The Deploy panel's one-click commit, which asks for the message, opening with the one the panel suggests.
async function askCommitAndPush(projectPath: string, suggested?: string): Promise<void> {
    // Unpushed commits are pushed as they are, so only uncommitted changes need a message.
    const message = (await readFacts(projectPath)).dirty === 0 ? "" : await vscode.window.showInputBox({
        title: "Commit and Push", prompt: "Commit Message", value: suggested, ignoreFocusOut: true,
        validateInput: (text) => (text.trim() ? undefined : "Enter a commit message."),
    });
    if (message !== undefined) {
        await commitAndPush(projectPath, undefined, message);
        await syncCloudAgentConfigs(projectPath);
    }
}

const ACTIONS: Record<CloudDeployAction, Action> = {
    ...SOURCE_ACTIONS,
    signIn: () => vscode.commands.executeCommand(WICommandIds.SignIn),
    signOut: () => vscode.commands.executeCommand(WICommandIds.SignOut),
    openInConsole: async (projectPath) => {
        const agentUrl = await agentConsoleUrl(projectPath);
        return agentUrl
            ? vscode.env.openExternal(vscode.Uri.parse(agentUrl))
            : vscode.commands.executeCommand(WICommandIds.OpenInConsole, { componentFsPath: projectPath });
    },
    openBuildLogs: async (projectPath) => {
        const api = await signedInApi();
        const linked = api && linkedIntegration(api, projectPath);
        const build = api && linked ? (await api.builds.list(linked.integration.id, linked.project))[0] : undefined;
        if (!api || !linked || !build?.name) {
            return ACTIONS.openInConsole(projectPath);
        }
        const agentUrl = await agentConsoleUrl(projectPath);
        const url = agentUrl
            ? `${agentUrl}/build?${new URLSearchParams({ selectedBuild: build.name, panel: "logs" })}`
            : integrationBuildUrl(api, linked.project, linked.integration.id, build.name);
        return vscode.env.openExternal(vscode.Uri.parse(url));
    },
    // The panel opens links without waiting for a result, so a failure is shown here.
    openTryIt: (projectPath) => openTryIt(projectPath).catch((error) => vscode.window.showWarningMessage(`Couldn't open Try It: ${errorText(error)}`)),
    openProjectInConsole: async (projectPath) => {
        const api = await signedInApi();
        await openOrgConsole({ project: api && (linkedIntegration(api, projectPath)?.project ?? api.getSelectedContext()?.projectName) });
    },
    deployBuild: deployLatestBuild,
    // An agent's endpoint is its agent service, whatever MCP service the package also has.
    prepareMcpEndpoint: async (projectPath) => {
        if (!hasAgents(await projectOf(projectPath))) {
            ensureMcpEndpoint(projectPath);
        }
    },
    refresh: () => vscode.commands.executeCommand(WICommandIds.RefreshDirectoryContext),
    syncAgentConfigs: syncCloudAgentConfigs,
    commitAndPush: (projectPath, request) => askCommitAndPush(projectPath, request?.message),
};

export async function runCloudDeployAction(request: CloudDeployActionRequest): Promise<CloudDeployResponse> {
    try {
        await ACTIONS[request.action](request.projectPath, request);
        return { success: true };
    } catch (error) {
        return { success: false, message: errorText(error) };
    }
}
