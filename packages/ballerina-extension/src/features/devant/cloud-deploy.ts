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
    CloudDeployAction, CloudDeployForm, CloudDeployReadiness, CloudDeployRequest, CloudDeployResponse, CloudDeploySource, CloudDeploySourceAction,
    CloudDeploySourceCheck, CloudDeployStatus, DIRECTORY_MAP, findDevantScope, hasWorkflowArtifacts, isSamePath, ProjectStructure,
} from "@wso2/ballerina-core";
import {
    AUTOMATION_WITH_LISTENER_WARNING, DevantScopes, getIntegrationScopeText, resolveIntegrationType, WICommandIds,
} from "@wso2/wso2-platform-core";
import { buildConsoleUrl, type Environment, type IWso2PlatformExtensionAPI } from "@wso2/wso2-cloud-client";
import { connectPlatformAPI } from "../../utils/cloud-auth";
import { readFacts } from "../agent-manager/github";
import { readPreparation } from "../agent-manager/flows";
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
};

interface WIDeployContext {
    signedIn: boolean;
    linkedProject?: { id: string; name: string };
    projects: { id: string; name: string }[];
    integrations: { fsPath: string; name: string; supportedIntegrationTypes: string[] }[];
}

type WIDeployResult =
    | { outcome: "submitted"; created: { id: string; name: string; displayName?: string }[]; failed: { name: string; error: string }[] }
    | { outcome: "linkedExisting" }
    | { outcome: "cancelled" }
    | { outcome: "failed"; message: string };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const workspaceDirOf = (projectPath: string) => StateMachine.context()?.workspacePath || projectPath;

async function signedInApi(): Promise<CloudApi | undefined> {
    const api = await connectPlatformAPI({ silent: true });
    return api?.isLoggedIn() ? api : undefined;
}

async function readSource(projectPath: string): Promise<CloudDeploySource> {
    const facts = await readFacts(projectPath);
    return {
        repository: facts.repository,
        branch: facts.upstreamBranch ?? facts.branch,
        commit: facts.remoteCommit?.slice(0, 7),
        changedFiles: facts.dirty,
        unpushedCommits: facts.ahead,
    };
}

// WSO2 Integrator matches a new integration to its folder only after its next context refresh, so a create made here is remembered until then.
const createdHere = new Map<string, { integration: { id: string; name: string; displayName: string }; repository?: { branch?: string }; project: string }>();

function linkedIntegration(api: CloudApi, projectPath: string) {
    const linked = api.getDirectoryIntegrations(projectPath).find((item) => isSamePath(item.fsPath, projectPath));
    const project = api.getSelectedContext()?.projectName;
    return linked && project ? { ...linked, project } : createdHere.get(projectPath);
}

async function preparationOf(projectPath: string): Promise<CloudDeployStatus["preparation"]> {
    const prep = await readPreparation(projectPath);
    return { openApiSpec: prep.openApiSpec, gitignore: prep.gitignore || prep.exposedFiles.length > 0, ampImport: prep.ampImport };
}

export async function getCloudDeployStatus(projectPath: string, preparation = false): Promise<CloudDeployStatus> {
    const [source, prep] = await Promise.all([readSource(projectPath), preparation ? preparationOf(projectPath) : undefined]);
    const api = await signedInApi();
    if (!api) {
        return { signedIn: false, source, preparation: prep };
    }
    const session = api.getAuthState().session;
    const status: CloudDeployStatus = { signedIn: true, account: session?.user.displayName || session?.org.name, source, preparation: prep };
    const linked = linkedIntegration(api, projectPath);
    if (!linked) {
        return status;
    }
    const { integration, repository, project } = linked;
    status.integration = { name: integration.id, displayName: integration.displayName || integration.name, project, branch: repository?.branch };
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
            endpointUrl: deployment.invokeUrl,
            deployedAt: deployment.build?.deployedAt,
            commit: deployment.build?.commit?.sha?.slice(0, 7),
        },
    };
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

// Agent Builder deploys agents as AI agents, which WSO2 Cloud creates in Agent Manager, whatever service fronts them.
export async function getCloudDeployForm(projectPath: string, agent = false): Promise<CloudDeployForm> {
    const project = await projectOf(projectPath);
    const name = project?.projectTitle || project?.projectName || "";
    const empty: CloudDeployForm = { name, projects: [], environment: "", integrationTypes: [] };
    const scopes = agent ? [DevantScopes.AI_AGENT] : project ? scopesOf(project) : [];
    if (scopes.length === 0) {
        return { ...empty, error: "Add an artifact, such as a service or an automation, to deploy this integration." };
    }
    try {
        const context = await vscode.commands.executeCommand<WIDeployContext>(WI_DEPLOY_COMMANDS.GetDeployContext, {
            workspaceDir: workspaceDirOf(projectPath),
            integrations: [{ fsPath: projectPath, name, supportedIntegrationTypes: scopes }],
        });
        if (!context?.signedIn) {
            return { ...empty, error: "Sign in to WSO2 Cloud to deploy." };
        }
        const api = await signedInApi();
        const environment = api && await firstEnvironment(api, context.linkedProject?.id);
        return {
            name: context.integrations[0]?.name ?? name,
            projects: context.projects.map((item) => ({ name: item.id, displayName: item.name })),
            linkedProject: context.linkedProject?.id,
            environment: environment?.name ?? "",
            ...integrationTypes(scopes),
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

export async function startCloudDeploy(request: CloudDeployRequest): Promise<CloudDeployResponse> {
    try {
        const result = await vscode.commands.executeCommand<WIDeployResult>(WI_DEPLOY_COMMANDS.Deploy, {
            workspaceDir: workspaceDirOf(request.projectPath),
            buildPackLang: "ballerina",
            integration: { fsPath: request.projectPath, displayName: request.name, integrationType: request.integrationType },
            project: request.newProject ? { newName: request.newProject } : { id: request.project },
            gitRemote: request.gitRemote,
            branch: request.branch,
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
    const project = (await signedInApi())?.getSelectedContext()?.projectName ?? request.project ?? "";
    const displayName = created.displayName || request.name;
    createdHere.set(request.projectPath, { integration: { id: created.id, name: created.name, displayName }, repository: { branch: request.branch }, project });
    return { success: true };
}

// WSO2 Integrator's form opens the console for access issues too: the platform's GitHub App routes are not available yet.
async function openOrgConsole(section?: string): Promise<void> {
    const api = await signedInApi();
    if (api) {
        const url = buildConsoleUrl(api.getPlatformConfig().consoleUrl, { orgHandle: api.getAuthState().session?.org.handle, section });
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }
}

const SOURCE_ACTIONS: Record<CloudDeploySourceAction, () => Thenable<unknown>> = {
    sourceControl: () => vscode.commands.executeCommand("workbench.scm.focus"),
    pushChanges: () => vscode.commands.executeCommand("git.push"),
    grantAccess: () => openOrgConsole(),
    authorize: () => openOrgConsole(),
    manageCredentials: () => openOrgConsole("settings/credentials"),
};

async function deployLatestBuild(projectPath: string): Promise<void> {
    const api = await signedInApi();
    const linked = api && linkedIntegration(api, projectPath);
    if (!linked) {
        throw new Error("This project has no integration on WSO2 Cloud.");
    }
    const result = await vscode.commands.executeCommand<CloudDeployResponse>(WI_DEPLOY_COMMANDS.DeployBuild, {
        integrationId: linked.integration.id, projectId: linked.project,
    });
    if (!result?.success) {
        throw new Error(result?.message ?? "Couldn't deploy the build.");
    }
}

const ACTIONS: Record<CloudDeployAction, (projectPath: string) => Thenable<unknown>> = {
    ...SOURCE_ACTIONS,
    signIn: () => vscode.commands.executeCommand(WICommandIds.SignIn),
    signOut: () => vscode.commands.executeCommand(WICommandIds.SignOut),
    openInConsole: (projectPath) => vscode.commands.executeCommand(WICommandIds.OpenInConsole, { componentFsPath: projectPath }),
    deployBuild: deployLatestBuild,
    prepareMcpEndpoint: async (projectPath) => ensureMcpEndpoint(projectPath),
    refresh: () => vscode.commands.executeCommand(WICommandIds.RefreshDirectoryContext),
};

export async function runCloudDeployAction(projectPath: string, action: CloudDeployAction): Promise<CloudDeployResponse> {
    try {
        await ACTIONS[action](projectPath);
        return { success: true };
    } catch (error) {
        return { success: false, message: errorText(error) };
    }
}
